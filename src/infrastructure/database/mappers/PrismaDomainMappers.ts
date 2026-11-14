import {
  Movie as PrismaMovie,
  MirrorLink as PrismaMirror,
  Season as PrismaSeason,
  Episode as PrismaEpisode,
  EpisodeMirror as PrismaEpisodeMirror,
  WatchHistory as PrismaWatchHistory,
} from "@prisma/client";
import { Movie } from "@/domain/entities/Movie";
import { MirrorLink } from "@/domain/entities/MirrorLink";
import { Season } from "@/domain/entities/Season";
import { Episode } from "@/domain/entities/Episode";
import { EpisodeMirror } from "@/domain/entities/EpisodeMirror";
import { WatchHistory } from "@/domain/entities/WatchHistory";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { MirrorStatus } from "@/domain/enums/MirrorStatus";

/**
 * Mapeadores centralizados entre registros de Prisma ORM (Infraestructura)
 * y Entidades del Dominio (`Movie`, `MirrorLink`, `Season`, `Episode`, `EpisodeMirror`, `WatchHistory`).
 *
 * Evita duplicar la lógica de transformación en cada repositorio concreto.
 */

/**
 * Convierte una fila `MirrorLink` de Prisma en una entidad de dominio `MirrorLink`.
 *
 * @param row Registro `MirrorLink` proveniente de PostgreSQL/Prisma.
 * @returns Instancia de dominio `MirrorLink`.
 */
export function mapPrismaMirrorToDomain(row: PrismaMirror): MirrorLink {
  return new MirrorLink({
    id: row.id,
    movieId: row.movieId,
    serverName: row.serverName,
    language: row.language,
    rawUrl: row.rawUrl,
    format: row.format as MirrorFormat,
    quality: row.quality,
    priority: row.priority,
    status: row.status as MirrorStatus,
    consecutiveFailures: row.consecutiveFailures,
    lastCheckedAt: row.lastCheckedAt,
  });
}

/**
 * Convierte una fila `Movie` de Prisma (con o sin `mirrors` incluidos) en una entidad `Movie`.
 *
 * @param row Registro `Movie` proveniente de PostgreSQL/Prisma.
 * @returns Instancia de dominio `Movie`.
 */
export function mapPrismaMovieToDomain(
  row: PrismaMovie & { mirrors?: PrismaMirror[] }
): Movie {
  return new Movie({
    id: row.id,
    tmdbId: row.tmdbId,
    mediaType: row.mediaType,
    title: row.title,
    originalTitle: row.originalTitle,
    synopsis: row.synopsis,
    posterUrl: row.posterUrl,
    backdropUrl: row.backdropUrl,
    releaseYear: row.releaseYear,
    durationMins: row.durationMins,
    rating: row.rating,
    qualityBadge: row.qualityBadge,
    genres: row.genres,
    isAvailable: row.isAvailable,
    mirrors: row.mirrors
      ? row.mirrors.map((mirrorRow) => mapPrismaMirrorToDomain(mirrorRow))
      : [],
  });
}

/**
 * Convierte una fila `EpisodeMirror` de Prisma en una entidad de dominio `EpisodeMirror`.
 *
 * @param row Registro `EpisodeMirror` proveniente de PostgreSQL/Prisma.
 * @returns Instancia de dominio `EpisodeMirror`.
 */
export function mapPrismaEpisodeMirrorToDomain(
  row: PrismaEpisodeMirror
): EpisodeMirror {
  return new EpisodeMirror({
    id: row.id,
    episodeId: row.episodeId,
    serverName: row.serverName,
    language: row.language,
    rawUrl: row.rawUrl,
    format: row.format as MirrorFormat,
    quality: row.quality,
    priority: row.priority,
    status: row.status as MirrorStatus,
    consecutiveFailures: row.consecutiveFailures,
    lastCheckedAt: row.lastCheckedAt,
  });
}

/**
 * Convierte una fila `Episode` de Prisma (con o sin `mirrors`) en una entidad `Episode`.
 *
 * @param row Registro `Episode` proveniente de PostgreSQL/Prisma.
 * @returns Instancia de dominio `Episode`.
 */
export function mapPrismaEpisodeToDomain(
  row: PrismaEpisode & { mirrors?: PrismaEpisodeMirror[] }
): Episode {
  return new Episode({
    id: row.id,
    seasonId: row.seasonId,
    episodeNumber: row.episodeNumber,
    title: row.title,
    overview: row.overview,
    duration: row.duration,
    videoUrl: row.videoUrl,
    thumbnailUrl: row.thumbnailUrl,
    introStart: row.introStart,
    introEnd: row.introEnd,
    mirrors: row.mirrors
      ? row.mirrors.map((mirrorRow) => mapPrismaEpisodeMirrorToDomain(mirrorRow))
      : [],
  });
}

/**
 * Convierte una fila `Season` de Prisma (con o sin `episodes`) en una entidad `Season`.
 *
 * @param row Registro `Season` proveniente de PostgreSQL/Prisma.
 * @returns Instancia de dominio `Season`.
 */
export function mapPrismaSeasonToDomain(
  row: PrismaSeason & {
    episodes?: (PrismaEpisode & { mirrors?: PrismaEpisodeMirror[] })[];
  }
): Season {
  return new Season({
    id: row.id,
    seriesId: row.seriesId,
    seasonNumber: row.seasonNumber,
    title: row.title,
    overview: row.overview,
    posterUrl: row.posterUrl,
    releaseDate: row.releaseDate,
    episodes: row.episodes
      ? row.episodes.map((episodeRow) => mapPrismaEpisodeToDomain(episodeRow))
      : [],
  });
}

/**
 * Convierte una fila `WatchHistory` de Prisma en una entidad de dominio `WatchHistory`.
 *
 * @param row Registro `WatchHistory` proveniente de PostgreSQL/Prisma.
 * @returns Instancia de dominio `WatchHistory`.
 */
export function mapPrismaWatchHistoryToDomain(
  row: PrismaWatchHistory
): WatchHistory {
  return new WatchHistory({
    id: row.id,
    userId: row.userId,
    movieId: row.movieId,
    episodeId: row.episodeId,
    progressSeconds: row.progressSeconds,
    durationSeconds: row.durationSeconds,
    completed: row.completed,
    updatedAt: row.updatedAt,
  });
}
