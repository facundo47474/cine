import { EpisodeMirror } from "./EpisodeMirror";

/**
 * Propiedades estructurales de la entidad de dominio `Episode`.
 */
export interface EpisodeProps {
  id: string;
  seasonId: string;
  episodeNumber: number;
  title: string;
  overview: string | null;
  duration: number; // Duración estimada en minutos
  videoUrl: string;
  thumbnailUrl: string | null;
  introStart: number | null; // Segundo donde comienza la introducción (ej. 85)
  introEnd: number | null;   // Segundo donde finaliza la introducción (ej. 175)
  mirrors?: EpisodeMirror[];
}

/**
 * Entidad de Dominio `Episode`.
 * Representa un capítulo dentro de una temporada de serie de TV y gestiona sus mirrors asociados.
 */
export class Episode {
  constructor(private props: EpisodeProps) {}

  get id(): string {
    return this.props.id;
  }

  get seasonId(): string {
    return this.props.seasonId;
  }

  get episodeNumber(): number {
    return this.props.episodeNumber;
  }

  get title(): string {
    return this.props.title;
  }

  get overview(): string | null {
    return this.props.overview;
  }

  get duration(): number {
    return this.props.duration;
  }

  get videoUrl(): string {
    return this.props.videoUrl;
  }

  get thumbnailUrl(): string | null {
    return this.props.thumbnailUrl;
  }

  get introStart(): number | null {
    return this.props.introStart;
  }

  get introEnd(): number | null {
    return this.props.introEnd;
  }

  get mirrors(): EpisodeMirror[] {
    return this.props.mirrors ?? [];
  }

  /**
   * Filtra los enlaces mirror operativos (que no estén en estado `DOWN`)
   * y los devuelve ordenados ascendentemente por su prioridad (`1, 2, 3...`).
   *
   * @returns Arreglo de `EpisodeMirror` aptos para reproducción.
   */
  public getPlayableMirrors(): EpisodeMirror[] {
    return this.mirrors
      .filter((mirror) => mirror.isPlayable())
      .sort((first, second) => first.priority - second.priority);
  }

  /**
   * Devuelve una copia plana e inmutable de las propiedades del episodio.
   *
   * @returns Objeto `EpisodeProps`.
   */
  public toObject(): EpisodeProps {
    return { ...this.props };
  }
}
