import {
  IWatchHistoryRepository,
  SaveProgressInput,
  SaveEpisodeProgressInput,
} from "@/domain/interfaces/IWatchHistoryRepository";

export interface ContinueWatchingItemDto {
  movieId: string;
  mediaType: "MOVIE" | "SERIES";
  title: string;
  posterUrl: string;
  backdropUrl: string | null;
  releaseYear: number;
  qualityBadge: string;
  progressSeconds: number;
  durationSeconds: number;
  progressPercentage: number;
  updatedAt: string;
  episodeId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
}

/**
 * Servicio de Aplicación para el Historial de Reproducción (`WatchHistoryService`).
 *
 * Gestiona la fila personalizada "Continuar viendo" (tanto para películas como para series)
 * y la persistencia periódica del segundo exacto de reproducción.
 */
export class WatchHistoryService {
  constructor(private readonly historyRepository: IWatchHistoryRepository) {}

  /**
   * Obtiene los títulos en curso (no completados) de un usuario para la fila "Continuar viendo".
   *
   * @param userId UUID del usuario autenticado.
   * @returns Lista de elementos `ContinueWatchingItemDto` ordenados del más reciente al más antiguo.
   */
  public async getContinueWatching(
    userId: string
  ): Promise<ContinueWatchingItemDto[]> {
    if (!userId) return [];

    const records = await this.historyRepository.findByUserId(userId, 12);

    return records
      .filter((item) => item.movie.isAvailable && !item.history.completed)
      .map(({ history, movie, episodeInfo }) => ({
        movieId: movie.id,
        mediaType: movie.mediaType,
        title: movie.title,
        posterUrl: movie.posterUrl,
        backdropUrl: movie.backdropUrl,
        releaseYear: movie.releaseYear,
        qualityBadge: movie.qualityBadge,
        progressSeconds: history.progressSeconds,
        durationSeconds: history.durationSeconds,
        progressPercentage: history.getProgressPercentage(),
        updatedAt: history.updatedAt.toISOString(),
        episodeId: episodeInfo?.episodeId,
        seasonNumber: episodeInfo?.seasonNumber,
        episodeNumber: episodeInfo?.episodeNumber,
        episodeTitle: episodeInfo?.title,
      }));
  }

  /**
   * Obtiene el segundo guardado de reproducción de una película para un usuario.
   *
   * @param userId UUID del usuario.
   * @param movieId UUID de la película.
   * @returns Segundo de reanudación (`0` si no tiene progreso previo o si ya la completó).
   */
  public async getMovieProgress(
    userId: string,
    movieId: string
  ): Promise<number> {
    if (!userId || !movieId) return 0;
    const history = await this.historyRepository.findMovieProgress(
      userId,
      movieId
    );
    return history && !history.completed ? history.progressSeconds : 0;
  }

  /**
   * Obtiene el segundo guardado de reproducción de un capítulo de serie para un usuario.
   *
   * @param userId UUID del usuario.
   * @param episodeId UUID del episodio.
   * @returns Segundo de reanudación (`0` si no existe progreso previo).
   */
  public async getEpisodeProgress(
    userId: string,
    episodeId: string
  ): Promise<number> {
    if (!userId || !episodeId) return 0;
    const history = await this.historyRepository.findEpisodeProgress(
      userId,
      episodeId
    );
    return history && !history.completed ? history.progressSeconds : 0;
  }

  /**
   * Registra o actualiza el progreso de visualización de una película.
   *
   * @param input Datos de progreso (`userId`, `movieId`, `progressSeconds`, `durationSeconds`).
   * @returns Resumen del estado de avance persistido.
   */
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

  /**
   * Registra o actualiza el progreso de visualización de un episodio de serie.
   *
   * @param input Datos de progreso (`userId`, `episodeId`, `progressSeconds`, `durationSeconds`).
   * @returns Resumen del estado de avance persistido.
   */
  public async recordEpisodeProgress(input: SaveEpisodeProgressInput) {
    const saved = await this.historyRepository.saveEpisodeProgress(input);
    return {
      episodeId: saved.episodeId,
      progressSeconds: saved.progressSeconds,
      durationSeconds: saved.durationSeconds,
      progressPercentage: saved.getProgressPercentage(),
      completed: saved.completed,
    };
  }
}
