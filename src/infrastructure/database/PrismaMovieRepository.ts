import { PrismaClient, MirrorLink as PrismaMirror, Movie as PrismaMovie } from "@prisma/client";
import {
  IMovieRepository,
  UpsertMovieInput,
} from "@/domain/interfaces/IMovieRepository";
import { Movie } from "@/domain/entities/Movie";
import { MirrorLink } from "@/domain/entities/MirrorLink";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { MirrorStatus } from "@/domain/enums/MirrorStatus";

export class PrismaMovieRepository implements IMovieRepository {
  constructor(private readonly db: PrismaClient) {}

  private mapMirrorToDomain(row: PrismaMirror): MirrorLink {
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

  private mapMovieToDomain(
    row: PrismaMovie & { mirrors?: PrismaMirror[] }
  ): Movie {
    return new Movie({
      id: row.id,
      tmdbId: row.tmdbId,
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
      mirrors: row.mirrors ? row.mirrors.map((m) => this.mapMirrorToDomain(m)) : [],
    });
  }

  public async findAvailableCatalog(
    searchQuery?: string,
    genre?: string
  ): Promise<Movie[]> {
    const rows = await this.db.movie.findMany({
      where: {
        isAvailable: true,
        ...(searchQuery
          ? {
              OR: [
                { title: { contains: searchQuery, mode: "insensitive" } },
                { originalTitle: { contains: searchQuery, mode: "insensitive" } },
                { synopsis: { contains: searchQuery, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(genre ? { genres: { has: genre } } : {}),
      },
      include: {
        mirrors: {
          orderBy: { priority: "asc" },
        },
      },
      orderBy: [{ releaseYear: "desc" }, { createdAt: "desc" }],
    });

    return rows.map((row) => this.mapMovieToDomain(row));
  }

  public async findByIdWithMirrors(id: string): Promise<Movie | null> {
    const row = await this.db.movie.findUnique({
      where: { id },
      include: {
        mirrors: {
          orderBy: { priority: "asc" },
        },
      },
    });

    if (!row) return null;
    return this.mapMovieToDomain(row);
  }

  public async findByTmdbId(tmdbId: number): Promise<Movie | null> {
    const row = await this.db.movie.findUnique({
      where: { tmdbId },
      include: {
        mirrors: {
          orderBy: { priority: "asc" },
        },
      },
    });

    if (!row) return null;
    return this.mapMovieToDomain(row);
  }

  public async upsertMovieWithMirrors(data: UpsertMovieInput): Promise<Movie> {
    const mirrorCreateData = data.mirrors.map((m, idx) => ({
      serverName: m.serverName,
      language: m.language || "Latino",
      rawUrl: m.rawUrl,
      format: m.format,
      quality: m.quality || "1080p",
      priority: m.priority ?? idx + 1,
      status: MirrorStatus.ACTIVE,
      consecutiveFailures: 0,
    }));

    if (data.tmdbId) {
      const existing = await this.db.movie.findUnique({
        where: { tmdbId: data.tmdbId },
      });

      if (existing) {
        const updated = await this.db.movie.update({
          where: { id: existing.id },
          data: {
            title: data.title,
            originalTitle: data.originalTitle ?? existing.originalTitle,
            synopsis: data.synopsis,
            posterUrl: data.posterUrl,
            backdropUrl: data.backdropUrl ?? existing.backdropUrl,
            releaseYear: data.releaseYear,
            durationMins: data.durationMins,
            rating: data.rating,
            qualityBadge: data.qualityBadge || existing.qualityBadge,
            genres: data.genres || existing.genres,
            isAvailable: true,
            mirrors: {
              deleteMany: {},
              create: mirrorCreateData,
            },
          },
          include: {
            mirrors: { orderBy: { priority: "asc" } },
          },
        });
        return this.mapMovieToDomain(updated);
      }
    }

    const created = await this.db.movie.create({
      data: {
        tmdbId: data.tmdbId ?? null,
        title: data.title,
        originalTitle: data.originalTitle ?? null,
        synopsis: data.synopsis,
        posterUrl: data.posterUrl,
        backdropUrl: data.backdropUrl ?? null,
        releaseYear: data.releaseYear,
        durationMins: data.durationMins,
        rating: data.rating,
        qualityBadge: data.qualityBadge || "HD",
        genres: data.genres || [],
        isAvailable: true,
        mirrors: {
          create: mirrorCreateData,
        },
      },
      include: {
        mirrors: { orderBy: { priority: "asc" } },
      },
    });

    return this.mapMovieToDomain(created);
  }

  public async updateAvailability(
    movieId: string,
    isAvailable: boolean
  ): Promise<void> {
    await this.db.movie.update({
      where: { id: movieId },
      data: { isAvailable },
    });
  }
}
