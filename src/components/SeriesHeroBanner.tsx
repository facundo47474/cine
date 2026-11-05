"use client";

import React from "react";
import Link from "next/link";
import { Play, Star, Sparkles, Layers } from "lucide-react";
import { SeriesDetailsDto } from "@/application/dto/SeriesDto";

interface SeriesHeroBannerProps {
  series: SeriesDetailsDto;
}

export default function SeriesHeroBanner({ series }: SeriesHeroBannerProps) {
  const bgImage = series.backdropUrl || series.posterUrl;
  const resume = series.resume;

  // Enlace del CTA inteligente
  const targetEpisodeId = resume?.episodeId || series.currentSeasonEpisodes[0]?.id;
  const playHref = targetEpisodeId ? `/watch/episode/${targetEpisodeId}` : "#";

  const seasonsLabel =
    series.totalSeasons === 1
      ? "1 Temporada"
      : `${series.totalSeasons} Temporadas`;

  return (
    <section className="relative w-full h-[65vh] sm:h-[75vh] min-h-[460px] sm:min-h-[540px] flex items-end pb-12 sm:pb-16 overflow-hidden">
      {/* Fondo inmersivo */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105 transition-transform duration-1000"
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      {/* Gradientes estilo Netflix */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/75 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/40 to-black/30" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 w-full">
        <div className="max-w-2xl space-y-3 sm:space-y-4">
          {/* Badges de metadatos */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-[11px] sm:text-xs font-semibold">
            <span className="px-2 sm:px-2.5 py-0.5 rounded bg-amber-500/90 text-black font-extrabold uppercase tracking-wider flex items-center gap-1 shadow">
              <Sparkles className="w-3 h-3" />
              Serie
            </span>
            <span className="px-2 py-0.5 rounded bg-white/15 text-white border border-white/20">
              {series.qualityBadge || "HD"}
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              {series.rating.toFixed(1)}
            </span>
            <span className="text-zinc-300">{series.releaseYear}</span>
            <span className="flex items-center gap-1 text-zinc-300">
              <Layers className="w-3.5 h-3.5" />
              {seasonsLabel}
            </span>
          </div>

          {/* Título de la serie */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-md line-clamp-2">
            {series.title}
          </h1>

          {/* Sinopsis */}
          <p className="text-xs sm:text-base text-zinc-200 line-clamp-2 sm:line-clamp-3 leading-relaxed">
            {series.synopsis}
          </p>

          {/* Géneros */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-zinc-300">
            {series.genres.slice(0, 4).map((genre) => (
              <span
                key={genre}
                className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm"
              >
                {genre}
              </span>
            ))}
          </div>

          {/* CTA Inteligente */}
          <div className="pt-2 sm:pt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative group inline-block">
              <Link
                href={playHref}
                className="inline-flex items-center justify-center gap-2.5 w-full sm:w-auto px-8 py-3.5 rounded-lg bg-white text-black font-black text-sm sm:text-base hover:bg-white/90 active:scale-[0.98] transition shadow-xl"
              >
                <Play className="w-5 h-5 fill-black" />
                {resume?.label || "Reproducir T1:E1"}
              </Link>

              {/* Barra de progreso inferior si se dejó a mitad */}
              {resume && resume.isResume && resume.progressPercentage > 0 && (
                <div className="absolute -bottom-1.5 left-2 right-2 h-1 bg-zinc-700/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-netflix-red rounded-full transition-all duration-300"
                    style={{ width: `${resume.progressPercentage}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

