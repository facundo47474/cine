import { NextRequest, NextResponse } from "next/server";
import { mercadoPagoService } from "@/infrastructure/payments/MercadoPagoService";

export const dynamic = "force-dynamic";

interface MercadoPagoWebhookBody {
  type?: string;
  topic?: string;
  action?: string;
  id?: string | number;
  data?: {
    id?: string | number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const queryTopic = (
      searchParams.get("topic") ||
      searchParams.get("type") ||
      ""
    ).toLowerCase();
    const queryId = searchParams.get("data.id") || searchParams.get("id") || "";

    let body: MercadoPagoWebhookBody | null = null;
    try {
      body = (await request.json()) as MercadoPagoWebhookBody;
    } catch {
      body = null;
    }

    const bodyType = (body?.type || body?.topic || "").toLowerCase();
    const eventType = bodyType || queryTopic;
    const rawPaymentId = body?.data?.id ?? body?.id ?? queryId;
    const paymentId = rawPaymentId ? String(rawPaymentId).trim() : "";

    const isPaymentEvent =
      !eventType ||
      eventType === "payment" ||
      body?.action?.startsWith("payment.") === true;

    if (isPaymentEvent && paymentId) {
      await mercadoPagoService.processApprovedPayment(paymentId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[MercadoPago Webhook] Error procesando notificación:", error);
    // Return 200 to prevent MercadoPago from flooding infinite retries on malformed events,
    // while logging the failure for inspection.
    return NextResponse.json({ ok: true });
  }
}

