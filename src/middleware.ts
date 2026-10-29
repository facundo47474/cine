export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    /*
     * Protege absolutamente todas las rutas excepto:
     * - /login (pantalla de inicio de sesión)
     * - /api/auth (endpoints OAuth de Google)
     * - /api/health/cron (protegido por su propio CRON_SECRET)
     * - archivos estáticos (_next/static, _next/image, favicon.ico)
     */
    "/((?!login|api/auth|api/health/cron|_next/static|_next/image|favicon.ico).*)",
  ],
};

