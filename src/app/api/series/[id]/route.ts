import { NextRequest, NextResponse } from "next/server";
import { seriesService } from "@/infrastructure/container";
import { getAuthenticatedUserId } from "@/infrastructure/auth/sessionHelper";

export const dynamic = "force-dynamic";

/**
 * Obtiene la ficha completa de una serie con sus temporadas, episodios iniciales y reparto (`GET /api/series/[id]`).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getAuthenticatedUserId();
    const details = await seriesService.getSeriesDetails(params.id, userId);

    if (!details) {
      return NextResponse.json(
        { ok: false, error: "Serie no encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, series: details });
  } catch (error) {
    console.error(`[GET /api/series/${params.id}] Error:`, error);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo los detalles de la serie." },
      { status: 500 }
    );
  }
}
