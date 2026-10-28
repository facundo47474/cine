"use client";

import React from "react";
import Link from "next/link";
import { Play, Info, Star, Clock, Sparkles } from "lucide-react";
import { CatalogCardDto } from "@/application/dto/CatalogFeedDto";

interface HeroBannerProps {
  movie: CatalogCardDto;
}

export default function HeroBanner({ movie }: HeroBannerProps) {
  const bgImage = movie.backdropUrl || movie.posterUrl;

  return (
    <section className="relative w-full h-[74vh] min-h-[500px] flex items-end pb-16 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center scale-105 transition-transform duration-1000"
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/85 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/25 to-black/40" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 w-full">
        <div className="max-w-2xl space-y-4">
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold">
            <span className="px-2.5 py-0.5 rounded bg-netflix-red text-white uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Estreno Destacado
            </span>
            <span className="px-2 py-0.5 rounded bg-white/15 text-white border border-white/20">
              {movie.qualityBadge}
            </span>
            {movie.isLocalVip && (
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Mirror VIP Directo
              </span>
            )}
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

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white drop-shadow-md">
            {movie.title}
          </h1>

          <p className="text-sm sm:text-base text-zinc-200 line-clamp-3 leading-relaxed">
            {movie.synopsis}
          </p>

          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
            {movie.genres.map((genre) => (
              <span
                key={genre}
                className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15"
              >
                {genre}
              </span>
            ))}
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Link
              href={`/watch/${movie.id}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-white text-black font-bold text-sm hover:bg-zinc-200 transition shadow-lg"
            >
              <Play className="w-5 h-5 fill-black" />
              Reproducir ahora
            </Link>

            <Link
              href={`/watch/${movie.id}`}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-zinc-800/85 text-white font-semibold text-sm hover:bg-zinc-700/90 border border-white/15 transition"
            >
              <Info className="w-5 h-5" />
              Servidores y Ficha
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
