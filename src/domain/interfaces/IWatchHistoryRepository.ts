import { WatchHistory } from "../entities/WatchHistory";
import { Movie } from "../entities/Movie";

export interface WatchHistoryEpisodeInfo {
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

export interface WatchHistoryWithMovie {
  history: WatchHistory;
  movie: Movie;
  episodeInfo?: WatchHistoryEpisodeInfo;
}

export interface SaveProgressInput {
  userId: string;
  movieId: string;
  progressSeconds: number;
  durationSeconds: number;
}

export interface SaveEpisodeProgressInput {
  userId: string;
  episodeId: string;
  progressSeconds: number;
  durationSeconds: number;
}

export interface IWatchHistoryRepository {
  findByUserId(userId: string, limit?: number): Promise<WatchHistoryWithMovie[]>;
  findMovieProgress(userId: string, movieId: string): Promise<WatchHistory | null>;
  saveProgress(input: SaveProgressInput): Promise<WatchHistory>;
  findEpisodeProgress(userId: string, episodeId: string): Promise<WatchHistory | null>;
  saveEpisodeProgress(input: SaveEpisodeProgressInput): Promise<WatchHistory>;
  findSeriesEpisodesProgress(
    userId: string,
    episodeIds: string[]
  ): Promise<Map<string, WatchHistory>>;
  findUserSeriesHistory(userId: string, seriesId: string): Promise<WatchHistory[]>;
}
