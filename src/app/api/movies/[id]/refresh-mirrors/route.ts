import { NextRequest, NextResponse } from "next/server";
import { catalogService } from "@/infrastructure/container";
import { getAuthenticatedUserId } from "@/infrastructure/auth/sessionHelper";
import { isSameOriginMutation } from "@/infrastructure/security/SecurityGuard";
import {
  apiRateLimiter,
  getClientIp,
} from "@/infrastructure/security/RateLimiter";

export const dynamic = "force-dynamic";

/**
 * Fuerza la re-sincronización de los enlaces mirror de una película (`POST /api/movies/[id]/refresh-mirrors`).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { ok: false, error: "Origen de solicitud no permitido." },
      { status: 403 }
    );
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "No autorizado." },
      { status: 401 }
    );
  }

  const rateLimit = apiRateLimiter.checkLimit(
    `refresh-mirrors:${userId}:${getClientIp(request)}`,
    20,
    60_000
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "Demasiadas actualizaciones de servidores. Esperá un momento.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  try {
    const movie = await catalogService.refreshMovieMirrors(params.id);
    if (!movie) {
      return NextResponse.json(
        { ok: false, error: "No se pudo re-sincronizar la película." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, movie });
  } catch (error) {
    console.error("[POST /api/movies/[id]/refresh-mirrors] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error actualizando servidores." },
      { status: 500 }
    );
  }
}
