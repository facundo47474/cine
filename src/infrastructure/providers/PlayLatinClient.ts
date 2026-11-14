import {
  FALLBACK_IF_EMPTY,
  STRICT_STREAMWISH_ONLY,
  filterAndPrioritizeMirrors,
  isStreamwish,
  normalizeStreamwishEmbedUrl,
} from "@/domain/utils/streamwishMatcher";
import {
  DEFAULT_SCRAPER_USER_AGENT,
  SeparatedLanguageSources,
  calculateServerPriorityWeight,
} from "./Embed69Decoder";

/**
 * Cliente unificado para el agregador secundario `playlatinsrc.co`.
 *
 * Centraliza la extracción del token dinámico `data-resolve-token` y la consulta
 * al endpoint `POST https://playlatinsrc.co/api/resolve` tanto para películas
 * (`/custom/movie/{imdbId}`) como para episodios de series (`/custom/serial/{imdbId}/{season}/{episode}`).
 */

export interface PlayLatinSourceEntry {
  url?: string;
  server?: string;
  name?: string;
  version?: string;
}

export interface PlayLatinResolveResponse {
  sources?: PlayLatinSourceEntry[];
}

export interface PlayLatinRankedSourceItem {
  serverName: string;
  url: string;
  version: string;
  priority: number;
  isStreamwish: boolean;
}

/**
 * Consulta la página de `playlatinsrc.co`, extrae el `data-resolve-token` y obtiene
 * el listado crudo de servidores desde `/api/resolve`.
 *
 * @param imdbId Identificador IMDb (`tt1234567`).
 * @param isTvEpisode Indica si se trata de un episodio de serie (`true`) o película (`false`).
 * @param seasonNumber Número de temporada (1 por defecto).
 * @param episodeNumber Número de episodio (1 por defecto).
 * @param timeoutMs Timeout máximo por petición HTTP.
 * @returns Arreglo de entradas `PlayLatinSourceEntry` válidas.
 */
export async function fetchRawPlayLatinSources(
  imdbId: string,
  isTvEpisode: boolean = false,
  seasonNumber: number = 1,
  episodeNumber: number = 1,
  timeoutMs: number = 4000
): Promise<PlayLatinSourceEntry[]> {
  try {
    const seasonSegment = String(seasonNumber);
    const episodeSegment = String(episodeNumber);
    const targetPageUrl = isTvEpisode
      ? `https://playlatinsrc.co/custom/serial/${imdbId}/${seasonSegment}/${episodeSegment}`
      : `https://playlatinsrc.co/custom/movie/${imdbId}`;

    const pageResponse = await fetch(targetPageUrl, {
      headers: {
        "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!pageResponse.ok) {
      return [];
    }

    const pageHtml = await pageResponse.text();
    const resolveTokenMatch = pageHtml.match(/data-resolve-token="([^"]+)"/);
    if (!resolveTokenMatch?.[1]) {
      return [];
    }

    const resolveResponse = await fetch("https://playlatinsrc.co/api/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: targetPageUrl,
        "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
      },
      body: JSON.stringify({
        type: isTvEpisode ? "tv" : "movie",
        id: imdbId,
        season: seasonSegment,
        episode: episodeSegment,
        mode: "custom",
        token: resolveTokenMatch[1],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resolveResponse.ok) {
      return [];
    }

    const payload = (await resolveResponse.json()) as PlayLatinResolveResponse;
    if (!Array.isArray(payload.sources)) {
      return [];
    }

    return payload.sources.filter(
      (source): source is PlayLatinSourceEntry =>
        Boolean(source.url && source.url.trim().startsWith("http"))
    );
  } catch {
    return [];
  }
}

/**
 * Extrae y clasifica por idioma todas las fuentes de `playlatinsrc.co`
 * separando mirrors de Streamwish de servidores alternativos.
 *
 * @param imdbId Identificador IMDb (`tt1234567`).
 * @param isTvEpisode `true` para series, `false` para películas.
 * @param seasonNumber Número de temporada.
 * @param episodeNumber Número de episodio.
 * @returns Fuentes categorizadas en `streamwishLat`, `streamwishSub`, `fallbackLat`, `fallbackSub`.
 */
export async function extractCategorizedSourcesFromPlayLatin(
  imdbId: string,
  isTvEpisode: boolean = false,
  seasonNumber: number = 1,
  episodeNumber: number = 1
): Promise<SeparatedLanguageSources> {
  const emptyResult: SeparatedLanguageSources = {
    streamwishLat: [],
    streamwishSub: [],
    fallbackLat: [],
    fallbackSub: [],
  };

  const validSources = await fetchRawPlayLatinSources(
    imdbId,
    isTvEpisode,
    seasonNumber,
    episodeNumber,
    4500
  );

  if (validSources.length === 0) {
    return emptyResult;
  }

  const sortSourcesByPriority = (entries: PlayLatinSourceEntry[]) =>
    [...entries].sort(
      (a, b) =>
        calculateServerPriorityWeight(a.server || a.name, a.url) -
        calculateServerPriorityWeight(b.server || b.name, b.url)
    );

  const classifyByVersionList = (
    targetVersions: string[],
    allowUntaggedInTv: boolean
  ) => {
    const matchingEntries = sortSourcesByPriority(
      validSources.filter((source) => {
        const versionTag = (source.version || "").toLowerCase();
        if (targetVersions.includes(versionTag)) return true;
        if (allowUntaggedInTv && isTvEpisode && !versionTag) return true;
        return false;
      })
    );

    const streamwishUrls: string[] = [];
    const fallbackUrls: string[] = [];

    for (const entry of matchingEntries) {
      if (!entry.url) continue;
      const belongsToStreamwish = isStreamwish({
        server: entry.server,
        name: entry.name,
        url: entry.url,
      });
      const normalizedUrl = belongsToStreamwish
        ? normalizeStreamwishEmbedUrl(entry.url)
        : entry.url.trim();

      if (belongsToStreamwish) {
        if (!streamwishUrls.includes(normalizedUrl)) {
          streamwishUrls.push(normalizedUrl);
        }
      } else if (!fallbackUrls.includes(normalizedUrl)) {
        fallbackUrls.push(normalizedUrl);
      }
    }

    return { streamwishUrls, fallbackUrls };
  };

  const latinoGroup = classifyByVersionList(["latino", "castellano"], true);
  const subtituladoGroup = classifyByVersionList(["subtitulado", "sub"], false);

  return {
    streamwishLat: latinoGroup.streamwishUrls,
    streamwishSub: subtituladoGroup.streamwishUrls,
    fallbackLat: latinoGroup.fallbackUrls,
    fallbackSub: subtituladoGroup.fallbackUrls,
  };
}

/**
 * Extrae las fuentes de `playlatinsrc.co` a partir de una URL o slug que contenga un ID de IMDb
 * (`tt1234567` o `tt1234567-1x01`), ordenadas por preferencia de idioma y prioridad de servidor.
 *
 * @param rawUrlOrSlug URL o cadena que incluye el identificador IMDb y opcionalmente `?lang=LAT|SUB`.
 * @param timeoutMs Timeout por petición HTTP.
 * @returns Lista ordenada de candidatos de embed.
 */
export async function resolveRankedEmbedsFromPlayLatinByUrl(
  rawUrlOrSlug: string,
  timeoutMs: number = 4000
): Promise<PlayLatinRankedSourceItem[]> {
  const tvSlugMatch = rawUrlOrSlug.match(/(tt\d+)-(\d+)x(\d+)/i);
  const movieIdMatch = rawUrlOrSlug.match(/(tt\d+)/i);

  if (!tvSlugMatch && !movieIdMatch) {
    return [];
  }

  const isTvEpisode = Boolean(tvSlugMatch);
  const imdbId = tvSlugMatch ? tvSlugMatch[1] : movieIdMatch![1];
  const seasonNumber = tvSlugMatch ? Number(tvSlugMatch[2]) : 1;
  const episodeNumber = tvSlugMatch ? Number(tvSlugMatch[3]) : 1;

  let requestedLang = "LAT";
  try {
    const parsedUrl = new URL(rawUrlOrSlug);
    requestedLang = (
      parsedUrl.searchParams.get("lang") || "LAT"
    ).toUpperCase();
  } catch {
    // Mantener LAT por defecto
  }

  const validSources = await fetchRawPlayLatinSources(
    imdbId,
    isTvEpisode,
    seasonNumber,
    episodeNumber,
    timeoutMs
  );

  if (validSources.length === 0) {
    return [];
  }

  const wantsSubtitled = requestedLang === "SUB" || requestedLang === "VOSE";

  const languageFilteredSources = validSources.filter((source) => {
    const versionTag = (source.version || "").toLowerCase();
    if (wantsSubtitled) {
      return versionTag === "subtitulado" || versionTag === "sub";
    }
    return (
      versionTag === "latino" ||
      versionTag === "castellano" ||
      (isTvEpisode && !versionTag)
    );
  });

  const candidatePool =
    languageFilteredSources.length > 0 ? languageFilteredSources : validSources;

  const sortedPool = [...candidatePool].sort(
    (a, b) =>
      calculateServerPriorityWeight(a.server || a.name, a.url) -
      calculateServerPriorityWeight(b.server || b.name, b.url)
  );

  return sortedPool.map((source, index) => {
    const rawUrl = source.url!.trim();
    const serverName = source.server || source.name || rawUrl;
    const belongsToStreamwish = isStreamwish({ serverName, url: rawUrl });
    const normalizedUrl = belongsToStreamwish
      ? normalizeStreamwishEmbedUrl(rawUrl)
      : rawUrl;

    return {
      serverName,
      url: normalizedUrl,
      version: source.version || "latino",
      priority:
        calculateServerPriorityWeight(serverName, normalizedUrl) * 100 +
        50 +
        index,
      isStreamwish: belongsToStreamwish,
    };
  });
}

/**
 * Resuelve el mejor enlace individual desde `playlatinsrc.co` aplicando la política
 * `STRICT_STREAMWISH_ONLY` y `FALLBACK_IF_EMPTY`.
 *
 * @param rawUrlOrSlug URL o slug que contiene el ID de IMDb.
 * @returns El enlace ganador y si pertenece a Streamwish, o `null` si no hay disponibles.
 */
export async function resolveBestEmbedFromPlayLatinByUrl(
  rawUrlOrSlug: string
): Promise<{ url: string; isStreamwish: boolean } | null> {
  const rankedItems = await resolveRankedEmbedsFromPlayLatinByUrl(
    rawUrlOrSlug,
    2800
  );

  if (rankedItems.length === 0) {
    return null;
  }

  const prioritized = filterAndPrioritizeMirrors(rankedItems, {
    strictOnly: STRICT_STREAMWISH_ONLY,
    fallbackIfEmpty: FALLBACK_IF_EMPTY,
  });

  if (prioritized.length === 0) {
    return null;
  }

  return {
    url: prioritized[0].item.url,
    isStreamwish: prioritized[0].isStreamwish,
  };
}
