import { NextRequest, NextResponse } from "next/server";
import { healthCheckerService } from "@/infrastructure/container";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado. Provee CRON_SECRET válido." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || "25");
    const report = await healthCheckerService.runBatchHealthCheck(limit, 150);

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

export async function POST(request: NextRequest) {
  return GET(request);
}
