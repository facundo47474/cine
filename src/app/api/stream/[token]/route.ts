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
  version?: string;
}

interface PlayLatinResolveResponse {
  sources?: PlayLatinSourceEntry[];
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
 * desde Embed69 para evitar cargar la interfaz intermedia de Embed69,
 * eliminando de raíz el mensaje "Este servidor tiene ventanas emergentes y anuncios."
 * y evitando cualquier bloqueo de pantalla negra.
 */
async function resolveDirectStreamwishUrlFromEmbed69(
  rawUrl: string
): Promise<string | null> {
  try {
    const parsedUrl = new URL(rawUrl);
    const requestedLang = (
      parsedUrl.searchParams.get("lang") || "LAT"
    ).toUpperCase();
    const cleanFetchUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;

    const res = await fetch(cleanFetchUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(4500),
    });

    if (!res.ok) return null;

    const html = await res.text();
    if (!html.includes("dataLink") || html.includes("No folders found")) {
      return null;
    }

    const challengeMatch = html.match(/POW_CHALLENGE\s*=\s*'([^']+)'/);
    const difficultyMatch = html.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
    const saltMatch = html.match(/POW_SALT\s*=\s*'([^']+)'/);

    if (!challengeMatch || !difficultyMatch || !saltMatch) {
      return null;
    }

    const aesKey = solveEmbed69AesKey(
      challengeMatch[1],
      Number(difficultyMatch[1]),
      saltMatch[1]
    );
    if (!aesKey) return null;

    const dataLinkMatch = html.match(
      /let\s+dataLink\s*=\s*(\[\{[\s\S]*?\}\])\s*;\s*let\s+currentLanguageServers/
    );
    if (!dataLinkMatch) return null;

    const dataLink = JSON.parse(dataLinkMatch[1]) as Embed69LanguageBlock[];
    if (!Array.isArray(dataLink) || dataLink.length === 0) {
      return null;
    }

    // Ordenamos para elegir primero el idioma solicitado por el usuario (LAT o SUB)
    dataLink.sort((a, b) => {
      const langA = (a.video_language || "").toUpperCase();
      const langB = (b.video_language || "").toUpperCase();
      const aMatches =
        langA === requestedLang ||
        (requestedLang === "SUB" && (langA === "SUB" || langA === "VOSE"));
      const bMatches =
        langB === requestedLang ||
        (requestedLang === "SUB" && (langB === "SUB" || langB === "VOSE"));
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return 0;
    });

    for (const block of dataLink) {
      if (!Array.isArray(block.sortedEmbeds) || block.sortedEmbeds.length === 0) {
        continue;
      }

      // Priorizamos siempre Streamwish sobre cualquier otro servidor (descartando voe/vidhide como primera opción)
      const orderedEmbeds = [...block.sortedEmbeds].sort(
        (a, b) =>
          getServerPriorityWeight(a.servername) -
          getServerPriorityWeight(b.servername)
      );

      for (const candidate of orderedEmbeds) {
        if (!candidate.link) continue;
        const decryptedUrl = decryptEmbed69Link(candidate.link, aesKey);
        if (decryptedUrl && decryptedUrl.startsWith("http")) {
          return decryptedUrl;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Si Streamwish a través de Embed69 falla (por caída de base de datos 500/502 en Embed69),
 * intenta resolver al vuelo un servidor secundario directo (Streamwish/Dropload/Filemoon)
 * para el mismo IMDb ID e idioma antes de disparar failover en el cliente.
 */
async function resolveFallbackFromPlayLatin(
  rawUrl: string
): Promise<string | null> {
  try {
    const imdbMatch = rawUrl.match(/(tt\d+)/i);
    if (!imdbMatch) return null;

    const imdbId = imdbMatch[1];
    const parsedUrl = new URL(rawUrl);
    const requestedLang = (
      parsedUrl.searchParams.get("lang") || "LAT"
    ).toUpperCase();

    const pageUrl = `https://playlatinsrc.co/custom/movie/${imdbId}`;
    const pageRes = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(3500),
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
        type: "movie",
        id: imdbId,
        season: "1",
        episode: "1",
        mode: "custom",
        token: tokenMatch[1],
      }),
      signal: AbortSignal.timeout(3500),
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
            (s.version || "").toLowerCase() === "castellano"))
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
      return score(a.server) - score(b.server);
    });

    return pool[0].url || null;
  } catch {
    return null;
  }
}

interface StreamwishDirectHlsInfo {
  hlsUrl: string;
  posterUrl: string;
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

  let payload = match[1].replace(/\\'/g, "'");
  const radix = Number(match[2]);
  const count = Number(match[3]);
  const symtab = match[4].split("|");

  if (!radix || !count || symtab.length === 0) return null;

  for (let i = count - 1; i >= 0; i--) {
    if (symtab[i]) {
      payload = payload.replace(
        new RegExp("\\b" + i.toString(radix) + "\\b", "g"),
        symtab[i]
      );
    }
  }
  return payload;
}

/**
 * Si el enlace pertenece a Streamwish (`hglink.to`, `audinifer.com`, `vibuxer.com`, `hanerix.com`),
 * extrae el stream HLS `.m3u8` directo (`hls2`) para permitir:
 * - Captura 100% automática del segundo exacto (`currentTime` y `seeked`) donde quedó el usuario.
 * - Reanudación automática en el segundo guardado (`startPosition`).
 * - Cero anuncios ni popups.
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

    for (const origin of mirrorOrigins) {
      try {
        const res = await fetch(`${origin}/e/${fileCode}`, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            Referer: "https://hglink.to/",
          },
          signal: AbortSignal.timeout(4000),
        });

        if (!res.ok) continue;

        const html = await res.text();
        const unpacked = unpackDeanEdwardsBlock(html);
        if (!unpacked) continue;

        const hls2Match = unpacked.match(/"hls2"\s*:\s*"([^"]+)"/);
        const posterMatch = unpacked.match(/image\s*:\s*"([^"]+)"/);

        if (hls2Match && hls2Match[1].startsWith("http")) {
          return {
            hlsUrl: hls2Match[1],
            posterUrl: posterMatch?.[1] || "",
          };
        }
      } catch {
        // Intentar siguiente mirror de Streamwish
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Endpoint Túnel de Reproducción (/api/stream/[token]).
 * - Valida sesión activa (o token firmado AES-256-GCM en modo receptor Smart TV `tv=1`),
 *   Rate Limiting por IP y protección Anti-Hotlinking compatible con proxies de Vercel.
 * - Si el mirror proviene de Embed69, extrae y desencripta directamente el enlace de Streamwish
 *   en el servidor para cargar el reproductor limpio al instante sin avisos ni pantallas intermedias.
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
      // 1. SIEMPRE intentamos iniciar primero extrayendo y desencriptando el servidor Streamwish directo
      const directStreamwishUrl = await resolveDirectStreamwishUrlFromEmbed69(
        payload.rawUrl
      );

      if (directStreamwishUrl) {
        finalEmbedUrl = directStreamwishUrl;
      } else {
        // 2. Recién si Streamwish (vía Embed69) falla o está caído (ej. HTTP 500 Too many connections / 502),
        // analizamos e intentamos resolver un servidor secundario directo al vuelo (Dropload / Streamwish mirror)
        const fallbackDirectUrl = await resolveFallbackFromPlayLatin(
          payload.rawUrl
        );

        if (fallbackDirectUrl) {
          finalEmbedUrl = fallbackDirectUrl;
          isSecondaryServer = true;
        } else {
          // 3. Si tampoco hay fuente secundaria para ese IMDb ID, jamás renderizamos el iframe caído de Embed69
          // (evitando la pantalla negra) y notificamos al reproductor padre para saltar al siguiente mirror en <50ms.
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

    const streamwishHls = !isSecondaryServer
      ? await extractStreamwishDirectHls(finalEmbedUrl)
      : null;

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
      var fallbackIframeUrl = ${JSON.stringify(targetIframeUrl)};
      var startSec = ${resumeSeconds};
      var switchedToIframe = false;

      function switchToEmbedIframe() {
        if (switchedToIframe || !root) return;
        switchedToIframe = true;
        root.innerHTML = '<iframe src="' + fallbackIframeUrl.replace(/"/g, "&quot;") + '" allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *" allowfullscreen webkitallowfullscreen="true" mozallowfullscreen="true" referrerpolicy="origin"></iframe>';
      }

      function reportTime() {
        if (!video || switchedToIframe) return;
        var ct = Math.floor(video.currentTime || 0);
        var dur = Math.floor(video.duration || 0);
        if (ct > 0) {
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

      video.addEventListener("timeupdate", reportTime);
      video.addEventListener("seeked", reportTime);
      video.addEventListener("pause", reportTime);

      if (window.Hls && window.Hls.isSupported()) {
        var hls = new window.Hls({
          enableWorker: true,
          startPosition: startSec > 5 ? startSec : -1
        });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.ERROR, function(_ev, data) {
          if (data && data.fatal) {
            hls.destroy();
            switchToEmbedIframe();
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsUrl;
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
        "Referrer-Policy": streamwishHls ? "no-referrer" : "same-origin",
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
