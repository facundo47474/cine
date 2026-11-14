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

/**
 * Lista interactiva de capítulos de una serie con selector dinámico de temporadas (`EpisodeList`).
 */
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

  /**
   * Cambia la temporada activa y solicita sus episodios al servidor mediante Server Action.
   */
  const handleSelectSeason = (seasonNumber: number) => {
    setSelectedSeasonNumber(seasonNumber);
    startTransition(async () => {
      try {
        const fetchedEpisodes = await getSeasonEpisodesAction(
          seriesId,
          seasonNumber
        );
        setEpisodes(fetchedEpisodes);
      } catch (error) {
        console.error("Error al cargar episodios:", error);
      }
    });
  };

  return (
    <section className="space-y-4">
      <SeasonSelector
        seasons={seasons}
        selectedSeasonNumber={selectedSeasonNumber}
        onSelectSeason={handleSelectSeason}
        isLoading={isPending}
      />

      {episodes.length === 0 ? (
        <div className="py-12 text-center text-zinc-500">
          No hay episodios cargados para esta temporada.
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/80">
          {episodes.map((episode) => (
            <EpisodeCard
              key={episode.id}
              episode={episode}
              fallbackBackdrop={fallbackBackdrop}
            />
          ))}
        </div>
      )}
    </section>
  );
}
