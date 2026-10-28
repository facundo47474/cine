import { WatchHistory } from "../entities/WatchHistory";
import { Movie } from "../entities/Movie";

export interface WatchHistoryWithMovie {
  history: WatchHistory;
  movie: Movie;
}

export interface SaveProgressInput {
  deviceSessionId: string;
  movieId: string;
  progressSeconds: number;
  durationSeconds: number;
}

export interface IWatchHistoryRepository {
  findByDeviceSession(deviceSessionId: string, limit?: number): Promise<WatchHistoryWithMovie[]>;
  findMovieProgress(deviceSessionId: string, movieId: string): Promise<WatchHistory | null>;
  saveProgress(input: SaveProgressInput): Promise<WatchHistory>;
}
