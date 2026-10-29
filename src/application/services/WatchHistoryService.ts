import {
  IWatchHistoryRepository,
  SaveProgressInput,
} from "@/domain/interfaces/IWatchHistoryRepository";

export interface ContinueWatchingItemDto {
  movieId: string;
  title: string;
  posterUrl: string;
  backdropUrl: string | null;
  releaseYear: number;
  qualityBadge: string;
  progressSeconds: number;
  durationSeconds: number;
  progressPercentage: number;
  updatedAt: string;
}

export class WatchHistoryService {
  constructor(private readonly historyRepository: IWatchHistoryRepository) {}

  public async getContinueWatching(
    userId: string
  ): Promise<ContinueWatchingItemDto[]> {
    if (!userId) return [];

    const records = await this.historyRepository.findByUserId(userId, 12);

    return records
      .filter((item) => item.movie.isAvailable && !item.history.completed)
      .map(({ history, movie }) => ({
        movieId: movie.id,
        title: movie.title,
        posterUrl: movie.posterUrl,
        backdropUrl: movie.backdropUrl,
        releaseYear: movie.releaseYear,
        qualityBadge: movie.qualityBadge,
        progressSeconds: history.progressSeconds,
        durationSeconds: history.durationSeconds,
        progressPercentage: history.getProgressPercentage(),
        updatedAt: history.updatedAt.toISOString(),
      }));
  }

  public async getMovieProgress(
    userId: string,
    movieId: string
  ): Promise<number> {
    if (!userId || !movieId) return 0;
    const history = await this.historyRepository.findMovieProgress(
      userId,
      movieId
    );
    return history ? history.progressSeconds : 0;
  }

  public async recordProgress(input: SaveProgressInput) {
    const saved = await this.historyRepository.saveProgress(input);
    return {
      movieId: saved.movieId,
      progressSeconds: saved.progressSeconds,
      durationSeconds: saved.durationSeconds,
      progressPercentage: saved.getProgressPercentage(),
      completed: saved.completed,
    };
  }
}
