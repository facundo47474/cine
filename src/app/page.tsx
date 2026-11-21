import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/infrastructure/auth/authOptions";
import HomeCatalogClient from "@/components/HomeCatalogClient";
import PublicLandingPage from "@/components/PublicLandingPage";

export const dynamic = "force-dynamic";

/**
 * Portada principal (`/`):
 * - Si el usuario tiene sesión activa, renderiza el catálogo interactivo completo.
 * - Si visita sin sesión o es un rastreador web (Googlebot, Bingbot), entrega la landing pública SEO con HTTP 200 OK.
 */
export default async function HomePage() {
  let session = null;
  try {
    session = await getServerSession(authOptions);
  } catch {
    session = null;
  }

  if (session?.user) {
    return <HomeCatalogClient />;
  }

  return <PublicLandingPage />;
}
