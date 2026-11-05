export interface WatchHistoryProps {
  id: string;
  userId: string;
  movieId?: string | null;
  episodeId?: string | null;
  progressSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: Date;
}

export class WatchHistory {
  constructor(private props: WatchHistoryProps) {}

  get id(): string { return this.props.id; }
  get userId(): string { return this.props.userId; }
  get movieId(): string | null { return this.props.movieId ?? null; }
  get episodeId(): string | null { return this.props.episodeId ?? null; }
  get progressSeconds(): number { return this.props.progressSeconds; }
  get durationSeconds(): number { return this.props.durationSeconds; }
  get completed(): boolean { return this.props.completed; }
  get updatedAt(): Date { return this.props.updatedAt; }

  public getProgressPercentage(): number {
    if (this.props.durationSeconds <= 0 || this.props.progressSeconds <= 0) {
      return 0;
    }
    const rawPercent =
      (this.props.progressSeconds / this.props.durationSeconds) * 100;
    return Math.max(1, Math.min(100, Math.round(rawPercent)));
  }

  public toObject(): WatchHistoryProps {
    return { ...this.props };
  }
}
