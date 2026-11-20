import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthSessionProvider from "@/components/AuthSessionProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://cine-ddbt.vercel.app"),
  title: "PILOTO | Streaming",
  description: "Plataforma de streaming de películas, series y estrenos.",
  icons: {
    icon: [{ url: "/logo.jpg", type: "image/jpeg" }],
    shortcut: ["/logo.jpg"],
    apple: [{ url: "/logo.jpg", type: "image/jpeg" }],
  },
  openGraph: {
    title: "PILOTO | Streaming",
    description: "Plataforma de streaming de películas, series y estrenos.",
    url: "https://cine-ddbt.vercel.app",
    siteName: "PILOTO Streaming",
    locale: "es_AR",
    type: "website",
    images: [{ url: "/logo.jpg", alt: "PILOTO Streaming Logo" }],
  },
  robots: {
    index: true,
    follow: true,
  },
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
      <head>
        <link
          rel="preconnect"
          href="https://image.tmdb.org"
          crossOrigin="anonymous"
        />
        <link rel="dns-prefetch" href="https://image.tmdb.org" />
      </head>
      <body className="min-h-screen bg-[#141414] text-white antialiased selection:bg-netflix-red selection:text-white">
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
