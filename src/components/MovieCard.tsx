"use client";

import React from "react";
import Link from "next/link";
import { Play, Star } from "lucide-react";

interface MovieCardProps {
  id: string;
  title: string;
  posterUrl: string;
  releaseYear: number;
  qualityBadge: string;
  rating?: number;
  progressPercentage?: number;
  isLocalVip?: boolean;
  fullWidth?: boolean;
}

export default function MovieCard({
  id,
  title,
  posterUrl,
  releaseYear,
  qualityBadge,
  rating,
  progressPercentage,
  isLocalVip,
  fullWidth = false,
}: MovieCardProps) {
  return (
    <Link
      href={`/watch/${id}`}
      className={`group relative ${
        fullWidth ? "w-full" : "flex-shrink-0 w-44 sm:w-52"
      } rounded-xl overflow-hidden bg-zinc-900 border border-white/10 hover:border-netflix-red/80 transition-all duration-300 hover:scale-[1.04] hover:z-20 shadow-lg`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={posterUrl}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

        {/* Badges superiores */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1">
          {isLocalVip ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-600/90 text-white shadow">
              VIP
            </span>
          ) : (
            <span />
          )}
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-netflix-red text-white shadow">
            {qualityBadge}
          </span>
        </div>

        {/* Botón Play central en hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-netflix-red/95 flex items-center justify-center shadow-lg shadow-black/70 scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* Barra de progreso "Continuar viendo" */}
        {typeof progressPercentage === "number" && progressPercentage > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-zinc-700">
            <div
              className="h-full bg-netflix-red transition-all"
              style={{ width: `${Math.min(100, progressPercentage)}%` }}
            />
          </div>
        )}
      </div>

      <div className="p-3 space-y-1">
        <h3 className="text-sm font-semibold text-white truncate group-hover:text-netflix-red transition">
          {title}
        </h3>
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>{releaseYear}</span>
          {typeof rating === "number" && (
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <Star className="w-3 h-3 fill-amber-400" />
              {rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
