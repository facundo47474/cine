import crypto from "crypto";
import dns from "dns";
import { NextRequest, NextResponse } from "next/server";
import { tokenCryptoService } from "@/infrastructure/container";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Silencioso en entornos donde no aplique
}

export const dynamic = "force-dynamic";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface Embed69ServerEntry {
  servername?: string;
  link?: string;
  type?: string;
}

interface Embed69LanguageBlock {
  file_id?: number;
  video_language?: string;
  sortedEmbeds?: Embed69ServerEntry[];
}

interface PlayLatinSourceEntry {
  url?: string;
  server?: string;
  name?: string;
  version?: string;
}

interface PlayLatinResolveResponse {
  sources?: PlayLatinSourceEntry[];
}

/**
 * Desempaqueta todos los bloques ofuscados con Dean Edwards Packer (`eval(function(p,a,c,k,e,d)...)`)
 * en TypeScript puro sin utilizar `eval`.
 */
function unpackDeanEdwardsBlocks(html: string): string {
  const packerGlobalRegex =
    /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)(?:,\s*\d+,\s*\{\})?\)\)/g;

  const unpackedChunks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = packerGlobalRegex.exec(html)) !== null) {
    try {
      const payload = match[1].replace(/\\'/g, "'");
      const radix = Number(match[2]);
      const count = Number(match[3]);
      const symtab = match[4].split("|");

      if (!radix || !count || symtab.length === 0) continue;

      const encodeBase = (num: number, base: number): string => {
        const chars =
          "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (base <= 36) {
          return num.toString(base);
        }
        let result = "";
        let n = num;
        do {
          result = chars[n % base] + result;
          n = Math.floor(n / base);
        } while (n > 0);
        return result;
      };

      const lookup = new Map<string, string>();
      for (let i = 0; i < count; i++) {
        if (symtab[i]) {
          lookup.set(encodeBase(i, radix), symtab[i]);
        }
      }

      const unpacked = payload.replace(/\b[0-9a-zA-Z]+\b/g, (word) => {
        return lookup.get(word) ?? word;
      });
      unpackedChunks.push(unpacked);
    } catch {
      // Continuar con el siguiente bloque si alguno está malformado
    }
  }

  return unpackedChunks.join("\n");
}

function solveEmbed69AesKey(
  challenge: string,
  difficulty: number,
  salt: string
): Buffer | null {
  try {
    const safeDifficulty = Math.min(Math.max(1, difficulty), 5);
    const prefix = "0".repeat(safeDifficulty);
    for (let nonce = 0; nonce < 500_000; nonce++) {
      const hashHex = crypto
        .createHash("sha256")
        .update(challenge + String(nonce))
        .digest("hex");
      if (hashHex.startsWith(prefix)) {
        return crypto
          .createHash("sha256")
          .update(challenge + String(nonce) + salt)
          .digest();
      }
    }
    return null;
  } catch {
    return null;
  }
}

function decryptEmbed69Link(
  encryptedBase64: string,
  aesKey: Buffer
): string | null {
  try {
    if (
      encryptedBase64.startsWith("http://") ||
      encryptedBase64.startsWith("https://")
    ) {
      return encryptedBase64;
    }
    const raw = Buffer.from(encryptedBase64, "base64");
    if (raw.length <= 16) return null;
    const iv = raw.subarray(0, 16);
    const ciphertext = raw.subarray(16);
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      aesKey.subarray(0, 32),
      iv
    );
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return decrypted.replace(/`/g, "").trim() || null;
  } catch {
    return null;
  }
}

function getServerPriorityWeight(servername?: string): number {
  const normalized = (servername || "").toLowerCase();
  if (normalized.includes("streamwish")) return 1;
  if (normalized.includes("filemoon")) return 2;
  if (normalized.includes("doodstream")) return 3;
  if (normalized.includes("rapidvideo")) return 4;
  if (normalized.includes("vidhide")) return 8;
  if (normalized.includes("voe")) return 9;
  return 5;
}

async function resolveEmbed69OrPlayLatinToDirectEmbed(
  rawUrl: string
): Promise<string | null> {
  try {
    const parsedUrl = new URL(rawUrl);
    const requestedLang = (
      parsedUrl.searchParams.get("lang") || "LAT"
    ).toUpperCase();
    const baseCleanUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;

    const candidateUrls = [baseCleanUrl];
    const epMatch = baseCleanUrl.match(
      /^(https?:\/\/[^/]+\/f\/tt\d+-\d+x)(\d+)$/i
    );
    if (epMatch) {
      const prefix = epMatch[1];
      const epDigits = epMatch[2];
      const unpadded = String(Number(epDigits));
      const padded = unpadded.padStart(2, "0");
      const altUrl =
        epDigits === padded ? `${prefix}${unpadded}` : `${prefix}${padded}`;
      if (altUrl !== baseCleanUrl) candidateUrls.push(altUrl);
    }

    const fetchCandidate = async (url: string): Promise<string | null> => {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": BROWSER_USER_AGENT,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return null;
        const text = await res.text();
        if (text.includes("dataLink") && !text.includes("No folders found")) {
          return text;
        }
        return null;
      } catch {
        return null;
      }
    };

    const htmlList = await Promise.all(
      candidateUrls.map((u) => fetchCandidate(u))
    );
    const html = htmlList.find((h): h is string => Boolean(h));

    if (html) {
      const cm = html.match(/POW_CHALLENGE\s*=\s*'([^']+)'/);
      const dm = html.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
      const sm = html.match(/POW_SALT\s*=\s*'([^']+)'/);
      const dlm = html.match(
        /let\s+dataLink\s*=\s*(\[\{[\s\S]*?\}\])\s*;\s*let\s+currentLanguageServers/
      );

      if (cm && dm && sm && dlm) {
        const aesKey = solveEmbed69AesKey(cm[1], Number(dm[1]), sm[1]);
        if (aesKey) {
          const dataLink = JSON.parse(dlm[1]) as Embed69LanguageBlock[];
          if (Array.isArray(dataLink) && dataLink.length > 0) {
            dataLink.sort((a, b) => {
              const getRank = (langRaw?: string) => {
                const l = (langRaw || "").toUpperCase();
                if (requestedLang === "SUB") {
                  if (l === "SUB" || l === "VOSE") return 1;
                  if (l === "LAT" || l === "LATINO") return 2;
                  return 3;
                }
                if (l === "LAT" || l === "LATINO") return 1;
                if (l === "ESP" || l === "CASTELLANO") return 2;
                return 3;
              };
              return getRank(a.video_language) - getRank(b.video_language);
            });

            for (const block of dataLink) {
              if (!Array.isArray(block.sortedEmbeds)) continue;
              const ordered = [...block.sortedEmbeds].sort(
                (a, b) =>
                  getServerPriorityWeight(a.servername) -
                  getServerPriorityWeight(b.servername)
              );
              for (const entry of ordered) {
                if (!entry.link) continue;
                const dec = decryptEmbed69Link(entry.link, aesKey);
                if (dec && dec.startsWith("http")) {
                  return dec;
                }
              }
            }
          }
        }
      }
    }

    // Fallback a PlayLatinSrc (que funciona directamente desde IPs de Vercel AWS)
    const tvMatch = rawUrl.match(/(tt\d+)-(\d+)x(\d+)/i);
    const movieMatch = rawUrl.match(/(tt\d+)/i);
    if (!tvMatch && !movieMatch) return null;

    const isTv = Boolean(tvMatch);
    const imdbId = tvMatch ? tvMatch[1] : movieMatch![1];
    const seasonStr = tvMatch ? String(Number(tvMatch[2])) : "1";
    const episodeStr = tvMatch ? String(Number(tvMatch[3])) : "1";

    const pageUrl = isTv
      ? `https://playlatinsrc.co/custom/serial/${imdbId}/${seasonStr}/${episodeStr}`
      : `https://playlatinsrc.co/custom/movie/${imdbId}`;
    const pageRes = await fetch(pageUrl, {
      headers: { "User-Agent": BROWSER_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!pageRes.ok) return null;

    const pageHtml = await pageRes.text();
    const tokenMatch = pageHtml.match(/data-resolve-token="([^"]+)"/);
    if (!tokenMatch) return null;

    const resolveRes = await fetch("https://playlatinsrc.co/api/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: pageUrl,
        "User-Agent": BROWSER_USER_AGENT,
      },
      body: JSON.stringify({
        type: isTv ? "tv" : "movie",
        id: imdbId,
        season: seasonStr,
        episode: episodeStr,
        mode: "custom",
        token: tokenMatch[1],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resolveRes.ok) return null;

    const data = (await resolveRes.json()) as PlayLatinResolveResponse;
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const validSources = sources.filter((s) =>
      Boolean(s.url && s.url.startsWith("http"))
    );
    if (validSources.length === 0) return null;

    return validSources[0].url || null;
  } catch {
    return null;
  }
}

/**
 * Extrae una URL de stream (.m3u8 o .mp4) analizando el HTML original y los bloques desempaquetados.
 */
function extractStreamFromText(
  combinedText: string,
  baseOrigin: string
): {
  streamUrl: string;
  type: "hls" | "mp4";
  durationSeconds?: number;
  posterUrl?: string;
} | null {
  const durationMatch = combinedText.match(/duration\s*:\s*["']?([0-9.]+)["']?/i);
  const durationSeconds = durationMatch
    ? Math.floor(Number(durationMatch[1]) || 0)
    : undefined;
  const posterMatch = combinedText.match(/image\s*:\s*["']([^"']+)["']/i);
  const posterUrl = posterMatch?.[1] || undefined;

  const resolveCandidateUrl = (rawCandidate: string): string | null => {
    const cleaned = rawCandidate.replace(/\\\//g, "/").trim();
    if (!cleaned) return null;
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

  // 1. Claves JSON prioritarias de JWPlayer / VideoJS (Streamwish, Filemoon, Dropload, Supervideo, Vidhide)
  // Se prioriza hls2 antes que hls4 ya que hls2 entrega segmentos MPEG-TS puros (0x47 en byte 0)
  const jsonKeyRegexes = [
    /"hls2"\s*:\s*"([^"]+)"/i,
    /"hls4"\s*:\s*"([^"]+)"/i,
    /"hls3"\s*:\s*"([^"]+)"/i,
    /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
    /sources\s*:\s*\[\s*\{[^}]*?file\s*:\s*["']([^"']+)["']/i,
    /file\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i,
  ];

  for (const regex of jsonKeyRegexes) {
    const match = combinedText.match(regex);
    if (match && match[1]) {
      const resolved = resolveCandidateUrl(match[1]);
      if (resolved) {
        const isMp4 = /\.mp4(\?|$)/i.test(resolved) && !/\.m3u8/i.test(resolved);
        return {
          streamUrl: resolved,
          type: isMp4 ? "mp4" : "hls",
          durationSeconds,
          posterUrl,
        };
      }
    }
  }

  // 2. Búsqueda general por Expresiones Regulares de enlaces .m3u8
  const m3u8Regex = /(https?:\/\/[^\s"'<>\\]+?\.m3u8[^\s"'<>\\]*)/gi;
  const m3u8Matches = combinedText.match(m3u8Regex);
  if (m3u8Matches && m3u8Matches.length > 0) {
    const resolved = resolveCandidateUrl(m3u8Matches[0]);
    if (resolved) {
      return {
        streamUrl: resolved,
        type: "hls",
        durationSeconds,
        posterUrl,
      };
    }
  }

  // 3. Búsqueda general por Expresiones Regulares de enlaces .mp4
  const mp4Regex = /(https?:\/\/[^\s"'<>\\]+?\.mp4[^\s"'<>\\]*)/gi;
  const mp4Matches = combinedText.match(mp4Regex);
  if (mp4Matches && mp4Matches.length > 0) {
    const validMp4 = mp4Matches.find(
      (u) => !/preroll|vast|adserver|banner|promo/i.test(u)
    );
    if (validMp4) {
      const resolved = resolveCandidateUrl(validMp4);
      if (resolved) {
        return {
          streamUrl: resolved,
          type: "mp4",
          durationSeconds,
          posterUrl,
        };
      }
    }
  }

  return null;
}

/**
 * PASO 2: Endpoint Extractor (/api/extractor?url=<EMBED_URL>)
 * Obtiene la URL cruda .m3u8 o .mp4 desde el embed original o desde un token de stream firmado.
 */
export async function GET(request: NextRequest) {
  const inputUrl = request.nextUrl.searchParams.get("url")?.trim() || "";

  if (!inputUrl) {
    return NextResponse.json(
      {
        success: false,
        fallbackUrl: "",
        reason: "Parámetro 'url' requerido.",
      },
      { status: 200 }
    );
  }

  let targetEmbedUrl = inputUrl;
  let fallbackIframeUrl = inputUrl;

  try {
    // Soportar URLs firmadas internas (/api/stream/[token]) desencriptando el token automáticamente
    if (
      inputUrl.startsWith("/api/stream/") ||
      inputUrl.includes("/api/stream/")
    ) {
      const afterPrefix = inputUrl.split("/api/stream/")[1] || "";
      const tokenPart = afterPrefix.split("?")[0].split("#")[0];
      if (tokenPart) {
        const decodedToken = decodeURIComponent(tokenPart);
        const payload = tokenCryptoService.decryptStreamToken(decodedToken);
        targetEmbedUrl = payload.rawUrl;
        fallbackIframeUrl = inputUrl;
      }
    }

    // Si el target es un contenedor Embed69, primero resolvemos el servidor de video subyacente
    if (targetEmbedUrl.includes("embed69.org/f/")) {
      const resolvedDirectEmbed =
        await resolveEmbed69OrPlayLatinToDirectEmbed(targetEmbedUrl);
      if (resolvedDirectEmbed) {
        targetEmbedUrl = resolvedDirectEmbed;
        if (!inputUrl.includes("/api/stream/")) {
          fallbackIframeUrl = resolvedDirectEmbed;
        }
      }
    }

    const parsedEmbed = new URL(targetEmbedUrl);
    const embedOrigin = parsedEmbed.origin;

    // 1. Si ya es un enlace directo .m3u8 o .mp4, devolverlo directamente como exitoso
    if (/\.m3u8(\?|$)/i.test(parsedEmbed.pathname)) {
      return NextResponse.json({
        success: true,
        streamUrl: targetEmbedUrl,
        type: "hls",
        referer: embedOrigin,
      });
    }

    if (/\.mp4(\?|$)/i.test(parsedEmbed.pathname)) {
      return NextResponse.json({
        success: true,
        streamUrl: targetEmbedUrl,
        type: "mp4",
        referer: embedOrigin,
      });
    }

    // Construimos la lista de endpoints candidatos a inspeccionar
    // (Para Streamwish hglink.to es un wrapper de redirección, mientras que audinifer.com / vibuxer.com contienen el packer con el .m3u8)
    const candidateFetchTargets: { fetchUrl: string; referer: string }[] = [];
    const codeMatch = targetEmbedUrl.match(/\/e\/([a-zA-Z0-9_-]+)/);
    const isStreamwishFamily =
      /hglink\.to|audinifer\.com|vibuxer\.com|hanerix\.com|streamwish|strwish|wishembed|awish|dwish|mwish|swdyu/i.test(
        targetEmbedUrl
      );

    if (isStreamwishFamily && codeMatch?.[1]) {
      const fileCode = codeMatch[1];
      candidateFetchTargets.push(
        {
          fetchUrl: `https://audinifer.com/e/${fileCode}`,
          referer: "https://hglink.to/",
        },
        {
          fetchUrl: `https://vibuxer.com/e/${fileCode}`,
          referer: "https://hglink.to/",
        }
      );
    }

    candidateFetchTargets.push({
      fetchUrl: targetEmbedUrl,
      referer: embedOrigin,
    });

    const probeTarget = async (target: {
      fetchUrl: string;
      referer: string;
    }) => {
      try {
        const res = await fetch(target.fetchUrl, {
          method: "GET",
          headers: {
            "User-Agent": BROWSER_USER_AGENT,
            Referer: target.referer,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(6000),
        });

        if (!res.ok) return null;

        const html = await res.text();
        const unpacked = unpackDeanEdwardsBlocks(html);
        const combinedText = `${html}\n${unpacked}`;
        const fetchOrigin = new URL(target.fetchUrl).origin;

        const extracted = extractStreamFromText(combinedText, fetchOrigin);
        if (!extracted) return null;

        return {
          ...extracted,
          referer: `${fetchOrigin}/`,
        };
      } catch {
        return null;
      }
    };

    const probeResults = await Promise.all(
      candidateFetchTargets.map((t) => probeTarget(t))
    );
    const hit = probeResults.find((r) => Boolean(r));

    if (hit) {
      return NextResponse.json({
        success: true,
        streamUrl: hit.streamUrl,
        type: hit.type,
        referer: hit.referer,
        durationSeconds: hit.durationSeconds,
        posterUrl: hit.posterUrl,
      });
    }

    return NextResponse.json(
      {
        success: false,
        fallbackUrl: fallbackIframeUrl,
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
        reason:
          error instanceof Error
            ? error.message
            : "Error al intentar extraer el stream.",
      },
      { status: 200 }
    );
  }
}

