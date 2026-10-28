import { IMirrorRepository } from "@/domain/interfaces/IMirrorRepository";
import { IMovieRepository } from "@/domain/interfaces/IMovieRepository";
import { ILinkProber } from "@/domain/interfaces/ILinkProber";
import { MirrorStatus } from "@/domain/enums/MirrorStatus";

export interface MirrorAuditDetail {
  mirrorId: string;
  movieId: string;
  serverName: string;
  previousStatus: MirrorStatus;
  newStatus: MirrorStatus;
  consecutiveFailures: number;
  httpStatus: number;
  responseTimeMs: number;
  movieStillAvailable: boolean;
}

export interface BatchHealthReport {
  timestamp: string;
  totalChecked: number;
  aliveCount: number;
  underReviewCount: number;
  downCount: number;
  moviesDisabledCount: number;
  details: MirrorAuditDetail[];
}

/**
 * Servicio de Auditoría y Salud de Enlaces (Health Checker).
 * Verifica mirrors con peticiones HTTP HEAD, administra tolerancia a fallos (3 intentos)
 * y ejecuta Soft Delete (isAvailable = false) cuando una película se queda sin mirrors activos.
 */
export class HealthCheckerService {
  constructor(
    private readonly mirrorRepository: IMirrorRepository,
    private readonly movieRepository: IMovieRepository,
    private readonly linkProber: ILinkProber
  ) {}

  /**
   * Audita un único mirror por ID (usado tanto por el worker como cuando un usuario reporta fallo).
   */
  public async auditSingleMirror(mirrorId: string): Promise<MirrorAuditDetail | null> {
    const mirror = await this.mirrorRepository.findById(mirrorId);
    if (!mirror) return null;

    const previousStatus = mirror.status;
    const probeResult = await this.linkProber.probeUrl(mirror.rawUrl, mirror.format);

    if (probeResult.isAlive) {
      mirror.markCheckSuccess();
    } else {
      mirror.markCheckFailure(probeResult.isPermanentGone);
    }

    await this.mirrorRepository.save(mirror);

    // Recalculamos si la película padre sigue teniendo al menos 1 mirror reproducible
    const movie = await this.movieRepository.findByIdWithMirrors(mirror.movieId);
    let movieStillAvailable = true;

    if (movie) {
      movieStillAvailable = movie.recalculateAvailability();
      await this.movieRepository.updateAvailability(movie.id, movieStillAvailable);
    }

    return {
      mirrorId: mirror.id,
      movieId: mirror.movieId,
      serverName: mirror.serverName,
      previousStatus,
      newStatus: mirror.status,
      consecutiveFailures: mirror.consecutiveFailures,
      httpStatus: probeResult.httpStatus,
      responseTimeMs: probeResult.responseTimeMs,
      movieStillAvailable,
    };
  }

  /**
   * Ejecuta un lote de revisiones con pausa controlada (Rate Limiting)
   * para no saturar la red ni sufrir bloqueos de IP en servidores externos.
   */
  public async runBatchHealthCheck(
    batchSize: number = 25,
    delayBetweenChecksMs: number = 200
  ): Promise<BatchHealthReport> {
    const mirrors = await this.mirrorRepository.findBatchForHealthCheck(batchSize);
    const details: MirrorAuditDetail[] = [];
    const disabledMovieIds = new Set<string>();

    for (const mirror of mirrors) {
      const detail = await this.auditSingleMirror(mirror.id);
      if (detail) {
        details.push(detail);
        if (!detail.movieStillAvailable) {
          disabledMovieIds.add(detail.movieId);
        }
      }

      if (delayBetweenChecksMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenChecksMs));
      }
    }

    return {
      timestamp: new Date().toISOString(),
      totalChecked: details.length,
      aliveCount: details.filter((d) => d.newStatus === MirrorStatus.ACTIVE).length,
      underReviewCount: details.filter((d) => d.newStatus === MirrorStatus.UNDER_REVIEW).length,
      downCount: details.filter((d) => d.newStatus === MirrorStatus.DOWN).length,
      moviesDisabledCount: disabledMovieIds.size,
      details,
    };
  }
}
