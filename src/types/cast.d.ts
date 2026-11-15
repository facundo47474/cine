export interface CastDevice {
  friendlyName: string;
}

export interface CastImage {
  url: string;
  width?: number;
  height?: number;
}

export interface CastMediaMetadata {
  title?: string;
  metadataType?: number;
  images?: CastImage[];
}

export interface CastMediaInfo {
  contentId: string;
  contentType: string;
  streamType?: string;
  hlsSegmentFormat?: string;
  hlsVideoSegmentFormat?: string;
  metadata?: CastMediaMetadata;
}

export interface CastLoadRequest {
  autoplay?: boolean;
  currentTime?: number;
}

export interface CastSession {
  getCastDevice(): CastDevice;
  loadMedia(request: CastLoadRequest): Promise<string | null | void>;
}

export interface CastContextOptions {
  receiverApplicationId: string;
  autoJoinPolicy: string;
}

export interface CastContextInstance {
  setOptions(options: CastContextOptions): void;
  requestSession(): Promise<string | null | void>;
  getCurrentSession(): CastSession | null;
  endCurrentSession(stopCasting: boolean): void;
}

export interface PresentationConnection {
  id: string;
  state: "connecting" | "connected" | "closed" | "terminated";
  close(): void;
  terminate(): void;
  addEventListener(
    type: "connect" | "close" | "terminate",
    listener: () => void
  ): void;
  removeEventListener(
    type: "connect" | "close" | "terminate",
    listener: () => void
  ): void;
}

export interface PresentationRequestInstance {
  start(): Promise<PresentationConnection>;
}

export interface PresentationRequestConstructor {
  new (urls: string | string[]): PresentationRequestInstance;
}

declare global {
  interface HTMLVideoElement {
    webkitShowPlaybackTargetPicker?: () => void;
  }

  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    PresentationRequest?: PresentationRequestConstructor;
    chrome?: {
      cast?: {
        AutoJoinPolicy: {
          ORIGIN_SCOPED: string;
          TAB_AND_ORIGIN_SCOPED?: string;
          PAGE_SCOPED?: string;
        };
        media: {
          DEFAULT_MEDIA_RECEIVER_APP_ID: string;
          StreamType?: {
            BUFFERED: string;
            LIVE: string;
            OTHER: string;
          };
          HlsSegmentFormat?: {
            TS: string;
            AAC: string;
            AC3: string;
            MP3: string;
            TS_AAC: string;
            E_AC3: string;
            FMP4: string;
          };
          HlsVideoSegmentFormat?: {
            MPEG2_TS: string;
            FMP4: string;
          };
          MediaInfo: new (
            contentId: string,
            contentType: string
          ) => CastMediaInfo;
          GenericMediaMetadata: new () => CastMediaMetadata;
          LoadRequest: new (mediaInfo: CastMediaInfo) => CastLoadRequest;
        };
        Image?: new (url: string) => CastImage;
      };
    };
    cast?: {
      framework?: {
        CastContext: {
          getInstance(): CastContextInstance;
        };
      };
    };
  }
}
