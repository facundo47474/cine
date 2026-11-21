import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/seo";

/**
 * Reglas de rastreo (`robots.txt`) permitiendo indexar rutas públicas y excluyendo rutas privadas/API.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/privacidad",
          "/condiciones",
          "/login",
          "/logo.jpg",
          "/opengraph-image",
          "/manifest.webmanifest",
        ],
        disallow: ["/api/", "/watch/", "/series/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
