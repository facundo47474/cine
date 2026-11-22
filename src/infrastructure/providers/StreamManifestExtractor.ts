import {
  buildStreamwishExtractionTargets,
  isStreamwishUrl,
} from "@/domain/utils/streamwishMatcher";
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

export interface DirectHlsStreamInfo {
  hlsUrl: string;
  inlineM3u8?: string;
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
  timeoutMs: number = 2200
): Promise<boolean> {
  if (candidate.type === "mp4") {
    try {
      const originHeader = (() => {
        try {
          return new URL(referer).origin;
        } catch {
          return new URL(candidate.streamUrl).origin;
        }
      })();
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
    const response = await fetch(candidate.streamUrl, {
      method: "GET",
      headers: {
        "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
        Referer: referer,
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
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
 * usando carrera rápida al primer espejo vivo y proxificado mediante `/api/stream-proxy`.
 *
 * @param embedUrl URL del embed de Streamwish, Vidhide o Dropload.
 * @returns Información del stream listo para reproducir vía `/api/stream-proxy` o `null`.
 */
export async function extractDirectHlsFromStreamwishEmbed(
  embedUrl: string
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
          signal: AbortSignal.timeout(3200),
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

        const firstAlive = await resolveFirstNonNull(
          candidates.slice(0, 4).map(async (candidate) => {
            const ok = await verifyExtractedStreamCandidateAlive(
              candidate,
              streamReferer,
              2200
            );
            return ok ? candidate : null;
          })
        );
        if (!firstAlive) return null;

        return {
          hlsUrl: firstAlive.streamUrl,
          posterUrl: firstAlive.posterUrl || "",
          durationSeconds: firstAlive.durationSeconds,
        };
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
