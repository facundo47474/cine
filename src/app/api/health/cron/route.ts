import { NextRequest, NextResponse } from "next/server";
import { healthCheckerService } from "@/infrastructure/container";

export const dynamic = "force-dynamic";

/**
 * Verifica si la petición al endpoint de auditoría programada incluye el secreto `CRON_SECRET`
 * válido por cabecera `Authorization: Bearer` o por query param `?secret=`.
 *
 * @param request Petición `NextRequest` entrante.
 * @returns `true` si la petición está autorizada.
 */
function isCronRequestAuthorized(request: NextRequest): boolean {
  const configuredSecret =
    process.env.CRON_SECRET || "piloto_cron_secret_2026_seguro";

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) {
    return true;
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") === configuredSecret) {
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
