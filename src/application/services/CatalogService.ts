import { IMovieRepository } from "@/domain/interfaces/IMovieRepository";
import { ITokenCryptoService } from "@/domain/interfaces/ITokenCryptoService";
import { ITmdbGateway, TmdbCatalogItem } from "@/domain/interfaces/ITmdbGateway";
import { IMirrorResolver } from "@/domain/interfaces/IMirrorResolver";
import { MoviePlaybackDto, SignedMirrorStreamDto } from "../dto/PlaybackStreamDto";
import {
  CatalogCardDto,
  ExploreCatalogParams,
  ExploreCatalogResponseDto,
  HomeFeedDto,
} from "../dto/CatalogFeedDto";
import { Movie, MovieProps } from "@/domain/entities/Movie";

/**
 * Servicio de Catálogo Masivo Híbrido y Reproducción (Versión 2.0).
 * - Unifica el catálogo local VIP de PostgreSQL con el catálogo infinito de TMDB.
 * - Ejecuta Persistencia Just-In-Time (Lazy Upsert) cuando el usuario reproduce un título nuevo.
 * - Cifra todos los mirrors con TokenCryptoService (AES-256-GCM).
 */
export class CatalogService {
  constructor(
    private readonly movieRepository: IMovieRepository,
    private readonly tokenCryptoService: ITokenCryptoService,
    private readonly tmdbGateway: ITmdbGateway,
    private readonly mirrorResolver: IMirrorResolver
  ) {}

  private mapMovieEntityToCard(movie: Movie): CatalogCardDto {
    return {
      id: movie.id,
      tmdbId: movie.tmdbId,
      title: movie.title,
      originalTitle: movie.originalTitle,
      synopsis: movie.synopsis,
      posterUrl: movie.posterUrl,
      backdropUrl: movie.backdropUrl,
      releaseYear: movie.releaseYear,
      durationMins: movie.durationMins,
      rating: movie.rating,
      qualityBadge: movie.qualityBadge,
      genres: movie.genres,
      isLocalVip: true,
    };
  }

  private mapTmdbItemToCard(
    item: TmdbCatalogItem,
    localByTmdbId: Map<number, Movie>
  ): CatalogCardDto {
    const existingLocal = localByTmdbId.get(item.tmdbId);
    if (existingLocal) {
      return this.mapMovieEntityToCard(existingLocal);
    }

    return {
      id: `tmdb-${item.tmdbId}`,
      tmdbId: item.tmdbId,
      title: item.title,
      originalTitle: item.originalTitle,
      synopsis: item.synopsis,
      posterUrl: item.posterUrl,
      backdropUrl: item.backdropUrl,
      releaseYear: item.releaseYear,
      durationMins: 120,
      rating: item.rating,
      qualityBadge: "HD",
      genres: item.genres,
      isLocalVip: false,
    };
  }

  public async getAvailableMovies(
    searchQuery?: string,
    genre?: string
  ): Promise<MovieProps[]> {
    const movies = await this.movieRepository.findAvailableCatalog(
      searchQuery,
      genre
    );
    return movies.map((m) => m.toObject());
  }

  /**
   * Construye el Home Feed completo en paralelo sin bloquear el hilo principal.
   */
  public async getHomeFeed(): Promise<HomeFeedDto> {
    const localMovies = await this.movieRepository.findAvailableCatalog();
    const localByTmdbId = new Map<number, Movie>();
    for (const m of localMovies) {
      if (m.tmdbId !== null) {
        localByTmdbId.set(m.tmdbId, m);
      }
    }

    const localVipCards = localMovies.map((m) => this.mapMovieEntityToCard(m));

    const [
      trendingRes,
      nowPlayingRes,
      topRatedRes,
      netflixRes,
      disneyRes,
      maxRes,
      primeRes,
    ] = await Promise.allSettled([
      this.tmdbGateway.getTrendingMovies(1),
      this.tmdbGateway.getNowPlayingMovies(1),
      this.tmdbGateway.getTopRatedMovies(1),
      this.tmdbGateway.discoverMovies({
        watchProviderId: 8,
        watchRegion: "AR",
        page: 1,
      }),
      this.tmdbGateway.discoverMovies({
        watchProviderId: 337,
        watchRegion: "AR",
        page: 1,
      }),
      this.tmdbGateway.discoverMovies({
        watchProviderId: 1899,
        watchRegion: "AR",
        page: 1,
      }),
      this.tmdbGateway.discoverMovies({
        watchProviderId: 119,
        watchRegion: "AR",
        page: 1,
      }),
    ]);

    const extractCards = (
      res: PromiseSettledResult<{ items: TmdbCatalogItem[] }>
    ): CatalogCardDto[] => {
      if (res.status !== "fulfilled") return [];
      return res.value.items.map((item) =>
        this.mapTmdbItemToCard(item, localByTmdbId)
      );
    };

    const trending = extractCards(trendingRes);
    const nowPlaying = extractCards(nowPlayingRes);
    const topRated = extractCards(topRatedRes);
    const netflix = extractCards(netflixRes);
    const disney = extractCards(disneyRes);
    const max = extractCards(maxRes);
    const prime = extractCards(primeRes);

    const featured =
      trending.find((m) => Boolean(m.backdropUrl)) ||
      localVipCards.find((m) => Boolean(m.backdropUrl)) ||
      trending[0] ||
      localVipCards[0] ||
      null;

    return {
      tmdbConnected: this.tmdbGateway.isConfigured(),
      featured,
      localVip: localVipCards,
      trending,
      nowPlaying,
      topRated,
      netflix,
      disney,
      max,
      prime,
    };
  }

  /**
   * Exploración y búsqueda paginada combinando resultados locales de PostgreSQL y TMDB.
   */
  public async exploreCatalog(
    params: ExploreCatalogParams
  ): Promise<ExploreCatalogResponseDto> {
    const page = Math.max(1, params.page || 1);
    const cleanQuery = params.query?.trim();

    const localMovies = await this.movieRepository.findAvailableCatalog(
      cleanQuery
    );
    const localByTmdbId = new Map<number, Movie>();
    for (const m of localMovies) {
      if (m.tmdbId !== null) {
        localByTmdbId.set(m.tmdbId, m);
      }
    }

    const tmdbPageResult = cleanQuery
      ? await this.tmdbGateway.searchMovies(cleanQuery, page)
      : await this.tmdbGateway.discoverMovies({
          page,
          genreId: params.genreId,
          watchProviderId: params.providerId,
          watchRegion: "AR",
          sortBy: "popularity.desc",
        });

    const tmdbCards = tmdbPageResult.items.map((item) =>
      this.mapTmdbItemToCard(item, localByTmdbId)
    );

    let combinedItems = tmdbCards;

    if (page === 1 && !params.providerId && !params.genreId) {
      const localCards = localMovies.map((m) => this.mapMovieEntityToCard(m));
      const seenIds = new Set<string>(localCards.map((c) => c.id));
      const seenTmdbIds = new Set<number>(
        localCards
          .map((c) => c.tmdbId)
          .filter((id): id is number => id !== null)
      );

      const dedupedTmdb = tmdbCards.filter(
        (c) =>
          !seenIds.has(c.id) &&
          (c.tmdbId === null || !seenTmdbIds.has(c.tmdbId))
      );
      combinedItems = [...localCards, ...dedupedTmdb];
    }

    return {
      tmdbConnected: this.tmdbGateway.isConfigured(),
      page: tmdbPageResult.page,
      totalPages: tmdbPageResult.totalPages,
      totalResults:
        tmdbPageResult.totalResults + (page === 1 ? localMovies.length : 0),
      items: combinedItems,
    };
  }

  /**
   * Obtiene los datos de reproducción de una película (por UUID o slug "tmdb-12345").
   * Si la película proviene del catálogo global de TMDB y aún no existe en PostgreSQL,
   * realiza un Lazy Upsert automático con sus Mirrors generados por IMirrorResolver.
   */
  public async getMoviePlaybackData(
    idOrTmdbSlug: string
  ): Promise<MoviePlaybackDto | null> {
    let movie: Movie | null = null;

    const isTmdbPrefixed = idOrTmdbSlug.startsWith("tmdb-");
    const isNumericId = /^\d+$/.test(idOrTmdbSlug);

    if (isTmdbPrefixed || isNumericId) {
      const tmdbId = Number(
        isTmdbPrefixed ? idOrTmdbSlug.replace("tmdb-", "") : idOrTmdbSlug
      );

      if (isNaN(tmdbId) || tmdbId <= 0) return null;

      movie = await this.movieRepository.findByTmdbId(tmdbId);

      if (!movie || movie.getPlayableMirrors().length === 0) {
        const metadata = await this.tmdbGateway.fetchMovieMetadata(tmdbId);
        const defaultMirrors =
          await this.mirrorResolver.resolveDefaultMirrorsForTmdb(
            tmdbId,
            metadata.title,
            metadata.releaseYear
          );

        movie = await this.movieRepository.upsertMovieWithMirrors({
          tmdbId: metadata.tmdbId,
          title: metadata.title,
          originalTitle: metadata.originalTitle,
          synopsis: metadata.synopsis,
          posterUrl: metadata.posterUrl,
          backdropUrl: metadata.backdropUrl,
          releaseYear: metadata.releaseYear,
          durationMins: metadata.durationMins,
          rating: metadata.rating,
          qualityBadge: "HD",
          genres: metadata.genres,
          mirrors: defaultMirrors,
        });
      }
    } else {
      movie = await this.movieRepository.findByIdWithMirrors(idOrTmdbSlug);

      if (
        movie &&
        movie.tmdbId &&
        movie.getPlayableMirrors().length === 0
      ) {
        const backupMirrors =
          await this.mirrorResolver.resolveDefaultMirrorsForTmdb(
            movie.tmdbId,
            movie.title,
            movie.releaseYear
          );
        movie = await this.movieRepository.upsertMovieWithMirrors({
          tmdbId: movie.tmdbId,
          title: movie.title,
          originalTitle: movie.originalTitle,
          synopsis: movie.synopsis,
          posterUrl: movie.posterUrl,
          backdropUrl: movie.backdropUrl,
          releaseYear: movie.releaseYear,
          durationMins: movie.durationMins,
          rating: movie.rating,
          qualityBadge: movie.qualityBadge,
          genres: movie.genres,
          mirrors: backupMirrors,
        });
      }
    }

    if (!movie) return null;

    const playableMirrors = movie.getPlayableMirrors();
    const ttlHours = Number(process.env.STREAM_TOKEN_TTL_HOURS || "4");
    const expiresAt = new Date(
      Date.now() + ttlHours * 3600 * 1000
    ).toISOString();

    const streams: SignedMirrorStreamDto[] = playableMirrors.map((mirror) => {
      const token = this.tokenCryptoService.encryptStreamToken({
        mirrorId: mirror.id,
        movieId: movie.id,
        rawUrl: mirror.rawUrl,
        format: mirror.format,
      });

      return {
        mirrorId: mirror.id,
        serverName: mirror.serverName,
        language: mirror.language,
        format: mirror.format,
        quality: mirror.quality,
        priority: mirror.priority,
        status: mirror.status,
        streamUrl: `/api/stream/${encodeURIComponent(token)}`,
        expiresAt,
      };
    });

    return {
      id: movie.id,
      tmdbId: movie.tmdbId,
      title: movie.title,
      originalTitle: movie.originalTitle,
      synopsis: movie.synopsis,
      posterUrl: movie.posterUrl,
      backdropUrl: movie.backdropUrl,
      releaseYear: movie.releaseYear,
      durationMins: movie.durationMins,
      rating: movie.rating,
      qualityBadge: movie.qualityBadge,
      genres: movie.genres,
      isAvailable: movie.isAvailable && streams.length > 0,
      streams,
    };
  }

  /**
   * Re-sincroniza forzosamente los mirrors en español para una película existente.
   */
  public async refreshMovieMirrors(
    movieId: string
  ): Promise<MoviePlaybackDto | null> {
    const movie = await this.movieRepository.findByIdWithMirrors(movieId);
    if (!movie || !movie.tmdbId) return null;

    const freshMirrors = await this.mirrorResolver.resolveDefaultMirrorsForTmdb(
      movie.tmdbId,
      movie.title,
      movie.releaseYear
    );

    const updated = await this.movieRepository.upsertMovieWithMirrors({
      tmdbId: movie.tmdbId,
      title: movie.title,
      originalTitle: movie.originalTitle,
      synopsis: movie.synopsis,
      posterUrl: movie.posterUrl,
      backdropUrl: movie.backdropUrl,
      releaseYear: movie.releaseYear,
      durationMins: movie.durationMins,
      rating: movie.rating,
      qualityBadge: movie.qualityBadge,
      genres: movie.genres,
      mirrors: freshMirrors,
    });

    return this.getMoviePlaybackData(updated.id);
  }
}
