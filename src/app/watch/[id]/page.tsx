"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Cast, Clock, Film, Languages, Star } from "lucide-react";
import SmartVideoPlayer from "@/components/SmartVideoPlayer";
import { MoviePlaybackDto } from "@/application/dto/PlaybackStreamDto";

export default function WatchMoviePage() {
  const params = useParams<{ id: string }>();
  const movieId = params.id;

  const [movie, setMovie] = useState<MoviePlaybackDto | null>(null);
  const [savedProgress, setSavedProgress] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<
    "Latino" | "Inglés (Sub)"
  >("Latino");

  const loadPlayback = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/movies/${movieId}/play`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo cargar la película.");
      }
      setMovie(data.movie);
      setSavedProgress(data.savedProgressSeconds || 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error cargando la película."
      );
    } finally {
      setLoading(false);
    }
  }, [movieId]);

  useEffect(() => {
    if (movieId) {
      loadPlayback();
    }
  }, [movieId, loadPlayback]);

  const hasLatino =
    movie?.streams.some((s) => s.language === "Latino") ?? false;
  const hasEnglish =
    movie?.streams.some((s) => s.language === "Inglés (Sub)") ?? false;

  useEffect(() => {
    if (!movie) return;
    if (!hasLatino && hasEnglish) {
      setSelectedLanguage("Inglés (Sub)");
    } else if (hasLatino) {
      setSelectedLanguage("Latino");
    }
  }, [movie, hasLatino, hasEnglish]);

  const handleNativeCastTrigger = useCallback(() => {
    window.dispatchEvent(new CustomEvent("piloto:trigger-cast"));
  }, []);

  return (
    <div className="min-h-screen bg-[#141414] text-white pb-12 sm:pb-16">
      <header className="border-b border-white/10 bg-black/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-8 h-14 sm:h-16 flex items-center justify-between">
          <Link
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-300 hover:text-white transition py-1.5"
            href="/"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al catálogo</span>
          </Link>

          <Link className="flex items-center gap-2" href="/">
            <Film className="w-4 h-4 text-netflix-red" />
            <span className="font-black tracking-tight text-netflix-red text-sm sm:text-base">
              PILOTO
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-8 pt-4 sm:pt-6 space-y-6 sm:space-y-8">
        {loading ? (
          <div className="aspect-video w-full rounded-xl sm:rounded-2xl bg-zinc-900 animate-pulse flex items-center justify-center text-xs sm:text-sm text-zinc-400">
            Cargando película...
          </div>
        ) : error || !movie ? (
          <div className="p-6 sm:p-8 rounded-xl sm:rounded-2xl bg-zinc-900 border border-white/10 text-center space-y-4">
            <p className="text-sm sm:text-base text-zinc-200 font-semibold">
              {error || "Película no disponible"}
            </p>
            <Link
              className="inline-block px-5 py-2.5 rounded-lg bg-netflix-red text-white text-xs font-bold"
              href="/"
            >
              Regresar al Inicio
            </Link>
          </div>
        ) : (
          <>
            <SmartVideoPlayer
              durationMins={movie.durationMins}
              initialProgressSeconds={savedProgress}
              movieId={movie.id}
              movieTitle={movie.title}
              preferredLanguage={selectedLanguage}
              streams={movie.streams}
            />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 sm:gap-8 bg-zinc-900/40 border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
              <div className="hidden md:block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={movie.posterUrl}
                  alt={movie.title}
                  className="w-full rounded-xl border border-white/10 shadow-lg"
                />
              </div>

              <div className="md:col-span-3 space-y-3 sm:space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs font-semibold">
                    <span className="px-2.5 py-0.5 rounded bg-netflix-red text-white">
                      {movie.qualityBadge}
                    </span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <Star className="w-4 h-4 fill-amber-400" />
                      {movie.rating.toFixed(1)}
                    </span>
                    <span className="text-zinc-300">{movie.releaseYear}</span>
                    <span className="flex items-center gap-1 text-zinc-300">
                      <Clock className="w-3.5 h-3.5" />
                      {movie.durationMins} min
                    </span>
                  </div>

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

                <h1 className="text-xl sm:text-3xl font-black text-white leading-tight">
                  {movie.title}
                </h1>

                <p className="text-xs sm:text-base text-zinc-300 leading-relaxed">
                  {movie.synopsis}
                </p>

                <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-1 sm:pt-2">
                  {movie.genres.map((g) => (
                    <span
                      key={g}
                      className="text-[11px] sm:text-xs px-2.5 sm:px-3 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
