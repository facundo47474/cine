"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Sparkles, Loader2, Cloud, BookmarkCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroBanner from "@/components/HeroBanner";
import MovieRow from "@/components/MovieRow";
import MovieCard from "@/components/MovieCard";
import Footer from "@/components/Footer";
import ProviderFilterBar, {
  STREAMING_PROVIDERS,
  GENRE_PILLS,
} from "@/components/ProviderFilterBar";
import { useMembership } from "@/components/MembershipProvider";
import { FREE_MY_LIST_LIMIT } from "@/domain/services/MembershipPolicy";
import {
  CatalogCardDto,
  HomeFeedDto,
} from "@/application/dto/CatalogFeedDto";
import { ContinueWatchingItemDto } from "@/application/services/WatchHistoryService";

/**
 * Vista interactiva principal del catálogo autenticado (carruseles, búsqueda, filtros y listas personales).
 */
export default function HomeCatalogClient() {
  const { isPro, myList, openUpgradeModal } = useMembership();
  const [homeFeed, setHomeFeed] = useState<HomeFeedDto | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [continueWatching, setContinueWatching] = useState<
    ContinueWatchingItemDto[]
  >([]);
  const [historyLimitedByPlan, setHistoryLimitedByPlan] =
    useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<
    number | undefined
  >(undefined);
  const [selectedGenreId, setSelectedGenreId] = useState<number | undefined>(
    undefined
  );
  const [selectedMediaType, setSelectedMediaType] = useState<
    "movie" | "tv" | undefined
  >(undefined);
  const [exploreItems, setExploreItems] = useState<CatalogCardDto[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const lastHistoryFetchAtRef = useRef<number>(0);
  const previousIsProRef = useRef<boolean | null>(null);

  const isExploring =
    Boolean(searchQuery.trim()) ||
    selectedProviderId !== undefined ||
    selectedGenreId !== undefined ||
    selectedMediaType !== undefined;

  const refreshContinueWatching = useCallback(async (force: boolean = false) => {
    const now = Date.now();
    if (!force && now - lastHistoryFetchAtRef.current < 30_000) {
      return;
    }
    lastHistoryFetchAtRef.current = now;
    try {
      const historyRes = await fetch("/api/history", { cache: "no-store" });
      const historyData = await historyRes.json();
      if (historyData.ok) {
        setContinueWatching(historyData.items);
        setHistoryLimitedByPlan(Boolean(historyData.isLimitedByFreePlan));
      }
    } catch {
      // Silencioso
    }
  }, []);

  const fetchHomeAndHistory = useCallback(async () => {
    setLoading(true);
    setHomeError(null);
    try {
      lastHistoryFetchAtRef.current = Date.now();
      const [homeRes, historyRes] = await Promise.all([
        fetch("/api/movies?mode=home"),
        fetch("/api/history", { cache: "no-store" }),
      ]);

      const homeData = await homeRes.json();
      const historyData = await historyRes.json().catch(() => ({ ok: false }));

      if (homeRes.ok && homeData.ok) {
        setHomeFeed(homeData);
      } else {
        setHomeError("No pudimos cargar el catálogo en este momento.");
      }
      if (historyRes.ok && historyData.ok) {
        setContinueWatching(historyData.items);
        setHistoryLimitedByPlan(Boolean(historyData.isLimitedByFreePlan));
      }
    } catch (error) {
      console.error("Error cargando catálogo:", error);
      setHomeError("No pudimos cargar el catálogo en este momento.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExploreCatalog = useCallback(
    async (targetPage: number, append: boolean = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set("q", searchQuery.trim());
        if (selectedProviderId !== undefined)
          params.set("providerId", String(selectedProviderId));
        if (selectedGenreId !== undefined)
          params.set("genreId", String(selectedGenreId));
        if (selectedMediaType !== undefined)
          params.set("mediaType", selectedMediaType);
        params.set("page", String(targetPage));

        const res = await fetch(`/api/movies?${params.toString()}`);
        const data = await res.json();

        if (data.ok) {
          setExploreItems((prev) =>
            append ? [...prev, ...data.items] : data.items
          );
          setPage(data.page || targetPage);
          setTotalPages(data.totalPages || 1);
        }
      } catch (error) {
        console.error("Error explorando catálogo:", error);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [searchQuery, selectedProviderId, selectedGenreId, selectedMediaType]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get("type");
      if (t === "movie" || t === "tv") {
        setSelectedMediaType(t);
      }
    }
    fetchHomeAndHistory();
  }, [fetchHomeAndHistory]);

  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void refreshContinueWatching(false);
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [refreshContinueWatching]);

  // Refresca el historial al instante solo cuando cambia la membresía tras el montaje inicial
  useEffect(() => {
    if (previousIsProRef.current === null) {
      previousIsProRef.current = isPro;
      return;
    }
    if (previousIsProRef.current === isPro) {
      return;
    }
    previousIsProRef.current = isPro;
    void refreshContinueWatching(true);
  }, [isPro, refreshContinueWatching]);

  useEffect(() => {
    if (!isExploring) return;
    const timer = setTimeout(() => {
      fetchExploreCatalog(1, false);
    }, 220);
    return () => clearTimeout(timer);
  }, [
    isExploring,
    searchQuery,
    selectedProviderId,
    selectedGenreId,
    selectedMediaType,
    fetchExploreCatalog,
  ]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedProviderId(undefined);
    setSelectedGenreId(undefined);
    setSelectedMediaType(undefined);
    setPage(1);
  };

  const activeProviderName = STREAMING_PROVIDERS.find(
    (p) => p.id === selectedProviderId
  )?.name;
  const activeGenreName = GENRE_PILLS.find(
    (g) => g.id === selectedGenreId
  )?.name;
  const activeTypeLabel =
    selectedMediaType === "tv"
      ? "Series"
      : selectedMediaType === "movie"
      ? "Películas"
      : "Catálogo";

  return (
    <div className="min-h-screen bg-[#141414] flex flex-col justify-between">
      <div>
        <Navbar
          onSearchChange={setSearchQuery}
          searchQuery={searchQuery}
          selectedMediaType={selectedMediaType}
          onSelectMediaType={(type) => {
            setSelectedMediaType(type);
            setPage(1);
            if (type === undefined) {
              setSelectedProviderId(undefined);
              setSelectedGenreId(undefined);
              setSearchQuery("");
            }
          }}
        />

        {!isExploring && homeFeed?.featured && (
          <HeroBanner movie={homeFeed.featured} />
        )}

        <main
          id="explorar"
          className={`space-y-8 ${
            isExploring || !homeFeed?.featured
              ? "pt-28 sm:pt-24"
              : "-mt-6 sm:-mt-10 relative z-20"
          }`}
        >
          <ProviderFilterBar
            selectedProviderId={selectedProviderId}
            selectedGenreId={selectedGenreId}
            onSelectProvider={(id) => {
              setSelectedProviderId(id);
              setPage(1);
            }}
            onSelectGenre={(id) => {
              setSelectedGenreId(id);
              setPage(1);
            }}
            onResetFilters={handleResetFilters}
          />

          {isExploring ? (
            <section
              id="catalogo"
              className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                <h2 className="text-base sm:text-2xl font-black text-white flex items-start sm:items-center gap-2 leading-snug break-words">
                  <Sparkles className="w-5 h-5 text-netflix-red flex-shrink-0 mt-0.5 sm:mt-0" />
                  <span>
                    {searchQuery
                      ? `Resultados en ${activeTypeLabel} para "${searchQuery}"`
                      : `${activeTypeLabel} • ${activeProviderName || "Todo el Catálogo"} • ${
                          activeGenreName || "Todos los géneros"
                        }`}
                  </span>
                </h2>
              </div>

              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {Array.from({ length: 12 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="aspect-[2/3] rounded-xl bg-zinc-800/60 animate-pulse border border-white/5"
                    />
                  ))}
                </div>
              ) : exploreItems.length === 0 ? (
                <div className="py-16 text-center space-y-3 bg-zinc-900/40 rounded-2xl border border-white/5">
                  <p className="text-zinc-300 font-semibold">
                    No encontramos títulos con ese criterio.
                  </p>
                  <button
                    onClick={handleResetFilters}
                    className="px-4 py-2 rounded-lg bg-netflix-red text-white text-xs font-bold"
                  >
                    Ver todo el catálogo
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {exploreItems.map((movie) => (
                      <MovieCard
                        fullWidth
                        id={movie.id}
                        key={`${movie.id}-${movie.tmdbId}`}
                        posterUrl={movie.posterUrl}
                        qualityBadge={movie.qualityBadge}
                        rating={movie.rating}
                        releaseYear={movie.releaseYear}
                        title={movie.title}
                        mediaType={movie.mediaType}
                      />
                    ))}
                  </div>

                  {page < totalPages && (
                    <div className="pt-6 flex justify-center">
                      <button
                        onClick={() => fetchExploreCatalog(page + 1, true)}
                        disabled={loadingMore}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm border border-white/15 transition shadow-lg disabled:opacity-50"
                      >
                        {loadingMore ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Cargando más títulos...
                          </>
                        ) : (
                          <span>Ver más títulos</span>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            <div id="catalogo" className="space-y-4">
              {continueWatching.length > 0 && (
                <section className="space-y-3 py-2">
                  <div className="px-4 sm:px-8 max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg sm:text-xl font-bold text-white">
                      Continuar viendo
                    </h2>
                    {(!isPro || historyLimitedByPlan) && (
                      <button
                        type="button"
                        onClick={() => openUpgradeModal("cloud_sync")}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-[11px] font-semibold text-zinc-300 hover:text-white transition"
                      >
                        <Cloud className="w-3.5 h-3.5 text-netflix-red flex-shrink-0" />
                        <span>Sincronización Cloud</span>
                        <span className="px-1.5 py-0.5 rounded bg-netflix-red text-white text-[9px] font-black uppercase">
                          PRO
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="px-4 sm:px-8 max-w-7xl mx-auto">
                    <div className="flex items-stretch gap-4 overflow-x-auto no-scrollbar pb-3 pt-1">
                      {continueWatching.map((item) => (
                        <MovieCard
                          id={item.movieId}
                          key={item.episodeId ? `${item.movieId}-${item.episodeId}` : item.movieId}
                          posterUrl={item.posterUrl}
                          progressPercentage={item.progressPercentage}
                          qualityBadge={item.qualityBadge}
                          releaseYear={item.releaseYear}
                          title={item.title}
                          mediaType={item.mediaType}
                          episodeId={item.episodeId}
                          seasonNumber={item.seasonNumber}
                          episodeNumber={item.episodeNumber}
                          episodeTitle={item.episodeTitle}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {myList.length > 0 && (
                <section className="space-y-3 py-2">
                  <div className="px-4 sm:px-8 max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BookmarkCheck className="w-5 h-5 text-netflix-red flex-shrink-0" />
                      <h2 className="text-lg sm:text-xl font-bold text-white">
                        Mi Lista
                      </h2>
                      <span className="text-xs text-zinc-400 font-medium">
                        {isPro
                          ? `(${myList.length} guardados • Ilimitado)`
                          : `(${myList.length}/${FREE_MY_LIST_LIMIT} en Plan Gratis)`}
                      </span>
                    </div>
                    {!isPro && (
                      <button
                        type="button"
                        onClick={() => openUpgradeModal("mi_lista")}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-[11px] font-semibold text-zinc-300 hover:text-white transition"
                      >
                        <span>Espacio Ilimitado</span>
                        <span className="px-1.5 py-0.5 rounded bg-netflix-red text-white text-[9px] font-black uppercase">
                          PRO
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="px-4 sm:px-8 max-w-7xl mx-auto">
                    <div className="flex items-stretch gap-4 overflow-x-auto no-scrollbar pb-3 pt-1">
                      {myList.map((movie) => (
                        <MovieCard
                          id={movie.id}
                          key={`mylist-${movie.id}`}
                          posterUrl={movie.posterUrl}
                          qualityBadge={movie.qualityBadge}
                          rating={movie.rating}
                          releaseYear={movie.releaseYear}
                          title={movie.title}
                          mediaType={movie.mediaType}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {loading ? (
                <div className="max-w-7xl mx-auto px-4 sm:px-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 py-8">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="aspect-[2/3] rounded-xl bg-zinc-800/60 animate-pulse border border-white/5"
                    />
                  ))}
                </div>
              ) : !homeFeed ? (
                <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
                  <div className="py-12 px-6 text-center space-y-4 bg-zinc-900/60 rounded-2xl border border-white/10">
                    <p className="text-sm sm:text-base text-zinc-200 font-semibold">
                      {homeError ||
                        "No pudimos cargar el catálogo en este momento."}
                    </p>
                    <button
                      type="button"
                      onClick={() => void fetchHomeAndHistory()}
                      className="px-5 py-2.5 rounded-lg bg-netflix-red hover:bg-red-700 text-white text-xs sm:text-sm font-bold transition"
                    >
                      Reintentar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <MovieRow
                    movies={homeFeed.trending}
                    title="Tendencias de la Semana"
                  />

                  {homeFeed.series && homeFeed.series.length > 0 && (
                    <MovieRow
                      movies={homeFeed.series}
                      title="Series de TV Populares"
                      subtitle="Temporadas completas para maratonear"
                    />
                  )}

                  <MovieRow
                    movies={homeFeed.nowPlaying}
                    title="Estrenos en Cartelera"
                  />

                  <MovieRow
                    movies={homeFeed.netflix}
                    title="Populares en Netflix"
                  />

                  <MovieRow movies={homeFeed.max} title="Populares en Max" />

                  <MovieRow
                    movies={homeFeed.disney}
                    title="Populares en Disney+"
                  />

                  <MovieRow
                    movies={homeFeed.prime}
                    title="Populares en Prime Video"
                  />

                  <MovieRow
                    movies={homeFeed.topRated}
                    title="Aclamadas por la Crítica"
                  />
                </>
              )}
            </div>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
}
