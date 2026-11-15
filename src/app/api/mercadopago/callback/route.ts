import { NextRequest, NextResponse } from "next/server";
import { mercadoPagoService } from "@/infrastructure/payments/MercadoPagoService";

export const dynamic = "force-dynamic";

function resolveRedirectStatus(rawStatus: string): "approved" | "pending" | "failure" {
  const normalized = rawStatus.trim().toLowerCase();
  if (normalized === "approved" || normalized === "success") {
    return "approved";
  }
  if (normalized === "pending" || normalized === "in_process" || normalized === "authorized") {
    return "pending";
  }
  return "failure";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const paymentId =
    searchParams.get("payment_id") || searchParams.get("collection_id") || "";
  const rawStatus =
    searchParams.get("status") || searchParams.get("collection_status") || "";

  let finalStatus = resolveRedirectStatus(rawStatus);

  if (paymentId && paymentId !== "null" && paymentId !== "undefined") {
    try {
      const result = await mercadoPagoService.processApprovedPayment(paymentId);
      if (result.ok && result.status === "approved") {
        finalStatus = "approved";
      } else if (
        result.status === "pending" ||
        result.status === "in_process" ||
        result.status === "authorized"
      ) {
        finalStatus = "pending";
      }
    } catch (error) {
      console.error("[MercadoPago Callback] Error al verificar pago:", error);
    }
  }

  const redirectUrl = new URL("/", origin);
  redirectUrl.searchParams.set("mp_status", finalStatus);
  return NextResponse.redirect(redirectUrl);
}

