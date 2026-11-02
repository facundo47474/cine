import crypto from "crypto";
import { IMirrorResolver } from "@/domain/interfaces/IMirrorResolver";
import { CreateMirrorInput } from "@/domain/interfaces/IMovieRepository";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";

interface TmdbMovieExternalDetails {
  imdb_id?: string | null;
}

interface Embed69ServerEntry {
  servername?: string;
  link?: string;
  type?: string;
}

interface Embed69LanguageBlock {
  file_id?: number;
  video_language?: string;
  sortedEmbeds?: Embed69ServerEntry[];
}

interface Embed69StreamwishExtraction {
  latUrl: string | null;
  subUrl: string | null;
}

interface PlayLatinSourceEntry {
  url?: string;
  server?: string;
  version?: string;
}

interface PlayLatinResolveResponse {
  sources?: PlayLatinSourceEntry[];
}

/**
 * Resolver de Mirrors con extracción directa de Streamwish como servidor primario (#1)
 * y cascada automática de servidores secundarios verificados (PlayLatin / Dropload, MultiEmbed, VidSrc)
 * cuando Streamwish o Embed69 no están disponibles.
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

  private getServerPriorityWeight(servername?: string): number {
    const normalized = (servername || "").toLowerCase();
    if (normalized.includes("streamwish")) return 1;
    if (normalized.includes("filemoon")) return 2;
    if (normalized.includes("doodstream")) return 3;
    if (normalized.includes("rapidvideo")) return 4;
    if (normalized.includes("vidhide")) return 8;
    if (normalized.includes("voe")) return 9;
    return 5;
  }

  private solveEmbed69AesKey(
    challenge: string,
    difficulty: number,
    salt: string
  ): Buffer | null {
    try {
      const safeDifficulty = Math.min(Math.max(1, difficulty), 5);
      const prefix = "0".repeat(safeDifficulty);
      const maxIterations = 500_000;

      for (let nonce = 0; nonce < maxIterations; nonce++) {
        const hashHex = crypto
          .createHash("sha256")
          .update(challenge + String(nonce))
          .digest("hex");

        if (hashHex.startsWith(prefix)) {
          return crypto
            .createHash("sha256")
            .update(challenge + String(nonce) + salt)
            .digest();
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private decryptEmbed69Link(
    encryptedBase64: string,
    aesKey: Buffer
  ): string | null {
    try {
      if (
        encryptedBase64.startsWith("http://") ||
        encryptedBase64.startsWith("https://")
      ) {
        return encryptedBase64;
      }
      const raw = Buffer.from(encryptedBase64, "base64");
      if (raw.length <= 16) return null;

      const iv = raw.subarray(0, 16);
      const ciphertext = raw.subarray(16);
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        aesKey.subarray(0, 32),
        iv
      );
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");

      return decrypted.replace(/`/g, "").trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Intenta extraer directamente los enlaces desencriptados de Streamwish (ej. hglink.to/e/...)
   * desde Embed69 para los idiomas Latino y Subtitulado.
   */
  private async extractDirectStreamwishFromEmbed69(
    imdbId: string
  ): Promise<Embed69StreamwishExtraction> {
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

      if (!res.ok) {
        return { latUrl: null, subUrl: null };
      }

      const html = await res.text();
      if (!html.includes("dataLink") || html.includes("No folders found")) {
        return { latUrl: null, subUrl: null };
      }

      const challengeMatch = html.match(/POW_CHALLENGE\s*=\s*'([^']+)'/);
      const difficultyMatch = html.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
      const saltMatch = html.match(/POW_SALT\s*=\s*'([^']+)'/);

      if (!challengeMatch || !difficultyMatch || !saltMatch) {
        return { latUrl: null, subUrl: null };
      }

      const aesKey = this.solveEmbed69AesKey(
        challengeMatch[1],
        Number(difficultyMatch[1]),
        saltMatch[1]
      );
      if (!aesKey) {
        return { latUrl: null, subUrl: null };
      }

      const dataLinkMatch = html.match(
        /let\s+dataLink\s*=\s*(\[\{[\s\S]*?\}\])\s*;\s*let\s+currentLanguageServers/
      );
      if (!dataLinkMatch) {
        return { latUrl: null, subUrl: null };
      }

      const dataLink = JSON.parse(dataLinkMatch[1]) as Embed69LanguageBlock[];
      if (!Array.isArray(dataLink) || dataLink.length === 0) {
        return { latUrl: null, subUrl: null };
      }

      let latUrl: string | null = null;
      let subUrl: string | null = null;

      for (const block of dataLink) {
        if (
          !Array.isArray(block.sortedEmbeds) ||
          block.sortedEmbeds.length === 0
        ) {
          continue;
        }

        const lang = (block.video_language || "").toUpperCase();
        const orderedEmbeds = [...block.sortedEmbeds].sort(
          (a, b) =>
            this.getServerPriorityWeight(a.servername) -
            this.getServerPriorityWeight(b.servername)
        );

        for (const candidate of orderedEmbeds) {
          if (!candidate.link) continue;
          const decrypted = this.decryptEmbed69Link(candidate.link, aesKey);
          if (decrypted && decrypted.startsWith("http")) {
            if (lang === "LAT" && !latUrl) {
              latUrl = decrypted;
            } else if ((lang === "SUB" || lang === "VOSE") && !subUrl) {
              subUrl = decrypted;
            }
            break;
          }
        }
      }

      return { latUrl, subUrl };
    } catch {
      return { latUrl: null, subUrl: null };
    }
  }

  /**
   * Extrae fuentes secundarias directas (ej. Dropload / XVideoSharing / Doodstream)
   * desde PlayLatinSrc para tenerlas listas como respaldo inmediato si Streamwish falla.
   */
  private async extractPlayLatinFallbackSources(
    imdbId: string
  ): Promise<{ latUrl: string | null; subUrl: string | null }> {
    try {
      const pageUrl = `https://playlatinsrc.co/custom/movie/${imdbId}`;
      const pageRes = await fetch(pageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(3500),
      });

      if (!pageRes.ok) return { latUrl: null, subUrl: null };

      const html = await pageRes.text();
      const tokenMatch = html.match(/data-resolve-token="([^"]+)"/);
      if (!tokenMatch) return { latUrl: null, subUrl: null };

      const resolveRes = await fetch("https://playlatinsrc.co/api/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Referer: pageUrl,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          type: "movie",
          id: imdbId,
          season: "1",
          episode: "1",
          mode: "custom",
          token: tokenMatch[1],
        }),
        signal: AbortSignal.timeout(3500),
      });

      if (!resolveRes.ok) return { latUrl: null, subUrl: null };

      const payload = (await resolveRes.json()) as PlayLatinResolveResponse;
      const sources = Array.isArray(payload.sources) ? payload.sources : [];

      const pickBestSource = (targetVersion: string): string | null => {
        const matching = sources.filter(
          (s) =>
            (s.version || "").toLowerCase() === targetVersion &&
            Boolean(s.url && s.url.startsWith("http"))
        );
        if (matching.length === 0) return null;

        // Priorizamos servidores estilo Streamwish/Dropload sobre otros
        matching.sort((a, b) => {
          const score = (srv?: string) => {
            const name = (srv || "").toLowerCase();
            if (name.includes("streamwish")) return 1;
            if (name.includes("dropload")) return 2;
            if (name.includes("filemoon")) return 3;
            if (name.includes("doodstream")) return 4;
            return 5;
          };
          return score(a.server) - score(b.server);
        });

        return matching[0].url || null;
      };

      return {
        latUrl: pickBestSource("latino") || pickBestSource("castellano"),
        subUrl: pickBestSource("subtitulado"),
      };
    } catch {
      return { latUrl: null, subUrl: null };
    }
  }

  public async resolveDefaultMirrorsForTmdb(
    tmdbId: number
  ): Promise<CreateMirrorInput[]> {
    const imdbId = await this.fetchImdbId(tmdbId);
    const candidates: CreateMirrorInput[] = [];

    if (imdbId) {
      const [streamwish, playLatin] = await Promise.all([
        this.extractDirectStreamwishFromEmbed69(imdbId),
        this.extractPlayLatinFallbackSources(imdbId),
      ]);

      // 1. SIEMPRE iniciar con Streamwish como Prioridad #1 (directo si Embed69 respondió, o vía túnel extractor si Embed69 tuvo hipo temporal)
      candidates.push({
        serverName: "Streamwish-Lat",
        language: "Latino",
        rawUrl:
          streamwish.latUrl ||
          `https://embed69.org/f/${imdbId}?lang=LAT&prefer=streamwish`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority: 1,
      });

      // 2. Respaldo secundario inmediato en Latino (Dropload / PlayLatin directo) por si Streamwish falla
      if (playLatin.latUrl) {
        candidates.push({
          serverName: "Dropload-Lat",
          language: "Latino",
          rawUrl: playLatin.latUrl,
          format: MirrorFormat.EMBED,
          quality: "1080p",
          priority: 2,
        });
      }

      // 3. SIEMPRE iniciar Inglés (Sub) con Streamwish como primera opción de ese idioma
      candidates.push({
        serverName: "Streamwish-Sub",
        language: "Inglés (Sub)",
        rawUrl:
          streamwish.subUrl ||
          `https://embed69.org/f/${imdbId}?lang=SUB&prefer=streamwish`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority: 4,
      });

      // 4. Respaldo secundario inmediato en Inglés (Sub)
      if (playLatin.subUrl) {
        candidates.push({
          serverName: "Dropload-Sub",
          language: "Inglés (Sub)",
          rawUrl: playLatin.subUrl,
          format: MirrorFormat.EMBED,
          quality: "1080p",
          priority: 5,
        });
      }
    }

    const backupLat: CreateMirrorInput = {
      serverName: "Backup-Lat",
      language: "Latino",
      rawUrl: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
      format: MirrorFormat.EMBED,
      quality: "1080p",
      priority: 3,
    };

    const backupEn: CreateMirrorInput = {
      serverName: "Backup-En",
      language: "Inglés (Sub)",
      rawUrl: `https://vidsrc.me/embed/movie?tmdb=${tmdbId}&ds_lang=es`,
      format: MirrorFormat.EMBED,
      quality: "1080p",
      priority: 6,
    };

    candidates.push(backupLat, backupEn);

    return candidates.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  }
}
