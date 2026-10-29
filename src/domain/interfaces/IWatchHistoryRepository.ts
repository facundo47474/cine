import { WatchHistory } from "../entities/WatchHistory";
import { Movie } from "../entities/Movie";

export interface WatchHistoryWithMovie {
  history: WatchHistory;
  movie: Movie;
}

export interface SaveProgressInput {
  userId: string;
  movieId: string;
  progressSeconds: number;
  durationSeconds: number;
}

export interface IWatchHistoryRepository {
  findByUserId(userId: string, limit?: number): Promise<WatchHistoryWithMovie[]>;
  findMovieProgress(userId: string, movieId: string): Promise<WatchHistory | null>;
  saveProgress(input: SaveProgressInput): Promise<WatchHistory>;
}
