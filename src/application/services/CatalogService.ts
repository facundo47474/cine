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
   * Verifica si una película guardada en la BD tiene más de 1 servidor, enlaces antiguos
   * o el contenedor intermedio de embed69 sin extraer hacia Streamwish directo.
   */
  private needsAutomaticMirrorUpgrade(movie: Movie): boolean {
    if (!movie.tmdbId) return false;
    const playable = movie.getPlayableMirrors();
    if (playable.length !== 1) return true;

    const singleMirror = playable[0];
    if (singleMirror.serverName !== "Streamwish") return true;
    if (singleMirror.rawUrl.includes("embed69.org")) return true;
    if (
      /(vidsrc|vidlink|multiembed|2embed|autoembed|embed\.su|youtube\.com)/i.test(
        singleMirror.rawUrl
      )
    ) {
      return true;
    }

    return false;
  }

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

      if (!movie || this.needsAutomaticMirrorUpgrade(movie)) {
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
          mirrors: defaultMirrors.slice(0, 1),
        });
      }
    } else {
      movie = await this.movieRepository.findByIdWithMirrors(idOrTmdbSlug);

      if (movie && movie.tmdbId && this.needsAutomaticMirrorUpgrade(movie)) {
        const freshMirrors =
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
          mirrors: freshMirrors.slice(0, 1),
        });
      }
    }

    if (!movie) return null;

    // Entregar exclusivamente la Opción 1
    const playableMirrors = movie.getPlayableMirrors().slice(0, 1);
    const ttlHours = Number(process.env.STREAM_TOKEN_TTL_HOURS || "4");
    const expiresAt = new Date(
      Date.now() + ttlHours * 3600 * 1000
    ).toISOString();

    const streams: SignedMirrorStreamDto[] = playableMirrors.map((mirror) => {
      const token = this.tokenCryptoService.encryptStreamToken({
        mirrorId: mirror.id,
        movieId: movie!.id,
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

  public async refreshMovieMirrors(
    movieId: string
  ): Promise<MoviePlaybackDto | null> {
    return this.getMoviePlaybackData(movieId);
  }
}
