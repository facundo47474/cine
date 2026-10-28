"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Hls from "hls.js";
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  Tv,
} from "lucide-react";
import { SignedMirrorStreamDto } from "@/application/dto/PlaybackStreamDto";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";

interface SmartVideoPlayerProps {
  movieId: string;
  movieTitle: string;
  durationMins: number;
  streams: SignedMirrorStreamDto[];
  initialProgressSeconds: number;
  onRefreshMirrors?: () => Promise<void>;
  isRefreshingMirrors?: boolean;
}

export default function SmartVideoPlayer({
  movieId,
  movieTitle,
  durationMins,
  streams,
  initialProgressSeconds,
  onRefreshMirrors,
  isRefreshingMirrors = false,
}: SmartVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedSecRef = useRef<number>(initialProgressSeconds);

  const [selectedLanguage, setSelectedLanguage] = useState<string>("Todos");
  // Sandbox desactivado por defecto para evitar el bloqueo "Please Disable Sandbox" en proveedores de embed
  const [sandboxEnabled, setSandboxEnabled] = useState<boolean>(false);
  const [activeMirrorId, setActiveMirrorId] = useState<string>(
    streams[0]?.mirrorId || ""
  );
  const [failedMirrorIds, setFailedMirrorIds] = useState<string[]>([]);
  const [failoverBanner, setFailoverBanner] = useState<string | null>(null);
  const [allMirrorsDown, setAllMirrorsDown] = useState<boolean>(
    streams.length === 0
  );

  useEffect(() => {
    if (streams.length > 0) {
      setActiveMirrorId(streams[0].mirrorId);
      setAllMirrorsDown(false);
    }
  }, [streams]);

  const availableLanguages = useMemo(() => {
    const langs = Array.from(new Set(streams.map((s) => s.language)));
    return ["Todos", ...langs];
  }, [streams]);

  const filteredStreams = useMemo(() => {
    if (selectedLanguage === "Todos") return streams;
    return streams.filter(
      (s) => s.language.toLowerCase() === selectedLanguage.toLowerCase()
    );
  }, [streams, selectedLanguage]);

  const currentStream: SignedMirrorStreamDto | undefined = useMemo(() => {
    return (
      filteredStreams.find((s) => s.mirrorId === activeMirrorId) ||
      filteredStreams[0] ||
      streams[0]
    );
  }, [filteredStreams, activeMirrorId, streams]);

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

  const handleStreamError = useCallback(
    async (failedStream: SignedMirrorStreamDto) => {
      const updatedFailed = failedMirrorIds.includes(failedStream.mirrorId)
        ? failedMirrorIds
        : [...failedMirrorIds, failedStream.mirrorId];

      setFailedMirrorIds(updatedFailed);

      fetch(`/api/mirrors/${failedStream.mirrorId}/report`, {
        method: "POST",
      }).catch(() => {});

      const nextAvailable = streams.find(
        (s) =>
          s.mirrorId !== failedStream.mirrorId &&
          !updatedFailed.includes(s.mirrorId)
      );

      if (nextAvailable) {
        setFailoverBanner(
          `El servidor "${failedStream.serverName}" no respondió. Conmutando automáticamente a "${nextAvailable.serverName}"...`
        );
        setSelectedLanguage("Todos");
        setActiveMirrorId(nextAvailable.mirrorId);
      } else {
        setAllMirrorsDown(true);
      }
    },
    [failedMirrorIds, streams]
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
      <div className="w-full aspect-video rounded-xl bg-zinc-900 border border-red-500/30 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-red-500" />
        <div className="space-y-2 max-w-md">
          <h3 className="text-lg font-bold text-white">
            Enlaces temporalmente no disponibles
          </h3>
          <p className="text-sm text-zinc-400">
            Todos los mirrors actuales de{" "}
            <span className="text-white font-semibold">{movieTitle}</span> no
            respondieron.
          </p>
          {onRefreshMirrors && (
            <button
              onClick={onRefreshMirrors}
              disabled={isRefreshingMirrors}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-netflix-red text-white text-xs font-bold hover:bg-red-700 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingMirrors ? "animate-spin" : ""}`} />
              Re-sincronizar Servidores en Español
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900/95 border border-white/10 rounded-xl p-4 space-y-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 mr-1">
              <Globe className="w-4 h-4 text-netflix-red" />
              Audio / Idioma:
            </span>
            {availableLanguages.map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  setSelectedLanguage(lang);
                  const firstInLang =
                    lang === "Todos"
                      ? streams[0]
                      : streams.find((s) => s.language === lang);
                  if (firstInLang) {
                    setActiveMirrorId(firstInLang.mirrorId);
                  }
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                  selectedLanguage === lang
                    ? "bg-white text-black shadow"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onRefreshMirrors && (
              <button
                type="button"
                onClick={onRefreshMirrors}
                disabled={isRefreshingMirrors}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-netflix-red/20 text-red-300 border border-netflix-red/40 hover:bg-netflix-red/30 transition disabled:opacity-50"
                title="Actualiza los enlaces guardados en Supabase con los nuevos servidores en Español"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMirrors ? "animate-spin" : ""}`} />
                <span>
                  {isRefreshingMirrors
                    ? "Actualizando..."
                    : "Actualizar Mirrors Español"}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSandboxEnabled((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border transition ${
                sandboxEnabled
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                  : "bg-zinc-800 text-zinc-300 border-white/15 hover:bg-zinc-700"
              }`}
            >
              {sandboxEnabled ? (
                <>
                  <Shield className="w-3.5 h-3.5" />
                  <span>Sandbox: Activado</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>Modo Compatible (Sin bloqueo Sandbox)</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 mr-1">
            <Server className="w-4 h-4 text-netflix-red" />
            <span>Servidores:</span>
          </div>

          {filteredStreams.map((stream) => {
            const isFailed = failedMirrorIds.includes(stream.mirrorId);
            const isSelected = currentStream.mirrorId === stream.mirrorId;

            return (
              <button
                key={stream.mirrorId}
                onClick={() => {
                  setFailoverBanner(null);
                  setActiveMirrorId(stream.mirrorId);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border ${
                  isSelected
                    ? "bg-netflix-red text-white border-netflix-red shadow-md"
                    : isFailed
                    ? "bg-red-950/40 text-red-300 border-red-500/30 line-through"
                    : "bg-zinc-800 text-zinc-300 border-white/10 hover:bg-zinc-700"
                }`}
              >
                <span>{stream.serverName}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30">
                  {stream.language} • {stream.format}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {failoverBanner && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" />
            <span>{failoverBanner}</span>
          </div>
          <button
            onClick={() => setFailoverBanner(null)}
            className="text-amber-200 hover:text-white underline text-[11px]"
          >
            Ocultar
          </button>
        </div>
      )}

      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/10 shadow-2xl">
        {currentStream.format === MirrorFormat.EMBED ? (
          <iframe
            key={`${currentStream.mirrorId}-${sandboxEnabled ? "sb" : "nosb"}`}
            src={currentStream.streamUrl}
            title={movieTitle}
            className="w-full h-full border-0"
            {...(sandboxEnabled
              ? {
                  sandbox:
                    "allow-scripts allow-same-origin allow-forms allow-presentation",
                }
              : {})}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            onError={() => handleStreamError(currentStream)}
          />
        ) : (
          <video
            key={currentStream.mirrorId}
            ref={videoRef}
            controls
            playsInline
            className="w-full h-full bg-black"
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              saveWatchProgress(el.currentTime, el.duration);
            }}
            onError={() => handleStreamError(currentStream)}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 px-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>
            Servidor activo:{" "}
            <strong className="text-zinc-200">{currentStream.serverName}</strong>{" "}
            ({currentStream.quality} • {currentStream.format} • Token AES-256-GCM)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Tv className="w-3.5 h-3.5" />
            <button
              onClick={() => handleStreamError(currentStream)}
              className="text-netflix-red hover:underline font-medium"
            >
              Cambiar al siguiente Mirror
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
