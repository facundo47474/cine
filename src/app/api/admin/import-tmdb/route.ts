import { NextRequest, NextResponse } from "next/server";
import { tmdbImportService, movieRepository } from "@/infrastructure/container";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";

export const dynamic = "force-dynamic";

interface RawMirrorInputPayload {
  serverName?: string;
  language?: string;
  rawUrl: string;
  format?: string;
  quality?: string;
  priority?: number;
}

/**
 * Endpoint Administrativo de Ingesta (`POST /api/admin/import-tmdb`).
 *
 * Permite agregar una película al catálogo local ya sea sincronizando metadatos desde TMDB
 * por su `tmdbId` o cargando manualmente sus campos descriptivos y lista de mirrors.
 */
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
      (mirror: RawMirrorInputPayload, index: number) => ({
        serverName: mirror.serverName || `Servidor #${index + 1}`,
        language: mirror.language || "Latino",
        rawUrl: mirror.rawUrl,
        format: (mirror.format as MirrorFormat) || MirrorFormat.MP4,
        quality: mirror.quality || "1080p",
        priority: mirror.priority ?? index + 1,
      })
    );

    if (manualMovie && manualMovie.title) {
      const savedMovie = await movieRepository.upsertMovieWithMirrors({
        tmdbId: tmdbId ? Number(tmdbId) : null,
        title: manualMovie.title,
        originalTitle: manualMovie.originalTitle || manualMovie.title,
        synopsis:
          manualMovie.synopsis || "Película agregada manualmente al catálogo.",
        posterUrl:
          manualMovie.posterUrl ||
          "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80",
        backdropUrl: manualMovie.backdropUrl || null,
        releaseYear:
          Number(manualMovie.releaseYear) || new Date().getFullYear(),
        durationMins: Number(manualMovie.durationMins) || 115,
        rating: Number(manualMovie.rating) || 7.5,
        qualityBadge: qualityBadge || "HD",
        genres: manualMovie.genres || ["Acción", "Cine"],
        mirrors: formattedMirrors,
      });

      return NextResponse.json({ ok: true, movie: savedMovie.toObject() });
    }

    if (!tmdbId || isNaN(Number(tmdbId))) {
      return NextResponse.json(
        { ok: false, error: "Proporciona un tmdbId numérico válido." },
        { status: 400 }
      );
    }

    const importedMovie = await tmdbImportService.importMovieByTmdbId({
      tmdbId: Number(tmdbId),
      qualityBadge: qualityBadge || "HD",
      mirrors: formattedMirrors,
    });

    return NextResponse.json({ ok: true, movie: importedMovie });
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
