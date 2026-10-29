export interface WatchHistoryProps {
  id: string;
  userId: string;
  movieId: string;
  progressSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: Date;
}

export class WatchHistory {
  constructor(private props: WatchHistoryProps) {}

  get id(): string { return this.props.id; }
  get userId(): string { return this.props.userId; }
  get movieId(): string { return this.props.movieId; }
  get progressSeconds(): number { return this.props.progressSeconds; }
  get durationSeconds(): number { return this.props.durationSeconds; }
  get completed(): boolean { return this.props.completed; }
  get updatedAt(): Date { return this.props.updatedAt; }

  public getProgressPercentage(): number {
    if (this.props.durationSeconds <= 0) return 0;
    return Math.min(
      100,
      Math.round((this.props.progressSeconds / this.props.durationSeconds) * 100)
    );
  }

  public toObject(): WatchHistoryProps {
    return { ...this.props };
  }
}
