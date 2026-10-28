"use client";

import React from "react";
import { Sparkles, Tv, Film, Layers } from "lucide-react";

export interface ProviderOption {
  id: number | undefined;
  name: string;
  badgeColor: string;
}

export interface GenreOption {
  id: number | undefined;
  name: string;
}

export const STREAMING_PROVIDERS: ProviderOption[] = [
  {
    id: undefined,
    name: "Todo el Catálogo",
    badgeColor: "from-netflix-red to-red-700",
  },
  {
    id: 8,
    name: "Netflix",
    badgeColor: "from-red-600 to-red-900",
  },
  {
    id: 337,
    name: "Disney+",
    badgeColor: "from-blue-600 to-indigo-900",
  },
  {
    id: 1899,
    name: "Max",
    badgeColor: "from-purple-600 to-indigo-950",
  },
  {
    id: 119,
    name: "Prime Video",
    badgeColor: "from-sky-500 to-blue-800",
  },
  {
    id: 350,
    name: "Apple TV+",
    badgeColor: "from-zinc-600 to-zinc-900",
  },
];

export const GENRE_PILLS: GenreOption[] = [
  { id: undefined, name: "Todos los géneros" },
  { id: 28, name: "Acción" },
  { id: 878, name: "Ciencia Ficción" },
  { id: 27, name: "Terror" },
  { id: 35, name: "Comedia" },
  { id: 16, name: "Animación" },
  { id: 53, name: "Thriller" },
  { id: 18, name: "Drama" },
  { id: 12, name: "Aventura" },
  { id: 14, name: "Fantasía" },
];

interface ProviderFilterBarProps {
  selectedProviderId: number | undefined;
  selectedGenreId: number | undefined;
  onSelectProvider: (providerId: number | undefined) => void;
  onSelectGenre: (genreId: number | undefined) => void;
  onResetFilters: () => void;
}

export default function ProviderFilterBar({
  selectedProviderId,
  selectedGenreId,
  onSelectProvider,
  onSelectGenre,
  onResetFilters,
}: ProviderFilterBarProps) {
  const hasActiveFilters =
    selectedProviderId !== undefined || selectedGenreId !== undefined;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8 space-y-4">
      {/* Hub de Plataformas de Streaming */}
      <div className="bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-2xl p-4 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <Tv className="w-4 h-4 text-netflix-red" />
            <span>Explorar por Plataforma Oficial</span>
          </div>

          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="text-xs font-semibold text-netflix-red hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Limpiar filtros y volver al Home Feed
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {STREAMING_PROVIDERS.map((prov) => {
            const isSelected = selectedProviderId === prov.id;
            return (
              <button
                key={prov.name}
                onClick={() => onSelectProvider(prov.id)}
                className={`relative overflow-hidden rounded-xl px-4 py-3 text-left transition-all border ${
                  isSelected
                    ? `bg-gradient-to-br ${prov.badgeColor} text-white border-white/40 shadow-lg scale-[1.02]`
                    : "bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 border-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-black tracking-tight">
                    {prov.name}
                  </span>
                  <Film
                    className={`w-4 h-4 ${
                      isSelected ? "text-white" : "text-zinc-500"
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Píldoras de Géneros */}
        <div className="pt-2 border-t border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 pr-2 flex-shrink-0">
            <Layers className="w-3.5 h-3.5 text-netflix-red" />
            <span>Género:</span>
          </div>
          {GENRE_PILLS.map((genre) => {
            const isSelected = selectedGenreId === genre.id;
            return (
              <button
                key={genre.name}
                onClick={() => onSelectGenre(genre.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition border ${
                  isSelected
                    ? "bg-white text-black border-white shadow"
                    : "bg-black/40 text-zinc-300 border-white/10 hover:border-white/30 hover:text-white"
                }`}
              >
                {genre.name}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
