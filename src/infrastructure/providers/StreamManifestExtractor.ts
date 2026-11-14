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

/**
 * Verifica que un candidato de stream esté vivo y devuelva un manifiesto `#EXTM3U` válido
 * cuando es de tipo HLS.
 *
 * @param candidate Candidato de stream extraído.
 * @param referer Cabecera Referer requerida por el CDN de origen.
 * @param timeoutMs Timeout en milisegundos.
 * @returns `true` si el manifiesto o recurso está operativo.
 */
export async function verifyExtractedStreamCandidateAlive(
  candidate: ExtractedStreamCandidate,
  referer: string,
  timeoutMs: number = 2800
): Promise<boolean> {
  if (candidate.type === "mp4") {
    return true;
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
 * Extrae el flujo HLS `.m3u8` directo para un enlace embed de Streamwish o Vidhide,
 * resolviendo el manifiesto maestro (`hls4`) a una lista de segmentos con URLs absolutas (`inlineM3u8`)
 * o retornando el enlace `hls2` de respaldo.
 *
 * @param embedUrl URL del embed de Streamwish o Vidhide.
 * @returns Información del stream HLS listo para inyectar en `<video>` o `null` si no pudo extraerse.
 */
export async function extractDirectHlsFromStreamwishEmbed(
  embedUrl: string
): Promise<DirectHlsStreamInfo | null> {
  try {
    const codeMatch = embedUrl.match(/\/(?:e|embed|f|d)\/([a-zA-Z0-9_-]+)/i);
    if (!codeMatch) return null;

    const isVidhideHost = /morencius\.com|vidhide/i.test(embedUrl);
    const isStreamwishHost = isStreamwishUrl(embedUrl);
    if (!isStreamwishHost && !isVidhideHost) return null;

    const fileCode = codeMatch[1];
    const extractionTargets = isVidhideHost
      ? [
          {
            url: embedUrl,
            origin: new URL(embedUrl).origin,
            referer: "https://embed69.org/",
          },
        ]
      : buildStreamwishExtractionTargets(embedUrl).map((target) => ({
          url: target.fetchUrl,
          origin: new URL(target.fetchUrl).origin,
          referer: target.referer,
        }));

    const probeSingleOrigin = async (target: {
      url: string;
      origin: string;
      referer: string;
    }): Promise<{ origin: string; combinedText: string } | null> => {
      try {
        const response = await fetch(target.url, {
          headers: {
            "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
            Referer: target.referer,
          },
          signal: AbortSignal.timeout(2500),
        });
        if (!response.ok) return null;

        const html = await response.text();
        const unpacked = unpackDeanEdwardsPackedScripts(html);
        const combinedText = unpacked ? `${html}\n${unpacked}` : html;

        if (!/"hls4"|"hls2"|file\s*:\s*["'][^"']+\.m3u8/i.test(combinedText)) {
          return null;
        }
        return { origin: target.origin, combinedText };
      } catch {
        return null;
      }
    };

    const originResponses = await Promise.all(
      extractionTargets.map((target) => probeSingleOrigin(target))
    );
    const winningOrigin = originResponses.find(
      (result): result is { origin: string; combinedText: string } =>
        Boolean(result)
    );

    if (!winningOrigin) return null;

    const { origin, combinedText } = winningOrigin;
    const hls4Match = combinedText.match(/"hls4"\s*:\s*"([^"]+)"/);
    const hls2Match = combinedText.match(/"hls2"\s*:\s*"([^"]+)"/);
    const fileMatch = combinedText.match(
      /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i
    );
    const posterMatch = combinedText.match(/image\s*:\s*["']([^"']+)["']/i);
    const durationMatch = combinedText.match(
      /duration\s*:\s*["']?([0-9.]+)["']?/i
    );

    const durationSeconds = durationMatch
      ? Math.floor(Number(durationMatch[1]) || 0)
      : undefined;
    const posterUrl = posterMatch?.[1] || "";

    const masterCandidate = hls4Match?.[1] || fileMatch?.[1];
    if (masterCandidate) {
      try {
        const masterUrl = masterCandidate.startsWith("http")
          ? masterCandidate
          : `${origin}${masterCandidate}`;

        const masterResponse = await fetch(masterUrl, {
          headers: {
            "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
            Referer: `${origin}/e/${fileCode}`,
          },
          signal: AbortSignal.timeout(2500),
        });

        if (masterResponse.ok) {
          const masterPlaylistText = await masterResponse.text();
          const variantLines = masterPlaylistText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => Boolean(line) && !line.startsWith("#"));

          if (variantLines.length > 0) {
            const highestQualityVariant = variantLines[variantLines.length - 1];
            const variantUrl = new URL(
              highestQualityVariant,
              masterUrl
            ).toString();

            const variantResponse = await fetch(variantUrl, {
              headers: {
                "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
                Referer: `${origin}/e/${fileCode}`,
              },
              signal: AbortSignal.timeout(2500),
            });

            if (variantResponse.ok) {
              const rawVariantM3u8 = await variantResponse.text();
              if (rawVariantM3u8.includes("#EXTM3U")) {
                const absoluteM3u8 = rawVariantM3u8
                  .split("\n")
                  .map((line) => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith("#")) return trimmed;
                    try {
                      return new URL(trimmed, variantUrl).toString();
                    } catch {
                      return trimmed;
                    }
                  })
                  .join("\n");

                return {
                  hlsUrl: variantUrl,
                  inlineM3u8: absoluteM3u8,
                  posterUrl,
                  durationSeconds,
                };
              }
            }
          }
        }
      } catch {
        // Si falla la resolución de hls4, cae al respaldo hls2
      }
    }

    if (hls2Match?.[1]?.startsWith("http")) {
      return {
        hlsUrl: hls2Match[1],
        posterUrl,
        durationSeconds,
      };
    }

    return null;
  } catch {
    return null;
  }
}
