import { PrismaClient } from "@prisma/client";
import {
  IWatchHistoryRepository,
  SaveProgressInput,
  SaveEpisodeProgressInput,
  WatchHistoryWithMovie,
} from "@/domain/interfaces/IWatchHistoryRepository";
import { WatchHistory } from "@/domain/entities/WatchHistory";
import {
  mapPrismaMovieToDomain,
  mapPrismaWatchHistoryToDomain,
} from "./mappers/PrismaDomainMappers";

/**
 * Umbral porcentual a partir del cual una película se considera completada (92%).
 */
const MOVIE_COMPLETION_THRESHOLD = 0.92;

/**
 * Umbral porcentual a partir del cual un capítulo de serie se considera completado (90%).
 */
const EPISODE_COMPLETION_THRESHOLD = 0.9;

/**
 * Repositorio concreto de Historial de Reproducción (`WatchHistory`) sobre PostgreSQL con Prisma ORM.
 */
export class PrismaWatchHistoryRepository implements IWatchHistoryRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Obtiene los registros de visualización en curso (`completed: false`) de un usuario,
   * incluyendo tanto películas como capítulos de series y deduplicando por serie para mostrar
   * únicamente el último capítulo visto de cada serie en la fila "Continuar viendo".
   *
   * @param userId UUID del usuario.
   * @param limit Cantidad máxima de tarjetas a devolver (por defecto 12).
   * @returns Lista de elementos `WatchHistoryWithMovie`.
   */
  public async findByUserId(
    userId: string,
    limit: number = 12
  ): Promise<WatchHistoryWithMovie[]> {
    const rows = await this.db.watchHistory.findMany({
      where: {
        userId,
        completed: false,
      },
      include: {
        movie: true,
        episode: {
          include: {
            season: {
              include: {
                series: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit * 4,
    });

    const results: WatchHistoryWithMovie[] = [];
    const seenMediaIds = new Set<string>();

    for (const row of rows) {
      const targetMedia = row.movie ?? row.episode?.season?.series ?? null;
      if (!targetMedia) continue;

      // Deduplica por ID de película/serie para mostrar solo el último episodio en curso de cada serie
      if (seenMediaIds.has(targetMedia.id)) continue;
      seenMediaIds.add(targetMedia.id);

      const historyEntity = mapPrismaWatchHistoryToDomain(row);
      const movieEntity = mapPrismaMovieToDomain(targetMedia);

      const episodeInfo =
        row.episode && row.episode.season
          ? {
              episodeId: row.episode.id,
              seasonNumber: row.episode.season.seasonNumber,
              episodeNumber: row.episode.episodeNumber,
              title: row.episode.title,
            }
          : undefined;

      results.push({
        history: historyEntity,
        movie: movieEntity,
        episodeInfo,
      });

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Busca el progreso de visualización de un usuario para una película específica.
   *
   * @param userId UUID del usuario.
   * @param movieId UUID de la película.
   * @returns Entidad `WatchHistory` o `null` si no existe registro.
   */
  public async findMovieProgress(
    userId: string,
    movieId: string
  ): Promise<WatchHistory | null> {
    const row = await this.db.watchHistory.findUnique({
      where: {
        userId_movieId: {
          userId,
          movieId,
        },
      },
    });

    return row ? mapPrismaWatchHistoryToDomain(row) : null;
  }

  /**
   * Guarda o actualiza el progreso de reproducción de una película, marcándola como
   * completada automáticamente si supera el 92% de su duración total.
   *
   * @param input Datos de progreso de la película (`SaveProgressInput`).
   * @returns Entidad `WatchHistory` actualizada.
   */
  public async saveProgress(input: SaveProgressInput): Promise<WatchHistory> {
    const safeDuration = Math.max(1, input.durationSeconds);
    const safeProgress = Math.max(
      0,
      Math.min(input.progressSeconds, safeDuration)
    );
    const isCompleted =
      safeProgress / safeDuration >= MOVIE_COMPLETION_THRESHOLD;

    const row = await this.db.watchHistory.upsert({
      where: {
        userId_movieId: {
          userId: input.userId,
          movieId: input.movieId,
        },
      },
      update: {
        progressSeconds: safeProgress,
        durationSeconds: safeDuration,
        completed: isCompleted,
      },
      create: {
        userId: input.userId,
        movieId: input.movieId,
        progressSeconds: safeProgress,
        durationSeconds: safeDuration,
        completed: isCompleted,
      },
    });

    return mapPrismaWatchHistoryToDomain(row);
  }

  /**
   * Busca el progreso de visualización de un usuario para un episodio específico.
   *
   * @param userId UUID del usuario.
   * @param episodeId UUID del episodio.
   * @returns Entidad `WatchHistory` o `null` si no existe registro.
   */
  public async findEpisodeProgress(
    userId: string,
    episodeId: string
  ): Promise<WatchHistory | null> {
    const row = await this.db.watchHistory.findUnique({
      where: {
        userId_episodeId: {
          userId,
          episodeId,
        },
      },
    });

    return row ? mapPrismaWatchHistoryToDomain(row) : null;
  }

  /**
   * Guarda o actualiza el progreso de reproducción de un capítulo de serie,
   * marcándolo como completado si alcanza o supera el 90% de su duración total.
   *
   * @param input Datos de progreso del episodio (`SaveEpisodeProgressInput`).
   * @returns Entidad `WatchHistory` actualizada.
   */
  public async saveEpisodeProgress(
    input: SaveEpisodeProgressInput
  ): Promise<WatchHistory> {
    const safeDuration = Math.max(1, input.durationSeconds);
    const safeProgress = Math.max(
      0,
      Math.min(input.progressSeconds, safeDuration)
    );
    const isCompleted =
      safeProgress / safeDuration >= EPISODE_COMPLETION_THRESHOLD;

    const row = await this.db.watchHistory.upsert({
      where: {
        userId_episodeId: {
          userId: input.userId,
          episodeId: input.episodeId,
        },
      },
      update: {
        progressSeconds: safeProgress,
        durationSeconds: safeDuration,
        completed: isCompleted,
      },
      create: {
        userId: input.userId,
        episodeId: input.episodeId,
        progressSeconds: safeProgress,
        durationSeconds: safeDuration,
        completed: isCompleted,
      },
    });

    return mapPrismaWatchHistoryToDomain(row);
  }

  /**
   * Obtiene un mapa con el progreso de un usuario en un conjunto de episodios de una temporada.
   *
   * @param userId UUID del usuario.
   * @param episodeIds Lista de UUIDs de episodios a consultar.
   * @returns Mapa `episodeId -> WatchHistory`.
   */
  public async findSeriesEpisodesProgress(
    userId: string,
    episodeIds: string[]
  ): Promise<Map<string, WatchHistory>> {
    const progressByEpisodeMap = new Map<string, WatchHistory>();
    if (!userId || episodeIds.length === 0) return progressByEpisodeMap;

    const rows = await this.db.watchHistory.findMany({
      where: {
        userId,
        episodeId: { in: episodeIds },
      },
    });

    for (const row of rows) {
      if (row.episodeId) {
        progressByEpisodeMap.set(
          row.episodeId,
          mapPrismaWatchHistoryToDomain(row)
        );
      }
    }

    return progressByEpisodeMap;
  }

  /**
   * Obtiene el historial completo de episodios vistos por un usuario dentro de una serie,
   * ordenado desde el más reciente al más antiguo.
   *
   * @param userId UUID del usuario.
   * @param seriesId UUID de la serie.
   * @returns Lista de entidades `WatchHistory`.
   */
  public async findUserSeriesHistory(
    userId: string,
    seriesId: string
  ): Promise<WatchHistory[]> {
    if (!userId || !seriesId) return [];

    const rows = await this.db.watchHistory.findMany({
      where: {
        userId,
        episode: {
          season: {
            seriesId,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return rows.map((row) => mapPrismaWatchHistoryToDomain(row));
  }
}
