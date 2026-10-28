import { NextRequest, NextResponse } from "next/server";
import { catalogService } from "@/infrastructure/container";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const movie = await catalogService.refreshMovieMirrors(params.id);
    if (!movie) {
      return NextResponse.json(
        { ok: false, error: "No se pudo re-sincronizar la película." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, movie });
  } catch (error) {
    console.error("[POST /api/movies/[id]/refresh-mirrors] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error actualizando servidores." },
      { status: 500 }
    );
  }
}
