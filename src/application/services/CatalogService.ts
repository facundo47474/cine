import {
  CreateMirrorInput,
  IMovieRepository,
} from "@/domain/interfaces/IMovieRepository";
import { ITokenCryptoService } from "@/domain/interfaces/ITokenCryptoService";
import { ITmdbGateway, TmdbCatalogItem } from "@/domain/interfaces/ITmdbGateway";
import { IMirrorResolver } from "@/domain/interfaces/IMirrorResolver";
import {
  MoviePlaybackDto,
  SignedMirrorStreamDto,
} from "../dto/PlaybackStreamDto";
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

/**
 * Servicio de Aplicación para el Catálogo Principal y Reproducción de Películas.
 *
 * Responsabilidades:
 * - Construir el feed híbrido de la portada (combinando películas VIP locales y listas de TMDB).
 * - Ejecutar búsquedas y filtros por plataforma/género con soporte de paginación.
 * - Gestionar la auto-sincronización de mirrors con Streamwish y firmar tokens AES-256-GCM.
 */
export class CatalogService {
  constructor(
    private readonly movieRepository: IMovieRepository,
    private readonly tokenCryptoService: ITokenCryptoService,
    private readonly tmdbGateway: ITmdbGateway,
    private readonly mirrorResolver: IMirrorResolver
  ) {}

  /**
   * Transforma una entidad `Movie` local de PostgreSQL en un DTO de tarjeta para la interfaz.
   *
   * @param movie Entidad de dominio `Movie`.
   * @returns Objeto `CatalogCardDto`.
   */
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

  /**
   * Transforma un ítem proveniente de TMDB en una tarjeta de catálogo,
   * priorizando la entidad local si el título ya fue importado en PostgreSQL.
   *
   * @param item Ítem del catálogo de TMDB.
   * @param localByMediaKey Mapa indexado por `${mediaType}:${tmdbId}`.
   * @returns Objeto `CatalogCardDto`.
   */
  private mapTmdbItemToCard(
    item: TmdbCatalogItem,
    localByMediaKey: Map<string, Movie>
  ): CatalogCardDto {
    const normalizedMediaType = item.mediaType === "tv" ? "SERIES" : "MOVIE";
    const existingLocalEntity = localByMediaKey.get(
      `${normalizedMediaType}:${item.tmdbId}`
    );

    if (existingLocalEntity) {
      return this.mapMovieEntityToCard(existingLocalEntity);
    }

    return {
      id: `tmdb-${item.tmdbId}`,
      tmdbId: item.tmdbId,
      mediaType: normalizedMediaType,
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

  /**
   * Construye un mapa indexado por `${mediaType}:${tmdbId}` a partir de una lista de entidades locales.
   *
   * @param localMedia Lista de entidades `Movie` almacenadas en la base de datos.
   * @returns Mapa para cruce rápido O(1) con resultados de TMDB.
   */
  private buildLocalMediaLookupMap(localMedia: Movie[]): Map<string, Movie> {
    const lookupMap = new Map<string, Movie>();
    for (const media of localMedia) {
      if (media.tmdbId !== null) {
        lookupMap.set(`${media.mediaType}:${media.tmdbId}`, media);
      }
    }
    return lookupMap;
  }

  /**
   * Obtiene todas las películas disponibles localmente en la base de datos.
   *
   * @param searchQuery Texto opcional de búsqueda.
   * @param genre Género opcional para filtrar.
   * @returns Lista de propiedades planas `MovieProps`.
   */
  public async getAvailableMovies(
    searchQuery?: string,
    genre?: string
  ): Promise<MovieProps[]> {
    const movies = await this.movieRepository.findAvailableCatalog(
      searchQuery,
      genre
    );
    return movies.map((movie) => movie.toObject());
  }

  /**
   * Construye el feed completo de la página principal (`/`), consultando en paralelo
   * las colecciones de tendencias, cartelera, plataformas de streaming y series populares.
   *
   * @returns Objeto `HomeFeedDto` listo para renderizar los carruseles y el banner principal.
   */
  public async getHomeFeed(): Promise<HomeFeedDto> {
    const localMovies = await this.movieRepository.findAvailableCatalog();
    const localByMediaKey = this.buildLocalMediaLookupMap(localMovies);
    const localVipCards = localMovies
      .filter((item) => item.mediaType === "MOVIE")
      .map((movie) => this.mapMovieEntityToCard(movie));

    const [
      trendingResult,
      nowPlayingResult,
      topRatedResult,
      netflixResult,
      disneyResult,
      maxResult,
      primeResult,
      trendingTvResult,
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

    const extractFulfilledCards = (
      settledResult: PromiseSettledResult<{ items: TmdbCatalogItem[] }>
    ): CatalogCardDto[] => {
      if (settledResult.status !== "fulfilled") return [];
      return settledResult.value.items.map((item) =>
        this.mapTmdbItemToCard(item, localByMediaKey)
      );
    };

    const trending = extractFulfilledCards(trendingResult);
    const nowPlaying = extractFulfilledCards(nowPlayingResult);
    const topRated = extractFulfilledCards(topRatedResult);
    const netflix = extractFulfilledCards(netflixResult);
    const disney = extractFulfilledCards(disneyResult);
    const max = extractFulfilledCards(maxResult);
    const prime = extractFulfilledCards(primeResult);
    const series = extractFulfilledCards(trendingTvResult);

    const featured =
      trending.find((card) => Boolean(card.backdropUrl)) ||
      localVipCards.find((card) => Boolean(card.backdropUrl)) ||
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

  /**
   * Explora y filtra el catálogo híbrido por término de búsqueda, plataforma de streaming,
   * género, tipo de contenido (`movie` o `tv`) y número de página.
   *
   * @param params Parámetros de búsqueda y filtrado (`ExploreCatalogParams`).
   * @returns Respuesta paginada con tarjetas deduplicadas (`ExploreCatalogResponseDto`).
   */
  public async exploreCatalog(
    params: ExploreCatalogParams
  ): Promise<ExploreCatalogResponseDto> {
    const requestedPage = Math.max(1, params.page || 1);
    const cleanSearchQuery = params.query?.trim();
    const targetMediaType = params.mediaType; // "movie" | "tv" | undefined

    const allLocalMedia = await this.movieRepository.findAvailableCatalog(
      cleanSearchQuery
    );
    const filteredLocalMedia = allLocalMedia.filter((item) => {
      if (targetMediaType === "movie") return item.mediaType === "MOVIE";
      if (targetMediaType === "tv") return item.mediaType === "SERIES";
      return true;
    });

    const localByMediaKey = this.buildLocalMediaLookupMap(allLocalMedia);

    if (cleanSearchQuery) {
      const emptyPaginatedResponse = {
        page: requestedPage,
        totalPages: 1,
        totalResults: 0,
        items: [] as TmdbCatalogItem[],
      };

      const [movieSearchSettled, tvSearchSettled] = await Promise.allSettled([
        targetMediaType === "tv"
          ? Promise.resolve(emptyPaginatedResponse)
          : this.tmdbGateway.searchMovies(cleanSearchQuery, requestedPage),
        targetMediaType === "movie"
          ? Promise.resolve(emptyPaginatedResponse)
          : this.tmdbGateway.searchTv(cleanSearchQuery, requestedPage),
      ]);

      const moviePageData =
        movieSearchSettled.status === "fulfilled"
          ? movieSearchSettled.value
          : emptyPaginatedResponse;
      const tvPageData =
        tvSearchSettled.status === "fulfilled"
          ? tvSearchSettled.value
          : emptyPaginatedResponse;

      const combinedTmdbItems = [...moviePageData.items, ...tvPageData.items];
      const tmdbCards = combinedTmdbItems.map((item) =>
        this.mapTmdbItemToCard(item, localByMediaKey)
      );

      const seenMediaKeys = new Set<string>(
        tmdbCards
          .filter((card) => card.tmdbId !== null)
          .map((card) => `${card.mediaType}:${card.tmdbId}`)
      );

      // Solo incluimos coincidencias locales adicionales en la primera página de resultados
      const unmatchedLocalCards =
        requestedPage === 1
          ? filteredLocalMedia
              .filter(
                (localItem) =>
                  localItem.tmdbId === null ||
                  !seenMediaKeys.has(
                    `${localItem.mediaType}:${localItem.tmdbId}`
                  )
              )
              .map((localItem) => this.mapMovieEntityToCard(localItem))
          : [];

      const combinedTotalPages = Math.max(
        1,
        moviePageData.totalPages || 1,
        tvPageData.totalPages || 1
      );
      const combinedTotalResults =
        unmatchedLocalCards.length +
        (moviePageData.totalResults || 0) +
        (tvPageData.totalResults || 0);

      return {
        tmdbConnected: this.tmdbGateway.isConfigured(),
        page: requestedPage,
        totalPages: combinedTotalPages,
        totalResults: combinedTotalResults || unmatchedLocalCards.length + tmdbCards.length,
        items: [...unmatchedLocalCards, ...tmdbCards],
      };
    }

    const discoverFilters = {
      page: requestedPage,
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
      this.mapTmdbItemToCard(item, localByMediaKey)
    );

    let combinedItems = tmdbCards;

    if (requestedPage === 1 && !params.providerId && !params.genreId) {
      const localCards = filteredLocalMedia.map((item) =>
        this.mapMovieEntityToCard(item)
      );
      const seenCardIds = new Set<string>(localCards.map((card) => card.id));
      const seenMediaKeys = new Set<string>(
        localCards
          .filter((card) => card.tmdbId !== null)
          .map((card) => `${card.mediaType}:${card.tmdbId}`)
      );

      const deduplicatedTmdbCards = tmdbCards.filter(
        (card) =>
          !seenCardIds.has(card.id) &&
          (card.tmdbId === null ||
            !seenMediaKeys.has(`${card.mediaType}:${card.tmdbId}`))
      );
      combinedItems = [...localCards, ...deduplicatedTmdbCards];
    }

    return {
      tmdbConnected: this.tmdbGateway.isConfigured(),
      page: tmdbPageResult.page,
      totalPages: tmdbPageResult.totalPages,
      totalResults: tmdbPageResult.totalResults,
      items: combinedItems,
    };
  }

  /**
   * Determina si una película almacenada en base de datos requiere actualizar sus mirrors
   * automáticamente para obtener enlaces directos de Streamwish en Español Latino.
   *
   * @param movie Entidad de dominio `Movie`.
   * @returns `true` si es necesario consultar el resolver de mirrors.
   */
  private needsAutomaticMirrorUpgrade(movie: Movie): boolean {
    if (!movie.tmdbId || movie.mediaType === "SERIES") return false;

    const playableMirrors = movie.getPlayableMirrors();
    if (playableMirrors.length === 0) return true;

    const hasLegacyAggregator = playableMirrors.some((mirror) =>
      isMultiEmbedAggregatorUrl(mirror.rawUrl)
    );
    if (hasLegacyAggregator) return true;

    const hasResolvedCleanStreamwishLatino = playableMirrors.some(
      (mirror) =>
        mirror.language === "Latino" &&
        isStreamwish({ serverName: mirror.serverName, url: mirror.rawUrl }) &&
        !isMultiEmbedAggregatorUrl(mirror.rawUrl)
    );
    if (hasResolvedCleanStreamwishLatino) return false;

    const hasDegradedStreamwish = movie.mirrors.some(
      (mirror) =>
        isStreamwish({ serverName: mirror.serverName, url: mirror.rawUrl }) &&
        !mirror.isPlayable()
    );
    if (hasDegradedStreamwish) return true;

    if (FALLBACK_IF_EMPTY) {
      const hasDirectExtractableInDb = playableMirrors.some(
        (mirror) =>
          !isMultiEmbedAggregatorUrl(mirror.rawUrl) &&
          isExtractableCleanHost({
            serverName: mirror.serverName,
            url: mirror.rawUrl,
          })
      );
      if (hasDirectExtractableInDb) return false;
    }

    return true;
  }

  /**
   * Fusiona los nuevos mirrors obtenidos del resolver conservando cualquier mirror directo
   * de Streamwish o servidor extraíble que ya estuviese validado en la base de datos.
   *
   * @param existingMovie Entidad `Movie` existente en BD (o `null` si es nueva).
   * @param freshMirrors Lista de mirrors recién resueltos.
   * @returns Lista combinada de `CreateMirrorInput` lista para persistir.
   */
  private mergePreservingDirectMirrors(
    existingMovie: Movie | null,
    freshMirrors: CreateMirrorInput[]
  ): CreateMirrorInput[] {
    if (!existingMovie) return freshMirrors;

    const existingCleanStreamwishByServer = new Map<string, string>();
    const existingExtractableMirrors: CreateMirrorInput[] = [];
    const freshUrlSet = new Set(
      freshMirrors.map((mirror) => mirror.rawUrl.trim())
    );

    for (const existingMirror of existingMovie.mirrors) {
      if (
        isStreamwish({
          serverName: existingMirror.serverName,
          url: existingMirror.rawUrl,
        }) &&
        !isMultiEmbedAggregatorUrl(existingMirror.rawUrl)
      ) {
        existingCleanStreamwishByServer.set(
          existingMirror.serverName,
          existingMirror.rawUrl
        );
      } else if (
        existingMirror.isPlayable() &&
        !isMultiEmbedAggregatorUrl(existingMirror.rawUrl) &&
        isExtractableCleanHost({
          serverName: existingMirror.serverName,
          url: existingMirror.rawUrl,
        }) &&
        !freshUrlSet.has(existingMirror.rawUrl.trim())
      ) {
        existingExtractableMirrors.push({
          serverName: existingMirror.serverName,
          language: existingMirror.language,
          rawUrl: existingMirror.rawUrl,
          format: existingMirror.format,
          quality: existingMirror.quality,
          priority: existingMirror.priority,
          isStreamwish: false,
          isDirty: true,
        });
      }
    }

    const mergedMirrors = freshMirrors.map((freshMirror) => {
      if (isMultiEmbedAggregatorUrl(freshMirror.rawUrl)) {
        const previousDirectUrl = existingCleanStreamwishByServer.get(
          freshMirror.serverName
        );
        if (previousDirectUrl) {
          return {
            ...freshMirror,
            rawUrl: previousDirectUrl,
            isStreamwish: true,
            isDirty: false,
          };
        }
      }
      return freshMirror;
    });

    if (existingExtractableMirrors.length > 0 && FALLBACK_IF_EMPTY) {
      return [...mergedMirrors, ...existingExtractableMirrors];
    }

    return mergedMirrors;
  }

  /**
   * Obtiene la información completa de reproducción de una película por su UUID o `tmdb-{id}`,
   * auto-importándola desde TMDB si aún no existe en la base de datos y firmando sus streams.
   *
   * @param idOrTmdbSlug UUID local, `"tmdb-{id}"` o ID numérico de TMDB.
   * @returns Objeto `MoviePlaybackDto` con streams firmados o `null` si no existe.
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

      if (!movie || this.needsAutomaticMirrorUpgrade(movie)) {
        const metadata = await this.tmdbGateway.fetchMovieMetadata(tmdbId);
        const resolvedRawMirrors =
          await this.mirrorResolver.resolveDefaultMirrorsForTmdb(
            tmdbId,
            metadata.title,
            metadata.releaseYear,
            metadata.imdbId
          );
        const mergedMirrors = this.mergePreservingDirectMirrors(
          movie,
          resolvedRawMirrors
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
          mirrors: mergedMirrors,
        });
      }
    } else {
      movie = await this.movieRepository.findByIdWithMirrors(idOrTmdbSlug);

      if (movie && movie.tmdbId && this.needsAutomaticMirrorUpgrade(movie)) {
        const imdbId = await this.tmdbGateway.fetchMovieImdbId(movie.tmdbId);
        const resolvedRawMirrors =
          await this.mirrorResolver.resolveDefaultMirrorsForTmdb(
            movie.tmdbId,
            movie.title,
            movie.releaseYear,
            imdbId
          );
        const mergedMirrors = this.mergePreservingDirectMirrors(
          movie,
          resolvedRawMirrors
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
          mirrors: mergedMirrors,
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

    const signedStreams: SignedMirrorStreamDto[] = prioritizedMirrors.map(
      ({ item: mirror, isStreamwish: belongsToSw, isDirty }, index) => {
        const encryptedToken = this.tokenCryptoService.encryptStreamToken({
          mirrorId: mirror.id,
          movieId: movie!.id,
          rawUrl: mirror.rawUrl,
          format: mirror.format,
          serverName: mirror.serverName,
          isStreamwish: belongsToSw,
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
          streamUrl: `/api/stream/${encodeURIComponent(encryptedToken)}`,
          expiresAt,
          isStreamwish: belongsToSw,
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
      isAvailable: movie.isAvailable && signedStreams.length > 0,
      streams: signedStreams,
    };
  }

  /**
   * Re-sincroniza y devuelve los enlaces de reproducción actualizados de una película.
   *
   * @param movieId UUID o slug TMDB de la película.
   * @returns Datos de reproducción actualizados (`MoviePlaybackDto`).
   */
  public async refreshMovieMirrors(
    movieId: string
  ): Promise<MoviePlaybackDto | null> {
    return this.getMoviePlaybackData(movieId);
  }
}
