import { NextRequest, NextResponse } from "next/server";
import { catalogService, watchHistoryService } from "@/infrastructure/container";
import { getAuthenticatedUserId } from "@/infrastructure/auth/sessionHelper";
import {
  apiRateLimiter,
  getClientIp,
} from "@/infrastructure/security/RateLimiter";

export const dynamic = "force-dynamic";

/**
 * Obtiene de forma aislada el progreso guardado de una película para el usuario.
 * Si la lectura del historial falla, degrada a `0` segundos para no interrumpir la reproducción.
 */
async function obtenerProgresoDeReanudacionSeguro(
  userId: string,
  movieId: string
): Promise<number> {
  try {
    return await watchHistoryService.getMovieProgress(userId, movieId);
  } catch (historyError) {
    console.warn(
      `[GET /api/movies/[id]/play] Error leyendo progreso de película ${movieId}:`,
      historyError
    );
    return 0;
  }
}

/**
 * Obtiene los datos de reproducción, streams firmados con AES-256-GCM y el progreso guardado
 * de una película (`GET /api/movies/[id]/play`).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientIp = getClientIp(request);
    const rateLimit = apiRateLimiter.checkLimit(
      `play:${clientIp}`,
      90,
      60_000
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "Demasiadas peticiones. Intenta nuevamente en unos segundos.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const userId = await getAuthenticatedUserId();

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "No autorizado." },
        { status: 401 }
      );
    }

    const idOrTmdbSlug = decodeURIComponent(params.id);
    const playbackData =
      await catalogService.getMoviePlaybackData(idOrTmdbSlug);

    if (!playbackData) {
      return NextResponse.json(
        { ok: false, error: "Película no encontrada." },
        { status: 404 }
      );
    }

    if (playbackData.redirectToSeriesId) {
      return NextResponse.json({
        ok: true,
        redirectToSeriesId: playbackData.redirectToSeriesId,
        movie: playbackData,
        savedProgressSeconds: 0,
      });
    }

    const savedProgressSeconds = await obtenerProgresoDeReanudacionSeguro(
      userId,
      playbackData.id
    );

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
