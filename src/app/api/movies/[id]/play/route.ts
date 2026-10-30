import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { catalogService, watchHistoryService } from "@/infrastructure/container";
import { authOptions } from "@/infrastructure/auth/authOptions";
import {
  apiRateLimiter,
  getClientIp,
} from "@/infrastructure/security/RateLimiter";

export const dynamic = "force-dynamic";

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

    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "No autorizado." },
        { status: 401 }
      );
    }

    const idOrTmdbSlug = decodeURIComponent(params.id);
    const playbackData = await catalogService.getMoviePlaybackData(idOrTmdbSlug);

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
