import { MirrorFormat } from "../enums/MirrorFormat";
import { MirrorStatus } from "../enums/MirrorStatus";

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
 * Entidad de Dominio MirrorLink.
 * Encapsula las reglas de negocio de tolerancia a fallos (Health Checker).
 */
export class MirrorLink {
  public static readonly MAX_ALLOWED_FAILURES = 3;

  constructor(private props: MirrorLinkProps) {}

  get id(): string { return this.props.id; }
  get movieId(): string { return this.props.movieId; }
  get serverName(): string { return this.props.serverName; }
  get language(): string { return this.props.language; }
  get rawUrl(): string { return this.props.rawUrl; }
  get format(): MirrorFormat { return this.props.format; }
  get quality(): string { return this.props.quality; }
  get priority(): number { return this.props.priority; }
  get status(): MirrorStatus { return this.props.status; }
  get consecutiveFailures(): number { return this.props.consecutiveFailures; }
  get lastCheckedAt(): Date | null { return this.props.lastCheckedAt; }

  /**
   * Registra una verificación exitosa y restaura el enlace a estado ACTIVO.
   */
  public markCheckSuccess(now: Date = new Date()): void {
    this.props.status = MirrorStatus.ACTIVE;
    this.props.consecutiveFailures = 0;
    this.props.lastCheckedAt = now;
  }

  /**
   * Registra un fallo en el enlace.
   * Si es un fallo definitivo (404 / 410 por DMCA) o alcanza el umbral de 3 fallos consecutivos,
   * pasa a estado DOWN. De lo contrario, queda EN_REVISION (UNDER_REVIEW) para tolerar microcortes.
   */
  public markCheckFailure(isPermanentHttpGone: boolean = false, now: Date = new Date()): void {
    this.props.consecutiveFailures += 1;
    this.props.lastCheckedAt = now;

    if (
      isPermanentHttpGone ||
      this.props.consecutiveFailures >= MirrorLink.MAX_ALLOWED_FAILURES
    ) {
      this.props.status = MirrorStatus.DOWN;
    } else {
      this.props.status = MirrorStatus.UNDER_REVIEW;
    }
  }

  public isPlayable(): boolean {
    return (
      this.props.status === MirrorStatus.ACTIVE ||
      this.props.status === MirrorStatus.UNDER_REVIEW
    );
  }

  public toObject(): MirrorLinkProps {
    return { ...this.props };
  }
}
