import { NextRequest, NextResponse } from "next/server";
import { healthCheckerService } from "@/infrastructure/container";
import { safeCompareSecrets } from "@/infrastructure/security/SecurityGuard";

export const dynamic = "force-dynamic";

/**
 * Verifica si la petición al endpoint de auditoría programada incluye el secreto `CRON_SECRET`
 * válido por cabecera `Authorization: Bearer` o por query param `?secret=`.
 *
 * @param request Petición `NextRequest` entrante.
 * @returns `true` si la petición está autorizada.
 */
function isCronRequestAuthorized(request: NextRequest): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization") || "";
  if (
    authHeader.startsWith("Bearer ") &&
    safeCompareSecrets(authHeader.slice(7).trim(), configuredSecret)
  ) {
    return true;
  }

  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret")?.trim() || "";
  if (querySecret && safeCompareSecrets(querySecret, configuredSecret)) {
    return true;
  }

  return false;
}

/**
 * Endpoint de Auditoría Automática de Enlaces (`GET /api/health/cron`).
 * Ejecuta un lote de revisiones HTTP sobre los mirrors del catálogo.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado. Provee CRON_SECRET válido." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const batchLimit = Number(searchParams.get("limit") || "25");
    const report = await healthCheckerService.runBatchHealthCheck(
      batchLimit,
      150
    );

    return NextResponse.json({
      ok: true,
      report,
    });
  } catch (error) {
    console.error("[GET /api/health/cron] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error ejecutando el Health Checker." },
      { status: 500 }
    );
  }
}

/**
 * Permite invocar el cron también mediante método `POST`.
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
