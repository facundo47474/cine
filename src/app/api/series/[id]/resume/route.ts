import { NextRequest, NextResponse } from "next/server";
import { seriesService } from "@/infrastructure/container";
import { getAuthenticatedUserId } from "@/infrastructure/auth/sessionHelper";

export const dynamic = "force-dynamic";

/**
 * Calcula y devuelve el punto de reanudación inteligente (`Smart CTA`) de una serie
 * para el usuario autenticado (`GET /api/series/[id]/resume`).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Debes iniciar sesión para obtener el punto de reanudación.",
        },
        { status: 401 }
      );
    }

    const resume = await seriesService.getUserSeriesResume(userId, params.id);
    return NextResponse.json({ ok: true, resume });
  } catch (error) {
    console.error(`[GET /api/series/${params.id}/resume] Error:`, error);
    return NextResponse.json(
      {
        ok: false,
        error: "Error calculando el punto de reanudación de la serie.",
      },
      { status: 500 }
    );
  }
}
