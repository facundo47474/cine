export interface CastDevice {
  friendlyName: string;
}

export interface CastMediaMetadata {
  title?: string;
  metadataType?: number;
}

export interface CastMediaInfo {
  contentId: string;
  contentType: string;
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
          MediaInfo: new (
            contentId: string,
            contentType: string
          ) => CastMediaInfo;
          GenericMediaMetadata: new () => CastMediaMetadata;
          LoadRequest: new (mediaInfo: CastMediaInfo) => CastLoadRequest;
        };
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
