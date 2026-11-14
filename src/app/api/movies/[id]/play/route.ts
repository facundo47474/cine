import { NextRequest, NextResponse } from "next/server";
import { catalogService, watchHistoryService } from "@/infrastructure/container";
import { getAuthenticatedUserId } from "@/infrastructure/auth/sessionHelper";
import {
  apiRateLimiter,
  getClientIp,
} from "@/infrastructure/security/RateLimiter";

export const dynamic = "force-dynamic";

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

    const savedProgressSeconds = await watchHistoryService.getMovieProgress(
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
