import { MirrorFormat } from "../enums/MirrorFormat";

export interface LinkProbeResult {
  isAlive: boolean;
  httpStatus: number;
  isPermanentGone: boolean; // True si es 404 Not Found o 410 Gone explícito
  responseTimeMs: number;
  reason?: string;
}

export interface ILinkProber {
  probeUrl(url: string, format: MirrorFormat): Promise<LinkProbeResult>;
}
