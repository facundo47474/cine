import dns from "dns";
import { NextRequest, NextResponse } from "next/server";
import { tokenCryptoService } from "@/infrastructure/container";
import { prisma } from "@/infrastructure/database/prismaClient";
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
  verifyExtractedStreamCandidateAlive,
} from "@/infrastructure/providers/StreamManifestExtractor";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Silencioso en entornos donde no aplique
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CandidateEmbedDescriptor {
  url: string;
  serverName: string;
  priority: number;
  isStreamwish: boolean;
  isDirty: boolean;
}

interface ProbeHitResult extends ExtractedStreamCandidate {
  referer: string;
  sourceEmbedUrl: string;
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
  meta: { isStreamwish: boolean; isDirty: boolean }
): Promise<ProbeHitResult | null> {
  try {
    const response = await fetch(target.fetchUrl, {
      method: "GET",
      headers: {
        "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
        Referer: target.referer,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const unpackedScript = unpackDeanEdwardsPackedScripts(html);
    const combinedText = `${html}\n${unpackedScript}`;
    const fetchOrigin = new URL(target.fetchUrl).origin;
    const streamReferer = `${fetchOrigin}/`;

    const extractedCandidates = extractStreamCandidatesFromHtmlAndScripts(
      combinedText,
      fetchOrigin
    );
    if (extractedCandidates.length === 0) return null;

    const aliveChecks = await Promise.all(
      extractedCandidates.map(async (candidate) => {
        const isAlive = await verifyExtractedStreamCandidateAlive(
          candidate,
          streamReferer
        );
        return isAlive ? candidate : null;
      })
    );

    const firstAliveCandidate = aliveChecks.find((candidate) =>
      Boolean(candidate)
    );
    if (firstAliveCandidate) {
      return {
        ...firstAliveCandidate,
        referer: streamReferer,
        sourceEmbedUrl: target.sourceEmbedUrl,
        isStreamwish: meta.isStreamwish,
        isDirty: meta.isDirty,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Ejecuta una fase de extracción en paralelo sobre un lote de descriptores de embeds.
 *
 * @param descriptors Lista de descriptores de embeds a evaluar.
 * @returns El primer flujo nativo vivo encontrado o `null`.
 */
async function executeParallelExtractionPhase(
  descriptors: CandidateEmbedDescriptor[]
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

  const probeResults = await Promise.all(
    targetsWithMeta.map((entry) =>
      probeSingleExtractionTarget(entry.target, {
        isStreamwish: entry.isStreamwish,
        isDirty: entry.isDirty,
      })
    )
  );

  return (
    probeResults.find((result): result is ProbeHitResult => Boolean(result)) ||
    null
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
          fallbackUrl: "",
          isStreamwish: false,
          isDirty: true,
          reason:
            "Bloqueado por STRICT_STREAMWISH_ONLY: el servidor de origen no pertenece a Streamwish.",
        },
        { status: 200 }
      );
    }

    // 1. Si ya es un enlace directo .m3u8 o .mp4, retornarlo de inmediato
    if (/\.m3u8(\?|$)/i.test(parsedInitialUrl.pathname)) {
      return NextResponse.json({
        success: true,
        streamUrl: targetEmbedUrl,
        type: "hls",
        referer: initialOrigin,
        isStreamwish: initialBelongsToStreamwish,
        isDirty: !initialBelongsToStreamwish,
      });
    }

    if (/\.mp4(\?|$)/i.test(parsedInitialUrl.pathname)) {
      return NextResponse.json({
        success: true,
        streamUrl: targetEmbedUrl,
        type: "mp4",
        referer: initialOrigin,
        isStreamwish: initialBelongsToStreamwish,
        isDirty: !initialBelongsToStreamwish,
      });
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
            if (!embed69LookupUrl && !isStreamwishUrl(targetEmbedUrl)) {
              embed69LookupUrl = sibling.rawUrl;
            }
          } else if (!sibling.rawUrl.includes("vidsrc.me")) {
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
          fallbackUrl: STRICT_STREAMWISH_ONLY ? "" : fallbackIframeUrl,
          isStreamwish: false,
          isDirty: true,
          reason:
            "No se encontraron servidores Streamwish disponibles bajo el modo estricto.",
        },
        { status: 200 }
      );
    }

    // FASE 1 DETERMINISTA: Evaluar todos los targets de Streamwish en paralelo primero
    const streamwishDescriptors = prioritizedDescriptors.filter(
      (descriptor) => descriptor.isStreamwish
    );
    let extractionHit = await executeParallelExtractionPhase(
      streamwishDescriptors
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
        extractionHit = await executeParallelExtractionPhase(extractableDirty);
      }
      if (!extractionHit) {
        const remainingDirty = dirtyDescriptors.filter(
          (descriptor) =>
            !isExtractableCleanHost({
              serverName: descriptor.serverName,
              url: descriptor.url,
            })
        );
        extractionHit = await executeParallelExtractionPhase(remainingDirty);
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

      return NextResponse.json({
        success: true,
        streamUrl: extractionHit.streamUrl,
        type: extractionHit.type,
        referer: extractionHit.referer,
        durationSeconds: extractionHit.durationSeconds,
        posterUrl: extractionHit.posterUrl,
        isStreamwish: extractionHit.isStreamwish,
        isDirty: extractionHit.isDirty,
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
        reason:
          "No se encontró un manifiesto .m3u8 o archivo .mp4 directo o el servidor bloqueó la IP.",
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        fallbackUrl: fallbackIframeUrl,
        isStreamwish: false,
        isDirty: true,
        reason:
          error instanceof Error
            ? error.message
            : "Error al intentar extraer el stream.",
      },
      { status: 200 }
    );
  }
}
