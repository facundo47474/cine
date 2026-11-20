import React from "react";
import Link from "next/link";

export interface LegalSectionItem {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

interface LegalDocumentLayoutProps {
  title: string;
  intro: string;
  lastUpdated: string;
  currentPath: "/privacidad" | "/condiciones";
  sections: LegalSectionItem[];
}

/**
 * Plantilla formal de documentos legales en fondo blanco con tipografía clara de lectura directa
 * para Políticas y Privacidad y Condiciones de Servicio.
 */
export default function LegalDocumentLayout({
  title,
  intro,
  lastUpdated,
  currentPath,
  sections,
}: LegalDocumentLayoutProps) {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt="PILOTO Streaming"
              className="w-7 h-7 rounded-full object-cover border border-neutral-300"
            />
            <span className="text-base font-bold tracking-tight text-neutral-950">
              PILOTO Streaming
            </span>
          </Link>

          <nav
            aria-label="Navegación legal"
            className="flex items-center gap-4 sm:gap-5 text-xs sm:text-sm text-neutral-600"
          >
            <Link
              href="/privacidad"
              className={`hover:text-neutral-950 transition ${
                currentPath === "/privacidad"
                  ? "font-semibold text-neutral-950 underline underline-offset-4"
                  : ""
              }`}
            >
              Privacidad
            </Link>
            <Link
              href="/condiciones"
              className={`hover:text-neutral-950 transition ${
                currentPath === "/condiciones"
                  ? "font-semibold text-neutral-950 underline underline-offset-4"
                  : ""
              }`}
            >
              Condiciones
            </Link>
            <Link href="/" className="hover:text-neutral-950 transition">
              Inicio
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 sm:py-14">
        <div className="border-b border-neutral-200 pb-6 mb-8 space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950">
            {title}
          </h1>
          <p className="text-[15px] text-neutral-700 leading-7">{intro}</p>
          <p className="text-xs sm:text-sm text-neutral-500">
            Última actualización: {lastUpdated} · Sitio web:{" "}
            <a
              href="https://cine-ddbt.vercel.app"
              className="underline hover:text-neutral-800"
            >
              https://cine-ddbt.vercel.app
            </a>{" "}
            · Contacto:{" "}
            <a
              href="mailto:facundotomas018@gmail.com"
              className="underline hover:text-neutral-800"
            >
              facundotomas018@gmail.com
            </a>
          </p>
        </div>

        <article className="space-y-8">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="space-y-2.5">
              <h2 className="text-lg font-bold text-neutral-950">
                {section.title}
              </h2>

              {section.paragraphs.map((paragraph, idx) => (
                <p
                  key={idx}
                  className="text-[15px] text-neutral-800 leading-7"
                >
                  {paragraph}
                </p>
              ))}

              {section.bullets && (
                <ul className="list-disc pl-6 space-y-1.5 text-[15px] text-neutral-800 leading-7 pt-1">
                  {section.bullets.map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>

        <footer className="border-t border-neutral-200 mt-14 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-500">
          <span>
            © 2026 PILOTO Streaming · Responsable: Facundo Argüello.
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/privacidad" className="hover:text-neutral-900 underline">
              Políticas y Privacidad
            </Link>
            <Link
              href="/condiciones"
              className="hover:text-neutral-900 underline"
            >
              Condiciones de Servicio
            </Link>
            <a
              href="mailto:facundotomas018@gmail.com"
              className="hover:text-neutral-900 underline"
            >
              Contacto
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
