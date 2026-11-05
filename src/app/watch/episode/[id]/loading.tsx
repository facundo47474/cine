import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function WatchEpisodeLoading() {
  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col">
      <header className="fixed top-0 inset-x-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-8 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-zinc-300 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al catálogo</span>
        </Link>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-8 pt-20 pb-16 w-full space-y-6 sm:space-y-8">
        <div className="w-full aspect-video rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center space-y-3 animate-pulse">
          <div className="w-10 h-10 border-4 border-netflix-red border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-zinc-400 font-medium">
            Preparando reproductor...
          </p>
        </div>

        <div className="bg-zinc-900/40 border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-4 animate-pulse">
          <div className="w-24 h-5 rounded bg-zinc-800" />
          <div className="w-64 h-7 rounded bg-zinc-800" />
          <div className="w-full max-w-2xl h-12 rounded bg-zinc-800/60" />
        </div>
      </main>
    </div>
  );
}

