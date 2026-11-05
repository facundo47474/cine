import { Movie } from "../entities/Movie";
import { Season } from "../entities/Season";
import { Episode } from "../entities/Episode";
import { CreateMirrorInput } from "./IMovieRepository";

export interface UpsertEpisodeInput {
  episodeNumber: number;
  title: string;
  overview?: string | null;
  duration?: number;
  videoUrl?: string;
  thumbnailUrl?: string | null;
  introStart?: number | null;
  introEnd?: number | null;
}

export interface UpsertSeasonInput {
  seasonNumber: number;
  title: string;
  overview?: string | null;
  posterUrl?: string | null;
  releaseDate?: Date | null;
  episodes: UpsertEpisodeInput[];
}

export interface UpsertSeriesInput {
  tmdbId?: number | null;
  title: string;
  originalTitle?: string | null;
  synopsis: string;
  posterUrl: string;
  backdropUrl?: string | null;
  releaseYear: number;
  rating: number;
  qualityBadge?: string;
  genres?: string[];
  seasons: UpsertSeasonInput[];
}

export interface EpisodeHierarchy {
  episode: Episode;
  season: Season;
  series: Movie;
  allSeasons: Season[];
}

export interface ISeriesRepository {
  findSeriesById(id: string): Promise<Movie | null>;
  findSeriesByTmdbId(tmdbId: number): Promise<Movie | null>;
  findSeasonsBySeriesId(seriesId: string): Promise<Season[]>;
  findEpisodesBySeasonId(seasonId: string): Promise<Episode[]>;
  findEpisodeById(episodeId: string): Promise<Episode | null>;
  findEpisodeHierarchy(episodeId: string): Promise<EpisodeHierarchy | null>;
  findSeriesDetails(idOrTmdbId: string): Promise<{ series: Movie; seasons: Season[] } | null>;
  upsertSeries(data: UpsertSeriesInput): Promise<{ series: Movie; seasons: Season[] }>;
  saveEpisodeMirrors(episodeId: string, mirrors: CreateMirrorInput[]): Promise<void>;
  findAvailableSeries(searchQuery?: string, genre?: string): Promise<Movie[]>;
}
