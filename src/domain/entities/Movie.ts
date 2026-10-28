import { MirrorLink } from "./MirrorLink";

export interface MovieProps {
  id: string;
  tmdbId: number | null;
  title: string;
  originalTitle: string | null;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string | null;
  releaseYear: number;
  durationMins: number;
  rating: number;
  qualityBadge: string;
  genres: string[];
  isAvailable: boolean;
  mirrors?: MirrorLink[];
}

/**
 * Entidad de Dominio Movie.
 * Controla la disponibilidad lógica (Soft Delete) según el estado de sus Mirrors.
 */
export class Movie {
  constructor(private props: MovieProps) {}

  get id(): string { return this.props.id; }
  get tmdbId(): number | null { return this.props.tmdbId; }
  get title(): string { return this.props.title; }
  get originalTitle(): string | null { return this.props.originalTitle; }
  get synopsis(): string { return this.props.synopsis; }
  get posterUrl(): string { return this.props.posterUrl; }
  get backdropUrl(): string | null { return this.props.backdropUrl; }
  get releaseYear(): number { return this.props.releaseYear; }
  get durationMins(): number { return this.props.durationMins; }
  get rating(): number { return this.props.rating; }
  get qualityBadge(): string { return this.props.qualityBadge; }
  get genres(): string[] { return this.props.genres; }
  get isAvailable(): boolean { return this.props.isAvailable; }
  get mirrors(): MirrorLink[] { return this.props.mirrors ?? []; }

  /**
   * Obtiene los enlaces disponibles ordenados por prioridad (1, 2, 3...).
   */
  public getPlayableMirrors(): MirrorLink[] {
    return this.mirrors
      .filter((m) => m.isPlayable())
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Recalcula si la película debe estar visible en el catálogo (Soft Delete automático).
   * Si no queda ningún mirror reproducible, isAvailable pasa a false.
   */
  public recalculateAvailability(): boolean {
    const hasPlayable = this.getPlayableMirrors().length > 0;
    this.props.isAvailable = hasPlayable;
    return this.props.isAvailable;
  }

  public toObject(): MovieProps {
    return { ...this.props };
  }
}
