"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { ShieldCheck, ExternalLink, X } from "lucide-react";

export type SmartPlayerStatus = "loading" | "playing_native" | "playing_iframe";

export type SmartPlayerEnv =
  | "desktop-chrome"
  | "desktop-firefox"
  | "ios-safari"
  | "android";

export interface ExtractorResponseData {
  success: boolean;
  streamUrl?: string;
  type?: "hls" | "mp4";
  referer?: string;
  fallbackUrl?: string;
  reason?: string;
  durationSeconds?: number;
  posterUrl?: string;
}

export interface SmartPlayerProps {
  embedUrl: string;
  backupEmbedUrls?: string[];
  title?: string;
  initialTimeSeconds?: number;
  onTimeUpdate?: (currentTimeSec: number, durationSec: number) => void;
  onDurationChange?: (durationSec: number) => void;
  onPlay?: () => void;
  onEnded?: () => void;
  onFatalError?: () => void;
  onStatusChange?: (status: SmartPlayerStatus) => void;
  hideInlineHelperBar?: boolean;
  videoElementRef?: React.MutableRefObject<HTMLVideoElement | null>;
  iframeElementRef?: React.MutableRefObject<HTMLIFrameElement | null>;
}

interface BraveNavigator extends Navigator {
  brave?: {
    isBrave?: () => Promise<boolean>;
  };
}

const HIDE_ADBLOCK_TIP_STORAGE_KEY = "hide_adblock_tip";

/**
 * Detecta la plataforma y navegador exacto del usuario.
 */
export function detectClientEnvironment(): SmartPlayerEnv {
  if (typeof navigator === "undefined") return "desktop-chrome";
  const ua = navigator.userAgent || "";

  if (/android/i.test(ua)) {
    return "android";
  }

  if (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "ios-safari";
  }

  if (/firefox|fxios/i.test(ua)) {
    return "desktop-firefox";
  }

  return "desktop-chrome";
}

/**
 * Detecta de forma silenciosa si el usuario usa Brave o ya cuenta con un bloqueador de anuncios activo.
 */
export async function detectBraveOrAdblock(): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  // 1. Verificar si el navegador es Brave
  try {
    const nav = navigator as BraveNavigator;
    if (nav.brave?.isBrave && (await nav.brave.isBrave())) {
      return true;
    }
  } catch {
    // Continuar con detección por señuelo
  }

  // 2. Señuelo DOM (div oculto con clases estándar de listas EasyList / uBlock)
  try {
    const bait = document.createElement("div");
    bait.className =
      "adsbox pub_300x250banner pub_300x250 pub_728x90 text-ad textAd text_ad ad-banner";
    bait.setAttribute("aria-hidden", "true");
    bait.style.position = "absolute";
    bait.style.left = "-9999px";
    bait.style.top = "-9999px";
    bait.style.width = "300px";
    bait.style.height = "250px";
    bait.innerHTML = "&nbsp;";
    document.body.appendChild(bait);

    await new Promise((resolve) => setTimeout(resolve, 60));

    const computed = window.getComputedStyle(bait);
    const blockedByDom =
      bait.offsetHeight === 0 ||
      bait.clientHeight === 0 ||
      bait.offsetParent === null ||
      computed.display === "none" ||
      computed.visibility === "hidden";

    bait.remove();

    if (blockedByDom) {
      return true;
    }
  } catch {
    // Continuar con prueba de red
  }

  // 3. Petición HEAD silenciosa a un script publicitario conocido
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    await fetch(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
      {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    return false;
  } catch {
    // Si la petición fue bloqueada por el cliente (ERR_BLOCKED_BY_CLIENT), hay Adblock activo
    return true;
  }
}

/**
 * Barra Contextual No Intrusiva (Smart Adblock Helper)
 * Se muestra debajo del reproductor únicamente cuando está en modo iframe y no se detectó Brave/Adblock.
 */
export function SmartAdblockHelperBar({ active }: { active: boolean }) {
  const [env, setEnv] = useState<SmartPlayerEnv>("desktop-chrome");
  const [hasProtection, setHasProtection] = useState<boolean>(true);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [checked, setChecked] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (localStorage.getItem(HIDE_ADBLOCK_TIP_STORAGE_KEY) === "true") {
        setDismissed(true);
        return;
      }
    } catch {
      // Ignorar si localStorage está restringido
    }

    setEnv(detectClientEnvironment());

    let mounted = true;
    detectBraveOrAdblock().then((protectedBrowser) => {
      if (mounted) {
        setHasProtection(protectedBrowser);
        setChecked(true);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(HIDE_ADBLOCK_TIP_STORAGE_KEY, "true");
    } catch {
      // Silencioso
    }
  }, []);

  const handleOpenInBraveAndroid = useCallback(() => {
    if (typeof window === "undefined") return;
    const playStoreFallback = encodeURIComponent(
      "https://play.google.com/store/apps/details?id=com.brave.browser"
    );
    const intentUrl = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.brave.browser;S.browser_fallback_url=${playStoreFallback};end`;
    window.location.href = intentUrl;
  }, []);

  if (!active || !checked || hasProtection || dismissed) {
    return null;
  }

  return (
    <div className="w-full rounded-xl bg-zinc-900/95 border border-white/10 px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-lg backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
      <div className="flex items-center gap-2.5 min-w-0 pr-6 sm:pr-0">
        <div className="w-7 h-7 rounded-lg bg-netflix-red/15 border border-netflix-red/30 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-4 h-4 text-netflix-red" />
        </div>
        <p className="text-zinc-300 font-medium leading-snug">
          {(env === "desktop-chrome" || env === "desktop-firefox") &&
            "¿Molesto por los anuncios del servidor? Instala la extensión oficial gratuita para bloquearlos."}
          {env === "ios-safari" &&
            "Bloquea los anuncios en Safari activando la extensión gratuita oficial."}
          {env === "android" &&
            "Elimina las ventanas emergentes del reproductor con un toque."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end flex-shrink-0">
        {env === "desktop-chrome" && (
          <a
            href="https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-netflix-red hover:bg-red-700 text-white font-bold text-xs transition shadow-sm"
          >
            <span>Instalar uBlock Origin Lite (Chrome Store)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}

        {env === "desktop-firefox" && (
          <a
            href="https://addons.mozilla.org/es/firefox/addon/ublock-origin/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-netflix-red hover:bg-red-700 text-white font-bold text-xs transition shadow-sm"
          >
            <span>Instalar uBlock Origin (Firefox)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}

        {env === "ios-safari" && (
          <a
            href="https://apps.apple.com/app/ublock-origin-lite/id6745342698"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-netflix-red hover:bg-red-700 text-white font-bold text-xs transition shadow-sm"
          >
            <span>Descargar extensión uBlock Lite (App Store)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}

        {env === "android" && (
          <>
            <button
              type="button"
              onClick={handleOpenInBraveAndroid}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-netflix-red hover:bg-red-700 text-white font-bold text-xs transition shadow-sm"
            >
              <span>Abrir directo en Brave</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>

            <a
              href="https://addons.mozilla.org/es/android/addon/ublock-origin/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-white/10 transition"
            >
              <span>Usar extensión en Firefox Android</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          </>
        )}

        <button
          type="button"
          onClick={handleDismiss}
          title="Ocultar sugerencia permanentemente"
          aria-label="Cerrar sugerencia"
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition ml-auto sm:ml-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * PASO 4: Reproductor Libre de Fricción (Zero-Gate UX)
 * - Intenta primero extraer y reproducir el stream limpio (.m3u8 / .mp4) con hls.js.
 * - Si el servidor externo no permite extracción o hls.js falla, pasa inmediatamente al <iframe> sin bloqueos.
 * - Muestra una barra contextual no intrusiva debajo del reproductor solo si está en modo <iframe> y sin Adblock/Brave.
 */
export default function SmartPlayer({
  embedUrl,
  backupEmbedUrls = [],
  title,
  initialTimeSeconds = 0,
  onTimeUpdate,
  onDurationChange,
  onPlay,
  onEnded,
  onFatalError,
  onStatusChange,
  hideInlineHelperBar = false,
  videoElementRef,
  iframeElementRef,
}: SmartPlayerProps) {
  const [status, setStatus] = useState<SmartPlayerStatus>("loading");
  const [streamData, setStreamData] = useState<ExtractorResponseData | null>(
    null
  );
  const [shieldActive, setShieldActive] = useState<boolean>(true);

  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const internalIframeRef = useRef<HTMLIFrameElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const initialSeekDoneRef = useRef<boolean>(false);
  const initialTimeSecondsRef = useRef<number>(initialTimeSeconds);
  const backupEmbedUrlsRef = useRef<string[]>(backupEmbedUrls);
  const onDurationChangeRef = useRef(onDurationChange);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    initialTimeSecondsRef.current = initialTimeSeconds;
  }, [initialTimeSeconds]);

  useEffect(() => {
    backupEmbedUrlsRef.current = backupEmbedUrls;
  }, [backupEmbedUrls]);

  useEffect(() => {
    onDurationChangeRef.current = onDurationChange;
  }, [onDurationChange]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const updateStatus = useCallback((nextStatus: SmartPlayerStatus) => {
    setStatus(nextStatus);
    onStatusChangeRef.current?.(nextStatus);
  }, []);

  const setVideoRefs = useCallback(
    (el: HTMLVideoElement | null) => {
      internalVideoRef.current = el;
      if (videoElementRef) {
        videoElementRef.current = el;
      }
    },
    [videoElementRef]
  );

  const setIframeRefs = useCallback(
    (el: HTMLIFrameElement | null) => {
      internalIframeRef.current = el;
      if (iframeElementRef) {
        iframeElementRef.current = el;
      }
    },
    [iframeElementRef]
  );

  const destroyHlsInstance = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        // Silencioso
      }
      hlsRef.current = null;
    }
  }, []);

  // Fallback inmediato sin bloqueos hacia el <iframe>
  const switchToImmediateIframe = useCallback(() => {
    destroyHlsInstance();
    updateStatus("playing_iframe");
  }, [destroyHlsInstance, updateStatus]);

  // Escudo anti-anuncios y neutralizador de popups en modo fallback iframe
  useEffect(() => {
    if (status !== "playing_iframe") return;

    const originalWindowOpen = window.open;
    window.open = () => null;

    const handleWindowBlur = () => {
      if (document.activeElement === internalIframeRef.current) {
        setTimeout(() => {
          try {
            window.focus();
          } catch {}
        }, 30);
      }
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.open = originalWindowOpen;
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [status]);

  // 1. Al montar o cambiar embedUrl, consultar /api/extractor inmediatamente
  useEffect(() => {
    if (!embedUrl) return;

    let cancelled = false;
    const controller = new AbortController();

    destroyHlsInstance();
    initialSeekDoneRef.current = false;
    setShieldActive(true);
    updateStatus("loading");
    setStreamData(null);

    const runExtraction = async () => {
      const candidateUrls = [
        embedUrl,
        ...backupEmbedUrlsRef.current.filter((u) => Boolean(u) && u !== embedUrl),
      ];
      let firstFailureData: ExtractorResponseData | null = null;

      for (const candidateUrl of candidateUrls) {
        if (cancelled) return;
        try {
          const res = await fetch(
            `/api/extractor?url=${encodeURIComponent(candidateUrl)}`,
            {
              signal: controller.signal,
              cache: "no-store",
            }
          );

          if (cancelled) return;

          const data = (await res.json()) as ExtractorResponseData;
          if (cancelled) return;

          if (data.success && data.streamUrl) {
            setStreamData(data);
            if (data.durationSeconds && data.durationSeconds > 60) {
              onDurationChangeRef.current?.(data.durationSeconds);
            }
            updateStatus("playing_native");
            return;
          }

          if (!firstFailureData) {
            firstFailureData = data;
          }
        } catch {
          if (cancelled) return;
        }
      }

      if (!cancelled) {
        setStreamData(
          firstFailureData || {
            success: false,
            fallbackUrl: embedUrl,
          }
        );
        switchToImmediateIframe();
      }
    };

    void runExtraction();

    return () => {
      cancelled = true;
      controller.abort();
      destroyHlsInstance();
    };
  }, [embedUrl, destroyHlsInstance, switchToImmediateIframe, updateStatus]);

  // 2. Inicialización de reproducción nativa con hls.js o HTML5 <video> vía /api/stream-proxy
  useEffect(() => {
    if (
      status !== "playing_native" ||
      !streamData?.success ||
      !streamData.streamUrl
    ) {
      return;
    }

    const video = internalVideoRef.current;
    if (!video) return;

    destroyHlsInstance();

    const refererParam = streamData.referer || "";
    const proxiedStreamUrl = `/api/stream-proxy?url=${encodeURIComponent(
      streamData.streamUrl
    )}&referer=${encodeURIComponent(refererParam)}`;

    const resumeTarget = initialTimeSecondsRef.current;

    const applyInitialResume = () => {
      if (
        !initialSeekDoneRef.current &&
        resumeTarget > 5 &&
        (!video.duration || video.duration > resumeTarget)
      ) {
        try {
          video.currentTime = resumeTarget;
          initialSeekDoneRef.current = true;
        } catch {
          // Silencioso
        }
      }
      if (
        video.duration &&
        Number.isFinite(video.duration) &&
        video.duration > 60
      ) {
        onDurationChangeRef.current?.(Math.floor(video.duration));
      }
    };

    if (streamData.type === "hls") {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          startPosition: resumeTarget > 5 ? resumeTarget : -1,
        });
        hlsRef.current = hls;

        hls.loadSource(proxiedStreamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          applyInitialResume();
          video.play().catch(() => {});
        });

        let mediaRecoveryAttempted = false;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;

          if (
            data.type === Hls.ErrorTypes.MEDIA_ERROR &&
            !mediaRecoveryAttempted
          ) {
            mediaRecoveryAttempted = true;
            hls.recoverMediaError();
            return;
          }

          // Si hls.js emite un error fatal irrecuperable, pasa automáticamente a playing_iframe
          switchToImmediateIframe();
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // HLS nativo en Safari iOS / macOS
        video.src = proxiedStreamUrl;
        video.addEventListener("loadedmetadata", applyInitialResume);
        video.play().catch(() => {});
      } else {
        switchToImmediateIframe();
      }
    } else {
      // Archivo directo MP4 a través de /api/stream-proxy
      video.src = proxiedStreamUrl;
      video.addEventListener("loadedmetadata", applyInitialResume);
      video.play().catch(() => {});
    }

    return () => {
      video.removeEventListener("loadedmetadata", applyInitialResume);
      destroyHlsInstance();
    };
  }, [status, streamData, destroyHlsInstance, switchToImmediateIframe]);

  const targetIframeUrl = streamData?.fallbackUrl || embedUrl;

  const playerViewport = (
    <div className="relative w-full h-full aspect-video bg-black overflow-hidden select-none">
      {/* ESTADO 1: Cargando / Extrayendo stream */}
      {status === "loading" && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 p-6 text-center space-y-3">
          <div className="relative flex items-center justify-center">
            <div className="w-11 h-11 rounded-full border-4 border-netflix-red/25 border-t-netflix-red animate-spin" />
            <ShieldCheck className="w-4 h-4 text-netflix-red absolute" />
          </div>
          <p className="text-xs sm:text-sm font-semibold text-zinc-300 tracking-wide">
            Cargando reproductor...
          </p>
        </div>
      )}

      {/* ESTADO 2: Reproducción Nativa HTML5 + HLS.js (0 anuncios) */}
      {status === "playing_native" && (
        <video
          ref={setVideoRefs}
          controls
          playsInline
          x-webkit-airplay="allow"
          poster={streamData?.posterUrl}
          className="w-full h-full bg-black object-contain"
          onPlay={() => onPlay?.()}
          onEnded={() => onEnded?.()}
          onSeeked={(e) => {
            const el = e.currentTarget;
            const cur = Math.floor(el.currentTime || 0);
            const dur = Math.floor(
              el.duration || streamData?.durationSeconds || 0
            );
            onTimeUpdate?.(cur, dur);
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            const cur = Math.floor(el.currentTime || 0);
            const dur = Math.floor(
              el.duration || streamData?.durationSeconds || 0
            );
            onTimeUpdate?.(cur, dur);
          }}
          onError={() => switchToImmediateIframe()}
        />
      )}

      {/* ESTADO 3: Reproducción inmediata en Iframe con Escudo Anti-Anuncios */}
      {status === "playing_iframe" && (
        <div className="relative w-full h-full">
          <iframe
            ref={setIframeRefs}
            key={targetIframeUrl}
            src={targetIframeUrl}
            title={title || "Reproductor de video"}
            className="w-full h-full border-0"
            allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *"
            allowFullScreen
            onError={() => onFatalError?.()}
          />
          {shieldActive && (
            <div
              onClick={() => {
                setShieldActive(false);
                window.focus();
              }}
              onTouchStart={() => {
                setShieldActive(false);
                window.focus();
              }}
              className="absolute inset-0 z-20 bg-transparent cursor-pointer"
              title="Click para reproducir"
              aria-hidden="true"
            />
          )}
        </div>
      )}
    </div>
  );

  if (hideInlineHelperBar) {
    return playerViewport;
  }

  return (
    <div className="w-full space-y-2.5">
      {playerViewport}
      <SmartAdblockHelperBar active={status === "playing_iframe"} />
    </div>
  );
}
