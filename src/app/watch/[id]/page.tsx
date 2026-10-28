"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Clock, Film, ShieldCheck, Star } from "lucide-react";
import SmartVideoPlayer from "@/components/SmartVideoPlayer";
import { MoviePlaybackDto } from "@/application/dto/PlaybackStreamDto";

export default function WatchMoviePage() {
  const params = useParams<{ id: string }>();
  const movieId = params.id;

  const [movie, setMovie] = useState<MoviePlaybackDto | null>(null);
  const [savedProgress, setSavedProgress] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshingMirrors, setRefreshingMirrors] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
        err instanceof Error ? err.message : "Error cargando reproductor."
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

  const handleRefreshMirrors = async () => {
    if (!movie) return;
    setRefreshingMirrors(true);
    try {
      const res = await fetch(`/api/movies/${movie.id}/refresh-mirrors`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.ok && data.movie) {
        setMovie(data.movie);
      }
    } catch (err) {
      console.error("Error al re-sincronizar mirrors:", err);
    } finally {
      setRefreshingMirrors(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#141414] text-white pb-16">
      <header className="border-b border-white/10 bg-black/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-white transition" href="/">
            <ArrowLeft className="w-4 h-4"/>
            Volver al catálogo
          </Link>

          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-netflix-red"/>
            <span className="font-black tracking-tight text-netflix-red">
              PILOTO
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 space-y-8">
        {loading ? (
          <div className="aspect-video w-full rounded-xl bg-zinc-900 animate-pulse flex items-center justify-center text-sm text-zinc-400">
            Descifrando tokens de streaming y preparando reproductor...
          </div>
        ) : error || !movie ? (
          <div className="p-8 rounded-xl bg-zinc-900 border border-red-500/30 text-center space-y-4">
            <p className="text-red-400 font-semibold">
              {error || "Película no encontrada"}
            </p>
            <Link className="inline-block px-4 py-2 rounded-md bg-netflix-red text-white text-xs font-bold" href="/">
              Regresar al Inicio
            </Link>
          </div>
        ) : (
          <>
            <SmartVideoPlayer
              movieId={movie.id}
              movieTitle={movie.title}
              durationMins={movie.durationMins}
              streams={movie.streams}
              initialProgressSeconds={savedProgress}
              onRefreshMirrors={handleRefreshMirrors}
              isRefreshingMirrors={refreshingMirrors}
            />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 bg-zinc-900/50 border border-white/10 rounded-xl p-6">
              <div className="hidden md:block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={movie.posterUrl}
                  alt={movie.title}
                  className="w-full rounded-lg border border-white/10 shadow-lg"
                />
              </div>

              <div className="md:col-span-3 space-y-4">
                <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold">
                  <span className="px-2.5 py-0.5 rounded bg-netflix-red text-white">
                    {movie.qualityBadge}
                  </span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <Star className="w-4 h-4 fill-amber-400"/>
                    {movie.rating.toFixed(1)}
                  </span>
                  <span className="text-zinc-300">{movie.releaseYear}</span>
                  <span className="flex items-center gap-1 text-zinc-300">
                    <Clock className="w-3.5 h-3.5"/>
                    {movie.durationMins} min
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-black text-white">
                  {movie.title}
                </h1>

                <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
                  {movie.synopsis}
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  {movie.genres.map((g) => (
                    <span
                      key={g}
                      className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300"
                    >
                      {g}
                    </span>
                  ))}
                </div>

                <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400"/>
                    <span>
                      URLs protegidas con tokens efímeros{" "}
                      <strong className="text-zinc-200">
                        TokenCryptoService (AES-256-GCM)
                      </strong>
                    </span>
                  </div>
                  <span>
                    Mirrors activos disponibles: {movie.streams.length}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
