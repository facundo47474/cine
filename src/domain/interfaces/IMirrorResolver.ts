import { CreateMirrorInput } from "./IMovieRepository";

/**
 * Contrato de servicio para resolver y priorizar enlaces mirror de video
 * a partir de identificadores de TMDB e IMDb.
 */
export interface IMirrorResolver {
  /**
   * Resuelve los enlaces mirror por defecto para una película de TMDB.
   */
  resolveDefaultMirrorsForTmdb(
    tmdbId: number,
    title?: string,
    releaseYear?: number,
    imdbIdHint?: string | null
  ): Promise<CreateMirrorInput[]>;

  /**
   * Resuelve los enlaces mirror por defecto para un capítulo específico de una serie de TV.
   */
  resolveDefaultMirrorsForTvEpisode(
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number,
    imdbIdHint?: string | null
  ): Promise<CreateMirrorInput[]>;
}
