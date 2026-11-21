import React from "react";
import Link from "next/link";
import {
  Cast,
  Check,
  Cloud,
  Film,
  Languages,
  ShieldCheck,
  Tv,
} from "lucide-react";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import Footer from "@/components/Footer";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/config/seo";

const FEATURES = [
  {
    icon: Film,
    title: "Películas, Series y Estrenos en HD",
    description:
      "Explorá tendencias semanales, cartelera actualizada, clásicos imperdibles y series con temporadas y episodios completos listos para maratonear.",
  },
  {
    icon: Languages,
    title: "Audio Dual Latino y Subtitulado",
    description:
      "Cambiá al instante entre español latino e idioma original con subtítulos desde la ficha de cada película o capítulo.",
  },
  {
    icon: ShieldCheck,
    title: "Piloto Plus: Modo Escudo sin Anuncios",
    description:
      "Reproducción directa con nuestro propio reproductor optimizado, sin ventanas emergentes ni redirecciones publicitarias invasivas.",
  },
  {
    icon: Cast,
    title: "Smart TV y Progreso en la Nube",
    description:
      "Transmití a tu televisor con Chromecast o AirPlay y retomá cualquier título en segundos con Continuar viendo y Mi Lista.",
  },
];

const FAQS = [
  {
    question: "¿Cómo entro gratis a PILOTO Streaming?",
    answer:
      "Solo hacés clic en «Ingresar gratis con Google» para acceder de forma segura con Google OAuth 2.0, sin formularios largos ni contraseñas adicionales.",
  },
  {
    question: "¿Qué incluye el catálogo y en qué idiomas está disponible?",
    answer:
      "Contamos con películas de estreno, cine clásico y series completas organizadas por género y plataforma, con soporte para audio español latino e inglés subtitulado según disponibilidad.",
  },
  {
    question: "¿Qué beneficios agrega la suscripción Piloto Plus?",
    answer:
      "Piloto Plus ($ 2.500 ARS por mes mediante MercadoPago) habilita el Modo Escudo en nuestro reproductor sin anuncios ni redirecciones, transmisión directa a Smart TV, Modo Maratón (Saltar Intro y reproducción continua) e historial Cloud y Mi Lista ilimitados.",
  },
  {
    question: "¿En qué dispositivos funciona PILOTO Streaming?",
    answer:
      "Podés usar PILOTO Streaming desde cualquier navegador moderno en celular, tablet, computadora o transmitir directamente a Smart TV compatibles con Chromecast y AirPlay.",
  },
];

const LANDING_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "EntertainmentApplication",
      operatingSystem: "Web, Android, iOS, Smart TV",
      inLanguage: "es-AR",
      description: SITE_DESCRIPTION,
      offers: [
        {
          "@type": "Offer",
          name: "Plan Gratuito",
          price: "0",
          priceCurrency: "ARS",
        },
        {
          "@type": "Offer",
          name: "Piloto Plus Mensual",
          price: "2500",
          priceCurrency: "ARS",
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ],
};

/**
 * Portada pública indexable (`/`) mostrada a visitantes nuevos y motores de búsqueda.
 */
export default function PublicLandingPage() {
  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col justify-between">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(LANDING_STRUCTURED_DATA),
        }}
      />

      <div>
        {/* Barra superior pública */}
        <header className="border-b border-white/10 bg-black/80 backdrop-blur-md sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.jpg"
                alt="PILOTO Logo"
                className="w-8 h-8 rounded-full object-cover border border-white/25 bg-white shadow"
              />
              <span className="text-xl sm:text-2xl font-black tracking-tighter text-netflix-red">
                PILOTO
              </span>
            </Link>

            <nav
              aria-label="Navegación principal"
              className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-300"
            >
              <a href="#funciones" className="hover:text-white transition">
                Funciones
              </a>
              <a href="#planes" className="hover:text-white transition">
                Planes
              </a>
              <a href="#faq" className="hover:text-white transition">
                Preguntas frecuentes
              </a>
              <Link href="/privacidad" className="hover:text-white transition">
                Privacidad
              </Link>
              <Link href="/condiciones" className="hover:text-white transition">
                Condiciones
              </Link>
            </nav>

            <Link
              href="/login"
              className="px-4 py-2 rounded-lg bg-netflix-red hover:bg-red-700 text-white text-xs sm:text-sm font-bold transition shadow"
            >
              Iniciar sesión
            </Link>
          </div>
        </header>

        <main>
          {/* Hero SEO principal */}
          <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_80%_15%,rgba(229,9,20,0.22),transparent_48%),radial-gradient(circle_at_15%_85%,rgba(229,9,20,0.12),transparent_45%)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 sm:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/15 text-xs font-semibold text-zinc-200">
                  <Tv className="w-3.5 h-3.5 text-netflix-red" />
                  <span>Plataforma de Streaming HD • Argentina y Latinoamérica</span>
                </div>

                <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-[1.08]">
                  PILOTO Streaming: Películas, Series y Estrenos en HD
                </h1>

                <p className="text-sm sm:text-lg text-zinc-300 leading-relaxed max-w-2xl">
                  Disfrutá un catálogo completo de películas online, series con
                  temporadas enteras y estrenos en alta definición con{" "}
                  <strong className="text-white">
                    audio español latino e inglés subtitulado
                  </strong>
                  . Guardá tu progreso en la nube, transmití a Smart TV y activá{" "}
                  <strong className="text-white">Piloto Plus</strong> para ver sin
                  anuncios ni redirecciones.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                  <GoogleSignInButton label="Ingresar gratis con Google" />
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center px-6 py-3.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-white font-semibold text-sm sm:text-base transition"
                  >
                    Ya tengo cuenta
                  </Link>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-400 pt-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-400" />
                    Acceso instantáneo con Google OAuth 2.0
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-400" />
                    Continuar viendo y Mi Lista sincronizados
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-400" />
                    Compatible con móvil, PC y Smart TV
                  </span>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-2xl bg-zinc-900/80 border border-white/10 p-6 sm:p-7 shadow-2xl space-y-5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/logo.jpg"
                        alt="PILOTO Streaming"
                        className="w-10 h-10 rounded-full object-cover border border-white/25 bg-white"
                      />
                      <div>
                        <p className="text-sm font-extrabold text-white">
                          PILOTO Streaming
                        </p>
                        <p className="text-xs text-zinc-400">
                          Catálogo Cloud + Modo Escudo
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold">
                      Operativo HD
                    </span>
                  </div>

                  <ul className="space-y-3 text-sm text-zinc-200">
                    <li className="flex items-start gap-2.5">
                      <Film className="w-4 h-4 text-netflix-red flex-shrink-0 mt-0.5" />
                      <span>
                        Búsqueda rápida por título, género y plataforma
                        (Netflix, Max, Disney+, Prime Video).
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Cloud className="w-4 h-4 text-netflix-red flex-shrink-0 mt-0.5" />
                      <span>
                        Reanudación automática de películas y episodios entre
                        todos tus dispositivos.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span>
                        Plan Piloto Plus con reproductor directo optimizado sin
                        publicidad ni redirecciones externas.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Funciones principales */}
          <section
            id="funciones"
            className="max-w-7xl mx-auto px-4 sm:px-8 py-14 sm:py-18 space-y-8"
          >
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                ¿Por qué elegir PILOTO Streaming?
              </h2>
              <p className="text-sm sm:text-base text-zinc-400">
                Diseñado para ver películas y series online rápido, con
                estabilidad de servidores y control total sobre tu experiencia.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="rounded-2xl bg-zinc-900/60 border border-white/10 p-5 space-y-3 hover:border-white/20 transition"
                  >
                    <div className="w-10 h-10 rounded-xl bg-netflix-red/15 border border-netflix-red/30 flex items-center justify-center text-netflix-red">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-bold text-white leading-snug">
                      {feature.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Comparativa de planes */}
          <section
            id="planes"
            className="border-y border-white/10 bg-black/40 py-14 sm:py-18"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-8">
              <div className="space-y-2 max-w-2xl">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  Planes de acceso claros
                </h2>
                <p className="text-sm sm:text-base text-zinc-400">
                  Ingresá gratis al instante con tu cuenta de Google o activá
                  Piloto Plus mensualmente mediante MercadoPago sin débitos
                  automáticos ocultos.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-6 sm:p-8 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-extrabold text-white">
                      Plan Gratuito
                    </h3>
                    <span className="text-2xl font-black text-white">$ 0</span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-400">
                    Explorá el catálogo de películas y series gratis con tu
                    cuenta de Google.
                  </p>
                  <ul className="space-y-2.5 text-sm text-zinc-300">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <span>Acceso al catálogo de películas, series y estrenos</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <span>Audio Español Latino e Inglés Subtitulado</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <span>Historial reciente y Mi Lista con límite estándar</span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl bg-zinc-900/90 border border-emerald-500/40 p-6 sm:p-8 space-y-5 shadow-xl">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 mb-1.5">
                        Recomendado
                      </span>
                      <h3 className="text-xl font-extrabold text-white">
                        Piloto Plus Mensual
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl sm:text-3xl font-black text-white">
                        $ 2.500
                      </span>
                      <span className="block text-[11px] text-zinc-400">
                        ARS / 30 días
                      </span>
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-300">
                    Experiencia optimizada con Modo Escudo, Smart TV y
                    sincronización Cloud ilimitada.
                  </p>
                  <ul className="space-y-2.5 text-sm text-zinc-200">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>
                        Modo Escudo: reproductor directo sin anuncios ni
                        redirecciones
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Transmisión directa a Chromecast y AirPlay</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Modo Maratón en series (Saltar Intro y autoplay)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Historial Cloud y Mi Lista sin límites</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Preguntas frecuentes */}
          <section
            id="faq"
            className="max-w-7xl mx-auto px-4 sm:px-8 py-14 sm:py-18 space-y-8"
          >
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Preguntas frecuentes sobre PILOTO Streaming
              </h2>
              <p className="text-sm sm:text-base text-zinc-400">
                Respuestas rápidas sobre acceso, catálogo, idioma y membresía
                Piloto Plus.
              </p>
            </div>

            <dl className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {FAQS.map((item) => (
                <div
                  key={item.question}
                  className="rounded-2xl bg-zinc-900/50 border border-white/10 p-5 sm:p-6 space-y-2"
                >
                  <dt className="text-base font-bold text-white">
                    {item.question}
                  </dt>
                  <dd className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    {item.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </main>
      </div>

      <Footer />
    </div>
  );
}
