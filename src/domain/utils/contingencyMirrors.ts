import { CreateMirrorInput } from "../interfaces/IMovieRepository";
import { MirrorFormat } from "../enums/MirrorFormat";
import { extractHostname } from "./streamwishMatcher";

export type ContingencyMirrorInput = CreateMirrorInput & {
  language: string;
  quality: string;
};

/**
 * Política `sandbox` estricta para iframes de Piloto Plus en proveedores compatibles:
 * bloquea popups (`allow-popups`) y redirecciones de pestaña (`allow-top-navigation`).
 */
export const PLUS_STRICT_IFRAME_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-presentation";

/**
 * Proveedores embebidos verificados sin anuncios invasivos ni bloqueo anti-sandbox.
 */
export const SANDBOX_COMPATIBLE_EMBED_HOSTS: readonly string[] = [
  "cinesrc.st",
];

/**
 * Hosts de contingencia o agregadores rotos / colgados (Anubis PoW, HTTP 522, CAÍDOS o bloqueados en "Fetching data").
 */
export const BROKEN_OR_LEGACY_CONTINGENCY_HOSTS: readonly string[] = [
  "embedwave.cc",
  "embed69.org",
  "vidlink.pro",
  "vidsrc.cc",
  "autoembed.cc",
];

/**
 * Indica si una URL apunta a un reproductor externo compatible con `sandbox` estricto sin anuncios.
 */
export function isSandboxCompatibleEmbedUrl(rawUrl?: string | null): boolean {
  const host = extractHostname(rawUrl);
  if (!host) return false;
  return SANDBOX_COMPATIBLE_EMBED_HOSTS.some(
    (safeHost) => host === safeHost || host.endsWith(`.${safeHost}`)
  );
}

/**
 * Indica si una URL pertenece a un proveedor legado o roto que debe sustituirse
 * automáticamente por servidores de contingencia verificados.
 */
export function isBrokenOrLegacyContingencyUrl(rawUrl?: string | null): boolean {
  const host = extractHostname(rawUrl);
  if (!host) return false;
  return BROKEN_OR_LEGACY_CONTINGENCY_HOSTS.some(
    (brokenHost) => host === brokenHost || host.endsWith(`.${brokenHost}`)
  );
}

/**
 * Devuelve la URL del reproductor embebido limpio y compatible con `sandbox` estricto para Piloto Plus.
 */
export function getPlusCleanEmbedUrl(params: {
  mediaType: "MOVIE" | "SERIES";
  tmdbId: number;
  seasonNumber?: number;
  episodeNumber?: number;
}): string {
  if (params.mediaType === "SERIES") {
    const season = params.seasonNumber || 1;
    const episode = params.episodeNumber || 1;
    return `https://cinesrc.st/embed/tv/${params.tmdbId}?s=${season}&e=${episode}&color=E50914`;
  }
  return `https://cinesrc.st/embed/movie/${params.tmdbId}?color=E50914`;
}

/**
 * Devuelve la URL de contingencia principal verificada cuando fallan los agregadores locales.
 */
export function getPrimaryContingencyEmbedUrl(params: {
  mediaType: "MOVIE" | "SERIES";
  tmdbId: number;
  seasonNumber?: number;
  episodeNumber?: number;
}): string {
  return getPlusCleanEmbedUrl(params);
}

function buildContingencyMirror(
  serverName: string,
  language: "Latino" | "Inglés (Sub)",
  rawUrl: string,
  priority: number
): ContingencyMirrorInput {
  return {
    serverName,
    language,
    rawUrl,
    format: MirrorFormat.EMBED,
    quality: "1080p",
    priority,
    isStreamwish: false,
    isDirty: true,
  };
}

/**
 * Servidores de contingencia verificados para episodios de series de TV.
 */
export function buildTvEpisodeContingencyMirrors(
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number
): ContingencyMirrorInput[] {
  return [
    buildContingencyMirror(
      "CineSrc-Clean",
      "Inglés (Sub)",
      getPlusCleanEmbedUrl({
        mediaType: "SERIES",
        tmdbId,
        seasonNumber,
        episodeNumber,
      }),
      70
    ),
    buildContingencyMirror(
      "VidSrc-Sub",
      "Inglés (Sub)",
      `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${seasonNumber}&episode=${episodeNumber}&ds_lang=es`,
      80
    ),
    buildContingencyMirror(
      "VidFast-Sub",
      "Inglés (Sub)",
      `https://vidfast.pro/tv/${tmdbId}/${seasonNumber}/${episodeNumber}`,
      85
    ),
    buildContingencyMirror(
      "SuperEmbed-Sub",
      "Inglés (Sub)",
      `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${seasonNumber}&e=${episodeNumber}`,
      90
    ),
  ];
}

/**
 * Servidores de contingencia verificados para películas.
 */
export function buildMovieContingencyMirrors(
  tmdbId: number
): ContingencyMirrorInput[] {
  return [
    buildContingencyMirror(
      "CineSrc-Clean",
      "Inglés (Sub)",
      getPlusCleanEmbedUrl({
        mediaType: "MOVIE",
        tmdbId,
      }),
      70
    ),
    buildContingencyMirror(
      "VidSrc-Sub",
      "Inglés (Sub)",
      `https://vidsrc.me/embed/movie?tmdb=${tmdbId}&ds_lang=es`,
      80
    ),
    buildContingencyMirror(
      "VidFast-Sub",
      "Inglés (Sub)",
      `https://vidfast.pro/movie/${tmdbId}`,
      85
    ),
    buildContingencyMirror(
      "SuperEmbed-Sub",
      "Inglés (Sub)",
      `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
      90
    ),
  ];
}
