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
} from "lucide-react";
import SmartVideoPlayer from "@/components/SmartVideoPlayer";
import { EpisodePlaybackDto } from "@/application/dto/SeriesDto";

export default function WatchEpisodePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const episodeId = params.id;

  const [playback, setPlayback] = useState<EpisodePlaybackDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<
    "Latino" | "Inglés (Sub)"
  >("Latino");
  const [detectedDurationSec, setDetectedDurationSec] = useState<number>(0);

  const loadPlayback = useCallback(async () => {
    setLoading(true);
    setDetectedDurationSec(0);
    try {
      const res = await fetch(`/api/series/episode/${episodeId}/playback`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo cargar el episodio.");
      }
      setPlayback(data.playback);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error cargando el episodio."
      );
    } finally {
      setLoading(false);
    }
  }, [episodeId]);

  useEffect(() => {
    loadPlayback();
  }, [loadPlayback]);

  const hasLatino = playback?.streams.some((s) => s.language === "Latino");
  const hasEnglish = playback?.streams.some(
    (s) => s.language === "Inglés (Sub)"
  );

  const handleNativeCastTrigger = useCallback(() => {
    window.dispatchEvent(new CustomEvent("piloto:trigger-cast"));
  }, []);

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col">
      {/* Barra de navegación superior con retroceso */}
      <header className="fixed top-0 inset-x-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-8 h-14 flex items-center justify-between">
        <Link
          href={playback ? `/series/${playback.seriesId}` : "/"}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-zinc-300 hover:text-white transition group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>
            {playback ? `Volver a ${playback.seriesTitle}` : "Volver al catálogo"}
          </span>
        </Link>

        {playback && (
          <div className="text-xs font-semibold text-zinc-400 hidden sm:block truncate max-w-md">
            <span className="text-zinc-200">{playback.seriesTitle}</span> •{" "}
            <span>
              T{playback.seasonNumber}:E{playback.episodeNumber}{" "}
              {playback.episodeTitle}
            </span>
          </div>
        )}
      </header>

      {/* Contenido principal */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-8 pt-20 pb-16 w-full space-y-6 sm:space-y-8">
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
            {/* Reproductor Inteligente de Video con funciones completas de TV Series */}
            <SmartVideoPlayer
              durationMins={Math.max(1, Math.round(playback.durationSeconds / 60))}
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
              onEpisodeSelect={(newEpId) => router.push(`/watch/episode/${newEpId}`)}
              onDurationChange={(durSec) => setDetectedDurationSec(durSec)}
            />

            {/* Metadatos del episodio y selector de idioma */}
            <div className="bg-zinc-900/40 border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
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
                <div className="flex flex-wrap items-center gap-2">
                  {(hasLatino || hasEnglish) && (
                    <div className="inline-flex items-center gap-1.5 bg-zinc-900 border border-white/10 rounded-full p-1">
                      <span className="pl-2.5 pr-1 text-zinc-400 flex items-center">
                        <Languages className="w-3.5 h-3.5 text-netflix-red" />
                      </span>
                      {hasLatino && (
                        <button
                          type="button"
                          onClick={() => setSelectedLanguage("Latino")}
                          className={`px-3 py-1 rounded-full text-xs transition ${
                            selectedLanguage === "Latino"
                              ? "bg-netflix-red text-white font-bold shadow"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          Audio Latino
                        </button>
                      )}
                      {hasEnglish && (
                        <button
                          type="button"
                          onClick={() => setSelectedLanguage("Inglés (Sub)")}
                          className={`px-3 py-1 rounded-full text-xs transition ${
                            selectedLanguage === "Inglés (Sub)"
                              ? "bg-netflix-red text-white font-bold shadow"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          Inglés (Sub)
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleNativeCastTrigger}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-netflix-red border border-white/10 text-xs font-semibold text-zinc-200 hover:text-white transition"
                  >
                    <Cast className="w-3.5 h-3.5 text-netflix-red group-hover:text-white" />
                    <span>Transmitir a TV</span>
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
              <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
                {playback.previousEpisode && (
                  <Link
                    href={`/watch/episode/${playback.previousEpisode.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-xs font-bold text-white transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>
                      Anterior: E{playback.previousEpisode.episodeNumber}
                    </span>
                  </Link>
                )}

                {playback.nextEpisode && (
                  <Link
                    href={`/watch/episode/${playback.nextEpisode.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white hover:bg-white/90 text-xs font-black text-black transition ml-auto shadow-md"
                  >
                    <span>
                      Siguiente: E{playback.nextEpisode.episodeNumber}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>

            {/* Explorador de temporadas y episodios debajo del reproductor */}
            <section className="space-y-4 pt-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-netflix-red" />
                  Más episodios de {playback.seriesTitle}
                </h2>
                <Link
                  href={`/series/${playback.seriesId}`}
                  className="text-xs font-semibold text-zinc-400 hover:text-white transition"
                >
                  Ver ficha completa
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(
                  playback.allSeasons.find(
                    (s) => s.seasonNumber === playback.seasonNumber
                  )?.episodes || []
                ).map((ep) => {
                  const isCurrent = ep.id === playback.episodeId;
                  return (
                    <Link
                      key={ep.id}
                      href={`/watch/episode/${ep.id}`}
                      className={`group flex items-center gap-3 p-2.5 rounded-xl border transition ${
                        isCurrent
                          ? "bg-netflix-red/10 border-netflix-red/60 text-white"
                          : "bg-zinc-900/60 border-white/5 hover:border-white/20 text-zinc-300 hover:text-white"
                      }`}
                    >
                      <div className="relative aspect-video w-24 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                        {ep.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ep.thumbnailUrl}
                            alt={ep.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-zinc-500 text-xs">
                            {ep.episodeNumber}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-xs font-bold truncate">
                          {ep.episodeNumber}. {ep.title}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {ep.duration} min
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

