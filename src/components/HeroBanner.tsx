"use client";

import React from "react";
import Link from "next/link";
import { Play, Star, Clock, Sparkles } from "lucide-react";
import { CatalogCardDto } from "@/application/dto/CatalogFeedDto";

interface HeroBannerProps {
  movie: CatalogCardDto;
}

export default function HeroBanner({ movie }: HeroBannerProps) {
  const bgImage = movie.backdropUrl || movie.posterUrl;

  return (
    <section className="relative w-full h-[64vh] sm:h-[74vh] min-h-[420px] sm:min-h-[500px] flex items-end pb-12 sm:pb-16 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center scale-105 transition-transform duration-1000"
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/85 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/35 to-black/40" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 w-full">
        <div className="max-w-2xl space-y-3 sm:space-y-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-[11px] sm:text-xs font-semibold">
            <span className="px-2 sm:px-2.5 py-0.5 rounded bg-netflix-red text-white uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Destacada
            </span>
            <span className="px-2 py-0.5 rounded bg-white/15 text-white border border-white/20">
              {movie.qualityBadge}
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              {movie.rating.toFixed(1)}
            </span>
            <span className="text-zinc-300">{movie.releaseYear}</span>
            <span className="flex items-center gap-1 text-zinc-300">
              <Clock className="w-3.5 h-3.5" />
              {movie.durationMins} min
            </span>
          </div>

          <h1 className="text-2xl sm:text-5xl font-black tracking-tight text-white drop-shadow-md line-clamp-2">
            {movie.title}
          </h1>

          <p className="text-xs sm:text-base text-zinc-200 line-clamp-2 sm:line-clamp-3 leading-relaxed">
            {movie.synopsis}
          </p>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-zinc-300">
            {movie.genres.slice(0, 4).map((genre) => (
              <span
                key={genre}
                className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15"
              >
                {genre}
              </span>
            ))}
          </div>

          <div className="pt-1 sm:pt-2 flex flex-wrap items-center gap-3">
            <Link
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-7 py-3 rounded-lg bg-netflix-red text-white font-bold text-sm hover:bg-red-700 active:scale-[0.99] transition shadow-lg"
              href={`/watch/${movie.id}`}
            >
              <Play className="w-5 h-5 fill-white" />
              Ver ahora
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
