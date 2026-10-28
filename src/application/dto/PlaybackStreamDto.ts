import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { MirrorStatus } from "@/domain/enums/MirrorStatus";

export interface SignedMirrorStreamDto {
  mirrorId: string;
  serverName: string;
  language: string;
  format: MirrorFormat;
  quality: string;
  priority: number;
  status: MirrorStatus;
  streamUrl: string; // Apunta a /api/stream/[token] (nunca expone la rawUrl)
  expiresAt: string;
}

export interface MoviePlaybackDto {
  id: string;
  tmdbId: number | null;
  title: string;
  originalTitle: string | null;
  synopsis: string;
  posterUrl: string;
  backdropUrl: string | null;
  releaseYear: number;
  durationMins: number;
  rating: number;
  qualityBadge: string;
  genres: string[];
  isAvailable: boolean;
  streams: SignedMirrorStreamDto[];
}
