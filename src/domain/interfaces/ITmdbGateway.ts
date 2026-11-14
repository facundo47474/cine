export interface TmdbMovieMetadata {
  tmdbId: number;
  imdbId?: string | null;
  title: string;
  originalTitle: string;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string | null;
  releaseYear: number;
  durationMins: number;
  rating: number;
  genres: string[];
}

export interface TmdbTvSeasonSummary {
  seasonNumber: number;
  title: string;
  overview: string | null;
  posterUrl: string | null;
  episodeCount: number;
  airDate: string | null;
}

export interface TmdbTvEpisode {
  episodeNumber: number;
  title: string;
  overview: string | null;
  duration: number; // en minutos
  thumbnailUrl: string | null;
  airDate: string | null;
}

export interface TmdbTvSeasonDetails {
  seasonNumber: number;
  title: string;
  overview: string | null;
  posterUrl: string | null;
  episodes: TmdbTvEpisode[];
}

export interface TmdbTvMetadata {
  tmdbId: number;
  title: string;
  originalTitle: string;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string | null;
  releaseYear: number;
  rating: number;
  genres: string[];
  totalSeasons: number;
  seasons: TmdbTvSeasonSummary[];
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profileUrl: string | null;
}

export interface TmdbCatalogItem {
  tmdbId: number;
  title: string;
  originalTitle: string;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string | null;
  releaseYear: number;
  rating: number;
  genres: string[];
  mediaType?: "movie" | "tv";
}

export interface TmdbPaginatedResult {
  page: number;
  totalPages: number;
  totalResults: number;
  items: TmdbCatalogItem[];
}

export interface TmdbDiscoverFilters {
  page?: number;
  genreId?: number;
  watchProviderId?: number; // 8: Netflix, 337: Disney+, 1899: Max, 119: Prime Video, 350: Apple TV+
  watchRegion?: string;     // Por defecto "AR"
  sortBy?: "popularity.desc" | "vote_average.desc" | "primary_release_date.desc";
  year?: number;
  mediaType?: "movie" | "tv";
}

/**
 * Contrato de puerta de enlace (Gateway) para consultar metadatos de películas y series en TMDB.
 */
export interface ITmdbGateway {
  isConfigured(): boolean;
  fetchMovieMetadata(tmdbId: number): Promise<TmdbMovieMetadata>;
  fetchMovieImdbId(tmdbId: number): Promise<string | null>;
  fetchTvMetadata(tmdbId: number): Promise<TmdbTvMetadata>;
  fetchTvImdbId(tmdbId: number): Promise<string | null>;
  fetchTvSeason(tmdbId: number, seasonNumber: number): Promise<TmdbTvSeasonDetails>;
  fetchTvCredits(tmdbId: number): Promise<TmdbCastMember[]>;
  getTrendingMovies(page?: number): Promise<TmdbPaginatedResult>;
  getTrendingTv(page?: number): Promise<TmdbPaginatedResult>;
  getNowPlayingMovies(page?: number): Promise<TmdbPaginatedResult>;
  getTopRatedMovies(page?: number): Promise<TmdbPaginatedResult>;
  discoverMovies(filters: TmdbDiscoverFilters): Promise<TmdbPaginatedResult>;
  discoverTv(filters: TmdbDiscoverFilters): Promise<TmdbPaginatedResult>;
  searchMovies(query: string, page?: number): Promise<TmdbPaginatedResult>;
  searchTv(query: string, page?: number): Promise<TmdbPaginatedResult>;
}
