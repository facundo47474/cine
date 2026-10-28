export interface TmdbMovieMetadata {
  tmdbId: number;
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
}

export interface ITmdbGateway {
  isConfigured(): boolean;
  fetchMovieMetadata(tmdbId: number): Promise<TmdbMovieMetadata>;
  getTrendingMovies(page?: number): Promise<TmdbPaginatedResult>;
  getNowPlayingMovies(page?: number): Promise<TmdbPaginatedResult>;
  getTopRatedMovies(page?: number): Promise<TmdbPaginatedResult>;
  discoverMovies(filters: TmdbDiscoverFilters): Promise<TmdbPaginatedResult>;
  searchMovies(query: string, page?: number): Promise<TmdbPaginatedResult>;
}
