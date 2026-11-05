import { SignedMirrorStreamDto } from "./PlaybackStreamDto";

export interface EpisodeDto {
  id: string;
  seasonId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview: string | null;
  duration: number; // en minutos
  videoUrl: string;
  thumbnailUrl: string | null;
  introStart: number | null;
  introEnd: number | null;
  progressSeconds?: number;
  progressPercentage?: number;
  completed?: boolean;
}

export interface SeasonSummaryDto {
  id: string;
  seasonNumber: number;
  title: string;
  overview?: string | null;
  posterUrl?: string | null;
  episodeCount: number;
}

export interface CastMemberDto {
  id: number;
  name: string;
  character: string;
  profileUrl: string | null;
}

export interface SeriesResumeDto {
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  progressSeconds: number;
  durationSeconds: number;
  progressPercentage: number;
  isResume: boolean;
  label: string; // Ej: "Reproducir T1:E1" | "Continuar T1:E3" | "Ver T1:E4"
}

export interface SeriesDetailsDto {
  id: string;
  tmdbId: number | null;
  title: string;
  originalTitle: string | null;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string | null;
  releaseYear: number;
  rating: number;
  qualityBadge: string;
  genres: string[];
  totalSeasons: number;
  seasons: SeasonSummaryDto[];
  currentSeasonEpisodes: EpisodeDto[];
  cast: CastMemberDto[];
  resume?: SeriesResumeDto;
}

export interface EpisodePlaybackDto {
  episodeId: string;
  seriesId: string;
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  overview: string | null;
  thumbnailUrl: string | null;
  introStart: number | null;
  introEnd: number | null;
  durationSeconds: number;
  savedProgressSeconds: number;
  streams: SignedMirrorStreamDto[];
  nextEpisode?: {
    id: string;
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    thumbnailUrl: string | null;
  };
  previousEpisode?: {
    id: string;
    seasonNumber: number;
    episodeNumber: number;
    title: string;
  };
  allSeasons: {
    seasonNumber: number;
    title: string;
    episodes: {
      id: string;
      episodeNumber: number;
      title: string;
      duration: number;
      thumbnailUrl: string | null;
    }[];
  }[];
}
