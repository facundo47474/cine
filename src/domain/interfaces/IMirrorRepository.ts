import { MirrorLink } from "../entities/MirrorLink";

export interface IMirrorRepository {
  findById(id: string): Promise<MirrorLink | null>;
  findByMovieId(movieId: string): Promise<MirrorLink[]>;
  findBatchForHealthCheck(limit: number): Promise<MirrorLink[]>;
  save(mirror: MirrorLink): Promise<void>;
}
