import {
  ITmdbGateway,
  TmdbCatalogItem,
  TmdbDiscoverFilters,
  TmdbMovieMetadata,
  TmdbPaginatedResult,
} from "@/domain/interfaces/ITmdbGateway";
import { ICacheService } from "@/domain/interfaces/ICacheService";

interface TmdbRawMovieResponse {
  id: number;
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
};

/**
 * Catálogo curado de respaldo con IDs reales de TMDB para que los filtros por plataforma,
 * géneros, buscador y reproductor funcionen de inmediato incluso antes de configurar TMDB_API_KEY.
 */
const BUILTIN_SHOWCASE_CATALOG: BuiltinShowcaseMovie[] = [
  {
    tmdbId: 693134,
    title: "Dune: Parte Dos",
    originalTitle: "Dune: Part Two",
    synopsis:
      "Paul Atreides se une a Chani y a los Fremen mientras busca venganza contra los conspiradores que destruyeron a su familia en el desierto de Arrakis.",
    posterUrl:
      "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2024,
    durationMins: 166,
    rating: 8.5,
    genres: ["Ciencia Ficción", "Aventura", "Acción"],
    genreIds: [878, 12, 28],
    providerIds: [1899, 119],
  },
  {
    tmdbId: 533535,
    title: "Deadpool & Wolverine",
    originalTitle: "Deadpool & Wolverine",
    synopsis:
      "Un apático Wade Wilson se esfuerza por adaptarse a la vida civil hasta que una amenaza existencial para su universo lo obliga a reclutar a un reacio Wolverine.",
    posterUrl:
      "https://images.unsplash.com/photo-1635805737707-575885ab0820?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1635805737707-575885ab0820?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2024,
    durationMins: 128,
    rating: 7.9,
    genres: ["Acción", "Comedia", "Ciencia Ficción"],
    genreIds: [28, 35, 878],
    providerIds: [337],
  },
  {
    tmdbId: 157336,
    title: "Interestelar",
    originalTitle: "Interstellar",
    synopsis:
      "Un grupo de exploradores espaciales atraviesa un agujero de gusano cerca de Saturno en un intento desesperado por encontrar un nuevo planeta habitable para la humanidad.",
    posterUrl:
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2014,
    durationMins: 169,
    rating: 8.7,
    genres: ["Ciencia Ficción", "Drama", "Aventura"],
    genreIds: [878, 18, 12],
    providerIds: [1899, 8, 119],
  },
  {
    tmdbId: 872585,
    title: "Oppenheimer",
    originalTitle: "Oppenheimer",
    synopsis:
      "La historia del físico estadounidense J. Robert Oppenheimer y su papel clave al frente del Proyecto Manhattan en el desarrollo de la primera bomba atómica.",
    posterUrl:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2023,
    durationMins: 181,
    rating: 8.3,
    genres: ["Drama", "Historia", "Thriller"],
    genreIds: [18, 36, 53],
    providerIds: [119, 8],
  },
  {
    tmdbId: 414906,
    title: "The Batman",
    originalTitle: "The Batman",
    synopsis:
      "En su segundo año luchando contra el crimen, Batman investiga la corrupción que recorre Gotham City y cómo conduce hasta su propia familia mientras enfrenta al Acertijo.",
    posterUrl:
      "https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2022,
    durationMins: 176,
    rating: 8.0,
    genres: ["Crimen", "Misterio", "Thriller"],
    genreIds: [80, 9648, 53],
    providerIds: [1899],
  },
  {
    tmdbId: 569094,
    title: "Spider-Man: A Través del Spider-Verso",
    originalTitle: "Spider-Man: Across the Spider-Verse",
    synopsis:
      "Miles Morales es catapultado a través del Multiverso, donde se encuentra con la Sociedad Arácnida, un equipo de Spider-Personas encargadas de proteger su existencia.",
    posterUrl:
      "https://images.unsplash.com/photo-1604200213928-ba3cf4fc8436?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1604200213928-ba3cf4fc8436?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2023,
    durationMins: 140,
    rating: 8.6,
    genres: ["Animación", "Acción", "Aventura"],
    genreIds: [16, 28, 12],
    providerIds: [8, 1899],
  },
  {
    tmdbId: 945961,
    title: "Alien: Romulus",
    originalTitle: "Alien: Romulus",
    synopsis:
      "Mientras exploran las profundidades de una estación espacial abandonada, un grupo de jóvenes colonizadores espaciales se encuentra cara a cara con la forma de vida más letal del universo.",
    posterUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2024,
    durationMins: 119,
    rating: 7.5,
    genres: ["Terror", "Ciencia Ficción", "Thriller"],
    genreIds: [27, 878, 53],
    providerIds: [337],
  },
  {
    tmdbId: 1022789,
    title: "Intensa-Mente 2",
    originalTitle: "Inside Out 2",
    synopsis:
      "Dentro de la mente de una Riley recién entrada en la adolescencia, el Cuartel General sufre una repentina demolición para hacer espacio a nuevas emociones como Ansiedad.",
    posterUrl:
      "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2024,
    durationMins: 96,
    rating: 7.8,
    genres: ["Animación", "Familia", "Comedia"],
    genreIds: [16, 10751, 35],
    providerIds: [337],
  },
  {
    tmdbId: 558449,
    title: "Gladiador II",
    originalTitle: "Gladiator II",
    synopsis:
      "Años después de presenciar la muerte del venerado héroe Máximo a manos de su tío, Lucio se ve forzado a entrar en el Coliseo tras la caída de su hogar.",
    posterUrl:
      "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2024,
    durationMins: 148,
    rating: 7.6,
    genres: ["Acción", "Aventura", "Drama"],
    genreIds: [28, 12, 18],
    providerIds: [119, 350],
  },
  {
    tmdbId: 603692,
    title: "John Wick 4",
    originalTitle: "John Wick: Chapter 4",
    synopsis:
      "John Wick descubre un camino para derrotar a la Alta Mesa. Pero antes de poder ganar su libertad, deberá enfrentarse a un nuevo enemigo con poderosas alianzas en todo el mundo.",
    posterUrl:
      "https://images.unsplash.com/photo-1514539079130-25950c84af65?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1514539079130-25950c84af65?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2023,
    durationMins: 169,
    rating: 8.0,
    genres: ["Acción", "Thriller", "Crimen"],
    genreIds: [28, 53, 80],
    providerIds: [119, 8],
  },
  {
    tmdbId: 27205,
    title: "El Origen",
    originalTitle: "Inception",
    synopsis:
      "Dom Cobb es un ladrón especializado en infiltrarse en los sueños ajenos para extraer secretos del subconsciente. Ahora recibe la misión inversa: implantar una idea desde cero.",
    posterUrl:
      "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2010,
    durationMins: 148,
    rating: 8.4,
    genres: ["Acción", "Ciencia Ficción", "Aventura"],
    genreIds: [28, 878, 12],
    providerIds: [1899, 8],
  },
  {
    tmdbId: 335984,
    title: "Blade Runner 2049",
    originalTitle: "Blade Runner 2049",
    synopsis:
      "El hallazgo de un secreto largamente oculto lleva a un joven Blade Runner, el oficial K de la policía de Los Ángeles, a buscar al desaparecido Rick Deckard.",
    posterUrl:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
    backdropUrl:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1400&auto=format&fit=crop&q=80",
    releaseYear: 2017,
    durationMins: 164,
    rating: 8.0,
    genres: ["Ciencia Ficción", "Drama", "Misterio"],
    genreIds: [878, 18, 9648],
    providerIds: [8, 350],
  },
];

/**
 * Cliente HTTP de Alto Rendimiento para The Movie Database (TMDB).
 * - Incluye caché en memoria con TTL de 1 hora (ICacheService).
 * - Mapea genre_ids a español sin peticiones adicionales.
 * - Si TMDB_API_KEY aún no fue agregada en .env, entrega un catálogo curado funcional
 *   para que todas las filas, filtros de plataformas y buscador operen sin errores.
 */
export class TmdbApiGateway implements ITmdbGateway {
  private readonly baseUrl = "https://api.themoviedb.org/3";
  private readonly imageBaseUrl = "https://image.tmdb.org/t/p";
  private readonly cacheTtlSeconds = 3600;

  constructor(private readonly cacheService: ICacheService) {}

  public isConfigured(): boolean {
    const apiKey = process.env.TMDB_API_KEY?.trim();
    const bearer = process.env.TMDB_BEARER_TOKEN?.trim();
    return Boolean(apiKey || bearer);
  }

  private buildHeadersAndUrl(
    endpointPath: string,
    params: Record<string, string | number | undefined>
  ): { url: string; headers: Record<string, string> } {
    const apiKey = process.env.TMDB_API_KEY?.trim();
    const bearerToken = process.env.TMDB_BEARER_TOKEN?.trim();

    const url = new URL(`${this.baseUrl}${endpointPath}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") {
        url.searchParams.set(k, String(v));
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

  private mapRawItemToCatalogItem(raw: TmdbRawMovieResponse): TmdbCatalogItem {
    const releaseYear = raw.release_date
      ? Number(raw.release_date.split("-")[0]) || new Date().getFullYear()
      : new Date().getFullYear();

    const genres =
      raw.genres?.map((g) => g.name) ||
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
    };
  }

  private async fetchPaginatedList(
    cacheKey: string,
    endpointPath: string,
    params: Record<string, string | number | undefined>
  ): Promise<TmdbPaginatedResult> {
    const cached = this.cacheService.get<TmdbPaginatedResult>(cacheKey);
    if (cached) return cached;

    const { url, headers } = this.buildHeadersAndUrl(endpointPath, {
      language: "es-MX",
      include_adult: "false",
      ...params,
    });

    const res = await fetch(url, {
      method: "GET",
      headers,
      next: { revalidate: this.cacheTtlSeconds },
    });

    if (!res.ok) {
      throw new Error(`Error TMDB List (${endpointPath}): HTTP ${res.status}`);
    }

    const rawData = (await res.json()) as TmdbRawListResponse;
    const mapped: TmdbPaginatedResult = {
      page: rawData.page || 1,
      totalPages: Math.min(rawData.total_pages || 1, 500),
      totalResults: rawData.total_results || 0,
      items: (rawData.results || []).map((r) => this.mapRawItemToCatalogItem(r)),
    };

    this.cacheService.set(cacheKey, mapped, this.cacheTtlSeconds);
    return mapped;
  }

  private getFallbackList(
    predicate?: (m: BuiltinShowcaseMovie) => boolean
  ): TmdbPaginatedResult {
    const filtered = predicate
      ? BUILTIN_SHOWCASE_CATALOG.filter(predicate)
      : BUILTIN_SHOWCASE_CATALOG;

    return {
      page: 1,
      totalPages: 1,
      totalResults: filtered.length,
      items: filtered.map((m) => ({
        tmdbId: m.tmdbId,
        title: m.title,
        originalTitle: m.originalTitle,
        synopsis: m.synopsis,
        posterUrl: m.posterUrl,
        backdropUrl: m.backdropUrl,
        releaseYear: m.releaseYear,
        rating: m.rating,
        genres: m.genres,
      })),
    };
  }

  public async getTrendingMovies(page: number = 1): Promise<TmdbPaginatedResult> {
    if (!this.isConfigured()) {
      return this.getFallbackList();
    }
    return this.fetchPaginatedList(
      `tmdb:trending:${page}`,
      "/trending/movie/week",
      { page }
    );
  }

  public async getNowPlayingMovies(page: number = 1): Promise<TmdbPaginatedResult> {
    if (!this.isConfigured()) {
      return this.getFallbackList((m) => m.releaseYear >= 2023);
    }
    return this.fetchPaginatedList(
      `tmdb:now_playing:${page}`,
      "/movie/now_playing",
      { page, region: "AR" }
    );
  }

  public async getTopRatedMovies(page: number = 1): Promise<TmdbPaginatedResult> {
    if (!this.isConfigured()) {
      return this.getFallbackList((m) => m.rating >= 8.0);
    }
    return this.fetchPaginatedList(
      `tmdb:top_rated:${page}`,
      "/movie/top_rated",
      { page }
    );
  }

  public async discoverMovies(
    filters: TmdbDiscoverFilters
  ): Promise<TmdbPaginatedResult> {
    const page = filters.page || 1;

    if (!this.isConfigured()) {
      return this.getFallbackList((m) => {
        const matchProvider = filters.watchProviderId
          ? m.providerIds.includes(filters.watchProviderId)
          : true;
        const matchGenre = filters.genreId
          ? m.genreIds.includes(filters.genreId)
          : true;
        return matchProvider && matchGenre;
      });
    }

    const cacheKey = `tmdb:discover:p=${page}:g=${filters.genreId || ""}:prov=${
      filters.watchProviderId || ""
    }:sort=${filters.sortBy || "popularity.desc"}`;

    return this.fetchPaginatedList(cacheKey, "/discover/movie", {
      page,
      sort_by: filters.sortBy || "popularity.desc",
      with_genres: filters.genreId,
      with_watch_providers: filters.watchProviderId,
      watch_region: filters.watchProviderId
        ? filters.watchRegion || "AR"
        : undefined,
      primary_release_year: filters.year,
    });
  }

  public async searchMovies(
    query: string,
    page: number = 1
  ): Promise<TmdbPaginatedResult> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return this.getTrendingMovies(page);
    }

    if (!this.isConfigured()) {
      const qLower = cleanQuery.toLowerCase();
      return this.getFallbackList(
        (m) =>
          m.title.toLowerCase().includes(qLower) ||
          m.originalTitle.toLowerCase().includes(qLower) ||
          m.synopsis.toLowerCase().includes(qLower) ||
          m.genres.some((g) => g.toLowerCase().includes(qLower))
      );
    }

    const cacheKey = `tmdb:search:${cleanQuery.toLowerCase()}:${page}`;
    return this.fetchPaginatedList(cacheKey, "/search/movie", {
      query: cleanQuery,
      page,
    });
  }

  public async fetchMovieMetadata(tmdbId: number): Promise<TmdbMovieMetadata> {
    const cacheKey = `tmdb:movie:${tmdbId}`;
    const cached = this.cacheService.get<TmdbMovieMetadata>(cacheKey);
    if (cached) return cached;

    if (!this.isConfigured()) {
      const showcase = BUILTIN_SHOWCASE_CATALOG.find(
        (m) => m.tmdbId === tmdbId
      );
      if (showcase) {
        return showcase;
      }
      return {
        tmdbId,
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
            dataEn.overview?.trim() || "Sin sinopsis disponible por el momento.";
          if (!finalTitle) finalTitle = dataEn.title;
        }
      } catch {
        finalOverview = "Sin sinopsis disponible por el momento.";
      }
    }

    const releaseYear = dataEs.release_date
      ? Number(dataEs.release_date.split("-")[0]) || new Date().getFullYear()
      : new Date().getFullYear();

    const metadata: TmdbMovieMetadata = {
      tmdbId: dataEs.id,
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
      genres: dataEs.genres?.map((g) => g.name) || ["Cine"],
    };

    this.cacheService.set(cacheKey, metadata, this.cacheTtlSeconds);
    return metadata;
  }
}
