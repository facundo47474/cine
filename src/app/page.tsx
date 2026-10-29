"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroBanner from "@/components/HeroBanner";
import MovieRow from "@/components/MovieRow";
import MovieCard from "@/components/MovieCard";
import ProviderFilterBar, {
  STREAMING_PROVIDERS,
  GENRE_PILLS,
} from "@/components/ProviderFilterBar";
import {
  CatalogCardDto,
  HomeFeedDto,
} from "@/application/dto/CatalogFeedDto";
import { ContinueWatchingItemDto } from "@/application/services/WatchHistoryService";

export default function HomePage() {
  const [homeFeed, setHomeFeed] = useState<HomeFeedDto | null>(null);
  const [continueWatching, setContinueWatching] = useState<
    ContinueWatchingItemDto[]
  >([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<
    number | undefined
  >(undefined);
  const [selectedGenreId, setSelectedGenreId] = useState<number | undefined>(
    undefined
  );
  const [exploreItems, setExploreItems] = useState<CatalogCardDto[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const isExploring =
    Boolean(searchQuery.trim()) ||
    selectedProviderId !== undefined ||
    selectedGenreId !== undefined;

  const fetchHomeAndHistory = useCallback(async () => {
    setLoading(true);
    try {
      const [homeRes, historyRes] = await Promise.all([
        fetch("/api/movies?mode=home"),
        fetch("/api/history"),
      ]);

      const homeData = await homeRes.json();
      const historyData = await historyRes.json();

      if (homeData.ok) {
        setHomeFeed(homeData);
      }
      if (historyData.ok) {
        setContinueWatching(historyData.items);
      }
    } catch (error) {
      console.error("Error cargando catálogo:", error);
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
    [searchQuery, selectedProviderId, selectedGenreId]
  );

  useEffect(() => {
    fetchHomeAndHistory();
  }, [fetchHomeAndHistory]);

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
    fetchExploreCatalog,
  ]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedProviderId(undefined);
    setSelectedGenreId(undefined);
    setPage(1);
  };

  const activeProviderName = STREAMING_PROVIDERS.find(
    (p) => p.id === selectedProviderId
  )?.name;
  const activeGenreName = GENRE_PILLS.find(
    (g) => g.id === selectedGenreId
  )?.name;

  return (
    <div className="min-h-screen bg-[#141414] pb-24">
      <Navbar onSearchChange={setSearchQuery} searchQuery={searchQuery} />

      {!isExploring && homeFeed?.featured && (
        <HeroBanner movie={homeFeed.featured} />
      )}

      <main
        id="explorar"
        className={`space-y-8 ${
          isExploring || !homeFeed?.featured
            ? "pt-24"
            : "-mt-10 relative z-20"
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
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-netflix-red" />
                {searchQuery
                  ? `Resultados para "${searchQuery}"`
                  : `${activeProviderName || "Catálogo"} • ${
                      activeGenreName || "Todos los géneros"
                    }`}
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
                  No encontramos películas con ese criterio.
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
                          Cargando más películas...
                        </>
                      ) : (
                        <span>Ver más películas</span>
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
                <div className="px-4 sm:px-8 max-w-7xl mx-auto">
                  <h2 className="text-lg sm:text-xl font-bold text-white">
                    Continuar viendo
                  </h2>
                </div>
                <div className="px-4 sm:px-8 max-w-7xl mx-auto">
                  <div className="flex items-stretch gap-4 overflow-x-auto no-scrollbar pb-3 pt-1">
                    {continueWatching.map((item) => (
                      <MovieCard
                        id={item.movieId}
                        key={item.movieId}
                        posterUrl={item.posterUrl}
                        progressPercentage={item.progressPercentage}
                        qualityBadge={item.qualityBadge}
                        releaseYear={item.releaseYear}
                        title={item.title}
                      />
                    ))}
                  </div>
                </div>
              </section>
            )}

            {loading || !homeFeed ? (
              <div className="max-w-7xl mx-auto px-4 sm:px-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 py-8">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="aspect-[2/3] rounded-xl bg-zinc-800/60 animate-pulse border border-white/5"
                  />
                ))}
              </div>
            ) : (
              <>
                <MovieRow
                  movies={homeFeed.trending}
                  title="Tendencias de la Semana"
                />

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
  );
}
