export interface WelcomeEmailParams {
  toEmail: string;
  userName?: string | null;
}

/**
 * Servicio desacoplado de Onboarding por correo electrónico vía API REST de Resend.
 * Diseñado bajo política Zero-Crash para nunca interrumpir ni retrasar el flujo OAuth.
 */
export class WelcomeEmailService {
  private buildHtmlTemplate(displayName: string, appUrl: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido a PILOTO</title>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#121215;border:1px solid #27272a;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 20px 32px;border-bottom:1px solid #27272a;">
              <div style="display:inline-block;background-color:#E50914;color:#ffffff;font-weight:900;font-size:18px;letter-spacing:-0.5px;padding:6px 14px;border-radius:8px;">
                PILOTO
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px 0;font-size:24px;font-weight:800;color:#ffffff;">
                ¡Hola, ${displayName}! Te damos la bienvenida a PILOTO.
              </h1>
              <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#a1a1aa;">
                Tu cuenta ha sido activada exitosamente con Google OAuth 2.0. Ya tienes acceso completo a nuestro catálogo de estrenos y clásicos en alta definición.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;background-color:#18181b;border:1px solid #27272a;border-radius:14px;padding:20px;">
                <tr>
                  <td style="padding-bottom:14px;">
                    <strong style="color:#ffffff;font-size:14px;">🌎 Audio Dual Latino / Inglés (Sub)</strong>
                    <div style="color:#a1a1aa;font-size:12px;margin-top:4px;">
                      Cambia en cualquier momento entre Español Latino e Idioma Original Subtitulado desde la ficha de cada película.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:14px;">
                    <strong style="color:#ffffff;font-size:14px;">⏱️ Sincronización de Progreso</strong>
                    <div style="color:#a1a1aa;font-size:12px;margin-top:4px;">
                      Tus películas se guardan automáticamente cada 15 segundos en tu fila personal «Continuar viendo».
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong style="color:#ffffff;font-size:14px;">📺 Reproducción Sin Fricción y Modo Smart TV</strong>
                    <div style="color:#a1a1aa;font-size:12px;margin-top:4px;">
                      Disfruta en tu móvil, PC o transmite directamente a tu televisor mediante Chromecast y AirPlay.
                    </div>
                  </td>
                </tr>
              </table>

              <div style="text-align:center;margin:28px 0 12px 0;">
                <a href="${appUrl}" style="display:inline-block;background-color:#E50914;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;padding:14px 28px;border-radius:10px;">
                  Explorar el Catálogo Ahora
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#0d0d10;border-top:1px solid #27272a;text-align:center;font-size:11px;color:#71717a;">
              © 2026 PILOTO Streaming • Acceso protegido con Google OAuth 2.0
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  public async sendWelcomeEmail({
    toEmail,
    userName,
  }: WelcomeEmailParams): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const emailFrom =
      process.env.EMAIL_FROM?.trim() ||
      "PILOTO Streaming <onboarding@resend.dev>";

    if (!apiKey) {
      console.info(
        "[WelcomeEmailService] RESEND_API_KEY no configurada, omitiendo envío para:",
        toEmail
      );
      return;
    }

    const displayName = userName?.trim() || "Cinéfilo";
    const appUrl =
      process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000";

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [toEmail],
          subject: "🎬 ¡Bienvenido a PILOTO Streaming! Tu cuenta está lista",
          html: this.buildHtmlTemplate(displayName, appUrl),
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.warn(
          `[WelcomeEmailService] Resend devolvió status ${response.status}:`,
          errorText
        );
      }
    } catch (error) {
      console.warn(
        "[WelcomeEmailService] No se pudo enviar el correo de bienvenida:",
        error
      );
    }
  }
}

export const welcomeEmailService = new WelcomeEmailService();

