import type { Metadata } from "next";
import React from "react";
import { SITE_NAME } from "@/config/seo";

export const metadata: Metadata = {
  title: "Iniciar Sesión",
  description:
    "Iniciá sesión o creá tu cuenta gratis con Google en PILOTO Streaming para acceder al catálogo de películas, series y estrenos en HD.",
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title: `Iniciar Sesión | ${SITE_NAME}`,
    description:
      "Accede al catálogo completo de PILOTO Streaming con tu cuenta de Google.",
    url: "/login",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
