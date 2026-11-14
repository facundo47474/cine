import dns from "dns";
import { IMirrorResolver } from "@/domain/interfaces/IMirrorResolver";
import { CreateMirrorInput } from "@/domain/interfaces/IMovieRepository";
import { ITmdbGateway } from "@/domain/interfaces/ITmdbGateway";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import {
  FALLBACK_IF_EMPTY,
  STRICT_STREAMWISH_ONLY,
  extractHostname,
  filterAndPrioritizeMirrors,
  isExtractableCleanHost,
  isStreamwish,
} from "@/domain/utils/streamwishMatcher";
import {
  SeparatedLanguageSources,
  calculateServerPriorityWeight,
  extractCategorizedSourcesFromEmbed69,
} from "./Embed69Decoder";
import { extractCategorizedSourcesFromPlayLatin } from "./PlayLatinClient";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Silencioso en entornos donde no aplique
}

interface TaggedMirrorCandidate extends CreateMirrorInput {
  url: string;
}

/**
 * Resolver determinista de Mirrors centrado en Streamwish (`AutoEmbedMirrorResolver`):
 * - Desempaqueta agregadores multi-embed (`embed69.org` y `playlatinsrc.co`) en el servidor
 *   delegando en `Embed69Decoder` y `PlayLatinClient`.
 * - Reutiliza `ITmdbGateway` con caché LRU en memoria para resolver IDs de IMDb.
 * - Detecta universalmente cualquier dominio espejo de Streamwish mediante `streamwishMatcher`.
 * - Aplica `STRICT_STREAMWISH_ONLY` / `FALLBACK_IF_EMPTY` sin invertir prioridades.
 */
export class AutoEmbedMirrorResolver implements IMirrorResolver {
  constructor(private readonly tmdbGateway?: ITmdbGateway) {}

  /**
   * Obtiene el identificador IMDb (`tt...`) de una película usando `tmdbGateway` (con caché)
   * o haciendo una consulta directa de respaldo si no se inyectó el gateway.
   *
   * @param tmdbId Identificador numérico de TMDB.
   * @param imdbIdHint Pista opcional del ID de IMDb si ya fue obtenido previamente.
   * @returns Identificador IMDb (`tt1234567`) o `null`.
   */
  private async resolveMovieImdbId(
    tmdbId: number,
    imdbIdHint?: string | null
  ): Promise<string | null> {
    if (imdbIdHint && imdbIdHint.trim().startsWith("tt")) {
      return imdbIdHint.trim();
    }
    if (this.tmdbGateway) {
      return this.tmdbGateway.fetchMovieImdbId(tmdbId);
    }
    return null;
  }

  /**
   * Obtiene el identificador IMDb (`tt...`) de una serie de TV usando `tmdbGateway` (con caché).
   *
   * @param tmdbId Identificador numérico de TMDB de la serie.
   * @param imdbIdHint Pista opcional del ID de IMDb.
   * @returns Identificador IMDb (`tt1234567`) o `null`.
   */
  private async resolveTvImdbId(
    tmdbId: number,
    imdbIdHint?: string | null
  ): Promise<string | null> {
    if (imdbIdHint && imdbIdHint.trim().startsWith("tt")) {
      return imdbIdHint.trim();
    }
    if (this.tmdbGateway) {
      return this.tmdbGateway.fetchTvImdbId(tmdbId);
    }
    return null;
  }

  /**
   * Asigna un nombre descriptivo de servidor a partir de la URL y el sufijo de idioma (`Lat` o `Sub`).
   *
   * @param url URL del embed.
   * @param languageSuffix Sufijo de idioma (`"Lat"` o `"Sub"`).
   * @returns Nombre legible del servidor (ej. `"Streamwish-Lat"`, `"Vidhide-Lat"`).
   */
  private detectServerNameFromUrl(
    url: string,
    languageSuffix: "Lat" | "Sub"
  ): string {
    if (isStreamwish({ url })) {
      return `Streamwish-${languageSuffix}`;
    }
    const lowerUrl = url.toLowerCase();
    const host = extractHostname(url);
    if (lowerUrl.includes("mxdrop") || lowerUrl.includes("mixdrop")) {
      return `Mixdrop-${languageSuffix}`;
    }
    if (
      lowerUrl.includes("morencius") ||
      lowerUrl.includes("vidhide") ||
      lowerUrl.includes("filemoon")
    ) {
      return `Vidhide-${languageSuffix}`;
    }
    if (lowerUrl.includes("dood")) {
      return `Doodstream-${languageSuffix}`;
    }
    if (lowerUrl.includes("embed69.org")) {
      return `Embed69-Fallback-${languageSuffix}`;
    }
    if (host.includes("vidsrc")) {
      return `VidSrc-${languageSuffix}`;
    }
    return `Dropload-${languageSuffix}`;
  }

  /**
   * Construye la lista final priorizada de mirrors fusionando las fuentes extraídas de
   * `Embed69` y `PlayLatinSrc`, aplicando la política `STRICT_STREAMWISH_ONLY` / `FALLBACK_IF_EMPTY`.
   *
   * @param embed69Sources Fuentes categorizadas por idioma desde Embed69.
   * @param playLatinSources Fuentes categorizadas por idioma desde PlayLatinSrc.
   * @param multiEmbedFallbackLatUrl URL de respaldo en Embed69 para audio Latino.
   * @param multiEmbedFallbackSubUrl URL de respaldo en Embed69 para subtitulado.
   * @param emergencyBackupUrl URL de respaldo de último recurso (`vidsrc.me`).
   * @returns Lista priorizada de objetos `CreateMirrorInput`.
   */
  private buildPrioritizedMirrorList(
    embed69Sources: SeparatedLanguageSources,
    playLatinSources: SeparatedLanguageSources,
    multiEmbedFallbackLatUrl: string | null,
    multiEmbedFallbackSubUrl: string | null,
    emergencyBackupUrl: string
  ): CreateMirrorInput[] {
    const rawCandidates: TaggedMirrorCandidate[] = [];
    const seenUrls = new Set<string>();

    const registerMirrorCandidate = (
      rawUrl: string,
      serverName: string,
      language: "Latino" | "Inglés (Sub)",
      priority: number
    ) => {
      const trimmed = rawUrl.trim();
      if (!trimmed || seenUrls.has(trimmed)) return;
      seenUrls.add(trimmed);

      const belongsToStreamwish = isStreamwish({ serverName, url: trimmed });
      rawCandidates.push({
        serverName,
        language,
        rawUrl: trimmed,
        url: trimmed,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority,
        isStreamwish: belongsToStreamwish,
        isDirty: !belongsToStreamwish,
      });
    };

    // 1. PRIORIDAD ABSOLUTA: Mirrors verificados de Streamwish (Latino -> Subtitulado)
    const allStreamwishLat = Array.from(
      new Set([
        ...embed69Sources.streamwishLat,
        ...playLatinSources.streamwishLat,
      ])
    );
    allStreamwishLat.forEach((url, index) => {
      registerMirrorCandidate(
        url,
        index === 0 ? "Streamwish-Lat" : `Streamwish-Lat-${index + 1}`,
        "Latino",
        index + 1
      );
    });

    const allStreamwishSub = Array.from(
      new Set([
        ...embed69Sources.streamwishSub,
        ...playLatinSources.streamwishSub,
      ])
    );
    allStreamwishSub.forEach((url, index) => {
      registerMirrorCandidate(
        url,
        index === 0 ? "Streamwish-Sub" : `Streamwish-Sub-${index + 1}`,
        "Inglés (Sub)",
        20 + index
      );
    });

    // 2. CONTINGENCIA: Servidores alternativos ordenados por peso de prioridad
    const rawFallbackLat = Array.from(
      new Set([...embed69Sources.fallbackLat, ...playLatinSources.fallbackLat])
    ).sort(
      (a, b) =>
        calculateServerPriorityWeight(undefined, a) -
        calculateServerPriorityWeight(undefined, b)
    );
    const rawFallbackSub = Array.from(
      new Set([...embed69Sources.fallbackSub, ...playLatinSources.fallbackSub])
    ).sort(
      (a, b) =>
        calculateServerPriorityWeight(undefined, a) -
        calculateServerPriorityWeight(undefined, b)
    );

    const hasExtractableAnywhere =
      allStreamwishLat.length > 0 ||
      allStreamwishSub.length > 0 ||
      rawFallbackLat.some((url) => isExtractableCleanHost({ url })) ||
      rawFallbackSub.some((url) => isExtractableCleanHost({ url }));

    const filteredFallbackLat = hasExtractableAnywhere
      ? rawFallbackLat.filter((url) => isExtractableCleanHost({ url }))
      : rawFallbackLat;
    const filteredFallbackSub = hasExtractableAnywhere
      ? rawFallbackSub.filter((url) => isExtractableCleanHost({ url }))
      : rawFallbackSub;

    filteredFallbackLat.forEach((url, index) => {
      registerMirrorCandidate(
        url,
        this.detectServerNameFromUrl(url, "Lat"),
        "Latino",
        50 + index
      );
    });

    if (
      !hasExtractableAnywhere &&
      allStreamwishLat.length === 0 &&
      filteredFallbackLat.length === 0 &&
      multiEmbedFallbackLatUrl
    ) {
      registerMirrorCandidate(
        multiEmbedFallbackLatUrl,
        "Embed69-Fallback-Lat",
        "Latino",
        70
      );
    }

    filteredFallbackSub.forEach((url, index) => {
      registerMirrorCandidate(
        url,
        this.detectServerNameFromUrl(url, "Sub"),
        "Inglés (Sub)",
        80 + index
      );
    });

    if (
      !hasExtractableAnywhere &&
      allStreamwishSub.length === 0 &&
      filteredFallbackSub.length === 0 &&
      multiEmbedFallbackSubUrl
    ) {
      registerMirrorCandidate(
        multiEmbedFallbackSubUrl,
        "Embed69-Fallback-Sub",
        "Inglés (Sub)",
        90
      );
    }

    if (!hasExtractableAnywhere) {
      registerMirrorCandidate(emergencyBackupUrl, "Backup-En", "Inglés (Sub)", 99);
    }

    const prioritizedList = filterAndPrioritizeMirrors(rawCandidates, {
      strictOnly: STRICT_STREAMWISH_ONLY,
      fallbackIfEmpty: FALLBACK_IF_EMPTY,
    });

    return prioritizedList.map(({ item, isStreamwish: sw, isDirty }, idx) => ({
      serverName: item.serverName,
      language: item.language,
      rawUrl: item.rawUrl,
      format: item.format,
      quality: item.quality,
      priority: idx + 1,
      isStreamwish: sw,
      isDirty,
    }));
  }

  /**
   * Resuelve y prioriza los mirrors por defecto para una película de TMDB.
   *
   * @param tmdbId ID numérico de TMDB de la película.
   * @param _title Título de la película (opcional).
   * @param _releaseYear Año de estreno (opcional).
   * @param imdbIdHint ID de IMDb (`tt...`) si ya se conoce.
   * @returns Lista de mirrors listos para almacenar en PostgreSQL.
   */
  public async resolveDefaultMirrorsForTmdb(
    tmdbId: number,
    _title?: string,
    _releaseYear?: number,
    imdbIdHint?: string | null
  ): Promise<CreateMirrorInput[]> {
    const imdbId = await this.resolveMovieImdbId(tmdbId, imdbIdHint);

    let embed69Sources: SeparatedLanguageSources = {
      streamwishLat: [],
      streamwishSub: [],
      fallbackLat: [],
      fallbackSub: [],
    };
    let playLatinSources: SeparatedLanguageSources = {
      streamwishLat: [],
      streamwishSub: [],
      fallbackLat: [],
      fallbackSub: [],
    };

    if (imdbId) {
      [embed69Sources, playLatinSources] = await Promise.all([
        extractCategorizedSourcesFromEmbed69(imdbId),
        extractCategorizedSourcesFromPlayLatin(imdbId, false),
      ]);
    }

    return this.buildPrioritizedMirrorList(
      embed69Sources,
      playLatinSources,
      imdbId
        ? `https://embed69.org/f/${imdbId}?lang=LAT&prefer=streamwish`
        : null,
      imdbId
        ? `https://embed69.org/f/${imdbId}?lang=SUB&prefer=streamwish`
        : null,
      `https://vidsrc.me/embed/movie?tmdb=${tmdbId}&ds_lang=es`
    );
  }

  /**
   * Resuelve y prioriza los mirrors por defecto para un capítulo de una serie de TV.
   *
   * @param tmdbId ID numérico de TMDB de la serie.
   * @param seasonNumber Número de temporada (`1, 2...`).
   * @param episodeNumber Número de episodio (`1, 2...`).
   * @param imdbIdHint ID de IMDb (`tt...`) de la serie si ya se conoce.
   * @returns Lista de mirrors listos para almacenar en PostgreSQL.
   */
  public async resolveDefaultMirrorsForTvEpisode(
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number,
    imdbIdHint?: string | null
  ): Promise<CreateMirrorInput[]> {
    const imdbId = await this.resolveTvImdbId(tmdbId, imdbIdHint);
    let embed69EpisodeSlug: string | null = null;

    let embed69Sources: SeparatedLanguageSources = {
      streamwishLat: [],
      streamwishSub: [],
      fallbackLat: [],
      fallbackSub: [],
    };
    let playLatinSources: SeparatedLanguageSources = {
      streamwishLat: [],
      streamwishSub: [],
      fallbackLat: [],
      fallbackSub: [],
    };

    if (imdbId) {
      const paddedEpisode = String(episodeNumber).padStart(2, "0");
      embed69EpisodeSlug = `${imdbId}-${seasonNumber}x${paddedEpisode}`;

      [embed69Sources, playLatinSources] = await Promise.all([
        extractCategorizedSourcesFromEmbed69(embed69EpisodeSlug),
        extractCategorizedSourcesFromPlayLatin(
          imdbId,
          true,
          seasonNumber,
          episodeNumber
        ),
      ]);
    }

    return this.buildPrioritizedMirrorList(
      embed69Sources,
      playLatinSources,
      embed69EpisodeSlug
        ? `https://embed69.org/f/${embed69EpisodeSlug}?lang=LAT&prefer=streamwish`
        : null,
      embed69EpisodeSlug
        ? `https://embed69.org/f/${embed69EpisodeSlug}?lang=SUB&prefer=streamwish`
        : null,
      `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${seasonNumber}&episode=${episodeNumber}&ds_lang=es`
    );
  }
}
