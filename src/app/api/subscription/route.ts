import { NextRequest, NextResponse } from "next/server";
import {
  AuthenticatedUserSession,
  getAuthenticatedUserSession,
} from "@/infrastructure/auth/sessionHelper";
import { prismaMembershipRepository } from "@/infrastructure/repositories/PrismaMembershipRepository";
import { welcomeEmailService } from "@/infrastructure/notifications/WelcomeEmailService";
import { mercadoPagoService } from "@/infrastructure/payments/MercadoPagoService";
import { isSameOriginMutation } from "@/infrastructure/security/SecurityGuard";
import {
  apiRateLimiter,
  getClientIp,
} from "@/infrastructure/security/RateLimiter";
import {
  BillingCycle,
  construirEstadoMembresia,
} from "@/domain/services/MembershipPolicy";

export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

type SubscriptionActionBody =
  | { action: "UPGRADE_PRO"; billingCycle?: BillingCycle }
  | { action: "CREATE_CHECKOUT"; billingCycle?: BillingCycle }
  | { action: "DOWNGRADE_FREE" }
  | { action: "TOGGLE_SHIELD_MODE"; enabled: boolean }
  | { action: "RESEND_RECEIPT_EMAIL" };

async function dispatchSubscriptionReceipt(auth: AuthenticatedUserSession) {
  return welcomeEmailService.sendSubscriptionThankYouEmail({
    toEmail: auth.email || "",
    userName: auth.name,
    amountPaidLabel: "$ 2.500 ARS",
    billingCycleLabel: "Mensual",
    activatedAt: new Date(),
  });
}

function buildMissingEmailErrorResponse() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "No pudimos obtener el correo electrónico de tu inicio de sesión para enviar el comprobante.",
    },
    { status: 400 }
  );
}

/**
 * Devuelve el estado actual de membresía Piloto Pro y Modo Escudo del usuario autenticado (`GET /api/subscription`).
 */
export async function GET() {
  try {
    const auth = await getAuthenticatedUserSession();
    if (!auth) {
      return NextResponse.json(
        {
          ok: true,
          authenticated: false,
          userEmail: null,
          membership: construirEstadoMembresia({ plan: "FREE" }),
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const membership = await prismaMembershipRepository.getMembershipByUserId(
      auth.userId,
      auth.email
    );

    return NextResponse.json(
      {
        ok: true,
        authenticated: true,
        userEmail: auth.email ?? null,
        membership,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[GET /api/subscription] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error consultando el estado de tu membresía." },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/**
 * Actualiza el plan de suscripción (Gratis <-> Piloto Pro), el Modo Escudo o reenvía el correo de agradecimiento (`POST /api/subscription`).
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { ok: false, error: "Origen de solicitud no permitido." },
      { status: 403 }
    );
  }

  try {
    const auth = await getAuthenticatedUserSession();
    if (!auth) {
      return NextResponse.json(
        { ok: false, error: "Debes iniciar sesión para gestionar Piloto Pro." },
        { status: 401 }
      );
    }

    const rateLimit = apiRateLimiter.checkLimit(
      `sub:${auth.userId}:${getClientIp(request)}`,
      15,
      60_000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Demasiadas solicitudes de suscripción. Esperá unos segundos antes de reintentar.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const body = (await request.json()) as Partial<SubscriptionActionBody>;

    if (body.action === "UPGRADE_PRO" || body.action === "CREATE_CHECKOUT") {
      if (!auth.email) {
        return buildMissingEmailErrorResponse();
      }
      if (!mercadoPagoService.isConfigured()) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Configurá MERCADOPAGO_ACCESS_TOKEN en tu archivo .env para habilitar el cobro con MercadoPago.",
          },
          { status: 400 }
        );
      }

      const baseUrl =
        process.env.NEXTAUTH_URL?.trim() || request.nextUrl.origin;
      const preference =
        await mercadoPagoService.createSubscriptionPreference({
          userId: auth.userId,
          userEmail: auth.email,
          userName: auth.name,
          baseUrl,
        });

      return NextResponse.json({
        ok: true,
        checkoutUrl: preference.checkoutUrl,
        preferenceId: preference.preferenceId,
        userEmail: auth.email,
      });
    }

    if (body.action === "RESEND_RECEIPT_EMAIL") {
      if (!auth.email) {
        return buildMissingEmailErrorResponse();
      }
      const current = await prismaMembershipRepository.getMembershipByUserId(
        auth.userId,
        auth.email
      );
      if (!current.isPro) {
        return NextResponse.json(
          {
            ok: false,
            error: "Activa Piloto Pro primero para recibir el comprobante por correo.",
            membership: current,
          },
          { status: 403 }
        );
      }

      const emailNotification = await dispatchSubscriptionReceipt(auth);
      return NextResponse.json({
        ok: true,
        membership: current,
        emailNotification,
        userEmail: auth.email,
      });
    }

    if (body.action === "DOWNGRADE_FREE") {
      const membership =
        await prismaMembershipRepository.downgradeToFreeMembership(auth.userId);
      return NextResponse.json({ ok: true, membership });
    }

    if (body.action === "TOGGLE_SHIELD_MODE") {
      const current = await prismaMembershipRepository.getMembershipByUserId(
        auth.userId,
        auth.email
      );
      if (!current.isPro) {
        return NextResponse.json(
          {
            ok: false,
            error: "Activa Piloto Pro para habilitar el Modo Escudo.",
            membership: current,
          },
          { status: 403 }
        );
      }

      const membership = await prismaMembershipRepository.setShieldModeEnabled(
        auth.userId,
        Boolean(body.enabled),
        auth.email
      );
      return NextResponse.json({ ok: true, membership });
    }

    return NextResponse.json(
      { ok: false, error: "Acción de suscripción no reconocida." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[POST /api/subscription] Error:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo actualizar tu membresía Piloto Pro." },
      { status: 500 }
    );
  }
}

