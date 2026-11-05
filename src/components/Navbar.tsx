"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Film, Search, X, LogOut, User as UserIcon } from "lucide-react";

interface NavbarProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  selectedMediaType?: "movie" | "tv";
  onSelectMediaType?: (type: "movie" | "tv" | undefined) => void;
}

export default function Navbar({
  searchQuery = "",
  onSearchChange,
  selectedMediaType,
  onSelectMediaType,
}: NavbarProps) {
  const [showSearch, setShowSearch] = useState(false);
  const { data: session } = useSession();

  const handleNavFilter = (type: "movie" | "tv" | undefined) => {
    if (onSelectMediaType) {
      onSelectMediaType(type);
      if (type) {
        const el = document.getElementById("explorar");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/95 via-black/80 to-transparent backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-4 sm:gap-8 min-w-0">
          <Link
            className="flex items-center gap-2 group flex-shrink-0"
            href="/"
            onClick={() => {
              if (onSelectMediaType) onSelectMediaType(undefined);
            }}
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-netflix-red flex items-center justify-center shadow-lg shadow-red-900/40">
              <Film className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <span
              className={`${
                showSearch ? "hidden sm:inline" : "inline"
              } text-xl sm:text-2xl font-black tracking-tighter text-netflix-red group-hover:text-red-500 transition`}
            >
              PILOTO
            </span>
          </Link>

          <nav className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm font-medium text-zinc-300">
            {onSelectMediaType ? (
              <>
                <button
                  type="button"
                  onClick={() => handleNavFilter(undefined)}
                  className={`transition ${
                    selectedMediaType === undefined
                      ? "text-white font-bold"
                      : "text-zinc-300 hover:text-white"
                  }`}
                >
                  Inicio
                </button>
                <a
                  href="#explorar"
                  className="hidden sm:inline text-zinc-300 hover:text-white transition"
                >
                  Plataformas
                </a>
                <button
                  type="button"
                  onClick={() => handleNavFilter("movie")}
                  className={`transition ${
                    selectedMediaType === "movie"
                      ? "text-netflix-red font-bold"
                      : "text-zinc-300 hover:text-white"
                  }`}
                >
                  Películas
                </button>
                <button
                  type="button"
                  onClick={() => handleNavFilter("tv")}
                  className={`transition ${
                    selectedMediaType === "tv"
                      ? "text-netflix-red font-bold"
                      : "text-zinc-300 hover:text-white"
                  }`}
                >
                  Series
                </button>
              </>
            ) : (
              <>
                <Link
                  className="text-white hover:text-zinc-300 transition"
                  href="/"
                >
                  Inicio
                </Link>
                <Link
                  href="/#explorar"
                  className="hidden sm:inline hover:text-white transition"
                >
                  Plataformas
                </Link>
                <Link
                  href="/?type=movie#explorar"
                  className="hover:text-white transition"
                >
                  Películas
                </Link>
                <Link
                  href="/?type=tv#explorar"
                  className="hover:text-white transition"
                >
                  Series
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-1 sm:flex-initial justify-end">
          {onSearchChange && (showSearch || searchQuery) ? (
            <div className="relative flex items-center flex-1 sm:flex-initial max-w-xs sm:max-w-none">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="Buscar película o serie..."
                autoFocus
                onBlur={() => {
                  if (!searchQuery) setShowSearch(false);
                }}
                className="w-full sm:w-72 bg-black/90 border border-white/25 rounded-full pl-9 pr-8 py-1.5 text-xs sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-netflix-red transition"
              />
              <button
                type="button"
                onClick={() => {
                  onSearchChange?.("");
                  setShowSearch(false);
                }}
                className="absolute right-2.5 text-zinc-400 hover:text-white p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            onSearchChange && (
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="p-2 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition"
                title="Buscar"
              >
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )
          )}

          {session ? (
            <div className="flex items-center gap-2 sm:gap-3 pl-1 sm:pl-2">
              <div className="flex items-center gap-2">
                {session.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt={session.user.name || "Usuario"}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-white/30 object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-800 border border-white/20 flex items-center justify-center text-xs font-bold text-white">
                    {session.user?.name?.charAt(0) || "U"}
                  </div>
                )}
                <span className="hidden lg:inline text-xs font-semibold text-zinc-200 max-w-[100px] truncate">
                  {session.user?.name || "Mi Cuenta"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.removeItem("piloto_welcome_dismissed");
                  } catch {
                    // Silencioso
                  }
                  void signOut({ callbackUrl: "/" });
                }}
                className="p-1.5 sm:p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-md bg-netflix-red text-white text-xs sm:text-sm font-bold hover:bg-red-700 transition shadow"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>Ingresar</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
