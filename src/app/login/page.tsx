"use client";

import React, { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Film, Loader2 } from "lucide-react";

const TRENDING_POSTERS = [
  "https://image.tmdb.org/t/p/w500/5j1YUuamobLACkzlkzvWfNuzFNg.jpg",
  "https://image.tmdb.org/t/p/w500/ccS3RFeFRlmk54Q9RQ4lyz36ip8.jpg",
  "https://image.tmdb.org/t/p/w500/flipeYd0sa4y4kpIc7Pn59JeBIj.jpg",
  "https://image.tmdb.org/t/p/w500/3A4IzhQHCzX5nuQParZp07F5rCT.jpg",
  "https://image.tmdb.org/t/p/w500/3AxfnEViGaVspgifEag5au5bVJc.jpg",
  "https://image.tmdb.org/t/p/w500/mgsw0NVOn5VX9rA6An8ijwUFX7q.jpg",
  "https://image.tmdb.org/t/p/w500/clw1EmN6OA0AtogU6iFCwBZSCp1.jpg",
  "https://image.tmdb.org/t/p/w500/aSvA1Xat045jh8ck7U626PPkzH1.jpg",
  "https://image.tmdb.org/t/p/w500/rmCkNtzYR2xTOO3ZXmIqB5zgYdE.jpg",
  "https://image.tmdb.org/t/p/w500/hHPIefotew38oJm3YCJPAzpi26c.jpg",
  "https://image.tmdb.org/t/p/w500/5myJqI5SeZckhC8B2vMz7Nbl46z.jpg",
  "https://image.tmdb.org/t/p/w500/fBFjaDWfNslvrs6bJjknmG27wOS.jpg",
  "https://image.tmdb.org/t/p/w500/gxrGVQdFmc3xxVn6UyY31ZjqM0s.jpg",
  "https://image.tmdb.org/t/p/w500/eCaURARzBdiHw8gKSeUznHPygev.jpg",
  "https://image.tmdb.org/t/p/w500/n5gSNf55KWfDc9hqP4H1KCCSutE.jpg",
  "https://image.tmdb.org/t/p/w500/ewPz6uvKrbKlQrLRi1r9NTZQLzN.jpg",
  "https://image.tmdb.org/t/p/w500/yOse0Md6XTNAdWE6mwzUaxrtn8u.jpg",
  "https://image.tmdb.org/t/p/w500/6WWJiE7Dwj63H122IOG2htJsCGP.jpg",
];

function LoginCard() {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const searchParams = useSearchParams();
  const authError = searchParams.get("error");
  const isAccessDenied = authError === "AccessDenied";

  const handleGoogleAuth = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: "/" });
  };

  const isRegister = mode === "register";

  return (
    <div className="relative z-10 w-full max-w-[390px] bg-black/75 backdrop-blur-sm rounded-lg p-8 sm:p-10 shadow-2xl shadow-black/60 space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          {isRegister ? "Crear cuenta" : "Iniciar sesión"}
        </h1>
        <p className="text-sm text-zinc-400">
          {isRegister
            ? "Regístrate en un clic con tu correo de Google."
            : "Ingresa con tu cuenta para continuar viendo."}
        </p>
      </div>

      {isAccessDenied && (
        <div className="rounded-lg bg-red-500/15 border border-red-500/30 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-200 leading-relaxed">
            Tu correo no está autorizado. Solicita acceso al administrador.
          </p>
        </div>
      )}

      {authError && !isAccessDenied && (
        <div className="rounded-lg bg-red-500/15 border border-red-500/30 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-200 leading-relaxed">
            No se pudo completar el acceso. Intenta nuevamente.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogleAuth}
        disabled={loading}
        className="w-full py-3.5 px-5 rounded-md bg-white hover:bg-zinc-200 active:scale-[0.99] text-black font-bold text-sm flex items-center justify-center gap-3 transition shadow-lg disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-zinc-800" />
            <span>
              {isRegister ? "Creando tu cuenta..." : "Ingresando..."}
            </span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
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
              {isRegister
                ? "Registrarse con Google"
                : "Iniciar sesión con Google"}
            </span>
          </>
        )}
      </button>

      <div className="pt-2 border-t border-white/10 text-sm text-zinc-400">
        {isRegister ? (
          <p>
            ¿Ya tienes una cuenta?{" "}
            <button
              type="button"
              onClick={() => setMode("login")}
              className="text-white font-semibold hover:underline ml-1"
            >
              Inicia sesión
            </button>
          </p>
        ) : (
          <p>
            ¿Primera vez en PILOTO?{" "}
            <button
              type="button"
              onClick={() => setMode("register")}
              className="text-white font-semibold hover:underline ml-1"
            >
              Crea una cuenta
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

// Mosaico de 54 pósters (cada póster se repite 3 veces). Saltar de a 7
// (coprimo con 18) evita que el mismo póster quede pegado a sí mismo y
// alcanza para cubrir pantallas altas aunque el collage esté rotado.
const COLLAGE_TILES = Array.from(
  { length: 54 },
  (_, i) => TRENDING_POSTERS[(i * 7) % TRENDING_POSTERS.length]
);

export default function LoginPage() {
  return (
    <div className="relative min-h-screen w-full bg-black flex flex-col justify-between overflow-hidden select-none">
      {/* Collage de pósters en tendencia estilo Netflix: imágenes nítidas y bien visibles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute left-1/2 top-1/2 w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-[8deg] grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-9 gap-2 sm:gap-3 transform-gpu">
          {COLLAGE_TILES.map((posterUrl, idx) => (
            <div
              key={idx}
              className="aspect-[2/3] rounded-md overflow-hidden bg-zinc-900"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={posterUrl}
                alt=""
                loading="eager"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>

        {/* Capa oscura suave: los pósters se siguen viendo y el formulario se lee bien */}
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70" />
      </div>

      {/* Header superior con el logo tipo Netflix */}
      <header className="relative z-10 max-w-7xl w-full mx-auto px-6 sm:px-12 pt-6 sm:pt-8">
        <div className="inline-flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-netflix-red flex items-center justify-center shadow-lg shadow-red-900/50">
            <Film className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl sm:text-3xl font-black tracking-tighter text-netflix-red">
            PILOTO
          </span>
        </div>
      </header>

      {/* Cuadro de inicio de sesión / registro centrado y minimalista */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <Suspense
          fallback={
            <div className="w-full max-w-[390px] bg-black/75 backdrop-blur-sm rounded-lg p-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-netflix-red" />
            </div>
          }
        >
          <LoginCard />
        </Suspense>
      </main>

      <div className="h-6" />
    </div>
  );
}
