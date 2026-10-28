import { IMovieRepository, CreateMirrorInput } from "@/domain/interfaces/IMovieRepository";
import { ITmdbGateway } from "@/domain/interfaces/ITmdbGateway";
import { MovieProps } from "@/domain/entities/Movie";

export interface ImportFromTmdbInput {
  tmdbId: number;
  qualityBadge?: string;
  mirrors: CreateMirrorInput[];
}

/**
 * Servicio de Ingesta Automática desde TMDB.
 * Descarga metadatos oficiales en español (con fallback a inglés) y vincula los mirrors.
 */
export class TmdbImportService {
  constructor(
    private readonly tmdbGateway: ITmdbGateway,
    private readonly movieRepository: IMovieRepository
  ) {}

  public async importMovieByTmdbId(input: ImportFromTmdbInput): Promise<MovieProps> {
    if (!input.mirrors || input.mirrors.length === 0) {
      throw new Error("Se requiere al menos un enlace mirror para importar la película.");
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
