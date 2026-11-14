import { NextRequest, NextResponse } from "next/server";
import { catalogService } from "@/infrastructure/container";
import {
  apiRateLimiter,
  getClientIp,
} from "@/infrastructure/security/RateLimiter";

export const dynamic = "force-dynamic";

/**
 * Endpoint Principal del Catálogo (`GET /api/movies`).
 *
 * - Con `?mode=home`: devuelve el feed completo de la portada (carruseles y banner destacado).
 * - Sin `mode=home`: ejecuta búsqueda y exploración paginada por texto (`q`), género (`genreId`),
 *   plataforma (`providerId`) y tipo de contenido (`mediaType`).
 */
export async function GET(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rateLimit = apiRateLimiter.checkLimit(
      `movies:${clientIp}`,
      90,
      60_000
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Demasiadas peticiones al catálogo. Por favor aguarda unos segundos.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    if (mode === "home") {
      const feed = await catalogService.getHomeFeed();
      return NextResponse.json({
        ok: true,
        ...feed,
      });
    }

    const query = searchParams.get("q") || undefined;
    const genreIdParam = searchParams.get("genreId");
    const providerIdParam = searchParams.get("providerId");
    const pageParam = searchParams.get("page");
    const mediaTypeParam = searchParams.get("mediaType");

    const genreId = genreIdParam ? Number(genreIdParam) : undefined;
    const providerId = providerIdParam ? Number(providerIdParam) : undefined;
    const page = pageParam ? Math.max(1, Number(pageParam)) : 1;
    const mediaType =
      mediaTypeParam === "movie" || mediaTypeParam === "tv"
        ? mediaTypeParam
        : undefined;

    const result = await catalogService.exploreCatalog({
      query,
      genreId: genreId && !isNaN(genreId) ? genreId : undefined,
      providerId: providerId && !isNaN(providerId) ? providerId : undefined,
      page,
      mediaType,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      // Mantiene compatibilidad retroactiva con la propiedad `movies`
      movies: result.items,
    });
  } catch (error) {
    console.error("[GET /api/movies] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error al cargar el catálogo de películas." },
      { status: 500 }
    );
  }
}
