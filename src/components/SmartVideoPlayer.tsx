"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import Hls from "hls.js";
import {
  AlertTriangle,
  Cast,
  Maximize2,
  Minimize2,
  FastForward,
  Play,
  Tv,
  X,
  Layers,
  Sparkles,
} from "lucide-react";
import { SignedMirrorStreamDto } from "@/application/dto/PlaybackStreamDto";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { PresentationConnection } from "@/types/cast";
import SmartPlayer, {
  SmartAdblockHelperBar,
  SmartPlayerStatus,
} from "@/components/video/SmartPlayer";
import {
  FALLBACK_IF_EMPTY,
  STRICT_STREAMWISH_ONLY,
  filterAndPrioritizeMirrors,
  isStreamwish,
} from "@/domain/utils/streamwishMatcher";

const GOOGLE_CAST_SDK_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

interface SmartVideoPlayerProps {
  movieId?: string;
  movieTitle: string;
  durationMins: number;
  streams: SignedMirrorStreamDto[];
  initialProgressSeconds: number;
  preferredLanguage?: "Latino" | "Inglés (Sub)";

  // Extensiones para Series de TV (Fase 4)
  episodeId?: string;
  seriesId?: string;
  seriesTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  introStart?: number | null;
  introEnd?: number | null;
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
  allSeasons?: {
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
  onEpisodeSelect?: (episodeId: string) => void;
  onDurationChange?: (durationSeconds: number) => void;
}

interface FullscreenContainerElement extends HTMLDivElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface ExtractedTimeTelemetry {
  currentTime: number;
  duration?: number;
}

function extractTimeTelemetry(rawData: unknown): ExtractedTimeTelemetry | null {
  try {
    const parsed: Record<string, unknown> | null =
      typeof rawData === "string"
        ? (JSON.parse(rawData) as Record<string, unknown>)
        : typeof rawData === "object" && rawData !== null
        ? (rawData as Record<string, unknown>)
        : null;

    if (!parsed) return null;

    if (
      parsed.type === "PILOTO_TIME_UPDATE" &&
      typeof parsed.currentTime === "number"
    ) {
      return {
        currentTime: parsed.currentTime,
        duration:
          typeof parsed.duration === "number" ? parsed.duration : undefined,
      };
    }

    if (
      parsed.type === "MEDIA_DATA" &&
      typeof parsed.data === "object" &&
      parsed.data !== null
    ) {
      const mediaData = parsed.data as Record<string, unknown>;
      const ct = Number(
        mediaData.currentTime ?? mediaData.time ?? mediaData.position
      );
      const dur = Number(mediaData.duration);
      if (Number.isFinite(ct) && ct >= 0) {
        return {
          currentTime: ct,
          duration: Number.isFinite(dur) && dur > 60 ? dur : undefined,
        };
      }
    }

    const eventName = String(
      parsed.event ?? parsed.type ?? parsed.action ?? ""
    ).toLowerCase();

    if (
      eventName === "time" ||
      eventName === "timeupdate" ||
      eventName === "seek" ||
      eventName === "progress"
    ) {
      const nested =
        typeof parsed.data === "object" && parsed.data !== null
          ? (parsed.data as Record<string, unknown>)
          : parsed;
      const rawCurrent =
        nested.currentTime ??
        nested.position ??
        nested.time ??
        nested.seconds ??
        parsed.value;
      const rawDuration = nested.duration ?? parsed.duration;
      const ct = Number(rawCurrent);
      const dur = Number(rawDuration);

      if (Number.isFinite(ct) && ct >= 0) {
        return {
          currentTime: ct,
          duration: Number.isFinite(dur) && dur > 60 ? dur : undefined,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export default function SmartVideoPlayer({
  movieId,
  movieTitle,
  durationMins,
  streams,
  initialProgressSeconds,
  preferredLanguage = "Latino",
  episodeId,
  seriesId,
  seriesTitle,
  seasonNumber,
  episodeNumber,
  episodeTitle,
  introStart,
  introEnd,
  nextEpisode,
  previousEpisode,
  allSeasons,
  onEpisodeSelect,
  onDurationChange,
}: SmartVideoPlayerProps) {
  const containerRef = useRef<FullscreenContainerElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const presentationConnectionRef = useRef<PresentationConnection | null>(null);

  const fallbackDurationSec = Math.max(600, (durationMins || 120) * 60);
  const [playbackStarted, setPlaybackStarted] = useState<boolean>(
    initialProgressSeconds > 0
  );

  const [currentTimeState, setCurrentTimeState] = useState<number>(
    Math.max(0, Math.floor(initialProgressSeconds || 0))
  );
  const [durationState, setDurationState] = useState<number>(fallbackDurationSec);

  const lastSavedSecRef = useRef<number>(
    Math.max(0, Math.floor(initialProgressSeconds || 0))
  );
  const currentProgressRef = useRef<number>(
    Math.max(0, Math.floor(initialProgressSeconds || 0))
  );
  const totalDurationRef = useRef<number>(fallbackDurationSec);
  const hasDirectTelemetryRef = useRef<boolean>(false);
  const initialResumeSecRef = useRef<number>(
    Math.max(0, Math.floor(initialProgressSeconds || 0))
  );

  // Estados interactivos para TV Series (Fase 4)
  const [dismissedNextOverlay, setDismissedNextOverlay] = useState<boolean>(false);
  const [nextCountdown, setNextCountdown] = useState<number>(5);
  const [showEpisodesDrawer, setShowEpisodesDrawer] = useState<boolean>(false);
  const [drawerSeasonNumber, setDrawerSeasonNumber] = useState<number>(
    seasonNumber || 1
  );

  useEffect(() => {
    const cleanInit = Math.max(0, Math.floor(initialProgressSeconds || 0));
    currentProgressRef.current = cleanInit;
    lastSavedSecRef.current = cleanInit;
    initialResumeSecRef.current = cleanInit;
    setCurrentTimeState(cleanInit);
    setDismissedNextOverlay(false);
    setNextCountdown(5);
    if (cleanInit > 0) {
      setPlaybackStarted(true);
    }
  }, [initialProgressSeconds, movieId, episodeId]);

  useEffect(() => {
    const nextDur = Math.max(600, (durationMins || 120) * 60);
    totalDurationRef.current = nextDur;
    setDurationState(nextDur);
  }, [durationMins]);

  const orderedStreams = useMemo(() => {
    const prioritized = filterAndPrioritizeMirrors(
      streams.map((s) => ({
        ...s,
        isStreamwish:
          typeof s.isStreamwish === "boolean"
            ? s.isStreamwish
            : isStreamwish({ serverName: s.serverName }),
      })),
      {
        strictOnly: STRICT_STREAMWISH_ONLY,
        fallbackIfEmpty: FALLBACK_IF_EMPTY,
      }
    ).map(({ item, isStreamwish: sw, isDirty }) => ({
      ...item,
      isStreamwish: sw,
      isDirty,
    }));

    const cleanStreams = prioritized.filter((s) => s.isStreamwish);
    const dirtyStreams = prioritized.filter((s) => !s.isStreamwish);

    const sortByLang = (list: typeof prioritized) => [
      ...list.filter((s) => s.language === preferredLanguage),
      ...list.filter((s) => s.language !== preferredLanguage),
    ];

    return [...sortByLang(cleanStreams), ...sortByLang(dirtyStreams)];
  }, [streams, preferredLanguage]);

  const firstCleanIndex = useMemo(() => {
    const idx = orderedStreams.findIndex((s) => s.isStreamwish);
    return idx >= 0 ? idx : 0;
  }, [orderedStreams]);

  const [activeIndex, setActiveIndex] = useState<number>(firstCleanIndex);
  const [allMirrorsDown, setAllMirrorsDown] = useState<boolean>(
    orderedStreams.length === 0
  );
  const [shieldActive, setShieldActive] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isCasting, setIsCasting] = useState<boolean>(false);
  const [castDeviceName, setCastDeviceName] = useState<string | null>(null);
  const [tunnelUsingSecondary, setTunnelUsingSecondary] =
    useState<boolean>(false);
  const [smartPlayerStatus, setSmartPlayerStatus] =
    useState<SmartPlayerStatus>("loading");

  useEffect(() => {
    setActiveIndex(firstCleanIndex);
    setAllMirrorsDown(orderedStreams.length === 0);
    setShieldActive(true);
    setTunnelUsingSecondary(false);
    setSmartPlayerStatus("loading");
    hasDirectTelemetryRef.current = false;
  }, [orderedStreams, preferredLanguage, firstCleanIndex, movieId, episodeId]);

  useEffect(() => {
    setTunnelUsingSecondary(false);
    setSmartPlayerStatus("loading");
  }, [activeIndex]);

  const currentStream: SignedMirrorStreamDto | undefined =
    orderedStreams[activeIndex];

  /**
   * Carga e inicialización automática del SDK Oficial de Google Cast.
   */
  useEffect(() => {
    const initializeCastContext = () => {
      try {
        const castFramework = window.cast?.framework;
        const chromeCast = window.chrome?.cast;
        if (!castFramework || !chromeCast) return;

        castFramework.CastContext.getInstance().setOptions({
          receiverApplicationId:
            chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
      } catch {
        // Silencioso en navegadores que no implementan Google Cast
      }
    };

    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) {
        initializeCastContext();
      }
    };

    if (window.cast?.framework && window.chrome?.cast) {
      initializeCastContext();
      return;
    }

    const existingScript = document.querySelector(
      `script[src="${GOOGLE_CAST_SDK_URL}"]`
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = GOOGLE_CAST_SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const isPrimaryServerActive = Boolean(
    currentStream &&
      currentStream.isStreamwish &&
      !currentStream.isDirty &&
      !tunnelUsingSecondary
  );

  useEffect(() => {
    const originalWindowOpen = window.open;
    window.open = () => null;

    const handleWindowBlur = () => {
      if (document.activeElement === iframeRef.current) {
        setTimeout(() => {
          window.focus();
        }, 50);
      }
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.open = originalWindowOpen;
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as FullscreenDocument;
      setIsFullscreen(
        Boolean(doc.fullscreenElement || doc.webkitFullscreenElement)
      );
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      handleFullscreenChange as EventListener
    );

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange as EventListener
      );
    };
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    const doc = document as FullscreenDocument;

    if (!container) return;

    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      } else if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        await container.webkitRequestFullscreen();
      }
    } catch {
      // Silencioso
    }
  }, []);

  /**
   * Flujo de Transmisión Nativa de 1 Clic (Google Cast SDK + W3C PresentationRequest + AirPlay + RemotePlayback)
   * compatible tanto con Películas como con Episodios de Series.
   */
  const handleCastClick = useCallback(async () => {
    if (isCasting) {
      try {
        window.cast?.framework?.CastContext.getInstance().endCurrentSession(true);
      } catch {
        // Silencioso
      }
      try {
        presentationConnectionRef.current?.terminate();
      } catch {
        // Silencioso
      }
      presentationConnectionRef.current = null;
      setIsCasting(false);
      setCastDeviceName(null);
      return;
    }

    if (!currentStream) return;

    const videoEl = videoRef.current;
    const castDisplayTitle = seriesTitle
      ? `${seriesTitle} - T${seasonNumber || 1}:E${episodeNumber || 1} ${episodeTitle || movieTitle}`
      : movieTitle;

    // Caso B: Apple AirPlay nativo en Safari / iOS / macOS
    if (videoEl && typeof videoEl.webkitShowPlaybackTargetPicker === "function") {
      try {
        videoEl.webkitShowPlaybackTargetPicker();
        return;
      } catch {
        // Continúa con la cascada si falla AirPlay
      }
    }

    // Caso C: Stream Directo MP4/HLS con Google Cast SDK
    if (
      currentStream.format !== MirrorFormat.EMBED &&
      window.cast?.framework &&
      window.chrome?.cast
    ) {
      try {
        const castContext = window.cast.framework.CastContext.getInstance();
        await castContext.requestSession();
        const session = castContext.getCurrentSession();

        if (session) {
          const absoluteStreamUrl = new URL(
            currentStream.streamUrl,
            window.location.origin
          ).toString();
          const contentType =
            currentStream.format === MirrorFormat.HLS
              ? "application/x-mpegurl"
              : "video/mp4";

          const mediaInfo = new window.chrome.cast.media.MediaInfo(
            absoluteStreamUrl,
            contentType
          );
          const metadata = new window.chrome.cast.media.GenericMediaMetadata();
          metadata.title = castDisplayTitle;
          mediaInfo.metadata = metadata;

          const loadRequest = new window.chrome.cast.media.LoadRequest(
            mediaInfo
          );
          loadRequest.autoplay = true;
          loadRequest.currentTime = currentProgressRef.current || lastSavedSecRef.current || 0;

          await session.loadMedia(loadRequest);
          videoEl?.pause();
          setCastDeviceName(
            session.getCastDevice()?.friendlyName || "tu Smart TV"
          );
          setIsCasting(true);
          return;
        }
      } catch {
        // Si el usuario cancela o el receptor requiere PresentationRequest, continuamos
      }
    }

    // Caso D: Stream EMBED o Universal vía W3C PresentationRequest Nativo
    const tvUrl = new URL(currentStream.streamUrl, window.location.origin);
    tvUrl.searchParams.set("tv", "1");
    if (currentProgressRef.current > 5) {
      tvUrl.searchParams.set("t", String(Math.floor(currentProgressRef.current)));
    }

    if (typeof window.PresentationRequest === "function") {
      try {
        const presentationRequest = new window.PresentationRequest([
          tvUrl.toString(),
        ]);
        const connection = await presentationRequest.start();

        presentationConnectionRef.current = connection;
        setCastDeviceName("tu Smart TV");
        setIsCasting(true);

        const handleDisconnect = () => {
          presentationConnectionRef.current = null;
          setIsCasting(false);
          setCastDeviceName(null);
        };

        connection.addEventListener("close", handleDisconnect);
        connection.addEventListener("terminate", handleDisconnect);
        return;
      } catch {
        // Si el navegador no completó PresentationRequest, intentamos CastContext o RemotePlayback
      }
    }

    if (window.cast?.framework) {
      try {
        const castContext = window.cast.framework.CastContext.getInstance();
        await castContext.requestSession();
        const session = castContext.getCurrentSession();
        if (session) {
          setCastDeviceName(
            session.getCastDevice()?.friendlyName || "tu Smart TV"
          );
          setIsCasting(true);
          return;
        }
      } catch {
        // Silencioso si el usuario cierra el selector nativo
      }
    }

    // Caso E: Remote Playback API nativa en <video> o en el <video id="pilotoVideo"> dentro del túnel
    if (videoEl?.remote?.prompt) {
      try {
        await videoEl.remote.prompt();
        return;
      } catch {
        // Silencioso
      }
    }

    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: "PILOTO_TRIGGER_REMOTE_PLAYBACK" },
          "*"
        );
      } catch {
        // Silencioso
      }
    }
  }, [
    isCasting,
    currentStream,
    movieTitle,
    seriesTitle,
    seasonNumber,
    episodeNumber,
    episodeTitle,
  ]);

  /**
   * Escucha el evento personalizado disparado desde la barra de acciones de la película o serie.
   */
  useEffect(() => {
    const handleExternalCastTrigger = () => {
      void handleCastClick();
    };

    window.addEventListener("piloto:trigger-cast", handleExternalCastTrigger);
    return () => {
      window.removeEventListener(
        "piloto:trigger-cast",
        handleExternalCastTrigger
      );
    };
  }, [handleCastClick]);

  const handleShieldAbsorb = useCallback(() => {
    setShieldActive(false);
    setPlaybackStarted(true);
    window.focus();
  }, []);

  useEffect(() => {
    if (shieldActive) return;

    const rearmTimer = setTimeout(() => {
      setShieldActive(true);
    }, 240_000);

    return () => clearTimeout(rearmTimer);
  }, [shieldActive]);

  const saveWatchProgress = useCallback(
    async (
      currentSeconds: number,
      totalDurationSeconds: number,
      force: boolean = false
    ) => {
      const safeCurrent = Math.max(0, Math.floor(currentSeconds || 0));
      const safeDuration = Math.max(
        600,
        Math.floor(totalDurationSeconds || 0) || (durationMins || 120) * 60
      );

      if (!force && safeCurrent <= 0) return;
      if (
        !force &&
        Math.abs(safeCurrent - lastSavedSecRef.current) < 5 &&
        lastSavedSecRef.current > 0
      ) {
        return;
      }

      lastSavedSecRef.current = safeCurrent;

      try {
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            movieId: movieId || undefined,
            episodeId: episodeId || undefined,
            progressSeconds: safeCurrent,
            durationSeconds: safeDuration,
          }),
        });
      } catch {
        // Silencioso
      }
    },
    [movieId, episodeId, durationMins]
  );

  useEffect(() => {
    const flushLatestProgress = () => {
      if (currentProgressRef.current > 0) {
        void saveWatchProgress(
          currentProgressRef.current,
          totalDurationRef.current,
          true
        );
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushLatestProgress();
      }
    };

    window.addEventListener("pagehide", flushLatestProgress);
    window.addEventListener("beforeunload", flushLatestProgress);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      flushLatestProgress();
      window.removeEventListener("pagehide", flushLatestProgress);
      window.removeEventListener("beforeunload", flushLatestProgress);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [saveWatchProgress]);

  useEffect(() => {
    if (!currentStream || currentStream.format !== MirrorFormat.EMBED) return;

    const tick = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (hasDirectTelemetryRef.current) return;
      if (!playbackStarted && shieldActive) return;

      const nextSec = Math.min(
        totalDurationRef.current - 5,
        currentProgressRef.current + 1
      );
      currentProgressRef.current = nextSec;
      setCurrentTimeState(nextSec);

      if (nextSec - lastSavedSecRef.current >= 5) {
        void saveWatchProgress(nextSec, totalDurationRef.current, false);
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [currentStream, playbackStarted, shieldActive, saveWatchProgress]);

  const handleStreamError = useCallback(
    (failedStream: SignedMirrorStreamDto) => {
      fetch(`/api/mirrors/${failedStream.mirrorId}/report`, {
        method: "POST",
      }).catch(() => {});

      const nextIndex = activeIndex + 1;
      if (nextIndex < orderedStreams.length) {
        setActiveIndex(nextIndex);
      } else {
        setAllMirrorsDown(true);
      }
    },
    [activeIndex, orderedStreams.length]
  );

  useEffect(() => {
    if (!currentStream) return;

    const handleTunnelMessage = (event: MessageEvent) => {
      const payload = event.data as
        | { type?: string; mirrorId?: string }
        | undefined;
      if (
        payload?.type === "PILOTO_STREAM_ERROR" &&
        (!payload.mirrorId || payload.mirrorId === currentStream.mirrorId)
      ) {
        handleStreamError(currentStream);
        return;
      }

      if (
        payload?.type === "PILOTO_SECONDARY_SERVER_ACTIVE" &&
        (!payload.mirrorId || payload.mirrorId === currentStream.mirrorId)
      ) {
        setTunnelUsingSecondary(true);
        return;
      }

      const telemetry = extractTimeTelemetry(event.data);
      if (telemetry) {
        if (telemetry.duration && telemetry.duration > 60) {
          const cleanDur = Math.floor(telemetry.duration);
          totalDurationRef.current = cleanDur;
          setDurationState(cleanDur);
          if (onDurationChange) {
            onDurationChange(cleanDur);
          }
        }

        if (telemetry.currentTime > 0) {
          hasDirectTelemetryRef.current = true;
          setPlaybackStarted(true);

          const cleanSec = Math.floor(telemetry.currentTime);
          currentProgressRef.current = cleanSec;
          setCurrentTimeState(cleanSec);

          const jumped = Math.abs(cleanSec - lastSavedSecRef.current) >= 10;
          void saveWatchProgress(
            cleanSec,
            totalDurationRef.current,
            jumped
          );
        }
      }
    };

    window.addEventListener("message", handleTunnelMessage);
    return () => window.removeEventListener("message", handleTunnelMessage);
  }, [currentStream, handleStreamError, saveWatchProgress]);

  // Inicialización de reproducción directa MP4 / HLS
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !currentStream) return;
    if (currentStream.format === MirrorFormat.EMBED) return;

    let hlsInstance: Hls | null = null;

    const onLoadedMetadata = () => {
      if (
        initialResumeSecRef.current > 0 &&
        videoElement.duration > initialResumeSecRef.current
      ) {
        videoElement.currentTime = initialResumeSecRef.current;
      }
      if (videoElement.duration && videoElement.duration > 60) {
        totalDurationRef.current = Math.floor(videoElement.duration);
        setDurationState(Math.floor(videoElement.duration));
      }
    };

    if (
      currentStream.format === MirrorFormat.HLS &&
      Hls.isSupported() &&
      currentStream.streamUrl.includes(".m3u8")
    ) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hlsInstance.loadSource(currentStream.streamUrl);
      hlsInstance.attachMedia(videoElement);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        onLoadedMetadata();
        videoElement.play().catch(() => {});
      });

      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          handleStreamError(currentStream);
        }
      });
    } else {
      videoElement.src = currentStream.streamUrl;
      videoElement.addEventListener("loadedmetadata", onLoadedMetadata);
      videoElement.play().catch(() => {});
    }

    return () => {
      videoElement.removeEventListener("loadedmetadata", onLoadedMetadata);
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [currentStream, handleStreamError]);

  const embedSrcWithResume = useMemo(() => {
    if (!currentStream) return "";
    const resumeSec = initialResumeSecRef.current;
    if (resumeSec <= 5) return currentStream.streamUrl;
    const separator = currentStream.streamUrl.includes("?") ? "&" : "?";
    return `${currentStream.streamUrl}${separator}t=${resumeSec}`;
  }, [currentStream]);

  // Lógica: Saltar Intro
  const showSkipIntro = Boolean(
    introStart !== null &&
      introStart !== undefined &&
      introEnd !== null &&
      introEnd !== undefined &&
      currentTimeState >= introStart &&
      currentTimeState <= introEnd
  );

  const handleSkipIntro = () => {
    if (introEnd === null || introEnd === undefined) return;
    currentProgressRef.current = introEnd;
    setCurrentTimeState(introEnd);

    if (videoRef.current) {
      videoRef.current.currentTime = introEnd;
    }

    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: "PILOTO_SEEK", time: introEnd },
          "*"
        );
        iframeRef.current.contentWindow.postMessage(
          { event: "seek", value: introEnd },
          "*"
        );
      } catch {
        // Silencioso
      }
    }

    void saveWatchProgress(introEnd, totalDurationRef.current, true);
  };

  // Lógica: Siguiente Episodio y Autoplay
  const isNearEnd = Boolean(
    nextEpisode &&
      !dismissedNextOverlay &&
      durationState > 60 &&
      currentTimeState > 30 &&
      durationState - currentTimeState <= 15
  );

  const handleGoToNextEpisode = useCallback(() => {
    if (!nextEpisode) return;
    if (onEpisodeSelect) {
      onEpisodeSelect(nextEpisode.id);
    } else {
      window.location.href = `/watch/episode/${nextEpisode.id}`;
    }
  }, [nextEpisode, onEpisodeSelect]);

  useEffect(() => {
    if (!isNearEnd || !nextEpisode) return;

    const interval = setInterval(() => {
      setNextCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleGoToNextEpisode();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isNearEnd, nextEpisode, handleGoToNextEpisode]);

  if (allMirrorsDown || !currentStream) {
    return (
      <div className="w-full aspect-video rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center p-8 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-netflix-red" />
        <h3 className="text-base font-bold text-white">
          Este contenido no se encuentra disponible en este momento
        </h3>
        <p className="text-xs text-zinc-400 max-w-md">
          Intenta nuevamente en unos minutos o explora otro título de nuestro
          catálogo.
        </p>
      </div>
    );
  }

  const isSeriesPlayer = Boolean(seriesTitle || seasonNumber || episodeNumber);

  return (
    <div className="w-full space-y-2.5">
      <div
        ref={containerRef}
        onMouseEnter={() => {
          if (shieldActive) {
            setShieldActive(false);
            setPlaybackStarted(true);
          }
        }}
        className="group relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl"
      >
      {/* 1. Header flotante del Reproductor (Fase 4.1) */}
      <div className="absolute top-0 inset-x-0 p-4 sm:p-6 bg-gradient-to-b from-black/85 via-black/40 to-transparent z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
        <div className="min-w-0 max-w-xl">
          {isSeriesPlayer ? (
            <div className="space-y-0.5">
              <span className="text-[11px] sm:text-xs font-bold text-amber-400 tracking-wider uppercase block truncate">
                {seriesTitle || "Serie"}
              </span>
              <h2 className="text-sm sm:text-base font-black text-white truncate drop-shadow-md">
                T{seasonNumber || 1}:E{episodeNumber || 1}{" "}
                {episodeTitle ? `- ${episodeTitle}` : ""}
              </h2>
            </div>
          ) : (
            <h2 className="text-sm sm:text-base font-black text-white truncate drop-shadow-md">
              {movieTitle}
            </h2>
          )}
        </div>
      </div>

      {/* Contenido del video (Modo Transmitiendo a TV, Iframe EMBED o Video HTML5) */}
      {isCasting ? (
        <div className="w-full h-full bg-zinc-950 flex flex-col items-center justify-center p-6 text-center space-y-4 select-none">
          <div className="w-16 h-16 rounded-full bg-netflix-red/15 border border-netflix-red/40 flex items-center justify-center animate-pulse">
            <Tv className="w-8 h-8 text-netflix-red" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
              {`Reproduciendo en ${castDeviceName || "tu Smart TV"}`}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400">
              {isSeriesPlayer
                ? "El episodio se está transmitiendo directamente a la pantalla grande."
                : "La película se está transmitiendo directamente a la pantalla grande."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCastClick}
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-netflix-red hover:bg-red-700 text-white text-xs sm:text-sm font-bold transition shadow-lg"
          >
            <Cast className="w-4 h-4" />
            <span>Desconectar de la TV</span>
          </button>
        </div>
      ) : currentStream.format === MirrorFormat.EMBED ? (
        <SmartPlayer
          key={`${movieId || episodeId || "media"}-${currentStream.mirrorId}`}
          embedUrl={embedSrcWithResume}
          backupEmbedUrls={orderedStreams
            .slice(activeIndex + 1)
            .filter((s) => (currentStream.isStreamwish ? s.isStreamwish : true))
            .map((s) => s.streamUrl)}
          title={
            isSeriesPlayer
              ? `${seriesTitle || "Serie"} - T${seasonNumber || 1}:E${episodeNumber || 1}${episodeTitle ? ` · ${episodeTitle}` : ""}`
              : movieTitle
          }
          initialTimeSeconds={initialResumeSecRef.current}
          isDirty={Boolean(
            currentStream.isDirty ||
              !currentStream.isStreamwish ||
              tunnelUsingSecondary
          )}
          hideInlineHelperBar={true}
          onStatusChange={setSmartPlayerStatus}
          videoElementRef={videoRef}
          iframeElementRef={iframeRef}
          onPlay={() => {
            setShieldActive(false);
            setPlaybackStarted(true);
          }}
          onDurationChange={(durSec) => {
            if (durSec > 60) {
              totalDurationRef.current = durSec;
              setDurationState(durSec);
              onDurationChange?.(durSec);
            }
          }}
          onTimeUpdate={(curSec, durSec) => {
            hasDirectTelemetryRef.current = true;
            setPlaybackStarted(true);
            currentProgressRef.current = curSec;
            setCurrentTimeState(curSec);
            if (durSec > 60) {
              totalDurationRef.current = durSec;
              setDurationState(durSec);
              onDurationChange?.(durSec);
            }
            const jumped = Math.abs(curSec - lastSavedSecRef.current) >= 10;
            void saveWatchProgress(curSec, totalDurationRef.current, jumped);
          }}
          onEnded={() => {
            if (nextEpisode) {
              handleGoToNextEpisode();
            }
          }}
          onFatalError={() => handleStreamError(currentStream)}
        />
      ) : (
        <video
          key={currentStream.mirrorId}
          ref={videoRef}
          controls
          playsInline
          x-webkit-airplay="allow"
          className="w-full h-full bg-black"
          onPlay={() => setPlaybackStarted(true)}
          onEnded={() => {
            if (nextEpisode) {
              handleGoToNextEpisode();
            }
          }}
          onSeeked={(e) => {
            const el = e.currentTarget;
            const cur = Math.floor(el.currentTime || 0);
            const dur = Math.floor(el.duration || totalDurationRef.current);
            currentProgressRef.current = cur;
            setCurrentTimeState(cur);
            if (dur > 60) {
              totalDurationRef.current = dur;
              setDurationState(dur);
            }
            void saveWatchProgress(cur, dur, true);
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            const cur = Math.floor(el.currentTime || 0);
            const dur = Math.floor(el.duration || totalDurationRef.current);
            currentProgressRef.current = cur;
            setCurrentTimeState(cur);
            if (dur > 60) {
              totalDurationRef.current = dur;
              setDurationState(dur);
            }
            void saveWatchProgress(cur, dur, false);
          }}
          onError={() => handleStreamError(currentStream)}
        />
      )}

      {/* 2. Botón "Saltar Intro" estilo Netflix (Fase 4.2) */}
      {showSkipIntro && (
        <div className="absolute bottom-16 sm:bottom-20 right-4 sm:right-8 z-30 animate-fade-in">
          <button
            type="button"
            onClick={handleSkipIntro}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-zinc-900/90 hover:bg-white hover:text-black border border-white/40 text-white font-bold text-xs sm:text-sm tracking-wide shadow-2xl backdrop-blur-md transition-all active:scale-95"
          >
            <FastForward className="w-4 h-4" />
            <span>Saltar intro</span>
          </button>
        </div>
      )}

      {/* 3. Botón "Siguiente Episodio" y Autoplay (Fase 4.3) */}
      {isNearEnd && nextEpisode && (
        <div className="absolute bottom-16 sm:bottom-12 right-4 sm:right-8 z-30 max-w-xs sm:max-w-sm w-full bg-zinc-900/95 border border-white/20 rounded-xl p-3 sm:p-4 shadow-2xl backdrop-blur-md animate-fade-in">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-netflix-red" />
              Siguiente episodio en {nextCountdown}s
            </span>
            <button
              onClick={() => setDismissedNextOverlay(true)}
              className="text-zinc-400 hover:text-white p-1"
              title="Cancelar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {nextEpisode.thumbnailUrl && (
              <div className="relative aspect-video w-24 rounded-md overflow-hidden bg-zinc-800 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={nextEpisode.thumbnailUrl}
                  alt={nextEpisode.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">
                T{nextEpisode.seasonNumber}:E{nextEpisode.episodeNumber} {nextEpisode.title}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleGoToNextEpisode}
              className="flex-1 py-1.5 px-3 rounded-md bg-white hover:bg-white/90 text-black text-xs font-bold flex items-center justify-center gap-1.5 transition"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              Reproducir ahora
            </button>
            <button
              type="button"
              onClick={() => setDismissedNextOverlay(true)}
              className="py-1.5 px-3 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* 4. Selector de Episodios Drawer dentro del Player (Fase 4.4) */}
      {showEpisodesDrawer && allSeasons && (
        <div className="absolute right-0 top-0 bottom-0 w-80 sm:w-96 max-w-[90%] bg-zinc-950/95 border-l border-white/10 backdrop-blur-xl z-40 p-4 flex flex-col shadow-2xl animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-netflix-red" />
              Episodios
            </h3>
            <button
              type="button"
              onClick={() => setShowEpisodesDrawer(false)}
              className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Selector de temporada en Drawer */}
          <div className="py-3">
            <select
              value={drawerSeasonNumber}
              onChange={(e) => setDrawerSeasonNumber(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700 text-white text-xs font-bold py-2 px-3 rounded-md focus:outline-none focus:ring-1 focus:ring-netflix-red"
            >
              {allSeasons.map((s) => (
                <option key={s.seasonNumber} value={s.seasonNumber}>
                  {s.title && !/^season\s+\d+$/i.test(s.title.trim())
                    ? s.title
                    : `Temporada ${s.seasonNumber}`}
                </option>
              ))}
            </select>
          </div>

          {/* Lista de episodios */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {(
              allSeasons.find((s) => s.seasonNumber === drawerSeasonNumber)
                ?.episodes || []
            ).map((ep) => {
              const isCurrent = ep.id === episodeId;
              return (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => {
                    setShowEpisodesDrawer(false);
                    if (onEpisodeSelect) onEpisodeSelect(ep.id);
                    else window.location.href = `/watch/episode/${ep.id}`;
                  }}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition ${
                    isCurrent
                      ? "bg-netflix-red/20 border border-netflix-red/50 text-white"
                      : "hover:bg-zinc-800/60 text-zinc-300 hover:text-white"
                  }`}
                >
                  <div className="relative aspect-video w-20 rounded overflow-hidden bg-zinc-800 flex-shrink-0">
                    {ep.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ep.thumbnailUrl}
                        alt={ep.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-500">
                        {ep.episodeNumber}
                      </div>
                    )}
                    {isCurrent && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Play className="w-4 h-4 text-netflix-red fill-netflix-red" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">
                      {ep.episodeNumber}. {ep.title}
                    </p>
                    <p className="text-[10px] text-zinc-500">{ep.duration}m</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Controles flotantes superiores: Drawer de Episodios + Transmitir a TV + Pantalla Completa */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {allSeasons && allSeasons.length > 0 && (
          <button
            type="button"
            onClick={() => setShowEpisodesDrawer((prev) => !prev)}
            title="Seleccionar episodio"
            aria-label="Seleccionar episodio"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/75 hover:bg-netflix-red text-white text-xs font-semibold border border-white/15 backdrop-blur-md shadow-lg transition"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Episodios</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleCastClick}
          title={isCasting ? "Desconectar de la TV" : "Transmitir a TV"}
          aria-label={isCasting ? "Desconectar de la TV" : "Transmitir a TV"}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold border border-white/15 backdrop-blur-md shadow-lg transition ${
            isCasting
              ? "bg-netflix-red hover:bg-red-700"
              : "bg-black/75 hover:bg-netflix-red"
          }`}
        >
          <Cast className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {isCasting ? "Conectado a TV" : "Transmitir a TV"}
          </span>
        </button>

        {(isPrimaryServerActive || isFullscreen) && (
          <button
            type="button"
            onClick={handleToggleFullscreen}
            title={
              isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"
            }
            aria-label={
              isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/75 hover:bg-netflix-red text-white text-xs font-semibold border border-white/15 backdrop-blur-md shadow-lg transition"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Salir</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Pantalla completa</span>
              </>
            )}
          </button>
        )}
      </div>
      </div>

      {/* Barra Contextual No Intrusiva (Smart Adblock Helper) debajo del reproductor */}
      <SmartAdblockHelperBar
        active={
          !isCasting &&
          currentStream.format === MirrorFormat.EMBED &&
          smartPlayerStatus === "playing_iframe"
        }
      />
    </div>
  );
}
