"use client";

import React from "react";
import Link from "next/link";
import { Play, Star, Clock, Sparkles, Plus, Check } from "lucide-react";
import { CatalogCardDto } from "@/application/dto/CatalogFeedDto";
import { useMembership } from "@/components/MembershipProvider";

interface HeroBannerProps {
  movie: CatalogCardDto;
}

export default function HeroBanner({ movie }: HeroBannerProps) {
  const { isInMyList, toggleMyListItem } = useMembership();
  const inMyList = isInMyList(movie.id);
  const bgImage = movie.backdropUrl || movie.posterUrl;
  const isSeries = movie.mediaType === "SERIES";
  const watchHref = isSeries ? `/series/${movie.id}` : `/watch/${movie.id}`;

  return (
    <section className="relative w-full min-h-[460px] sm:min-h-[520px] sm:h-[74vh] flex items-end pt-28 sm:pt-24 pb-14 sm:pb-16 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bgImage}
        alt={movie.title}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover scale-105 transition-transform duration-1000"
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

          <div className="pt-1 sm:pt-2 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3">
            <Link
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] px-4 sm:px-7 py-3 rounded-lg bg-netflix-red text-white font-bold text-sm hover:bg-red-700 active:scale-[0.99] transition shadow-lg"
              href={watchHref}
            >
              <Play className="w-5 h-5 fill-white" />
              Ver ahora
            </Link>

            <button
              type="button"
              onClick={() => toggleMyListItem(movie)}
              className={`inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] px-4 sm:px-5 py-3 rounded-lg border text-sm font-bold transition shadow-lg ${
                inMyList
                  ? "bg-white/15 border-emerald-400/50 text-emerald-300 hover:bg-white/20"
                  : "bg-zinc-900/85 border-white/20 text-white hover:bg-white/15"
              }`}
            >
              {inMyList ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>En Mi Lista</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Mi Lista</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
