"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Sparkles, Loader2, KeyRound } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroBanner from "@/components/HeroBanner";
import MovieRow from "@/components/MovieRow";
import MovieCard from "@/components/MovieCard";
import ProviderFilterBar, {
  STREAMING_PROVIDERS,
  GENRE_PILLS,
} from "@/components/ProviderFilterBar";
import ImportMovieModal from "@/components/ImportMovieModal";
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

  // Estado de exploración / filtros / paginación
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
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [healthBanner, setHealthBanner] = useState<string | null>(null);

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
      console.error("Error cargando Home Feed:", error);
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

  // Carga inicial del Home Feed
  useEffect(() => {
    fetchHomeAndHistory();
  }, [fetchHomeAndHistory]);

  // Dispara búsqueda o filtrado cuando cambian los criterios
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

  const handleRunHealthCheck = async () => {
    setIsCheckingHealth(true);
    setHealthBanner(null);
    try {
      const res = await fetch(
        "/api/health/cron?secret=piloto_cron_secret_2026_seguro"
      );
      const data = await res.json();
      if (data.ok && data.report) {
        const r = data.report;
        setHealthBanner(
          `Auditoría Health Checker completada: ${r.totalChecked} mirrors verificados (${r.aliveCount} activos, ${r.underReviewCount} en revisión, ${r.downCount} caídos).`
        );
        await fetchHomeAndHistory();
      }
    } catch {
      setHealthBanner("Error al ejecutar la auditoría de enlaces.");
    } finally {
      setIsCheckingHealth(false);
    }
  };

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
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenImportModal={() => setIsImportOpen(true)}
        onRunHealthCheck={handleRunHealthCheck}
        isCheckingHealth={isCheckingHealth}
        tmdbConnected={homeFeed?.tmdbConnected}
      />

      {/* Notificación del Health Checker */}
      {healthBanner && (
        <div className="pt-20 px-4 sm:px-8 max-w-7xl mx-auto">
          <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
            <span>{healthBanner}</span>
            <button
              onClick={() => setHealthBanner(null)}
              className="underline ml-4"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Hero Banner Principal cuando estamos en el Home */}
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
        {/* Aviso sutil si aún no puso TMDB_API_KEY en .env */}
        {homeFeed && !homeFeed.tmdbConnected && (
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>
                  <strong>Modo Catálogo Curado Activo:</strong> Estás navegando
                  con las películas precargadas y de muestra. Para desbloquear{" "}
                  <strong>+500.000 películas en vivo de TMDB</strong>, coloca tu{" "}
                  <code className="px-1.5 py-0.5 rounded bg-black/40 text-white">
                    TMDB_API_KEY
                  </code>{" "}
                  gratuita en tu archivo <code className="text-white">.env</code>.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Hub de Plataformas (Netflix, Disney+, Max, Prime Video, Apple TV+) y Géneros */}
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

        {/* Vista de Exploración / Búsqueda en Grilla Paginada */}
        {isExploring ? (
          <section
            id="catalogo"
            className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-netflix-red" />
                  {searchQuery
                    ? `Resultados para "${searchQuery}"`
                    : `${activeProviderName || "Catálogo"} • ${
                        activeGenreName || "Todos los géneros"
                      }`}
                </h2>
                <p className="text-xs text-zinc-400">
                  Haz clic en cualquier película para activar el Auto-Resolver
                  de Mirrors con cifrado AES-256-GCM
                </p>
              </div>
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
                  No se encontraron películas para este filtro.
                </p>
                <button
                  onClick={handleResetFilters}
                  className="px-4 py-2 rounded-lg bg-netflix-red text-white text-xs font-bold"
                >
                  Restablecer filtros
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {exploreItems.map((movie) => (
                    <MovieCard
                      key={`${movie.id}-${movie.tmdbId}`}
                      id={movie.id}
                      title={movie.title}
                      posterUrl={movie.posterUrl}
                      releaseYear={movie.releaseYear}
                      qualityBadge={movie.qualityBadge}
                      rating={movie.rating}
                      isLocalVip={movie.isLocalVip}
                      fullWidth
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
                        <span>
                          Cargar más películas (Página {page} de {totalPages})
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          /* Home Feed Masivo por Filas Estilo Netflix */
          <div id="catalogo" className="space-y-4">
            {/* Fila Continuar Viendo */}
            {continueWatching.length > 0 && (
              <section className="space-y-3 py-2">
                <div className="px-4 sm:px-8 max-w-7xl mx-auto">
                  <h2 className="text-lg sm:text-xl font-bold text-white">
                    Continuar viendo
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Sincronizado automáticamente en tu dispositivo sin login
                  </p>
                </div>
                <div className="px-4 sm:px-8 max-w-7xl mx-auto">
                  <div className="flex items-stretch gap-4 overflow-x-auto no-scrollbar pb-3 pt-1">
                    {continueWatching.map((item) => (
                      <MovieCard
                        key={item.movieId}
                        id={item.movieId}
                        title={item.title}
                        posterUrl={item.posterUrl}
                        releaseYear={item.releaseYear}
                        qualityBadge={item.qualityBadge}
                        progressPercentage={item.progressPercentage}
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
                  title="🔥 Tendencias de la Semana"
                  subtitle="Las películas más vistas en todo el mundo con Auto-Resolver Multi-Servidor"
                  movies={homeFeed.trending}
                />

                {homeFeed.localVip.length > 0 && (
                  <MovieRow
                    title="⚡ Catálogo VIP Directo (Verificado por Health Checker)"
                    subtitle="Alojadas en tu PostgreSQL con conmutación por error instantánea"
                    movies={homeFeed.localVip}
                  />
                )}

                <MovieRow
                  title="🍿 Estrenos en Cartelera"
                  subtitle="Recién llegadas de los cines"
                  movies={homeFeed.nowPlaying}
                />

                <MovieRow
                  title="🔴 Top en Netflix"
                  subtitle="Tendencias disponibles en el catálogo de Netflix"
                  movies={homeFeed.netflix}
                />

                <MovieRow
                  title="🟣 Top en Max (HBO)"
                  subtitle="Grandes producciones y cine aclamado de Max"
                  movies={homeFeed.max}
                />

                <MovieRow
                  title="🔵 Top en Disney+"
                  subtitle="Marvel, Pixar, Star Wars y estrenos familiares"
                  movies={homeFeed.disney}
                />

                <MovieRow
                  title="💠 Top en Amazon Prime Video"
                  subtitle="Acción, suspenso y éxitos de Prime Video"
                  movies={homeFeed.prime}
                />

                <MovieRow
                  title="⭐ Mejor Valoradas por la Crítica"
                  subtitle="Obras maestras del cine con calificación sobresaliente"
                  movies={homeFeed.topRated}
                />
              </>
            )}
          </div>
        )}
      </main>

      <ImportMovieModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={() => fetchHomeAndHistory()}
      />
    </div>
  );
}
