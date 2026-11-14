import { NextRequest, NextResponse } from "next/server";
import { seriesService } from "@/infrastructure/container";
import { getAuthenticatedUserId } from "@/infrastructure/auth/sessionHelper";

export const dynamic = "force-dynamic";

/**
 * Obtiene la información de reproducción, capítulos adyacentes y streams firmados de un episodio
 * (`GET /api/series/episode/[id]/playback`).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getAuthenticatedUserId();

    const playback = await seriesService.getEpisodePlaybackData(
      params.id,
      userId
    );

    if (!playback) {
      return NextResponse.json(
        { ok: false, error: "Episodio no encontrado para reproducción." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, playback });
  } catch (error) {
    console.error(
      `[GET /api/series/episode/${params.id}/playback] Error:`,
      error
    );
    return NextResponse.json(
      {
        ok: false,
        error: "Error obteniendo datos de reproducción del episodio.",
      },
      { status: 500 }
    );
  }
}
