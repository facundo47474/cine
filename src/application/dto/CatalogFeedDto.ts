export interface CatalogCardDto {
  id: string; // UUID de PostgreSQL o "tmdb-{tmdbId}"
  tmdbId: number | null;
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
}

export interface ExploreCatalogParams {
  query?: string;
  genreId?: number;
  providerId?: number;
  page?: number;
}

export interface ExploreCatalogResponseDto {
  tmdbConnected: boolean;
  page: number;
  totalPages: number;
  totalResults: number;
  items: CatalogCardDto[];
}
