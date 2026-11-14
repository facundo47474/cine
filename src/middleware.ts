import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
  secret:
    process.env.NEXTAUTH_SECRET ||
    process.env.STREAM_TOKEN_SECRET ||
    "piloto_default_nextauth_secret_2026",
});

export const config = {
  matcher: [
    /*
     * Protege todas las rutas excepto:
     * - /login (pantalla de inicio de sesión)
     * - /api/auth (endpoints OAuth de Google)
     * - /api/stream, /api/stream-proxy, /api/extractor (protegidos para streaming HLS/MP4 y receptores Smart TV)
     * - /api/health/cron (protegido por su propio CRON_SECRET)
     * - archivos estáticos (_next/static, _next/image, favicon.ico, icon.svg)
     */
    "/((?!login|api/auth|api/stream|api/stream-proxy|api/extractor|api/health/cron|_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
