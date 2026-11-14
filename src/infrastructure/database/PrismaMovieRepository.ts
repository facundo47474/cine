import { MediaType, PrismaClient } from "@prisma/client";
import {
  IMovieRepository,
  UpsertMovieInput,
} from "@/domain/interfaces/IMovieRepository";
import { Movie } from "@/domain/entities/Movie";
import { MirrorStatus } from "@/domain/enums/MirrorStatus";
import { mapPrismaMovieToDomain } from "./mappers/PrismaDomainMappers";

/**
 * Repositorio concreto de Películas (`Movie`) sobre PostgreSQL utilizando Prisma ORM.
 */
export class PrismaMovieRepository implements IMovieRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Busca todos los títulos disponibles en el catálogo local, permitiendo filtrar opcionalmente
   * por texto libre (título, título original o sinopsis) y por género.
   *
   * @param searchQuery Texto opcional de búsqueda insensible a mayúsculas.
   * @param genre Nombre del género opcional a filtrar.
   * @returns Lista de entidades `Movie` con sus `mirrors` ordenados por prioridad.
   */
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
      include: {
        mirrors: {
          orderBy: { priority: "asc" },
        },
      },
      orderBy: [{ releaseYear: "desc" }, { createdAt: "desc" }],
    });

    return rows.map((row) => mapPrismaMovieToDomain(row));
  }

  /**
   * Obtiene una película por su UUID local incluyendo todos sus mirrors ordenados por prioridad.
   *
   * @param id UUID de la película.
   * @returns Entidad `Movie` o `null` si no existe.
   */
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
    return mapPrismaMovieToDomain(row);
  }

  /**
   * Busca una película por su identificador numérico de TMDB (`tmdbId`).
   * Verifica que el registro corresponda a `mediaType === "MOVIE"` para evitar colisiones
   * en caso de que una serie y una película compartan el mismo número de ID en TMDB.
   *
   * @param tmdbId Identificador numérico de TMDB.
   * @returns Entidad `Movie` o `null` si no está registrada como película.
   */
  public async findByTmdbId(tmdbId: number): Promise<Movie | null> {
    const row = await this.db.movie.findFirst({
      where: {
        tmdbId,
        mediaType: MediaType.MOVIE,
      },
      include: {
        mirrors: {
          orderBy: { priority: "asc" },
        },
      },
    });

    if (!row) return null;
    return mapPrismaMovieToDomain(row);
  }

  /**
   * Crea o actualiza una película en el catálogo junto con su lista completa de enlaces mirror.
   * Si el `tmdbId` ya está ocupado por un registro de tipo `SERIES`, crea la película con su propio UUID
   * sin sobrescribir la serie existente.
   *
   * @param data Datos de la película y sus mirrors (`UpsertMovieInput`).
   * @returns Entidad `Movie` persistida con sus nuevos mirrors.
   */
  public async upsertMovieWithMirrors(data: UpsertMovieInput): Promise<Movie> {
    const mirrorCreateData = data.mirrors.map((mirror, index) => ({
      serverName: mirror.serverName,
      language: mirror.language || "Latino",
      rawUrl: mirror.rawUrl,
      format: mirror.format,
      quality: mirror.quality || "1080p",
      priority: mirror.priority ?? index + 1,
      status: MirrorStatus.ACTIVE,
      consecutiveFailures: 0,
    }));

    const targetMediaType: MediaType =
      data.mediaType === "SERIES" ? MediaType.SERIES : MediaType.MOVIE;

    let safeTmdbId: number | null = data.tmdbId ?? null;

    if (safeTmdbId) {
      const existingByTmdb = await this.db.movie.findUnique({
        where: { tmdbId: safeTmdbId },
      });

      if (existingByTmdb) {
        if (existingByTmdb.mediaType === targetMediaType) {
          const updated = await this.db.movie.update({
            where: { id: existingByTmdb.id },
            data: {
              title: data.title,
              originalTitle: data.originalTitle ?? existingByTmdb.originalTitle,
              synopsis: data.synopsis,
              posterUrl: data.posterUrl,
              backdropUrl: data.backdropUrl ?? existingByTmdb.backdropUrl,
              releaseYear: data.releaseYear,
              durationMins: data.durationMins,
              rating: data.rating,
              qualityBadge: data.qualityBadge || existingByTmdb.qualityBadge,
              genres: data.genres || existingByTmdb.genres,
              mediaType: targetMediaType,
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
          return mapPrismaMovieToDomain(updated);
        }

        // Evita sobrescribir una Serie que comparta el mismo número de ID en TMDB
        safeTmdbId = null;
      }
    }

    const created = await this.db.movie.create({
      data: {
        tmdbId: safeTmdbId,
        mediaType: targetMediaType,
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

    return mapPrismaMovieToDomain(created);
  }

  /**
   * Actualiza el indicador lógico de disponibilidad (`isAvailable`) de una película.
   *
   * @param movieId UUID de la película.
   * @param isAvailable Nuevo estado de disponibilidad.
   */
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
