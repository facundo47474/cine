"use client";

import React from "react";
import Link from "next/link";
import { Play, Star } from "lucide-react";

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
}

/**
 * Tarjeta visual de póster 2:3 para Películas y Series (`MovieCard`).
 *
 * Soporta tanto grillas de exploración (`fullWidth = true`) como carruseles horizontales,
 * incluyendo barra de progreso roja e insignia de capítulo en curso (`SERIE • T1:E3`).
 */
export default function MovieCard({
  id,
  title,
  posterUrl,
  releaseYear,
  qualityBadge,
  rating,
  progressPercentage,
  fullWidth = false,
  mediaType = "MOVIE",
  episodeId,
  seasonNumber,
  episodeNumber,
  episodeTitle,
}: MovieCardProps) {
  const isSeries = mediaType === "SERIES" || mediaType === "tv";
  const href = isSeries
    ? episodeId
      ? `/watch/episode/${episodeId}`
      : `/series/${id}`
    : `/watch/${id}`;

  return (
    <Link
      href={href}
      className={`group relative rounded-xl overflow-hidden bg-zinc-900 border border-white/10 hover:border-netflix-red/80 transition-all duration-300 sm:hover:scale-[1.04] hover:z-20 shadow-lg ${
        fullWidth ? "w-full" : "flex-shrink-0 w-36 sm:w-52"
      }`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={posterUrl}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover object-center sm:group-hover:scale-110 transition-transform duration-500"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

        {isSeries && (
          <div className="absolute top-2 left-2 z-10">
            <span className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-black/80 text-amber-400 border border-amber-400/30 shadow-md backdrop-blur-md">
              {seasonNumber && episodeNumber
                ? `SERIE • T${seasonNumber}:E${episodeNumber}`
                : "SERIE"}
            </span>
          </div>
        )}

        <div className="absolute top-2 right-2">
          <span className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-netflix-red text-white shadow">
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

      <div className="p-2.5 sm:p-3 space-y-1">
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
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <Star className="w-3 h-3 fill-amber-400" />
              {rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
