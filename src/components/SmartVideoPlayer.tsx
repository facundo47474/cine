"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import Hls from "hls.js";
import {
  AlertTriangle,
  Cast,
  Maximize2,
  Minimize2,
  Tv,
} from "lucide-react";
import { SignedMirrorStreamDto } from "@/application/dto/PlaybackStreamDto";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { PresentationConnection } from "@/types/cast";

interface SmartVideoPlayerProps {
  movieId: string;
  movieTitle: string;
  durationMins: number;
  streams: SignedMirrorStreamDto[];
  initialProgressSeconds: number;
  preferredLanguage?: "Latino" | "Inglés (Sub)";
}

interface FullscreenContainerElement extends HTMLDivElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

const GOOGLE_CAST_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

export default function SmartVideoPlayer({
  movieId,
  movieTitle,
  durationMins,
  streams,
  initialProgressSeconds,
  preferredLanguage = "Latino",
}: SmartVideoPlayerProps) {
  const containerRef = useRef<FullscreenContainerElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedSecRef = useRef<number>(initialProgressSeconds);
  const presentationConnectionRef = useRef<PresentationConnection | null>(null);

  const isBraveBrowser = useMemo(() => {
    if (typeof window === "undefined") return false;

    const userAgent = navigator.userAgent || "";
    const braveFlag = Boolean(
      (navigator as Navigator & { brave?: { isBrave?: boolean } }).brave?.isBrave
    );

    return userAgent.toLowerCase().includes("brave") || braveFlag;
  }, []);

  const safeStreams = useMemo(
    () =>
      streams.filter(
        (stream) => !isBraveBrowser || stream.format !== MirrorFormat.EMBED
      ),
    [streams, isBraveBrowser]
  );

  const orderedStreams = useMemo(() => {
    const sorted = [...safeStreams].sort((a, b) => a.priority - b.priority);
    const matching = sorted.filter((s) => s.language === preferredLanguage);
    const fallback = sorted.filter((s) => s.language !== preferredLanguage);
    return [...matching, ...fallback];
  }, [safeStreams, preferredLanguage]);

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [allMirrorsDown, setAllMirrorsDown] = useState<boolean>(
    orderedStreams.length === 0
  );
  const [shieldActive, setShieldActive] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isCasting, setIsCasting] = useState<boolean>(false);
  const [castDeviceName, setCastDeviceName] = useState<string | null>(null);

  useEffect(() => {
    setActiveIndex(0);
    setAllMirrorsDown(orderedStreams.length === 0);
    setShieldActive(true);
  }, [orderedStreams, preferredLanguage]);

  const currentStream: SignedMirrorStreamDto | undefined =
    orderedStreams[activeIndex];

  useEffect(() => {
    const initializeCastContext = () => {
      try {
        const castFramework = window.cast?.framework;
        const chromeCast = window.chrome?.cast;
        if (!castFramework || !chromeCast) return;

        castFramework.CastContext.getInstance().setOptions({
          receiverApplicationId:
            chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
      } catch {
        // Silencioso en navegadores que no implementan Google Cast
      }
    };

    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) {
        initializeCastContext();
      }
    };

    if (window.cast?.framework && window.chrome?.cast) {
      initializeCastContext();
      return;
    }

    const existingScript = document.querySelector(
      `script[src="${GOOGLE_CAST_SDK_URL}"]`
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = GOOGLE_CAST_SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const originalWindowOpen = window.open;
    window.open = () => null;

    const handleWindowBlur = () => {
      if (document.activeElement === iframeRef.current) {
        setTimeout(() => {
          window.focus();
        }, 50);
      }
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.open = originalWindowOpen;
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as FullscreenDocument;
      setIsFullscreen(
        Boolean(doc.fullscreenElement || doc.webkitFullscreenElement)
      );
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      handleFullscreenChange as EventListener
    );

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange as EventListener
      );
    };
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    const doc = document as FullscreenDocument;

    if (!container) return;

    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      } else if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        await container.webkitRequestFullscreen();
      }
    } catch {
      // Silencioso si el navegador restringe el cambio de fullscreen
    }
  }, []);

  const handleCastClick = useCallback(async () => {
    if (isCasting) {
      try {
        window.cast?.framework?.CastContext.getInstance().endCurrentSession(true);
      } catch {
        // Silencioso
      }
      try {
        presentationConnectionRef.current?.terminate();
      } catch {
        // Silencioso
      }
      presentationConnectionRef.current = null;
      setIsCasting(false);
      setCastDeviceName(null);
      return;
    }

    if (!currentStream) return;

    const videoEl = videoRef.current;

    if (videoEl && typeof videoEl.webkitShowPlaybackTargetPicker === "function") {
      try {
        videoEl.webkitShowPlaybackTargetPicker();
        return;
      } catch {
        // Continúa con la cascada si falla AirPlay
      }
    }

    if (
      currentStream.format !== MirrorFormat.EMBED &&
      window.cast?.framework &&
      window.chrome?.cast
    ) {
      try {
        const castContext = window.cast.framework.CastContext.getInstance();
        await castContext.requestSession();
        const session = castContext.getCurrentSession();

        if (session) {
          const absoluteStreamUrl = new URL(
            currentStream.streamUrl,
            window.location.origin
          ).toString();
          const contentType =
            currentStream.format === MirrorFormat.HLS
              ? "application/x-mpegurl"
              : "video/mp4";

          const mediaInfo = new window.chrome.cast.media.MediaInfo(
            absoluteStreamUrl,
            contentType
          );
          const metadata = new window.chrome.cast.media.GenericMediaMetadata();
          metadata.title = movieTitle;
          mediaInfo.metadata = metadata;

          const loadRequest = new window.chrome.cast.media.LoadRequest(
            mediaInfo
          );
          loadRequest.autoplay = true;
          loadRequest.currentTime = lastSavedSecRef.current || 0;

          await session.loadMedia(loadRequest);
          videoEl?.pause();
          setCastDeviceName(
            session.getCastDevice()?.friendlyName || "tu Smart TV"
          );
          setIsCasting(true);
          return;
        }
      } catch {
        // Silencioso
      }
    }

    const tvUrl = new URL(currentStream.streamUrl, window.location.origin);
    tvUrl.searchParams.set("tv", "1");

    if (typeof window.PresentationRequest === "function") {
      try {
        const presentationRequest = new window.PresentationRequest([
          tvUrl.toString(),
        ]);
        const connection = await presentationRequest.start();

        presentationConnectionRef.current = connection;
        setCastDeviceName("tu Smart TV");
        setIsCasting(true);

        const handleDisconnect = () => {
          presentationConnectionRef.current = null;
          setIsCasting(false);
          setCastDeviceName(null);
        };

        connection.addEventListener("close", handleDisconnect);
        connection.addEventListener("terminate", handleDisconnect);
        return;
      } catch {
        // Silencioso
      }
    }

    if (window.cast?.framework) {
      try {
        const castContext = window.cast.framework.CastContext.getInstance();
        await castContext.requestSession();
        const session = castContext.getCurrentSession();
        if (session) {
          setCastDeviceName(
            session.getCastDevice()?.friendlyName || "tu Smart TV"
          );
          setIsCasting(true);
          return;
        }
      } catch {
        // Silencioso
      }
    }

    if (videoEl?.remote?.prompt) {
      try {
        await videoEl.remote.prompt();
      } catch {
        // Silencioso
      }
    }
  }, [isCasting, currentStream, movieTitle]);

  useEffect(() => {
    const handleExternalCastTrigger = () => {
      void handleCastClick();
    };

    window.addEventListener("piloto:trigger-cast", handleExternalCastTrigger);
    return () => {
      window.removeEventListener(
        "piloto:trigger-cast",
        handleExternalCastTrigger
      );
    };
  }, [handleCastClick]);

  const handleShieldAbsorb = useCallback(() => {
    setShieldActive(false);
    window.focus();
  }, []);

  useEffect(() => {
    if (shieldActive) return;

    const rearmTimer = setTimeout(() => {
      setShieldActive(true);
    }, 240_000);

    return () => clearTimeout(rearmTimer);
  }, [shieldActive]);

  const saveWatchProgress = useCallback(
    async (currentSeconds: number, totalDurationSeconds: number) => {
      if (Math.abs(currentSeconds - lastSavedSecRef.current) < 8) return;
      lastSavedSecRef.current = currentSeconds;

      try {
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            movieId,
            progressSeconds: Math.floor(currentSeconds),
            durationSeconds:
              Math.floor(totalDurationSeconds) || durationMins * 60,
          }),
        });
      } catch {
        // Silencioso
      }
    },
    [movieId, durationMins]
  );

  useEffect(() => {
    if (!currentStream || currentStream.format !== MirrorFormat.EMBED) return;

    const totalSec = Math.max(600, durationMins * 60);
    let simulatedCurrent =
      lastSavedSecRef.current > 0 ? lastSavedSecRef.current : 60;

    saveWatchProgress(simulatedCurrent, totalSec);

    const interval = setInterval(() => {
      simulatedCurrent = Math.min(totalSec - 120, simulatedCurrent + 15);
      saveWatchProgress(simulatedCurrent, totalSec);
    }, 15000);

    return () => clearInterval(interval);
  }, [currentStream, durationMins, saveWatchProgress]);

  const handleStreamError = useCallback(
    (failedStream: SignedMirrorStreamDto) => {
      fetch(`/api/mirrors/${failedStream.mirrorId}/report`, {
        method: "POST",
      }).catch(() => {});

      const nextIndex = activeIndex + 1;
      if (nextIndex < orderedStreams.length) {
        setActiveIndex(nextIndex);
      } else {
        setAllMirrorsDown(true);
      }
    },
    [activeIndex, orderedStreams.length]
  );

  useEffect(() => {
    if (
      isCasting ||
      !currentStream ||
      currentStream.format === MirrorFormat.EMBED
    ) {
      return;
    }

    const videoElement = videoRef.current;
    if (!videoElement) return;

    let hlsInstance: Hls | null = null;

    const onLoadedMetadata = () => {
      if (initialProgressSeconds > 5 && videoElement.currentTime < 2) {
        videoElement.currentTime = initialProgressSeconds;
      }
    };

    if (currentStream.format === MirrorFormat.HLS && Hls.isSupported()) {
      hlsInstance = new Hls({ enableWorker: true });
      hlsInstance.loadSource(currentStream.streamUrl);
      hlsInstance.attachMedia(videoElement);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (initialProgressSeconds > 5) {
          videoElement.currentTime = initialProgressSeconds;
        }
        videoElement.play().catch(() => {});
      });

      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          handleStreamError(currentStream);
        }
      });
    } else {
      videoElement.src = currentStream.streamUrl;
      videoElement.addEventListener("loadedmetadata", onLoadedMetadata);
      videoElement.play().catch(() => {});
    }

    return () => {
      videoElement.removeEventListener("loadedmetadata", onLoadedMetadata);
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [isCasting, currentStream, initialProgressSeconds, handleStreamError]);

  if (allMirrorsDown || !currentStream) {
    return (
      <div className="w-full aspect-video rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center p-8 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-netflix-red" />
        <h3 className="text-base font-bold text-white">
          {isBraveBrowser
            ? "Brave está bloqueando fuentes con anuncios emergentes"
            : "Este título no se encuentra disponible en este momento"}
        </h3>
        <p className="text-xs text-zinc-400 max-w-md">
          {isBraveBrowser
            ? "Se priorizaron enlaces directos HLS/MP4 para evitar anuncios emergentes. Si no hay reproducción disponible, prueba otro título."
            : "Intenta nuevamente en unos minutos o explora otra película de nuestro catálogo."}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => {
        if (shieldActive) setShieldActive(false);
      }}
      className="group relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl"
    >
      {isCasting ? (
        <div className="w-full h-full bg-zinc-950 flex flex-col items-center justify-center p-6 text-center space-y-4 select-none">
          <div className="w-16 h-16 rounded-full bg-netflix-red/15 border border-netflix-red/40 flex items-center justify-center animate-pulse">
            <Tv className="w-8 h-8 text-netflix-red" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
              {`Reproduciendo en ${castDeviceName || "tu Smart TV"}`}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400">
              La película se está transmitiendo directamente a la pantalla grande.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCastClick}
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-netflix-red hover:bg-red-700 text-white text-xs sm:text-sm font-bold transition shadow-lg"
          >
            <Cast className="w-4 h-4" />
            <span>Desconectar de la TV</span>
          </button>
        </div>
      ) : currentStream.format === MirrorFormat.EMBED ? (
        <>
          <iframe
            ref={iframeRef}
            key={currentStream.mirrorId}
            src={currentStream.streamUrl}
            title={movieTitle}
            className="w-full h-full border-0"
            allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *"
            allowFullScreen
            onError={() => handleStreamError(currentStream)}
          />

          {shieldActive && (
            <div
              onClick={handleShieldAbsorb}
              onTouchStart={handleShieldAbsorb}
              className="absolute inset-x-0 top-0 h-10 z-10 bg-transparent pointer-events-auto"
              aria-hidden="true"
            />
          )}
        </>
      ) : (
        <video
          key={currentStream.mirrorId}
          ref={videoRef}
          controls
          playsInline
          x-webkit-airplay="allow"
          className="w-full h-full bg-black"
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            saveWatchProgress(el.currentTime, el.duration);
          }}
          onError={() => handleStreamError(currentStream)}
        />
      )}

      <div className="absolute top-3 right-3 z-20 flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={handleCastClick}
          title={isCasting ? "Desconectar de la TV" : "Transmitir a TV"}
          aria-label={isCasting ? "Desconectar de la TV" : "Transmitir a TV"}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold border border-white/15 backdrop-blur-md shadow-lg transition ${
            isCasting
              ? "bg-netflix-red hover:bg-red-700"
              : "bg-black/75 hover:bg-netflix-red"
          }`}
        >
          <Cast className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {isCasting ? "Conectado a TV" : "Transmitir a TV"}
          </span>
        </button>

        <button
          type="button"
          onClick={handleToggleFullscreen}
          title={
            isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"
          }
          aria-label={
            isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/75 hover:bg-netflix-red text-white text-xs font-semibold border border-white/15 backdrop-blur-md shadow-lg transition"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Salir</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Pantalla completa</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
