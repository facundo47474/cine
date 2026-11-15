import {
  MediaType,
  Movie as PrismaMovie,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import {
  CreateMirrorInput,
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
   * Busca cualquier registro multimedia (película o serie) asociado a un `tmdbId`.
   * Permite detectar en el flujo de reproducción de películas si el ID pertenece en realidad a una Serie.
   *
   * @param tmdbId Identificador numérico de TMDB.
   * @returns Entidad `Movie` (de tipo `MOVIE` o `SERIES`) o `null` si no existe.
   */
  public async findAnyMediaByTmdbId(tmdbId: number): Promise<Movie | null> {
    const row = await this.db.movie.findUnique({
      where: { tmdbId },
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
   * Determina si un error de Prisma corresponde a una colisión transaccional o de unicidad
   * provocada por peticiones concurrentes (`P2002` o `P2034`).
   */
  private isPrismaConcurrencyError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    );
  }

  /**
   * Construye la carga de creación de mirrors ordenados y en estado inicial `ACTIVE`.
   */
  private buildMirrorCreatePayload(mirrors: CreateMirrorInput[]) {
    return mirrors.map((mirror, index) => ({
      serverName: mirror.serverName,
      language: mirror.language || "Latino",
      rawUrl: mirror.rawUrl,
      format: mirror.format,
      quality: mirror.quality || "1080p",
      priority: mirror.priority ?? index + 1,
      status: MirrorStatus.ACTIVE,
      consecutiveFailures: 0,
    }));
  }

  /**
   * Actualiza un registro existente de película reemplazando sus mirrors y rehabilitando
   * su disponibilidad cuando existen enlaces cargados.
   */
  private async updateExistingMovieRecord(
    existingRow: PrismaMovie,
    data: UpsertMovieInput,
    targetMediaType: MediaType,
    mirrorCreateData: ReturnType<PrismaMovieRepository["buildMirrorCreatePayload"]>
  ): Promise<Movie> {
    const updated = await this.db.movie.update({
      where: { id: existingRow.id },
      data: {
        title: data.title,
        originalTitle: data.originalTitle ?? existingRow.originalTitle,
        synopsis: data.synopsis,
        posterUrl: data.posterUrl,
        backdropUrl: data.backdropUrl ?? existingRow.backdropUrl,
        releaseYear: data.releaseYear,
        durationMins: data.durationMins,
        rating: data.rating,
        qualityBadge: data.qualityBadge || existingRow.qualityBadge,
        genres: data.genres || existingRow.genres,
        mediaType: targetMediaType,
        isAvailable: mirrorCreateData.length > 0,
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

  /**
   * Recupera el registro existente en base de datos tras una colisión concurrente de escritura.
   */
  private async recoverConcurrentMovieRecord(
    existingMovieId?: string,
    tmdbId?: number | null,
    targetMediaType: MediaType = MediaType.MOVIE
  ): Promise<Movie | null> {
    if (existingMovieId) {
      const byId = await this.db.movie.findUnique({
        where: { id: existingMovieId },
        include: { mirrors: { orderBy: { priority: "asc" } } },
      });
      if (byId) return mapPrismaMovieToDomain(byId);
    }

    if (tmdbId) {
      const byTmdb = await this.db.movie.findUnique({
        where: { tmdbId },
        include: { mirrors: { orderBy: { priority: "asc" } } },
      });
      if (byTmdb && byTmdb.mediaType === targetMediaType) {
        return mapPrismaMovieToDomain(byTmdb);
      }
    }

    return null;
  }

  /**
   * Crea o actualiza una película en el catálogo junto con su lista completa de enlaces mirror.
   * Garantiza idempotencia por `existingMovieId` o `tmdbId` y recuperación ante condiciones de carrera (`P2002`/`P2034`).
   * Si el `tmdbId` ya está ocupado por un registro de tipo `SERIES`, crea la película con su propio UUID
   * sin sobrescribir la serie existente.
   *
   * @param data Datos de la película y sus mirrors (`UpsertMovieInput`).
   * @returns Entidad `Movie` persistida con sus nuevos mirrors.
   */
  public async upsertMovieWithMirrors(data: UpsertMovieInput): Promise<Movie> {
    const mirrorCreateData = this.buildMirrorCreatePayload(data.mirrors);
    const targetMediaType: MediaType =
      data.mediaType === "SERIES" ? MediaType.SERIES : MediaType.MOVIE;

    try {
      if (data.existingMovieId) {
        const existingById = await this.db.movie.findUnique({
          where: { id: data.existingMovieId },
        });
        if (existingById && existingById.mediaType === targetMediaType) {
          return await this.updateExistingMovieRecord(
            existingById,
            data,
            targetMediaType,
            mirrorCreateData
          );
        }
      }

      let safeTmdbId: number | null = data.tmdbId ?? null;

      if (safeTmdbId) {
        const existingByTmdb = await this.db.movie.findUnique({
          where: { tmdbId: safeTmdbId },
        });

        if (existingByTmdb) {
          if (existingByTmdb.mediaType === targetMediaType) {
            return await this.updateExistingMovieRecord(
              existingByTmdb,
              data,
              targetMediaType,
              mirrorCreateData
            );
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
          isAvailable: mirrorCreateData.length > 0,
          mirrors: {
            create: mirrorCreateData,
          },
        },
        include: {
          mirrors: { orderBy: { priority: "asc" } },
        },
      });

      return mapPrismaMovieToDomain(created);
    } catch (error) {
      if (this.isPrismaConcurrencyError(error)) {
        const recovered = await this.recoverConcurrentMovieRecord(
          data.existingMovieId,
          data.tmdbId,
          targetMediaType
        );
        if (recovered) {
          return recovered;
        }
      }
      throw error;
    }
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
