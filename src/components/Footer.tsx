"use client";

import React from "react";
import Link from "next/link";
import { Film, ShieldCheck } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/80 text-zinc-400 py-12 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start justify-between">
          {/* Identidad de la plataforma */}
          <div className="space-y-3">
            <Link className="inline-flex items-center gap-2.5 group" href="/">
              <div className="w-8 h-8 rounded-lg bg-netflix-red flex items-center justify-center shadow-lg shadow-red-900/40">
                <Film className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-black tracking-tighter text-netflix-red group-hover:text-red-500 transition">
                PILOTO
              </span>
            </Link>
            <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
              Plataforma privada de streaming bajo demanda con catálogo híbrido,
              audio dual y sincronización de progreso en la nube.
            </p>
          </div>

          {/* Enlaces informativos */}
          <div className="flex flex-wrap gap-6 text-xs font-medium text-zinc-300 md:justify-center">
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
              href="mailto:soporte@piloto.streaming"
              className="hover:text-white transition"
            >
              Soporte Técnico
            </a>
          </div>

          {/* Estado de servidores y sello de seguridad */}
          <div className="flex flex-col md:items-end space-y-2 text-xs">
            <span className="inline-flex items-center gap-2 text-emerald-400 font-semibold">
              <span>● Servidores Operativos • Streaming HD</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Protegido con Google OAuth 2.0</span>
            </span>
          </div>
        </div>

        {/* Barra inferior de copyright */}
        <div className="pt-8 border-t border-white/10 text-center text-xs text-zinc-500">
          © 2026 PILOTO Streaming. Arquitectura y Desarrollo por Facundo
          Argüello. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}

