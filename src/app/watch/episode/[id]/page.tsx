"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Cast,
  Clock,
  Languages,
  ChevronRight,
  ChevronLeft,
  Play,
  Layers,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import SmartVideoPlayer from "@/components/SmartVideoPlayer";
import { EpisodePlaybackDto } from "@/application/dto/SeriesDto";
import { useMembership } from "@/components/MembershipProvider";

/**
 * Espera un breve intervalo cancelable mediante `AbortSignal` antes de reintentar una petición.
 */
function esperarConAborto(
  milliseconds: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Página de reproducción dedicada para capítulos de Series de TV (`/watch/episode/[id]`).
 *
 * Incluye selector de idioma (Audio Latino / Inglés Subtitulado), disparo de Chromecast/AirPlay,
 * navegación rápida al capítulo anterior/siguiente y explorador de episodios de la temporada actual.
 */
export default function WatchEpisodePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const episodeId = params.id;
  const { isPro, openUpgradeModal } = useMembership();

  const [playback, setPlayback] = useState<EpisodePlaybackDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<
    "Latino" | "Inglés (Sub)"
  >("Latino");
  const [detectedDurationSec, setDetectedDurationSec] = useState<number>(0);

  /**
   * Carga los datos de reproducción y enlaces firmados del episodio actual,
   * con soporte de cancelación y reintento automático ante fallos transitorios.
   */
  const loadPlayback = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      setDetectedDurationSec(0);

      try {
        for (let intento = 0; intento <= 1; intento++) {
          if (signal?.aborted) return;

          if (intento > 0) {
            await esperarConAborto(600, signal);
          }

          try {
            const response = await fetch(
              `/api/series/episode/${episodeId}/playback`,
              {
                cache: "no-store",
                signal,
              }
            );
            const data = await response.json();

            if (!response.ok || !data.ok) {
              const errorMessage =
                data.error || "No se pudo cargar el episodio.";
              if (response.status === 404 || intento === 1) {
                throw new Error(errorMessage);
              }
              continue;
            }

            if (!signal?.aborted) {
              setPlayback(data.playback);
            }
            return;
          } catch (attemptError) {
            const isAbort =
              signal?.aborted ||
              (attemptError instanceof Error &&
                attemptError.name === "AbortError");
            if (isAbort || intento === 1) {
              throw attemptError;
            }
          }
        }
      } catch (err) {
        const isAbort =
          signal?.aborted ||
          (err instanceof Error && err.name === "AbortError");
        if (!isAbort) {
          setError(
            err instanceof Error ? err.message : "Error cargando el episodio."
          );
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [episodeId]
  );

  useEffect(() => {
    if (!episodeId) return;
    const controller = new AbortController();
    void loadPlayback(controller.signal);
    return () => controller.abort();
  }, [episodeId, loadPlayback]);

  const hasLatino =
    playback?.streams.some((stream) => stream.language === "Latino") ?? false;
  const hasEnglish =
    playback?.streams.some((stream) => stream.language === "Inglés (Sub)") ??
    false;

  /**
   * Sincroniza automáticamente el idioma activo cuando el episodio solo cuenta con pistas en inglés
   * o vuelve a tener pistas en español latino al cambiar de capítulo.
   */
  useEffect(() => {
    if (!playback) return;
    if (!hasLatino && hasEnglish) {
      setSelectedLanguage("Inglés (Sub)");
    } else if (hasLatino) {
      setSelectedLanguage("Latino");
    }
  }, [playback, hasLatino, hasEnglish]);

  /**
   * Dispara el evento global para abrir el selector nativo de Chromecast / AirPlay del reproductor.
   */
  const handleNativeCastTrigger = useCallback(() => {
    window.dispatchEvent(new CustomEvent("piloto:trigger-cast"));
  }, []);

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col">
      {/* Barra de navegación superior con retroceso a la ficha de la serie */}
      <header className="fixed top-0 inset-x-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10 px-3 sm:px-8 h-14 flex items-center justify-between gap-3">
        <Link
          href={playback ? `/series/${playback.seriesId}` : "/"}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-zinc-300 hover:text-white transition group min-w-0 max-w-full"
        >
          <ArrowLeft className="w-4 h-4 flex-shrink-0 group-hover:-translate-x-1 transition-transform" />
          <span className="truncate">
            {playback
              ? `Volver a ${playback.seriesTitle}`
              : "Volver al catálogo"}
          </span>
        </Link>

        {playback && (
          <>
            <span className="sm:hidden flex-shrink-0 px-2 py-0.5 rounded bg-amber-500/90 text-black text-[11px] font-extrabold">
              T{playback.seasonNumber}:E{playback.episodeNumber}
            </span>
            <div className="text-xs font-semibold text-zinc-400 hidden sm:block truncate max-w-md">
              <span className="text-zinc-200">{playback.seriesTitle}</span> •{" "}
              <span>
                T{playback.seasonNumber}:E{playback.episodeNumber}{" "}
                {playback.episodeTitle}
              </span>
            </div>
          </>
        )}
      </header>

      {/* Contenido principal */}
      <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-8 pt-20 pb-16 w-full space-y-6 sm:space-y-8">
        {loading ? (
          <div className="w-full aspect-video rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 border-4 border-netflix-red border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-zinc-400 font-medium">
              Cargando reproductor de video...
            </p>
          </div>
        ) : error || !playback ? (
          <div className="w-full aspect-video rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <h2 className="text-lg font-bold text-white">
              {error || "Episodio no encontrado."}
            </h2>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-lg bg-netflix-red text-white text-xs font-bold hover:bg-red-700 transition"
            >
              Volver al catálogo principal
            </Link>
          </div>
        ) : (
          <>
            {/* Reproductor Inteligente de Video con funciones de TV Series */}
            <SmartVideoPlayer
              durationMins={Math.max(
                1,
                Math.round(playback.durationSeconds / 60)
              )}
              initialProgressSeconds={playback.savedProgressSeconds}
              movieTitle={playback.episodeTitle}
              preferredLanguage={selectedLanguage}
              streams={playback.streams}
              episodeId={playback.episodeId}
              seriesId={playback.seriesId}
              seriesTitle={playback.seriesTitle}
              seasonNumber={playback.seasonNumber}
              episodeNumber={playback.episodeNumber}
              episodeTitle={playback.episodeTitle}
              introStart={playback.introStart}
              introEnd={playback.introEnd}
              nextEpisode={playback.nextEpisode}
              previousEpisode={playback.previousEpisode}
              allSeasons={playback.allSeasons}
              onEpisodeSelect={(newEpisodeId) =>
                router.push(`/watch/episode/${newEpisodeId}`)
              }
              onDurationChange={(durationSeconds) =>
                setDetectedDurationSec(durationSeconds)
              }
            />

            {/* Metadatos del episodio y selector de idioma */}
            <div className="bg-zinc-900/40 border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-semibold">
                  <span className="px-2.5 py-0.5 rounded bg-amber-500/90 text-black font-extrabold uppercase">
                    T{playback.seasonNumber}:E{playback.episodeNumber}
                  </span>
                  <span className="flex items-center gap-1 text-zinc-300">
                    <Clock className="w-3.5 h-3.5" />
                    {Math.max(
                      1,
                      Math.round(
                        (detectedDurationSec > 60
                          ? detectedDurationSec
                          : playback.durationSeconds) / 60
                      )
                    )}{" "}
                    min
                  </span>
                </div>

                {/* Selector de idioma + Transmitir a TV */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                  {(hasLatino || hasEnglish) && (
                    <div className="flex sm:inline-flex items-center gap-1 bg-zinc-900 border border-white/10 rounded-full p-1 w-full sm:w-auto">
                      <span className="pl-2 pr-1 text-zinc-400 flex items-center flex-shrink-0">
                        <Languages className="w-3.5 h-3.5 text-netflix-red" />
                      </span>
                      {[
                        { visible: hasLatino, value: "Latino" as const, label: "Audio Latino" },
                        { visible: hasEnglish, value: "Inglés (Sub)" as const, label: "Inglés (Sub)" },
                      ]
                        .filter((lang) => lang.visible)
                        .map((lang) => (
                          <button
                            key={lang.value}
                            type="button"
                            onClick={() => setSelectedLanguage(lang.value)}
                            className={`flex-1 sm:flex-initial text-center px-3 py-1.5 sm:py-1 rounded-full text-xs transition ${
                              selectedLanguage === lang.value
                                ? "bg-netflix-red text-white font-bold shadow"
                                : "text-zinc-400 hover:text-white"
                            }`}
                          >
                            {lang.label}
                          </button>
                        ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => openUpgradeModal("modo_escudo")}
                    className={`inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-3.5 py-2 sm:py-1.5 rounded-full border text-xs font-semibold transition ${
                      isPro
                        ? "bg-emerald-500/15 border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/25"
                        : "bg-zinc-900 hover:bg-netflix-red border-white/10 text-zinc-200 hover:text-white"
                    }`}
                  >
                    {isPro ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <ShieldOff className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span>
                      {isPro ? "Modo Escudo Activo" : "Modo Escudo"}
                    </span>
                    {!isPro && (
                      <span className="px-1.5 py-0.5 rounded bg-netflix-red text-white text-[9px] font-black uppercase">
                        PRO
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleNativeCastTrigger}
                    className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-3.5 py-2 sm:py-1.5 rounded-full bg-zinc-900 hover:bg-netflix-red border border-white/10 text-xs font-semibold text-zinc-200 hover:text-white transition"
                  >
                    <Cast className="w-3.5 h-3.5 text-netflix-red group-hover:text-white" />
                    <span>Transmitir a TV</span>
                    {!isPro && (
                      <span className="px-1.5 py-0.5 rounded bg-netflix-red text-white text-[9px] font-black uppercase">
                        PRO
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">
                  {playback.episodeTitle}
                </h1>
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed mt-1.5 max-w-3xl">
                  {playback.overview ||
                    "Disfruta de este capítulo en calidad Full HD sin anuncios invasivos."}
                </p>
              </div>

              {/* Botones de navegación Anterior / Siguiente */}
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 pt-3 border-t border-zinc-800">
                {playback.previousEpisode && (
                  <Link
                    href={`/watch/episode/${playback.previousEpisode.id}`}
                    className="inline-flex items-center justify-center flex-1 sm:flex-initial gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-xs font-bold text-white transition text-center"
                  >
                    <ChevronLeft className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Anterior: E{playback.previousEpisode.episodeNumber}
                    </span>
                  </Link>
                )}

                {playback.nextEpisode && (
                  <Link
                    href={`/watch/episode/${playback.nextEpisode.id}`}
                    className="inline-flex items-center justify-center flex-1 sm:flex-initial gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-white hover:bg-white/90 text-xs font-black text-black transition sm:ml-auto shadow-md text-center"
                  >
                    <span>
                      Siguiente: E{playback.nextEpisode.episodeNumber}
                    </span>
                    <ChevronRight className="w-4 h-4 flex-shrink-0" />
                  </Link>
                )}
              </div>
            </div>

            {/* Explorador de temporadas y episodios debajo del reproductor */}
            <section className="space-y-4 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 pb-3 border-b border-zinc-800">
                <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2 min-w-0">
                  <Layers className="w-5 h-5 text-netflix-red flex-shrink-0" />
                  <span className="truncate">
                    Más episodios de {playback.seriesTitle}
                  </span>
                </h2>
                <Link
                  href={`/series/${playback.seriesId}`}
                  className="text-xs font-semibold text-zinc-400 hover:text-white transition flex-shrink-0"
                >
                  Ver ficha completa
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(
                  playback.allSeasons.find(
                    (season) => season.seasonNumber === playback.seasonNumber
                  )?.episodes || []
                ).map((episodeItem) => {
                  const isCurrent = episodeItem.id === playback.episodeId;
                  return (
                    <Link
                      key={episodeItem.id}
                      href={`/watch/episode/${episodeItem.id}`}
                      className={`group flex items-center gap-3 p-2.5 rounded-xl border transition ${
                        isCurrent
                          ? "bg-netflix-red/10 border-netflix-red/60 text-white"
                          : "bg-zinc-900/60 border-white/5 hover:border-white/20 text-zinc-300 hover:text-white"
                      }`}
                    >
                      <div className="relative aspect-video w-24 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                        {episodeItem.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={episodeItem.thumbnailUrl}
                            alt={episodeItem.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-zinc-500 text-xs">
                            {episodeItem.episodeNumber}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-xs font-bold truncate">
                          {episodeItem.episodeNumber}. {episodeItem.title}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {episodeItem.duration} min
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
