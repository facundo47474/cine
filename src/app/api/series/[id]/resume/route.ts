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

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Debes iniciar sesión para obtener el punto de reanudación." },
        { status: 401 }
      );
    }

    const resume = await seriesService.getUserSeriesResume(userId, params.id);
    return NextResponse.json({ ok: true, resume });
  } catch (error) {
    console.error(`[GET /api/series/${params.id}/resume] Error:`, error);
    return NextResponse.json(
      { ok: false, error: "Error calculando el punto de reanudación de la serie." },
      { status: 500 }
    );
  }
}

