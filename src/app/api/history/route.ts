import { NextRequest, NextResponse } from "next/server";
import { watchHistoryService } from "@/infrastructure/container";
import { getAuthenticatedUserId } from "@/infrastructure/auth/sessionHelper";

export const dynamic = "force-dynamic";

/**
 * Obtiene la lista "Continuar viendo" del usuario autenticado (`GET /api/history`).
 */
export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();

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

/**
 * Registra o actualiza el progreso de reproducción de una película o episodio (`POST /api/history`).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

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
        {
          ok: false,
          error:
            "Datos de progreso incompletos (se requiere movieId o episodeId).",
        },
        { status: 400 }
      );
    }

    if (episodeId) {
      const savedEpisodeProgress =
        await watchHistoryService.recordEpisodeProgress({
          userId,
          episodeId,
          progressSeconds: Math.floor(progressSeconds),
          durationSeconds: Math.floor(durationSeconds || 2700),
        });
      return NextResponse.json({ ok: true, progress: savedEpisodeProgress });
    }

    const savedMovieProgress = await watchHistoryService.recordProgress({
      userId,
      movieId,
      progressSeconds: Math.floor(progressSeconds),
      durationSeconds: Math.floor(durationSeconds || 7200),
    });

    return NextResponse.json({ ok: true, progress: savedMovieProgress });
  } catch (error) {
    console.error("[POST /api/history] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error guardando el progreso de reproducción." },
      { status: 500 }
    );
  }
}
