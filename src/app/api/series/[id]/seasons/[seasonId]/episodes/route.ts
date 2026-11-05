import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { seriesService } from "@/infrastructure/container";
import { authOptions } from "@/infrastructure/auth/authOptions";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; seasonId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;

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

