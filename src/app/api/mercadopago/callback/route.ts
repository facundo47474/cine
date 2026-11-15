import { NextRequest, NextResponse } from "next/server";
import { mercadoPagoService } from "@/infrastructure/payments/MercadoPagoService";

export const dynamic = "force-dynamic";

function cleanParam(value: string | null): string {
  const trimmed = (value || "").trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === "null" ||
    trimmed.toLowerCase() === "undefined"
  ) {
    return "";
  }
  return trimmed;
}

function resolveNonApprovedStatus(rawStatus: string): "pending" | "failure" {
  const normalized = rawStatus.trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "in_process" ||
    normalized === "authorized"
  ) {
    return "pending";
  }
  return "failure";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const paymentId =
    cleanParam(searchParams.get("payment_id")) ||
    cleanParam(searchParams.get("collection_id"));
  const merchantOrderId = cleanParam(searchParams.get("merchant_order_id"));
  const rawExternalRef = cleanParam(searchParams.get("external_reference"));
  const rawStatus =
    cleanParam(searchParams.get("status")) ||
    cleanParam(searchParams.get("collection_status"));

  let finalStatus: "approved" | "pending" | "failure" =
    resolveNonApprovedStatus(rawStatus);
  let resolvedByBackend = false;

  if (paymentId) {
    try {
      const result = await mercadoPagoService.processApprovedPayment(paymentId);
      if (result.ok && result.status === "approved") {
        finalStatus = "approved";
        resolvedByBackend = true;
      } else if (
        result.status === "pending" ||
        result.status === "in_process" ||
        result.status === "authorized"
      ) {
        finalStatus = "pending";
        resolvedByBackend = true;
      }
    } catch (error) {
      console.error("[MercadoPago Callback] Error al verificar pago:", error);
    }
  }

  if (!resolvedByBackend && merchantOrderId) {
    try {
      const orderResult =
        await mercadoPagoService.processMerchantOrder(merchantOrderId);
      if (orderResult.ok && orderResult.status === "approved") {
        finalStatus = "approved";
        resolvedByBackend = true;
      }
    } catch (error) {
      console.error(
        "[MercadoPago Callback] Error al verificar merchant_order:",
        error
      );
    }
  }

  if (!resolvedByBackend && rawExternalRef) {
    try {
      const parsed = JSON.parse(rawExternalRef) as {
        userId?: string;
        userEmail?: string;
      };
      if (parsed?.userId) {
        const reconciled =
          await mercadoPagoService.reconcileRecentApprovedPaymentForUser(
            parsed.userId,
            parsed.userEmail
          );
        if (reconciled.ok && reconciled.status === "approved") {
          finalStatus = "approved";
          resolvedByBackend = true;
        }
      }
    } catch {
      // Ignora si external_reference no es JSON válido
    }
  }

  if (!resolvedByBackend && rawStatus.toLowerCase() === "approved") {
    finalStatus = "failure";
  }

  const redirectUrl = new URL("/", origin);
  redirectUrl.searchParams.set("mp_status", finalStatus);
  return NextResponse.redirect(redirectUrl);
}

