import { MirrorFormat } from "../enums/MirrorFormat";
import { MirrorStatus } from "../enums/MirrorStatus";

/**
 * Propiedades estructurales de un enlace mirror de película.
 */
export interface MirrorLinkProps {
  id: string;
  movieId: string;
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
 * Entidad de Dominio `MirrorLink`.
 * Encapsula las reglas de negocio de tolerancia a fallos y auditoría del Health Checker.
 */
export class MirrorLink {
  public static readonly MAX_ALLOWED_FAILURES = 3;

  constructor(private props: MirrorLinkProps) {}

  get id(): string {
    return this.props.id;
  }

  get movieId(): string {
    return this.props.movieId;
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
   * Registra una verificación HTTP exitosa, reiniciando el contador de fallos consecutivos
   * y restaurando el enlace a estado `ACTIVE`.
   *
   * @param checkedAt Fecha de la verificación (por defecto `new Date()`).
   */
  public markCheckSuccess(checkedAt: Date = new Date()): void {
    this.props.status = MirrorStatus.ACTIVE;
    this.props.consecutiveFailures = 0;
    this.props.lastCheckedAt = checkedAt;
  }

  /**
   * Registra un fallo al verificar el enlace.
   * Si es una baja definitiva (`HTTP 404` / `HTTP 410`) o alcanza el umbral de 3 fallos consecutivos,
   * pasa a estado `DOWN`. De lo contrario, queda en `UNDER_REVIEW` para tolerar microcortes de red.
   *
   * @param isPermanentHttpGone Indica si el servidor respondió explícitamente 404/410.
   * @param checkedAt Fecha de la verificación.
   */
  public markCheckFailure(
    isPermanentHttpGone: boolean = false,
    checkedAt: Date = new Date()
  ): void {
    this.props.consecutiveFailures += 1;
    this.props.lastCheckedAt = checkedAt;

    if (
      isPermanentHttpGone ||
      this.props.consecutiveFailures >= MirrorLink.MAX_ALLOWED_FAILURES
    ) {
      this.props.status = MirrorStatus.DOWN;
    } else {
      this.props.status = MirrorStatus.UNDER_REVIEW;
    }
  }

  /**
   * Verifica si el enlace puede utilizarse para reproducción (`ACTIVE` o `UNDER_REVIEW`).
   *
   * @returns `true` si el enlace es reproducible.
   */
  public isPlayable(): boolean {
    return (
      this.props.status === MirrorStatus.ACTIVE ||
      this.props.status === MirrorStatus.UNDER_REVIEW
    );
  }

  /**
   * Devuelve una copia plana de las propiedades del enlace mirror.
   *
   * @returns Objeto `MirrorLinkProps`.
   */
  public toObject(): MirrorLinkProps {
    return { ...this.props };
  }
}
