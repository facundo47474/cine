"use client";

import React, { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MovieCard from "./MovieCard";
import { CatalogCardDto } from "@/application/dto/CatalogFeedDto";

interface MovieRowProps {
  title: string;
  subtitle?: string;
  movies: CatalogCardDto[];
}

export default function MovieRow({ title, subtitle, movies }: MovieRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  if (!movies || movies.length === 0) return null;

  const scrollRow = (direction: "left" | "right") => {
    if (!rowRef.current) return;
    const { scrollLeft, clientWidth } = rowRef.current;
    const offset = direction === "left" ? -clientWidth * 0.75 : clientWidth * 0.75;
    rowRef.current.scrollTo({ left: scrollLeft + offset, behavior: "smooth" });
  };

  return (
    <section className="space-y-3 py-3 relative group/row">
      <div className="px-4 sm:px-8 max-w-7xl mx-auto flex items-end justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-zinc-400">{subtitle}</p>}
        </div>

        <div className="hidden sm:flex items-center gap-1.5">
          <button
            onClick={() => scrollRow("left")}
            className="p-1.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/10 transition"
            title="Desplazar a la izquierda"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scrollRow("right")}
            className="p-1.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/10 transition"
            title="Desplazar a la derecha"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-8 max-w-7xl mx-auto">
        <div
          ref={rowRef}
          className="flex items-stretch gap-4 overflow-x-auto no-scrollbar pb-3 pt-1 scroll-smooth"
        >
          {movies.map((movie) => (
            <MovieCard
              key={movie.id}
              id={movie.id}
              title={movie.title}
              posterUrl={movie.posterUrl}
              releaseYear={movie.releaseYear}
              qualityBadge={movie.qualityBadge}
              rating={movie.rating}
              isLocalVip={movie.isLocalVip}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
