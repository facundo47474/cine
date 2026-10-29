"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
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
}

interface FullscreenContainerElement extends HTMLDivElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

export default function SmartVideoPlayer({
  movieId,
  movieTitle,
  durationMins,
  streams,
  initialProgressSeconds,
}: SmartVideoPlayerProps) {
  const playerContainerRef = useRef<FullscreenContainerElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedSecRef = useRef<number>(initialProgressSeconds);

  const [allMirrorsDown, setAllMirrorsDown] = useState<boolean>(
    streams.length === 0
  );
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState<boolean>(false);

  useEffect(() => {
    setAllMirrorsDown(streams.length === 0);
  }, [streams]);

  // Única opción activa (Opción 1 - Streamwish)
  const currentStream: SignedMirrorStreamDto | undefined = streams[0];

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

  // Sincronizar estado con eventos de Fullscreen nativo (Android / Desktop / iPadOS)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as FullscreenDocument;
      const active = Boolean(
        doc.fullscreenElement || doc.webkitFullscreenElement
      );
      setIsFullscreen(active);
      if (!active) {
        try {
          if (screen.orientation && "unlock" in screen.orientation) {
            screen.orientation.unlock();
          }
        } catch {
          // Ignorar en navegadores que no soportan orientation unlock
        }
      }
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

  // Bloquear el scroll del body cuando se activa el modo pantalla completa en iOS (CSS fallback)
  useEffect(() => {
    if (isCssFullscreen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [isCssFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    const container = playerContainerRef.current;
    const doc = document as FullscreenDocument;

    // Salir si ya está en pantalla completa (nativa o CSS iOS)
    if (isFullscreen || isCssFullscreen) {
      if (doc.fullscreenElement && doc.exitFullscreen) {
        await doc.exitFullscreen().catch(() => {});
      } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
      setIsCssFullscreen(false);
      setIsFullscreen(false);
      return;
    }

    if (!container) return;

    try {
      if (container.requestFullscreen) {
        await container.requestFullscreen();
        try {
          const orientation = screen.orientation as unknown as {
            lock?: (mode: string) => Promise<void>;
          };
          if (orientation?.lock) {
            await orientation.lock("landscape").catch(() => {});
          }
        } catch {
          // Ignorar si el dispositivo no permite bloqueo de orientación
        }
        return;
      }

      if (container.webkitRequestFullscreen) {
        await container.webkitRequestFullscreen();
        return;
      }

      // Fallback para iOS Safari (iPhone) donde requestFullscreen en contenedores de iframe no está disponible
      setIsCssFullscreen(true);
    } catch {
      setIsCssFullscreen(true);
    }
  }, [isFullscreen, isCssFullscreen]);

  const handleStreamError = useCallback(
    (failedStream: SignedMirrorStreamDto) => {
      fetch(`/api/mirrors/${failedStream.mirrorId}/report`, {
        method: "POST",
      }).catch(() => {});
      setAllMirrorsDown(true);
    },
    []
  );

  useEffect(() => {
    if (!currentStream || currentStream.format === MirrorFormat.EMBED) return;

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
  }, [currentStream, initialProgressSeconds, handleStreamError]);

  if (allMirrorsDown || !currentStream) {
    return (
      <div className="w-full aspect-video rounded-xl sm:rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center p-6 sm:p-8 text-center space-y-3">
        <AlertTriangle className="w-9 h-9 sm:w-10 sm:h-10 text-netflix-red" />
        <h3 className="text-sm sm:text-base font-bold text-white">
          Este título no se encuentra disponible en este momento
        </h3>
        <p className="text-xs text-zinc-400 max-w-md">
          Intenta nuevamente en unos minutos o explora otra película de nuestro catálogo.
        </p>
      </div>
    );
  }

  const activeFull = isFullscreen || isCssFullscreen;

  return (
    <div className="w-full">
      <div
        ref={playerContainerRef}
        className={
          activeFull
            ? "fixed inset-0 z-[9999] w-screen h-[100dvh] bg-black flex items-center justify-center"
            : "relative w-full aspect-video rounded-xl sm:rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl"
        }
      >
        {currentStream.format === MirrorFormat.EMBED ? (
          <iframe
            key={currentStream.mirrorId}
            src={currentStream.streamUrl}
            title={movieTitle}
            className="w-full h-full border-0"
            allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *; accelerometer *; gyroscope *"
            allowFullScreen
            // @ts-expect-error Atributos legacy requeridos por WebKit en iOS/Android WebView
            webkitallowfullscreen="true"
            mozallowfullscreen="true"
            playsInline
            onError={() => handleStreamError(currentStream)}
          />
        ) : (
          <video
            key={currentStream.mirrorId}
            ref={videoRef}
            controls
            playsInline
            webkit-playsinline="true"
            className="w-full h-full bg-black"
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              saveWatchProgress(el.currentTime, el.duration);
            }}
            onError={() => handleStreamError(currentStream)}
          />
        )}

        {/* Botón auxiliar de pantalla completa para iOS Safari y Android */}
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={
            activeFull ? "Salir de pantalla completa" : "Pantalla completa"
          }
          className="absolute top-3 right-3 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/75 hover:bg-netflix-red text-white text-xs font-semibold backdrop-blur-md border border-white/20 shadow-lg transition active:scale-95"
        >
          {activeFull ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Salir</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden xs:inline sm:inline">
                Pantalla completa
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
