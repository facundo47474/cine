/**
 * Propiedades estructurales de un registro de historial de reproducción (`WatchHistory`).
 */
export interface WatchHistoryProps {
  id: string;
  userId: string;
  movieId?: string | null;
  episodeId?: string | null;
  progressSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: Date;
}

/**
 * Entidad de Dominio `WatchHistory`.
 * Representa el punto de reanudación de un usuario en una película o capítulo de serie.
 */
export class WatchHistory {
  constructor(private props: WatchHistoryProps) {}

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get movieId(): string | null {
    return this.props.movieId ?? null;
  }

  get episodeId(): string | null {
    return this.props.episodeId ?? null;
  }

  get progressSeconds(): number {
    return this.props.progressSeconds;
  }

  get durationSeconds(): number {
    return this.props.durationSeconds;
  }

  get completed(): boolean {
    return this.props.completed;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * Calcula el porcentaje de avance de reproducción acotado entre `1%` y `100%`
   * (o `0%` si aún no se registró avance válido).
   *
   * @returns Porcentaje entero de progreso (`0` a `100`).
   */
  public getProgressPercentage(): number {
    if (this.props.durationSeconds <= 0 || this.props.progressSeconds <= 0) {
      return 0;
    }
    const rawPercent =
      (this.props.progressSeconds / this.props.durationSeconds) * 100;
    return Math.max(1, Math.min(100, Math.round(rawPercent)));
  }

  /**
   * Exporta una copia plana de las propiedades del historial.
   *
   * @returns Objeto `WatchHistoryProps`.
   */
  public toObject(): WatchHistoryProps {
    return { ...this.props };
  }
}
