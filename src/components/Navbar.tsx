"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Film, Search, X, LogOut, User as UserIcon } from "lucide-react";

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function Navbar({ searchQuery, onSearchChange }: NavbarProps) {
  const [showSearch, setShowSearch] = useState(false);
  const { data: session } = useSession();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/95 via-black/80 to-transparent backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-4 sm:gap-8 min-w-0">
          <Link className="flex items-center gap-2 group flex-shrink-0" href="/">
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

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-300">
            <Link className="text-white hover:text-zinc-300 transition" href="/">
              Inicio
            </Link>
            <a href="#explorar" className="hover:text-white transition">
              Plataformas
            </a>
            <a href="#catalogo" className="hover:text-white transition">
              Películas
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-1 sm:flex-initial justify-end">
          {showSearch || searchQuery ? (
            <div className="relative flex items-center flex-1 sm:flex-initial max-w-xs sm:max-w-none">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar película..."
                autoFocus
                onBlur={() => {
                  if (!searchQuery) setShowSearch(false);
                }}
                className="w-full sm:w-72 bg-black/90 border border-white/25 rounded-full pl-9 pr-8 py-1.5 text-xs sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-netflix-red transition"
              />
              <button
                type="button"
                onClick={() => {
                  onSearchChange("");
                  setShowSearch(false);
                }}
                className="absolute right-2.5 text-zinc-400 hover:text-white p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-medium text-zinc-200 hover:text-white transition"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Buscar...</span>
            </button>
          )}

          {session?.user && (
            <div className="flex items-center gap-1.5 sm:gap-2.5 bg-zinc-900/90 border border-white/15 rounded-full pl-1 pr-2.5 sm:pl-1.5 sm:pr-3 py-1 flex-shrink-0">
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name || "Avatar"}
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover border border-white/20"
                />
              ) : (
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-netflix-red flex items-center justify-center">
                  <UserIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                </div>
              )}
              <span className="hidden sm:inline text-xs font-semibold text-zinc-200 max-w-[110px] truncate">
                {session.user.name?.split(" ")[0]}
              </span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-zinc-400 hover:text-white transition ml-0.5 p-0.5"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
