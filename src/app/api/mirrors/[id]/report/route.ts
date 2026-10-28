import { NextRequest, NextResponse } from "next/server";
import { healthCheckerService } from "@/infrastructure/container";

export const dynamic = "force-dynamic";

/**
 * Endpoint invocado automáticamente por el reproductor cuando un Mirror falla al cargar.
 * Dispara una verificación HTTP HEAD inmediata sobre ese mirror y actualiza la disponibilidad.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const mirrorId = params.id;
    const auditResult = await healthCheckerService.auditSingleMirror(mirrorId);

    if (!auditResult) {
      return NextResponse.json(
        { ok: false, error: "Mirror no encontrado." },
        { status: 404 }
      );
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
