"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Cast,
  Clock,
  Film,
  Languages,
  ShieldCheck,
  ShieldOff,
  Star,
} from "lucide-react";
import SmartVideoPlayer from "@/components/SmartVideoPlayer";
import { MoviePlaybackDto } from "@/application/dto/PlaybackStreamDto";
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
 * Página de reproducción dedicada para Películas (`/watch/[id]`).
 *
 * Carga los enlaces firmados de la película y el punto de reanudación del usuario,
 * permitiendo alternar entre Audio Latino e Inglés Subtitulado y transmitir a Smart TV.
 */
export default function WatchMoviePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const movieId = params.id;
  const { isPro, openUpgradeModal } = useMembership();

  const [movie, setMovie] = useState<MoviePlaybackDto | null>(null);
  const [savedProgress, setSavedProgress] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<
    "Latino" | "Inglés (Sub)"
  >("Latino");

  /**
   * Consulta al backend los streams firmados y el progreso guardado de la película,
   * realizando un reintento automático ante errores transitorios y redirigiendo si corresponde a una serie.
   */
  const loadPlayback = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      let redirectingToSeries = false;

      try {
        for (let intento = 0; intento <= 1; intento++) {
          if (signal?.aborted) return;

          if (intento > 0) {
            await esperarConAborto(600, signal);
          }

          try {
            const response = await fetch(`/api/movies/${movieId}/play`, {
              cache: "no-store",
              signal,
            });
            const data = await response.json();

            if (!response.ok || !data.ok) {
              const errorMessage =
                data.error || "No se pudo cargar la película.";
              if (response.status === 404 || intento === 1) {
                throw new Error(errorMessage);
              }
              continue;
            }

            const targetSeriesId: string | undefined =
              data.redirectToSeriesId || data.movie?.redirectToSeriesId;
            if (targetSeriesId) {
              redirectingToSeries = true;
              router.replace(`/series/${targetSeriesId}`);
              return;
            }

            if (!signal?.aborted) {
              setMovie(data.movie);
              setSavedProgress(data.savedProgressSeconds || 0);
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
            err instanceof Error ? err.message : "Error cargando la película."
          );
        }
      } finally {
        if (!signal?.aborted && !redirectingToSeries) {
          setLoading(false);
        }
      }
    },
    [movieId, router]
  );

  useEffect(() => {
    if (!movieId) return;
    const controller = new AbortController();
    void loadPlayback(controller.signal);
    return () => controller.abort();
  }, [movieId, loadPlayback]);

  const hasLatino =
    movie?.streams.some((stream) => stream.language === "Latino") ?? false;
  const hasEnglish =
    movie?.streams.some((stream) => stream.language === "Inglés (Sub)") ??
    false;

  /**
   * Ajusta el idioma seleccionado automáticamente según las pistas disponibles en la película.
   */
  useEffect(() => {
    if (!movie) return;
    if (!hasLatino && hasEnglish) {
      setSelectedLanguage("Inglés (Sub)");
    } else if (hasLatino) {
      setSelectedLanguage("Latino");
    }
  }, [movie, hasLatino, hasEnglish]);

  /**
   * Emite el evento global para activar la transmisión a Chromecast o AirPlay desde el reproductor.
   */
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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

                <h1 className="text-xl sm:text-3xl font-black text-white leading-tight">
                  {movie.title}
                </h1>

                <p className="text-xs sm:text-base text-zinc-300 leading-relaxed">
                  {movie.synopsis}
                </p>

                <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-1 sm:pt-2">
                  {movie.genres.map((genre) => (
                    <span
                      key={genre}
                      className="text-[11px] sm:text-xs px-2.5 sm:px-3 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300"
                    >
                      {genre}
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
