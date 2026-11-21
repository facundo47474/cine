import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.STREAM_TOKEN_SECRET,
});

export const config = {
  matcher: [
    /*
     * Permite acceso público e indexación en `/` (landing SSR / catálogo autenticado)
     * y protege con sesión las rutas privadas (/watch, /series, APIs internas),
     * excluyendo además rutas SEO, legales, autenticación y archivos estáticos:
     */
    "/((?!login|privacidad|condiciones|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|opengraph-image|twitter-image|logo\\.jpg|google[a-zA-Z0-9-]+\\.html|api/auth|api/mercadopago|api/stream|api/stream-proxy|api/extractor|api/health/cron|_next/static|_next/image|favicon\\.ico|icon\\.svg).+)",
  ],
};
