import { prisma } from "@/infrastructure/database/prismaClient";
import { prismaMembershipRepository } from "@/infrastructure/repositories/PrismaMembershipRepository";
import { welcomeEmailService } from "@/infrastructure/notifications/WelcomeEmailService";
import {
  MONTHLY_SUBSCRIPTION_DURATION_MS,
  UserMembershipStatusDto,
} from "@/domain/services/MembershipPolicy";
import {
  signExternalReference,
  verifyExternalReference,
} from "@/infrastructure/security/SecurityGuard";

const MERCADOPAGO_API_BASE = "https://api.mercadopago.com";
const PILOTO_PRO_PRICE_ARS = 2500;
const PILOTO_PRO_TITLE = "Piloto Plus - Suscripción Mensual";
const MERCADOPAGO_PAYMENT_ID_REGEX = /^\d{1,24}$/;

function isPublicHttpsUrl(url: string): boolean {
  return /^https:\/\//i.test(url) && !/localhost|127\.0\.0\.1/i.test(url);
}

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
  description?: string | null;
  external_reference?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string | null;
  date_created?: string | null;
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

interface ParsedExternalRefData {
  userId: string;
  userEmail?: string;
  userName?: string | null;
  billingCycle?: string;
}

function parseTrustedPaymentExternalReference(
  rawRef: string | null | undefined
): ParsedExternalRefData | null {
  const verified = verifyExternalReference(rawRef);
  if (verified.valid && verified.userId) {
    return {
      userId: verified.userId,
      userEmail: verified.userEmail,
      userName: verified.userName,
      billingCycle: verified.billingCycle,
    };
  }

  if (!rawRef || typeof rawRef !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(rawRef.trim()) as Partial<ParsedExternalRefData>;
    if (parsed && typeof parsed.userId === "string" && parsed.userId.trim()) {
      return {
        userId: parsed.userId.trim(),
        userEmail:
          typeof parsed.userEmail === "string" ? parsed.userEmail : undefined,
        userName: parsed.userName ?? null,
        billingCycle:
          typeof parsed.billingCycle === "string"
            ? parsed.billingCycle
            : "MONTHLY",
      };
    }
  } catch {
    return null;
  }

  return null;
}

class MercadoPagoService {
  private readonly processedPaymentIds = new Set<string>();
  private readonly inFlightPayments = new Map<
    string,
    Promise<ProcessMercadoPagoPaymentResult>
  >();
  private readonly lastReconcileAttemptByUser = new Map<string, number>();

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
        "El servicio de pagos de MercadoPago no está disponible en este momento."
      );
    }

    const cleanBaseUrl = params.baseUrl.replace(/\/+$/, "");
    const callbackUrl = `${cleanBaseUrl}/api/mercadopago/callback`;
    const externalReference = signExternalReference({
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
            "Suscripción mensual a Piloto Plus • Experiencia con nuestro propio reproductor.",
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
    if (!MERCADOPAGO_PAYMENT_ID_REGEX.test(cleanId)) {
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
    if (!MERCADOPAGO_PAYMENT_ID_REGEX.test(cleanId)) {
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

    if (
      payment.currency_id !== "ARS" ||
      typeof payment.transaction_amount !== "number" ||
      payment.transaction_amount < PILOTO_PRO_PRICE_ARS
    ) {
      return {
        ok: false,
        status: "invalid_amount",
        error: "El monto o moneda del pago no coincide con el plan Piloto Plus.",
      };
    }

    const ref = parseTrustedPaymentExternalReference(payment.external_reference);
    if (!ref || !ref.userId) {
      return {
        ok: false,
        status: "invalid_reference",
        error: "El pago aprobado no contiene referencia válida de usuario.",
      };
    }

    let dbUser = await prisma.user.findUnique({
      where: { id: ref.userId },
    });

    if (!dbUser && ref.userEmail) {
      dbUser = await prisma.user.findFirst({
        where: {
          email: {
            equals: ref.userEmail,
            mode: "insensitive",
          },
        },
      });
    }

    if (!dbUser) {
      return {
        ok: false,
        status: "approved",
        error: "No se encontró el usuario asociado al pago.",
      };
    }

    const alreadyClaimed =
      await prismaMembershipRepository.isPaymentAlreadyClaimedByAnotherUser(
        paymentId,
        dbUser.id
      );
    if (alreadyClaimed) {
      return {
        ok: false,
        status: "already_claimed",
        error: "Este pago ya fue utilizado por otra cuenta.",
      };
    }

    const rawApprovedDate = payment.date_approved
      ? new Date(payment.date_approved)
      : null;
    const activatedAt =
      rawApprovedDate && !Number.isNaN(rawApprovedDate.getTime())
        ? rawApprovedDate
        : new Date();

    const existingMembership =
      await prismaMembershipRepository.getMembershipByUserId(
        dbUser.id,
        dbUser.email
      );
    if (
      existingMembership.isPro &&
      existingMembership.activatedAt &&
      Math.abs(
        new Date(existingMembership.activatedAt).getTime() -
          activatedAt.getTime()
      ) < 5000
    ) {
      this.processedPaymentIds.add(paymentId);
      return {
        ok: true,
        status: "approved",
        alreadyProcessed: true,
        userId: dbUser.id,
        membership: existingMembership,
      };
    }

    const membership = await prismaMembershipRepository.activateProMembership(
      dbUser.id,
      "MONTHLY",
      activatedAt,
      dbUser.email || ref.userEmail,
      paymentId
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
            activatedAt,
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

  /**
   * Consulta una orden comercial (`merchant_order_id`) de MercadoPago y activa el pago aprobado asociado.
   */
  public async processMerchantOrder(
    merchantOrderId: string
  ): Promise<ProcessMercadoPagoPaymentResult> {
    const cleanOrderId = String(merchantOrderId || "").trim();
    if (!MERCADOPAGO_PAYMENT_ID_REGEX.test(cleanOrderId)) {
      return {
        ok: false,
        status: "invalid_order",
        error: "ID de orden de MercadoPago inválido.",
      };
    }

    const accessToken = this.getAccessToken();
    if (!accessToken) {
      return {
        ok: false,
        status: "unconfigured",
        error: "MERCADOPAGO_ACCESS_TOKEN no configurado.",
      };
    }

    const response = await fetch(
      `${MERCADOPAGO_API_BASE}/merchant_orders/${encodeURIComponent(cleanOrderId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return {
        ok: false,
        status: "order_not_found",
        error: `Error al consultar merchant_order (${response.status}).`,
      };
    }

    const order = (await response.json().catch(() => null)) as {
      payments?: Array<{ id?: number | string; status?: string }>;
    } | null;

    const approvedPayment = Array.isArray(order?.payments)
      ? order.payments.find(
          (item) => item?.status === "approved" && item?.id != null
        )
      : undefined;

    if (!approvedPayment?.id) {
      return {
        ok: false,
        status: "pending",
        error: "La orden aún no registra un pago aprobado.",
      };
    }

    return this.processApprovedPayment(String(approvedPayment.id));
  }

  /**
   * Busca pagos aprobados recientes del usuario en MercadoPago (últimos 30 días)
   * para conciliar suscripciones cuando el callback o webhook no pudieron entregarse.
   */
  public async reconcileRecentApprovedPaymentForUser(
    userId: string,
    userEmail?: string | null,
    options?: { bypassThrottle?: boolean }
  ): Promise<ProcessMercadoPagoPaymentResult> {
    const cleanUserId = (userId || "").trim();
    const normalizedEmail = (userEmail || "").trim().toLowerCase();

    if (!cleanUserId && !normalizedEmail) {
      return { ok: false, status: "invalid", error: "Usuario inválido." };
    }

    const accessToken = this.getAccessToken();
    if (!accessToken) {
      return {
        ok: false,
        status: "unconfigured",
        error: "MERCADOPAGO_ACCESS_TOKEN no configurado.",
      };
    }

    const throttleKey = cleanUserId || normalizedEmail;
    const now = Date.now();
    const lastAttempt = this.lastReconcileAttemptByUser.get(throttleKey) || 0;
    if (!options?.bypassThrottle && now - lastAttempt < 20_000) {
      return {
        ok: false,
        status: "throttled",
        error: "Conciliación reciente omitida.",
      };
    }
    this.lastReconcileAttemptByUser.set(throttleKey, now);

    const response = await fetch(
      `${MERCADOPAGO_API_BASE}/v1/payments/search?sort=date_created&criteria=desc&limit=15`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return {
        ok: false,
        status: "search_error",
        error: `No se pudo consultar pagos recientes (${response.status}).`,
      };
    }

    const payload = (await response.json().catch(() => null)) as {
      results?: MercadoPagoPaymentInfo[];
    } | null;

    const cutoffMs = now - MONTHLY_SUBSCRIPTION_DURATION_MS;
    const results = Array.isArray(payload?.results) ? payload.results : [];

    for (const candidate of results) {
      if (
        !candidate ||
        candidate.status !== "approved" ||
        candidate.currency_id !== "ARS" ||
        typeof candidate.transaction_amount !== "number" ||
        candidate.transaction_amount < PILOTO_PRO_PRICE_ARS
      ) {
        continue;
      }

      const rawDate = candidate.date_approved || candidate.date_created;
      const dateMs = rawDate ? new Date(rawDate).getTime() : 0;
      if (!Number.isFinite(dateMs) || dateMs < cutoffMs) {
        continue;
      }

      const ref = parseTrustedPaymentExternalReference(
        candidate.external_reference
      );
      if (!ref) {
        continue;
      }

      const matchesUserId = Boolean(cleanUserId && ref.userId === cleanUserId);
      const matchesRefEmail = Boolean(
        normalizedEmail &&
          ref.userEmail?.trim().toLowerCase() === normalizedEmail
      );

      if (!matchesUserId && !matchesRefEmail) {
        continue;
      }

      const candidatePaymentId = String(candidate.id);
      if (cleanUserId) {
        const claimedByAnother =
          await prismaMembershipRepository.isPaymentAlreadyClaimedByAnotherUser(
            candidatePaymentId,
            cleanUserId
          );
        if (claimedByAnother) {
          continue;
        }
      }

      return this.processApprovedPayment(candidatePaymentId);
    }

    return {
      ok: false,
      status: "not_found",
      error: "No se encontraron pagos aprobados vigentes en los últimos 30 días.",
    };
  }
}

export const mercadoPagoService = new MercadoPagoService();

