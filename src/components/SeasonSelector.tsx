"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import { SeasonSummaryDto } from "@/application/dto/SeriesDto";

interface SeasonSelectorProps {
  seasons: SeasonSummaryDto[];
  selectedSeasonNumber: number;
  onSelectSeason: (seasonNumber: number) => void;
  isLoading?: boolean;
}

/**
 * Normaliza la etiqueta de una temporada traduciendo títulos genéricos `"Season X"` a `"Temporada X"`.
 */
function formatSeasonLabel(
  title: string | undefined,
  seasonNumber: number
): string {
  const cleanTitle = (title || "").trim();
  if (!cleanTitle || /^season\s+\d+$/i.test(cleanTitle)) {
    return `Temporada ${seasonNumber}`;
  }
  return cleanTitle;
}

/**
 * Selector desplegable de temporadas para la vista de detalle de una serie (`SeasonSelector`).
 */
export default function SeasonSelector({
  seasons,
  selectedSeasonNumber,
  onSelectSeason,
  isLoading = false,
}: SeasonSelectorProps) {
  return (
    <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
      <div className="flex items-center gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          Episodios
        </h2>
        {isLoading && (
          <div className="w-4 h-4 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
        )}
      </div>

      <div className="relative">
        <select
          value={selectedSeasonNumber}
          onChange={(e) => onSelectSeason(Number(e.target.value))}
          disabled={isLoading}
          className="appearance-none bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-white text-sm font-semibold py-2 pl-4 pr-10 rounded-md focus:outline-none focus:ring-2 focus:ring-netflix-red transition cursor-pointer disabled:opacity-50"
        >
          {seasons.map((season) => (
            <option
              key={season.id || season.seasonNumber}
              value={season.seasonNumber}
              className="bg-zinc-900 text-white"
            >
              {formatSeasonLabel(season.title, season.seasonNumber)}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
}
