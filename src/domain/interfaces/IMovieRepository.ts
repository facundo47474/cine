import { Movie } from "../entities/Movie";
import { MirrorFormat } from "../enums/MirrorFormat";

export interface CreateMirrorInput {
  serverName: string;
  language?: string;
  rawUrl: string;
  format: MirrorFormat;
  quality?: string;
  priority: number;
}

export interface UpsertMovieInput {
  tmdbId?: number | null;
  title: string;
  originalTitle?: string | null;
  synopsis: string;
  posterUrl: string;
  backdropUrl?: string | null;
  releaseYear: number;
  durationMins: number;
  rating: number;
  qualityBadge?: string;
  genres?: string[];
  mirrors: CreateMirrorInput[];
}

export interface IMovieRepository {
  findAvailableCatalog(searchQuery?: string, genre?: string): Promise<Movie[]>;
  findByIdWithMirrors(id: string): Promise<Movie | null>;
  findByTmdbId(tmdbId: number): Promise<Movie | null>;
  upsertMovieWithMirrors(data: UpsertMovieInput): Promise<Movie>;
  updateAvailability(movieId: string, isAvailable: boolean): Promise<void>;
}
