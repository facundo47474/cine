"use client";

import React from "react";
import Link from "next/link";
import { Film, ShieldCheck } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/80 text-zinc-400 py-8 sm:py-12 mt-12 sm:mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6 sm:space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-center md:items-start text-center md:text-left">
          {/* Identidad de la plataforma */}
          <div className="flex flex-col items-center md:items-start space-y-3">
            <Link className="inline-flex items-center gap-2.5 group" href="/">
              <div className="w-8 h-8 rounded-lg bg-netflix-red flex items-center justify-center shadow-lg shadow-red-900/40">
                <Film className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-black tracking-tighter text-netflix-red group-hover:text-red-500 transition">
                PILOTO
              </span>
            </Link>
            <p className="text-xs text-zinc-400 max-w-xs sm:max-w-sm leading-relaxed">
              Plataforma de streaming en desarrollo. Puede contener errores ante cualquier inconveniente comunicarse con el soporte.
            </p>
          </div>

          {/* Enlaces informativos */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5 sm:gap-6 text-xs font-medium text-zinc-300 md:self-center">
            <Link href="/" className="hover:text-white transition">
              Inicio
            </Link>
            <a href="#catalogo" className="hover:text-white transition">
              Catálogo
            </a>
            <a href="#explorar" className="hover:text-white transition">
              Privacidad de Cuenta
            </a>
            <a
              href="mailto:facundotomas018@gmail.com"
              className="hover:text-white transition"
            >
              Soporte Técnico
            </a>
          </div>

          {/* Estado de servidores y sello de seguridad */}
          <div className="flex flex-col items-center md:items-end space-y-2 text-xs">
            <span className="inline-flex items-center justify-center md:justify-end gap-2 text-emerald-400 font-semibold">
              <span>● Servidores Operativos • Streaming HD</span>
            </span>
            <span className="inline-flex items-center justify-center md:justify-end gap-1.5 text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Protegido con Google OAuth 2.0</span>
            </span>
          </div>
        </div>

        {/* Barra inferior de copyright */}
        <div className="pt-6 sm:pt-8 border-t border-white/10 text-center text-[11px] sm:text-xs text-zinc-500 leading-relaxed px-2">
          © 2026 PILOTO Streaming. Arquitectura y Desarrollo por Facundo
          Argüello. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}

