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

/**
 * Servicio de Historial de Reproducción ("Continuar viendo")
 * Identifica al usuario mediante una sesión anónima en cookie (UUID) sin obligar a login en la v1.
 */
export class WatchHistoryService {
  constructor(private readonly historyRepository: IWatchHistoryRepository) {}

  public async getContinueWatching(
    deviceSessionId: string
  ): Promise<ContinueWatchingItemDto[]> {
    if (!deviceSessionId) return [];

    const records = await this.historyRepository.findByDeviceSession(
      deviceSessionId,
      12
    );

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
    deviceSessionId: string,
    movieId: string
  ): Promise<number> {
    if (!deviceSessionId || !movieId) return 0;
    const history = await this.historyRepository.findMovieProgress(
      deviceSessionId,
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
