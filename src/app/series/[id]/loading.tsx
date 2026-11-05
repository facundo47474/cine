import React from "react";
import Navbar from "@/components/Navbar";

export default function SeriesLoading() {
  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col">
      <Navbar />

      <main className="flex-1 pb-16">
        {/* Skeleton del Hero Banner */}
        <div className="relative w-full h-[65vh] sm:h-[75vh] max-h-[800px] min-h-[500px] bg-zinc-900 animate-pulse overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/60 to-transparent z-10" />
          <div className="absolute bottom-12 inset-x-0 max-w-7xl mx-auto px-4 sm:px-8 z-20 space-y-4">
            <div className="w-24 h-6 rounded bg-zinc-800" />
            <div className="w-72 sm:w-96 h-10 sm:h-12 rounded-lg bg-zinc-800" />
            <div className="w-full max-w-xl h-16 rounded bg-zinc-800/80" />
            <div className="w-44 h-12 rounded-xl bg-zinc-700/80 mt-4" />
          </div>
        </div>

        {/* Skeleton de la lista de episodios */}
        <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6 mt-8">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div className="w-36 h-8 rounded bg-zinc-800 animate-pulse" />
            <div className="w-44 h-10 rounded-lg bg-zinc-800 animate-pulse" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="bg-zinc-900/60 rounded-xl border border-white/5 overflow-hidden animate-pulse space-y-3 p-3"
              >
                <div className="aspect-video w-full rounded-lg bg-zinc-800" />
                <div className="space-y-2">
                  <div className="w-3/4 h-4 rounded bg-zinc-800" />
                  <div className="w-1/2 h-3 rounded bg-zinc-800/60" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

