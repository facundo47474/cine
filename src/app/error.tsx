"use client";

import React, { useEffect } from "react";
import Link from "next/link";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error Boundary global de la aplicación para recuperar fallos inesperados sin exponer detalles internos.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[AppErrorBoundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md w-full space-y-6">
        <div className="inline-flex items-center justify-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpg"
            alt="PILOTO Logo"
            className="w-10 h-10 rounded-full object-cover border border-white/25 bg-white shadow-lg"
          />
          <span className="text-2xl font-black tracking-tighter text-netflix-red">
            PILOTO
          </span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Ocurrió un error inesperado
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            No pudimos completar esta vista en este momento. Podés reintentar o
            regresar al catálogo principal.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="px-5 py-2.5 rounded-lg bg-netflix-red hover:bg-red-700 text-white text-sm font-bold transition shadow-lg"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-bold border border-white/10 transition"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
