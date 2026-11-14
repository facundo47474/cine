"use server";

import { seriesService, watchHistoryService } from "@/infrastructure/container";
import { getAuthenticatedUserId } from "@/infrastructure/auth/sessionHelper";
import {
  SeriesDetailsDto,
  EpisodeDto,
  SeriesResumeDto,
  EpisodePlaybackDto,
} from "@/application/dto/SeriesDto";

/**
 * Obtiene los detalles completos de una serie para la vista `/series/[id]`,
 * incluyendo el estado de reanudación del usuario si tiene sesión iniciada.
 *
 * @param slugOrId UUID local o slug `"tmdb-{id}"` de la serie.
 * @returns Objeto `SeriesDetailsDto` o `null` si no existe.
 */
export async function getSeriesDetailsAction(
  slugOrId: string
): Promise<SeriesDetailsDto | null> {
  try {
    const userId = await getAuthenticatedUserId();
    return await seriesService.getSeriesDetails(slugOrId, userId);
  } catch (error) {
    console.error("[getSeriesDetailsAction] Error:", error);
    return null;
  }
}

/**
 * Carga bajo demanda los capítulos de una temporada específica junto con el progreso del usuario.
 *
 * @param seriesId UUID de la serie.
 * @param seasonNumberOrId Número de temporada o UUID de temporada.
 * @returns Lista de episodios (`EpisodeDto[]`).
 */
export async function getSeasonEpisodesAction(
  seriesId: string,
  seasonNumberOrId: number | string
): Promise<EpisodeDto[]> {
  try {
    const userId = await getAuthenticatedUserId();
    return await seriesService.getSeasonEpisodes(
      seriesId,
      seasonNumberOrId,
      userId
    );
  } catch (error) {
    console.error("[getSeasonEpisodesAction] Error:", error);
    return [];
  }
}

/**
 * Obtiene el punto de reanudación inteligente (`Smart CTA`) de una serie para el usuario actual.
 *
 * @param seriesId UUID de la serie.
 * @returns Objeto `SeriesResumeDto` o `null` si el usuario no está autenticado.
 */
export async function getUserSeriesResumeAction(
  seriesId: string
): Promise<SeriesResumeDto | null> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return null;
    return await seriesService.getUserSeriesResume(userId, seriesId);
  } catch (error) {
    console.error("[getUserSeriesResumeAction] Error:", error);
    return null;
  }
}

/**
 * Obtiene la información de reproducción y streams firmados para un capítulo específico.
 *
 * @param episodeId UUID del episodio.
 * @returns Objeto `EpisodePlaybackDto` o `null` si no existe.
 */
export async function getEpisodePlaybackAction(
  episodeId: string
): Promise<EpisodePlaybackDto | null> {
  try {
    const userId = await getAuthenticatedUserId();
    return await seriesService.getEpisodePlaybackData(episodeId, userId);
  } catch (error) {
    console.error("[getEpisodePlaybackAction] Error:", error);
    return null;
  }
}

/**
 * Registra el progreso de reproducción de un capítulo desde el cliente.
 *
 * @param episodeId UUID del episodio.
 * @param progressSeconds Segundo actual de reproducción.
 * @param durationSeconds Duración total del capítulo en segundos.
 * @returns Resultado de la operación y estado de progreso actualizado.
 */
export async function recordEpisodeProgressAction(
  episodeId: string,
  progressSeconds: number,
  durationSeconds: number
) {
  try {
    const userId = await getAuthenticatedUserId();
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
