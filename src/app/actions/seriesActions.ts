"use server";

import { getServerSession } from "next-auth";
import { seriesService, watchHistoryService } from "@/infrastructure/container";
import { authOptions } from "@/infrastructure/auth/authOptions";
import {
  SeriesDetailsDto,
  EpisodeDto,
  SeriesResumeDto,
  EpisodePlaybackDto,
} from "@/application/dto/SeriesDto";

export async function getSeriesDetailsAction(
  slugOrId: string
): Promise<SeriesDetailsDto | null> {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    return await seriesService.getSeriesDetails(slugOrId, userId);
  } catch (error) {
    console.error("[getSeriesDetailsAction] Error:", error);
    return null;
  }
}

export async function getSeasonEpisodesAction(
  seriesId: string,
  seasonNumberOrId: number | string
): Promise<EpisodeDto[]> {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    return await seriesService.getSeasonEpisodes(seriesId, seasonNumberOrId, userId);
  } catch (error) {
    console.error("[getSeasonEpisodesAction] Error:", error);
    return [];
  }
}

export async function getUserSeriesResumeAction(
  seriesId: string
): Promise<SeriesResumeDto | null> {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return null;
    return await seriesService.getUserSeriesResume(userId, seriesId);
  } catch (error) {
    console.error("[getUserSeriesResumeAction] Error:", error);
    return null;
  }
}

export async function getEpisodePlaybackAction(
  episodeId: string
): Promise<EpisodePlaybackDto | null> {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    return await seriesService.getEpisodePlaybackData(episodeId, userId);
  } catch (error) {
    console.error("[getEpisodePlaybackAction] Error:", error);
    return null;
  }
}

export async function recordEpisodeProgressAction(
  episodeId: string,
  progressSeconds: number,
  durationSeconds: number
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return { ok: false, error: "No autenticado" };

    const saved = await watchHistoryService.recordEpisodeProgress({
      userId,
      episodeId,
      progressSeconds: Math.floor(progressSeconds),
      durationSeconds: Math.floor(durationSeconds || 2700),
    });

    return { ok: true, progress: saved };
  } catch (error) {
    console.error("[recordEpisodeProgressAction] Error:", error);
    return { ok: false, error: "Error al guardar el progreso" };
  }
}

