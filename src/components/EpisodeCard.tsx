"use client";

import React from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { EpisodeDto } from "@/application/dto/SeriesDto";

interface EpisodeCardProps {
  episode: EpisodeDto;
  fallbackBackdrop?: string | null;
}

export default function EpisodeCard({
  episode,
  fallbackBackdrop,
}: EpisodeCardProps) {
  const thumbnail =
    episode.thumbnailUrl ||
    fallbackBackdrop ||
    "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=600&auto=format&fit=crop&q=80";

  const durationLabel =
    episode.duration > 0 ? `${episode.duration}m` : "45m";

  const hasProgress =
    typeof episode.progressPercentage === "number" &&
    episode.progressPercentage > 0;

  return (
    <Link
      href={`/watch/episode/${episode.id}`}
      className="group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 p-3 sm:p-4 rounded-xl hover:bg-zinc-800/60 transition border border-transparent hover:border-zinc-700/60"
    >
      {/* Encabezado Mobile / Número Desktop */}
      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
        <span className="text-xl sm:text-2xl font-bold text-zinc-500 group-hover:text-white transition w-6 sm:w-8 text-center">
          {episode.episodeNumber}
        </span>

        {/* Miniatura 16:9 */}
        <div className="relative aspect-video w-full sm:w-44 rounded-md overflow-hidden bg-zinc-800 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnail}
            alt={episode.title}
            loading="lazy"
            className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
          />

          {/* Overlay oscuro al hover */}
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/60 transition flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-black/70 border border-white/60 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
            </div>
          </div>

          {/* Barra de progreso si fue empezado */}
          {hasProgress && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700/80">
              <div
                className="h-full bg-netflix-red transition-all duration-300"
                style={{
                  width: `${Math.max(6, Math.min(100, episode.progressPercentage!))}%`,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Información del episodio */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm sm:text-base font-bold text-zinc-100 group-hover:text-netflix-red transition truncate">
            {episode.title}
          </h3>
          <span className="text-xs sm:text-sm font-medium text-zinc-400 flex-shrink-0">
            {durationLabel}
          </span>
        </div>

        <p className="text-xs sm:text-sm text-zinc-400 line-clamp-2 leading-relaxed">
          {episode.overview || "Sin descripción disponible para este capítulo."}
        </p>
      </div>
    </Link>
  );
}

