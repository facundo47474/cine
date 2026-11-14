import {
  IMovieRepository,
  CreateMirrorInput,
} from "@/domain/interfaces/IMovieRepository";
import { ITmdbGateway } from "@/domain/interfaces/ITmdbGateway";
import { MovieProps } from "@/domain/entities/Movie";

export interface ImportFromTmdbInput {
  tmdbId: number;
  qualityBadge?: string;
  mirrors: CreateMirrorInput[];
}

/**
 * Servicio de Aplicación para la Ingesta Automática desde TMDB (`TmdbImportService`).
 * Descarga metadatos oficiales en español (con fallback a inglés) y vincula los mirrors provistos.
 */
export class TmdbImportService {
  constructor(
    private readonly tmdbGateway: ITmdbGateway,
    private readonly movieRepository: IMovieRepository
  ) {}

  /**
   * Importa o actualiza una película en el catálogo local a partir de su ID de TMDB
   * junto con sus enlaces mirror iniciales.
   *
   * @param input Parámetros de importación (`tmdbId`, `qualityBadge`, `mirrors`).
   * @returns Propiedades planas de la película persistida (`MovieProps`).
   */
  public async importMovieByTmdbId(
    input: ImportFromTmdbInput
  ): Promise<MovieProps> {
    if (!input.mirrors || input.mirrors.length === 0) {
      throw new Error(
        "Se requiere al menos un enlace mirror para importar la película."
      );
    }

    const metadata = await this.tmdbGateway.fetchMovieMetadata(input.tmdbId);

    const movie = await this.movieRepository.upsertMovieWithMirrors({
      tmdbId: metadata.tmdbId,
      title: metadata.title,
      originalTitle: metadata.originalTitle,
      synopsis: metadata.synopsis,
      posterUrl: metadata.posterUrl,
      backdropUrl: metadata.backdropUrl,
      releaseYear: metadata.releaseYear,
      durationMins: metadata.durationMins,
      rating: metadata.rating,
      qualityBadge: input.qualityBadge || "HD",
      genres: metadata.genres,
      mirrors: input.mirrors,
    });

    return movie.toObject();
  }
}
