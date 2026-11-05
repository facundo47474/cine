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

function formatSeasonLabel(title: string | undefined, seasonNumber: number): string {
  const clean = (title || "").trim();
  if (!clean || /^season\s+\d+$/i.test(clean)) {
    return `Temporada ${seasonNumber}`;
  }
  return clean;
}

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
          {seasons.map((s) => (
            <option
              key={s.id || s.seasonNumber}
              value={s.seasonNumber}
              className="bg-zinc-900 text-white"
            >
              {formatSeasonLabel(s.title, s.seasonNumber)}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
}

