import { CreateMirrorInput } from "./IMovieRepository";

export interface IMirrorResolver {
  resolveDefaultMirrorsForTmdb(
    tmdbId: number,
    title?: string,
    releaseYear?: number
  ): Promise<CreateMirrorInput[]>;
}
