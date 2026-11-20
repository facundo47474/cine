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
     * Protege todas las rutas excepto:
     * - /login (pantalla de inicio de sesión)
     * - /privacidad y /condiciones (documentación legal pública indexable por Google Search Console)
     * - /robots.txt, /sitemap.xml, /logo.jpg (metadatos SEO y logo público)
     * - /api/auth (endpoints OAuth de Google)
     * - /api/mercadopago (callback y webhook públicos de MercadoPago)
     * - /api/stream, /api/stream-proxy, /api/extractor (protegidos para streaming HLS/MP4 y receptores Smart TV)
     * - /api/health/cron (protegido por su propio CRON_SECRET)
     * - archivos estáticos (_next/static, _next/image, favicon.ico, icon.svg)
     */
    "/((?!login|privacidad|condiciones|robots\\.txt|sitemap\\.xml|logo\\.jpg|api/auth|api/mercadopago|api/stream|api/stream-proxy|api/extractor|api/health/cron|_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
