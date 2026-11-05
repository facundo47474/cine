import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { seriesService } from "@/infrastructure/container";
import { authOptions } from "@/infrastructure/auth/authOptions";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;

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
    console.error(`[GET /api/series/episode/${params.id}/playback] Error:`, error);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo datos de reproducción del episodio." },
      { status: 500 }
    );
  }
}

