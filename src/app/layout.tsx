import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthSessionProvider from "@/components/AuthSessionProvider";

export const metadata: Metadata = {
  title: "PILOTO | Streaming",
  description: "Plataforma privada de películas y estrenos.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PILOTO",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#141414",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#141414] text-white antialiased selection:bg-netflix-red selection:text-white">
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
