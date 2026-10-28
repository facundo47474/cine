import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { watchHistoryService } from "@/infrastructure/container";

export const dynamic = "force-dynamic";

const DEVICE_COOKIE_NAME = "piloto_device_id";

export async function GET() {
  try {
    const cookieStore = cookies();
    const deviceSessionId = cookieStore.get(DEVICE_COOKIE_NAME)?.value;

    if (!deviceSessionId) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const items = await watchHistoryService.getContinueWatching(deviceSessionId);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("[GET /api/history] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error obteniendo el historial de reproducción." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { movieId, progressSeconds, durationSeconds } = body;

    if (!movieId || typeof progressSeconds !== "number") {
      return NextResponse.json(
        { ok: false, error: "Datos de progreso incompletos." },
        { status: 400 }
      );
    }

    const cookieStore = cookies();
    let deviceSessionId = cookieStore.get(DEVICE_COOKIE_NAME)?.value;

    if (!deviceSessionId) {
      deviceSessionId = crypto.randomUUID();
    }

    const saved = await watchHistoryService.recordProgress({
      deviceSessionId,
      movieId,
      progressSeconds: Math.floor(progressSeconds),
      durationSeconds: Math.floor(durationSeconds || 7200),
    });

    const response = NextResponse.json({ ok: true, progress: saved });

    response.cookies.set(DEVICE_COOKIE_NAME, deviceSessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 año
    });

    return response;
  } catch (error) {
    console.error("[POST /api/history] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Error guardando el progreso de reproducción." },
      { status: 500 }
    );
  }
}
