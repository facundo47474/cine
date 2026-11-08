import { ISeriesRepository } from "@/domain/interfaces/ISeriesRepository";
import { IWatchHistoryRepository } from "@/domain/interfaces/IWatchHistoryRepository";
import { ITmdbGateway } from "@/domain/interfaces/ITmdbGateway";
import { ITokenCryptoService } from "@/domain/interfaces/ITokenCryptoService";
import { IMirrorResolver } from "@/domain/interfaces/IMirrorResolver";
import { SignedMirrorStreamDto } from "../dto/PlaybackStreamDto";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { MirrorStatus } from "@/domain/enums/MirrorStatus";
import {
  SeriesDetailsDto,
  SeasonSummaryDto,
  EpisodeDto,
  SeriesResumeDto,
  CastMemberDto,
  EpisodePlaybackDto,
} from "../dto/SeriesDto";

export class SeriesService {
  constructor(
    private readonly seriesRepository: ISeriesRepository,
    private readonly historyRepository: IWatchHistoryRepository,
    private readonly tmdbGateway: ITmdbGateway,
    private readonly tokenCryptoService: ITokenCryptoService,
    private readonly mirrorResolver?: IMirrorResolver
  ) {}

  /**
   * Obtiene los detalles completos de una serie (con temporadas, episodios de T1, elenco y resume)
   */
  public async getSeriesDetails(
    slugOrId: string,
    userId?: string
  ): Promise<SeriesDetailsDto | null> {
    let details = await this.seriesRepository.findSeriesDetails(slugOrId);

    let preloadedCast: CastMemberDto[] = [];

    // Si no está en BD (o quedó sin temporadas cargadas) y tenemos un ID de TMDB, lo importamos automáticamente de TMDB
    if (!details || details.seasons.length === 0) {
      let tmdbId: number | null = details?.series.tmdbId ?? null;
      if (!tmdbId) {
        if (slugOrId.startsWith("tmdb-")) {
          tmdbId = Number(slugOrId.replace("tmdb-", ""));
        } else if (!isNaN(Number(slugOrId))) {
          tmdbId = Number(slugOrId);
        }
      }

      if (tmdbId && tmdbId > 0) {
        try {
          // Cargamos metadatos de TV, temporada 1 y elenco en paralelo para máxima velocidad
          const [tvMeta, s1Details, tmdbCast] = await Promise.all([
            this.tmdbGateway.fetchTvMetadata(tmdbId),
            this.tmdbGateway.fetchTvSeason(tmdbId, 1),
            this.tmdbGateway.fetchTvCredits(tmdbId),
          ]);

          preloadedCast = tmdbCast.map((c) => ({
            id: c.id,
            name: c.name,
            character: c.character,
            profileUrl: c.profileUrl,
          }));

          // Construimos el upsert inicial
          details = await this.seriesRepository.upsertSeries({
            tmdbId,
            title: tvMeta.title,
            originalTitle: tvMeta.originalTitle,
            synopsis: tvMeta.synopsis,
            posterUrl: tvMeta.posterUrl,
            backdropUrl: tvMeta.backdropUrl,
            releaseYear: tvMeta.releaseYear,
            rating: tvMeta.rating,
            qualityBadge: "HD",
            genres: tvMeta.genres,
            seasons: [
              {
                seasonNumber: s1Details.seasonNumber,
                title: s1Details.title,
                overview: s1Details.overview,
                posterUrl: s1Details.posterUrl,
                episodes: s1Details.episodes.map((ep) => ({
                  episodeNumber: ep.episodeNumber,
                  title: ep.title,
                  overview: ep.overview,
                  duration: ep.duration,
                  thumbnailUrl: ep.thumbnailUrl,
                })),
              },
              // Si hay más temporadas en los metadatos, creamos temporadas esqueleto
              ...tvMeta.seasons
                .filter((s) => s.seasonNumber !== s1Details.seasonNumber)
                .map((s) => ({
                  seasonNumber: s.seasonNumber,
                  title: s.title,
                  overview: s.overview,
                  posterUrl: s.posterUrl,
                  episodes: [],
                })),
            ],
          });
        } catch (error) {
          console.error(
            `[SeriesService] Error auto-importando serie TMDB #${tmdbId}:`,
            error
          );
          if (!details) {
            details = await this.seriesRepository.findSeriesDetails(slugOrId);
          }
        }
      }
    }

    if (!details) return null;

    const { series, seasons } = details;

    // Resumen liviano de temporadas
    const seasonsSummary: SeasonSummaryDto[] = seasons.map((s) => ({
      id: s.id,
      seasonNumber: s.seasonNumber,
      title: s.title,
      overview: s.overview,
      posterUrl: s.posterUrl,
      episodeCount: s.episodes.length,
    }));

    // Temporada por defecto (primera disponible, usualmente Season 1)
    const defaultSeason = seasons[0];
    let currentSeasonEpisodes: EpisodeDto[] = [];

    if (defaultSeason) {
      currentSeasonEpisodes = await this.getSeasonEpisodes(
        series.id,
        defaultSeason.seasonNumber,
        userId
      );
    }

    // Elenco desde TMDB (reusamos preloadedCast si se acaba de importar)
    let cast: CastMemberDto[] = preloadedCast;
    if (cast.length === 0 && series.tmdbId) {
      try {
        const tmdbCast = await this.tmdbGateway.fetchTvCredits(series.tmdbId);
        cast = tmdbCast.map((c) => ({
          id: c.id,
          name: c.name,
          character: c.character,
          profileUrl: c.profileUrl,
        }));
      } catch {
        cast = [];
      }
    }

    // Punto de reanudación inteligente para el botón CTA
    let resume: SeriesResumeDto | undefined;
    if (userId) {
      resume = await this.getUserSeriesResume(userId, series.id);
    } else if (currentSeasonEpisodes.length > 0) {
      const firstEp = currentSeasonEpisodes[0];
      resume = {
        episodeId: firstEp.id,
        seasonNumber: firstEp.seasonNumber,
        episodeNumber: firstEp.episodeNumber,
        episodeTitle: firstEp.title,
        progressSeconds: 0,
        durationSeconds: firstEp.duration * 60,
        progressPercentage: 0,
        isResume: false,
        label: `Reproducir T${firstEp.seasonNumber}:E${firstEp.episodeNumber}`,
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
   * Carga bajo demanda los episodios de una temporada específica con el progreso del usuario
   */
  public async getSeasonEpisodes(
    seriesId: string,
    seasonNumberOrId: number | string,
    userId?: string
  ): Promise<EpisodeDto[]> {
    const seasons = await this.seriesRepository.findSeasonsBySeriesId(seriesId);

    let targetSeason = seasons.find((s) =>
      typeof seasonNumberOrId === "number"
        ? s.seasonNumber === seasonNumberOrId
        : s.id === seasonNumberOrId || s.seasonNumber === Number(seasonNumberOrId)
    );

    if (!targetSeason && seasons.length > 0) {
      targetSeason = seasons[0];
    }

    if (!targetSeason) return [];

    // Si la temporada existe pero aún no tiene episodios en BD y tenemos tmdbId, la cargamos desde TMDB
    let episodes = await this.seriesRepository.findEpisodesBySeasonId(
      targetSeason.id
    );

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
                  episodes: tmdbSeason.episodes.map((ep) => ({
                    episodeNumber: ep.episodeNumber,
                    title: ep.title,
                    overview: ep.overview,
                    duration: ep.duration,
                    thumbnailUrl: ep.thumbnailUrl,
                  })),
                },
              ],
            });
            episodes = await this.seriesRepository.findEpisodesBySeasonId(
              targetSeason.id
            );
          }
        } catch (e) {
          console.error(
            `[SeriesService] Error cargando temporada ${targetSeason.seasonNumber} de TMDB:`,
            e
          );
        }
      }
    }

    // Progreso del usuario
    let progressMap = new Map<string, any>();
    if (userId && episodes.length > 0) {
      const episodeIds = episodes.map((e) => e.id);
      progressMap = await this.historyRepository.findSeriesEpisodesProgress(
        userId,
        episodeIds
      );
    }

    return episodes.map((ep) => {
      const history = progressMap.get(ep.id);
      return {
        id: ep.id,
        seasonId: ep.seasonId,
        seasonNumber: targetSeason!.seasonNumber,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        overview: ep.overview,
        duration: ep.duration,
        videoUrl: ep.videoUrl,
        thumbnailUrl: ep.thumbnailUrl,
        introStart: ep.introStart,
        introEnd: ep.introEnd,
        progressSeconds: history ? history.progressSeconds : 0,
        progressPercentage: history ? history.getProgressPercentage() : 0,
        completed: history ? history.completed : false,
      };
    });
  }

  /**
   * Determina la acción del botón principal de reproducción inteligente (Smart CTA):
   * 1. Si nunca vio la serie -> Apunta a T1:E1 ("Reproducir T1:E1")
   * 2. Si dejó un episodio a mitad -> Apunta a ese episodio en el segundo exacto ("Continuar viendo T1:E3")
   * 3. Si terminó un episodio -> Apunta automáticamente al siguiente episodio ("Ver T1:E4")
   */
  public async getUserSeriesResume(
    userId: string,
    seriesId: string
  ): Promise<SeriesResumeDto> {
    const seasons = await this.seriesRepository.findSeasonsBySeriesId(seriesId);

    interface FlatEpisode {
      id: string;
      seasonNumber: number;
      episodeNumber: number;
      title: string;
      durationMinutes: number;
    }

    const flatEpisodes: FlatEpisode[] = [];
    for (const season of seasons) {
      const eps = await this.seriesRepository.findEpisodesBySeasonId(season.id);
      for (const ep of eps) {
        flatEpisodes.push({
          id: ep.id,
          seasonNumber: season.seasonNumber,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          durationMinutes: ep.duration,
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

    const firstEp = flatEpisodes[0];

    if (!userId) {
      return {
        episodeId: firstEp.id,
        seasonNumber: firstEp.seasonNumber,
        episodeNumber: firstEp.episodeNumber,
        episodeTitle: firstEp.title,
        progressSeconds: 0,
        durationSeconds: firstEp.durationMinutes * 60,
        progressPercentage: 0,
        isResume: false,
        label: `Reproducir T${firstEp.seasonNumber}:E${firstEp.episodeNumber}`,
      };
    }

    const userHistory = await this.historyRepository.findUserSeriesHistory(
      userId,
      seriesId
    );

    if (!userHistory || userHistory.length === 0) {
      return {
        episodeId: firstEp.id,
        seasonNumber: firstEp.seasonNumber,
        episodeNumber: firstEp.episodeNumber,
        episodeTitle: firstEp.title,
        progressSeconds: 0,
        durationSeconds: firstEp.durationMinutes * 60,
        progressPercentage: 0,
        isResume: false,
        label: `Reproducir T${firstEp.seasonNumber}:E${firstEp.episodeNumber}`,
      };
    }

    const latestRecord = userHistory[0];
    const currentEpIndex = flatEpisodes.findIndex(
      (e) => e.id === latestRecord.episodeId
    );

    if (currentEpIndex === -1) {
      return {
        episodeId: firstEp.id,
        seasonNumber: firstEp.seasonNumber,
        episodeNumber: firstEp.episodeNumber,
        episodeTitle: firstEp.title,
        progressSeconds: 0,
        durationSeconds: firstEp.durationMinutes * 60,
        progressPercentage: 0,
        isResume: false,
        label: `Reproducir T${firstEp.seasonNumber}:E${firstEp.episodeNumber}`,
      };
    }

    const currentEp = flatEpisodes[currentEpIndex];

    if (!latestRecord.completed && latestRecord.progressSeconds > 15) {
      return {
        episodeId: currentEp.id,
        seasonNumber: currentEp.seasonNumber,
        episodeNumber: currentEp.episodeNumber,
        episodeTitle: currentEp.title,
        progressSeconds: latestRecord.progressSeconds,
        durationSeconds: latestRecord.durationSeconds,
        progressPercentage: latestRecord.getProgressPercentage(),
        isResume: true,
        label: `Continuar T${currentEp.seasonNumber}:E${currentEp.episodeNumber}`,
      };
    }

    const nextEpIndex = currentEpIndex + 1;
    if (nextEpIndex < flatEpisodes.length) {
      const nextEp = flatEpisodes[nextEpIndex];
      return {
        episodeId: nextEp.id,
        seasonNumber: nextEp.seasonNumber,
        episodeNumber: nextEp.episodeNumber,
        episodeTitle: nextEp.title,
        progressSeconds: 0,
        durationSeconds: nextEp.durationMinutes * 60,
        progressPercentage: 0,
        isResume: false,
        label: `Ver T${nextEp.seasonNumber}:E${nextEp.episodeNumber}`,
      };
    }

    return {
      episodeId: currentEp.id,
      seasonNumber: currentEp.seasonNumber,
      episodeNumber: currentEp.episodeNumber,
      episodeTitle: currentEp.title,
      progressSeconds: 0,
      durationSeconds: currentEp.durationMinutes * 60,
      progressPercentage: 100,
      isResume: false,
      label: `Volver a ver T${currentEp.seasonNumber}:E${currentEp.episodeNumber}`,
    };
  }

  /**
   * Obtiene la información necesaria para reproducir un episodio en el reproductor de video
   */
  public async getEpisodePlaybackData(
    episodeId: string,
    userId?: string
  ): Promise<EpisodePlaybackDto | null> {
    const hierarchy = await this.seriesRepository.findEpisodeHierarchy(episodeId);
    if (!hierarchy) return null;

    const { episode, season: currentSeason, series, allSeasons: fullSeasons } = hierarchy;

    interface FlatEpItem {
      id: string;
      seasonNumber: number;
      episodeNumber: number;
      title: string;
      thumbnailUrl: string | null;
      duration: number;
    }

    const flatList: FlatEpItem[] = [];
    const allSeasonsData: EpisodePlaybackDto["allSeasons"] = [];

    for (const s of fullSeasons) {
      allSeasonsData.push({
        seasonNumber: s.seasonNumber,
        title: s.title,
        episodes: s.episodes.map((e) => ({
          id: e.id,
          episodeNumber: e.episodeNumber,
          title: e.title,
          duration: e.duration,
          thumbnailUrl: e.thumbnailUrl,
        })),
      });

      for (const e of s.episodes) {
        flatList.push({
          id: e.id,
          seasonNumber: s.seasonNumber,
          episodeNumber: e.episodeNumber,
          title: e.title,
          thumbnailUrl: e.thumbnailUrl,
          duration: e.duration,
        });
      }
    }

    const currentIndex = flatList.findIndex((e) => e.id === episode.id);
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
    const seasonNum = currentSeason.seasonNumber;
    const epNum = episode.episodeNumber;

    const candidateMirrors: {
      serverName: string;
      language: string;
      rawUrl: string;
      format: MirrorFormat;
      quality: string;
    }[] = [];

    // 1. Direct videoUrl si existe
    if (episode.videoUrl && episode.videoUrl.trim() !== "") {
      candidateMirrors.push({
        serverName: "Streamwish-Lat",
        language: "Latino",
        rawUrl: episode.videoUrl,
        format: episode.videoUrl.includes(".m3u8") ? MirrorFormat.HLS : MirrorFormat.EMBED,
        quality: "1080p",
      });
    }

    // 2. Mirrors de BD
    const existingPlayable = episode.getPlayableMirrors();
    const hasDirectResolvedInDb = existingPlayable.some(
      (m) =>
        !m.rawUrl.includes("embed69.org") &&
        !m.rawUrl.includes("vidsrc.me") &&
        /hglink\.to|audinifer\.com|vibuxer\.com|streamwish|mxdrop\.to|mixdrop|morencius\.com|vidhide|filemoon/i.test(
          m.rawUrl
        )
    );

    if (hasDirectResolvedInDb) {
      for (const mirror of existingPlayable) {
        candidateMirrors.push({
          serverName: mirror.serverName,
          language: mirror.language,
          rawUrl: mirror.rawUrl,
          format: mirror.format,
          quality: mirror.quality,
        });
      }
    } else if (tmdbId && this.mirrorResolver) {
      const imdbId = await this.tmdbGateway.fetchTvImdbId(tmdbId);
      const resolvedMirrors =
        await this.mirrorResolver.resolveDefaultMirrorsForTvEpisode(
          tmdbId,
          seasonNum,
          epNum,
          imdbId
        );

      const newlyResolvedDirect = resolvedMirrors.some(
        (m) =>
          !m.rawUrl.includes("embed69.org") && !m.rawUrl.includes("vidsrc.me")
      );

      if (newlyResolvedDirect || existingPlayable.length === 0) {
        try {
          await this.seriesRepository.saveEpisodeMirrors(
            episode.id,
            resolvedMirrors
          );
        } catch {
          // No bloquear reproducción si falla el guardado en caché
        }
      }

      for (const m of resolvedMirrors) {
        candidateMirrors.push({
          serverName: m.serverName,
          language: m.language || "Latino",
          rawUrl: m.rawUrl,
          format: m.format,
          quality: m.quality || "1080p",
        });
      }
    } else if (tmdbId) {
      const imdbId = await this.tmdbGateway.fetchTvImdbId(tmdbId);

      if (imdbId) {
        const paddedEp = String(epNum).padStart(2, "0");
        const embed69EpisodeSlug = `${imdbId}-${seasonNum}x${paddedEp}`;

        candidateMirrors.push(
          {
            serverName: "Streamwish-Lat",
            language: "Latino",
            rawUrl: `https://embed69.org/f/${embed69EpisodeSlug}?lang=LAT&prefer=streamwish`,
            format: MirrorFormat.EMBED,
            quality: "1080p",
          },
          {
            serverName: "Streamwish-Sub",
            language: "Inglés (Sub)",
            rawUrl: `https://embed69.org/f/${embed69EpisodeSlug}?lang=SUB&prefer=streamwish`,
            format: MirrorFormat.EMBED,
            quality: "1080p",
          }
        );
      }

      candidateMirrors.push({
        serverName: "Backup-Sub",
        language: "Inglés (Sub)",
        rawUrl: `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${seasonNum}&episode=${epNum}&ds_lang=es`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
      });
    }

    const ttlHours = Number(process.env.STREAM_TOKEN_TTL_HOURS || "4");
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

    const signedStreams: SignedMirrorStreamDto[] = candidateMirrors.map((m, idx) => {
      const mirrorId = `ep-${episode.id}-${idx + 1}`;
      const token = this.tokenCryptoService.encryptStreamToken({
        mirrorId,
        movieId: series.id,
        rawUrl: m.rawUrl,
        format: m.format,
      });

      return {
        mirrorId,
        serverName: m.serverName,
        language: m.language,
        format: m.format,
        quality: m.quality,
        priority: idx + 1,
        status: MirrorStatus.ACTIVE,
        streamUrl: `/api/stream/${encodeURIComponent(token)}`,
        expiresAt,
      };
    });

    let savedProgressSeconds = 0;
    if (userId) {
      const history = await this.historyRepository.findEpisodeProgress(
        userId,
        episode.id
      );
      if (history && !history.completed) {
        savedProgressSeconds = history.progressSeconds;
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
