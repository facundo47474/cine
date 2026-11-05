import { CreateMirrorInput } from "./IMovieRepository";

export interface IMirrorResolver {
  resolveDefaultMirrorsForTmdb(
    tmdbId: number,
    title?: string,
    releaseYear?: number
  ): Promise<CreateMirrorInput[]>;

  resolveDefaultMirrorsForTvEpisode(
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number,
    imdbIdHint?: string | null
  ): Promise<CreateMirrorInput[]>;
}