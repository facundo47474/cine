import { PrismaClient, Movie as PrismaMovie } from "@prisma/client";
import {
  ISeriesRepository,
  UpsertSeriesInput,
  EpisodeHierarchy,
} from "@/domain/interfaces/ISeriesRepository";
import { CreateMirrorInput } from "@/domain/interfaces/IMovieRepository";
import { Movie } from "@/domain/entities/Movie";
import { Season } from "@/domain/entities/Season";
import { Episode } from "@/domain/entities/Episode";
import { EpisodeMirror } from "@/domain/entities/EpisodeMirror";
import { MirrorStatus } from "@/domain/enums/MirrorStatus";
import {
  mapPrismaEpisodeMirrorToDomain,
  mapPrismaEpisodeToDomain,
  mapPrismaMovieToDomain,
  mapPrismaSeasonToDomain,
} from "./mappers/PrismaDomainMappers";

/**
 * Repositorio concreto de Series de TV, Temporadas y Episodios sobre PostgreSQL con Prisma ORM.
 */
export class PrismaSeriesRepository implements ISeriesRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Busca una serie por su UUID primario en la tabla `Movie`.
   *
   * @param id UUID de la serie.
   * @returns Entidad `Movie` (con `mediaType = "SERIES"`) o `null`.
   */
  public async findSeriesById(id: string): Promise<Movie | null> {
    const row = await this.db.movie.findUnique({
      where: { id },
    });
    if (!row) return null;
    return mapPrismaMovieToDomain(row);
  }

  /**
   * Busca una serie por su identificador numérico de TMDB.
   *
   * @param tmdbId Identificador numérico de TMDB.
   * @returns Entidad `Movie` correspondiente a la serie o `null`.
   */
  public async findSeriesByTmdbId(tmdbId: number): Promise<Movie | null> {
    const row = await this.db.movie.findFirst({
      where: { tmdbId, mediaType: "SERIES" },
    });
    if (!row) return null;
    return mapPrismaMovieToDomain(row);
  }

  /**
   * Obtiene todas las temporadas de una serie ordenadas por número de temporada,
   * incluyendo sus episodios ordenados ascendentemente.
   *
   * @param seriesId UUID de la serie.
   * @returns Lista de entidades `Season`.
   */
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

    return rows.map((row) => mapPrismaSeasonToDomain(row));
  }

  /**
   * Obtiene todos los episodios de una temporada específica incluyendo sus mirrors ordenados por prioridad.
   *
   * @param seasonId UUID de la temporada.
   * @returns Lista de entidades `Episode`.
   */
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

    return rows.map((row) => mapPrismaEpisodeToDomain(row));
  }

  /**
   * Obtiene un episodio individual por su UUID junto con sus enlaces mirror.
   *
   * @param episodeId UUID del episodio.
   * @returns Entidad `Episode` o `null`.
   */
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
    return mapPrismaEpisodeToDomain(row);
  }

  /**
   * Recupera en una única consulta relacional la jerarquía completa de un episodio:
   * el episodio con sus mirrors, su temporada, la serie padre y todas las temporadas con sus episodios.
   *
   * @param episodeId UUID del episodio.
   * @returns Objeto `EpisodeHierarchy` o `null` si no existe.
   */
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

    const episode = mapPrismaEpisodeToDomain(row);
    const season = mapPrismaSeasonToDomain(row.season);
    const series = mapPrismaMovieToDomain(row.season.series);
    const allSeasons = (row.season.series.seasons || []).map((seasonRow) =>
      mapPrismaSeasonToDomain(seasonRow)
    );

    return {
      episode,
      season,
      series,
      allSeasons,
    };
  }

  /**
   * Busca los detalles de una serie (entidad principal + temporadas con episodios)
   * aceptando tanto su UUID local como un slug `"tmdb-{id}"` o número de TMDB.
   *
   * @param idOrTmdbId UUID local o identificador TMDB.
   * @returns Objeto `{ series, seasons }` o `null` si no se encontró.
   */
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
      }
    } else {
      seriesRow = await this.db.movie.findUnique({
        where: { id: idOrTmdbId },
      });
      if (!seriesRow && !isNaN(Number(idOrTmdbId))) {
        seriesRow = await this.db.movie.findFirst({
          where: { tmdbId: Number(idOrTmdbId), mediaType: "SERIES" },
        });
      }
    }

    if (!seriesRow) return null;

    const seasons = await this.findSeasonsBySeriesId(seriesRow.id);
    return {
      series: mapPrismaMovieToDomain(seriesRow),
      seasons,
    };
  }

  /**
   * Crea o actualiza una serie completa junto con sus temporadas y episodios de forma idempotente.
   *
   * @param data Datos de la serie, temporadas y capítulos (`UpsertSeriesInput`).
   * @returns Serie y temporadas actualizadas (`{ series, seasons }`).
   */
  public async upsertSeries(
    data: UpsertSeriesInput
  ): Promise<{ series: Movie; seasons: Season[] }> {
    let seriesRecord: PrismaMovie;

    if (data.tmdbId) {
      const existingSeries = await this.db.movie.findFirst({
        where: { tmdbId: data.tmdbId, mediaType: "SERIES" },
      });

      if (existingSeries) {
        seriesRecord = await this.db.movie.update({
          where: { id: existingSeries.id },
          data: {
            title: data.title,
            originalTitle: data.originalTitle ?? existingSeries.originalTitle,
            synopsis: data.synopsis,
            posterUrl: data.posterUrl,
            backdropUrl: data.backdropUrl ?? existingSeries.backdropUrl,
            releaseYear: data.releaseYear,
            rating: data.rating,
            qualityBadge: data.qualityBadge || existingSeries.qualityBadge,
            genres: data.genres || existingSeries.genres,
            mediaType: "SERIES",
            isAvailable: true,
          },
        });
      } else {
        // Verifica si existe una película con el mismo tmdbId para evitar violación de restricción única
        const conflictingMovie = await this.db.movie.findUnique({
          where: { tmdbId: data.tmdbId },
        });

        try {
          seriesRecord = await this.db.movie.create({
            data: {
              tmdbId: conflictingMovie ? null : data.tmdbId,
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
        } catch {
          const concurrentSeries = await this.db.movie.findFirst({
            where: { tmdbId: data.tmdbId, mediaType: "SERIES" },
          });
          if (!concurrentSeries) {
            throw new Error(
              `No se pudo crear ni recuperar la serie TMDB #${data.tmdbId}`
            );
          }
          seriesRecord = concurrentSeries;
        }
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

      for (const episodeData of seasonData.episodes) {
        await this.db.episode.upsert({
          where: {
            seasonId_episodeNumber: {
              seasonId: seasonRecord.id,
              episodeNumber: episodeData.episodeNumber,
            },
          },
          update: {
            title: episodeData.title,
            overview: episodeData.overview ?? null,
            duration: episodeData.duration ?? 45,
            ...(episodeData.videoUrl ? { videoUrl: episodeData.videoUrl } : {}),
            thumbnailUrl: episodeData.thumbnailUrl ?? null,
            introStart: episodeData.introStart ?? null,
            introEnd: episodeData.introEnd ?? null,
          },
          create: {
            seasonId: seasonRecord.id,
            episodeNumber: episodeData.episodeNumber,
            title: episodeData.title,
            overview: episodeData.overview ?? null,
            duration: episodeData.duration ?? 45,
            videoUrl: episodeData.videoUrl ?? "",
            thumbnailUrl: episodeData.thumbnailUrl ?? null,
            introStart: episodeData.introStart ?? null,
            introEnd: episodeData.introEnd ?? null,
          },
        });
      }
    }

    const fullSeasons = await this.findSeasonsBySeriesId(seriesRecord.id);

    return {
      series: mapPrismaMovieToDomain(seriesRecord),
      seasons: fullSeasons,
    };
  }

  /**
   * Reemplaza transaccionalmente los enlaces mirror de un episodio y devuelve las entidades
   * `EpisodeMirror` creadas con sus UUID reales en base de datos.
   *
   * @param episodeId UUID del episodio.
   * @param mirrors Lista de mirrors a persistir.
   * @returns Lista de entidades `EpisodeMirror` persistidas ordenadas por prioridad.
   */
  public async saveEpisodeMirrors(
    episodeId: string,
    mirrors: CreateMirrorInput[]
  ): Promise<EpisodeMirror[]> {
    if (!mirrors || mirrors.length === 0) return [];

    const mirrorCreateData = mirrors.map((mirror, index) => ({
      episodeId,
      serverName: mirror.serverName,
      language: mirror.language || "Latino",
      rawUrl: mirror.rawUrl,
      format: mirror.format,
      quality: mirror.quality || "1080p",
      priority: mirror.priority ?? index + 1,
      status: MirrorStatus.ACTIVE,
      consecutiveFailures: 0,
    }));

    await this.db.$transaction([
      this.db.episodeMirror.deleteMany({ where: { episodeId } }),
      this.db.episodeMirror.createMany({ data: mirrorCreateData }),
    ]);

    const savedRows = await this.db.episodeMirror.findMany({
      where: { episodeId },
      orderBy: { priority: "asc" },
    });

    return savedRows.map((row) => mapPrismaEpisodeMirrorToDomain(row));
  }

  /**
   * Lista todas las series disponibles en el catálogo local filtrando opcionalmente por búsqueda o género.
   *
   * @param searchQuery Texto opcional de búsqueda.
   * @param genre Género opcional.
   * @returns Lista de entidades `Movie` con `mediaType = "SERIES"`.
   */
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
                {
                  originalTitle: {
                    contains: searchQuery,
                    mode: "insensitive",
                  },
                },
                { synopsis: { contains: searchQuery, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(genre ? { genres: { has: genre } } : {}),
      },
      orderBy: [{ releaseYear: "desc" }, { createdAt: "desc" }],
    });

    return rows.map((row) => mapPrismaMovieToDomain(row));
  }
}
