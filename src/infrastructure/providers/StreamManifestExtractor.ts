import {
  buildStreamwishExtractionTargets,
  isStreamwishUrl,
} from "@/domain/utils/streamwishMatcher";
import {
  buildStreamProxyUrl,
  isExternalStreamProxyConfigured,
} from "@/config/streamProxy";
import { unpackDeanEdwardsPackedScripts } from "./DeanEdwardsUnpacker";
import { DEFAULT_SCRAPER_USER_AGENT } from "./Embed69Decoder";

/**
 * Extractor unificado de flujos de video directos (`.m3u8` HLS y `.mp4`)
 * a partir de páginas embed de Streamwish, Vidhide, Filemoon, Dropload y Mixdrop.
 */

export interface ExtractedStreamCandidate {
  streamUrl: string;
  type: "hls" | "mp4";
  durationSeconds?: number;
  posterUrl?: string;
}

export type StreamSegmentTransport = "external" | "direct" | "internal";

export interface ResolvedPlayableHlsManifest {
  inlineM3u8: string;
  transport: StreamSegmentTransport;
}

export interface DirectHlsStreamInfo {
  hlsUrl: string;
  inlineM3u8?: string;
  transport?: StreamSegmentTransport;
  posterUrl: string;
  durationSeconds?: number;
}

/**
 * Analiza el código HTML y los bloques desempaquetados de un servidor embed
 * para extraer todas las URLs de manifiestos HLS (`.m3u8`) o archivos `.mp4`,
 * junto con la duración y miniatura (`posterUrl`).
 *
 * @param combinedHtmlAndUnpackedScript Texto combinado del HTML original y los scripts desempaquetados.
 * @param baseOrigin Origen HTTP del servidor (`https://host.com`) para resolver rutas relativas.
 * @returns Lista deduplicada de candidatos de stream encontrados.
 */
export function extractStreamCandidatesFromHtmlAndScripts(
  combinedHtmlAndUnpackedScript: string,
  baseOrigin: string
): ExtractedStreamCandidate[] {
  const durationMatch = combinedHtmlAndUnpackedScript.match(
    /duration\s*:\s*["']?([0-9.]+)["']?/i
  );
  const durationSeconds = durationMatch
    ? Math.floor(Number(durationMatch[1]) || 0)
    : undefined;

  const posterMatch = combinedHtmlAndUnpackedScript.match(
    /image\s*:\s*["']([^"']+)["']/i
  );
  const rawPoster = posterMatch?.[1]?.replace(/\\\//g, "/").trim();
  const posterUrl = rawPoster
    ? rawPoster.startsWith("//")
      ? `https:${rawPoster}`
      : rawPoster
    : undefined;

  const normalizeCandidateUrl = (rawCandidate: string): string | null => {
    const cleaned = rawCandidate.replace(/\\\//g, "/").trim();
    if (!cleaned) return null;
    if (cleaned.startsWith("//")) {
      return `https:${cleaned}`;
    }
    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
      return cleaned;
    }
    if (cleaned.startsWith("/")) {
      try {
        return new URL(cleaned, baseOrigin).toString();
      } catch {
        return null;
      }
    }
    return null;
  };

  const candidates: ExtractedStreamCandidate[] = [];
  const seenUrls = new Set<string>();

  const registerCandidate = (rawUrl: string, forcedType?: "hls" | "mp4") => {
    const resolvedUrl = normalizeCandidateUrl(rawUrl);
    if (!resolvedUrl || seenUrls.has(resolvedUrl)) return;
    if (/preroll|vast|adserver|banner|promo/i.test(resolvedUrl)) return;
    seenUrls.add(resolvedUrl);

    const isMp4 =
      forcedType === "mp4" ||
      (/\.mp4(\?|$)/i.test(resolvedUrl) && !/\.m3u8/i.test(resolvedUrl));

    candidates.push({
      streamUrl: resolvedUrl,
      type: isMp4 ? "mp4" : "hls",
      durationSeconds,
      posterUrl,
    });
  };

  const knownPlayerConfigPatterns: {
    regex: RegExp;
    forcedType?: "hls" | "mp4";
  }[] = [
    { regex: /"hls4"\s*:\s*"([^"]+)"/i, forcedType: "hls" },
    { regex: /"hls2"\s*:\s*"([^"]+)"/i, forcedType: "hls" },
    { regex: /"hls3"\s*:\s*"([^"]+)"/i, forcedType: "hls" },
    {
      regex:
        /(?:MDCore\.)?wurl\s*=\s*["']((?:https?:)?\/\/[^"']+\.mp4[^"']*)["']/i,
      forcedType: "mp4",
    },
    { regex: /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i, forcedType: "hls" },
    {
      regex: /sources\s*:\s*\[\s*\{[^}]*?file\s*:\s*["']([^"']+)["']/i,
    },
    {
      regex: /file\s*:\s*["']((?:https?:)?\/\/[^"']+\.mp4[^"']*)["']/i,
      forcedType: "mp4",
    },
  ];

  for (const pattern of knownPlayerConfigPatterns) {
    const match = combinedHtmlAndUnpackedScript.match(pattern.regex);
    if (match?.[1]) {
      registerCandidate(match[1], pattern.forcedType);
    }
  }

  const m3u8GlobalRegex = /((?:https?:)?\/\/[^\s"'<>\\]+?\.m3u8[^\s"'<>\\]*)/gi;
  const m3u8Matches = combinedHtmlAndUnpackedScript.match(m3u8GlobalRegex);
  if (m3u8Matches) {
    for (const matchUrl of m3u8Matches) {
      registerCandidate(matchUrl, "hls");
    }
  }

  const mp4GlobalRegex = /((?:https?:)?\/\/[^\s"'<>\\]+?\.mp4[^\s"'<>\\]*)/gi;
  const mp4Matches = combinedHtmlAndUnpackedScript.match(mp4GlobalRegex);
  if (mp4Matches) {
    for (const matchUrl of mp4Matches) {
      registerCandidate(matchUrl, "mp4");
    }
  }

  return candidates;
}

export async function resolveFirstNonNull<T>(
  tasks: Promise<T | null>[]
): Promise<T | null> {
  if (tasks.length === 0) return null;

  return new Promise((resolve) => {
    let remaining = tasks.length;
    let settled = false;

    for (const task of tasks) {
      task
        .then((result) => {
          if (!settled && result !== null && result !== undefined) {
            settled = true;
            resolve(result);
            return;
          }
          remaining -= 1;
          if (!settled && remaining <= 0) {
            resolve(null);
          }
        })
        .catch(() => {
          remaining -= 1;
          if (!settled && remaining <= 0) {
            resolve(null);
          }
        });
    }
  });
}

/**
 * Selecciona la variante de mayor ancho de banda desde un manifiesto maestro `#EXT-X-STREAM-INF`.
 */
function selectBestVariantFromMasterPlaylist(
  masterText: string,
  masterFinalUrl: string
): string | null {
  const lines = masterText.split(/\r?\n/);
  let pendingBandwidth: number | null = null;
  let bestUrl: string | null = null;
  let bestBandwidth = -1;
  let firstFallbackUri: string | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#")) {
      if (
        trimmed.startsWith("#EXT-X-STREAM-INF:") &&
        !trimmed.startsWith("#EXT-X-I-FRAME-STREAM-INF")
      ) {
        const bwMatch = trimmed.match(/BANDWIDTH=(\d+)/i);
        pendingBandwidth = bwMatch ? Number(bwMatch[1]) || 0 : 0;
      }
      continue;
    }

    let resolvedVariantUrl: string;
    try {
      resolvedVariantUrl = new URL(trimmed, masterFinalUrl).toString();
    } catch {
      pendingBandwidth = null;
      continue;
    }

    if (!firstFallbackUri) {
      firstFallbackUri = resolvedVariantUrl;
    }

    if (pendingBandwidth !== null) {
      if (pendingBandwidth > bestBandwidth) {
        bestBandwidth = pendingBandwidth;
        bestUrl = resolvedVariantUrl;
      }
      pendingBandwidth = null;
    }
  }

  return bestUrl || firstFallbackUri;
}

/**
 * Reescribe todas las URLs de segmentos, llaves `#EXT-X-KEY` y `#EXT-X-MAP` en un manifiesto
 * multimedia HLS a rutas absolutas compatibles con el transporte elegido.
 */
function rewriteMediaPlaylistWithTransport(
  playlistText: string,
  baseUrl: string,
  referer: string,
  transport: StreamSegmentTransport,
  internalProxyBaseUrl: string
): string {
  const normalizedInternalBase = internalProxyBaseUrl.replace(/\/+$/, "");

  const formatTargetUrl = (absUrl: string): string => {
    if (transport === "external") {
      return buildStreamProxyUrl(absUrl, referer);
    }
    if (transport === "direct") {
      return absUrl;
    }
    return `${normalizedInternalBase}?url=${encodeURIComponent(
      absUrl
    )}&referer=${encodeURIComponent(referer)}`;
  };

  return playlistText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        return trimmed.replace(/URI="([^"]+)"/gi, (fullMatch, uriValue: string) => {
          try {
            const resolvedUri = new URL(uriValue, baseUrl).toString();
            return `URI="${formatTargetUrl(resolvedUri)}"`;
          } catch {
            return fullMatch;
          }
        });
      }

      try {
        const resolvedSeg = new URL(trimmed, baseUrl).toString();
        return formatTargetUrl(resolvedSeg);
      } catch {
        return trimmed;
      }
    })
    .join("\n");
}

/**
 * Resuelve el manifiesto maestro -> variante HLS desde la misma IP del extractor,
 * sondea el primer segmento para elegir el transporte óptimo (`external` Cloudflare Worker,
 * `direct` CORS o `internal` `/api/stream-proxy`) y devuelve el media playlist reescrito listo para `Blob URL`.
 */
export async function resolvePlayableHlsManifest(
  candidate: ExtractedStreamCandidate,
  referer: string,
  options?: {
    timeoutMs?: number;
    internalProxyBaseUrl?: string;
  }
): Promise<ResolvedPlayableHlsManifest | null> {
  if (candidate.type !== "hls") return null;
  const timeoutMs = options?.timeoutMs ?? 1800;

  try {
    const res = await fetch(candidate.streamUrl, {
      method: "GET",
      headers: {
        "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
        Referer: referer,
        Accept: "*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }

    const masterText = await res.text();
    if (!masterText.includes("#EXTM3U")) {
      return null;
    }

    let mediaText = masterText;
    let mediaFinalUrl = res.url || candidate.streamUrl;

    if (masterText.includes("#EXT-X-STREAM-INF")) {
      const variantUrl = selectBestVariantFromMasterPlaylist(
        masterText,
        mediaFinalUrl
      );
      if (!variantUrl) return null;

      const varRes = await fetch(variantUrl, {
        method: "GET",
        headers: {
          "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
          Referer: referer,
          Accept: "*/*",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!varRes.ok) {
        await varRes.body?.cancel().catch(() => {});
        return null;
      }

      const varText = await varRes.text();
      if (!varText.includes("#EXTM3U")) {
        return null;
      }

      mediaText = varText;
      mediaFinalUrl = varRes.url || variantUrl;
    }

    const firstSegmentLine = mediaText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => Boolean(l) && !l.startsWith("#"));
    if (!firstSegmentLine) return null;

    let firstSegmentUrl: string;
    try {
      firstSegmentUrl = new URL(firstSegmentLine, mediaFinalUrl).toString();
    } catch {
      return null;
    }

    let transport: StreamSegmentTransport | null = null;

    // A. Cloudflare Worker (0 GB en Netlify)
    if (isExternalStreamProxyConfigured()) {
      try {
        const probe = await fetch(
          buildStreamProxyUrl(firstSegmentUrl, referer),
          {
            method: "GET",
            headers: {
              Range: "bytes=0-1023",
              Accept: "*/*",
            },
            signal: AbortSignal.timeout(1500),
          }
        );
        const contentType = (
          probe.headers.get("content-type") || ""
        ).toLowerCase();
        await probe.body?.cancel().catch(() => {});
        if (
          (probe.ok || probe.status === 206) &&
          !contentType.includes("text/html")
        ) {
          transport = "external";
        }
      } catch {
        // Sigue al siguiente transporte
      }
    }

    // B. Descarga directa CORS desde CDN sin proxy
    if (!transport) {
      try {
        const probe = await fetch(firstSegmentUrl, {
          method: "GET",
          headers: {
            "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
            Origin: "https://pilotoplus.netlify.app",
            Range: "bytes=0-1023",
            Accept: "*/*",
          },
          signal: AbortSignal.timeout(1200),
        });
        const acao = probe.headers.get("access-control-allow-origin");
        const contentType = (
          probe.headers.get("content-type") || ""
        ).toLowerCase();

        if ((probe.ok || probe.status === 206) && acao === "*") {
          const bytes = new Uint8Array(await probe.arrayBuffer());
          const isValidDirectMedia =
            (bytes.length > 0 && bytes[0] === 0x47) ||
            /\.(?:m4s|mp4|m4v)(\?|$)/i.test(firstSegmentUrl) ||
            contentType.includes("video/mp4");
          if (isValidDirectMedia) {
            transport = "direct";
          }
        } else {
          await probe.body?.cancel().catch(() => {});
        }
      } catch {
        // Sigue al transporte interno
      }
    }

    // C. Proxy interno (/api/stream-proxy) si está disponible una base URL absoluta
    if (!transport && options?.internalProxyBaseUrl) {
      try {
        const probe = await fetch(firstSegmentUrl, {
          method: "GET",
          headers: {
            "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
            Referer: referer,
            Range: "bytes=0-1023",
            Accept: "*/*",
          },
          signal: AbortSignal.timeout(1500),
        });
        await probe.body?.cancel().catch(() => {});
        if (probe.ok || probe.status === 206) {
          transport = "internal";
        }
      } catch {
        // Sin transporte viable
      }
    }

    if (!transport) {
      return null;
    }

    const inlineM3u8 = rewriteMediaPlaylistWithTransport(
      mediaText,
      mediaFinalUrl,
      referer,
      transport,
      options?.internalProxyBaseUrl || "/api/stream-proxy"
    );

    return {
      inlineM3u8,
      transport,
    };
  } catch {
    return null;
  }
}

/**
 * Verifica que un candidato de stream esté vivo y devuelva un manifiesto `#EXTM3U` válido
 * cuando es de tipo HLS, o cabecera/rango válido cuando es MP4 directo.
 *
 * @param candidate Candidato de stream extraído.
 * @param referer Cabecera Referer requerida por el CDN de origen.
 * @param timeoutMs Timeout en milisegundos.
 * @returns `true` si el manifiesto o recurso está operativo.
 */
export async function verifyExtractedStreamCandidateAlive(
  candidate: ExtractedStreamCandidate,
  referer: string,
  timeoutMs: number = 1500
): Promise<boolean> {
  const useExternalProxy = isExternalStreamProxyConfigured();
  const targetUrl = useExternalProxy
    ? buildStreamProxyUrl(candidate.streamUrl, referer)
    : candidate.streamUrl;

  if (candidate.type === "mp4") {
    const originHeader = (() => {
      try {
        return new URL(referer).origin;
      } catch {
        return new URL(candidate.streamUrl).origin;
      }
    })();

    if (useExternalProxy) {
      try {
        const extResponse = await fetch(targetUrl, {
          method: "GET",
          headers: {
            Range: "bytes=0-1023",
            Accept: "*/*",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        await extResponse.body?.cancel().catch(() => {});
        if (extResponse.ok || extResponse.status === 206) {
          return true;
        }
      } catch {
        // Fallback a verificación directa con Referer para proxy interno
      }
    }

    try {
      const response = await fetch(candidate.streamUrl, {
        method: "GET",
        headers: {
          "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
          Referer: referer,
          Origin: originHeader,
          Range: "bytes=0-1023",
          Accept: "*/*",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.body?.cancel().catch(() => {});
      return response.ok || response.status === 206;
    } catch {
      return false;
    }
  }

  try {
    const response = await fetch(
      targetUrl,
      useExternalProxy
        ? {
            method: "GET",
            headers: {
              Accept: "*/*",
            },
            signal: AbortSignal.timeout(timeoutMs),
          }
        : {
            method: "GET",
            headers: {
              "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
              Referer: referer,
              Accept: "*/*",
            },
            signal: AbortSignal.timeout(timeoutMs),
          }
    );

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return false;
    }

    const manifestPreview = await response.text();
    return manifestPreview.includes("#EXTM3U");
  } catch {
    return false;
  }
}

/**
 * Extrae el flujo HLS `.m3u8` / `.mp4` directo para un enlace embed de Streamwish, Vidhide o Dropload
 * usando carrera rápida al primer espejo vivo e inlineM3u8 listo para reproducir.
 *
 * @param embedUrl URL del embed de Streamwish, Vidhide o Dropload.
 * @param internalProxyBaseUrl URL absoluta de `/api/stream-proxy` para fallback de segmentos si hace falta.
 * @returns Información del stream listo para reproducir o `null`.
 */
export async function extractDirectHlsFromStreamwishEmbed(
  embedUrl: string,
  internalProxyBaseUrl?: string
): Promise<DirectHlsStreamInfo | null> {
  try {
    const codeMatch = embedUrl.match(/\/(?:e|embed|f|d)\/([a-zA-Z0-9_-]+)/i);
    if (!codeMatch) return null;

    const isVidhideHost = /morencius\.com|vidhide/i.test(embedUrl);
    const isDroploadHost = /dr0pstream\.com|dropload/i.test(embedUrl);
    const isStreamwishHost = isStreamwishUrl(embedUrl);
    if (!isStreamwishHost && !isVidhideHost && !isDroploadHost) return null;

    const extractionTargets =
      isVidhideHost || isDroploadHost
        ? [
            {
              url: embedUrl,
              origin: new URL(embedUrl).origin,
              referer: `${new URL(embedUrl).origin}/`,
            },
          ]
        : buildStreamwishExtractionTargets(embedUrl).map((target) => ({
            url: target.fetchUrl,
            origin: new URL(target.fetchUrl).origin,
            referer: target.referer,
          }));

    const probeOriginToLiveHls = async (target: {
      url: string;
      origin: string;
      referer: string;
    }): Promise<DirectHlsStreamInfo | null> => {
      try {
        const response = await fetch(target.url, {
          headers: {
            "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
            Referer: target.referer,
          },
          signal: AbortSignal.timeout(2500),
        });
        if (!response.ok) return null;

        const finalUrl = response.url || target.url;
        const resolvedOrigin = new URL(finalUrl).origin;
        const streamReferer = `${resolvedOrigin}/`;
        const html = await response.text();
        const unpacked = unpackDeanEdwardsPackedScripts(html);
        const combinedText = unpacked ? `${html}\n${unpacked}` : html;

        const candidates = extractStreamCandidatesFromHtmlAndScripts(
          combinedText,
          resolvedOrigin
        );
        if (candidates.length === 0) return null;

        return await resolveFirstNonNull(
          candidates.slice(0, 2).map(async (candidate) => {
            if (candidate.type === "hls") {
              const resolved = await resolvePlayableHlsManifest(
                candidate,
                streamReferer,
                { timeoutMs: 1800, internalProxyBaseUrl }
              );
              if (!resolved) return null;
              return {
                hlsUrl: candidate.streamUrl,
                inlineM3u8: resolved.inlineM3u8,
                transport: resolved.transport,
                posterUrl: candidate.posterUrl || "",
                durationSeconds: candidate.durationSeconds,
              };
            }

            const ok = await verifyExtractedStreamCandidateAlive(
              candidate,
              streamReferer,
              1500
            );
            if (!ok) return null;
            return {
              hlsUrl: candidate.streamUrl,
              posterUrl: candidate.posterUrl || "",
              durationSeconds: candidate.durationSeconds,
            };
          })
        );
      } catch {
        return null;
      }
    };

    return await resolveFirstNonNull(
      extractionTargets.map((target) => probeOriginToLiveHls(target))
    );
  } catch {
    return null;
  }
}
