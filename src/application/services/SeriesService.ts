import { ISeriesRepository } from "@/domain/interfaces/ISeriesRepository";
import { IWatchHistoryRepository } from "@/domain/interfaces/IWatchHistoryRepository";
import { ITmdbGateway } from "@/domain/interfaces/ITmdbGateway";
import { ITokenCryptoService } from "@/domain/interfaces/ITokenCryptoService";
import { IMirrorResolver } from "@/domain/interfaces/IMirrorResolver";
import { SignedMirrorStreamDto } from "../dto/PlaybackStreamDto";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { MirrorStatus } from "@/domain/enums/MirrorStatus";
import { WatchHistory } from "@/domain/entities/WatchHistory";
import {
  SeriesDetailsDto,
  SeasonSummaryDto,
  EpisodeDto,
  SeriesResumeDto,
  CastMemberDto,
  EpisodePlaybackDto,
} from "../dto/SeriesDto";
import {
  FALLBACK_IF_EMPTY,
  STRICT_STREAMWISH_ONLY,
  filterAndPrioritizeMirrors,
  isExtractableCleanHost,
  isMultiEmbedAggregatorUrl,
  isStreamwish,
} from "@/domain/utils/streamwishMatcher";

interface CandidateEpisodeMirror {
  id?: string;
  serverName: string;
  language: string;
  rawUrl: string;
  format: MirrorFormat;
  quality: string;
  priority: number;
}

/**
 * Servicio de Aplicación para Series de TV, Temporadas y Episodios (`SeriesService`).
 *
 * Responsabilidades:
 * - Auto-importar series y temporadas bajo demanda desde TMDB hacia PostgreSQL.
 * - Calcular el punto de reanudación inteligente (`Smart CTA`: "Reproducir", "Continuar" o "Ver siguiente").
 * - Resolver mirrors de capítulos priorizando Streamwish en Español Latino y firmar tokens de reproducción.
 */
export class SeriesService {
  constructor(
    private readonly seriesRepository: ISeriesRepository,
    private readonly historyRepository: IWatchHistoryRepository,
    private readonly tmdbGateway: ITmdbGateway,
    private readonly tokenCryptoService: ITokenCryptoService,
    private readonly mirrorResolver?: IMirrorResolver
  ) {}

  /**
   * Extrae un ID numérico de TMDB si el identificador recibido tiene formato `"tmdb-{id}"` o numérico.
   *
   * @param slugOrId Identificador o slug de la serie.
   * @returns ID numérico de TMDB o `null` si es un UUID local.
   */
  private parseTmdbIdFromSlug(slugOrId: string): number | null {
    if (slugOrId.startsWith("tmdb-")) {
      const parsed = Number(slugOrId.replace("tmdb-", ""));
      return !isNaN(parsed) && parsed > 0 ? parsed : null;
    }
    if (/^\d+$/.test(slugOrId)) {
      const parsed = Number(slugOrId);
      return !isNaN(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
  }

  /**
   * Obtiene los detalles completos de una serie (con temporadas, episodios de la temporada inicial,
   * reparto principal y estado de reanudación del usuario).
   *
   * @param slugOrId UUID local o slug `"tmdb-{id}"` de la serie.
   * @param userId UUID opcional del usuario autenticado.
   * @returns Objeto `SeriesDetailsDto` o `null` si la serie no existe.
   */
  public async getSeriesDetails(
    slugOrId: string,
    userId?: string
  ): Promise<SeriesDetailsDto | null> {
    let seriesDetails = await this.seriesRepository.findSeriesDetails(slugOrId);
    let preloadedCast: CastMemberDto[] = [];

    if (!seriesDetails || seriesDetails.seasons.length === 0) {
      const tmdbId =
        seriesDetails?.series.tmdbId ?? this.parseTmdbIdFromSlug(slugOrId);

      if (tmdbId && tmdbId > 0) {
        try {
          const [tvMetadata, seasonOneDetails, tmdbCast] = await Promise.all([
            this.tmdbGateway.fetchTvMetadata(tmdbId),
            this.tmdbGateway.fetchTvSeason(tmdbId, 1),
            this.tmdbGateway.fetchTvCredits(tmdbId),
          ]);

          preloadedCast = tmdbCast.map((member) => ({
            id: member.id,
            name: member.name,
            character: member.character,
            profileUrl: member.profileUrl,
          }));

          seriesDetails = await this.seriesRepository.upsertSeries({
            tmdbId,
            title: tvMetadata.title,
            originalTitle: tvMetadata.originalTitle,
            synopsis: tvMetadata.synopsis,
            posterUrl: tvMetadata.posterUrl,
            backdropUrl: tvMetadata.backdropUrl,
            releaseYear: tvMetadata.releaseYear,
            rating: tvMetadata.rating,
            qualityBadge: "HD",
            genres: tvMetadata.genres,
            seasons: [
              {
                seasonNumber: seasonOneDetails.seasonNumber,
                title: seasonOneDetails.title,
                overview: seasonOneDetails.overview,
                posterUrl: seasonOneDetails.posterUrl,
                episodes: seasonOneDetails.episodes.map((episode) => ({
                  episodeNumber: episode.episodeNumber,
                  title: episode.title,
                  overview: episode.overview,
                  duration: episode.duration,
                  thumbnailUrl: episode.thumbnailUrl,
                })),
              },
              ...tvMetadata.seasons
                .filter(
                  (season) =>
                    season.seasonNumber !== seasonOneDetails.seasonNumber
                )
                .map((season) => ({
                  seasonNumber: season.seasonNumber,
                  title: season.title,
                  overview: season.overview,
                  posterUrl: season.posterUrl,
                  episodes: [],
                })),
            ],
          });
        } catch (error) {
          console.error(
            `[SeriesService] Error auto-importando serie TMDB #${tmdbId}:`,
            error
          );
          if (!seriesDetails) {
            seriesDetails =
              await this.seriesRepository.findSeriesDetails(slugOrId);
          }
        }
      }
    }

    if (!seriesDetails) return null;

    const { series, seasons } = seriesDetails;

    const seasonsSummary: SeasonSummaryDto[] = seasons.map((season) => ({
      id: season.id,
      seasonNumber: season.seasonNumber,
      title: season.title,
      overview: season.overview,
      posterUrl: season.posterUrl,
      episodeCount: season.episodes.length,
    }));

    const defaultSeason = seasons[0];
    let currentSeasonEpisodes: EpisodeDto[] = [];

    if (defaultSeason) {
      currentSeasonEpisodes = await this.getSeasonEpisodes(
        series.id,
        defaultSeason.seasonNumber,
        userId
      );
    }

    let cast: CastMemberDto[] = preloadedCast;
    if (cast.length === 0 && series.tmdbId) {
      try {
        const tmdbCast = await this.tmdbGateway.fetchTvCredits(series.tmdbId);
        cast = tmdbCast.map((member) => ({
          id: member.id,
          name: member.name,
          character: member.character,
          profileUrl: member.profileUrl,
        }));
      } catch {
        cast = [];
      }
    }

    let resume: SeriesResumeDto | undefined;
    if (userId) {
      resume = await this.getUserSeriesResume(userId, series.id);
    } else if (currentSeasonEpisodes.length > 0) {
      const firstEpisode = currentSeasonEpisodes[0];
      resume = {
        episodeId: firstEpisode.id,
        seasonNumber: firstEpisode.seasonNumber,
        episodeNumber: firstEpisode.episodeNumber,
        episodeTitle: firstEpisode.title,
        progressSeconds: 0,
        durationSeconds: firstEpisode.duration * 60,
        progressPercentage: 0,
        isResume: false,
        label: `Reproducir T${firstEpisode.seasonNumber}:E${firstEpisode.episodeNumber}`,
      };
    }

    return {
      id: series.id,
      tmdbId: series.tmdbId,
      title: series.title,
      originalTitle: series.originalTitle,
      synopsis: series.synopsis,
      posterUrl: series.posterUrl,
      backdropUrl: series.backdropUrl,
      releaseYear: series.releaseYear,
      rating: series.rating,
      qualityBadge: series.qualityBadge,
      genres: series.genres,
      totalSeasons: seasons.length,
      seasons: seasonsSummary,
      currentSeasonEpisodes,
      cast,
      resume,
    };
  }

  /**
   * Carga bajo demanda los episodios de una temporada específica enriquecidos con el progreso
   * de visualización del usuario. Si la temporada aún es un esqueleto sin episodios, la sincroniza desde TMDB.
   *
   * @param seriesId UUID de la serie en PostgreSQL.
   * @param seasonNumberOrId Número de temporada (`1, 2...`) o UUID de la temporada.
   * @param userId UUID opcional del usuario autenticado.
   * @returns Lista ordenada de `EpisodeDto`.
   */
  public async getSeasonEpisodes(
    seriesId: string,
    seasonNumberOrId: number | string,
    userId?: string
  ): Promise<EpisodeDto[]> {
    const seasons = await this.seriesRepository.findSeasonsBySeriesId(seriesId);

    let targetSeason = seasons.find((season) =>
      typeof seasonNumberOrId === "number"
        ? season.seasonNumber === seasonNumberOrId
        : season.id === seasonNumberOrId ||
          season.seasonNumber === Number(seasonNumberOrId)
    );

    if (!targetSeason && seasons.length > 0) {
      targetSeason = seasons[0];
    }

    if (!targetSeason) return [];

    let episodes =
      targetSeason.episodes.length > 0
        ? targetSeason.episodes
        : await this.seriesRepository.findEpisodesBySeasonId(targetSeason.id);

    if (episodes.length === 0) {
      const series = await this.seriesRepository.findSeriesById(seriesId);
      if (series && series.tmdbId) {
        try {
          const tmdbSeason = await this.tmdbGateway.fetchTvSeason(
            series.tmdbId,
            targetSeason.seasonNumber
          );
          if (tmdbSeason.episodes.length > 0) {
            await this.seriesRepository.upsertSeries({
              tmdbId: series.tmdbId,
              title: series.title,
              synopsis: series.synopsis,
              posterUrl: series.posterUrl,
              releaseYear: series.releaseYear,
              rating: series.rating,
              seasons: [
                {
                  seasonNumber: targetSeason.seasonNumber,
                  title: tmdbSeason.title,
                  overview: tmdbSeason.overview,
                  posterUrl: tmdbSeason.posterUrl,
                  episodes: tmdbSeason.episodes.map((episode) => ({
                    episodeNumber: episode.episodeNumber,
                    title: episode.title,
                    overview: episode.overview,
                    duration: episode.duration,
                    thumbnailUrl: episode.thumbnailUrl,
                  })),
                },
              ],
            });
            episodes = await this.seriesRepository.findEpisodesBySeasonId(
              targetSeason.id
            );
          }
        } catch (error) {
          console.error(
            `[SeriesService] Error cargando temporada ${targetSeason.seasonNumber} de TMDB:`,
            error
          );
        }
      }
    }

    let progressByEpisodeId = new Map<string, WatchHistory>();
    if (userId && episodes.length > 0) {
      const episodeIds = episodes.map((episode) => episode.id);
      progressByEpisodeId =
        await this.historyRepository.findSeriesEpisodesProgress(
          userId,
          episodeIds
        );
    }

    return episodes.map((episode) => {
      const historyRecord = progressByEpisodeId.get(episode.id);
      return {
        id: episode.id,
        seasonId: episode.seasonId,
        seasonNumber: targetSeason!.seasonNumber,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        overview: episode.overview,
        duration: episode.duration,
        videoUrl: episode.videoUrl,
        thumbnailUrl: episode.thumbnailUrl,
        introStart: episode.introStart,
        introEnd: episode.introEnd,
        progressSeconds: historyRecord ? historyRecord.progressSeconds : 0,
        progressPercentage: historyRecord
          ? historyRecord.getProgressPercentage()
          : 0,
        completed: historyRecord ? historyRecord.completed : false,
      };
    });
  }

  /**
   * Determina la acción del botón principal de reproducción inteligente (`Smart CTA`):
   * 1. Si el usuario nunca vio la serie -> Apunta a `T1:E1` (`"Reproducir T1:E1"`).
   * 2. Si dejó un episodio en curso -> Apunta a ese episodio en el segundo exacto (`"Continuar T1:E3"`).
   * 3. Si completó un episodio -> Apunta automáticamente al siguiente capítulo (`"Ver T1:E4"`).
   *
   * Nota de rendimiento: Reutiliza directamente `season.episodes` devueltos por `findSeasonsBySeriesId`
   * evitando consultas N+1 por cada temporada.
   *
   * @param userId UUID del usuario autenticado.
   * @param seriesId UUID de la serie.
   * @returns Objeto `SeriesResumeDto`.
   */
  public async getUserSeriesResume(
    userId: string,
    seriesId: string
  ): Promise<SeriesResumeDto> {
    const seasons = await this.seriesRepository.findSeasonsBySeriesId(seriesId);

    interface FlattenedEpisodeItem {
      id: string;
      seasonNumber: number;
      episodeNumber: number;
      title: string;
      durationMinutes: number;
    }

    const flatEpisodes: FlattenedEpisodeItem[] = [];
    for (const season of seasons) {
      for (const episode of season.episodes) {
        flatEpisodes.push({
          id: episode.id,
          seasonNumber: season.seasonNumber,
          episodeNumber: episode.episodeNumber,
          title: episode.title,
          durationMinutes: episode.duration,
        });
      }
    }

    if (flatEpisodes.length === 0) {
      return {
        episodeId: "",
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: "Episodio 1",
        progressSeconds: 0,
        durationSeconds: 2700,
        progressPercentage: 0,
        isResume: false,
        label: "Reproducir T1:E1",
      };
    }

    const firstEpisode = flatEpisodes[0];
    const buildStartFromEpisodeResume = (
      targetEpisode: FlattenedEpisodeItem,
      actionVerb: string = "Reproducir"
    ): SeriesResumeDto => ({
      episodeId: targetEpisode.id,
      seasonNumber: targetEpisode.seasonNumber,
      episodeNumber: targetEpisode.episodeNumber,
      episodeTitle: targetEpisode.title,
      progressSeconds: 0,
      durationSeconds: targetEpisode.durationMinutes * 60,
      progressPercentage: 0,
      isResume: false,
      label: `${actionVerb} T${targetEpisode.seasonNumber}:E${targetEpisode.episodeNumber}`,
    });

    if (!userId) {
      return buildStartFromEpisodeResume(firstEpisode, "Reproducir");
    }

    const userHistory = await this.historyRepository.findUserSeriesHistory(
      userId,
      seriesId
    );

    if (!userHistory || userHistory.length === 0) {
      return buildStartFromEpisodeResume(firstEpisode, "Reproducir");
    }

    const latestRecord = userHistory[0];
    const currentEpisodeIndex = flatEpisodes.findIndex(
      (episode) => episode.id === latestRecord.episodeId
    );

    if (currentEpisodeIndex === -1) {
      return buildStartFromEpisodeResume(firstEpisode, "Reproducir");
    }

    const currentEpisode = flatEpisodes[currentEpisodeIndex];

    if (!latestRecord.completed && latestRecord.progressSeconds > 15) {
      return {
        episodeId: currentEpisode.id,
        seasonNumber: currentEpisode.seasonNumber,
        episodeNumber: currentEpisode.episodeNumber,
        episodeTitle: currentEpisode.title,
        progressSeconds: latestRecord.progressSeconds,
        durationSeconds: latestRecord.durationSeconds,
        progressPercentage: latestRecord.getProgressPercentage(),
        isResume: true,
        label: `Continuar T${currentEpisode.seasonNumber}:E${currentEpisode.episodeNumber}`,
      };
    }

    const nextEpisodeIndex = currentEpisodeIndex + 1;
    if (nextEpisodeIndex < flatEpisodes.length) {
      const nextEpisode = flatEpisodes[nextEpisodeIndex];
      return buildStartFromEpisodeResume(nextEpisode, "Ver");
    }

    return {
      episodeId: currentEpisode.id,
      seasonNumber: currentEpisode.seasonNumber,
      episodeNumber: currentEpisode.episodeNumber,
      episodeTitle: currentEpisode.title,
      progressSeconds: 0,
      durationSeconds: currentEpisode.durationMinutes * 60,
      progressPercentage: 100,
      isResume: false,
      label: `Volver a ver T${currentEpisode.seasonNumber}:E${currentEpisode.episodeNumber}`,
    };
  }

  /**
   * Obtiene los datos completos de reproducción de un episodio (`EpisodePlaybackDto`),
   * incluyendo navegación al capítulo anterior/siguiente, lista de temporadas y streams firmados.
   *
   * @param episodeId UUID del episodio a reproducir.
   * @param userId UUID opcional del usuario autenticado.
   * @returns Objeto `EpisodePlaybackDto` o `null` si el episodio no existe.
   */
  public async getEpisodePlaybackData(
    episodeId: string,
    userId?: string
  ): Promise<EpisodePlaybackDto | null> {
    const hierarchy =
      await this.seriesRepository.findEpisodeHierarchy(episodeId);
    if (!hierarchy) return null;

    const {
      episode,
      season: currentSeason,
      series,
      allSeasons: fullSeasons,
    } = hierarchy;

    interface FlattenedEpisodeNavigationItem {
      id: string;
      seasonNumber: number;
      episodeNumber: number;
      title: string;
      thumbnailUrl: string | null;
      duration: number;
    }

    const flatList: FlattenedEpisodeNavigationItem[] = [];
    const allSeasonsData: EpisodePlaybackDto["allSeasons"] = [];

    for (const seasonItem of fullSeasons) {
      allSeasonsData.push({
        seasonNumber: seasonItem.seasonNumber,
        title: seasonItem.title,
        episodes: seasonItem.episodes.map((ep) => ({
          id: ep.id,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          duration: ep.duration,
          thumbnailUrl: ep.thumbnailUrl,
        })),
      });

      for (const ep of seasonItem.episodes) {
        flatList.push({
          id: ep.id,
          seasonNumber: seasonItem.seasonNumber,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          thumbnailUrl: ep.thumbnailUrl,
          duration: ep.duration,
        });
      }
    }

    const currentIndex = flatList.findIndex((ep) => ep.id === episode.id);
    const nextEpisode =
      currentIndex >= 0 && currentIndex + 1 < flatList.length
        ? {
            id: flatList[currentIndex + 1].id,
            seasonNumber: flatList[currentIndex + 1].seasonNumber,
            episodeNumber: flatList[currentIndex + 1].episodeNumber,
            title: flatList[currentIndex + 1].title,
            thumbnailUrl: flatList[currentIndex + 1].thumbnailUrl,
          }
        : undefined;

    const previousEpisode =
      currentIndex > 0
        ? {
            id: flatList[currentIndex - 1].id,
            seasonNumber: flatList[currentIndex - 1].seasonNumber,
            episodeNumber: flatList[currentIndex - 1].episodeNumber,
            title: flatList[currentIndex - 1].title,
          }
        : undefined;

    const tmdbId = series.tmdbId;
    const seasonNumber = currentSeason.seasonNumber;
    const episodeNumber = episode.episodeNumber;

    const candidateMirrors: CandidateEpisodeMirror[] = [];

    // 1. Enlace directo videoUrl si fue cargado en el episodio
    if (episode.videoUrl && episode.videoUrl.trim() !== "") {
      const cleanVideoUrl = episode.videoUrl.trim();
      const videoBelongsToStreamwish = isStreamwish({ url: cleanVideoUrl });
      candidateMirrors.push({
        id: `ep-direct-${episode.id}`,
        serverName: videoBelongsToStreamwish
          ? "Streamwish-Lat"
          : "Direct-Video-Lat",
        language: "Latino",
        rawUrl: cleanVideoUrl,
        format: cleanVideoUrl.includes(".m3u8")
          ? MirrorFormat.HLS
          : MirrorFormat.EMBED,
        quality: "1080p",
        priority: videoBelongsToStreamwish ? 1 : 50,
      });
    }

    // 2. Mirrors persistidos en BD (si ya cuenta con un Streamwish directo o servidor extraíble limpio)
    const existingPlayableMirrors = episode.getPlayableMirrors();
    const hasDirectResolvedInDb = existingPlayableMirrors.some(
      (mirror) =>
        !isMultiEmbedAggregatorUrl(mirror.rawUrl) &&
        (isStreamwish({ serverName: mirror.serverName, url: mirror.rawUrl }) ||
          (FALLBACK_IF_EMPTY &&
            isExtractableCleanHost({
              serverName: mirror.serverName,
              url: mirror.rawUrl,
            })))
    );

    if (hasDirectResolvedInDb) {
      for (const mirror of existingPlayableMirrors) {
        candidateMirrors.push({
          id: `ep-${mirror.id}`,
          serverName: mirror.serverName,
          language: mirror.language,
          rawUrl: mirror.rawUrl,
          format: mirror.format,
          quality: mirror.quality,
          priority: mirror.priority,
        });
      }
    } else if (tmdbId && this.mirrorResolver) {
      const imdbId = await this.tmdbGateway.fetchTvImdbId(tmdbId);
      const resolvedMirrors =
        await this.mirrorResolver.resolveDefaultMirrorsForTvEpisode(
          tmdbId,
          seasonNumber,
          episodeNumber,
          imdbId
        );

      const hasNewlyResolvedDirect = resolvedMirrors.some(
        (mirror) =>
          isStreamwish({ serverName: mirror.serverName, url: mirror.rawUrl }) &&
          !isMultiEmbedAggregatorUrl(mirror.rawUrl)
      );

      let persistedEpisodeMirrors = existingPlayableMirrors;
      if (
        hasNewlyResolvedDirect ||
        (existingPlayableMirrors.length === 0 && resolvedMirrors.length > 0)
      ) {
        try {
          persistedEpisodeMirrors =
            await this.seriesRepository.saveEpisodeMirrors(
              episode.id,
              resolvedMirrors
            );
        } catch {
          // No interrumpir la reproducción si falla el guardado en caché
        }
      }

      if (persistedEpisodeMirrors.length > 0 && hasNewlyResolvedDirect) {
        for (const mirror of persistedEpisodeMirrors) {
          candidateMirrors.push({
            id: `ep-${mirror.id}`,
            serverName: mirror.serverName,
            language: mirror.language,
            rawUrl: mirror.rawUrl,
            format: mirror.format,
            quality: mirror.quality,
            priority: mirror.priority,
          });
        }
      } else {
        for (const mirror of resolvedMirrors) {
          candidateMirrors.push({
            serverName: mirror.serverName,
            language: mirror.language || "Latino",
            rawUrl: mirror.rawUrl,
            format: mirror.format,
            quality: mirror.quality || "1080p",
            priority: mirror.priority,
          });
        }
      }
    } else if (tmdbId) {
      const imdbId = await this.tmdbGateway.fetchTvImdbId(tmdbId);

      if (imdbId) {
        const paddedEpisode = String(episodeNumber).padStart(2, "0");
        const embed69EpisodeSlug = `${imdbId}-${seasonNumber}x${paddedEpisode}`;

        candidateMirrors.push(
          {
            serverName: "Embed69-Fallback-Lat",
            language: "Latino",
            rawUrl: `https://embed69.org/f/${embed69EpisodeSlug}?lang=LAT&prefer=streamwish`,
            format: MirrorFormat.EMBED,
            quality: "1080p",
            priority: 70,
          },
          {
            serverName: "Embed69-Fallback-Sub",
            language: "Inglés (Sub)",
            rawUrl: `https://embed69.org/f/${embed69EpisodeSlug}?lang=SUB&prefer=streamwish`,
            format: MirrorFormat.EMBED,
            quality: "1080p",
            priority: 71,
          }
        );
      }

      candidateMirrors.push({
        serverName: "Backup-Sub",
        language: "Inglés (Sub)",
        rawUrl: `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${seasonNumber}&episode=${episodeNumber}&ds_lang=es`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority: 99,
      });
    }

    const prioritizedMirrors = filterAndPrioritizeMirrors(candidateMirrors, {
      strictOnly: STRICT_STREAMWISH_ONLY,
      fallbackIfEmpty: FALLBACK_IF_EMPTY,
    });

    const ttlHours = Number(process.env.STREAM_TOKEN_TTL_HOURS || "4");
    const expiresAt = new Date(
      Date.now() + ttlHours * 3600 * 1000
    ).toISOString();

    const signedStreams: SignedMirrorStreamDto[] = prioritizedMirrors.map(
      ({ item: mirror, isStreamwish: belongsToSw, isDirty }, index) => {
        const mirrorId = mirror.id || `ep-${episode.id}-${index + 1}`;
        const encryptedToken = this.tokenCryptoService.encryptStreamToken({
          mirrorId,
          movieId: series.id,
          episodeId: episode.id,
          rawUrl: mirror.rawUrl,
          format: mirror.format,
          serverName: mirror.serverName,
          isStreamwish: belongsToSw,
          isDirty,
        });

        return {
          mirrorId,
          serverName: mirror.serverName,
          language: mirror.language,
          format: mirror.format,
          quality: mirror.quality,
          priority: index + 1,
          status: MirrorStatus.ACTIVE,
          streamUrl: `/api/stream/${encodeURIComponent(encryptedToken)}`,
          expiresAt,
          isStreamwish: belongsToSw,
          isDirty,
        };
      }
    );

    let savedProgressSeconds = 0;
    if (userId) {
      const historyRecord = await this.historyRepository.findEpisodeProgress(
        userId,
        episode.id
      );
      if (historyRecord && !historyRecord.completed) {
        savedProgressSeconds = historyRecord.progressSeconds;
      }
    }

    return {
      episodeId: episode.id,
      seriesId: series.id,
      seriesTitle: series.title,
      seasonNumber: currentSeason.seasonNumber,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
      overview: episode.overview,
      thumbnailUrl: episode.thumbnailUrl,
      introStart: episode.introStart,
      introEnd: episode.introEnd,
      durationSeconds: episode.duration * 60,
      savedProgressSeconds,
      streams: signedStreams,
      nextEpisode,
      previousEpisode,
      allSeasons: allSeasonsData,
    };
  }
}
