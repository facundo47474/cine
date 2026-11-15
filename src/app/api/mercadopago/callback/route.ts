import { NextRequest, NextResponse } from "next/server";
import { mercadoPagoService } from "@/infrastructure/payments/MercadoPagoService";

export const dynamic = "force-dynamic";

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
    searchParams.get("payment_id") || searchParams.get("collection_id") || "";
  const rawStatus =
    searchParams.get("status") || searchParams.get("collection_status") || "";

  let finalStatus: "approved" | "pending" | "failure" =
    resolveNonApprovedStatus(rawStatus);

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
      } else {
        finalStatus = "failure";
      }
    } catch (error) {
      console.error("[MercadoPago Callback] Error al verificar pago:", error);
      finalStatus = "failure";
    }
  }

  const redirectUrl = new URL("/", origin);
  redirectUrl.searchParams.set("mp_status", finalStatus);
  return NextResponse.redirect(redirectUrl);
}

