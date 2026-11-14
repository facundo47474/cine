import { MirrorFormat } from "../enums/MirrorFormat";
import { MirrorStatus } from "../enums/MirrorStatus";

/**
 * Propiedades estructurales de un enlace mirror perteneciente a un episodio de serie.
 */
export interface EpisodeMirrorProps {
  id: string;
  episodeId: string;
  serverName: string;
  language: string;
  rawUrl: string;
  format: MirrorFormat;
  quality: string;
  priority: number;
  status: MirrorStatus;
  consecutiveFailures: number;
  lastCheckedAt: Date | null;
}

/**
 * Entidad de Dominio `EpisodeMirror`.
 * Representa un servidor de streaming vinculado a un capítulo específico de una serie.
 */
export class EpisodeMirror {
  constructor(private props: EpisodeMirrorProps) {}

  get id(): string {
    return this.props.id;
  }

  get episodeId(): string {
    return this.props.episodeId;
  }

  get serverName(): string {
    return this.props.serverName;
  }

  get language(): string {
    return this.props.language;
  }

  get rawUrl(): string {
    return this.props.rawUrl;
  }

  get format(): MirrorFormat {
    return this.props.format;
  }

  get quality(): string {
    return this.props.quality;
  }

  get priority(): number {
    return this.props.priority;
  }

  get status(): MirrorStatus {
    return this.props.status;
  }

  get consecutiveFailures(): number {
    return this.props.consecutiveFailures;
  }

  get lastCheckedAt(): Date | null {
    return this.props.lastCheckedAt;
  }

  /**
   * Determina si el mirror de episodio se encuentra disponible para intentar reproducción.
   *
   * @returns `true` si el estado es `ACTIVE` o `UNDER_REVIEW`; `false` si está `DOWN`.
   */
  public isPlayable(): boolean {
    return this.props.status !== MirrorStatus.DOWN;
  }

  /**
   * Exporta una copia plana de las propiedades del mirror.
   *
   * @returns Objeto `EpisodeMirrorProps`.
   */
  public toObject(): EpisodeMirrorProps {
    return { ...this.props };
  }
}
