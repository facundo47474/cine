import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { tokenCryptoService } from "@/infrastructure/container";
import {
  InvalidTokenError,
  TokenExpiredError,
} from "@/application/services/TokenCryptoService";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { authOptions } from "@/infrastructure/auth/authOptions";
import {
  apiRateLimiter,
  getClientIp,
} from "@/infrastructure/security/RateLimiter";

export const dynamic = "force-dynamic";

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

interface Embed69ResolutionResult {
  url: string | null;
  status: "RESOLVED" | "NOT_FOUND" | "BLOCKED_OR_ERROR";
  cleanEmbedUrl: string;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function appendAutoplayParam(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.searchParams.has("autoplay")) {
      parsed.searchParams.set("autoplay", "1");
    } else if (parsed.searchParams.get("autoplay") === "false") {
      parsed.searchParams.set("autoplay", "1");
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function appendResumeTimeParam(rawUrl: string, startSeconds: number): string {
  if (!startSeconds || startSeconds <= 5) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const sec = Math.floor(startSeconds);
    if (!parsed.hash) {
      parsed.hash = `t=${sec}`;
    }
    return parsed.toString();
  } catch {
    return rawUrl;
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

function solveEmbed69AesKey(
  challenge: string,
  difficulty: number,
  salt: string
): Buffer | null {
  try {
    const safeDifficulty = Math.min(Math.max(1, difficulty), 5);
    const prefix = "0".repeat(safeDifficulty);
    const maxIterations = 500_000;

    for (let nonce = 0; nonce < maxIterations; nonce++) {
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

/**
 * Extrae y desencripta directamente en el servidor el enlace de Streamwish
 * desde Embed69, distinguiendo si un título no existe ("NOT_FOUND") vs si Cloudflare
 * bloqueó la IP del datacenter de Vercel ("BLOCKED_OR_ERROR").
 */
async function resolveDirectStreamwishUrlFromEmbed69(
  rawUrl: string
): Promise<Embed69ResolutionResult> {
  let cleanEmbedUrl = rawUrl;
  try {
    const parsedUrl = new URL(rawUrl);
    const requestedLang = (
      parsedUrl.searchParams.get("lang") || "LAT"
    ).toUpperCase();
    const baseCleanUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
    cleanEmbedUrl = baseCleanUrl;

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
      if (altUrl !== baseCleanUrl) {
        candidateUrls.push(altUrl);
      }
    }

    const fetchCandidate = async (
      fetchUrl: string
    ): Promise<{
      html: string | null;
      notFound: boolean;
      blockedOrError: boolean;
      resolvedUrl: string;
    }> => {
      try {
        const res = await fetch(fetchUrl, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(2500),
        });

        if (res.status === 404) {
          return {
            html: null,
            notFound: true,
            blockedOrError: false,
            resolvedUrl: fetchUrl,
          };
        }

        if (!res.ok) {
          return {
            html: null,
            notFound: false,
            blockedOrError: true,
            resolvedUrl: fetchUrl,
          };
        }

        const text = await res.text();
        if (text.includes("No folders found") || !text.includes("dataLink")) {
          return {
            html: null,
            notFound: true,
            blockedOrError: false,
            resolvedUrl: fetchUrl,
          };
        }

        return {
          html: text,
          notFound: false,
          blockedOrError: false,
          resolvedUrl: fetchUrl,
        };
      } catch {
        return {
          html: null,
          notFound: false,
          blockedOrError: true,
          resolvedUrl: fetchUrl,
        };
      }
    };

    const results = await Promise.all(
      candidateUrls.map((u) => fetchCandidate(u))
    );
    const validHit = results.find((r) => Boolean(r.html));

    if (!validHit || !validHit.html) {
      const anyBlocked = results.some((r) => r.blockedOrError);
      return {
        url: null,
        status: anyBlocked ? "BLOCKED_OR_ERROR" : "NOT_FOUND",
        cleanEmbedUrl,
      };
    }

    cleanEmbedUrl = validHit.resolvedUrl;
    const html = validHit.html;

    const challengeMatch = html.match(/POW_CHALLENGE\s*=\s*'([^']+)'/);
    const difficultyMatch = html.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
    const saltMatch = html.match(/POW_SALT\s*=\s*'([^']+)'/);

    if (!challengeMatch || !difficultyMatch || !saltMatch) {
      return { url: null, status: "BLOCKED_OR_ERROR", cleanEmbedUrl };
    }

    const aesKey = solveEmbed69AesKey(
      challengeMatch[1],
      Number(difficultyMatch[1]),
      saltMatch[1]
    );
    if (!aesKey) {
      return { url: null, status: "BLOCKED_OR_ERROR", cleanEmbedUrl };
    }

    const dataLinkMatch = html.match(
      /let\s+dataLink\s*=\s*(\[\{[\s\S]*?\}\])\s*;\s*let\s+currentLanguageServers/
    );
    if (!dataLinkMatch) {
      return { url: null, status: "NOT_FOUND", cleanEmbedUrl };
    }

    const dataLink = JSON.parse(dataLinkMatch[1]) as Embed69LanguageBlock[];
    if (!Array.isArray(dataLink) || dataLink.length === 0) {
      return { url: null, status: "NOT_FOUND", cleanEmbedUrl };
    }

    // Ordenamos para elegir primero el idioma solicitado por el usuario (LAT -> ESP -> SUB)
    dataLink.sort((a, b) => {
      const getLangRank = (langRaw?: string) => {
        const lang = (langRaw || "").toUpperCase();
        if (requestedLang === "SUB") {
          if (lang === "SUB" || lang === "VOSE") return 1;
          if (lang === "LAT" || lang === "LATINO") return 2;
          if (lang === "ESP" || lang === "CASTELLANO") return 3;
          return 4;
        }
        if (lang === "LAT" || lang === "LATINO") return 1;
        if (lang === "ESP" || lang === "CASTELLANO") return 2;
        if (lang === "SUB" || lang === "VOSE") return 3;
        return 4;
      };
      return getLangRank(a.video_language) - getLangRank(b.video_language);
    });

    for (const block of dataLink) {
      if (
        !Array.isArray(block.sortedEmbeds) ||
        block.sortedEmbeds.length === 0
      ) {
        continue;
      }

      const orderedEmbeds = [...block.sortedEmbeds].sort(
        (a, b) =>
          getServerPriorityWeight(a.servername) -
          getServerPriorityWeight(b.servername)
      );

      for (const candidate of orderedEmbeds) {
        if (!candidate.link) continue;
        const decryptedUrl = decryptEmbed69Link(candidate.link, aesKey);
        if (decryptedUrl && decryptedUrl.startsWith("http")) {
          return {
            url: decryptedUrl,
            status: "RESOLVED",
            cleanEmbedUrl,
          };
        }
      }
    }

    return { url: null, status: "NOT_FOUND", cleanEmbedUrl };
  } catch {
    return { url: null, status: "BLOCKED_OR_ERROR", cleanEmbedUrl };
  }
}

/**
 * Si Streamwish a través de Embed69 falla o está bloqueado por IP en Vercel,
 * intenta resolver al vuelo un servidor secundario directo (Streamwish/Dropload/Filemoon)
 * para el mismo IMDb ID e idioma.
 */
async function resolveFallbackFromPlayLatin(
  rawUrl: string
): Promise<string | null> {
  try {
    const tvMatch = rawUrl.match(/(tt\d+)-(\d+)x(\d+)/i);
    const movieMatch = rawUrl.match(/(tt\d+)/i);
    if (!tvMatch && !movieMatch) return null;

    const isTv = Boolean(tvMatch);
    const imdbId = tvMatch ? tvMatch[1] : movieMatch![1];
    const seasonStr = tvMatch ? String(Number(tvMatch[2])) : "1";
    const episodeStr = tvMatch ? String(Number(tvMatch[3])) : "1";

    const parsedUrl = new URL(rawUrl);
    const requestedLang = (
      parsedUrl.searchParams.get("lang") || "LAT"
    ).toUpperCase();

    const pageUrl = isTv
      ? `https://playlatinsrc.co/custom/serial/${imdbId}/${seasonStr}/${episodeStr}`
      : `https://playlatinsrc.co/custom/movie/${imdbId}`;
    const pageRes = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(2500),
    });

    if (!pageRes.ok) return null;

    const html = await pageRes.text();
    const tokenMatch = html.match(/data-resolve-token="([^"]+)"/);
    if (!tokenMatch) return null;

    const resolveRes = await fetch("https://playlatinsrc.co/api/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: pageUrl,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        type: isTv ? "tv" : "movie",
        id: imdbId,
        season: seasonStr,
        episode: episodeStr,
        mode: "custom",
        token: tokenMatch[1],
      }),
      signal: AbortSignal.timeout(2500),
    });

    if (!resolveRes.ok) return null;

    const data = (await resolveRes.json()) as PlayLatinResolveResponse;
    const sources = Array.isArray(data.sources) ? data.sources : [];
    if (sources.length === 0) return null;

    const targetVersion =
      requestedLang === "SUB" || requestedLang === "VOSE"
        ? "subtitulado"
        : "latino";

    const candidates = sources.filter(
      (s) =>
        Boolean(s.url && s.url.startsWith("http")) &&
        ((s.version || "").toLowerCase() === targetVersion ||
          (targetVersion === "latino" &&
            ((s.version || "").toLowerCase() === "castellano" ||
              (isTv && !s.version))))
    );

    const pool =
      candidates.length > 0
        ? candidates
        : sources.filter((s) => Boolean(s.url && s.url.startsWith("http")));

    if (pool.length === 0) return null;

    pool.sort((a, b) => {
      const score = (srv?: string) => {
        const name = (srv || "").toLowerCase();
        if (name.includes("streamwish")) return 1;
        if (name.includes("dropload")) return 2;
        if (name.includes("filemoon")) return 3;
        if (name.includes("doodstream")) return 4;
        return 5;
      };
      return score(a.server || a.name) - score(b.server || b.name);
    });

    return pool[0].url || null;
  } catch {
    return null;
  }
}

interface StreamwishDirectHlsInfo {
  hlsUrl: string;
  inlineM3u8?: string;
  posterUrl: string;
  durationSeconds?: number;
}

/**
 * Desempaqueta bloques obfuscados con Dean Edwards Packer (`eval(function(p,a,c,k,e,d)...)`)
 * de forma segura en memoria sin utilizar `eval`.
 */
function unpackDeanEdwardsBlock(html: string): string | null {
  const packerRegex =
    /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)\)\)/;
  const match = html.match(packerRegex);
  if (!match) return null;

  const payload = match[1].replace(/\\'/g, "'");
  const radix = Number(match[2]);
  const count = Number(match[3]);
  const symtab = match[4].split("|");

  if (!radix || !count || symtab.length === 0) return null;

  const lookup = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (symtab[i]) {
      lookup.set(i.toString(radix), symtab[i]);
    }
  }

  return payload.replace(/\b[0-9a-zA-Z]+\b/g, (word) => {
    return lookup.get(word) ?? word;
  });
}

/**
 * Si el enlace pertenece a Streamwish (`hglink.to`, `audinifer.com`, `vibuxer.com`, `hanerix.com`),
 * extrae el stream HLS `.m3u8` directo (`hls4` / `hls2`).
 */
async function extractStreamwishDirectHls(
  embedUrl: string
): Promise<StreamwishDirectHlsInfo | null> {
  try {
    const codeMatch = embedUrl.match(/\/e\/([a-zA-Z0-9_-]+)/);
    if (!codeMatch) return null;

    const isStreamwishHost =
      /hglink\.to|audinifer\.com|vibuxer\.com|hanerix\.com|streamwish|strwish|wishembed|awish|dwish|mwish|swdyu/i.test(
        embedUrl
      );
    if (!isStreamwishHost) return null;

    const fileCode = codeMatch[1];
    const mirrorOrigins = ["https://audinifer.com", "https://vibuxer.com"];

    const probeOrigin = async (
      origin: string
    ): Promise<{ origin: string; unpacked: string } | null> => {
      try {
        const res = await fetch(`${origin}/e/${fileCode}`, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            Referer: "https://hglink.to/",
          },
          signal: AbortSignal.timeout(2500),
        });
        if (!res.ok) return null;
        const html = await res.text();
        const unpacked = unpackDeanEdwardsBlock(html);
        if (!unpacked) return null;
        return { origin, unpacked };
      } catch {
        return null;
      }
    };

    const originResults = await Promise.all(
      mirrorOrigins.map((o) => probeOrigin(o))
    );
    const hit = originResults.find(
      (r): r is { origin: string; unpacked: string } => Boolean(r)
    );
    if (!hit) return null;

    const { origin, unpacked } = hit;
    const hls4Match = unpacked.match(/"hls4"\s*:\s*"([^"]+)"/);
    const hls2Match = unpacked.match(/"hls2"\s*:\s*"([^"]+)"/);
    const posterMatch = unpacked.match(/image\s*:\s*"([^"]+)"/);
    const durationMatch = unpacked.match(/duration\s*:\s*"([0-9.]+)"/);
    const durationSeconds = durationMatch
      ? Math.floor(Number(durationMatch[1]) || 0)
      : undefined;
    const posterUrl = posterMatch?.[1] || "";

    if (hls4Match && hls4Match[1]) {
      try {
        const masterUrl = hls4Match[1].startsWith("http")
          ? hls4Match[1]
          : `${origin}${hls4Match[1]}`;

        const masterRes = await fetch(masterUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            Referer: `${origin}/e/${fileCode}`,
          },
          signal: AbortSignal.timeout(2500),
        });

        if (masterRes.ok) {
          const masterText = await masterRes.text();
          const variantLines = masterText
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => Boolean(l) && !l.startsWith("#"));

          if (variantLines.length > 0) {
            const chosenVariant = variantLines[variantLines.length - 1];
            const variantUrl = new URL(chosenVariant, masterUrl).toString();

            const variantRes = await fetch(variantUrl, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                Referer: `${origin}/e/${fileCode}`,
              },
              signal: AbortSignal.timeout(2500),
            });

            if (variantRes.ok) {
              const rawVariantM3u8 = await variantRes.text();
              if (rawVariantM3u8.includes("#EXTM3U")) {
                const normalizedM3u8 = rawVariantM3u8
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
                  inlineM3u8: normalizedM3u8,
                  posterUrl,
                  durationSeconds,
                };
              }
            }
          }
        }
      } catch {
        // Si falla la extracción de hls4, continuamos al respaldo hls2
      }
    }

    if (hls2Match && hls2Match[1].startsWith("http")) {
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

/**
 * Endpoint Túnel de Reproducción (/api/stream/[token]).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const isTvMode = request.nextUrl.searchParams.get("tv") === "1";

    const clientIp = getClientIp(request);
    const rateLimit = apiRateLimiter.checkLimit(
      `stream:${clientIp}`,
      60,
      60_000
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Demasiadas solicitudes de reproducción. Intenta en un minuto.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const rawToken = decodeURIComponent(params.token);
    const payload = tokenCryptoService.decryptStreamToken(rawToken);

    if (!isTvMode) {
      const session = await getServerSession(authOptions);
      if (!session?.user) {
        return NextResponse.json(
          {
            ok: false,
            error: "No autorizado. Inicia sesión para reproducir.",
          },
          { status: 401 }
        );
      }
    }

    const secFetchSite = request.headers.get("sec-fetch-site");
    if (secFetchSite === "cross-site" && !isTvMode) {
      return NextResponse.json(
        {
          ok: false,
          error: "Acceso externo no permitido (Anti-Hotlinking).",
        },
        { status: 403 }
      );
    }

    const referer = request.headers.get("referer");
    if (referer) {
      try {
        const refererHost = new URL(referer).host.toLowerCase();
        const allowedHosts = new Set(
          [
            request.nextUrl.host,
            request.headers.get("x-forwarded-host"),
            request.headers.get("host"),
          ]
            .filter((h): h is string => Boolean(h))
            .map((h) => h.split(",")[0].trim().toLowerCase())
        );

        if (allowedHosts.size > 0 && !allowedHosts.has(refererHost)) {
          return NextResponse.json(
            {
              ok: false,
              error: "Acceso externo no permitido (Anti-Hotlinking).",
            },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { ok: false, error: "Cabecera Referer inválida." },
          { status: 403 }
        );
      }
    }

    if (payload.format !== MirrorFormat.EMBED) {
      const response = NextResponse.redirect(payload.rawUrl, { status: 302 });
      response.headers.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
      );
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }

    let finalEmbedUrl = payload.rawUrl;
    let isSecondaryServer = false;

    if (payload.rawUrl.includes("embed69.org/f/")) {
      // 1. Intentamos iniciar extrayendo y desencriptando el servidor Streamwish directo
      const embed69Result = await resolveDirectStreamwishUrlFromEmbed69(
        payload.rawUrl
      );

      if (embed69Result.url) {
        finalEmbedUrl = embed69Result.url;
      } else {
        // 2. Si Streamwish (vía Embed69) falla o está bloqueado por IP en Vercel,
        // intentamos resolver un servidor secundario directo al vuelo (Dropload / PlayLatinSrc)
        const fallbackDirectUrl = await resolveFallbackFromPlayLatin(
          payload.rawUrl
        );

        if (fallbackDirectUrl) {
          finalEmbedUrl = fallbackDirectUrl;
          isSecondaryServer = true;
        } else if (embed69Result.status === "NOT_FOUND") {
          // 3A. Si Embed69 respondió explícitamente que el archivo no existe ("No folders found" / 404),
          // notificamos al reproductor padre para saltar inmediatamente al siguiente mirror disponible.
          const failHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><style>html,body{background:#000;margin:0;}</style></head>
<body>
<script>
  try {
    window.parent.postMessage(
      { type: "PILOTO_STREAM_ERROR", mirrorId: ${JSON.stringify(payload.mirrorId)} },
      "*"
    );
  } catch (e) {}
</script>
</body>
</html>`;
          return new NextResponse(failHtml, {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          });
        } else {
          // 3B. Si la extracción server-side fue bloqueada por Cloudflare en la IP AWS de Vercel (403/timeout),
          // renderizamos la URL limpia en el navegador del usuario (IP residencial) donde sí reproduce en Español Latino.
          finalEmbedUrl = embed69Result.cleanEmbedUrl;
        }
      }
    }

    const resumeSeconds = Math.max(
      0,
      Math.floor(Number(request.nextUrl.searchParams.get("t") || "0") || 0)
    );
    const urlWithResume = appendResumeTimeParam(finalEmbedUrl, resumeSeconds);
    const targetIframeUrl = isTvMode
      ? appendAutoplayParam(urlWithResume)
      : urlWithResume;
    const escapedRawUrl = escapeHtmlAttribute(targetIframeUrl);

    const streamwishHls = await extractStreamwishDirectHls(finalEmbedUrl);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="referrer" content="${streamwishHls ? "no-referrer" : "origin"}" />
  ${
    streamwishHls
      ? '<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>'
      : ""
  }
  <style>
    html, body {
      background: #000;
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      ${isTvMode ? "cursor: none;" : ""}
    }
    iframe, video {
      width: 100vw;
      height: 100vh;
      border: 0;
      display: block;
      background: #000;
      ${isTvMode ? "cursor: none;" : ""}
    }
  </style>
  <script>
    (function() {
      try {
        Object.defineProperty(window, "open", {
          value: function() { return null; },
          writable: false,
          configurable: false
        });
      } catch (e) {
        window.open = function() { return null; };
      }
      window.onbeforeunload = null;
      window.addEventListener("blur", function() {
        setTimeout(function() {
          try { window.focus(); } catch (e) {}
        }, 50);
      });
      window.addEventListener("message", function(event) {
        try {
          if (event.source && event.source !== window && event.source !== window.parent) {
            window.parent.postMessage(event.data, "*");
          }
        } catch (e) {}
      });
      ${
        isSecondaryServer
          ? `
      try {
        window.parent.postMessage(
          { type: "PILOTO_SECONDARY_SERVER_ACTIVE", mirrorId: ${JSON.stringify(payload.mirrorId)} },
          "*"
        );
      } catch (e) {}`
          : ""
      }
      ${
        isTvMode
          ? `
      window.addEventListener("DOMContentLoaded", function() {
        try {
          window.focus();
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(function() {});
          }
        } catch (e) {}
      });`
          : ""
      }
    })();
  </script>
</head>
<body>
  ${
    streamwishHls
      ? `
  <div id="playerRoot" style="width:100vw;height:100vh;background:#000;">
    <video
      id="pilotoVideo"
      controls
      playsinline
      x-webkit-airplay="allow"
      poster="${escapeHtmlAttribute(streamwishHls.posterUrl)}"
    ></video>
  </div>
  <script>
    (function() {
      var video = document.getElementById("pilotoVideo");
      var root = document.getElementById("playerRoot");
      var hlsUrl = ${JSON.stringify(streamwishHls.hlsUrl)};
      var inlineM3u8 = ${JSON.stringify(streamwishHls.inlineM3u8 || "")};
      var knownDurationSec = ${JSON.stringify(streamwishHls.durationSeconds || 0)};
      var fallbackIframeUrl = ${JSON.stringify(targetIframeUrl)};
      var startSec = ${resumeSeconds};
      var switchedToIframe = false;

      var activeHlsSource = hlsUrl;
      if (inlineM3u8) {
        try {
          var m3u8Blob = new Blob([inlineM3u8], { type: "application/vnd.apple.mpegurl" });
          activeHlsSource = URL.createObjectURL(m3u8Blob);
        } catch (e) {}
      }

      function switchToEmbedIframe() {
        if (switchedToIframe || !root) return;
        switchedToIframe = true;
        root.innerHTML = '<iframe src="' + fallbackIframeUrl.replace(/"/g, "&quot;") + '" allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *" allowfullscreen webkitallowfullscreen="true" mozallowfullscreen="true" referrerpolicy="origin"></iframe>';
      }

      function reportTime() {
        if (!video || switchedToIframe) return;
        var ct = Math.floor(video.currentTime || 0);
        var dur = Math.floor(video.duration || knownDurationSec || 0);
        if (ct > 0 || dur > 60) {
          try {
            window.parent.postMessage(
              {
                type: "PILOTO_TIME_UPDATE",
                currentTime: ct,
                duration: dur > 60 ? dur : undefined
              },
              "*"
            );
          } catch (e) {}
        }
      }

      if (knownDurationSec > 60) {
        try {
          window.parent.postMessage(
            {
              type: "PILOTO_TIME_UPDATE",
              currentTime: startSec > 0 ? startSec : 0,
              duration: knownDurationSec
            },
            "*"
          );
        } catch (e) {}
      }

      video.addEventListener("loadedmetadata", reportTime);
      video.addEventListener("timeupdate", reportTime);
      video.addEventListener("seeked", reportTime);
      video.addEventListener("pause", reportTime);

      window.addEventListener("message", function(event) {
        try {
          if (
            event.data &&
            event.data.type === "PILOTO_SEEK" &&
            typeof event.data.time === "number" &&
            video &&
            !switchedToIframe
          ) {
            video.currentTime = event.data.time;
          } else if (
            event.data &&
            event.data.type === "PILOTO_TRIGGER_REMOTE_PLAYBACK" &&
            video &&
            !switchedToIframe
          ) {
            if (typeof video.webkitShowPlaybackTargetPicker === "function") {
              video.webkitShowPlaybackTargetPicker();
            } else if (video.remote && typeof video.remote.prompt === "function") {
              video.remote.prompt().catch(function() {});
            }
          }
        } catch (e) {}
      });

      if (window.Hls && window.Hls.isSupported()) {
        var hls = new window.Hls({
          enableWorker: true,
          startPosition: startSec > 5 ? startSec : -1
        });
        hls.loadSource(activeHlsSource);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.ERROR, function(_ev, data) {
          if (data && data.fatal) {
            hls.destroy();
            switchToEmbedIframe();
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = activeHlsSource;
        video.addEventListener("loadedmetadata", function() {
          if (startSec > 5) {
            video.currentTime = startSec;
          }
        });
        video.addEventListener("error", switchToEmbedIframe);
      } else {
        switchToEmbedIframe();
      }
    })();
  </script>`
      : `
  <iframe
    src="${escapedRawUrl}"
    allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *"
    allowfullscreen
    webkitallowfullscreen="true"
    mozallowfullscreen="true"
    referrerpolicy="origin"
  ></iframe>`
  }
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Referrer-Policy": streamwishHls ? "no-referrer" : "strict-origin-when-cross-origin",
        "Permissions-Policy":
          "fullscreen=*, autoplay=*, picture-in-picture=*",
        "Content-Security-Policy":
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src * data: blob:; frame-ancestors 'self'; form-action 'none';",
      },
    });
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return NextResponse.json(
        {
          ok: false,
          error: "El enlace temporal de reproducción ha expirado.",
        },
        { status: 410 }
      );
    }
    if (error instanceof InvalidTokenError) {
      return NextResponse.json(
        { ok: false, error: "Token de reproducción inválido." },
        { status: 401 }
      );
    }

    console.error("[GET /api/stream/[token]] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error al resolver el stream." },
      { status: 500 }
    );
  }
}
