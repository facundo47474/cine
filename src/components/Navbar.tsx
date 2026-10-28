"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Film,
  PlusCircle,
  ShieldCheck,
  Search,
  Activity,
  X,
  Database,
} from "lucide-react";

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenImportModal: () => void;
  onRunHealthCheck: () => Promise<void>;
  isCheckingHealth: boolean;
  tmdbConnected?: boolean;
}

export default function Navbar({
  searchQuery,
  onSearchChange,
  onOpenImportModal,
  onRunHealthCheck,
  isCheckingHealth,
  tmdbConnected = false,
}: NavbarProps) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/95 via-black/80 to-transparent backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-lg bg-netflix-red flex items-center justify-center shadow-lg shadow-red-900/40">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black tracking-tighter text-netflix-red group-hover:text-red-500 transition">
                PILOTO
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
                v2.0
              </span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-zinc-300">
            <Link href="/" className="text-white hover:text-zinc-300 transition">
              Inicio
            </Link>
            <a href="#explorar" className="hover:text-white transition">
              Plataformas
            </a>
            <a href="#catalogo" className="hover:text-white transition">
              Catálogo Masivo
            </a>
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              AES-256-GCM + Auto-Failover
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                tmdbConnected
                  ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                  : "bg-amber-500/10 text-amber-300 border-amber-500/20"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              {tmdbConnected ? "TMDB Live +500K" : "Catálogo Híbrido Local"}
            </span>
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center">
            {showSearch || searchQuery ? (
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Buscar película, actor, género..."
                  autoFocus
                  onBlur={() => {
                    if (!searchQuery) setShowSearch(false);
                  }}
                  className="w-48 sm:w-72 bg-black/90 border border-white/25 rounded-full pl-9 pr-8 py-1.5 text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-netflix-red transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      onSearchChange("");
                      setShowSearch(false);
                    }}
                    className="absolute right-2.5 text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 hover:text-white transition"
                title="Buscar en el catálogo"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Buscar...</span>
              </button>
            )}
          </div>

          <button
            onClick={onRunHealthCheck}
            disabled={isCheckingHealth}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition disabled:opacity-50"
            title="Ejecutar Health Checker sobre los Mirrors"
          >
            <Activity
              className={`w-4 h-4 text-amber-400 ${
                isCheckingHealth ? "animate-spin" : ""
              }`}
            />
            <span className="hidden sm:inline">
              {isCheckingHealth ? "Auditando..." : "Testear Mirrors"}
            </span>
          </button>

          <button
            onClick={onOpenImportModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-netflix-red hover:bg-red-700 text-white shadow-md transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Importar VIP</span>
          </button>
        </div>
      </div>
    </header>
  );
}
