import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { catalogService, watchHistoryService } from "@/infrastructure/container";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const idOrTmdbSlug = decodeURIComponent(params.id);
    const playbackData = await catalogService.getMoviePlaybackData(idOrTmdbSlug);

    if (!playbackData) {
      return NextResponse.json(
        { ok: false, error: "Película no encontrada." },
        { status: 404 }
      );
    }

    const cookieStore = cookies();
    const deviceSessionId = cookieStore.get("piloto_device_id")?.value || "";

    // Usamos siempre el UUID real (playbackData.id) para no romper la FK de WatchHistory
    const savedProgressSeconds = deviceSessionId
      ? await watchHistoryService.getMovieProgress(
          deviceSessionId,
          playbackData.id
        )
      : 0;

    return NextResponse.json({
      ok: true,
      movie: playbackData,
      savedProgressSeconds,
    });
  } catch (error) {
    console.error("[GET /api/movies/[id]/play] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo los enlaces de reproducción." },
      { status: 500 }
    );
  }
}
