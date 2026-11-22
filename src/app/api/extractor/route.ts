import dns from "dns";
import { NextRequest, NextResponse } from "next/server";
import { cacheService, tokenCryptoService } from "@/infrastructure/container";
import { prisma } from "@/infrastructure/database/prismaClient";
import { getAuthenticatedUserSession } from "@/infrastructure/auth/sessionHelper";
import { prismaMembershipRepository } from "@/infrastructure/repositories/PrismaMembershipRepository";
import { isSafePublicHttpUrl } from "@/infrastructure/security/SecurityGuard";
import {
  apiRateLimiter,
  getClientIp,
} from "@/infrastructure/security/RateLimiter";
import {
  FALLBACK_IF_EMPTY,
  STRICT_STREAMWISH_ONLY,
  StreamwishExtractionTarget,
  buildStreamwishExtractionTargets,
  filterAndPrioritizeMirrors,
  isExtractableCleanHost,
  isMultiEmbedAggregatorUrl,
  isStreamwish,
  isStreamwishUrl,
  normalizeStreamwishEmbedUrl,
} from "@/domain/utils/streamwishMatcher";
import { unpackDeanEdwardsPackedScripts } from "@/infrastructure/providers/DeanEdwardsUnpacker";
import {
  DEFAULT_SCRAPER_USER_AGENT,
  resolveRankedEmbedsFromEmbed69Url,
} from "@/infrastructure/providers/Embed69Decoder";
import { resolveRankedEmbedsFromPlayLatinByUrl } from "@/infrastructure/providers/PlayLatinClient";
import {
  ExtractedStreamCandidate,
  extractStreamCandidatesFromHtmlAndScripts,
  resolveFirstNonNull,
  resolveInlineHlsManifestForInternalProxy,
  verifyExtractedStreamCandidateAlive,
} from "@/infrastructure/providers/StreamManifestExtractor";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Silencioso en entornos donde no aplique
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_CDN_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  "Netlify-CDN-Cache-Control": "no-store",
  "CDN-Cache-Control": "no-store",
};

function resolvePublicOrigin(request: NextRequest): string {
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.split(",")[0]?.trim();

  if (forwardedHost) {
    const protocol =
      forwardedProto ||
      request.nextUrl.protocol.replace(/:$/, "") ||
      "https";
    return `${protocol}://${forwardedHost}`.replace(/\/+$/, "");
  }

  return request.nextUrl.origin.replace(/\/+$/, "");
}

interface CandidateEmbedDescriptor {
  url: string;
  serverName: string;
  priority: number;
  isStreamwish: boolean;
  isDirty: boolean;
}

interface NativeStreamOption {
  streamUrl: string;
  type: "hls" | "mp4";
  referer: string;
  inlineM3u8?: string;
}

interface ProbeHitResult extends ExtractedStreamCandidate {
  referer: string;
  sourceEmbedUrl: string;
  isStreamwish: boolean;
  isDirty: boolean;
  inlineM3u8?: string;
  backupStreams?: NativeStreamOption[];
}

interface CachedExtractorSuccessPayload {
  success: true;
  streamUrl: string;
  type: "hls" | "mp4";
  referer: string;
  inlineM3u8?: string;
  backupStreams?: NativeStreamOption[];
  durationSeconds?: number;
  posterUrl?: string;
  isStreamwish: boolean;
  isDirty: boolean;
}

/**
 * Desempaqueta agregadores multi-embed (`embed69.org` y `playlatinsrc.co`) delegando en
 * `Embed69Decoder` y `PlayLatinClient`, y aplica `STRICT_STREAMWISH_ONLY` / `FALLBACK_IF_EMPTY`.
 *
 * @param rawAggregatorUrl URL del agregador multi-embed.
 * @returns Lista priorizada de descriptores de embeds directos.
 */
async function resolveMultiEmbedAggregatorToDirectEmbeds(
  rawAggregatorUrl: string
): Promise<CandidateEmbedDescriptor[]> {
  const collectedCandidates: {
    serverName: string;
    url: string;
    priority: number;
  }[] = [];
  const seenUrls = new Set<string>();

  const registerUniqueCandidate = (
    url?: string | null,
    serverName?: string,
    priority?: number
  ) => {
    if (!url) return;
    const belongsToStreamwish = isStreamwish({ serverName, url });
    const normalizedUrl = belongsToStreamwish
      ? normalizeStreamwishEmbedUrl(url)
      : url.trim();

    if (!normalizedUrl.startsWith("http") || seenUrls.has(normalizedUrl)) {
      return;
    }

    seenUrls.add(normalizedUrl);
    collectedCandidates.push({
      serverName: serverName || normalizedUrl,
      url: normalizedUrl,
      priority: priority ?? collectedCandidates.length + 1,
    });
  };

  try {
    const [embed69Resolution, playLatinItems] = await Promise.all([
      resolveRankedEmbedsFromEmbed69Url(rawAggregatorUrl, 4500),
      resolveRankedEmbedsFromPlayLatinByUrl(rawAggregatorUrl, 4500),
    ]);

    for (const item of embed69Resolution.items) {
      registerUniqueCandidate(item.url, item.serverName, item.priority);
    }

    for (const item of playLatinItems) {
      registerUniqueCandidate(item.url, item.serverName, item.priority);
    }
  } catch {
    // Continúa con los candidatos recolectados hasta el momento
  }

  const prioritized = filterAndPrioritizeMirrors(collectedCandidates, {
    strictOnly: STRICT_STREAMWISH_ONLY,
    fallbackIfEmpty: FALLBACK_IF_EMPTY,
  });

  return prioritized.map(({ item, isStreamwish: sw, isDirty }) => ({
    url: item.url,
    serverName: item.serverName,
    priority: item.priority,
    isStreamwish: sw,
    isDirty,
  }));
}

/**
 * Sondea un objetivo de extracción individual (`StreamwishExtractionTarget`),
 * desempaqueta sus bloques ofuscados con `DeanEdwardsUnpacker` y verifica que el manifiesto
 * `.m3u8` o archivo `.mp4` esté vivo.
 *
 * @param target Objetivo de extracción (`fetchUrl`, `referer`, `sourceEmbedUrl`).
 * @param meta Metadatos de clasificación (`isStreamwish`, `isDirty`).
 * @returns El primer flujo de video vivo (`ProbeHitResult`) o `null`.
 */
async function probeSingleExtractionTarget(
  target: StreamwishExtractionTarget,
  meta: { isStreamwish: boolean; isDirty: boolean },
  internalProxyBaseUrl: string
): Promise<ProbeHitResult | null> {
  try {
    const targetOrigin = (() => {
      try {
        return new URL(target.fetchUrl).origin;
      } catch {
        return target.referer;
      }
    })();

    const response = await fetch(target.fetchUrl, {
      method: "GET",
      headers: {
        "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
        Referer: target.referer,
        Origin: targetOrigin,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return null;

    const finalUrl = response.url || target.fetchUrl;
    const fetchOrigin = new URL(finalUrl).origin;
    const streamReferer = `${fetchOrigin}/`;
    const html = await response.text();
    const unpackedScript = unpackDeanEdwardsPackedScripts(html);
    const combinedText = `${html}\n${unpackedScript}`;

    const extractedCandidates = extractStreamCandidatesFromHtmlAndScripts(
      combinedText,
      fetchOrigin
    );
    if (extractedCandidates.length === 0) return null;

    const limitedCandidates = extractedCandidates.slice(0, 2);

    for (const candidate of limitedCandidates) {
      let resolvedInlineM3u8: string | undefined;
      let alive = false;

      if (candidate.type === "hls") {
        const inlineM3u8 = await resolveInlineHlsManifestForInternalProxy(
          candidate,
          streamReferer,
          internalProxyBaseUrl,
          2200
        );
        if (inlineM3u8) {
          resolvedInlineM3u8 = inlineM3u8;
          alive = true;
        }
      } else {
        alive = await verifyExtractedStreamCandidateAlive(
          candidate,
          streamReferer,
          2200
        );
      }

      if (!alive) continue;

      const backupStreams: NativeStreamOption[] = [];
      for (const secondaryCandidate of limitedCandidates) {
        if (secondaryCandidate.streamUrl === candidate.streamUrl) {
          continue;
        }
        backupStreams.push({
          streamUrl: secondaryCandidate.streamUrl,
          type: secondaryCandidate.type,
          referer: streamReferer,
        });
      }

      return {
        ...candidate,
        referer: streamReferer,
        sourceEmbedUrl: target.sourceEmbedUrl,
        isStreamwish: meta.isStreamwish,
        isDirty: meta.isDirty,
        inlineM3u8: resolvedInlineM3u8,
        backupStreams,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Ejecuta una fase de extracción en paralelo resolviendo inmediatamente con el primer stream vivo.
 *
 * @param descriptors Lista de descriptores de embeds a evaluar.
 * @param internalProxyBaseUrl URL base absoluta de `/api/stream-proxy` para reescritura inline del manifiesto HLS.
 * @returns El primer flujo nativo vivo encontrado o `null`.
 */
async function executeParallelExtractionPhase(
  descriptors: CandidateEmbedDescriptor[],
  internalProxyBaseUrl: string
): Promise<ProbeHitResult | null> {
  if (descriptors.length === 0) return null;

  const targetsWithMeta: {
    target: StreamwishExtractionTarget;
    isStreamwish: boolean;
    isDirty: boolean;
  }[] = [];
  const seenFetchUrls = new Set<string>();

  for (const descriptor of descriptors) {
    const extractionTargets = descriptor.isStreamwish
      ? buildStreamwishExtractionTargets(descriptor.url)
      : [
          {
            fetchUrl: descriptor.url,
            referer: `${new URL(descriptor.url).origin}/`,
            sourceEmbedUrl: descriptor.url,
          },
        ];

    for (const target of extractionTargets) {
      if (!seenFetchUrls.has(target.fetchUrl)) {
        seenFetchUrls.add(target.fetchUrl);
        targetsWithMeta.push({
          target,
          isStreamwish: descriptor.isStreamwish,
          isDirty: descriptor.isDirty,
        });
      }
    }
  }

  return resolveFirstNonNull(
    targetsWithMeta.map((entry) =>
      probeSingleExtractionTarget(
        entry.target,
        {
          isStreamwish: entry.isStreamwish,
          isDirty: entry.isDirty,
        },
        internalProxyBaseUrl
      )
    )
  );
}

/**
 * Actualiza en segundo plano el enlace mirror en PostgreSQL cuando un agregador intermedio
 * se resuelve exitosamente hacia un enlace directo verificado de Streamwish.
 */
function healMirrorRecordInBackground(params: {
  mirrorId: string;
  episodeId?: string;
  originalRawUrl: string;
  resolvedStreamwishUrl: string;
}): void {
  const { mirrorId, episodeId, originalRawUrl, resolvedStreamwishUrl } = params;

  void (async () => {
    try {
      if (episodeId) {
        await prisma.episodeMirror.updateMany({
          where: { episodeId, rawUrl: originalRawUrl },
          data: {
            rawUrl: resolvedStreamwishUrl,
            serverName: "Streamwish-Lat",
          },
        });
      } else if (mirrorId.startsWith("ep-")) {
        const cleanEpisodeMirrorId = mirrorId.slice(3);
        await prisma.episodeMirror.updateMany({
          where: { id: cleanEpisodeMirrorId, rawUrl: originalRawUrl },
          data: {
            rawUrl: resolvedStreamwishUrl,
            serverName: "Streamwish-Lat",
          },
        });
      } else {
        await prisma.mirrorLink.updateMany({
          where: { id: mirrorId },
          data: {
            rawUrl: resolvedStreamwishUrl,
            serverName: "Streamwish-Lat",
          },
        });
      }
    } catch {
      // Silencioso en background para no afectar la respuesta al cliente
    }
  })();
}

/**
 * Endpoint Extractor (`GET /api/extractor?url=<EMBED_URL>`).
 *
 * Extrae el manifiesto `.m3u8` o archivo `.mp4` directo para reproducirlo en el elemento `<video>`
 * nativo con cero anuncios, priorizando de forma determinista todos los dominios espejo de Streamwish.
 */
export async function GET(request: NextRequest) {
  const inputUrl = request.nextUrl.searchParams.get("url")?.trim() || "";

  if (!inputUrl) {
    return NextResponse.json(
      {
        success: false,
        fallbackUrl: "",
        isStreamwish: false,
        isDirty: false,
        reason: "Parámetro 'url' requerido.",
      },
      { status: 200 }
    );
  }

  const auth = await getAuthenticatedUserSession();
  const membership = auth
    ? await prismaMembershipRepository.getMembershipByUserId(
        auth.userId,
        auth.email
      )
    : null;

  if (!auth || !membership?.isModoEscudoActive) {
    return NextResponse.json(
      {
        success: false,
        fallbackUrl: inputUrl,
        isStreamwish: false,
        isDirty: false,
        shieldRequired: true,
        reason:
          "El Modo Escudo requiere membresía Piloto Pro activa para usar el reproductor nativo.",
      },
      { status: 200 }
    );
  }

  const rateLimit = apiRateLimiter.checkLimit(
    `extractor:${auth.userId}:${getClientIp(request)}`,
    30,
    60_000
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        fallbackUrl: "",
        isStreamwish: false,
        isDirty: false,
        reason: "Demasiadas solicitudes al extractor. Esperá unos segundos.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  let targetEmbedUrl = inputUrl;
  let fallbackIframeUrl = inputUrl;
  let decryptedMirrorId: string | null = null;
  let decryptedMovieId: string | null = null;
  let decryptedEpisodeId: string | undefined;
  let originalRawUrl: string | null = null;
  let tokenServerName: string | undefined;

  try {
    if (
      inputUrl.startsWith("/api/stream/") ||
      inputUrl.includes("/api/stream/")
    ) {
      const afterPrefix = inputUrl.split("/api/stream/")[1] || "";
      const tokenSegment = afterPrefix.split("?")[0].split("#")[0];
      if (tokenSegment) {
        const decodedToken = decodeURIComponent(tokenSegment);
        const payload = tokenCryptoService.decryptStreamToken(decodedToken);
        targetEmbedUrl = payload.rawUrl;
        originalRawUrl = payload.rawUrl;
        decryptedMirrorId = payload.mirrorId;
        decryptedMovieId = payload.movieId;
        decryptedEpisodeId = payload.episodeId;
        tokenServerName = payload.serverName;
        fallbackIframeUrl = inputUrl;
      }
    }

    if (!isSafePublicHttpUrl(targetEmbedUrl)) {
      return NextResponse.json(
        {
          success: false,
          fallbackUrl: "",
          isStreamwish: false,
          isDirty: true,
          reason: "Destino de URL no permitido.",
        },
        { status: 400 }
      );
    }

    const parsedInitialUrl = new URL(targetEmbedUrl);
    const initialOrigin = parsedInitialUrl.origin;
    const initialBelongsToStreamwish = isStreamwish({
      serverName: tokenServerName,
      url: targetEmbedUrl,
    });

    if (
      STRICT_STREAMWISH_ONLY &&
      !FALLBACK_IF_EMPTY &&
      !initialBelongsToStreamwish &&
      !isMultiEmbedAggregatorUrl(targetEmbedUrl) &&
      !/\.m3u8(\?|$)|\.mp4(\?|$)/i.test(parsedInitialUrl.pathname)
    ) {
      return NextResponse.json(
        {
          success: false,
          fallbackUrl: fallbackIframeUrl,
          isStreamwish: false,
          isDirty: true,
          reason:
            "Bloqueado por STRICT_STREAMWISH_ONLY: el servidor de origen no pertenece a Streamwish.",
        },
        { status: 200 }
      );
    }

    const publicOrigin = resolvePublicOrigin(request);
    const internalProxyBaseUrl = `${publicOrigin}/api/stream-proxy`;

    const extractorCacheKey = `extractor:v5:${publicOrigin}:${decryptedEpisodeId || decryptedMovieId || "direct"}:${targetEmbedUrl}`;
    const cachedHit =
      cacheService.get<CachedExtractorSuccessPayload>(extractorCacheKey);
    if (cachedHit) {
      return NextResponse.json(cachedHit, { headers: NO_CDN_CACHE_HEADERS });
    }

    // 1. Si ya es un enlace directo .m3u8 o .mp4, retornarlo de inmediato
    if (/\.m3u8(\?|$)/i.test(parsedInitialUrl.pathname)) {
      return NextResponse.json(
        {
          success: true,
          streamUrl: targetEmbedUrl,
          type: "hls",
          referer: initialOrigin,
          isStreamwish: initialBelongsToStreamwish,
          isDirty: !initialBelongsToStreamwish,
        },
        { headers: NO_CDN_CACHE_HEADERS }
      );
    }

    if (/\.mp4(\?|$)/i.test(parsedInitialUrl.pathname)) {
      return NextResponse.json(
        {
          success: true,
          streamUrl: targetEmbedUrl,
          type: "mp4",
          referer: initialOrigin,
          isStreamwish: initialBelongsToStreamwish,
          isDirty: !initialBelongsToStreamwish,
        },
        { headers: NO_CDN_CACHE_HEADERS }
      );
    }

    const rawCandidates: {
      url: string;
      serverName: string;
      priority: number;
    }[] = [
      {
        url: isStreamwishUrl(targetEmbedUrl)
          ? normalizeStreamwishEmbedUrl(targetEmbedUrl)
          : targetEmbedUrl,
        serverName: tokenServerName || targetEmbedUrl,
        priority: isStreamwishUrl(targetEmbedUrl) ? 1 : 50,
      },
    ];

    let embed69LookupUrl: string | null = targetEmbedUrl.includes(
      "embed69.org/f/"
    )
      ? targetEmbedUrl
      : null;

    const isExternalNonScraperAggregator =
      isMultiEmbedAggregatorUrl(targetEmbedUrl) &&
      !targetEmbedUrl.includes("embed69.org") &&
      !targetEmbedUrl.includes("playlatinsrc.co");

    if (
      !embed69LookupUrl &&
      decryptedMovieId &&
      !targetEmbedUrl.includes("vidsrc.me")
    ) {
      try {
        // Resuelve de forma exacta el episodeId desde el payload del token (o extrayendo los 36 caracteres del UUID)
        const resolvedEpisodeId =
          decryptedEpisodeId ||
          (decryptedMirrorId?.startsWith("ep-") &&
          decryptedMirrorId.length >= 39
            ? decryptedMirrorId.slice(3, 39)
            : null);

        const siblingMirrors = resolvedEpisodeId
          ? await prisma.episodeMirror.findMany({
              where: { episodeId: resolvedEpisodeId },
              orderBy: { priority: "asc" },
            })
          : await prisma.mirrorLink.findMany({
              where: { movieId: decryptedMovieId },
              orderBy: { priority: "asc" },
            });

        for (const sibling of siblingMirrors) {
          if (!sibling.rawUrl || sibling.rawUrl === targetEmbedUrl) continue;
          if (sibling.rawUrl.includes("embed69.org/f/")) {
            if (
              !isExternalNonScraperAggregator &&
              !embed69LookupUrl &&
              !isStreamwishUrl(targetEmbedUrl)
            ) {
              embed69LookupUrl = sibling.rawUrl;
            }
          } else if (
            !sibling.rawUrl.includes("vidsrc.me") &&
            (!isExternalNonScraperAggregator ||
              (!isMultiEmbedAggregatorUrl(sibling.rawUrl) &&
                isExtractableCleanHost({
                  serverName: sibling.serverName,
                  url: sibling.rawUrl,
                })))
          ) {
            rawCandidates.push({
              url: isStreamwishUrl(sibling.rawUrl)
                ? normalizeStreamwishEmbedUrl(sibling.rawUrl)
                : sibling.rawUrl,
              serverName: sibling.serverName,
              priority: sibling.priority,
            });
          }
        }
      } catch {
        // Continúa si la consulta de mirrors hermanos falla
      }
    }

    let prioritizedDescriptors: CandidateEmbedDescriptor[] = [];

    if (embed69LookupUrl) {
      prioritizedDescriptors =
        await resolveMultiEmbedAggregatorToDirectEmbeds(embed69LookupUrl);
      if (
        prioritizedDescriptors.length > 0 &&
        !inputUrl.includes("/api/stream/")
      ) {
        fallbackIframeUrl = prioritizedDescriptors[0].url;
      }
    }

    if (prioritizedDescriptors.length === 0) {
      const nonAggregatorCandidates = rawCandidates.filter(
        (candidate) => !isMultiEmbedAggregatorUrl(candidate.url)
      );
      const filtered = filterAndPrioritizeMirrors(nonAggregatorCandidates, {
        strictOnly: STRICT_STREAMWISH_ONLY,
        fallbackIfEmpty: FALLBACK_IF_EMPTY,
      });

      prioritizedDescriptors = filtered.map(
        ({ item, isStreamwish: sw, isDirty }) => ({
          url: item.url,
          serverName: item.serverName,
          priority: item.priority,
          isStreamwish: sw,
          isDirty,
        })
      );
    }

    if (prioritizedDescriptors.length === 0) {
      return NextResponse.json(
        {
          success: false,
          fallbackUrl: fallbackIframeUrl,
          isStreamwish: false,
          isDirty: true,
          checkedSiblings:
            Boolean(decryptedMovieId) || isExternalNonScraperAggregator,
          reason: isExternalNonScraperAggregator
            ? "Servidor embebido externo (sin extracción directa)."
            : "No se encontraron servidores Streamwish disponibles bajo el modo estricto.",
        },
        { status: 200, headers: NO_CDN_CACHE_HEADERS }
      );
    }

    // FASE 1 DETERMINISTA: Evaluar todos los targets de Streamwish en paralelo primero
    const streamwishDescriptors = prioritizedDescriptors.filter(
      (descriptor) => descriptor.isStreamwish
    );
    let extractionHit = await executeParallelExtractionPhase(
      streamwishDescriptors,
      internalProxyBaseUrl
    );

    // FASE 2 CONTINGENCIA: Solo si Streamwish falló por completo y está habilitado el fallback
    if (!extractionHit && (!STRICT_STREAMWISH_ONLY || FALLBACK_IF_EMPTY)) {
      const dirtyDescriptors = prioritizedDescriptors.filter(
        (descriptor) => !descriptor.isStreamwish
      );
      const extractableDirty = dirtyDescriptors.filter((descriptor) =>
        isExtractableCleanHost({
          serverName: descriptor.serverName,
          url: descriptor.url,
        })
      );

      if (extractableDirty.length > 0) {
        extractionHit = await executeParallelExtractionPhase(
          extractableDirty,
          internalProxyBaseUrl
        );
      }
      if (!extractionHit) {
        const remainingDirty = dirtyDescriptors.filter(
          (descriptor) =>
            !isExtractableCleanHost({
              serverName: descriptor.serverName,
              url: descriptor.url,
            })
        );
        extractionHit = await executeParallelExtractionPhase(
          remainingDirty,
          internalProxyBaseUrl
        );
      }
    }

    if (extractionHit) {
      if (
        decryptedMirrorId &&
        originalRawUrl &&
        extractionHit.sourceEmbedUrl &&
        extractionHit.sourceEmbedUrl !== originalRawUrl &&
        extractionHit.isStreamwish &&
        isStreamwishUrl(extractionHit.sourceEmbedUrl) &&
        (isMultiEmbedAggregatorUrl(originalRawUrl) ||
          /dr0pstream\.com|doodstream/i.test(originalRawUrl))
      ) {
        healMirrorRecordInBackground({
          mirrorId: decryptedMirrorId,
          episodeId: decryptedEpisodeId,
          originalRawUrl,
          resolvedStreamwishUrl: extractionHit.sourceEmbedUrl,
        });
      }

      const responsePayload: CachedExtractorSuccessPayload = {
        success: true,
        streamUrl: extractionHit.streamUrl,
        type: extractionHit.type,
        referer: extractionHit.referer,
        ...(extractionHit.inlineM3u8
          ? { inlineM3u8: extractionHit.inlineM3u8 }
          : {}),
        backupStreams: extractionHit.backupStreams,
        durationSeconds: extractionHit.durationSeconds,
        posterUrl: extractionHit.posterUrl,
        isStreamwish: extractionHit.isStreamwish,
        isDirty: extractionHit.isDirty,
      };
      cacheService.set(extractorCacheKey, responsePayload, 180);

      return NextResponse.json(responsePayload, {
        headers: NO_CDN_CACHE_HEADERS,
      });
    }

    const firstDescriptor = prioritizedDescriptors[0];
    return NextResponse.json(
      {
        success: false,
        fallbackUrl: fallbackIframeUrl,
        isStreamwish:
          firstDescriptor?.isStreamwish ?? initialBelongsToStreamwish,
        isDirty: firstDescriptor?.isDirty ?? !initialBelongsToStreamwish,
        checkedSiblings: Boolean(decryptedMovieId),
        reason:
          "No se encontró un manifiesto .m3u8 o archivo .mp4 directo o el servidor bloqueó la IP.",
      },
      { status: 200, headers: NO_CDN_CACHE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        fallbackUrl: fallbackIframeUrl,
        isStreamwish: false,
        isDirty: true,
        reason: "Error al intentar extraer el stream.",
      },
      { status: 200, headers: NO_CDN_CACHE_HEADERS }
    );
  }
}
