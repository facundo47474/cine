import {
  PrismaClient,
  Movie as PrismaMovie,
  Season as PrismaSeason,
  Episode as PrismaEpisode,
  EpisodeMirror as PrismaEpisodeMirror,
} from "@prisma/client";
import {
  ISeriesRepository,
  UpsertSeriesInput,
  EpisodeHierarchy,
} from "@/domain/interfaces/ISeriesRepository";
import { Movie } from "@/domain/entities/Movie";
import { Season } from "@/domain/entities/Season";
import { Episode } from "@/domain/entities/Episode";
import { EpisodeMirror } from "@/domain/entities/EpisodeMirror";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { MirrorStatus } from "@/domain/enums/MirrorStatus";

export class PrismaSeriesRepository implements ISeriesRepository {
  constructor(private readonly db: PrismaClient) {}

  private mapEpisodeMirrorToDomain(row: PrismaEpisodeMirror): EpisodeMirror {
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

  private mapEpisodeToDomain(
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
      mirrors: row.mirrors ? row.mirrors.map((m) => this.mapEpisodeMirrorToDomain(m)) : [],
    });
  }

  private mapSeasonToDomain(
    row: PrismaSeason & { episodes?: (PrismaEpisode & { mirrors?: PrismaEpisodeMirror[] })[] }
  ): Season {
    return new Season({
      id: row.id,
      seriesId: row.seriesId,
      seasonNumber: row.seasonNumber,
      title: row.title,
      overview: row.overview,
      posterUrl: row.posterUrl,
      releaseDate: row.releaseDate,
      episodes: row.episodes ? row.episodes.map((e) => this.mapEpisodeToDomain(e)) : [],
    });
  }

  private mapMovieToDomain(row: PrismaMovie): Movie {
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
    });
  }

  public async findSeriesById(id: string): Promise<Movie | null> {
    const row = await this.db.movie.findUnique({
      where: { id },
    });
    if (!row) return null;
    return this.mapMovieToDomain(row);
  }

  public async findSeriesByTmdbId(tmdbId: number): Promise<Movie | null> {
    const row = await this.db.movie.findFirst({
      where: { tmdbId, mediaType: "SERIES" },
    });
    if (!row) {
      // Fallback a tmdbId sin filtrar por mediaType por compatibilidad
      const fallback = await this.db.movie.findUnique({ where: { tmdbId } });
      return fallback ? this.mapMovieToDomain(fallback) : null;
    }
    return this.mapMovieToDomain(row);
  }

  public async findSeasonsBySeriesId(seriesId: string): Promise<Season[]> {
    const rows = await this.db.season.findMany({
      where: { seriesId },
      include: {
        episodes: {
          orderBy: { episodeNumber: "asc" },
        },
      },
      orderBy: { seasonNumber: "asc" },
    });

    return rows.map((r) => this.mapSeasonToDomain(r));
  }

  public async findEpisodesBySeasonId(seasonId: string): Promise<Episode[]> {
    const rows = await this.db.episode.findMany({
      where: { seasonId },
      include: {
        mirrors: {
          orderBy: { priority: "asc" },
        },
      },
      orderBy: { episodeNumber: "asc" },
    });

    return rows.map((r) => this.mapEpisodeToDomain(r));
  }

  public async findEpisodeById(episodeId: string): Promise<Episode | null> {
    const row = await this.db.episode.findUnique({
      where: { id: episodeId },
      include: {
        mirrors: {
          orderBy: { priority: "asc" },
        },
      },
    });

    if (!row) return null;
    return this.mapEpisodeToDomain(row);
  }

  public async findEpisodeHierarchy(
    episodeId: string
  ): Promise<EpisodeHierarchy | null> {
    const row = await this.db.episode.findUnique({
      where: { id: episodeId },
      include: {
        mirrors: {
          orderBy: { priority: "asc" },
        },
        season: {
          include: {
            series: {
              include: {
                seasons: {
                  include: {
                    episodes: {
                      include: {
                        mirrors: {
                          orderBy: { priority: "asc" },
                        },
                      },
                      orderBy: { episodeNumber: "asc" },
                    },
                  },
                  orderBy: { seasonNumber: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (!row || !row.season || !row.season.series) return null;

    const episode = this.mapEpisodeToDomain(row);
    const season = this.mapSeasonToDomain(row.season);
    const series = this.mapMovieToDomain(row.season.series);
    const allSeasons = (row.season.series.seasons || []).map((s) =>
      this.mapSeasonToDomain(s)
    );

    return {
      episode,
      season,
      series,
      allSeasons,
    };
  }

  public async findSeriesDetails(
    idOrTmdbId: string
  ): Promise<{ series: Movie; seasons: Season[] } | null> {
    let seriesRow: PrismaMovie | null = null;

    if (idOrTmdbId.startsWith("tmdb-")) {
      const tmdbId = Number(idOrTmdbId.replace("tmdb-", ""));
      if (!isNaN(tmdbId)) {
        seriesRow = await this.db.movie.findFirst({
          where: { tmdbId, mediaType: "SERIES" },
        });
        if (!seriesRow) {
          seriesRow = await this.db.movie.findUnique({ where: { tmdbId } });
        }
      }
    } else {
      seriesRow = await this.db.movie.findUnique({
        where: { id: idOrTmdbId },
      });
      if (!seriesRow && !isNaN(Number(idOrTmdbId))) {
        seriesRow = await this.db.movie.findUnique({
          where: { tmdbId: Number(idOrTmdbId) },
        });
      }
    }

    if (!seriesRow) return null;

    const seasons = await this.findSeasonsBySeriesId(seriesRow.id);
    return {
      series: this.mapMovieToDomain(seriesRow),
      seasons,
    };
  }

  public async upsertSeries(
    data: UpsertSeriesInput
  ): Promise<{ series: Movie; seasons: Season[] }> {
    let seriesRecord: PrismaMovie;

    if (data.tmdbId) {
      const existing = await this.db.movie.findFirst({
        where: { tmdbId: data.tmdbId, mediaType: "SERIES" },
      });

      if (existing) {
        seriesRecord = await this.db.movie.update({
          where: { id: existing.id },
          data: {
            title: data.title,
            originalTitle: data.originalTitle ?? existing.originalTitle,
            synopsis: data.synopsis,
            posterUrl: data.posterUrl,
            backdropUrl: data.backdropUrl ?? existing.backdropUrl,
            releaseYear: data.releaseYear,
            rating: data.rating,
            qualityBadge: data.qualityBadge || existing.qualityBadge,
            genres: data.genres || existing.genres,
            mediaType: "SERIES",
            isAvailable: true,
          },
        });
      } else {
        seriesRecord = await this.db.movie.create({
          data: {
            tmdbId: data.tmdbId,
            mediaType: "SERIES",
            title: data.title,
            originalTitle: data.originalTitle ?? null,
            synopsis: data.synopsis,
            posterUrl: data.posterUrl,
            backdropUrl: data.backdropUrl ?? null,
            releaseYear: data.releaseYear,
            durationMins: 45,
            rating: data.rating,
            qualityBadge: data.qualityBadge || "HD",
            genres: data.genres || [],
            isAvailable: true,
          },
        });
      }
    } else {
      seriesRecord = await this.db.movie.create({
        data: {
          mediaType: "SERIES",
          title: data.title,
          originalTitle: data.originalTitle ?? null,
          synopsis: data.synopsis,
          posterUrl: data.posterUrl,
          backdropUrl: data.backdropUrl ?? null,
          releaseYear: data.releaseYear,
          durationMins: 45,
          rating: data.rating,
          qualityBadge: data.qualityBadge || "HD",
          genres: data.genres || [],
          isAvailable: true,
        },
      });
    }

    // Procesar temporadas y episodios
    for (const seasonData of data.seasons) {
      const seasonRecord = await this.db.season.upsert({
        where: {
          seriesId_seasonNumber: {
            seriesId: seriesRecord.id,
            seasonNumber: seasonData.seasonNumber,
          },
        },
        update: {
          title: seasonData.title,
          overview: seasonData.overview ?? null,
          posterUrl: seasonData.posterUrl ?? null,
          releaseDate: seasonData.releaseDate ?? null,
        },
        create: {
          seriesId: seriesRecord.id,
          seasonNumber: seasonData.seasonNumber,
          title: seasonData.title,
          overview: seasonData.overview ?? null,
          posterUrl: seasonData.posterUrl ?? null,
          releaseDate: seasonData.releaseDate ?? null,
        },
      });

      for (const ep of seasonData.episodes) {
        await this.db.episode.upsert({
          where: {
            seasonId_episodeNumber: {
              seasonId: seasonRecord.id,
              episodeNumber: ep.episodeNumber,
            },
          },
          update: {
            title: ep.title,
            overview: ep.overview ?? null,
            duration: ep.duration ?? 45,
            videoUrl: ep.videoUrl ?? "",
            thumbnailUrl: ep.thumbnailUrl ?? null,
            introStart: ep.introStart ?? null,
            introEnd: ep.introEnd ?? null,
          },
          create: {
            seasonId: seasonRecord.id,
            episodeNumber: ep.episodeNumber,
            title: ep.title,
            overview: ep.overview ?? null,
            duration: ep.duration ?? 45,
            videoUrl: ep.videoUrl ?? "",
            thumbnailUrl: ep.thumbnailUrl ?? null,
            introStart: ep.introStart ?? null,
            introEnd: ep.introEnd ?? null,
          },
        });
      }
    }

    const fullSeasons = await this.findSeasonsBySeriesId(seriesRecord.id);

    return {
      series: this.mapMovieToDomain(seriesRecord),
      seasons: fullSeasons,
    };
  }

  public async findAvailableSeries(
    searchQuery?: string,
    genre?: string
  ): Promise<Movie[]> {
    const rows = await this.db.movie.findMany({
      where: {
        isAvailable: true,
        mediaType: "SERIES",
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
      orderBy: [{ releaseYear: "desc" }, { createdAt: "desc" }],
    });

    return rows.map((r) => this.mapMovieToDomain(r));
  }
}
