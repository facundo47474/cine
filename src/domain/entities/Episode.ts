import { EpisodeMirror } from "./EpisodeMirror";

export interface EpisodeProps {
  id: string;
  seasonId: string;
  episodeNumber: number;
  title: string;
  overview: string | null;
  duration: number; // Duración en minutos
  videoUrl: string;
  thumbnailUrl: string | null;
  introStart: number | null; // Segundo donde empieza la intro (ej. 85)
  introEnd: number | null;   // Segundo donde termina la intro (ej. 175)
  mirrors?: EpisodeMirror[];
}

export class Episode {
  constructor(private props: EpisodeProps) {}

  get id(): string { return this.props.id; }
  get seasonId(): string { return this.props.seasonId; }
  get episodeNumber(): number { return this.props.episodeNumber; }
  get title(): string { return this.props.title; }
  get overview(): string | null { return this.props.overview; }
  get duration(): number { return this.props.duration; }
  get videoUrl(): string { return this.props.videoUrl; }
  get thumbnailUrl(): string | null { return this.props.thumbnailUrl; }
  get introStart(): number | null { return this.props.introStart; }
  get introEnd(): number | null { return this.props.introEnd; }
  get mirrors(): EpisodeMirror[] { return this.props.mirrors ?? []; }

  public getPlayableMirrors(): EpisodeMirror[] {
    return this.mirrors
      .filter((m) => m.isPlayable())
      .sort((a, b) => a.priority - b.priority);
  }

  public toObject(): EpisodeProps {
    return { ...this.props };
  }
}

