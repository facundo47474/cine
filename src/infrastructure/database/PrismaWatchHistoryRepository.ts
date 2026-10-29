import { PrismaClient } from "@prisma/client";
import {
  IWatchHistoryRepository,
  SaveProgressInput,
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
      where: { userId },
      include: { movie: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return rows.map((row) => ({
      history: new WatchHistory({
        id: row.id,
        userId: row.userId,
        movieId: row.movieId,
        progressSeconds: row.progressSeconds,
        durationSeconds: row.durationSeconds,
        completed: row.completed,
        updatedAt: row.updatedAt,
      }),
      movie: new Movie({
        id: row.movie.id,
        tmdbId: row.movie.tmdbId,
        title: row.movie.title,
        originalTitle: row.movie.originalTitle,
        synopsis: row.movie.synopsis,
        posterUrl: row.movie.posterUrl,
        backdropUrl: row.movie.backdropUrl,
        releaseYear: row.movie.releaseYear,
        durationMins: row.movie.durationMins,
        rating: row.movie.rating,
        qualityBadge: row.movie.qualityBadge,
        genres: row.movie.genres,
        isAvailable: row.movie.isAvailable,
      }),
    }));
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
      progressSeconds: row.progressSeconds,
      durationSeconds: row.durationSeconds,
      completed: row.completed,
      updatedAt: row.updatedAt,
    });
  }
}
