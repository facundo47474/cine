export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    /*
     * Protege todas las rutas excepto:
     * - /login (pantalla de inicio de sesión)
     * - /api/auth (endpoints OAuth de Google)
     * - /api/stream (protegido directamente en route.ts con sesión y firma AES-256-GCM para receptores Smart TV)
     * - /api/health/cron (protegido por su propio CRON_SECRET)
     * - archivos estáticos (_next/static, _next/image, favicon.ico)
     */
    "/((?!login|api/auth|api/stream|api/health/cron|_next/static|_next/image|favicon.ico).*)",
  ],
};
