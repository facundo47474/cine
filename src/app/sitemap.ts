import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/seo";

/**
 * Sitemap XML dinámico con todas las rutas públicas indexables (HTTP 200 OK).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-11-21T00:00:00.000Z");

  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/privacidad`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/condiciones`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
