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
 * Servicio Determinista de Auditoría y Salud de Enlaces (Health Checker).
 * Evalúa primero todos los mirrors de Streamwish en paralelo y solo consulta servidores
 * alternativos si todos los mirrors de Streamwish devuelven HTTP 404/410/500 o fueron borrados.
 */
export class HealthCheckerService {
  constructor(
    private readonly mirrorRepository: IMirrorRepository,
    private readonly movieRepository: IMovieRepository,
    private readonly linkProber: ILinkProber
  ) {}

  private async probeAndPersistMirror(
    mirror: MirrorLink,
    recalculateMovieAvailability: boolean = true
  ): Promise<MirrorAuditDetail> {
    const previousStatus = mirror.status;
    const probeResult = await this.linkProber.probeUrl(mirror.rawUrl, mirror.format);

    if (probeResult.isAlive) {
      mirror.markCheckSuccess();
    } else {
      mirror.markCheckFailure(probeResult.isPermanentGone);
    }

    await this.mirrorRepository.save(mirror);

    let movieStillAvailable = true;
    if (recalculateMovieAvailability) {
      const movie = await this.movieRepository.findByIdWithMirrors(mirror.movieId);
      if (movie) {
        movieStillAvailable = movie.recalculateAvailability();
        await this.movieRepository.updateAvailability(movie.id, movieStillAvailable);
      }
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
   * Audita un único mirror por ID (usado tanto por el worker como cuando un usuario reporta fallo).
   */
  public async auditSingleMirror(mirrorId: string): Promise<MirrorAuditDetail | null> {
    const mirror = await this.mirrorRepository.findById(mirrorId);
    if (!mirror) return null;

    return this.probeAndPersistMirror(mirror, true);
  }

  /**
   * Ejecuta una verificación determinista por película:
   * 1. Evalúa primero todos los mirrors de Streamwish en paralelo.
   * 2. Solo evalúa servidores alternativos si todos los Streamwish devolvieron HTTP 404/410/500 o archivo borrado.
   */
  public async auditMirrorGroupDeterministic(
    movieId: string,
    mirrors: MirrorLink[]
  ): Promise<MirrorAuditDetail[]> {
    const streamwishMirrors = mirrors.filter((m) =>
      isStreamwish({ serverName: m.serverName, url: m.rawUrl })
    );
    const alternativeMirrors = mirrors.filter(
      (m) => !isStreamwish({ serverName: m.serverName, url: m.rawUrl })
    );

    const details: MirrorAuditDetail[] = [];

    if (streamwishMirrors.length > 0) {
      const swResults = await Promise.all(
        streamwishMirrors.map((m) => this.probeAndPersistMirror(m, false))
      );
      details.push(...swResults);

      const allStreamwishDead = swResults.every((res) =>
        isFatalMirrorProbeFailure(res)
      );

      if (!allStreamwishDead) {
        const movie = await this.movieRepository.findByIdWithMirrors(movieId);
        if (movie) {
          const stillAvailable = movie.recalculateAvailability();
          await this.movieRepository.updateAvailability(movie.id, stillAvailable);
          details.forEach((d) => {
            d.movieStillAvailable = stillAvailable;
          });
        }
        return details;
      }
    }

    if (alternativeMirrors.length > 0) {
      const altResults = await Promise.all(
        alternativeMirrors.map((m) => this.probeAndPersistMirror(m, false))
      );
      details.push(...altResults);
    }

    const movie = await this.movieRepository.findByIdWithMirrors(movieId);
    if (movie) {
      const stillAvailable = movie.recalculateAvailability();
      await this.movieRepository.updateAvailability(movie.id, stillAvailable);
      details.forEach((d) => {
        d.movieStillAvailable = stillAvailable;
      });
    }

    return details;
  }

  /**
   * Verifica de forma determinista todos los mirrors de una película específica.
   */
  public async verifyMovieMirrorsDeterministic(
    movieId: string
  ): Promise<MirrorAuditDetail[]> {
    const movie = await this.movieRepository.findByIdWithMirrors(movieId);
    if (!movie || movie.mirrors.length === 0) return [];

    return this.auditMirrorGroupDeterministic(movie.id, movie.mirrors);
  }

  /**
   * Ejecuta un lote de revisiones deterministas agrupadas por película
   * para priorizar siempre Streamwish en paralelo antes de tocar respaldos sucios.
   */
  public async runBatchHealthCheck(
    batchSize: number = 25,
    delayBetweenChecksMs: number = 200
  ): Promise<BatchHealthReport> {
    const mirrors = await this.mirrorRepository.findBatchForHealthCheck(batchSize);
    const details: MirrorAuditDetail[] = [];
    const disabledMovieIds = new Set<string>();

    const mirrorsByMovie = new Map<string, MirrorLink[]>();
    for (const mirror of mirrors) {
      const group = mirrorsByMovie.get(mirror.movieId) ?? [];
      group.push(mirror);
      mirrorsByMovie.set(mirror.movieId, group);
    }

    const movieGroups = Array.from(mirrorsByMovie.entries());
    for (let i = 0; i < movieGroups.length; i++) {
      const [movieId, groupMirrors] = movieGroups[i];
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

      if (delayBetweenChecksMs > 0 && i < movieGroups.length - 1) {
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
