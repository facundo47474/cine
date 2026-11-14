import { IMirrorRepository } from "@/domain/interfaces/IMirrorRepository";
import { IMovieRepository } from "@/domain/interfaces/IMovieRepository";
import { ILinkProber } from "@/domain/interfaces/ILinkProber";
import { MirrorLink } from "@/domain/entities/MirrorLink";
import { MirrorStatus } from "@/domain/enums/MirrorStatus";
import { isStreamwish } from "@/domain/utils/streamwishMatcher";

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
  isStreamwish?: boolean;
  isPermanentGone?: boolean;
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
 * Determina si el resultado de una sonda HTTP sobre un mirror representa una caída fatal
 * (`HTTP 404`, `HTTP 410`, `HTTP >= 500` o marcado explícito como eliminado).
 *
 * @param detail Resultado de auditoría de un mirror.
 * @returns `true` si el fallo es definitivo/fatal.
 */
function isFatalMirrorProbeFailure(detail: MirrorAuditDetail): boolean {
  if (detail.newStatus === MirrorStatus.ACTIVE) return false;
  return (
    Boolean(detail.isPermanentGone) ||
    detail.httpStatus === 404 ||
    detail.httpStatus === 410 ||
    detail.httpStatus >= 500
  );
}

/**
 * Servicio Determinista de Auditoría y Salud de Enlaces (`HealthCheckerService`).
 *
 * Evalúa primero todos los mirrors de Streamwish en paralelo y solo consulta servidores
 * alternativos si la totalidad de los mirrors de Streamwish devolvieron error fatal.
 */
export class HealthCheckerService {
  constructor(
    private readonly mirrorRepository: IMirrorRepository,
    private readonly movieRepository: IMovieRepository,
    private readonly linkProber: ILinkProber
  ) {}

  /**
   * Verifica la disponibilidad HTTP de un mirror individual, actualiza su estado en la entidad
   * de dominio y persiste el cambio en la base de datos.
   *
   * @param mirror Entidad `MirrorLink` a verificar.
   * @param recalculateMovieAvailability Si es `true`, recalcula inmediatamente la disponibilidad de la película.
   * @returns Detalle completo del resultado de la auditoría (`MirrorAuditDetail`).
   */
  private async probeAndPersistMirror(
    mirror: MirrorLink,
    recalculateMovieAvailability: boolean = true
  ): Promise<MirrorAuditDetail> {
    const previousStatus = mirror.status;
    const probeResult = await this.linkProber.probeUrl(
      mirror.rawUrl,
      mirror.format
    );

    if (probeResult.isAlive) {
      mirror.markCheckSuccess();
    } else {
      mirror.markCheckFailure(probeResult.isPermanentGone);
    }

    await this.mirrorRepository.save(mirror);

    let movieStillAvailable = true;
    if (recalculateMovieAvailability) {
      movieStillAvailable = await this.refreshMovieAvailabilityStatus(
        mirror.movieId
      );
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
      isStreamwish: isStreamwish({
        serverName: mirror.serverName,
        url: mirror.rawUrl,
      }),
      isPermanentGone: probeResult.isPermanentGone,
    };
  }

  /**
   * Recalcula y persiste en PostgreSQL si una película sigue teniendo al menos un mirror reproducible.
   *
   * @param movieId UUID de la película.
   * @returns `true` si la película continúa disponible; `false` si fue ocultada (Soft Delete).
   */
  private async refreshMovieAvailabilityStatus(
    movieId: string
  ): Promise<boolean> {
    const movie = await this.movieRepository.findByIdWithMirrors(movieId);
    if (!movie) return true;

    const stillAvailable = movie.recalculateAvailability();
    await this.movieRepository.updateAvailability(movie.id, stillAvailable);
    return stillAvailable;
  }

  /**
   * Audita un único mirror por su ID (invocado por el reproductor cuando falla un servidor
   * o desde herramientas administrativas).
   *
   * @param mirrorId UUID del mirror a verificar.
   * @returns Detalle de la auditoría o `null` si el mirror no existe.
   */
  public async auditSingleMirror(
    mirrorId: string
  ): Promise<MirrorAuditDetail | null> {
    const mirror = await this.mirrorRepository.findById(mirrorId);
    if (!mirror) return null;

    return this.probeAndPersistMirror(mirror, true);
  }

  /**
   * Ejecuta una verificación determinista por película:
   * 1. Evalúa primero todos los mirrors de Streamwish en paralelo.
   * 2. Solo evalúa servidores alternativos si todos los Streamwish sufrieron un fallo fatal.
   *
   * @param movieId UUID de la película.
   * @param mirrors Lista de enlaces `MirrorLink` asociados a la película.
   * @returns Lista de detalles de auditoría para cada mirror verificado.
   */
  public async auditMirrorGroupDeterministic(
    movieId: string,
    mirrors: MirrorLink[]
  ): Promise<MirrorAuditDetail[]> {
    const streamwishMirrors = mirrors.filter((mirror) =>
      isStreamwish({ serverName: mirror.serverName, url: mirror.rawUrl })
    );
    const alternativeMirrors = mirrors.filter(
      (mirror) =>
        !isStreamwish({ serverName: mirror.serverName, url: mirror.rawUrl })
    );

    const auditDetails: MirrorAuditDetail[] = [];

    if (streamwishMirrors.length > 0) {
      const streamwishResults = await Promise.all(
        streamwishMirrors.map((mirror) =>
          this.probeAndPersistMirror(mirror, false)
        )
      );
      auditDetails.push(...streamwishResults);

      const allStreamwishDead = streamwishResults.every((result) =>
        isFatalMirrorProbeFailure(result)
      );

      if (!allStreamwishDead) {
        const stillAvailable = await this.refreshMovieAvailabilityStatus(
          movieId
        );
        auditDetails.forEach((detail) => {
          detail.movieStillAvailable = stillAvailable;
        });
        return auditDetails;
      }
    }

    if (alternativeMirrors.length > 0) {
      const alternativeResults = await Promise.all(
        alternativeMirrors.map((mirror) =>
          this.probeAndPersistMirror(mirror, false)
        )
      );
      auditDetails.push(...alternativeResults);
    }

    const stillAvailable = await this.refreshMovieAvailabilityStatus(movieId);
    auditDetails.forEach((detail) => {
      detail.movieStillAvailable = stillAvailable;
    });

    return auditDetails;
  }

  /**
   * Verifica de forma determinista todos los mirrors de una película específica.
   *
   * @param movieId UUID de la película.
   * @returns Detalles de auditoría de sus mirrors.
   */
  public async verifyMovieMirrorsDeterministic(
    movieId: string
  ): Promise<MirrorAuditDetail[]> {
    const movie = await this.movieRepository.findByIdWithMirrors(movieId);
    if (!movie || movie.mirrors.length === 0) return [];

    return this.auditMirrorGroupDeterministic(movie.id, movie.mirrors);
  }

  /**
   * Ejecuta un lote de revisiones de salud agrupadas por película,
   * respetando una pausa configurable (`delayBetweenChecksMs`) entre grupos.
   *
   * @param batchSize Cantidad máxima de mirrors a revisar en el lote.
   * @param delayBetweenChecksMs Milisegundos de espera entre cada grupo de película.
   * @returns Reporte consolidado de salud (`BatchHealthReport`).
   */
  public async runBatchHealthCheck(
    batchSize: number = 25,
    delayBetweenChecksMs: number = 200
  ): Promise<BatchHealthReport> {
    const mirrors = await this.mirrorRepository.findBatchForHealthCheck(
      batchSize
    );
    const details: MirrorAuditDetail[] = [];
    const disabledMovieIds = new Set<string>();

    const mirrorsByMovie = new Map<string, MirrorLink[]>();
    for (const mirror of mirrors) {
      const movieGroup = mirrorsByMovie.get(mirror.movieId) ?? [];
      movieGroup.push(mirror);
      mirrorsByMovie.set(mirror.movieId, movieGroup);
    }

    const movieGroups = Array.from(mirrorsByMovie.entries());
    for (let groupIndex = 0; groupIndex < movieGroups.length; groupIndex++) {
      const [movieId, groupMirrors] = movieGroups[groupIndex];
      const groupDetails = await this.auditMirrorGroupDeterministic(
        movieId,
        groupMirrors
      );

      for (const detail of groupDetails) {
        details.push(detail);
        if (!detail.movieStillAvailable) {
          disabledMovieIds.add(detail.movieId);
        }
      }

      if (delayBetweenChecksMs > 0 && groupIndex < movieGroups.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenChecksMs)
        );
      }
    }

    return {
      timestamp: new Date().toISOString(),
      totalChecked: details.length,
      aliveCount: details.filter(
        (detail) => detail.newStatus === MirrorStatus.ACTIVE
      ).length,
      underReviewCount: details.filter(
        (detail) => detail.newStatus === MirrorStatus.UNDER_REVIEW
      ).length,
      downCount: details.filter(
        (detail) => detail.newStatus === MirrorStatus.DOWN
      ).length,
      moviesDisabledCount: disabledMovieIds.size,
      details,
    };
  }
}
