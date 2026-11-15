import { NextRequest, NextResponse } from "next/server";
import { watchHistoryService } from "@/infrastructure/container";
import {
  getAuthenticatedUserId,
  getAuthenticatedUserSession,
} from "@/infrastructure/auth/sessionHelper";
import { prismaMembershipRepository } from "@/infrastructure/repositories/PrismaMembershipRepository";
import { FREE_CONTINUE_WATCHING_LIMIT } from "@/domain/services/MembershipPolicy";
import { isSameOriginMutation } from "@/infrastructure/security/SecurityGuard";

export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

function clampWatchSeconds(rawValue: unknown, fallback: number, min = 0): number {
  const num = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(86400, Math.max(min, Math.floor(num)));
}

/**
 * Obtiene la lista "Continuar viendo" del usuario autenticado (`GET /api/history`),
 * aplicando el límite del plan gratuito cuando no cuenta con Sincronización Cloud Pro.
 */
export async function GET() {
  try {
    const auth = await getAuthenticatedUserSession();

    if (!auth) {
      return NextResponse.json(
        { ok: false, error: "Debes iniciar sesión." },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const [items, membership] = await Promise.all([
      watchHistoryService.getContinueWatching(auth.userId),
      prismaMembershipRepository.getMembershipByUserId(auth.userId, auth.email),
    ]);

    const visibleItems = membership.entitlements.hasUnlimitedCloudSync
      ? items
      : items.slice(0, FREE_CONTINUE_WATCHING_LIMIT);

    return NextResponse.json(
      {
        ok: true,
        items: visibleItems,
        totalCount: items.length,
        isLimitedByFreePlan:
          !membership.entitlements.hasUnlimitedCloudSync &&
          items.length > FREE_CONTINUE_WATCHING_LIMIT,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[GET /api/history] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo el historial de reproducción." },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/**
 * Registra o actualiza el progreso de reproducción de una película o episodio (`POST /api/history`).
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { ok: false, error: "Origen de solicitud no permitido." },
      { status: 403 }
    );
  }

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

    if (
      (!movieId && !episodeId) ||
      typeof progressSeconds !== "number" ||
      !Number.isFinite(progressSeconds)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Datos de progreso incompletos (se requiere movieId o episodeId).",
        },
        { status: 400 }
      );
    }

    const safeProgressSeconds = clampWatchSeconds(progressSeconds, 0, 0);

    if (episodeId) {
      const safeEpisodeDuration = clampWatchSeconds(
        typeof durationSeconds === "number" && durationSeconds > 0
          ? durationSeconds
          : 2700,
        2700,
        1
      );
      const savedEpisodeProgress =
        await watchHistoryService.recordEpisodeProgress({
          userId,
          episodeId,
          progressSeconds: safeProgressSeconds,
          durationSeconds: safeEpisodeDuration,
        });
      return NextResponse.json({ ok: true, progress: savedEpisodeProgress });
    }

    const safeMovieDuration = clampWatchSeconds(
      typeof durationSeconds === "number" && durationSeconds > 0
        ? durationSeconds
        : 7200,
      7200,
      1
    );
    const savedMovieProgress = await watchHistoryService.recordProgress({
      userId,
      movieId,
      progressSeconds: safeProgressSeconds,
      durationSeconds: safeMovieDuration,
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
