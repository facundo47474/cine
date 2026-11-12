import {
  CreateMirrorInput,
  IMovieRepository,
} from "@/domain/interfaces/IMovieRepository";
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
import {
  FALLBACK_IF_EMPTY,
  STRICT_STREAMWISH_ONLY,
  filterAndPrioritizeMirrors,
  isExtractableCleanHost,
  isMultiEmbedAggregatorUrl,
  isStreamwish,
} from "@/domain/utils/streamwishMatcher";

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
      mediaType: movie.mediaType,
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
    localByTmdbId: Map<string, Movie>
  ): CatalogCardDto {
    const expectedType = item.mediaType === "tv" ? "SERIES" : "MOVIE";
    const existingLocal = localByTmdbId.get(`${expectedType}:${item.tmdbId}`);
    if (existingLocal) {
      return this.mapMovieEntityToCard(existingLocal);
    }

    return {
      id: `tmdb-${item.tmdbId}`,
      tmdbId: item.tmdbId,
      mediaType: expectedType,
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

    const localByTmdbId = new Map<string, Movie>();
    for (const m of localMovies) {
      if (m.tmdbId !== null) {
        localByTmdbId.set(`${m.mediaType}:${m.tmdbId}`, m);
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
      trendingTvRes,
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
      this.tmdbGateway.getTrendingTv(1),
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
    const series = extractCards(trendingTvRes);

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
      series,
    };
  }

  public async exploreCatalog(
    params: ExploreCatalogParams
  ): Promise<ExploreCatalogResponseDto> {
    const page = Math.max(1, params.page || 1);
    const cleanQuery = params.query?.trim();
    const targetMediaType = params.mediaType; // "movie" | "tv" | undefined

    const allLocalMedia = await this.movieRepository.findAvailableCatalog(
      cleanQuery
    );
    const localMovies = allLocalMedia.filter((m) => {
      if (targetMediaType === "movie") return m.mediaType === "MOVIE";
      if (targetMediaType === "tv") return m.mediaType === "SERIES";
      return true;
    });

    const localByTmdbId = new Map<string, Movie>();
    for (const m of allLocalMedia) {
      if (m.tmdbId !== null) {
        localByTmdbId.set(`${m.mediaType}:${m.tmdbId}`, m);
      }
    }

    if (cleanQuery) {
      const [movieSearch, tvSearch] = await Promise.allSettled([
        targetMediaType === "tv"
          ? Promise.resolve({ page: 1, totalPages: 1, totalResults: 0, items: [] })
          : this.tmdbGateway.searchMovies(cleanQuery, page),
        targetMediaType === "movie"
          ? Promise.resolve({ page: 1, totalPages: 1, totalResults: 0, items: [] })
          : this.tmdbGateway.searchTv(cleanQuery, page),
      ]);

      const movieItems =
        movieSearch.status === "fulfilled" ? movieSearch.value.items : [];
      const tvItems =
        tvSearch.status === "fulfilled" ? tvSearch.value.items : [];
      const combined = [...movieItems, ...tvItems];

      const cards = combined.map((item) =>
        this.mapTmdbItemToCard(item, localByTmdbId)
      );

      const seenKeys = new Set<string>(
        cards
          .filter((c) => c.tmdbId !== null)
          .map((c) => `${c.mediaType}:${c.tmdbId}`)
      );

      const localCards = localMovies
        .filter(
          (c) =>
            c.tmdbId === null || !seenKeys.has(`${c.mediaType}:${c.tmdbId}`)
        )
        .map((m) => this.mapMovieEntityToCard(m));

      return {
        tmdbConnected: this.tmdbGateway.isConfigured(),
        page: 1,
        totalPages: 1,
        totalResults: localCards.length + cards.length,
        items: [...localCards, ...cards],
      };
    }

    const discoverFilters = {
      page,
      genreId: params.genreId,
      watchProviderId: params.providerId,
      watchRegion: "AR",
      sortBy: "popularity.desc" as const,
    };

    const tmdbPageResult =
      targetMediaType === "tv"
        ? await this.tmdbGateway.discoverTv(discoverFilters)
        : await this.tmdbGateway.discoverMovies(discoverFilters);

    const tmdbCards = tmdbPageResult.items.map((item) =>
      this.mapTmdbItemToCard(item, localByTmdbId)
    );

    let combinedItems = tmdbCards;

    if (page === 1 && !params.providerId && !params.genreId) {
      const localCards = localMovies.map((m) => this.mapMovieEntityToCard(m));
      const seenIds = new Set<string>(localCards.map((c) => c.id));
      const seenKeys = new Set<string>(
        localCards
          .filter((c) => c.tmdbId !== null)
          .map((c) => `${c.mediaType}:${c.tmdbId}`)
      );

      const dedupedTmdb = tmdbCards.filter(
        (c) =>
          !seenIds.has(c.id) &&
          (c.tmdbId === null || !seenKeys.has(`${c.mediaType}:${c.tmdbId}`))
      );
      combinedItems = [...localCards, ...dedupedTmdb];
    }

    return {
      tmdbConnected: this.tmdbGateway.isConfigured(),
      page: tmdbPageResult.page,
      totalPages: tmdbPageResult.totalPages,
      totalResults: tmdbPageResult.totalResults,
      items: combinedItems,
    };
  }

  private needsAutomaticMirrorUpgrade(movie: Movie): boolean {
    if (!movie.tmdbId || movie.mediaType === "SERIES") return false;

    const playable = movie.getPlayableMirrors();
    if (playable.length === 0) return true;

    const hasLegacyAggregator = playable.some((m) =>
      isMultiEmbedAggregatorUrl(m.rawUrl)
    );
    if (hasLegacyAggregator) return true;

    // Solo evitamos re-sincronizar si ya existe al menos un mirror directo y real de Streamwish en Español Latino.
    // Si solo tiene Mixdrop, Vidhide, Filemoon, Dropload o un Streamwish degradado, permitimos re-resolver.
    const hasResolvedCleanStreamwishLatino = playable.some(
      (m) =>
        m.language === "Latino" &&
        isStreamwish({ serverName: m.serverName, url: m.rawUrl }) &&
        !isMultiEmbedAggregatorUrl(m.rawUrl)
    );
    if (hasResolvedCleanStreamwishLatino) return false;

    const hasDegradedStreamwish = movie.mirrors.some(
      (m) =>
        isStreamwish({ serverName: m.serverName, url: m.rawUrl }) &&
        !m.isPlayable()
    );
    if (hasDegradedStreamwish) return true;

    // Si el fallback limpio está activo y ya tenemos mirrors directos extraíbles en BD
    // (ej. Vidhide, Dropload, Mixdrop, Filemoon), evitamos re-consultar agregadores y pisarlos.
    if (FALLBACK_IF_EMPTY) {
      const hasDirectExtractableInDb = playable.some(
        (m) =>
          !isMultiEmbedAggregatorUrl(m.rawUrl) &&
          isExtractableCleanHost({ serverName: m.serverName, url: m.rawUrl })
      );
      if (hasDirectExtractableInDb) return false;
    }

    return true;
  }

  private mergePreservingDirectMirrors(
    existingMovie: Movie | null,
    freshMirrors: CreateMirrorInput[]
  ): CreateMirrorInput[] {
    if (!existingMovie) return freshMirrors;

    const existingCleanStreamwishByServer = new Map<string, string>();
    const existingExtractableMirrors: CreateMirrorInput[] = [];
    const freshUrls = new Set(freshMirrors.map((fm) => fm.rawUrl.trim()));

    for (const m of existingMovie.mirrors) {
      if (
        isStreamwish({ serverName: m.serverName, url: m.rawUrl }) &&
        !isMultiEmbedAggregatorUrl(m.rawUrl)
      ) {
        existingCleanStreamwishByServer.set(m.serverName, m.rawUrl);
      } else if (
        m.isPlayable() &&
        !isMultiEmbedAggregatorUrl(m.rawUrl) &&
        isExtractableCleanHost({ serverName: m.serverName, url: m.rawUrl }) &&
        !freshUrls.has(m.rawUrl.trim())
      ) {
        existingExtractableMirrors.push({
          serverName: m.serverName,
          language: m.language,
          rawUrl: m.rawUrl,
          format: m.format,
          quality: m.quality,
          priority: m.priority,
          isStreamwish: false,
          isDirty: true,
        });
      }
    }

    const merged = freshMirrors.map((fm) => {
      if (isMultiEmbedAggregatorUrl(fm.rawUrl)) {
        const prevDirect = existingCleanStreamwishByServer.get(fm.serverName);
        if (prevDirect) {
          return {
            ...fm,
            rawUrl: prevDirect,
            isStreamwish: true,
            isDirty: false,
          };
        }
      }
      return fm;
    });

    if (existingExtractableMirrors.length > 0 && FALLBACK_IF_EMPTY) {
      return [...merged, ...existingExtractableMirrors];
    }

    return merged;
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
        const rawMirrors =
          await this.mirrorResolver.resolveDefaultMirrorsForTmdb(
            tmdbId,
            metadata.title,
            metadata.releaseYear
          );
        const defaultMirrors = this.mergePreservingDirectMirrors(
          movie,
          rawMirrors
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

      if (movie && movie.tmdbId && this.needsAutomaticMirrorUpgrade(movie)) {
        const rawMirrors =
          await this.mirrorResolver.resolveDefaultMirrorsForTmdb(
            movie.tmdbId,
            movie.title,
            movie.releaseYear
          );
        const freshMirrors = this.mergePreservingDirectMirrors(
          movie,
          rawMirrors
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
          mirrors: freshMirrors,
        });
      }
    }

    if (!movie) return null;

    const playableMirrors = movie.getPlayableMirrors();
    const prioritizedMirrors = filterAndPrioritizeMirrors(playableMirrors, {
      strictOnly: STRICT_STREAMWISH_ONLY,
      fallbackIfEmpty: FALLBACK_IF_EMPTY,
    });

    const ttlHours = Number(process.env.STREAM_TOKEN_TTL_HOURS || "4");
    const expiresAt = new Date(
      Date.now() + ttlHours * 3600 * 1000
    ).toISOString();

    const streams: SignedMirrorStreamDto[] = prioritizedMirrors.map(
      ({ item: mirror, isStreamwish: sw, isDirty }, index) => {
        const token = this.tokenCryptoService.encryptStreamToken({
          mirrorId: mirror.id,
          movieId: movie!.id,
          rawUrl: mirror.rawUrl,
          format: mirror.format,
          serverName: mirror.serverName,
          isStreamwish: sw,
          isDirty,
        });

        return {
          mirrorId: mirror.id,
          serverName: mirror.serverName,
          language: mirror.language,
          format: mirror.format,
          quality: mirror.quality,
          priority: index + 1,
          status: mirror.status,
          streamUrl: `/api/stream/${encodeURIComponent(token)}`,
          expiresAt,
          isStreamwish: sw,
          isDirty,
        };
      }
    );

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
