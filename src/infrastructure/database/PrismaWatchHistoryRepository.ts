import { PrismaClient } from "@prisma/client";
import {
  IWatchHistoryRepository,
  SaveProgressInput,
  SaveEpisodeProgressInput,
  WatchHistoryWithMovie,
} from "@/domain/interfaces/IWatchHistoryRepository";
import { WatchHistory } from "@/domain/entities/WatchHistory";
import { Movie } from "@/domain/entities/Movie";

export class PrismaWatchHistoryRepository implements IWatchHistoryRepository {
  constructor(private readonly db: PrismaClient) {}

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

      // Deduplicamos por ID de película/serie para mostrar solo el último episodio visto de cada serie
      if (seenMediaIds.has(targetMedia.id)) continue;
      seenMediaIds.add(targetMedia.id);

      const historyEntity = new WatchHistory({
        id: row.id,
        userId: row.userId,
        movieId: row.movieId,
        episodeId: row.episodeId,
        progressSeconds: row.progressSeconds,
        durationSeconds: row.durationSeconds,
        completed: row.completed,
        updatedAt: row.updatedAt,
      });

      const movieEntity = new Movie({
        id: targetMedia.id,
        tmdbId: targetMedia.tmdbId,
        mediaType: targetMedia.mediaType,
        title: targetMedia.title,
        originalTitle: targetMedia.originalTitle,
        synopsis: targetMedia.synopsis,
        posterUrl: targetMedia.posterUrl,
        backdropUrl: targetMedia.backdropUrl,
        releaseYear: targetMedia.releaseYear,
        durationMins: targetMedia.durationMins,
        rating: targetMedia.rating,
        qualityBadge: targetMedia.qualityBadge,
        genres: targetMedia.genres,
        isAvailable: targetMedia.isAvailable,
      });

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

    if (!row) return null;

    return new WatchHistory({
      id: row.id,
      userId: row.userId,
      movieId: row.movieId,
      episodeId: row.episodeId,
      progressSeconds: row.progressSeconds,
      durationSeconds: row.durationSeconds,
      completed: row.completed,
      updatedAt: row.updatedAt,
    });
  }

  public async saveProgress(input: SaveProgressInput): Promise<WatchHistory> {
    const safeDuration = Math.max(1, input.durationSeconds);
    const safeProgress = Math.max(
      0,
      Math.min(input.progressSeconds, safeDuration)
    );
    const isCompleted = safeProgress / safeDuration >= 0.92;

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

    return new WatchHistory({
      id: row.id,
      userId: row.userId,
      movieId: row.movieId,
      episodeId: row.episodeId,
      progressSeconds: row.progressSeconds,
      durationSeconds: row.durationSeconds,
      completed: row.completed,
      updatedAt: row.updatedAt,
    });
  }

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

    if (!row) return null;

    return new WatchHistory({
      id: row.id,
      userId: row.userId,
      movieId: row.movieId,
      episodeId: row.episodeId,
      progressSeconds: row.progressSeconds,
      durationSeconds: row.durationSeconds,
      completed: row.completed,
      updatedAt: row.updatedAt,
    });
  }

  public async saveEpisodeProgress(
    input: SaveEpisodeProgressInput
  ): Promise<WatchHistory> {
    const safeDuration = Math.max(1, input.durationSeconds);
    const safeProgress = Math.max(
      0,
      Math.min(input.progressSeconds, safeDuration)
    );
    const isCompleted = safeProgress / safeDuration >= 0.90;

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

    return new WatchHistory({
      id: row.id,
      userId: row.userId,
      movieId: row.movieId,
      episodeId: row.episodeId,
      progressSeconds: row.progressSeconds,
      durationSeconds: row.durationSeconds,
      completed: row.completed,
      updatedAt: row.updatedAt,
    });
  }

  public async findSeriesEpisodesProgress(
    userId: string,
    episodeIds: string[]
  ): Promise<Map<string, WatchHistory>> {
    const map = new Map<string, WatchHistory>();
    if (!userId || episodeIds.length === 0) return map;

    const rows = await this.db.watchHistory.findMany({
      where: {
        userId,
        episodeId: { in: episodeIds },
      },
    });

    for (const row of rows) {
      if (row.episodeId) {
        map.set(
          row.episodeId,
          new WatchHistory({
            id: row.id,
            userId: row.userId,
            movieId: row.movieId,
            episodeId: row.episodeId,
            progressSeconds: row.progressSeconds,
            durationSeconds: row.durationSeconds,
            completed: row.completed,
            updatedAt: row.updatedAt,
          })
        );
      }
    }

    return map;
  }

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

    return rows.map(
      (row) =>
        new WatchHistory({
          id: row.id,
          userId: row.userId,
          movieId: row.movieId,
          episodeId: row.episodeId,
          progressSeconds: row.progressSeconds,
          durationSeconds: row.durationSeconds,
          completed: row.completed,
          updatedAt: row.updatedAt,
        })
    );
  }
}
