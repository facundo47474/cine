import {
  ITmdbGateway,
  TmdbCatalogItem,
  TmdbDiscoverFilters,
  TmdbMovieMetadata,
  TmdbPaginatedResult,
  TmdbTvMetadata,
  TmdbTvSeasonDetails,
  TmdbCastMember,
} from "@/domain/interfaces/ITmdbGateway";
import { ICacheService } from "@/domain/interfaces/ICacheService";

interface TmdbRawMovieResponse {
  id: number;
  imdb_id?: string | null;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime?: number | null;
  vote_average: number;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
}

interface TmdbRawListResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbRawMovieResponse[];
}

interface BuiltinShowcaseMovie extends TmdbMovieMetadata {
  genreIds: number[];
  providerIds: number[]; // 8: Netflix, 337: Disney+, 1899: Max, 119: Prime Video, 350: Apple TV+
}

const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Acción",
  12: "Aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familia",
  14: "Fantasía",
  36: "Historia",
  27: "Terror",
  10402: "Música",
  9648: "Misterio",
  10749: "Romance",
  878: "Ciencia Ficción",
  10770: "Película de TV",
  53: "Thriller",
  10752: "Bélica",
  37: "Western",
  // Géneros de TV
  10759: "Acción y Aventura",
  10762: "Kids",
  10763: "Noticias",
  10764: "Reality",
  10765: "Sci-Fi y Fantasía",
  10766: "Telenovela",
  10767: "Talk Show",
  10768: "Bélica y Política",
};

const MOVIE_TO_TV_GENRE_MAP: Record<number, number> = {
  28: 10759, // Acción -> Acción y Aventura (TV)
  12: 10759, // Aventura -> Acción y Aventura (TV)
  878: 10765, // Ciencia Ficción -> Sci-Fi y Fantasía (TV)
  14: 10765, // Fantasía -> Sci-Fi y Fantasía (TV)
  27: 9648, // Terror -> Misterio / Suspense (TV)
  53: 80, // Thriller -> Crimen (TV)
  10752: 10768, // Bélica -> Bélica y Política (TV)
};

const BUILTIN_SHOWCASE_TV: TmdbTvMetadata[] = [
  {
    tmdbId: 1399,
    title: "Juego de Tronos",
    originalTitle: "Game of Thrones",
    synopsis:
      "Siete familias nobles luchan por el control de la mítica tierra de Poniente en una encarnizada batalla por el Trono de Hierro.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg",
    releaseYear: 2011,
    rating: 8.4,
    genres: ["Sci-Fi y Fantasía", "Drama", "Acción y Aventura"],
    totalSeasons: 8,
    seasons: [
      {
        seasonNumber: 1,
        title: "Temporada 1",
        overview: "Primera temporada de Juego de Tronos.",
        posterUrl:
          "https://image.tmdb.org/t/p/w500/wgf2PmrCOQI6a91bt326300xPZ5.jpg",
        episodeCount: 10,
        airDate: "2011-04-17",
      },
      {
        seasonNumber: 2,
        title: "Temporada 2",
        overview: "Segunda temporada de Juego de Tronos.",
        posterUrl: null,
        episodeCount: 10,
        airDate: "2012-04-01",
      },
    ],
  },
  {
    tmdbId: 1396,
    title: "Breaking Bad",
    originalTitle: "Breaking Bad",
    synopsis:
      "Un profesor de química de secundaria diagnosticado con cáncer pulmonar terminal se asocia con un antiguo alumno para fabricar metanfetaminas.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/9faGSFi5jam6pDWGNd0p8J2vPt5.jpg",
    releaseYear: 2008,
    rating: 8.9,
    genres: ["Drama", "Crimen"],
    totalSeasons: 5,
    seasons: [
      {
        seasonNumber: 1,
        title: "Temporada 1",
        overview: "Primera temporada de Breaking Bad.",
        posterUrl:
          "https://image.tmdb.org/t/p/w500/1BP4xYv9ZG4ZVHkL7ocOEZv91ek.jpg",
        episodeCount: 7,
        airDate: "2008-01-20",
      },
    ],
  },
  {
    tmdbId: 66732,
    title: "Stranger Things",
    originalTitle: "Stranger Things",
    synopsis:
      "A raíz de la desaparición de un niño, un pueblo desvela un misterio que involucra experimentos secretos y una niña extraña.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
    releaseYear: 2016,
    rating: 8.6,
    genres: ["Sci-Fi y Fantasía", "Drama", "Misterio"],
    totalSeasons: 4,
    seasons: [
      {
        seasonNumber: 1,
        title: "Temporada 1",
        overview: "Primera temporada de Stranger Things.",
        posterUrl:
          "https://image.tmdb.org/t/p/w500/rbBUbiyqE6Z6pZmsb9aGtrOqgW8.jpg",
        episodeCount: 8,
        airDate: "2016-07-15",
      },
    ],
  },
];

const BUILTIN_SHOWCASE_CATALOG: BuiltinShowcaseMovie[] = [
  {
    tmdbId: 693134,
    imdbId: "tt15239678",
    title: "Dune: Parte Dos",
    originalTitle: "Dune: Part Two",
    synopsis:
      "Paul Atreides se une a Chani y los Fremen mientras busca venganza contra los conspiradores que destruyeron a su familia.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s520QIq.jpg",
    releaseYear: 2024,
    durationMins: 166,
    rating: 8.2,
    genres: ["Ciencia Ficción", "Aventura"],
    genreIds: [878, 12],
    providerIds: [1899],
  },
  {
    tmdbId: 533535,
    imdbId: "tt6263850",
    title: "Deadpool & Wolverine",
    originalTitle: "Deadpool & Wolverine",
    synopsis:
      "Un apático Wade Wilson se afana en la vida civil mientras sus días como Deadpool quedan atrás.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/yDHYTfA3R0jFYba16jBB1jv8uaC.jpg",
    releaseYear: 2024,
    durationMins: 128,
    rating: 7.7,
    genres: ["Acción", "Comedia", "Ciencia Ficción"],
    genreIds: [28, 35, 878],
    providerIds: [337],
  },
  {
    tmdbId: 157336,
    imdbId: "tt0816692",
    title: "Interstellar",
    originalTitle: "Interstellar",
    synopsis:
      "Un grupo de científicos y exploradores viaja a través de un agujero de gusano en el espacio para asegurar la supervivencia de la humanidad.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
    releaseYear: 2014,
    durationMins: 169,
    rating: 8.4,
    genres: ["Ciencia Ficción", "Drama", "Aventura"],
    genreIds: [878, 18, 12],
    providerIds: [1899, 119],
  },
  {
    tmdbId: 872585,
    imdbId: "tt15398776",
    title: "Oppenheimer",
    originalTitle: "Oppenheimer",
    synopsis:
      "La historia del científico estadounidense J. Robert Oppenheimer y su papel en el desarrollo de la bomba atómica durante la Segunda Guerra Mundial.",
    posterUrl:
      "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/nb3xI8XI3w4pMVZ38VijbsyBqP4.jpg",
    releaseYear: 2023,
    durationMins: 180,
    rating: 8.1,
    genres: ["Drama", "Historia"],
    genreIds: [18, 36],
    providerIds: [119],
  },
];

/**
 * Puerta de enlace HTTP hacia la API v3 de The Movie Database (`TmdbApiGateway`).
 *
 * Incluye:
 * - Caché en memoria de alta velocidad (`ICacheService`) con TTL de 1 hora.
 * - Fallback lingüístico `es-MX -> es-ES -> en-US` para sinopsis y títulos.
 * - Normalización automática de nombres genéricos en inglés (`"Season X"` -> `"Temporada X"`).
 * - Catálogo de demostración integrado cuando no se han configurado credenciales de TMDB.
 */
export class TmdbApiGateway implements ITmdbGateway {
  private readonly baseUrl = "https://api.themoviedb.org/3";
  private readonly imageBaseUrl = "https://image.tmdb.org/t/p";
  private readonly cacheTtlSeconds = 3600;

  constructor(private readonly cacheService: ICacheService) {}

  /**
   * Indica si existen credenciales de API (`TMDB_API_KEY` o `TMDB_BEARER_TOKEN`) en el entorno.
   */
  public isConfigured(): boolean {
    const apiKey = process.env.TMDB_API_KEY?.trim();
    const bearer = process.env.TMDB_BEARER_TOKEN?.trim();
    return Boolean(apiKey || bearer);
  }

  /**
   * Construye la URL completa y las cabeceras HTTP de autenticación para una petición a TMDB.
   *
   * @param endpointPath Ruta relativa del endpoint (ej. `"/movie/550"`).
   * @param params Parámetros de query string opcionales.
   * @returns Objeto `{ url, headers }`.
   */
  private buildHeadersAndUrl(
    endpointPath: string,
    params: Record<string, string | number | undefined>
  ): { url: string; headers: Record<string, string> } {
    const apiKey = process.env.TMDB_API_KEY?.trim();
    const bearerToken = process.env.TMDB_BEARER_TOKEN?.trim();

    const url = new URL(`${this.baseUrl}${endpointPath}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    if (apiKey && !bearerToken) {
      url.searchParams.set("api_key", apiKey);
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (bearerToken) {
      headers["Authorization"] = `Bearer ${bearerToken}`;
    }

    return { url: url.toString(), headers };
  }

  /**
   * Transforma un registro crudo de película de TMDB en un `TmdbCatalogItem`.
   */
  private mapRawMovieToCatalogItem(raw: TmdbRawMovieResponse): TmdbCatalogItem {
    const releaseYear = raw.release_date
      ? Number(raw.release_date.split("-")[0]) || new Date().getFullYear()
      : new Date().getFullYear();

    const genres =
      raw.genres?.map((genre) => genre.name) ||
      raw.genre_ids?.map((id) => TMDB_GENRE_MAP[id]).filter(Boolean) || [
        "Cine",
      ];

    return {
      tmdbId: raw.id,
      title: raw.title || raw.original_title || "Sin título",
      originalTitle: raw.original_title || raw.title || "Sin título",
      synopsis:
        raw.overview?.trim() ||
        "Explora esta película disponible en nuestro catálogo de streaming.",
      posterUrl: raw.poster_path
        ? `${this.imageBaseUrl}/w500${raw.poster_path}`
        : "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80",
      backdropUrl: raw.backdrop_path
        ? `${this.imageBaseUrl}/w1280${raw.backdrop_path}`
        : null,
      releaseYear,
      rating: Number((raw.vote_average || 7.2).toFixed(1)),
      genres,
      mediaType: "movie",
    };
  }

  /**
   * Transforma un registro crudo de serie de TV de TMDB en un `TmdbCatalogItem`.
   */
  private mapRawTvToCatalogItem(
    raw: Record<string, unknown>
  ): TmdbCatalogItem {
    const firstAirDate =
      typeof raw.first_air_date === "string" ? raw.first_air_date : "";
    const releaseYear = firstAirDate
      ? Number(firstAirDate.split("-")[0]) || new Date().getFullYear()
      : new Date().getFullYear();

    const rawGenres = Array.isArray(raw.genres)
      ? (raw.genres as Array<{ name?: string }>)
          .map((g) => g.name)
          .filter((n): n is string => Boolean(n))
      : undefined;
    const rawGenreIds = Array.isArray(raw.genre_ids)
      ? (raw.genre_ids as number[])
          .map((id) => TMDB_GENRE_MAP[id])
          .filter(Boolean)
      : undefined;

    const genres = rawGenres || rawGenreIds || ["Serie"];
    const name = typeof raw.name === "string" ? raw.name : "";
    const originalName =
      typeof raw.original_name === "string" ? raw.original_name : "";
    const overview = typeof raw.overview === "string" ? raw.overview : "";
    const posterPath =
      typeof raw.poster_path === "string" ? raw.poster_path : null;
    const backdropPath =
      typeof raw.backdrop_path === "string" ? raw.backdrop_path : null;
    const voteAverage =
      typeof raw.vote_average === "number" ? raw.vote_average : 7.5;

    return {
      tmdbId: Number(raw.id),
      title: name || originalName || "Sin título",
      originalTitle: originalName || name || "Sin título",
      synopsis:
        overview.trim() ||
        "Explora esta serie de televisión disponible en nuestro catálogo.",
      posterUrl: posterPath
        ? `${this.imageBaseUrl}/w500${posterPath}`
        : "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=600&auto=format&fit=crop&q=80",
      backdropUrl: backdropPath
        ? `${this.imageBaseUrl}/w1280${backdropPath}`
        : null,
      releaseYear,
      rating: Number((voteAverage || 7.5).toFixed(1)),
      genres,
      mediaType: "tv",
    };
  }

  /**
   * Consulta un listado paginado de películas en TMDB aplicando caché en memoria.
   */
  private async fetchPaginatedMovieList(
    cacheKey: string,
    endpointPath: string,
    params: Record<string, string | number | undefined>
  ): Promise<TmdbPaginatedResult> {
    const cached = this.cacheService.get<TmdbPaginatedResult>(cacheKey);
    if (cached) return cached;

    if (!this.isConfigured()) {
      return this.filterShowcaseCatalog(params);
    }

    const { url, headers } = this.buildHeadersAndUrl(endpointPath, {
      ...params,
      language: "es-MX",
    });

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        next: { revalidate: this.cacheTtlSeconds },
      });

      if (!response.ok) {
        return this.filterShowcaseCatalog(params);
      }

      const data = (await response.json()) as TmdbRawListResponse;
      const items = (data.results || [])
        .filter((item) => Boolean(item.title || item.original_title))
        .map((item) => this.mapRawMovieToCatalogItem(item));

      const result: TmdbPaginatedResult = {
        page: data.page || 1,
        totalPages: Math.min(data.total_pages || 1, 50),
        totalResults: data.total_results || items.length,
        items,
      };

      this.cacheService.set(cacheKey, result, this.cacheTtlSeconds);
      return result;
    } catch {
      return this.filterShowcaseCatalog(params);
    }
  }

  /**
   * Filtra el catálogo de demostración local cuando no hay clave de API de TMDB configurada.
   */
  private filterShowcaseCatalog(
    params: Record<string, string | number | undefined>
  ): TmdbPaginatedResult {
    let filtered = [...BUILTIN_SHOWCASE_CATALOG];

    if (params.with_genres) {
      const targetGenre = Number(params.with_genres);
      filtered = filtered.filter((movie) =>
        movie.genreIds.includes(targetGenre)
      );
    }

    if (params.with_watch_providers) {
      const targetProvider = Number(params.with_watch_providers);
      filtered = filtered.filter((movie) =>
        movie.providerIds.includes(targetProvider)
      );
    }

    if (params.query) {
      const normalizedQuery = String(params.query).toLowerCase();
      filtered = filtered.filter(
        (movie) =>
          movie.title.toLowerCase().includes(normalizedQuery) ||
          movie.originalTitle.toLowerCase().includes(normalizedQuery) ||
          movie.synopsis.toLowerCase().includes(normalizedQuery)
      );
    }

    return {
      page: 1,
      totalPages: 1,
      totalResults: filtered.length,
      items: filtered.map((movie) => ({
        tmdbId: movie.tmdbId,
        title: movie.title,
        originalTitle: movie.originalTitle,
        synopsis: movie.synopsis,
        posterUrl: movie.posterUrl,
        backdropUrl: movie.backdropUrl,
        releaseYear: movie.releaseYear,
        rating: movie.rating,
        genres: movie.genres,
        mediaType: "movie",
      })),
    };
  }

  /**
   * Obtiene las películas en tendencia de la semana en TMDB.
   */
  public async getTrendingMovies(
    page: number = 1
  ): Promise<TmdbPaginatedResult> {
    const cacheKey = `tmdb:movies:trending:${page}`;
    return this.fetchPaginatedMovieList(cacheKey, "/trending/movie/week", {
      page,
    });
  }

  /**
   * Obtiene las películas actualmente en cartelera en TMDB.
   */
  public async getNowPlayingMovies(
    page: number = 1
  ): Promise<TmdbPaginatedResult> {
    const cacheKey = `tmdb:movies:now_playing:${page}`;
    return this.fetchPaginatedMovieList(cacheKey, "/movie/now_playing", {
      page,
    });
  }

  /**
   * Obtiene las películas mejor valoradas por la crítica en TMDB.
   */
  public async getTopRatedMovies(
    page: number = 1
  ): Promise<TmdbPaginatedResult> {
    const cacheKey = `tmdb:movies:top_rated:${page}`;
    return this.fetchPaginatedMovieList(cacheKey, "/movie/top_rated", { page });
  }

  /**
   * Descubre películas aplicando filtros de plataforma de streaming, género, región y año.
   */
  public async discoverMovies(
    filters: TmdbDiscoverFilters
  ): Promise<TmdbPaginatedResult> {
    const cacheKey = `tmdb:movies:discover:${JSON.stringify(filters)}`;
    return this.fetchPaginatedMovieList(cacheKey, "/discover/movie", {
      page: filters.page || 1,
      with_genres: filters.genreId,
      with_watch_providers: filters.watchProviderId,
      watch_region: filters.watchRegion || "AR",
      sort_by: filters.sortBy || "popularity.desc",
      primary_release_year: filters.year,
      include_adult: "false",
    });
  }

  /**
   * Busca películas por texto libre en TMDB.
   */
  public async searchMovies(
    query: string,
    page: number = 1
  ): Promise<TmdbPaginatedResult> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return { page: 1, totalPages: 1, totalResults: 0, items: [] };
    }
    const cacheKey = `tmdb:movies:search:${cleanQuery}:${page}`;
    return this.fetchPaginatedMovieList(cacheKey, "/search/movie", {
      query: cleanQuery,
      page,
      include_adult: "false",
    });
  }

  /**
   * Descarga los metadatos detallados de una película por su ID de TMDB (incluyendo su `imdbId`).
   */
  public async fetchMovieMetadata(tmdbId: number): Promise<TmdbMovieMetadata> {
    const cacheKey = `tmdb:movie:${tmdbId}`;
    const cached = this.cacheService.get<TmdbMovieMetadata>(cacheKey);
    if (cached) return cached;

    if (!this.isConfigured()) {
      const showcase = BUILTIN_SHOWCASE_CATALOG.find(
        (movie) => movie.tmdbId === tmdbId
      );
      if (showcase) {
        return showcase;
      }
      return {
        tmdbId,
        imdbId: null,
        title: `Película TMDB #${tmdbId}`,
        originalTitle: `Movie #${tmdbId}`,
        synopsis:
          "Película cargada mediante el Auto-Resolver de catálogo masivo.",
        posterUrl:
          "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80",
        backdropUrl:
          "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop&q=80",
        releaseYear: 2025,
        durationMins: 120,
        rating: 7.8,
        genres: ["Cine", "Acción"],
      };
    }

    const { url: urlEs, headers } = this.buildHeadersAndUrl(
      `/movie/${tmdbId}`,
      { language: "es-MX" }
    );
    const resEs = await fetch(urlEs, {
      method: "GET",
      headers,
      next: { revalidate: this.cacheTtlSeconds },
    });

    if (!resEs.ok) {
      throw new Error(
        `Error consultando TMDB (ID: ${tmdbId}): HTTP ${resEs.status}`
      );
    }

    const dataEs = (await resEs.json()) as TmdbRawMovieResponse;
    let finalOverview = dataEs.overview?.trim() || "";
    let finalTitle = dataEs.title?.trim() || dataEs.original_title;

    if (!finalOverview) {
      try {
        const { url: urlEn } = this.buildHeadersAndUrl(`/movie/${tmdbId}`, {
          language: "en-US",
        });
        const resEn = await fetch(urlEn, {
          method: "GET",
          headers,
          next: { revalidate: this.cacheTtlSeconds },
        });
        if (resEn.ok) {
          const dataEn = (await resEn.json()) as TmdbRawMovieResponse;
          finalOverview =
            dataEn.overview?.trim() ||
            "Sin sinopsis disponible por el momento.";
          if (!finalTitle) finalTitle = dataEn.title;
        }
      } catch {
        finalOverview = "Sin sinopsis disponible por el momento.";
      }
    }

    const releaseYear = dataEs.release_date
      ? Number(dataEs.release_date.split("-")[0]) || new Date().getFullYear()
      : new Date().getFullYear();

    const imdbId =
      typeof dataEs.imdb_id === "string" &&
      dataEs.imdb_id.trim().startsWith("tt")
        ? dataEs.imdb_id.trim()
        : null;

    if (imdbId) {
      this.cacheService.set(
        `tmdb:movie:imdb:${tmdbId}`,
        imdbId,
        this.cacheTtlSeconds
      );
    }

    const metadata: TmdbMovieMetadata = {
      tmdbId: dataEs.id,
      imdbId,
      title: finalTitle,
      originalTitle: dataEs.original_title || finalTitle,
      synopsis: finalOverview || "Sin sinopsis disponible.",
      posterUrl: dataEs.poster_path
        ? `${this.imageBaseUrl}/w500${dataEs.poster_path}`
        : "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80",
      backdropUrl: dataEs.backdrop_path
        ? `${this.imageBaseUrl}/w1280${dataEs.backdrop_path}`
        : null,
      releaseYear,
      durationMins:
        dataEs.runtime && dataEs.runtime > 0 ? dataEs.runtime : 120,
      rating: Number((dataEs.vote_average || 7.2).toFixed(1)),
      genres: dataEs.genres?.map((genre) => genre.name) || ["Cine"],
    };

    this.cacheService.set(cacheKey, metadata, this.cacheTtlSeconds);
    return metadata;
  }

  /**
   * Obtiene el identificador IMDb (`tt...`) de una película por su ID de TMDB utilizando caché en memoria.
   *
   * @param tmdbId ID numérico de TMDB de la película.
   * @returns Identificador IMDb (`tt1234567`) o `null`.
   */
  public async fetchMovieImdbId(tmdbId: number): Promise<string | null> {
    const imdbCacheKey = `tmdb:movie:imdb:${tmdbId}`;
    const cachedImdbId = this.cacheService.get<string>(imdbCacheKey);
    if (cachedImdbId) return cachedImdbId;

    const cachedMovie = this.cacheService.get<TmdbMovieMetadata>(
      `tmdb:movie:${tmdbId}`
    );
    if (cachedMovie?.imdbId) return cachedMovie.imdbId;

    if (!this.isConfigured()) {
      const showcase = BUILTIN_SHOWCASE_CATALOG.find(
        (movie) => movie.tmdbId === tmdbId
      );
      return showcase?.imdbId || null;
    }

    try {
      const metadata = await this.fetchMovieMetadata(tmdbId);
      return metadata.imdbId || null;
    } catch {
      return null;
    }
  }

  /**
   * Obtiene el identificador IMDb (`tt...`) de una serie de TV consultando `/tv/{tmdbId}/external_ids`
   * con almacenamiento en caché LRU.
   *
   * @param tmdbId ID numérico de TMDB de la serie.
   * @returns Identificador IMDb (`tt1234567`) o `null`.
   */
  public async fetchTvImdbId(tmdbId: number): Promise<string | null> {
    const cacheKey = `tmdb:tv:imdb:${tmdbId}`;
    const cached = this.cacheService.get<string>(cacheKey);
    if (cached) return cached;

    const builtinMap: Record<number, string> = {
      1399: "tt0944947", // Game of Thrones
      1396: "tt0903747", // Breaking Bad
      66732: "tt4574334", // Stranger Things
    };

    if (!this.isConfigured()) {
      return builtinMap[tmdbId] || null;
    }

    try {
      const { url, headers } = this.buildHeadersAndUrl(
        `/tv/${tmdbId}/external_ids`,
        {}
      );
      const response = await fetch(url, {
        method: "GET",
        headers,
        next: { revalidate: this.cacheTtlSeconds },
      });
      if (!response.ok) return builtinMap[tmdbId] || null;

      const data = await response.json();
      const imdbId =
        typeof data.imdb_id === "string" && data.imdb_id.trim().startsWith("tt")
          ? data.imdb_id.trim()
          : null;

      if (imdbId) {
        this.cacheService.set(cacheKey, imdbId, this.cacheTtlSeconds);
      }
      return imdbId;
    } catch {
      return builtinMap[tmdbId] || null;
    }
  }

  /**
   * Obtiene el reparto principal (hasta 10 actores) de una serie de TV desde TMDB.
   */
  public async fetchTvCredits(tmdbId: number): Promise<TmdbCastMember[]> {
    const cacheKey = `tmdb:tv:${tmdbId}:credits`;
    const cached = this.cacheService.get<TmdbCastMember[]>(cacheKey);
    if (cached) return cached;

    if (!this.isConfigured()) {
      return [
        {
          id: 1,
          name: "Protagonista Principal",
          character: "Personaje Principal",
          profileUrl: null,
        },
        {
          id: 2,
          name: "Co-protagonista",
          character: "Personaje Secundario",
          profileUrl: null,
        },
      ];
    }

    try {
      const { url, headers } = this.buildHeadersAndUrl(
        `/tv/${tmdbId}/credits`,
        {
          language: "es-MX",
        }
      );
      const response = await fetch(url, {
        method: "GET",
        headers,
        next: { revalidate: this.cacheTtlSeconds },
      });
      if (!response.ok) return [];

      const data = await response.json();
      const cast: TmdbCastMember[] = (data.cast || [])
        .slice(0, 10)
        .map((member: Record<string, unknown>) => ({
          id: Number(member.id),
          name: String(member.name || ""),
          character: String(member.character || ""),
          profileUrl:
            typeof member.profile_path === "string"
              ? `${this.imageBaseUrl}/w185${member.profile_path}`
              : null,
        }));

      this.cacheService.set(cacheKey, cast, this.cacheTtlSeconds);
      return cast;
    } catch {
      return [];
    }
  }

  /**
   * Descarga los metadatos generales y el resumen de temporadas de una serie de TV desde TMDB,
   * con fallback `es-MX -> es-ES -> en-US` y normalización de nombres `"Season X"` a `"Temporada X"`.
   */
  public async fetchTvMetadata(tmdbId: number): Promise<TmdbTvMetadata> {
    const cacheKey = `tmdb:tv:${tmdbId}`;
    const cached = this.cacheService.get<TmdbTvMetadata>(cacheKey);
    if (cached) return cached;

    if (!this.isConfigured()) {
      const showcase = BUILTIN_SHOWCASE_TV.find(
        (series) => series.tmdbId === tmdbId
      );
      if (showcase) return showcase;
      return {
        tmdbId,
        title: `Serie TMDB #${tmdbId}`,
        originalTitle: `TV #${tmdbId}`,
        synopsis: "Serie cargada mediante el Auto-Resolver.",
        posterUrl:
          "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=600&auto=format&fit=crop&q=80",
        backdropUrl:
          "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=1400&auto=format&fit=crop&q=80",
        releaseYear: 2024,
        rating: 8.0,
        genres: ["Serie", "Drama"],
        totalSeasons: 1,
        seasons: [
          {
            seasonNumber: 1,
            title: "Temporada 1",
            overview: "Primera temporada",
            posterUrl: null,
            episodeCount: 8,
            airDate: "2024-01-01",
          },
        ],
      };
    }

    const { url: urlEs, headers } = this.buildHeadersAndUrl(`/tv/${tmdbId}`, {
      language: "es-MX",
    });
    const resEs = await fetch(urlEs, {
      method: "GET",
      headers,
      next: { revalidate: this.cacheTtlSeconds },
    });

    if (!resEs.ok) {
      throw new Error(
        `Error consultando TMDB TV (ID: ${tmdbId}): HTTP ${resEs.status}`
      );
    }

    const dataEs = await resEs.json();
    let finalOverview = dataEs.overview?.trim() || "";
    let finalTitle = dataEs.name?.trim() || dataEs.original_name;

    if (!finalOverview) {
      try {
        const { url: urlEsSpain } = this.buildHeadersAndUrl(`/tv/${tmdbId}`, {
          language: "es-ES",
        });
        const resEsSpain = await fetch(urlEsSpain, { method: "GET", headers });
        if (resEsSpain.ok) {
          const dataEsSpain = await resEsSpain.json();
          finalOverview = dataEsSpain.overview?.trim() || "";
          if (!finalTitle && dataEsSpain.name) finalTitle = dataEsSpain.name;
        }
      } catch {
        // Continúa al fallback en inglés si tampoco está disponible en es-ES
      }
    }

    if (!finalOverview) {
      try {
        const { url: urlEn } = this.buildHeadersAndUrl(`/tv/${tmdbId}`, {
          language: "en-US",
        });
        const resEn = await fetch(urlEn, { method: "GET", headers });
        if (resEn.ok) {
          const dataEn = await resEn.json();
          finalOverview = dataEn.overview?.trim() || "Sin sinopsis disponible.";
          if (!finalTitle) finalTitle = dataEn.name;
        }
      } catch {
        finalOverview = "Sin sinopsis disponible.";
      }
    }

    const releaseYear = dataEs.first_air_date
      ? Number(dataEs.first_air_date.split("-")[0]) || new Date().getFullYear()
      : new Date().getFullYear();

    const seasons = (dataEs.seasons || [])
      .filter(
        (season: Record<string, unknown>) => Number(season.season_number) > 0
      )
      .map((season: Record<string, unknown>) => {
        const seasonNumber = Number(season.season_number);
        const rawSeasonName = String(season.name || "").trim();
        const normalizedSeasonTitle =
          !rawSeasonName || /^season\s+\d+$/i.test(rawSeasonName)
            ? `Temporada ${seasonNumber}`
            : rawSeasonName;

        return {
          seasonNumber,
          title: normalizedSeasonTitle,
          overview:
            typeof season.overview === "string" && season.overview
              ? season.overview
              : null,
          posterUrl:
            typeof season.poster_path === "string"
              ? `${this.imageBaseUrl}/w500${season.poster_path}`
              : null,
          episodeCount: Number(season.episode_count || 0),
          airDate:
            typeof season.air_date === "string" ? season.air_date : null,
        };
      });

    const metadata: TmdbTvMetadata = {
      tmdbId: dataEs.id,
      title: finalTitle,
      originalTitle: dataEs.original_name || finalTitle,
      synopsis: finalOverview || "Sin sinopsis disponible.",
      posterUrl: dataEs.poster_path
        ? `${this.imageBaseUrl}/w500${dataEs.poster_path}`
        : "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=600&auto=format&fit=crop&q=80",
      backdropUrl: dataEs.backdrop_path
        ? `${this.imageBaseUrl}/w1280${dataEs.backdrop_path}`
        : null,
      releaseYear,
      rating: Number((dataEs.vote_average || 7.5).toFixed(1)),
      genres:
        dataEs.genres?.map((genre: { name: string }) => genre.name) || [
          "Serie",
        ],
      totalSeasons: seasons.length || dataEs.number_of_seasons || 1,
      seasons,
    };

    this.cacheService.set(cacheKey, metadata, this.cacheTtlSeconds);
    return metadata;
  }

  /**
   * Descarga el detalle de capítulos de una temporada específica de una serie en TMDB,
   * normalizando títulos genéricos `"Episode X"` a `"Episodio X"`.
   */
  public async fetchTvSeason(
    tmdbId: number,
    seasonNumber: number
  ): Promise<TmdbTvSeasonDetails> {
    const cacheKey = `tmdb:tv:${tmdbId}:s:${seasonNumber}`;
    const cached = this.cacheService.get<TmdbTvSeasonDetails>(cacheKey);
    if (cached) return cached;

    if (!this.isConfigured()) {
      const sampleEpisodes = Array.from({ length: 8 }).map((_, index) => ({
        episodeNumber: index + 1,
        title: `Episodio ${index + 1}`,
        overview: `Sinopsis del episodio ${index + 1}.`,
        duration: 45,
        thumbnailUrl: null,
        airDate: null,
      }));
      return {
        seasonNumber,
        title: `Temporada ${seasonNumber}`,
        overview: "Temporada de muestra",
        posterUrl: null,
        episodes: sampleEpisodes,
      };
    }

    const { url: urlEs, headers } = this.buildHeadersAndUrl(
      `/tv/${tmdbId}/season/${seasonNumber}`,
      { language: "es-MX" }
    );
    const resEs = await fetch(urlEs, {
      method: "GET",
      headers,
      next: { revalidate: this.cacheTtlSeconds },
    });

    if (!resEs.ok) {
      throw new Error(
        `Error consultando Temporada ${seasonNumber} de TV ${tmdbId}: HTTP ${resEs.status}`
      );
    }

    const dataEs = await resEs.json();
    const episodes = (dataEs.episodes || []).map(
      (episode: Record<string, unknown>) => {
        const episodeNumber = Number(episode.episode_number);
        const rawEpisodeName = String(episode.name || "").trim();
        const normalizedEpisodeTitle =
          !rawEpisodeName || /^episode\s+\d+$/i.test(rawEpisodeName)
            ? `Episodio ${episodeNumber}`
            : rawEpisodeName;

        return {
          episodeNumber,
          title: normalizedEpisodeTitle,
          overview:
            typeof episode.overview === "string" && episode.overview.trim()
              ? episode.overview.trim()
              : null,
          duration: Number(episode.runtime || 45),
          thumbnailUrl:
            typeof episode.still_path === "string"
              ? `${this.imageBaseUrl}/w500${episode.still_path}`
              : null,
          airDate:
            typeof episode.air_date === "string" ? episode.air_date : null,
        };
      }
    );

    const rawSeasonTitle = String(dataEs.name || "").trim();
    const normalizedSeasonTitle =
      !rawSeasonTitle || /^season\s+\d+$/i.test(rawSeasonTitle)
        ? `Temporada ${seasonNumber}`
        : rawSeasonTitle;

    const result: TmdbTvSeasonDetails = {
      seasonNumber: dataEs.season_number || seasonNumber,
      title: normalizedSeasonTitle,
      overview: dataEs.overview || null,
      posterUrl: dataEs.poster_path
        ? `${this.imageBaseUrl}/w500${dataEs.poster_path}`
        : null,
      episodes,
    };

    this.cacheService.set(cacheKey, result, this.cacheTtlSeconds);
    return result;
  }

  /**
   * Obtiene el listado paginado de series populares en TMDB.
   */
  public async getTrendingTv(page: number = 1): Promise<TmdbPaginatedResult> {
    const cacheKey = `tmdb:tv:popular:${page}`;
    return this.fetchPaginatedTvList(cacheKey, "/tv/popular", { page });
  }

  /**
   * Descubre series de TV aplicando filtros de plataforma, género (con mapeo automático de IDs de cine a TV) y región.
   */
  public async discoverTv(
    filters: TmdbDiscoverFilters
  ): Promise<TmdbPaginatedResult> {
    const mappedGenreId = filters.genreId
      ? MOVIE_TO_TV_GENRE_MAP[filters.genreId] ?? filters.genreId
      : undefined;

    const cacheKey = `tmdb:tv:discover:${JSON.stringify({
      ...filters,
      genreId: mappedGenreId,
    })}`;

    return this.fetchPaginatedTvList(cacheKey, "/discover/tv", {
      page: filters.page || 1,
      with_genres: mappedGenreId,
      with_watch_providers: filters.watchProviderId,
      watch_region: filters.watchRegion || "AR",
      sort_by:
        filters.sortBy === "primary_release_date.desc"
          ? "first_air_date.desc"
          : filters.sortBy || "popularity.desc",
      first_air_date_year: filters.year,
      include_adult: "false",
    });
  }

  /**
   * Busca series de TV por texto libre en TMDB.
   */
  public async searchTv(
    query: string,
    page: number = 1
  ): Promise<TmdbPaginatedResult> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return { page: 1, totalPages: 1, totalResults: 0, items: [] };
    }
    const cacheKey = `tmdb:tv:search:${cleanQuery}:${page}`;
    return this.fetchPaginatedTvList(cacheKey, "/search/tv", {
      query: cleanQuery,
      page,
      include_adult: "false",
    });
  }

  /**
   * Consulta un listado paginado de series de TV en TMDB con soporte de caché en memoria.
   */
  private async fetchPaginatedTvList(
    cacheKey: string,
    endpointPath: string,
    params: Record<string, string | number | undefined>
  ): Promise<TmdbPaginatedResult> {
    const cached = this.cacheService.get<TmdbPaginatedResult>(cacheKey);
    if (cached) return cached;

    if (!this.isConfigured()) {
      const items = BUILTIN_SHOWCASE_TV.map((series) => ({
        tmdbId: series.tmdbId,
        title: series.title,
        originalTitle: series.originalTitle,
        synopsis: series.synopsis,
        posterUrl: series.posterUrl,
        backdropUrl: series.backdropUrl,
        releaseYear: series.releaseYear,
        rating: series.rating,
        genres: series.genres,
        mediaType: "tv" as const,
      }));
      return {
        page: 1,
        totalPages: 1,
        totalResults: items.length,
        items,
      };
    }

    const { url, headers } = this.buildHeadersAndUrl(endpointPath, {
      ...params,
      language: "es-MX",
    });

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        next: { revalidate: this.cacheTtlSeconds },
      });
      if (!response.ok) {
        return { page: 1, totalPages: 1, totalResults: 0, items: [] };
      }
      const data = await response.json();
      const items = (data.results || []).map((rawItem: Record<string, unknown>) =>
        this.mapRawTvToCatalogItem(rawItem)
      );

      const result: TmdbPaginatedResult = {
        page: data.page || 1,
        totalPages: Math.min(data.total_pages || 1, 50),
        totalResults: data.total_results || items.length,
        items,
      };

      this.cacheService.set(cacheKey, result, this.cacheTtlSeconds);
      return result;
    } catch {
      return { page: 1, totalPages: 1, totalResults: 0, items: [] };
    }
  }
}
