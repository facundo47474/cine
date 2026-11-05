"use client";

import React, { useState, useTransition } from "react";
import SeasonSelector from "./SeasonSelector";
import EpisodeCard from "./EpisodeCard";
import { EpisodeDto, SeasonSummaryDto } from "@/application/dto/SeriesDto";
import { getSeasonEpisodesAction } from "@/app/actions/seriesActions";

interface EpisodeListProps {
  seriesId: string;
  seasons: SeasonSummaryDto[];
  initialEpisodes: EpisodeDto[];
  fallbackBackdrop?: string | null;
}

export default function EpisodeList({
  seriesId,
  seasons,
  initialEpisodes,
  fallbackBackdrop,
}: EpisodeListProps) {
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(
    seasons[0]?.seasonNumber || 1
  );
  const [episodes, setEpisodes] = useState<EpisodeDto[]>(initialEpisodes);
  const [isPending, startTransition] = useTransition();

  const handleSelectSeason = (seasonNumber: number) => {
    setSelectedSeasonNumber(seasonNumber);
    startTransition(async () => {
      try {
        const fetched = await getSeasonEpisodesAction(seriesId, seasonNumber);
        setEpisodes(fetched);
      } catch (error) {
        console.error("Error al cargar episodios:", error);
      }
    });
  };

  return (
    <section className="space-y-4">
      {/* Selector de temporada */}
      <SeasonSelector
        seasons={seasons}
        selectedSeasonNumber={selectedSeasonNumber}
        onSelectSeason={handleSelectSeason}
        isLoading={isPending}
      />

      {/* Lista de episodios */}
      {episodes.length === 0 ? (
        <div className="py-12 text-center text-zinc-500">
          No hay episodios cargados para esta temporada.
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/80">
          {episodes.map((ep) => (
            <EpisodeCard
              key={ep.id}
              episode={ep}
              fallbackBackdrop={fallbackBackdrop}
            />
          ))}
        </div>
      )}
    </section>
  );
}

