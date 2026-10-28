import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PILOTO Streaming | Clean Architecture & Auto-Failover",
  description:
    "Plataforma de streaming estilo Netflix construida con Clean Architecture, principios SOLID, TokenCryptoService (AES-256-GCM) y Health Checker automático.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#141414] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
