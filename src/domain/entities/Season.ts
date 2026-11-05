import { Episode } from "./Episode";

export interface SeasonProps {
  id: string;
  seriesId: string;
  seasonNumber: number;
  title: string;
  overview: string | null;
  posterUrl: string | null;
  releaseDate: Date | null;
  episodes?: Episode[];
}

export class Season {
  constructor(private props: SeasonProps) {}

  get id(): string { return this.props.id; }
  get seriesId(): string { return this.props.seriesId; }
  get seasonNumber(): number { return this.props.seasonNumber; }
  get title(): string { return this.props.title; }
  get overview(): string | null { return this.props.overview; }
  get posterUrl(): string | null { return this.props.posterUrl; }
  get releaseDate(): Date | null { return this.props.releaseDate; }
  get episodes(): Episode[] { return this.props.episodes ?? []; }

  public toObject(): SeasonProps {
    return { ...this.props };
  }
}

