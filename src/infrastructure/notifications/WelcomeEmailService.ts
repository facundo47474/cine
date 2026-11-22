import nodemailer from "nodemailer";
import { SITE_URL } from "@/config/seo";

const DEFAULT_APP_URL = SITE_URL;

export interface WelcomeEmailParams {
  toEmail: string;
  userName?: string | null;
}

export interface SubscriptionThankYouEmailParams {
  toEmail: string;
  userName?: string | null;
  amountPaidLabel?: string;
  billingCycleLabel?: string;
  activatedAt?: Date;
}

export type EmailDispatchProvider =
  | "gmail-smtp"
  | "custom-smtp"
  | "resend"
  | "ethereal-preview"
  | "none";

export interface EmailDispatchResult {
  sent: boolean;
  recipientEmail: string;
  provider: EmailDispatchProvider;
  messageId?: string;
  previewUrl?: string | null;
  errorMessage?: string | null;
}

interface ResolvedSmtpConfig {
  provider: "gmail-smtp" | "custom-smtp";
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/**
 * Servicio desacoplado de correos transaccionales vía API REST de Resend.
 * Diseñado bajo política Zero-Crash para nunca interrumpir ni retrasar los flujos de autenticación o suscripción.
 */
export class WelcomeEmailService {
  /**
   * Escapa caracteres especiales HTML en datos provenientes de la sesión del usuario.
   */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Formatea una fecha para mostrarla de manera legible en comprobantes en español.
   */
  private formatActivationDate(date: Date): string {
    try {
      return new Intl.DateTimeFormat("es-AR", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(date);
    } catch {
      return date.toISOString();
    }
  }

  /**
   * Construye la plantilla HTML responsiva del correo de bienvenida a PILOTO Streaming.
   *
   * @param displayName Nombre para mostrar del usuario.
   * @param appUrl URL pública de la aplicación.
   * @returns Cadena HTML completa con estilos inline compatibles con clientes de correo.
   */
  private buildHtmlTemplate(displayName: string, appUrl: string): string {
    const safeName = this.escapeHtml(displayName);
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
                ¡Hola, ${safeName}! Te damos la bienvenida a PILOTO.
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

  /**
   * Construye la plantilla HTML completa y detallada de agradecimiento por suscripción y detalle de pago.
   */
  private buildSubscriptionThankYouHtmlTemplate(params: {
    displayName: string;
    toEmail: string;
    amountPaidLabel: string;
    billingCycleLabel: string;
    activatedAtLabel: string;
    renewalDateLabel: string;
    appUrl: string;
  }): string {
    const safeName = this.escapeHtml(params.displayName);
    const safeEmail = this.escapeHtml(params.toEmail);
    const safeAmount = this.escapeHtml(params.amountPaidLabel);
    const safeCycle = this.escapeHtml(params.billingCycleLabel);
    const safeDate = this.escapeHtml(params.activatedAtLabel);
    const safeRenewalDate = this.escapeHtml(params.renewalDateLabel);
    const safeAppUrl = this.escapeHtml(params.appUrl);

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gracias por suscribirte a Piloto Plus</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px;background-color:#0f172a;color:#ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display:inline-block;background-color:#7c3aed;color:#ffffff;font-weight:800;font-size:13px;letter-spacing:0.3px;padding:6px 14px;border-radius:999px;">
                      🚀 PILOTO SUSCRIPCIÓN ACTIVA
                    </span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:18px 0 8px 0;font-size:24px;font-weight:800;line-height:1.25;color:#ffffff;">
                ¡Muchas gracias por suscribirte, ${safeName}!
              </h1>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#cbd5e1;">
                Tu membresía <strong style="color:#ffffff;">Piloto Plus</strong> ya está activa. A partir de este momento tu cuenta pasó a <strong style="color:#ffffff;">Piloto 🚀</strong> con todas las funciones exclusivas habilitadas.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px 12px 32px;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#64748b;margin-bottom:12px;">
                Detalle del pago y suscripción
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px 20px;">
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">
                    Plan contratado
                  </td>
                  <td align="right" style="padding:8px 0;font-size:13px;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;">
                    Piloto Plus (${safeCycle})
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;font-size:14px;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;">
                    Monto abonado
                  </td>
                  <td align="right" style="padding:10px 0;font-size:18px;font-weight:800;color:#059669;border-bottom:1px solid #e2e8f0;">
                    ${safeAmount} <span style="font-size:12px;font-weight:600;color:#475569;">/ mes</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">
                    Estado de membresía
                  </td>
                  <td align="right" style="padding:8px 0;font-size:13px;font-weight:700;color:#059669;border-bottom:1px solid #e2e8f0;">
                    Activo
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">
                    Fecha de activación
                  </td>
                  <td align="right" style="padding:8px 0;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">
                    ${safeDate}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">
                    Vencimiento / Próxima renovación (30 días)
                  </td>
                  <td align="right" style="padding:8px 0;font-size:13px;font-weight:700;color:#059669;border-bottom:1px solid #e2e8f0;">
                    ${safeRenewalDate}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#475569;">
                    Cuenta asociada
                  </td>
                  <td align="right" style="padding:8px 0;font-size:13px;font-weight:600;color:#0f172a;">
                    ${safeEmail}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 24px 32px;">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#64748b;margin-bottom:12px;">
                Funciones desbloqueadas en tu cuenta
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 20px;">
                <tr>
                  <td style="padding-bottom:12px;border-bottom:1px solid #f1f5f9;">
                    <strong style="color:#0f172a;font-size:13px;">🛡️ Modo Escudo Activo</strong>
                    <div style="color:#475569;font-size:12px;line-height:1.5;margin-top:3px;">
                      Experiencia fluida y directa con nuestro propio reproductor optimizado.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
                    <strong style="color:#0f172a;font-size:13px;">📺 Transmitir a Smart TV</strong>
                    <div style="color:#475569;font-size:12px;line-height:1.5;margin-top:3px;">
                      Envía directamente la señal de video y audio del reproductor a tu televisor mediante Chromecast y AirPlay.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
                    <strong style="color:#0f172a;font-size:13px;">⏭️ Modo Maratón en Series</strong>
                    <div style="color:#475569;font-size:12px;line-height:1.5;margin-top:3px;">
                      Acceso al botón de Saltar Intro / Recap y reproducción continua automática al siguiente episodio.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;">
                    <strong style="color:#0f172a;font-size:13px;">☁️ Sincronización Cloud Ilimitada</strong>
                    <div style="color:#475569;font-size:12px;line-height:1.5;margin-top:3px;">
                      Guarda y retoma tu progreso de reproducción en todos tus dispositivos sin límite de títulos en el historial.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px;">
                    <strong style="color:#0f172a;font-size:13px;">📌 Mi Lista Ilimitada</strong>
                    <div style="color:#475569;font-size:12px;line-height:1.5;margin-top:3px;">
                      Agrega todas las películas y series que quieras a tu lista personal sincronizada en la nube.
                    </div>
                  </td>
                </tr>
              </table>

              <div style="text-align:center;margin:28px 0 8px 0;">
                <a href="${safeAppUrl}" style="display:inline-block;background-color:#059669;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;padding:14px 30px;border-radius:10px;">
                  Disfrutar Piloto ahora
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px;background-color:#f1f5f9;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;line-height:1.5;color:#64748b;">
              © 2026 PILOTO Streaming • Este correo confirma la activación de tu suscripción mensual (${safeAmount}) asociada a ${safeEmail}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private static etherealAccountPromise: Promise<nodemailer.TestAccount> | null =
    null;

  /**
   * Resuelve configuración SMTP directa (Gmail SMTP o SMTP personalizado) desde variables de entorno.
   */
  private resolveSmtpConfig(): ResolvedSmtpConfig | null {
    const emailFromOverride = process.env.EMAIL_FROM?.trim();
    const smtpHost = process.env.SMTP_HOST?.trim();
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();

    if (smtpHost && smtpUser && smtpPass) {
      const parsedPort = Number(process.env.SMTP_PORT || "587");
      const port = Number.isFinite(parsedPort) ? parsedPort : 587;
      return {
        provider: "custom-smtp",
        host: smtpHost,
        port,
        secure: process.env.SMTP_SECURE === "true" || port === 465,
        user: smtpUser,
        pass: smtpPass,
        from: emailFromOverride || `PILOTO Streaming <${smtpUser}>`,
      };
    }

    const gmailAppPassword = (
      process.env.GMAIL_APP_PASSWORD?.trim() ||
      smtpPass ||
      ""
    ).replace(/\s+/g, "");

    if (gmailAppPassword) {
      const gmailUser =
        process.env.GMAIL_USER?.trim() || smtpUser || "facundotomas018@gmail.com";
      return {
        provider: "gmail-smtp",
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        user: gmailUser,
        pass: gmailAppPassword,
        from: emailFromOverride || `PILOTO Streaming <${gmailUser}>`,
      };
    }

    return null;
  }

  /**
   * Envía un correo mediante Nodemailer SMTP (Gmail, SMTP propio o Ethereal de prueba).
   */
  private async sendViaSmtp(params: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
    toEmail: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ messageId: string; rawInfo: nodemailer.SentMessageInfo }> {
    const transporter = nodemailer.createTransport({
      host: params.host,
      port: params.port,
      secure: params.secure,
      auth: {
        user: params.user,
        pass: params.pass,
      },
      connectionTimeout: 7000,
      greetingTimeout: 7000,
      socketTimeout: 9000,
    });

    const info = await transporter.sendMail({
      from: params.from,
      to: params.toEmail,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    return {
      messageId: info.messageId,
      rawInfo: info,
    };
  }

  /**
   * Envía un correo utilizando la API REST de Resend.
   */
  private async trySendViaResend(params: {
    apiKey: string;
    from: string;
    toEmail: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ ok: boolean; messageId?: string; errorMessage?: string }> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: params.from,
          to: [params.toEmail],
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          ok: false,
          errorMessage: `Resend status ${response.status}: ${errorText || "rechazado"}`,
        };
      }

      const payload = (await response.json().catch(() => ({}))) as {
        id?: string;
      };
      return {
        ok: true,
        messageId: payload.id,
      };
    } catch (error) {
      return {
        ok: false,
        errorMessage:
          error instanceof Error ? error.message : "Error de red con Resend",
      };
    }
  }

  /**
   * Obtiene o inicializa una cuenta SMTP de prueba real en Ethereal Email cuando no hay credenciales reales configuradas.
   */
  private async getEtherealTestAccount(): Promise<nodemailer.TestAccount> {
    if (!WelcomeEmailService.etherealAccountPromise) {
      WelcomeEmailService.etherealAccountPromise = nodemailer.createTestAccount();
    }
    try {
      return await WelcomeEmailService.etherealAccountPromise;
    } catch (error) {
      WelcomeEmailService.etherealAccountPromise = null;
      throw error;
    }
  }

  /**
   * Despacha un correo seleccionando automáticamente el mejor transporte disponible:
   * 1) Gmail SMTP (`GMAIL_APP_PASSWORD`) / SMTP propio (`SMTP_HOST`)
   * 2) Resend (`RESEND_API_KEY`)
   * 3) SMTP real de prueba Ethereal (con URL de vista previa) si no hay credenciales reales aún.
   */
  private async dispatchEmail(params: {
    toEmail: string;
    subject: string;
    html: string;
    text: string;
    contextLabel: string;
  }): Promise<EmailDispatchResult> {
    const normalizedRecipient = params.toEmail.trim();
    if (!normalizedRecipient) {
      return {
        sent: false,
        recipientEmail: "",
        provider: "none",
        errorMessage: "No se proporcionó un correo electrónico de destino.",
      };
    }

    const errors: string[] = [];
    const smtpConfig = this.resolveSmtpConfig();

    // 1. Transporte principal SMTP (Gmail o servidor propio)
    if (smtpConfig) {
      try {
        const { messageId } = await this.sendViaSmtp({
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          user: smtpConfig.user,
          pass: smtpConfig.pass,
          from: smtpConfig.from,
          toEmail: normalizedRecipient,
          subject: params.subject,
          html: params.html,
          text: params.text,
        });

        console.info(
          `[WelcomeEmailService] Correo (${params.contextLabel}) enviado por ${smtpConfig.provider} a ${normalizedRecipient} (id=${messageId})`
        );

        return {
          sent: true,
          recipientEmail: normalizedRecipient,
          provider: smtpConfig.provider,
          messageId,
          previewUrl: null,
          errorMessage: null,
        };
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "Fallo SMTP desconocido";
        errors.push(`SMTP (${smtpConfig.provider}): ${detail}`);
        console.warn(
          `[WelcomeEmailService] Error enviando por ${smtpConfig.provider}:`,
          error
        );
      }
    }

    // 2. Resend REST API si RESEND_API_KEY está configurada
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    if (resendApiKey) {
      const emailFrom =
        process.env.EMAIL_FROM?.trim() ||
        "PILOTO Streaming <onboarding@resend.dev>";

      const resendOutcome = await this.trySendViaResend({
        apiKey: resendApiKey,
        from: emailFrom,
        toEmail: normalizedRecipient,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      if (resendOutcome.ok) {
        console.info(
          `[WelcomeEmailService] Correo (${params.contextLabel}) enviado por Resend a ${normalizedRecipient}`
        );
        return {
          sent: true,
          recipientEmail: normalizedRecipient,
          provider: "resend",
          messageId: resendOutcome.messageId,
          previewUrl: null,
          errorMessage: null,
        };
      }

      if (resendOutcome.errorMessage) {
        errors.push(resendOutcome.errorMessage);
        console.warn(
          `[WelcomeEmailService] Resend falló (${params.contextLabel}):`,
          resendOutcome.errorMessage
        );
      }
    }

    // 3. En producción no se utiliza Ethereal de prueba; reportar fallo de entrega limpio
    if (process.env.NODE_ENV === "production") {
      console.error(
        `[WelcomeEmailService] Falló el envío real en producción (${params.contextLabel}):`,
        errors.join(" | ") || "Sin proveedor de correo operativo."
      );
      return {
        sent: false,
        recipientEmail: normalizedRecipient,
        provider: "none",
        previewUrl: null,
        errorMessage: "No se pudo enviar el correo en este momento.",
      };
    }

    // Fallback de desarrollo a servidor SMTP de prueba Ethereal para inspección inmediata
    try {
      const testAccount = await this.getEtherealTestAccount();
      const { messageId, rawInfo } = await this.sendViaSmtp({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        user: testAccount.user,
        pass: testAccount.pass,
        from: `PILOTO Streaming <${testAccount.user}>`,
        toEmail: normalizedRecipient,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      const previewUrl = nodemailer.getTestMessageUrl(rawInfo) || null;
      const configHint =
        errors.length > 0
          ? `Fallo en proveedor configurado (${errors.join(" | ")}). Se generó copia en correo de prueba Ethereal.`
          : "Modo prueba SMTP activo: configura GMAIL_APP_PASSWORD (o RESEND_API_KEY) en .env para entregar directo en la bandeja de Gmail.";

      console.info(
        `[WelcomeEmailService] Correo (${params.contextLabel}) despachado en Ethereal Preview para ${normalizedRecipient}: ${previewUrl}`
      );

      return {
        sent: true,
        recipientEmail: normalizedRecipient,
        provider: "ethereal-preview",
        messageId,
        previewUrl,
        errorMessage: configHint,
      };
    } catch (error) {
      WelcomeEmailService.etherealAccountPromise = null;
      const detail =
        error instanceof Error ? error.message : "No se pudo contactar Ethereal";
      errors.push(detail);
      console.warn(
        `[WelcomeEmailService] No se pudo enviar el correo (${params.contextLabel}):`,
        errors.join(" | ")
      );

      return {
        sent: false,
        recipientEmail: normalizedRecipient,
        provider: "none",
        previewUrl: null,
        errorMessage:
          errors.join(" | ") ||
          "No hay proveedor SMTP o Resend configurado para enviar correos.",
      };
    }
  }

  /**
   * Envía el correo de bienvenida al usuario recién registrado.
   *
   * @param params Destinatario (`toEmail`) y nombre opcional (`userName`).
   */
  public async sendWelcomeEmail({
    toEmail,
    userName,
  }: WelcomeEmailParams): Promise<EmailDispatchResult> {
    const displayName = userName?.trim() || "Cinéfilo";
    const appUrl = DEFAULT_APP_URL;

    const text = [
      `¡Hola, ${displayName}! Te damos la bienvenida a PILOTO.`,
      "Tu cuenta ha sido activada exitosamente con Google OAuth 2.0.",
      "Ya tienes acceso al catálogo completo, audio dual latino/inglés y sincronización de progreso.",
      `Explorar catálogo: ${appUrl}`,
    ].join("\n\n");

    return this.dispatchEmail({
      toEmail,
      subject: "🎬 ¡Bienvenido a PILOTO Streaming! Tu cuenta está lista",
      html: this.buildHtmlTemplate(displayName, appUrl),
      text,
      contextLabel: "bienvenida",
    });
  }

  /**
   * Envía el correo de agradecimiento y detalle completo de pago cuando el usuario activa su suscripción.
   *
   * @param params Datos del suscriptor, monto abonado y ciclo de facturación.
   */
  public async sendSubscriptionThankYouEmail({
    toEmail,
    userName,
    amountPaidLabel = "$ 2.500 ARS",
    billingCycleLabel = "Mensual",
    activatedAt = new Date(),
  }: SubscriptionThankYouEmailParams): Promise<EmailDispatchResult> {
    const displayName = userName?.trim() || "Cinéfilo";
    const appUrl = DEFAULT_APP_URL;
    const activatedAtLabel = this.formatActivationDate(activatedAt);
    const renewalDate = new Date(
      activatedAt.getTime() + 30 * 24 * 60 * 60 * 1000
    );
    const renewalDateLabel = this.formatActivationDate(renewalDate);

    const text = [
      `¡Muchas gracias por suscribirte a Piloto Plus, ${displayName}!`,
      "",
      "DETALLE DEL PAGO Y SUSCRIPCIÓN:",
      `- Plan contratado: Piloto Plus (${billingCycleLabel})`,
      `- Monto abonado: ${amountPaidLabel} / mes`,
      "- Estado de membresía: Activo",
      `- Fecha de activación: ${activatedAtLabel}`,
      `- Vencimiento / Próxima renovación (30 días): ${renewalDateLabel}`,
      `- Cuenta asociada: ${toEmail}`,
      "",
      "FUNCIONES DESBLOQUEADAS:",
      "1. Modo Escudo Activo (experiencia con nuestro propio reproductor)",
      "2. Transmitir a Smart TV (Chromecast y AirPlay)",
      "3. Modo Maratón en Series (Saltar Intro + Autoplay)",
      "4. Sincronización Cloud Ilimitada",
      "5. Mi Lista Ilimitada",
      "",
      `Ir a PILOTO ahora: ${appUrl}`,
    ].join("\n");

    return this.dispatchEmail({
      toEmail,
      subject: "🚀 ¡Gracias por suscribirte a Piloto Plus!",
      html: this.buildSubscriptionThankYouHtmlTemplate({
        displayName,
        toEmail,
        amountPaidLabel,
        billingCycleLabel,
        activatedAtLabel,
        renewalDateLabel,
        appUrl,
      }),
      text,
      contextLabel: "agradecimiento de suscripción",
    });
  }
}

export const welcomeEmailService = new WelcomeEmailService();
