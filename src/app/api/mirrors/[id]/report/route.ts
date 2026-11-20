import { NextRequest, NextResponse } from "next/server";
import { healthCheckerService } from "@/infrastructure/container";
import { getAuthenticatedUserId } from "@/infrastructure/auth/sessionHelper";
import { isSameOriginMutation } from "@/infrastructure/security/SecurityGuard";
import {
  apiRateLimiter,
  getClientIp,
} from "@/infrastructure/security/RateLimiter";

export const dynamic = "force-dynamic";

/**
 * Endpoint invocado automáticamente por el reproductor cuando un Mirror falla al cargar (`POST /api/mirrors/[id]/report`).
 * Dispara una verificación HTTP HEAD inmediata sobre ese mirror y recalcula la disponibilidad de la película.
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
    `mirror-report:${userId}:${getClientIp(request)}`,
    40,
    60_000
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Demasiados reportes. Intenta nuevamente luego." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  try {
    const mirrorId = params.id;
    if (mirrorId.startsWith("ep-") || mirrorId.startsWith("emergency-")) {
      return NextResponse.json({
        ok: true,
        skipped: true,
      });
    }

    const auditResult = await healthCheckerService.auditSingleMirror(mirrorId);

    if (!auditResult) {
      return NextResponse.json({
        ok: true,
        ignored: true,
      });
    }

    return NextResponse.json({
      ok: true,
      audit: auditResult,
    });
  } catch (error) {
    console.error("[POST /api/mirrors/[id]/report] Error:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo procesar el reporte del enlace." },
      { status: 500 }
    );
  }
}
