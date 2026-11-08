import crypto from "crypto";
import dns from "dns";
import { IMirrorResolver } from "@/domain/interfaces/IMirrorResolver";
import { CreateMirrorInput } from "@/domain/interfaces/IMovieRepository";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Silencioso en entornos donde no aplique
}

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
  latBackupUrl?: string | null;
  subUrl: string | null;
  subBackupUrl?: string | null;
}

interface PlayLatinSourceEntry {
  url?: string;
  server?: string;
  name?: string;
  version?: string;
}

interface PlayLatinResolveResponse {
  sources?: PlayLatinSourceEntry[];
}

/**
 * Resolver de Mirrors con extracción directa de Streamwish como servidor primario (#1)
 * y cascada automática de servidores secundarios verificados (PlayLatin / Dropload, VidSrc)
 * tanto para Películas como para Episodios de Series de TV.
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
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as TmdbMovieExternalDetails;
      return data.imdb_id || null;
    } catch {
      return null;
    }
  }

  private async fetchTvImdbId(tmdbId: number): Promise<string | null> {
    const apiKey = process.env.TMDB_API_KEY?.trim();
    const bearer = process.env.TMDB_BEARER_TOKEN?.trim();
    if (!apiKey && !bearer) return null;

    try {
      const url = new URL(
        `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids`
      );
      if (apiKey && !bearer) url.searchParams.set("api_key", apiKey);

      const headers: Record<string, string> = { Accept: "application/json" };
      if (bearer) headers["Authorization"] = `Bearer ${bearer}`;

      const res = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(3500),
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
    if (normalized.includes("mixdrop")) return 2;
    if (normalized.includes("vidhide")) return 3;
    if (normalized.includes("filemoon")) return 4;
    if (normalized.includes("voe")) return 5;
    if (normalized.includes("dropload")) return 6;
    if (normalized.includes("doodstream")) return 7;
    if (normalized.includes("rapidvideo")) return 8;
    return 9;
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

  private normalizeEmbedUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    const swMatch = trimmed.match(
      /^https?:\/\/(?:www\.)?streamwish\.(?:to|com|gg)\/e\/([a-zA-Z0-9_-]+)/i
    );
    if (swMatch?.[1]) {
      return `https://hglink.to/e/${swMatch[1]}`;
    }
    return trimmed;
  }

  private parseDomOptionsFromEmbed69(
    html: string
  ): Embed69StreamwishExtraction | null {
    if (!html.includes("data-url=")) return null;

    const langByCode = new Map<string, "LAT" | "ESP" | "SUB">([
      ["0", "LAT"],
      ["1", "ESP"],
      ["2", "SUB"],
    ]);

    const selectBlock = html.match(
      /<ul[^>]*class="[^"]*SelectLangDisp[^"]*"[^>]*>([\s\S]*?)<\/ul>/i
    );
    if (selectBlock?.[1]) {
      const liRegex = /<li[^>]*data-lang="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch: RegExpExecArray | null;
      while ((liMatch = liRegex.exec(selectBlock[1])) !== null) {
        const code = liMatch[1].trim();
        const inner = liMatch[2];
        if (/LAT\.png|latino/i.test(inner)) {
          langByCode.set(code, "LAT");
        } else if (/ESP\.png|espa|castellano/i.test(inner)) {
          langByCode.set(code, "ESP");
        } else if (/SUB\.png|subtitulado|vose/i.test(inner)) {
          langByCode.set(code, "SUB");
        }
      }
    }

    const entriesByLang: Record<
      "LAT" | "ESP" | "SUB",
      { servername: string; url: string }[]
    > = {
      LAT: [],
      ESP: [],
      SUB: [],
    };

    const optionLiRegex =
      /<li([^>]*data-url="[^"]+"[^>]*)>([\s\S]*?)<\/li>/gi;
    let optMatch: RegExpExecArray | null;
    while ((optMatch = optionLiRegex.exec(html)) !== null) {
      const attrs = optMatch[1];
      const inner = optMatch[2];
      if (/data-download\s*=\s*["']1["']/i.test(attrs)) continue;

      const urlMatch = attrs.match(/data-url="([^"]+)"/i);
      if (!urlMatch?.[1]) continue;

      const rawUrl = urlMatch[1].trim();
      if (!rawUrl.startsWith("http") || /1fichier\.com/i.test(rawUrl)) continue;

      const langCode =
        attrs.match(/data-lang="([^"]*)"/i)?.[1]?.trim() ?? "0";
      const mappedLang = langByCode.get(langCode) || "LAT";

      const servername =
        inner.match(/<span>([^<]+)<\/span>/i)?.[1]?.trim() ||
        inner.match(/alt="([^"]+)"/i)?.[1]?.trim() ||
        rawUrl;

      entriesByLang[mappedLang].push({
        servername,
        url: this.normalizeEmbedUrl(rawUrl),
      });
    }

    for (const k of ["LAT", "ESP", "SUB"] as const) {
      entriesByLang[k].sort(
        (a, b) =>
          this.getServerPriorityWeight(a.servername) -
          this.getServerPriorityWeight(b.servername)
      );
    }

    const latPool =
      entriesByLang.LAT.length > 0 ? entriesByLang.LAT : entriesByLang.ESP;
    const subPool = entriesByLang.SUB;

    if (latPool.length === 0 && subPool.length === 0) {
      return null;
    }

    return {
      latUrl: latPool[0]?.url || null,
      latBackupUrl: latPool[1]?.url || null,
      subUrl: subPool[0]?.url || null,
      subBackupUrl: subPool[1]?.url || null,
    };
  }

  /**
   * Intenta extraer directamente los enlaces desencriptados de Streamwish (ej. hglink.to/e/...)
   * desde Embed69 para los idiomas Latino y Subtitulado.
   */
  public async extractDirectStreamwishFromEmbed69(
    slugOrImdbId: string
  ): Promise<Embed69StreamwishExtraction> {
    try {
      const candidateSlugs = [slugOrImdbId];
      const epMatch = slugOrImdbId.match(/^(tt\d+-\d+x)(\d+)$/i);
      if (epMatch) {
        const prefix = epMatch[1];
        const epDigits = epMatch[2];
        const unpadded = String(Number(epDigits));
        const padded = unpadded.padStart(2, "0");
        const altSlug =
          epDigits === padded ? `${prefix}${unpadded}` : `${prefix}${padded}`;
        if (altSlug !== slugOrImdbId) {
          candidateSlugs.push(altSlug);
        }
      }

      const fetchCandidate = async (slug: string): Promise<string | null> => {
        try {
          const res = await fetch(`https://embed69.org/f/${slug}`, {
            method: "GET",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) return null;
          const text = await res.text();
          if (
            !text.includes("No folders found") &&
            (text.includes("dataLink") || text.includes("data-url="))
          ) {
            return text;
          }
          return null;
        } catch {
          return null;
        }
      };

      const htmlResults = await Promise.all(
        candidateSlugs.map((s) => fetchCandidate(s))
      );
      const html = htmlResults.find((h): h is string => Boolean(h));

      if (!html) {
        return { latUrl: null, subUrl: null };
      }

      // Nuevo formato DOM de Embed69 (<li data-url="https://..." data-lang="0">)
      const domExtracted = this.parseDomOptionsFromEmbed69(html);
      if (domExtracted) {
        return domExtracted;
      }

      // Formato clásico de Embed69 (let dataLink = [...] + POW_CHALLENGE)
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

      const latList: string[] = [];
      const espList: string[] = [];
      const subList: string[] = [];

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
            const normalized = this.normalizeEmbedUrl(decrypted);
            if (lang === "LAT" || lang === "LATINO") {
              latList.push(normalized);
            } else if (lang === "ESP" || lang === "CASTELLANO") {
              espList.push(normalized);
            } else if (lang === "SUB" || lang === "VOSE") {
              subList.push(normalized);
            }
          }
        }
      }

      const finalLatList = latList.length > 0 ? latList : espList;

      return {
        latUrl: finalLatList[0] || null,
        latBackupUrl: finalLatList[1] || null,
        subUrl: subList[0] || null,
        subBackupUrl: subList[1] || null,
      };
    } catch {
      return { latUrl: null, subUrl: null };
    }
  }

  /**
   * Extrae fuentes secundarias directas (ej. Dropload / XVideoSharing / Doodstream)
   * desde PlayLatinSrc para tenerlas listas como respaldo inmediato tanto en películas como en series.
   */
  public async extractPlayLatinFallbackSources(
    imdbId: string,
    isTv: boolean = false,
    seasonNumber: number = 1,
    episodeNumber: number = 1
  ): Promise<{ latUrl: string | null; subUrl: string | null }> {
    try {
      const seasonStr = String(seasonNumber);
      const episodeStr = String(episodeNumber);
      const pageUrl = isTv
        ? `https://playlatinsrc.co/custom/serial/${imdbId}/${seasonStr}/${episodeStr}`
        : `https://playlatinsrc.co/custom/movie/${imdbId}`;

      const pageRes = await fetch(pageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(4500),
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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          type: isTv ? "tv" : "movie",
          id: imdbId,
          season: seasonStr,
          episode: episodeStr,
          mode: "custom",
          token: tokenMatch[1],
        }),
        signal: AbortSignal.timeout(4500),
      });

      if (!resolveRes.ok) return { latUrl: null, subUrl: null };

      const payload = (await resolveRes.json()) as PlayLatinResolveResponse;
      const sources = Array.isArray(payload.sources) ? payload.sources : [];

      const sortSources = (list: PlayLatinSourceEntry[]) => {
        return [...list].sort((a, b) => {
          const score = (srv?: string) => {
            const name = (srv || "").toLowerCase();
            if (name.includes("streamwish")) return 1;
            if (name.includes("mixdrop")) return 2;
            if (name.includes("vidhide")) return 3;
            if (name.includes("filemoon")) return 4;
            if (name.includes("dropload")) return 5;
            if (name.includes("doodstream")) return 6;
            return 7;
          };
          return score(a.server || a.name) - score(b.server || b.name);
        });
      };

      const pickBestSource = (targetVersion: string): string | null => {
        const matching = sources.filter(
          (s) =>
            (s.version || "").toLowerCase() === targetVersion &&
            Boolean(s.url && s.url.startsWith("http"))
        );

        if (matching.length > 0) {
          return sortSources(matching)[0].url || null;
        }

        // En series de TV, PlayLatinSrc devuelve las fuentes en Español Latino sin propiedad `version`
        if (isTv && targetVersion === "latino") {
          const untagged = sources.filter(
            (s) => !s.version && Boolean(s.url && s.url.startsWith("http"))
          );
          if (untagged.length > 0) {
            return sortSources(untagged)[0].url || null;
          }
        }

        return null;
      };

      return {
        latUrl: pickBestSource("latino") || pickBestSource("castellano"),
        subUrl: pickBestSource("subtitulado"),
      };
    } catch {
      return { latUrl: null, subUrl: null };
    }
  }

  private detectServerNameFromUrl(url: string, suffix: "Lat" | "Sub"): string {
    const lower = url.toLowerCase();
    if (lower.includes("mxdrop") || lower.includes("mixdrop")) {
      return `Mixdrop-${suffix}`;
    }
    if (
      lower.includes("morencius") ||
      lower.includes("vidhide") ||
      lower.includes("filemoon")
    ) {
      return `Vidhide-${suffix}`;
    }
    if (
      lower.includes("hglink") ||
      lower.includes("audinifer") ||
      lower.includes("vibuxer") ||
      lower.includes("streamwish")
    ) {
      return `Streamwish2-${suffix}`;
    }
    return `Dropload-${suffix}`;
  }

  public async resolveDefaultMirrorsForTmdb(
    tmdbId: number
  ): Promise<CreateMirrorInput[]> {
    const imdbId = await this.fetchImdbId(tmdbId);
    const candidates: CreateMirrorInput[] = [];

    if (imdbId) {
      const [streamwish, playLatin] = await Promise.all([
        this.extractDirectStreamwishFromEmbed69(imdbId),
        this.extractPlayLatinFallbackSources(imdbId, false),
      ]);

      // Si Streamwish directo se resolvió (hglink.to), es prioridad #1.
      // Si estamos en Vercel y Embed69 bloqueó la IP AWS pero PlayLatin resolvió el link directo,
      // ponemos el link directo resuelto como prioridad #1 para que cargue al instante sin salto de error.
      const hasDirectStreamwishLat = Boolean(streamwish.latUrl);

      candidates.push({
        serverName: "Streamwish-Lat",
        language: "Latino",
        rawUrl:
          streamwish.latUrl ||
          `https://embed69.org/f/${imdbId}?lang=LAT&prefer=streamwish`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority: hasDirectStreamwishLat ? 1 : 2,
      });

      const secondaryLatUrl = playLatin.latUrl || streamwish.latBackupUrl;
      if (secondaryLatUrl && secondaryLatUrl !== streamwish.latUrl) {
        candidates.push({
          serverName: this.detectServerNameFromUrl(secondaryLatUrl, "Lat"),
          language: "Latino",
          rawUrl: secondaryLatUrl,
          format: MirrorFormat.EMBED,
          quality: "1080p",
          priority: hasDirectStreamwishLat ? 2 : 1,
        });
      }

      const hasDirectStreamwishSub = Boolean(streamwish.subUrl);

      candidates.push({
        serverName: "Streamwish-Sub",
        language: "Inglés (Sub)",
        rawUrl:
          streamwish.subUrl ||
          `https://embed69.org/f/${imdbId}?lang=SUB&prefer=streamwish`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority: hasDirectStreamwishSub ? 3 : 4,
      });

      const secondarySubUrl = playLatin.subUrl || streamwish.subBackupUrl;
      if (secondarySubUrl && secondarySubUrl !== streamwish.subUrl) {
        candidates.push({
          serverName: this.detectServerNameFromUrl(secondarySubUrl, "Sub"),
          language: "Inglés (Sub)",
          rawUrl: secondarySubUrl,
          format: MirrorFormat.EMBED,
          quality: "1080p",
          priority: hasDirectStreamwishSub ? 4 : 3,
        });
      }
    }

    // Respaldo final de emergencia (con subtítulos en español) para garantizar que jamás falle el reproductor
    candidates.push({
      serverName: "Backup-En",
      language: "Inglés (Sub)",
      rawUrl: `https://vidsrc.me/embed/movie?tmdb=${tmdbId}&ds_lang=es`,
      format: MirrorFormat.EMBED,
      quality: "1080p",
      priority: 6,
    });

    return candidates.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  }

  public async resolveDefaultMirrorsForTvEpisode(
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number,
    imdbIdHint?: string | null
  ): Promise<CreateMirrorInput[]> {
    const imdbId = imdbIdHint || (await this.fetchTvImdbId(tmdbId));
    const candidates: CreateMirrorInput[] = [];

    if (imdbId) {
      const paddedEp = String(episodeNumber).padStart(2, "0");
      const embed69EpisodeSlug = `${imdbId}-${seasonNumber}x${paddedEp}`;

      const [streamwish, playLatin] = await Promise.all([
        this.extractDirectStreamwishFromEmbed69(embed69EpisodeSlug),
        this.extractPlayLatinFallbackSources(
          imdbId,
          true,
          seasonNumber,
          episodeNumber
        ),
      ]);

      const hasDirectStreamwishLat = Boolean(streamwish.latUrl);

      candidates.push({
        serverName: "Streamwish-Lat",
        language: "Latino",
        rawUrl:
          streamwish.latUrl ||
          `https://embed69.org/f/${embed69EpisodeSlug}?lang=LAT&prefer=streamwish`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority: hasDirectStreamwishLat ? 1 : 2,
      });

      const secondaryTvLatUrl = playLatin.latUrl || streamwish.latBackupUrl;
      if (secondaryTvLatUrl && secondaryTvLatUrl !== streamwish.latUrl) {
        candidates.push({
          serverName: this.detectServerNameFromUrl(secondaryTvLatUrl, "Lat"),
          language: "Latino",
          rawUrl: secondaryTvLatUrl,
          format: MirrorFormat.EMBED,
          quality: "1080p",
          priority: hasDirectStreamwishLat ? 2 : 1,
        });
      }

      const hasDirectStreamwishSub = Boolean(streamwish.subUrl);

      candidates.push({
        serverName: "Streamwish-Sub",
        language: "Inglés (Sub)",
        rawUrl:
          streamwish.subUrl ||
          `https://embed69.org/f/${embed69EpisodeSlug}?lang=SUB&prefer=streamwish`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority: hasDirectStreamwishSub ? 3 : 4,
      });

      const secondaryTvSubUrl = playLatin.subUrl || streamwish.subBackupUrl;
      if (secondaryTvSubUrl && secondaryTvSubUrl !== streamwish.subUrl) {
        candidates.push({
          serverName: this.detectServerNameFromUrl(secondaryTvSubUrl, "Sub"),
          language: "Inglés (Sub)",
          rawUrl: secondaryTvSubUrl,
          format: MirrorFormat.EMBED,
          quality: "1080p",
          priority: hasDirectStreamwishSub ? 4 : 3,
        });
      }
    }

    // Respaldo final de emergencia para evitar cartel de contenido no disponible si algún episodio aún no fue doblado
    candidates.push({
      serverName: "Backup-Sub",
      language: "Inglés (Sub)",
      rawUrl: `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${seasonNumber}&episode=${episodeNumber}&ds_lang=es`,
      format: MirrorFormat.EMBED,
      quality: "1080p",
      priority: 6,
    });

    return candidates.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  }
}
