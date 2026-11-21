import type { MetadataRoute } from "next";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_SHORT_NAME,
} from "@/config/seo";

/**
 * Manifiesto Web App (`/manifest.webmanifest`) para instalación PWA y señales técnicas SEO.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_SHORT_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#141414",
    theme_color: "#E50914",
    lang: "es-AR",
    categories: ["entertainment", "movies", "video"],
    icons: [
      {
        src: "/logo.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
