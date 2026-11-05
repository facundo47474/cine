import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { watchHistoryService } from "@/infrastructure/container";
import { authOptions } from "@/infrastructure/auth/authOptions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Debes iniciar sesión." },
        { status: 401 }
      );
    }

    const items = await watchHistoryService.getContinueWatching(userId);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("[GET /api/history] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo el historial de reproducción." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Debes iniciar sesión." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { movieId, episodeId, progressSeconds, durationSeconds } = body;

    if ((!movieId && !episodeId) || typeof progressSeconds !== "number") {
      return NextResponse.json(
        { ok: false, error: "Datos de progreso incompletos (se requiere movieId o episodeId)." },
        { status: 400 }
      );
    }

    if (episodeId) {
      const saved = await watchHistoryService.recordEpisodeProgress({
        userId,
        episodeId,
        progressSeconds: Math.floor(progressSeconds),
        durationSeconds: Math.floor(durationSeconds || 2700),
      });
      return NextResponse.json({ ok: true, progress: saved });
    }

    const saved = await watchHistoryService.recordProgress({
      userId,
      movieId,
      progressSeconds: Math.floor(progressSeconds),
      durationSeconds: Math.floor(durationSeconds || 7200),
    });

    return NextResponse.json({ ok: true, progress: saved });
  } catch (error) {
    console.error("[POST /api/history] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error guardando el progreso de reproducción." },
      { status: 500 }
    );
  }
}
