import dns from "dns";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { tokenCryptoService } from "@/infrastructure/container";
import { prisma } from "@/infrastructure/database/prismaClient";
import {
  InvalidTokenError,
  TokenExpiredError,
} from "@/application/services/TokenCryptoService";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { authOptions } from "@/infrastructure/auth/authOptions";
import { prismaMembershipRepository } from "@/infrastructure/repositories/PrismaMembershipRepository";
import { getStreamProxyBaseUrl } from "@/config/streamProxy";
import {
  apiRateLimiter,
  getClientIp,
} from "@/infrastructure/security/RateLimiter";
import {
  PLUS_STRICT_IFRAME_SANDBOX,
  getPlusCleanEmbedUrl,
  isBrokenOrLegacyContingencyUrl,
  isSandboxCompatibleEmbedUrl,
} from "@/domain/utils/contingencyMirrors";
import {
  FALLBACK_IF_EMPTY,
  STRICT_STREAMWISH_ONLY,
  isExtractableCleanHost,
  isMultiEmbedAggregatorUrl,
  isStreamwish,
  isStreamwishUrl,
  normalizeStreamwishEmbedUrl,
} from "@/domain/utils/streamwishMatcher";
import { resolveBestEmbedFromEmbed69Url } from "@/infrastructure/providers/Embed69Decoder";
import { resolveBestEmbedFromPlayLatinByUrl } from "@/infrastructure/providers/PlayLatinClient";
import {
  DirectHlsStreamInfo,
  extractDirectHlsFromStreamwishEmbed,
} from "@/infrastructure/providers/StreamManifestExtractor";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Silencioso en entornos donde no aplique
}

export const dynamic = "force-dynamic";

/**
 * Escapa caracteres especiales para su inserción segura en atributos HTML.
 *
 * @param value Cadena original.
 * @returns Cadena con entidades HTML escapadas.
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Añade el parámetro `autoplay=1` a una URL para pantallas Smart TV.
 *
 * @param rawUrl URL destino.
 * @returns URL con `autoplay=1`.
 */
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

/**
 * Añade el fragmento `#t={seconds}` a una URL de embed si existe un punto de reanudación mayor a 5 segundos.
 *
 * @param rawUrl URL destino.
 * @param startSeconds Segundo de inicio.
 * @returns URL con el hash temporal de reanudación.
 */
function appendResumeTimeParam(rawUrl: string, startSeconds: number): string {
  if (!startSeconds || startSeconds <= 5) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const roundedSeconds = Math.floor(startSeconds);
    if (!parsed.hash) {
      parsed.hash = `t=${roundedSeconds}`;
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Valida que la cabecera `Referer` (si está presente) provenga del mismo host de la aplicación
 * para bloquear intentos de hotlinking desde sitios externos.
 *
 * @param request Petición `NextRequest` entrante.
 * @returns `true` si el origen es válido; `false` si debe bloquearse.
 */
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

function isRefererHostAllowed(request: NextRequest): boolean {
  const referer = request.headers.get("referer");
  if (!referer) return true;

  try {
    const refererHost = new URL(referer).host.toLowerCase();
    const allowedHosts = new Set(
      [
        request.nextUrl.host,
        request.headers.get("x-forwarded-host"),
        request.headers.get("host"),
      ]
        .filter((host): host is string => Boolean(host))
        .map((host) => host.split(",")[0].trim().toLowerCase())
    );

    return allowedHosts.size === 0 || allowedHosts.has(refererHost);
  } catch {
    return false;
  }
}

/**
 * Construye una respuesta HTML mínima que notifica a la ventana padre (`SmartVideoPlayer`)
 * que el mirror actual falló (`PILOTO_STREAM_ERROR`) para activar el failover inmediato.
 *
 * @param mirrorId Identificador del mirror que falló.
 * @returns Respuesta `NextResponse` con el script de notificación.
 */
function buildStreamErrorHtmlResponse(mirrorId: string): NextResponse {
  const failHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><style>html,body{background:#000;margin:0;}</style></head>
<body>
<script>
  try {
    window.parent.postMessage(
      { type: "PILOTO_STREAM_ERROR", mirrorId: ${JSON.stringify(mirrorId)} },
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

/**
 * Construye el documento HTML del túnel de reproducción (`/api/stream/[token]`),
 * renderizando el reproductor nativo `<video id="pilotoVideo">` con `hls.js` cuando se extrajo
 * el manifiesto HLS directo, o un `<iframe>` blindado contra popups en caso contrario.
 */
function buildStreamTunnelPlayerHtml(params: {
  mirrorId: string;
  targetIframeUrl: string;
  escapedRawUrl: string;
  plusSafeFallbackUrl?: string | null;
  isTvMode: boolean;
  isSecondaryServer: boolean;
  isDirtyIframe: boolean;
  shieldProtectionEnabled: boolean;
  resumeSeconds: number;
  streamwishHls: DirectHlsStreamInfo | null;
}): string {
  const {
    mirrorId,
    targetIframeUrl,
    escapedRawUrl,
    plusSafeFallbackUrl,
    isTvMode,
    isSecondaryServer,
    shieldProtectionEnabled,
    resumeSeconds,
    streamwishHls,
  } = params;

  const sandboxAttribute =
    shieldProtectionEnabled && isSandboxCompatibleEmbedUrl(targetIframeUrl)
      ? `sandbox="${PLUS_STRICT_IFRAME_SANDBOX}"`
      : "";

  const resolvedNativeFallbackUrl =
    shieldProtectionEnabled && plusSafeFallbackUrl
      ? plusSafeFallbackUrl
      : targetIframeUrl;
  const resolvedNativeFallbackSandbox =
    shieldProtectionEnabled &&
    isSandboxCompatibleEmbedUrl(resolvedNativeFallbackUrl)
      ? `sandbox="${PLUS_STRICT_IFRAME_SANDBOX}"`
      : "";

  const streamwishReferer = (() => {
    try {
      return `${new URL(targetIframeUrl).origin}/`;
    } catch {
      return targetIframeUrl;
    }
  })();

  return `<!DOCTYPE html>
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
      ${
        shieldProtectionEnabled
          ? `
      try {
        Object.defineProperty(window, "open", {
          value: function() { return null; },
          writable: false,
          configurable: false
        });
      } catch (e) {
        window.open = function() { return null; };
      }`
          : ""
      }
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
          { type: "PILOTO_SECONDARY_SERVER_ACTIVE", mirrorId: ${JSON.stringify(
            mirrorId
          )}, isDirty: true },
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
      var knownDurationSec = ${JSON.stringify(
        streamwishHls.durationSeconds || 0
      )};
      var fallbackIframeUrl = ${JSON.stringify(resolvedNativeFallbackUrl)};
      var fallbackSandboxAttr = ${JSON.stringify(resolvedNativeFallbackSandbox)};
      var startSec = ${resumeSeconds};
      var switchedToIframe = false;
      var streamRefererValue = ${JSON.stringify(streamwishReferer)};
      var streamProxyBase = ${JSON.stringify(getStreamProxyBaseUrl())};

      var activeHlsSource =
        streamProxyBase +
        "?url=" +
        encodeURIComponent(hlsUrl) +
        "&referer=" +
        encodeURIComponent(streamRefererValue);

      if (inlineM3u8 && window.Blob && window.URL && window.URL.createObjectURL) {
        try {
          activeHlsSource = window.URL.createObjectURL(
            new window.Blob([inlineM3u8], {
              type: "application/vnd.apple.mpegurl"
            })
          );
        } catch (e) {}
      }

      function switchToEmbedIframe() {
        if (switchedToIframe || !root) return;
        switchedToIframe = true;
        var sbxAttr = fallbackSandboxAttr ? (" " + fallbackSandboxAttr) : "";
        root.innerHTML = '<iframe src="' + fallbackIframeUrl.replace(/"/g, "&quot;") + '"' + sbxAttr + ' allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *" allowfullscreen webkitallowfullscreen="true" mozallowfullscreen="true" referrerpolicy="origin"></iframe>';
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

      // Expone el stream HLS/MP4 directo al padre para Cast/AirPlay exclusivo del reproductor
      try {
        var mirrorIdValue = ${JSON.stringify(mirrorId)};
        var streamRefererValue = ${JSON.stringify(streamwishReferer)};
        var posterUrlValue = ${JSON.stringify(streamwishHls.posterUrl || "")};
        var proxiedStreamUrl =
          streamProxyBase +
          "?url=" +
          encodeURIComponent(hlsUrl) +
          "&referer=" +
          encodeURIComponent(streamRefererValue);

        var streamTypeValue = ${JSON.stringify(
          /\.mp4(\?|$)/i.test(streamwishHls.hlsUrl) ? "mp4" : "hls"
        )};

        window.parent.postMessage(
          {
            type: "PILOTO_NATIVE_HLS_READY",
            mirrorId: mirrorIdValue,
            streamUrl: hlsUrl,
            proxiedUrl: proxiedStreamUrl,
            streamType: streamTypeValue,
            referer: streamRefererValue,
            posterUrl: posterUrlValue || undefined,
            durationSeconds: knownDurationSec > 0 ? knownDurationSec : undefined
          },
          "*"
        );
      } catch (e) {}

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
          manifestLoadingTimeOut: 4500,
          manifestLoadingMaxRetry: 1,
          levelLoadingTimeOut: 4500,
          levelLoadingMaxRetry: 1,
          fragLoadingTimeOut: 8000,
          fragLoadingMaxRetry: 2,
          startPosition: startSec > 5 ? startSec : -1
        });
        hls.loadSource(activeHlsSource);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.ERROR, function(_ev, data) {
          var httpCode = data && data.response ? data.response.code : 0;
          var isBlockedHttp =
            httpCode === 401 ||
            httpCode === 403 ||
            httpCode === 404 ||
            httpCode === 410 ||
            httpCode === 530;
          if ((data && data.fatal) || isBlockedHttp) {
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
    ${sandboxAttribute}
    allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *"
    allowfullscreen
    webkitallowfullscreen="true"
    mozallowfullscreen="true"
    referrerpolicy="origin"
  ></iframe>`
  }
</body>
</html>`;
}

async function resolveContingencyFallbackFromPayload(payload: {
  episodeId?: string;
  movieId?: string;
  rawUrl?: string;
}): Promise<string | null> {
  const rawUrl = payload.rawUrl || "";
  const tvTupleMatch = rawUrl.match(/(\d+)x(\d+)/i);
  const parsedSeason = tvTupleMatch ? Number(tvTupleMatch[1]) || 1 : 1;
  const parsedEpisode = tvTupleMatch ? Number(tvTupleMatch[2]) || 1 : 1;

  try {
    if (payload.episodeId) {
      const episode = await prisma.episode.findUnique({
        where: { id: payload.episodeId },
        select: {
          episodeNumber: true,
          season: {
            select: {
              seasonNumber: true,
              series: {
                select: {
                  tmdbId: true,
                },
              },
            },
          },
        },
      });
      const tmdbId = episode?.season?.series?.tmdbId;
      if (tmdbId) {
        return getPlusCleanEmbedUrl({
          mediaType: "SERIES",
          tmdbId,
          seasonNumber: episode.season.seasonNumber,
          episodeNumber: episode.episodeNumber,
        });
      }
    }

    if (payload.movieId) {
      const movie = await prisma.movie.findUnique({
        where: { id: payload.movieId },
        select: { tmdbId: true, mediaType: true },
      });
      if (movie?.tmdbId && movie.mediaType === "MOVIE") {
        return getPlusCleanEmbedUrl({
          mediaType: "MOVIE",
          tmdbId: movie.tmdbId,
        });
      }
      if (movie?.tmdbId && movie.mediaType === "SERIES") {
        return getPlusCleanEmbedUrl({
          mediaType: "SERIES",
          tmdbId: movie.tmdbId,
          seasonNumber: parsedSeason,
          episodeNumber: parsedEpisode,
        });
      }
    }
  } catch (error) {
    console.warn(
      "[GET /api/stream/[token]] Error resolviendo fallback de contingencia en BD:",
      error
    );
  }

  const tvImdbMatch = rawUrl.match(/(tt\d+)-(\d+)x(\d+)/i);
  if (tvImdbMatch) {
    return `https://vidsrc.me/embed/tv?imdb=${tvImdbMatch[1]}&season=${Number(tvImdbMatch[2]) || 1}&episode=${Number(tvImdbMatch[3]) || 1}&ds_lang=es`;
  }

  const movieImdbMatch = rawUrl.match(/(tt\d+)/i);
  if (movieImdbMatch) {
    return `https://vidsrc.me/embed/movie?imdb=${movieImdbMatch[1]}&ds_lang=es`;
  }

  return null;
}

/**
 * Endpoint Túnel de Reproducción (`GET /api/stream/[token]`).
 *
 * Desencripta el token AES-256-GCM, valida permisos anti-hotlinking, desempaqueta agregadores
 * en el backend y sirve el reproductor aislado sin revelar la URL real del servidor.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const isTvMode = request.nextUrl.searchParams.get("tv") === "1";
    const requestedShield = request.nextUrl.searchParams.get("escudo") !== "0";
    const skipNativeExtraction =
      request.nextUrl.searchParams.get("native_failed") === "1";

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

    let authenticatedUserId: string | undefined;
    let authenticatedUserEmail: string | null = null;
    if (!isTvMode) {
      const session = await getServerSession(authOptions);
      authenticatedUserId = (session?.user as { id?: string } | undefined)?.id;
      authenticatedUserEmail = session?.user?.email ?? null;
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

    if (!isRefererHostAllowed(request)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Acceso externo no permitido (Anti-Hotlinking).",
        },
        { status: 403 }
      );
    }

    if (payload.format !== MirrorFormat.EMBED) {
      const redirectResponse = NextResponse.redirect(payload.rawUrl, {
        status: 302,
      });
      redirectResponse.headers.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
      );
      redirectResponse.headers.set("Referrer-Policy", "no-referrer");
      return redirectResponse;
    }

    let serverAllowsShieldMode = false;
    if (isTvMode) {
      serverAllowsShieldMode = requestedShield;
    } else if (requestedShield && authenticatedUserId) {
      const membership = await prismaMembershipRepository.getMembershipByUserId(
        authenticatedUserId,
        authenticatedUserEmail
      );
      serverAllowsShieldMode = membership.isModoEscudoActive;
    }

    let finalEmbedUrl = isStreamwishUrl(payload.rawUrl)
      ? normalizeStreamwishEmbedUrl(payload.rawUrl)
      : payload.rawUrl;
    let isSecondaryServer = Boolean(payload.isDirty);
    let streamwishHls: DirectHlsStreamInfo | null = null;
    let plusSafeFallbackUrl: string | null = null;

    if (skipNativeExtraction && serverAllowsShieldMode) {
      if (!isSandboxCompatibleEmbedUrl(finalEmbedUrl)) {
        const cleanReplacement =
          await resolveContingencyFallbackFromPayload(payload);
        if (cleanReplacement) {
          plusSafeFallbackUrl = cleanReplacement;
          finalEmbedUrl = cleanReplacement;
          isSecondaryServer = true;
        }
      }
    } else {
      if (payload.rawUrl.includes("embed69.org/f/")) {
        const embed69Result = await resolveBestEmbedFromEmbed69Url(
          payload.rawUrl
        );

        if (embed69Result.url) {
          finalEmbedUrl = embed69Result.url;
          isSecondaryServer = !embed69Result.isStreamwish;
        } else {
          const playLatinFallback = await resolveBestEmbedFromPlayLatinByUrl(
            payload.rawUrl
          );

          if (playLatinFallback) {
            finalEmbedUrl = playLatinFallback.url;
            isSecondaryServer = !playLatinFallback.isStreamwish;
          } else {
            const contingencyFallback =
              await resolveContingencyFallbackFromPayload(payload);
            if (contingencyFallback) {
              finalEmbedUrl = contingencyFallback;
              isSecondaryServer = true;
            } else if (
              embed69Result.status === "NOT_FOUND" ||
              (STRICT_STREAMWISH_ONLY && !FALLBACK_IF_EMPTY)
            ) {
              return buildStreamErrorHtmlResponse(payload.mirrorId);
            } else {
              finalEmbedUrl = embed69Result.cleanEmbedUrl;
              isSecondaryServer = true;
            }
          }
        }
      }

      if (isBrokenOrLegacyContingencyUrl(finalEmbedUrl)) {
        const replacementEmbedUrl =
          await resolveContingencyFallbackFromPayload(payload);
        if (replacementEmbedUrl) {
          finalEmbedUrl = replacementEmbedUrl;
          isSecondaryServer = true;
        }
      }
    }

    const resolvedIsStreamwish = isStreamwish({
      serverName: payload.serverName,
      url: finalEmbedUrl,
    });
    const isDirtyIframe =
      !resolvedIsStreamwish || isMultiEmbedAggregatorUrl(finalEmbedUrl);

    if (isDirtyIframe) {
      isSecondaryServer = true;
    }

    const resumeSeconds = Math.max(
      0,
      Math.floor(Number(request.nextUrl.searchParams.get("t") || "0") || 0)
    );

    if (!skipNativeExtraction) {
      const canExtractNativeHls =
        resolvedIsStreamwish ||
        isExtractableCleanHost({
          serverName: payload.serverName,
          url: finalEmbedUrl,
        });

      const internalProxyBaseUrl = `${resolvePublicOrigin(request)}/api/stream-proxy`;

      streamwishHls =
        canExtractNativeHls && serverAllowsShieldMode
          ? await extractDirectHlsFromStreamwishEmbed(
              finalEmbedUrl,
              internalProxyBaseUrl
            )
          : null;

      if (serverAllowsShieldMode) {
        if (streamwishHls || !isSandboxCompatibleEmbedUrl(finalEmbedUrl)) {
          const cleanReplacement =
            await resolveContingencyFallbackFromPayload(payload);
          if (cleanReplacement) {
            plusSafeFallbackUrl = cleanReplacement;
            if (!streamwishHls && !isSandboxCompatibleEmbedUrl(finalEmbedUrl)) {
              finalEmbedUrl = cleanReplacement;
              isSecondaryServer = true;
            }
          }
        }
      }
    }

    const urlWithResume = appendResumeTimeParam(finalEmbedUrl, resumeSeconds);
    const targetIframeUrl = isTvMode
      ? appendAutoplayParam(urlWithResume)
      : urlWithResume;
    const escapedRawUrl = escapeHtmlAttribute(targetIframeUrl);

    const html = buildStreamTunnelPlayerHtml({
      mirrorId: payload.mirrorId,
      targetIframeUrl,
      escapedRawUrl,
      plusSafeFallbackUrl,
      isTvMode,
      isSecondaryServer,
      isDirtyIframe,
      shieldProtectionEnabled: serverAllowsShieldMode,
      resumeSeconds,
      streamwishHls,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Referrer-Policy": streamwishHls
          ? "no-referrer"
          : "strict-origin-when-cross-origin",
        "Permissions-Policy":
          "fullscreen=*, autoplay=*, picture-in-picture=*, payment=(), geolocation=(), camera=(), microphone=()",
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
