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

    if (payload.rawUrl.includes("embed69.org/f/")) {
      const directStreamwishUrl = await resolveDirectStreamwishUrlFromEmbed69(
        payload.rawUrl
      );
      if (directStreamwishUrl) {
        finalEmbedUrl = directStreamwishUrl;
      } else {
        // Si no pudo extraer el enlace directo, limpiamos los query params internos para que el iframe cargue normal
        try {
          const parsed = new URL(payload.rawUrl);
          finalEmbedUrl = `${parsed.origin}${parsed.pathname}`;
        } catch {
          finalEmbedUrl = payload.rawUrl;
        }
      }
    }

    const targetIframeUrl = isTvMode
      ? appendAutoplayParam(finalEmbedUrl)
      : finalEmbedUrl;
    const escapedRawUrl = escapeHtmlAttribute(targetIframeUrl);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="referrer" content="origin" />
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
    iframe {
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
  <iframe
    src="${escapedRawUrl}"
    allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *"
    allowfullscreen
    webkitallowfullscreen="true"
    mozallowfullscreen="true"
    referrerpolicy="origin"
  ></iframe>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Referrer-Policy": "same-origin",
        "Permissions-Policy":
          "fullscreen=*, autoplay=*, picture-in-picture=*",
        "Content-Security-Policy":
          "default-src 'self' 'unsafe-inline' data: blob:; frame-src * data: blob:; frame-ancestors 'self'; form-action 'none';",
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
