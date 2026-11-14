import { NextRequest, NextResponse } from "next/server";
import { seriesService } from "@/infrastructure/container";
import { getAuthenticatedUserId } from "@/infrastructure/auth/sessionHelper";

export const dynamic = "force-dynamic";

/**
 * Obtiene la lista de episodios de una temporada específica enriquecida con el progreso del usuario
 * (`GET /api/series/[id]/seasons/[seasonId]/episodes`).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; seasonId: string } }
) {
  try {
    const userId = await getAuthenticatedUserId();

    const episodes = await seriesService.getSeasonEpisodes(
      params.id,
      params.seasonId,
      userId
    );

    return NextResponse.json({ ok: true, episodes });
  } catch (error) {
    console.error(
      `[GET /api/series/${params.id}/seasons/${params.seasonId}/episodes] Error:`,
      error
    );
    return NextResponse.json(
      { ok: false, error: "Error obteniendo los episodios de la temporada." },
      { status: 500 }
    );
  }
}
