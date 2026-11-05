import React from "react";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeriesHeroBanner from "@/components/SeriesHeroBanner";
import EpisodeList from "@/components/EpisodeList";
import { getSeriesDetailsAction } from "@/app/actions/seriesActions";

interface SeriesPageProps {
  params: {
    id: string;
  };
}

export const dynamic = "force-dynamic";

export default async function SeriesPage({ params }: SeriesPageProps) {
  const series = await getSeriesDetailsAction(params.id);

  if (!series) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col">
      <Navbar />

      <main className="flex-1 pb-16">
        {/* Hero Banner Inmersivo */}
        <SeriesHeroBanner series={series} />

        {/* Contenido principal */}
        <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-12 mt-6">
          {/* Lista de episodios con selector de temporadas */}
          <EpisodeList
            seriesId={series.id}
            seasons={series.seasons}
            initialEpisodes={series.currentSeasonEpisodes}
            fallbackBackdrop={series.backdropUrl || series.posterUrl}
          />

          {/* Elenco / Reparto */}
          {series.cast && series.cast.length > 0 && (
            <section className="space-y-4 pt-6 border-t border-zinc-800">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Reparto principal
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {series.cast.slice(0, 6).map((actor) => (
                  <div
                    key={actor.id}
                    className="flex flex-col items-center text-center p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-2 hover:border-white/20 transition"
                  >
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0">
                      {actor.profileUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={actor.profileUrl}
                          alt={actor.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-zinc-500 text-lg">
                          {actor.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs sm:text-sm font-semibold text-white truncate max-w-[120px]">
                        {actor.name}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate max-w-[120px]">
                        {actor.character}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Ficha técnica y metadatos */}
          <section className="pt-6 border-t border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-zinc-400">
            <div>
              <span className="text-zinc-500 block text-xs uppercase font-semibold mb-1">
                Título original
              </span>
              <p className="text-zinc-200">
                {series.originalTitle || series.title}
              </p>
            </div>
            <div>
              <span className="text-zinc-500 block text-xs uppercase font-semibold mb-1">
                Géneros
              </span>
              <p className="text-zinc-200">{series.genres.join(", ")}</p>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

