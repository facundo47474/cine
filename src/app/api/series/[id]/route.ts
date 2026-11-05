import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { seriesService } from "@/infrastructure/container";
import { authOptions } from "@/infrastructure/auth/authOptions";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;

    const details = await seriesService.getSeriesDetails(params.id, userId);

    if (!details) {
      return NextResponse.json(
        { ok: false, error: "Serie no encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, series: details });
  } catch (error) {
    console.error(`[GET /api/series/${params.id}] Error:`, error);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo los detalles de la serie." },
      { status: 500 }
    );
  }
}

