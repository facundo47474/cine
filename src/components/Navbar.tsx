"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  Search,
  X,
  LogOut,
  User as UserIcon,
  Rocket,
} from "lucide-react";
import { useMembership } from "@/components/MembershipProvider";

interface NavbarProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  selectedMediaType?: "movie" | "tv";
  onSelectMediaType?: (type: "movie" | "tv" | undefined) => void;
}

interface NavItemConfig {
  id: string;
  label: string;
  href: string;
  mediaFilter?: "movie" | "tv";
  isAnchor?: boolean;
  isActive: boolean;
}

/**
 * Construye la lista declarativa de secciones de navegación evitando duplicar enlaces entre móvil y escritorio.
 */
function obtenerOpcionesDeNavegacion(
  hasInteractiveFilter: boolean,
  selectedMediaType?: "movie" | "tv"
): NavItemConfig[] {
  return [
    {
      id: "home",
      label: "Inicio",
      href: "/",
      mediaFilter: undefined,
      isActive: hasInteractiveFilter && selectedMediaType === undefined,
    },
    {
      id: "movies",
      label: "Películas",
      href: "/?type=movie#explorar",
      mediaFilter: "movie",
      isActive: hasInteractiveFilter && selectedMediaType === "movie",
    },
    {
      id: "series",
      label: "Series",
      href: "/?type=tv#explorar",
      mediaFilter: "tv",
      isActive: hasInteractiveFilter && selectedMediaType === "tv",
    },
    {
      id: "platforms",
      label: "Plataformas",
      href: hasInteractiveFilter ? "#explorar" : "/#explorar",
      isAnchor: true,
      isActive: false,
    },
  ];
}

export default function Navbar({
  searchQuery = "",
  onSearchChange,
  selectedMediaType,
  onSelectMediaType,
}: NavbarProps) {
  const [showSearch, setShowSearch] = useState(false);
  const { data: session } = useSession();
  const { isPro, openUpgradeModal } = useMembership();
  const isSearchExpanded = Boolean(onSearchChange && (showSearch || searchQuery));
  const navItems = obtenerOpcionesDeNavegacion(
    Boolean(onSelectMediaType),
    selectedMediaType
  );

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

  /**
   * Renderiza cada opción de navegación adaptada al formato horizontal de escritorio o píldoras táctiles móviles.
   */
  const renderNavItem = (
    item: NavItemConfig,
    variant: "desktop" | "mobile"
  ) => {
    const baseStyle =
      variant === "mobile"
        ? `px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition flex-shrink-0 inline-flex items-center ${
            item.isActive
              ? item.mediaFilter
                ? "bg-netflix-red text-white shadow"
                : "bg-white/15 text-white border border-white/25"
              : "bg-zinc-900/90 text-zinc-300 border border-white/10 hover:text-white"
          }`
        : `transition whitespace-nowrap ${
            item.isActive
              ? item.mediaFilter
                ? "text-netflix-red font-bold"
                : "text-white font-bold"
              : "text-zinc-300 hover:text-white"
          }`;

    if (item.isAnchor) {
      return onSelectMediaType ? (
        <a key={item.id} href={item.href} className={baseStyle}>
          {item.label}
        </a>
      ) : (
        <Link key={item.id} href={item.href} className={baseStyle}>
          {item.label}
        </Link>
      );
    }

    if (onSelectMediaType) {
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => handleNavFilter(item.mediaFilter)}
          className={baseStyle}
        >
          {item.label}
        </button>
      );
    }

    return (
      <Link key={item.id} href={item.href} className={baseStyle}>
        {item.label}
      </Link>
    );
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/95 via-black/85 to-black/70 sm:to-transparent backdrop-blur-md border-b border-white/5 sm:border-b-0">
      <div className="max-w-7xl mx-auto px-3 sm:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        <div
          className={`${
            isSearchExpanded ? "hidden sm:flex" : "flex"
          } items-center gap-4 sm:gap-8 min-w-0`}
        >
          <Link
            className="flex items-center gap-2 group flex-shrink-0"
            href="/"
            onClick={() => {
              if (onSelectMediaType) onSelectMediaType(undefined);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt="PILOTO Logo"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border border-white/25 bg-white shadow-lg"
            />
            <span className="inline text-xl sm:text-2xl font-black tracking-tighter text-netflix-red group-hover:text-red-500 transition">
              PILOTO
            </span>
          </Link>

          <nav
            aria-label="Navegación principal"
            className="hidden sm:flex items-center gap-5 lg:gap-6 text-sm font-medium text-zinc-300"
          >
            {navItems.map((item) => renderNavItem(item, "desktop"))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-1 sm:flex-initial justify-end min-w-0">
          {isSearchExpanded ? (
            <div className="relative flex items-center flex-1 sm:flex-initial w-full sm:w-72 min-w-0">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="Buscar película o serie..."
                aria-label="Buscar película o serie"
                autoFocus
                onBlur={() => {
                  if (!searchQuery) setShowSearch(false);
                }}
                className="w-full min-w-0 bg-black/90 border border-white/25 rounded-full pl-10 pr-10 py-1.5 text-base sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-netflix-red transition"
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSearchChange?.("");
                  setShowSearch(false);
                }}
                aria-label="Cerrar búsqueda"
                title="Cerrar búsqueda"
                className="absolute right-2 text-zinc-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            onSearchChange && (
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition"
                title="Buscar"
                aria-label="Buscar"
              >
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )
          )}

          {!isSearchExpanded && (
            <button
              type="button"
              onClick={() => openUpgradeModal("modo_escudo")}
              title={
                isPro
                  ? "Gestionar tu suscripción Piloto"
                  : "Activar Piloto Plus"
              }
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 min-h-[34px] rounded-lg text-[11px] sm:text-xs font-bold whitespace-nowrap transition flex-shrink-0 border ${
                isPro
                  ? "bg-purple-600 hover:bg-purple-700 border-purple-400 text-white shadow-sm shadow-purple-900/30"
                  : "bg-[#E50914] hover:bg-red-700 border-red-500 text-white shadow-sm shadow-red-900/30"
              }`}
            >
              {isPro ? (
                <>
                  <Rocket className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Piloto</span>
                </>
              ) : (
                <>
                  <Rocket className="w-3.5 h-3.5 sm:hidden flex-shrink-0" />
                  <span className="sm:hidden">Plus</span>
                  <span className="hidden sm:inline">Activar Piloto Plus</span>
                </>
              )}
            </button>
          )}

          {session ? (
            <div
              className={`${
                isSearchExpanded ? "hidden sm:flex" : "flex"
              } items-center gap-2 sm:gap-3 pl-1 sm:pl-2 flex-shrink-0`}
            >
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
                  void signOut({ callbackUrl: "/" });
                }}
                className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className={`${
                isSearchExpanded ? "hidden sm:inline-flex" : "inline-flex"
              } items-center gap-1.5 px-3 sm:px-4 py-1.5 min-h-[36px] rounded-md bg-netflix-red text-white text-xs sm:text-sm font-bold hover:bg-red-700 transition shadow flex-shrink-0`}
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>Ingresar</span>
            </Link>
          )}
        </div>
      </div>

      {!isSearchExpanded && (
        <nav
          aria-label="Navegación móvil"
          className="sm:hidden flex items-center gap-2 px-3 pb-2.5 pt-1 overflow-x-auto no-scrollbar border-t border-white/5"
        >
          {navItems.map((item) => renderNavItem(item, "mobile"))}
        </nav>
      )}
    </header>
  );
}
