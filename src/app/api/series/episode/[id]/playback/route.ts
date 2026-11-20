import { NextRequest, NextResponse } from "next/server";
import { seriesService } from "@/infrastructure/container";
import { getAuthenticatedUserId } from "@/infrastructure/auth/sessionHelper";
import {
  apiRateLimiter,
  getClientIp,
} from "@/infrastructure/security/RateLimiter";

export const dynamic = "force-dynamic";

/**
 * Obtiene la información de reproducción, capítulos adyacentes y streams firmados de un episodio
 * (`GET /api/series/episode/[id]/playback`).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rateLimit = apiRateLimiter.checkLimit(
      `ep-play:${getClientIp(request)}`,
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
