import { NextRequest, NextResponse } from "next/server";
import { tmdbImportService, movieRepository } from "@/infrastructure/container";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tmdbId, qualityBadge, mirrors, manualMovie } = body;

    if (!Array.isArray(mirrors) || mirrors.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Debes proporcionar al menos un enlace Mirror." },
        { status: 400 }
      );
    }

    const formattedMirrors = mirrors.map(
      (
        m: {
          serverName?: string;
          language?: string;
          rawUrl: string;
          format?: string;
          quality?: string;
          priority?: number;
        },
        index: number
      ) => ({
        serverName: m.serverName || `Servidor #${index + 1}`,
        language: m.language || "Latino",
        rawUrl: m.rawUrl,
        format: (m.format as MirrorFormat) || MirrorFormat.MP4,
        quality: m.quality || "1080p",
        priority: m.priority ?? index + 1,
      })
    );

    // Si el usuario envía datos manuales sin necesidad de consultar TMDB
    if (manualMovie && manualMovie.title) {
      const saved = await movieRepository.upsertMovieWithMirrors({
        tmdbId: tmdbId ? Number(tmdbId) : null,
        title: manualMovie.title,
        originalTitle: manualMovie.originalTitle || manualMovie.title,
        synopsis:
          manualMovie.synopsis || "Película agregada manualmente al catálogo.",
        posterUrl:
          manualMovie.posterUrl ||
          "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80",
        backdropUrl: manualMovie.backdropUrl || null,
        releaseYear: Number(manualMovie.releaseYear) || new Date().getFullYear(),
        durationMins: Number(manualMovie.durationMins) || 115,
        rating: Number(manualMovie.rating) || 7.5,
        qualityBadge: qualityBadge || "HD",
        genres: manualMovie.genres || ["Acción", "Cine"],
        mirrors: formattedMirrors,
      });

      return NextResponse.json({ ok: true, movie: saved.toObject() });
    }

    if (!tmdbId || isNaN(Number(tmdbId))) {
      return NextResponse.json(
        { ok: false, error: "Proporciona un tmdbId numérico válido." },
        { status: 400 }
      );
    }

    const imported = await tmdbImportService.importMovieByTmdbId({
      tmdbId: Number(tmdbId),
      qualityBadge: qualityBadge || "HD",
      mirrors: formattedMirrors,
    });

    return NextResponse.json({ ok: true, movie: imported });
  } catch (error) {
    console.error("[POST /api/admin/import-tmdb] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Error al importar la película.",
      },
      { status: 500 }
    );
  }
}
