"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import Hls from "hls.js";
import { AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import { SignedMirrorStreamDto } from "@/application/dto/PlaybackStreamDto";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";

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

interface ExtractedTimeTelemetry {
  currentTime: number;
  duration?: number;
}

/**
 * Extrae telemetría de tiempo real (`currentTime` y `duration`) desde eventos `postMessage`
 * emitidos por reproductores embebidos (JWPlayer, PlayerJS, VidSrc MEDIA_DATA, Video.js, etc.).
 */
function extractTimeTelemetry(rawData: unknown): ExtractedTimeTelemetry | null {
  try {
    const parsed: Record<string, unknown> | null =
      typeof rawData === "string"
        ? (JSON.parse(rawData) as Record<string, unknown>)
        : typeof rawData === "object" && rawData !== null
        ? (rawData as Record<string, unknown>)
        : null;

    if (!parsed) return null;

    if (
      parsed.type === "PILOTO_TIME_UPDATE" &&
      typeof parsed.currentTime === "number"
    ) {
      return {
        currentTime: parsed.currentTime,
        duration:
          typeof parsed.duration === "number" ? parsed.duration : undefined,
      };
    }

    if (
      parsed.type === "MEDIA_DATA" &&
      typeof parsed.data === "object" &&
      parsed.data !== null
    ) {
      const mediaData = parsed.data as Record<string, unknown>;
      const ct = Number(
        mediaData.currentTime ?? mediaData.time ?? mediaData.position
      );
      const dur = Number(mediaData.duration);
      if (Number.isFinite(ct) && ct >= 0) {
        return {
          currentTime: ct,
          duration: Number.isFinite(dur) && dur > 60 ? dur : undefined,
        };
      }
    }

    const eventName = String(
      parsed.event ?? parsed.type ?? parsed.action ?? ""
    ).toLowerCase();

    if (
      eventName === "time" ||
      eventName === "timeupdate" ||
      eventName === "seek" ||
      eventName === "progress"
    ) {
      const nested =
        typeof parsed.data === "object" && parsed.data !== null
          ? (parsed.data as Record<string, unknown>)
          : parsed;
      const rawCurrent =
        nested.currentTime ??
        nested.position ??
        nested.time ??
        nested.seconds ??
        parsed.value;
      const rawDuration = nested.duration ?? parsed.duration;
      const ct = Number(rawCurrent);
      const dur = Number(rawDuration);

      if (Number.isFinite(ct) && ct >= 0) {
        return {
          currentTime: ct,
          duration: Number.isFinite(dur) && dur > 60 ? dur : undefined,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

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

  const fallbackDurationSec = Math.max(600, (durationMins || 120) * 60);
  const [playbackStarted, setPlaybackStarted] = useState<boolean>(
    initialProgressSeconds > 0
  );

  const lastSavedSecRef = useRef<number>(
    Math.max(0, Math.floor(initialProgressSeconds || 0))
  );
  const currentProgressRef = useRef<number>(
    Math.max(0, Math.floor(initialProgressSeconds || 0))
  );
  const totalDurationRef = useRef<number>(fallbackDurationSec);
  const hasDirectTelemetryRef = useRef<boolean>(false);
  const initialResumeSecRef = useRef<number>(
    Math.max(0, Math.floor(initialProgressSeconds || 0))
  );

  useEffect(() => {
    const cleanInit = Math.max(0, Math.floor(initialProgressSeconds || 0));
    currentProgressRef.current = cleanInit;
    lastSavedSecRef.current = cleanInit;
    initialResumeSecRef.current = cleanInit;
    if (cleanInit > 0) {
      setPlaybackStarted(true);
    }
  }, [initialProgressSeconds, movieId]);

  useEffect(() => {
    const nextDur = Math.max(600, (durationMins || 120) * 60);
    totalDurationRef.current = nextDur;
  }, [durationMins]);

  const orderedStreams = useMemo(() => {
    const sorted = [...streams].sort((a, b) => a.priority - b.priority);
    const matching = sorted.filter((s) => s.language === preferredLanguage);
    const fallback = sorted.filter((s) => s.language !== preferredLanguage);
    return [...matching, ...fallback];
  }, [streams, preferredLanguage]);

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [allMirrorsDown, setAllMirrorsDown] = useState<boolean>(
    orderedStreams.length === 0
  );
  const [shieldActive, setShieldActive] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [tunnelUsingSecondary, setTunnelUsingSecondary] =
    useState<boolean>(false);

  useEffect(() => {
    setActiveIndex(0);
    setAllMirrorsDown(orderedStreams.length === 0);
    setShieldActive(true);
    setTunnelUsingSecondary(false);
  }, [orderedStreams, preferredLanguage]);

  useEffect(() => {
    setTunnelUsingSecondary(false);
  }, [activeIndex]);

  const currentStream: SignedMirrorStreamDto | undefined =
    orderedStreams[activeIndex];

  const isPrimaryServerActive = Boolean(
    currentStream &&
      activeIndex === 0 &&
      currentStream.serverName.toLowerCase().includes("streamwish") &&
      !tunnelUsingSecondary
  );

  /**
   * Bloqueo de window.open y recuperación automática de foco cuando un anuncio
   * dentro del iframe intenta desviar al usuario hacia una ventana emergente.
   */
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

  /**
   * Sincronización con el estado de Pantalla Completa nativa del contenedor.
   */
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

  /**
   * Absorbe la primera interacción publicitaria y libera los controles del reproductor,
   * rearmando el escudo únicamente tras 4 minutos sin interacción.
   */
  const handleShieldAbsorb = useCallback(() => {
    setShieldActive(false);
    setPlaybackStarted(true);
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
    async (
      currentSeconds: number,
      totalDurationSeconds: number,
      force: boolean = false
    ) => {
      const safeCurrent = Math.max(0, Math.floor(currentSeconds || 0));
      const safeDuration = Math.max(
        600,
        Math.floor(totalDurationSeconds || 0) || (durationMins || 120) * 60
      );

      if (!force && safeCurrent <= 0) return;
      if (
        !force &&
        Math.abs(safeCurrent - lastSavedSecRef.current) < 5 &&
        lastSavedSecRef.current > 0
      ) {
        return;
      }

      lastSavedSecRef.current = safeCurrent;

      try {
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            movieId,
            progressSeconds: safeCurrent,
            durationSeconds: safeDuration,
          }),
        });
      } catch {
        // Silencioso
      }
    },
    [movieId, durationMins]
  );

  /**
   * Guardado garantizado (flush con keepalive) al salir de la página, cambiar de pestaña o desmontar.
   */
  useEffect(() => {
    const flushLatestProgress = () => {
      if (currentProgressRef.current > 0) {
        void saveWatchProgress(
          currentProgressRef.current,
          totalDurationRef.current,
          true
        );
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushLatestProgress();
      }
    };

    window.addEventListener("pagehide", flushLatestProgress);
    window.addEventListener("beforeunload", flushLatestProgress);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      flushLatestProgress();
      window.removeEventListener("pagehide", flushLatestProgress);
      window.removeEventListener("beforeunload", flushLatestProgress);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [saveWatchProgress]);

  /**
   * Cronómetro en tiempo real segundo a segundo para reproductores EMBED cuando el iframe
   * cross-origin no emite telemetría directa por postMessage.
   */
  useEffect(() => {
    if (!currentStream || currentStream.format !== MirrorFormat.EMBED) return;

    const tick = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (hasDirectTelemetryRef.current) return;
      if (!playbackStarted && shieldActive) return;

      const nextSec = Math.min(
        totalDurationRef.current - 5,
        currentProgressRef.current + 1
      );
      currentProgressRef.current = nextSec;

      if (nextSec - lastSavedSecRef.current >= 5) {
        void saveWatchProgress(nextSec, totalDurationRef.current, false);
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [currentStream, playbackStarted, shieldActive, saveWatchProgress]);

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

  /**
   * Escucha señales del túnel (`PILOTO_STREAM_ERROR`, `PILOTO_SECONDARY_SERVER_ACTIVE`)
   * y telemetría automática de tiempo real (`PILOTO_TIME_UPDATE` / `postMessage`) desde el reproductor.
   */
  useEffect(() => {
    if (!currentStream) return;

    const handleTunnelMessage = (event: MessageEvent) => {
      const payload = event.data as
        | { type?: string; mirrorId?: string }
        | undefined;
      if (
        payload?.type === "PILOTO_STREAM_ERROR" &&
        (!payload.mirrorId || payload.mirrorId === currentStream.mirrorId)
      ) {
        handleStreamError(currentStream);
        return;
      }

      if (
        payload?.type === "PILOTO_SECONDARY_SERVER_ACTIVE" &&
        (!payload.mirrorId || payload.mirrorId === currentStream.mirrorId)
      ) {
        setTunnelUsingSecondary(true);
        return;
      }

      const telemetry = extractTimeTelemetry(event.data);
      if (telemetry && telemetry.currentTime > 0) {
        hasDirectTelemetryRef.current = true;
        setPlaybackStarted(true);

        const cleanSec = Math.floor(telemetry.currentTime);
        currentProgressRef.current = cleanSec;

        if (telemetry.duration && telemetry.duration > 60) {
          totalDurationRef.current = Math.floor(telemetry.duration);
        }

        const jumped = Math.abs(cleanSec - lastSavedSecRef.current) >= 10;
        void saveWatchProgress(
          cleanSec,
          totalDurationRef.current,
          jumped
        );
      }
    };

    window.addEventListener("message", handleTunnelMessage);
    return () => {
      window.removeEventListener("message", handleTunnelMessage);
    };
  }, [currentStream, handleStreamError, saveWatchProgress]);

  useEffect(() => {
    if (!currentStream || currentStream.format === MirrorFormat.EMBED) {
      return;
    }

    const videoElement = videoRef.current;
    if (!videoElement) return;

    let hlsInstance: Hls | null = null;

    const onLoadedMetadata = () => {
      if (videoElement.duration && Number.isFinite(videoElement.duration)) {
        totalDurationRef.current = Math.floor(videoElement.duration);
      }
      if (initialResumeSecRef.current > 5 && videoElement.currentTime < 2) {
        videoElement.currentTime = initialResumeSecRef.current;
      }
    };

    if (currentStream.format === MirrorFormat.HLS && Hls.isSupported()) {
      hlsInstance = new Hls({ enableWorker: true });
      hlsInstance.loadSource(currentStream.streamUrl);
      hlsInstance.attachMedia(videoElement);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        if (initialResumeSecRef.current > 5) {
          videoElement.currentTime = initialResumeSecRef.current;
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
  }, [currentStream, handleStreamError]);

  const embedSrcWithResume = useMemo(() => {
    if (!currentStream) return "";
    const resumeSec = initialResumeSecRef.current;
    if (resumeSec <= 5) return currentStream.streamUrl;
    const separator = currentStream.streamUrl.includes("?") ? "&" : "?";
    return `${currentStream.streamUrl}${separator}t=${resumeSec}`;
  }, [currentStream]);

  if (allMirrorsDown || !currentStream) {
    return (
      <div className="w-full aspect-video rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center p-8 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-netflix-red" />
        <h3 className="text-base font-bold text-white">
          Este título no se encuentra disponible en este momento
        </h3>
        <p className="text-xs text-zinc-400 max-w-md">
          Intenta nuevamente en unos minutos o explora otra película de nuestro
          catálogo.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => {
        if (shieldActive) {
          setShieldActive(false);
          setPlaybackStarted(true);
        }
      }}
      className="group relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl"
    >
      {currentStream.format === MirrorFormat.EMBED ? (
        <>
          <iframe
            ref={iframeRef}
            key={currentStream.mirrorId}
            src={embedSrcWithResume}
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
          onPlay={() => setPlaybackStarted(true)}
          onSeeked={(e) => {
            const el = e.currentTarget;
            const cur = Math.floor(el.currentTime || 0);
            const dur = Math.floor(el.duration || totalDurationRef.current);
            currentProgressRef.current = cur;
            if (dur > 60) {
              totalDurationRef.current = dur;
            }
            void saveWatchProgress(cur, dur, true);
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            const cur = Math.floor(el.currentTime || 0);
            const dur = Math.floor(el.duration || totalDurationRef.current);
            currentProgressRef.current = cur;
            if (dur > 60) {
              totalDurationRef.current = dur;
            }
            void saveWatchProgress(cur, dur, false);
          }}
          onError={() => handleStreamError(currentStream)}
        />
      )}

      {/* Control flotante superior: Pantalla Completa (solo visible si ejecuta el servidor principal) */}
      {(isPrimaryServerActive || isFullscreen) && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
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
      )}
    </div>
  );
}
