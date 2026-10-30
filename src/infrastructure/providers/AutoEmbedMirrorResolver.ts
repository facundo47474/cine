import { IMirrorResolver } from "@/domain/interfaces/IMirrorResolver";
import { CreateMirrorInput } from "@/domain/interfaces/IMovieRepository";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";

interface TmdbMovieExternalDetails {
  imdb_id?: string | null;
}

interface Embed69HealthProbe {
  isHealthy: boolean;
  hasLat: boolean;
  hasSub: boolean;
}

/**
 * Resolver de Mirrors con Health-Check Server-Side (Anti Falsos Positivos)
 * y soporte multilingüe ("Latino" e "Inglés (Sub)") priorizando Streamwish.
 */
export class AutoEmbedMirrorResolver implements IMirrorResolver {
  private async fetchImdbId(tmdbId: number): Promise<string | null> {
    const apiKey = process.env.TMDB_API_KEY?.trim();
    const bearer = process.env.TMDB_BEARER_TOKEN?.trim();
    if (!apiKey && !bearer) return null;

    try {
      const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
      url.searchParams.set("language", "es-MX");
      if (apiKey && !bearer) url.searchParams.set("api_key", apiKey);

      const headers: Record<string, string> = { Accept: "application/json" };
      if (bearer) headers["Authorization"] = `Bearer ${bearer}`;

      const res = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as TmdbMovieExternalDetails;
      return data.imdb_id || null;
    } catch {
      return null;
    }
  }

  private async probeEmbed69(imdbId: string): Promise<Embed69HealthProbe> {
    try {
      const res = await fetch(`https://embed69.org/f/${imdbId}`, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(4000),
      });

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        return { isHealthy: false, hasLat: false, hasSub: false };
      }

      const text = await res.text();
      if (
        text.includes('{"error"') ||
        text.includes("No folders found") ||
        text.includes("404 Not Found") ||
        res.status === 404 ||
        res.status >= 500 ||
        text.length < 100
      ) {
        return { isHealthy: false, hasLat: false, hasSub: false };
      }

      const hasDataLink = text.includes("dataLink");
      const hasLat =
        /"video_language"\s*:\s*"LAT"/i.test(text) || !hasDataLink;
      const hasSub =
        /"video_language"\s*:\s*"(SUB|VOSE)"/i.test(text) || !hasDataLink;

      return {
        isHealthy: res.ok || res.status === 403,
        hasLat,
        hasSub,
      };
    } catch {
      return { isHealthy: false, hasLat: false, hasSub: false };
    }
  }

  public async resolveDefaultMirrorsForTmdb(
    tmdbId: number
  ): Promise<CreateMirrorInput[]> {
    const imdbId = await this.fetchImdbId(tmdbId);
    const candidates: CreateMirrorInput[] = [];

    if (imdbId) {
      const probe = await this.probeEmbed69(imdbId);

      if (probe.isHealthy && probe.hasLat) {
        candidates.push({
          serverName: "Streamwish-Lat",
          language: "Latino",
          rawUrl: `https://embed69.org/f/${imdbId}?lang=LAT&prefer=streamwish`,
          format: MirrorFormat.EMBED,
          quality: "1080p",
          priority: 1,
        });
      }

      if (probe.isHealthy && probe.hasSub) {
        candidates.push({
          serverName: "Streamwish-Sub",
          language: "Inglés (Sub)",
          rawUrl: `https://embed69.org/f/${imdbId}?lang=SUB&prefer=streamwish`,
          format: MirrorFormat.EMBED,
          quality: "1080p",
          priority: 3,
        });
      }
    }

    const backupLat: CreateMirrorInput = {
      serverName: "Backup-Lat",
      language: "Latino",
      rawUrl: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
      format: MirrorFormat.EMBED,
      quality: "1080p",
      priority: 2,
    };

    const backupEn: CreateMirrorInput = {
      serverName: "Backup-En",
      language: "Inglés (Sub)",
      rawUrl: `https://vidsrc.me/embed/movie?tmdb=${tmdbId}&ds_lang=es`,
      format: MirrorFormat.EMBED,
      quality: "1080p",
      priority: 4,
    };

    candidates.push(backupLat, backupEn);

    return candidates.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  }
}
