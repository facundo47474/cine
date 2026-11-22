"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Check, Play, Plus, Star } from "lucide-react";
import { CatalogCardDto } from "@/application/dto/CatalogFeedDto";
import { useMembership } from "@/components/MembershipProvider";

interface MovieCardProps {
  id: string;
  title: string;
  posterUrl: string;
  releaseYear: number;
  qualityBadge: string;
  rating?: number;
  progressPercentage?: number;
  isLocalVip?: boolean;
  fullWidth?: boolean;
  mediaType?: "MOVIE" | "SERIES" | "movie" | "tv";
  episodeId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  catalogItem?: CatalogCardDto;
  showMyListButton?: boolean;
}

/**
 * Tarjeta visual de póster 2:3 para Películas y Series (`MovieCard`).
 *
 * Soporta grillas de exploración (`fullWidth = true`) y carruseles horizontales,
 * barra de progreso roja, insignia de capítulo en curso y acceso directo a "Mi Lista".
 */
function MovieCard({
  id,
  title,
  posterUrl,
  releaseYear,
  qualityBadge,
  rating,
  progressPercentage,
  isLocalVip,
  fullWidth = false,
  mediaType = "MOVIE",
  episodeId,
  seasonNumber,
  episodeNumber,
  episodeTitle,
  catalogItem,
  showMyListButton = true,
}: MovieCardProps) {
  const { isInMyList, toggleMyListItem } = useMembership();
  const isSeries = mediaType === "SERIES" || mediaType === "tv";
  const href = isSeries
    ? episodeId
      ? `/watch/episode/${episodeId}`
      : `/series/${id}`
    : `/watch/${id}`;

  const optimizedPosterUrl = posterUrl.includes("image.tmdb.org/t/p/w500/")
    ? posterUrl.replace("/t/p/w500/", "/t/p/w342/")
    : posterUrl;

  const inMyList = isInMyList(id);

  const resolvedCatalogItem = useMemo<CatalogCardDto>(() => {
    if (catalogItem) return catalogItem;
    const tmdbMatch = id.match(/^tmdb-(\d+)$/);
    const parsedTmdbId = tmdbMatch ? Number(tmdbMatch[1]) : null;
    return {
      id,
      tmdbId: parsedTmdbId,
      mediaType: isSeries ? "SERIES" : "MOVIE",
      title,
      originalTitle: null,
      synopsis: "",
      posterUrl,
      backdropUrl: null,
      releaseYear,
      durationMins: isSeries ? 45 : 120,
      rating: rating ?? 7.0,
      qualityBadge,
      genres: [],
      isLocalVip: isLocalVip ?? !id.startsWith("tmdb-"),
    };
  }, [
    catalogItem,
    id,
    isSeries,
    title,
    posterUrl,
    releaseYear,
    rating,
    qualityBadge,
    isLocalVip,
  ]);

  return (
    <div
      className={`group relative flex flex-col snap-start rounded-xl overflow-hidden bg-zinc-900 border border-white/10 hover:border-netflix-red/80 transition-transform duration-200 sm:hover:scale-[1.04] hover:z-20 shadow-lg ${
        fullWidth ? "w-full" : "flex-shrink-0 w-[144px] sm:w-52"
      }`}
    >
      <Link href={href} className="block flex-1 min-w-0">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={optimizedPosterUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover object-center sm:group-hover:scale-110 transition-transform duration-500"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

          <div className="absolute top-2 inset-x-2 z-10 flex items-start justify-between gap-1 pointer-events-none">
            {isSeries ? (
              <span className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-black/80 text-amber-400 border border-amber-400/30 shadow-md backdrop-blur-md truncate max-w-[72%]">
                {seasonNumber && episodeNumber ? (
                  <>
                    <span className="hidden sm:inline">SERIE • </span>
                    T{seasonNumber}:E{episodeNumber}
                  </>
                ) : (
                  "SERIE"
                )}
              </span>
            ) : (
              <span />
            )}

            <span className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-netflix-red text-white shadow flex-shrink-0 ml-auto">
              {qualityBadge}
            </span>
          </div>

          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-netflix-red/95 flex items-center justify-center shadow-lg shadow-black/70 scale-90 group-hover:scale-100 transition-transform">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>

          {typeof progressPercentage === "number" && progressPercentage > 0 && (
            <>
              <div className="absolute bottom-2.5 left-2 z-10">
                <span className="px-1.5 py-0.5 rounded bg-black/80 border border-white/15 text-[10px] font-bold text-zinc-200 backdrop-blur-sm">
                  {Math.min(100, progressPercentage)}%
                </span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-zinc-700/95">
                <div
                  className="h-full bg-netflix-red transition-all duration-300"
                  style={{
                    width: `${Math.max(6, Math.min(100, progressPercentage))}%`,
                  }}
                />
              </div>
            </>
          )}
        </div>

        <div className="p-2.5 sm:p-3 pb-1.5 sm:pb-2 space-y-1">
          <h3 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-netflix-red transition">
            {title}
          </h3>
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-zinc-400">
            <span className="truncate">
              {isSeries && seasonNumber && episodeNumber
                ? `T${seasonNumber}:E${episodeNumber}${
                    episodeTitle ? ` • ${episodeTitle}` : ""
                  }`
                : releaseYear}
            </span>
            {typeof rating === "number" && (
              <span className="flex items-center gap-1 text-amber-400 font-medium flex-shrink-0">
                <Star className="w-3 h-3 fill-amber-400" />
                {rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </Link>

      {showMyListButton && (
        <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3 pt-1">
          <button
            type="button"
            onClick={() => toggleMyListItem(resolvedCatalogItem)}
            aria-pressed={inMyList}
            aria-label={
              inMyList
                ? `Quitar ${title} de Mi Lista`
                : `Agregar ${title} a Mi Lista`
            }
            className={`w-full min-h-[34px] px-2.5 py-1.5 rounded-lg border text-[11px] sm:text-xs font-bold inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98] ${
              inMyList
                ? "bg-emerald-500/15 border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/25"
                : "bg-white/5 hover:bg-white/15 border-white/10 text-zinc-200 hover:text-white"
            }`}
          >
            {inMyList ? (
              <>
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span>En Mi Lista</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Mi Lista</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default React.memo(MovieCard);
