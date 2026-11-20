import Link from "next/link";

/**
 * Página global 404 para rutas inexistentes en la plataforma.
 */
export default function NotFoundPage() {
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
          <p className="text-xs font-bold uppercase tracking-widest text-netflix-red">
            Error 404
          </p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Contenido no encontrado
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            La página o el título que estás buscando no se encuentra disponible
            o fue movido.
          </p>
        </div>

        <div>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-netflix-red hover:bg-red-700 text-white text-sm font-bold transition shadow-lg"
          >
            Volver al catálogo
          </Link>
        </div>
      </div>
    </div>
  );
}
