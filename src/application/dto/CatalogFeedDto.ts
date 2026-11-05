export interface CatalogCardDto {
  id: string; // UUID de PostgreSQL o "tmdb-{tmdbId}" o "series-{id}"
  tmdbId: number | null;
  mediaType?: "MOVIE" | "SERIES";
  title: string;
  originalTitle: string | null;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string | null;
  releaseYear: number;
  durationMins: number;
  rating: number;
  qualityBadge: string;
  genres: string[];
  isLocalVip: boolean;
}

export interface HomeFeedDto {
  tmdbConnected: boolean;
  featured: CatalogCardDto | null;
  localVip: CatalogCardDto[];
  trending: CatalogCardDto[];
  nowPlaying: CatalogCardDto[];
  topRated: CatalogCardDto[];
  netflix: CatalogCardDto[];
  disney: CatalogCardDto[];
  max: CatalogCardDto[];
  prime: CatalogCardDto[];
  series?: CatalogCardDto[];
}

export interface ExploreCatalogParams {
  query?: string;
  genreId?: number;
  providerId?: number;
  page?: number;
  mediaType?: "movie" | "tv";
}

export interface ExploreCatalogResponseDto {
  tmdbConnected: boolean;
  page: number;
  totalPages: number;
  totalResults: number;
  items: CatalogCardDto[];
}
