export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://cine-ddbt.vercel.app"
).replace(/\/+$/, "");

export const SITE_NAME = "PILOTO Streaming";
export const SITE_SHORT_NAME = "PILOTO";
export const SITE_TITLE_DEFAULT =
  "PILOTO Streaming | Películas, Series y Estrenos en HD Online";
export const SITE_TITLE_TEMPLATE = "%s | PILOTO Streaming";
export const SITE_DESCRIPTION =
  "Descubre PILOTO Streaming: plataforma de películas, series completas y estrenos en alta definición con audio latino y subtitulado, sincronización en la nube y transmisión a Smart TV.";

export const SITE_KEYWORDS = [
  "PILOTO",
  "PILOTO Streaming",
  "Piloto Plus",
  "cine piloto",
  "películas online HD",
  "ver películas en español latino",
  "series completas online",
  "estrenos de cine HD",
  "streaming películas y series",
  "plataforma de streaming",
  "ver series latino y subtitulado",
  "streaming Chromecast AirPlay",
  "catálogo de películas y series",
  "streaming sin anuncios",
  "cine online Argentina",
];

export const GOOGLE_SITE_VERIFICATION =
  process.env.GOOGLE_SITE_VERIFICATION?.trim() || undefined;

export const SUPPORT_EMAIL = "facundotomas018@gmail.com";
