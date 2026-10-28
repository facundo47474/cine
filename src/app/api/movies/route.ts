import { NextRequest, NextResponse } from "next/server";
import { catalogService } from "@/infrastructure/container";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
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

    const genreId = genreIdParam ? Number(genreIdParam) : undefined;
    const providerId = providerIdParam ? Number(providerIdParam) : undefined;
    const page = pageParam ? Math.max(1, Number(pageParam)) : 1;

    const result = await catalogService.exploreCatalog({
      query,
      genreId: genreId && !isNaN(genreId) ? genreId : undefined,
      providerId: providerId && !isNaN(providerId) ? providerId : undefined,
      page,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      // Mantenemos compatibilidad retroactiva con `movies`
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
