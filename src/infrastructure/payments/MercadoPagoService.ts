import { prisma } from "@/infrastructure/database/prismaClient";
import { prismaMembershipRepository } from "@/infrastructure/repositories/PrismaMembershipRepository";
import { welcomeEmailService } from "@/infrastructure/notifications/WelcomeEmailService";
import { UserMembershipStatusDto } from "@/domain/services/MembershipPolicy";

const MERCADOPAGO_API_BASE = "https://api.mercadopago.com";
const PILOTO_PRO_PRICE_ARS = 2500;
const PILOTO_PRO_TITLE = "Piloto Plus - Suscripción Mensual";

export interface CreateSubscriptionPreferenceParams {
  userId: string;
  userEmail: string;
  userName?: string | null;
  baseUrl: string;
}

export interface CreateSubscriptionPreferenceResult {
  preferenceId: string;
  checkoutUrl: string;
}

export interface MercadoPagoPaymentInfo {
  id: number | string;
  status: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  payer?: {
    email?: string | null;
  } | null;
}

export interface ProcessMercadoPagoPaymentResult {
  ok: boolean;
  status: string;
  alreadyProcessed?: boolean;
  userId?: string;
  membership?: UserMembershipStatusDto;
  emailSent?: boolean;
  error?: string;
}

interface ParsedExternalReference {
  userId?: string;
  userEmail?: string;
  userName?: string | null;
  billingCycle?: string;
}

function isPublicHttpsUrl(url: string): boolean {
  return /^https:\/\//i.test(url) && !/localhost|127\.0\.0\.1/i.test(url);
}

function parseExternalReference(
  rawRef: string | null | undefined
): ParsedExternalReference {
  if (!rawRef || typeof rawRef !== "string") {
    return {};
  }

  const trimmed = rawRef.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as ParsedExternalReference;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    return { userId: trimmed };
  }

  return {};
}

class MercadoPagoService {
  private readonly processedPaymentIds = new Set<string>();
  private readonly inFlightPayments = new Map<
    string,
    Promise<ProcessMercadoPagoPaymentResult>
  >();

  private getAccessToken(): string {
    return process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || "";
  }

  public isConfigured(): boolean {
    return this.getAccessToken().length > 0;
  }

  public async createSubscriptionPreference(
    params: CreateSubscriptionPreferenceParams
  ): Promise<CreateSubscriptionPreferenceResult> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error(
        "Configurá MERCADOPAGO_ACCESS_TOKEN en tu archivo .env para habilitar el cobro con MercadoPago."
      );
    }

    const cleanBaseUrl = params.baseUrl.replace(/\/+$/, "");
    const callbackUrl = `${cleanBaseUrl}/api/mercadopago/callback`;
    const externalReference = JSON.stringify({
      userId: params.userId,
      userEmail: params.userEmail,
      userName: params.userName || null,
      billingCycle: "MONTHLY",
    });

    const basePayload: Record<string, unknown> = {
      items: [
        {
          id: "piloto-plus-monthly",
          title: PILOTO_PRO_TITLE,
          description:
            "Suscripción mensual a Piloto Pro con Modo Escudo sin publicidad.",
          quantity: 1,
          currency_id: "ARS",
          unit_price: PILOTO_PRO_PRICE_ARS,
        },
      ],
      payer: {
        email: params.userEmail,
      },
      external_reference: externalReference,
      back_urls: {
        success: callbackUrl,
        pending: callbackUrl,
        failure: callbackUrl,
      },
      statement_descriptor: "PILOTO PLUS",
    };

    if (isPublicHttpsUrl(cleanBaseUrl)) {
      basePayload.auto_return = "approved";
      basePayload.notification_url = `${cleanBaseUrl}/api/mercadopago/webhook`;
    }

    let response = await this.postPreference(accessToken, basePayload);

    // Retry without auto_return if MercadoPago rejects auto_return on the host URL.
    if (!response.ok && response.status === 400 && basePayload.auto_return) {
      const errorBody = await response.clone().text().catch(() => "");
      if (errorBody.includes("auto_return") || errorBody.includes("back_url")) {
        const fallbackPayload = { ...basePayload };
        delete fallbackPayload.auto_return;
        response = await this.postPreference(accessToken, fallbackPayload);
      }
    }

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
      message?: string;
      error?: string;
    };

    if (!response.ok || !data.id) {
      const detail =
        data.message || data.error || `HTTP ${response.status} al crear preferencia`;
      throw new Error(`No se pudo iniciar el checkout de MercadoPago: ${detail}`);
    }

    const isSandbox = accessToken.startsWith("TEST-");
    const checkoutUrl = isSandbox
      ? data.sandbox_init_point || data.init_point || ""
      : data.init_point || data.sandbox_init_point || "";

    if (!checkoutUrl) {
      throw new Error(
        "MercadoPago no devolvió una URL de checkout válida para completar el pago."
      );
    }

    return {
      preferenceId: data.id,
      checkoutUrl,
    };
  }

  private async postPreference(
    accessToken: string,
    payload: Record<string, unknown>
  ): Promise<Response> {
    return fetch(`${MERCADOPAGO_API_BASE}/checkout/preferences`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  }

  public async getPaymentById(
    paymentId: string
  ): Promise<MercadoPagoPaymentInfo | null> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error("MERCADOPAGO_ACCESS_TOKEN no configurado.");
    }

    const cleanId = paymentId.trim();
    if (!cleanId) {
      return null;
    }

    const response = await fetch(
      `${MERCADOPAGO_API_BASE}/v1/payments/${encodeURIComponent(cleanId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    if (response.status === 404) {
      return null;
    }

    const data = (await response.json().catch(() => null)) as
      | (MercadoPagoPaymentInfo & { message?: string; error?: string })
      | null;

    if (!response.ok || !data) {
      const detail = data?.message || data?.error || `HTTP ${response.status}`;
      throw new Error(`Error al consultar el pago en MercadoPago: ${detail}`);
    }

    return data;
  }

  public async processApprovedPayment(
    paymentId: string
  ): Promise<ProcessMercadoPagoPaymentResult> {
    const cleanId = String(paymentId || "").trim();
    if (!cleanId || cleanId === "null" || cleanId === "undefined") {
      return {
        ok: false,
        status: "invalid",
        error: "ID de pago de MercadoPago inválido.",
      };
    }

    if (!this.isConfigured()) {
      return {
        ok: false,
        status: "unconfigured",
        error: "MERCADOPAGO_ACCESS_TOKEN no configurado.",
      };
    }

    if (this.processedPaymentIds.has(cleanId)) {
      return {
        ok: true,
        status: "approved",
        alreadyProcessed: true,
      };
    }

    const existingPromise = this.inFlightPayments.get(cleanId);
    if (existingPromise) {
      return existingPromise;
    }

    const processingPromise = this.executePaymentProcessing(cleanId).finally(
      () => {
        this.inFlightPayments.delete(cleanId);
      }
    );

    this.inFlightPayments.set(cleanId, processingPromise);
    return processingPromise;
  }

  private async executePaymentProcessing(
    paymentId: string
  ): Promise<ProcessMercadoPagoPaymentResult> {
    const payment = await this.getPaymentById(paymentId);
    if (!payment) {
      return {
        ok: false,
        status: "not_found",
        error: "No se encontró el pago en MercadoPago.",
      };
    }

    if (payment.status !== "approved") {
      return {
        ok: false,
        status: payment.status || "pending",
        error: `El pago está en estado "${payment.status}".`,
      };
    }

    const ref = parseExternalReference(payment.external_reference);
    if (!ref.userId) {
      return {
        ok: false,
        status: "approved",
        error: "El pago aprobado no contiene referencia de usuario.",
      };
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: ref.userId },
    });

    if (!dbUser) {
      return {
        ok: false,
        status: "approved",
        error: "No se encontró el usuario asociado al pago.",
      };
    }

    const membership = await prismaMembershipRepository.activateProMembership(
      dbUser.id,
      "MONTHLY"
    );

    this.processedPaymentIds.add(paymentId);

    const targetEmail =
      ref.userEmail || dbUser.email || payment.payer?.email || "";
    const targetName = ref.userName || dbUser.name || null;

    let emailSent = false;
    if (targetEmail) {
      try {
        const emailResult =
          await welcomeEmailService.sendSubscriptionThankYouEmail({
            toEmail: targetEmail,
            userName: targetName,
            amountPaidLabel: "$ 2.500 ARS",
            billingCycleLabel: "Mensual",
            activatedAt: new Date(),
          });
        emailSent = emailResult.sent;
      } catch (emailError) {
        console.error(
          "[MercadoPagoService] Error al enviar correo de bienvenida:",
          emailError
        );
      }
    }

    return {
      ok: true,
      status: "approved",
      userId: dbUser.id,
      membership,
      emailSent,
    };
  }
}

export const mercadoPagoService = new MercadoPagoService();

