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
  FastForward,
  Play,
  Tv,
  X,
} from "lucide-react";
import { SignedMirrorStreamDto } from "@/application/dto/PlaybackStreamDto";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { CastContextInstance, PresentationConnection } from "@/types/cast";
import SmartPlayer, {
  ExtractedNativeStream,
  ExtractorResponseData,
  SmartPlayerStatus,
} from "@/components/video/SmartPlayer";
import { useMembership } from "@/components/MembershipProvider";
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

type GoogleCastLoadOutcome =
  | { status: "connected"; deviceName: string }
  | { status: "cancelled" }
  | { status: "failed" };

/**
 * Construye una URL absoluta hacia `/api/stream-proxy` incluyendo un sufijo `ext=.m3u8`/`.mp4`
 * porque Chromecast Default Media Receiver exige pistas de formato explícitas en URLs proxy.
 */
function construirUrlProxyCastConExtension(
  proxiedUrl: string,
  streamType: "hls" | "mp4"
): string {
  const absoluteUrl = new URL(proxiedUrl, window.location.origin);
  if (!absoluteUrl.searchParams.has("ext")) {
    absoluteUrl.searchParams.set("ext", streamType === "mp4" ? ".mp4" : ".m3u8");
  }
  return absoluteUrl.toString();
}

/**
 * Ordena las URLs candidatas (proxy CORS/Referer vs CDN directa) según si el origen es loopback;
 * en `localhost`/`127.0.0.1` un Chromecast físico no puede alcanzar el proxy local, por lo que se
 * prioriza primero la CDN HTTPS directa y luego el proxy.
 */
function construirCandidatosUrlCast(
  nativeStream: ExtractedNativeStream
): string[] {
  const proxiedWithExt = construirUrlProxyCastConExtension(
    nativeStream.proxiedUrl,
    nativeStream.type
  );
  const directHttpUrl = /^https?:\/\//i.test(nativeStream.streamUrl)
    ? nativeStream.streamUrl
    : "";
  const isLoopbackHost = /^(localhost|127\.0\.0\.1)$/i.test(
    window.location.hostname
  );

  const rawCandidates = isLoopbackHost
    ? [directHttpUrl, proxiedWithExt]
    : [proxiedWithExt, directHttpUrl];

  return Array.from(
    new Set(
      rawCandidates.filter((urlCandidate) => /^https?:\/\//i.test(urlCandidate))
    )
  );
}

/**
 * Extrae bajo demanda el manifiesto `.m3u8` o `.mp4` real si el usuario presiona "Transmitir a TV"
 * antes de que finalice la extracción o mientras el túnel iframe está activo.
 */
async function resolverStreamNativoBajoDemandaParaCast(
  embedOrTunnelUrl: string
): Promise<ExtractedNativeStream | null> {
  if (!embedOrTunnelUrl) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `/api/extractor?url=${encodeURIComponent(embedOrTunnelUrl)}`,
      { signal: controller.signal, cache: "no-store" }
    );
    if (!response.ok) return null;

    const data = (await response.json()) as ExtractorResponseData;
    if (!data.success || !data.streamUrl) return null;

    return {
      streamUrl: data.streamUrl,
      proxiedUrl: `/api/stream-proxy?url=${encodeURIComponent(
        data.streamUrl
      )}&referer=${encodeURIComponent(data.referer || "")}`,
      type: data.type || "hls",
      referer: data.referer,
      posterUrl: data.posterUrl,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Inicia una sesión de Google Cast enviando exclusivamente el `MediaInfo` del video
 * (con `streamType`, formato HLS TS e imagen/poster) y cierra la sesión si falla para no dejar
 * una sesión vacía o mirroring de toda la pantalla.
 */
async function cargarStreamEnSesionGoogleCast(params: {
  castContext: CastContextInstance;
  candidateUrls: string[];
  contentType: string;
  title: string;
  posterUrl?: string;
  currentTimeSeconds: number;
}): Promise<GoogleCastLoadOutcome> {
  const {
    castContext,
    candidateUrls,
    contentType,
    title,
    posterUrl,
    currentTimeSeconds,
  } = params;
  const chromeCast = window.chrome?.cast;
  if (!chromeCast || candidateUrls.length === 0) {
    return { status: "failed" };
  }

  try {
    await castContext.requestSession();
  } catch (err) {
    const errCode =
      typeof err === "string"
        ? err
        : (err as { code?: string; name?: string } | null)?.code ||
          (err as { code?: string; name?: string } | null)?.name ||
          "";
    if (errCode === "cancel" || errCode === "AbortError") {
      return { status: "cancelled" };
    }
    return { status: "failed" };
  }

  const session = castContext.getCurrentSession();
  if (!session) {
    return { status: "failed" };
  }

  const isHlsContent = contentType === "application/x-mpegurl";

  for (const candidateUrl of candidateUrls) {
    try {
      const mediaInfo = new chromeCast.media.MediaInfo(
        candidateUrl,
        contentType
      );
      if (chromeCast.media.StreamType?.BUFFERED) {
        mediaInfo.streamType = chromeCast.media.StreamType.BUFFERED;
      }
      if (isHlsContent) {
        if (chromeCast.media.HlsSegmentFormat?.TS) {
          mediaInfo.hlsSegmentFormat = chromeCast.media.HlsSegmentFormat.TS;
        }
        if (chromeCast.media.HlsVideoSegmentFormat?.MPEG2_TS) {
          mediaInfo.hlsVideoSegmentFormat =
            chromeCast.media.HlsVideoSegmentFormat.MPEG2_TS;
        }
      }

      const metadata = new chromeCast.media.GenericMediaMetadata();
      metadata.title = title;
      if (posterUrl && /^https?:\/\//i.test(posterUrl) && chromeCast.Image) {
        metadata.images = [new chromeCast.Image(posterUrl)];
      }
      mediaInfo.metadata = metadata;

      const loadRequest = new chromeCast.media.LoadRequest(mediaInfo);
      loadRequest.autoplay = true;
      loadRequest.currentTime = Math.max(0, currentTimeSeconds);

      await session.loadMedia(loadRequest);
      return {
        status: "connected",
        deviceName: session.getCastDevice()?.friendlyName || "tu Smart TV",
      };
    } catch {
      // Intenta la siguiente URL candidata antes de cerrar la sesión
    }
  }

  // Cierre limpio si todas las URLs candidatas fallaron para evitar mirroring vacío
  try {
    if (castContext.getCurrentSession()) {
      castContext.endCurrentSession(true);
    }
  } catch {
    // Silencioso
  }

  return { status: "failed" };
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
  onEpisodeSelect,
  onDurationChange,
}: SmartVideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const presentationConnectionRef = useRef<PresentationConnection | null>(null);
  const { isPro, isModoEscudoActive, loadingMembership, openUpgradeModal } =
    useMembership();

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
  const lastInternalInteractionRef = useRef<number>(0);

  // Estados interactivos para TV Series (Fase 4)
  const [dismissedNextOverlay, setDismissedNextOverlay] = useState<boolean>(false);
  const [nextCountdown, setNextCountdown] = useState<number>(5);

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
  const [isCasting, setIsCasting] = useState<boolean>(false);
  const [castDeviceName, setCastDeviceName] = useState<string | null>(null);
  const [castNotice, setCastNotice] = useState<string | null>(null);
  const [extractedNativeStream, setExtractedNativeStream] =
    useState<ExtractedNativeStream | null>(null);
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
    setExtractedNativeStream(null);
    setCastNotice(null);
    hasDirectTelemetryRef.current = false;
  }, [orderedStreams, preferredLanguage, firstCleanIndex, movieId, episodeId]);

  useEffect(() => {
    setTunnelUsingSecondary(false);
    setSmartPlayerStatus("loading");
    setExtractedNativeStream(null);
    setCastNotice(null);
  }, [activeIndex]);

  useEffect(() => {
    if (!castNotice) return;
    const timer = setTimeout(() => setCastNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [castNotice]);

  const currentStream: SignedMirrorStreamDto | undefined =
    orderedStreams[activeIndex];

  /**
   * Garantiza que `CastContext` esté configurado con el Default Media Receiver
   * antes de abrir cualquier selector para enviar solo el stream del reproductor.
   */
  const asegurarContextoGoogleCastInicializado = useCallback((): boolean => {
    try {
      const castFramework = window.cast?.framework;
      const chromeCast = window.chrome?.cast;
      if (!castFramework || !chromeCast) return false;

      castFramework.CastContext.getInstance().setOptions({
        receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Carga e inicialización automática del SDK Oficial de Google Cast.
   */
  useEffect(() => {
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) {
        asegurarContextoGoogleCastInicializado();
      }
    };

    if (asegurarContextoGoogleCastInicializado()) {
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
  }, [asegurarContextoGoogleCastInicializado]);

  useEffect(() => {
    if (currentStream?.format !== MirrorFormat.EMBED) return;

    const handleInternalInteraction = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("a, button, [role='button'], input, select")) {
        lastInternalInteractionRef.current = Date.now();
      }
    };

    const handleTopRedirectGuard = (event: BeforeUnloadEvent) => {
      if (
        Date.now() - lastInternalInteractionRef.current >= 2500 &&
        iframeRef.current &&
        document.activeElement === iframeRef.current
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    document.addEventListener("pointerdown", handleInternalInteraction, true);
    document.addEventListener("click", handleInternalInteraction, true);
    document.addEventListener("keydown", handleInternalInteraction, true);
    window.addEventListener("beforeunload", handleTopRedirectGuard);

    return () => {
      document.removeEventListener("pointerdown", handleInternalInteraction, true);
      document.removeEventListener("click", handleInternalInteraction, true);
      document.removeEventListener("keydown", handleInternalInteraction, true);
      window.removeEventListener("beforeunload", handleTopRedirectGuard);
    };
  }, [currentStream?.format]);

  useEffect(() => {
    if (!isModoEscudoActive) return;

    const originalWindowOpen = window.open;
    window.open = () => null;

    return () => {
      window.open = originalWindowOpen;
    };
  }, [isModoEscudoActive]);

  /**
   * Flujo de Transmisión exclusivo del reproductor de video (AirPlay + Google Cast MediaInfo + RemotePlayback).
   * Garantiza transmitir únicamente el stream `.m3u8`/`.mp4` o `<video>`, nunca toda la pantalla/pestaña.
   */
  const handleCastClick = useCallback(async () => {
    setCastNotice(null);

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

    if (!isPro) {
      openUpgradeModal("transmitir_tv");
      return;
    }

    const videoEl = videoRef.current;
    const castDisplayTitle = seriesTitle
      ? `${seriesTitle} - T${seasonNumber || 1}:E${episodeNumber || 1} ${episodeTitle || movieTitle}`
      : movieTitle;

    // 1. Apple AirPlay nativo directo sobre <video> en Safari / iOS / macOS
    if (videoEl && typeof videoEl.webkitShowPlaybackTargetPicker === "function") {
      try {
        videoEl.webkitShowPlaybackTargetPicker();
        return;
      } catch {
        // Continúa con Google Cast o RemotePlayback
      }
    }

    // 2. Resolver el stream nativo real (.m3u8 o .mp4), incluso bajo demanda desde iframe/túnel
    let activeNativeStream = extractedNativeStream;
    if (!activeNativeStream && currentStream.format === MirrorFormat.EMBED) {
      activeNativeStream = await resolverStreamNativoBajoDemandaParaCast(
        currentStream.streamUrl
      );
      if (activeNativeStream) {
        setExtractedNativeStream(activeNativeStream);
      }
    }

    let candidateUrls: string[] = [];
    let directContentType = "application/x-mpegurl";
    let castPosterUrl: string | undefined;

    if (activeNativeStream) {
      candidateUrls = construirCandidatosUrlCast(activeNativeStream);
      directContentType =
        activeNativeStream.type === "mp4"
          ? "video/mp4"
          : "application/x-mpegurl";
      castPosterUrl = activeNativeStream.posterUrl;
    } else if (currentStream.format !== MirrorFormat.EMBED) {
      candidateUrls = [
        new URL(currentStream.streamUrl, window.location.origin).toString(),
      ];
      directContentType =
        currentStream.format === MirrorFormat.HLS
          ? "application/x-mpegurl"
          : "video/mp4";
    }

    // 3. Google Cast SDK oficial con MediaInfo del video (re-asegurando options para evitar tab mirroring)
    if (
      candidateUrls.length > 0 &&
      asegurarContextoGoogleCastInicializado() &&
      window.cast?.framework
    ) {
      const castResult = await cargarStreamEnSesionGoogleCast({
        castContext: window.cast.framework.CastContext.getInstance(),
        candidateUrls,
        contentType: directContentType,
        title: castDisplayTitle,
        posterUrl: castPosterUrl,
        currentTimeSeconds:
          currentProgressRef.current || lastSavedSecRef.current || 0,
      });

      if (castResult.status === "connected") {
        videoEl?.pause();
        setCastDeviceName(castResult.deviceName);
        setIsCasting(true);
        return;
      }

      if (castResult.status === "cancelled") {
        return;
      }
    }

    // 4. Remote Playback API nativo sobre <video> (sin bloquear fuentes blob:/MSE de hls.js)
    if (videoEl?.remote?.prompt) {
      try {
        await videoEl.remote.prompt();
        return;
      } catch (err) {
        const name = (err as { name?: string } | null)?.name;
        if (name === "AbortError") return;
      }
    }

    // 5. Túnel interno /api/stream/[token] con video HLS nativo (#pilotoVideo)
    if (
      smartPlayerStatus === "playing_iframe" &&
      currentStream.streamUrl.includes("/api/stream/") &&
      iframeRef.current?.contentWindow
    ) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: "PILOTO_TRIGGER_REMOTE_PLAYBACK" },
          "*"
        );
      } catch {
        // Silencioso
      }
    }

    setCastNotice(
      activeNativeStream
        ? "No se encontró un Chromecast o receptor AirPlay compatible desde este navegador."
        : "Este servidor en modo iframe no permite enviar solo el video; probá otro servidor."
    );
  }, [
    isCasting,
    isPro,
    openUpgradeModal,
    currentStream,
    extractedNativeStream,
    smartPlayerStatus,
    movieTitle,
    seriesTitle,
    seasonNumber,
    episodeNumber,
    episodeTitle,
    asegurarContextoGoogleCastInicializado,
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
        | {
            type?: string;
            mirrorId?: string;
            streamUrl?: string;
            proxiedUrl?: string;
            streamType?: "hls" | "mp4";
            referer?: string;
            posterUrl?: string;
            durationSeconds?: number;
          }
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

      if (
        payload?.type === "PILOTO_NATIVE_HLS_READY" &&
        (!payload.mirrorId || payload.mirrorId === currentStream.mirrorId) &&
        typeof payload.streamUrl === "string" &&
        payload.streamUrl
      ) {
        const resolvedReferer = payload.referer || "";
        const resolvedProxiedUrl =
          typeof payload.proxiedUrl === "string" && payload.proxiedUrl
            ? payload.proxiedUrl
            : `/api/stream-proxy?url=${encodeURIComponent(
                payload.streamUrl
              )}&referer=${encodeURIComponent(resolvedReferer)}`;

        setExtractedNativeStream({
          streamUrl: payload.streamUrl,
          proxiedUrl: resolvedProxiedUrl,
          type: payload.streamType === "mp4" ? "mp4" : "hls",
          referer: resolvedReferer || undefined,
          posterUrl: payload.posterUrl,
        });

        if (
          typeof payload.durationSeconds === "number" &&
          payload.durationSeconds > 60
        ) {
          const cleanDur = Math.floor(payload.durationSeconds);
          totalDurationRef.current = cleanDur;
          setDurationState(cleanDur);
          onDurationChange?.(cleanDur);
        }
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
  }, [currentStream, handleStreamError, saveWatchProgress, onDurationChange]);

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
    if (!isPro) {
      openUpgradeModal("modo_maraton");
      return;
    }
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
    lastInternalInteractionRef.current = Date.now();
    if (onEpisodeSelect) {
      onEpisodeSelect(nextEpisode.id);
    } else {
      window.location.href = `/watch/episode/${nextEpisode.id}`;
    }
  }, [nextEpisode, onEpisodeSelect]);

  useEffect(() => {
    if (!isNearEnd || !nextEpisode || !isPro) return;

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
  }, [isNearEnd, nextEpisode, isPro, handleGoToNextEpisode]);

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
        onMouseEnter={() => {
          if (shieldActive) {
            setShieldActive(false);
            setPlaybackStarted(true);
          }
        }}
        className="group relative w-full aspect-video rounded-xl sm:rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl"
      >
      {/* 1. Header flotante del Reproductor (Fase 4.1) */}
      <div className="absolute top-0 inset-x-0 p-3 sm:p-6 pr-24 sm:pr-48 bg-gradient-to-b from-black/85 via-black/40 to-transparent z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
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
          modoEscudoActivo={isModoEscudoActive}
          isMembershipLoading={loadingMembership}
          onRequestModoEscudo={() => openUpgradeModal("modo_escudo")}
          onStatusChange={setSmartPlayerStatus}
          onNativeStreamReady={setExtractedNativeStream}
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
      {showSkipIntro && !isNearEnd && (
        <div className="absolute bottom-12 sm:bottom-20 right-3 sm:right-8 z-30 animate-fade-in">
          <button
            type="button"
            onClick={handleSkipIntro}
            className="inline-flex items-center gap-2 px-3.5 py-2 sm:px-5 sm:py-2.5 rounded bg-zinc-900/90 hover:bg-white hover:text-black border border-white/40 text-white font-bold text-xs sm:text-sm tracking-wide shadow-2xl backdrop-blur-md transition-all active:scale-95"
          >
            <FastForward className="w-4 h-4" />
            <span>Saltar intro</span>
            {!isPro && (
              <span className="px-1.5 py-0.5 rounded bg-netflix-red text-white text-[9px] font-black uppercase">
                PRO
              </span>
            )}
          </button>
        </div>
      )}

      {/* 3. Botón "Siguiente Episodio" y Autoplay (Fase 4.3) */}
      {isNearEnd && nextEpisode && (
        <div className="absolute inset-x-2.5 bottom-11 sm:bottom-12 sm:left-auto sm:right-8 z-30 sm:w-full sm:max-w-sm bg-zinc-900/95 border border-white/20 rounded-xl p-2.5 sm:p-4 shadow-2xl backdrop-blur-md animate-fade-in">
          <div className="flex items-center justify-between pb-1.5 sm:pb-2 mb-1.5 sm:mb-2 border-b border-white/10 text-xs">
            <span className="font-bold text-white flex items-center gap-1.5 min-w-0">
              <FastForward className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              {isPro ? (
                <span>Siguiente episodio en {nextCountdown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={() => openUpgradeModal("modo_maraton")}
                  className="text-left hover:underline flex items-center gap-1.5"
                >
                  <span>Autoplay automático</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black uppercase">
                    PRO
                  </span>
                </button>
              )}
            </span>
            <button
              type="button"
              onClick={() => setDismissedNextOverlay(true)}
              className="text-zinc-400 hover:text-white p-1"
              title="Cancelar"
              aria-label="Cancelar reproducción automática"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {nextEpisode.thumbnailUrl && (
              <div className="hidden sm:block relative aspect-video w-24 rounded-md overflow-hidden bg-zinc-800 flex-shrink-0">
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

          <div className="mt-2.5 sm:mt-3 flex items-center gap-2">
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

      {castNotice && (
        <div className="absolute top-12 sm:top-14 left-2.5 right-2.5 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-30 sm:max-w-[90%] flex items-center gap-2 rounded-lg bg-zinc-950/95 border border-white/15 px-3 py-2 text-xs font-medium text-zinc-200 shadow-xl backdrop-blur-md">
          <Cast className="w-3.5 h-3.5 text-netflix-red flex-shrink-0" />
          <span className="truncate sm:whitespace-normal">{castNotice}</span>
          <button
            type="button"
            onClick={() => setCastNotice(null)}
            aria-label="Cerrar aviso"
            className="text-zinc-400 hover:text-white p-0.5 ml-auto flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Único control flotante sobre el reproductor: Transmitir a TV */}
      <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-20 flex items-center justify-end opacity-95 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={handleCastClick}
          title={isCasting ? "Desconectar de la TV" : "Transmitir a TV"}
          aria-label={isCasting ? "Desconectar de la TV" : "Transmitir a TV"}
          className={`inline-flex items-center justify-center gap-1.5 h-8 px-2.5 sm:px-3 sm:py-1.5 rounded-lg text-white text-xs font-semibold border border-white/15 backdrop-blur-md shadow-lg transition ${
            isCasting
              ? "bg-netflix-red hover:bg-red-700"
              : "bg-black/75 hover:bg-netflix-red"
          }`}
        >
          <Cast className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {isCasting ? "Conectado a TV" : "Transmitir a TV"}
          </span>
          {!isPro && !isCasting && (
            <span className="px-1 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black uppercase leading-none">
              PRO
            </span>
          )}
        </button>
      </div>
      </div>

      {/* Barra inferior eliminada para mantener la interfaz lo más simple posible */}
    </div>
  );
}
