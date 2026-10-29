"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { Film, Lock } from "lucide-react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: "/" });
  };

  return (
    <div className="relative min-h-screen w-full bg-[#141414] flex items-center justify-center p-4 overflow-hidden">
      {/* Fondo cinematográfico difuminado */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-25 scale-105"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1600&auto=format&fit=crop&q=80')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-black/80 to-black/90" />

      <div className="relative z-10 max-w-md w-full bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-8 sm:p-10 shadow-2xl text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-netflix-red flex items-center justify-center shadow-lg shadow-red-900/50">
            <Film className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-netflix-red">
            PILOTO
          </h1>
          <p className="text-sm text-zinc-400">
            Inicia sesión con tu cuenta para acceder al catálogo y sincronizar
            tu progreso en todos tus dispositivos.
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold text-sm flex items-center justify-center gap-3 transition shadow-lg disabled:opacity-60"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.7-.2-2.5H12v4.8h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.8z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5L1.6 16c1.9 3.9 5.8 7 10.4 7z"
              />
            </svg>
            <span>
              {loading ? "Conectando con Google..." : "Continuar con Google"}
            </span>
          </button>
        </div>

        <div className="pt-4 border-t border-white/10 flex items-center justify-center gap-2 text-xs text-zinc-500">
          <Lock className="w-3.5 h-3.5" />
          <span>Plataforma privada con acceso autenticado</span>
        </div>
      </div>
    </div>
  );
}

