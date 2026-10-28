import { NextRequest, NextResponse } from "next/server";
import { tokenCryptoService } from "@/infrastructure/container";
import {
  InvalidTokenError,
  TokenExpiredError,
} from "@/application/services/TokenCryptoService";

export const dynamic = "force-dynamic";

/**
 * Endpoint Proxy de Reproducción (/api/stream/[token]).
 * Desencripta el token AES-256-GCM en tiempo real, verifica que no haya expirado
 * y redirige mediante HTTP 302 hacia el recurso de video sin exponer la URL cruda en el HTML inicial.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const rawToken = decodeURIComponent(params.token);
    const payload = tokenCryptoService.decryptStreamToken(rawToken);

    const response = NextResponse.redirect(payload.rawUrl, { status: 302 });
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return NextResponse.json(
        { ok: false, error: "El enlace temporal de reproducción ha expirado." },
        { status: 410 }
      );
    }
    if (error instanceof InvalidTokenError) {
      return NextResponse.json(
        { ok: false, error: "Token de reproducción inválido." },
        { status: 401 }
      );
    }

    console.error("[GET /api/stream/[token]] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error al resolver el stream." },
      { status: 500 }
    );
  }
}
