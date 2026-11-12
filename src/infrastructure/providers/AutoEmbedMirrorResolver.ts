import crypto from "crypto";
import dns from "dns";
import { IMirrorResolver } from "@/domain/interfaces/IMirrorResolver";
import { CreateMirrorInput } from "@/domain/interfaces/IMovieRepository";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import {
  FALLBACK_IF_EMPTY,
  STRICT_STREAMWISH_ONLY,
  extractHostname,
  filterAndPrioritizeMirrors,
  isExtractableCleanHost,
  isStreamwish,
  normalizeStreamwishEmbedUrl,
} from "@/domain/utils/streamwishMatcher";

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

interface PlayLatinSourceEntry {
  url?: string;
  server?: string;
  name?: string;
  version?: string;
}

interface PlayLatinResolveResponse {
  sources?: PlayLatinSourceEntry[];
}

export interface SeparatedLanguageSources {
  streamwishLat: string[];
  streamwishSub: string[];
  fallbackLat: string[];
  fallbackSub: string[];
}

interface TaggedMirrorCandidate extends CreateMirrorInput {
  url: string;
}

/**
 * Resolver determinista de Mirrors centrado en Streamwish:
 * - Desempaqueta agregadores multi-embed (Embed69 DOM / AES y PlayLatinSrc) en el servidor.
 * - Detecta universalmente cualquier dominio espejo de Streamwish mediante streamwishMatcher.
 * - Aplica STRICT_STREAMWISH_ONLY / FALLBACK_IF_EMPTY sin invertir prioridades ni disfrazar servidores sucios.
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

  private getServerPriorityWeight(
    servername?: string,
    rawUrl?: string
  ): number {
    if (isStreamwish({ serverName: servername, url: rawUrl })) {
      return 1;
    }
    const normalized = `${servername || ""} ${rawUrl || ""}`.toLowerCase();
    if (normalized.includes("vidhide") || normalized.includes("morencius")) return 2;
    if (normalized.includes("dropload") || normalized.includes("dr0pstream")) return 3;
    if (normalized.includes("mixdrop") || normalized.includes("mxdrop")) return 4;
    if (normalized.includes("filemoon")) return 5;
    if (normalized.includes("voe")) return 6;
    if (normalized.includes("doodstream") || normalized.includes("dood")) return 7;
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

  private parseDomOptionsFromEmbed69(
    html: string
  ): SeparatedLanguageSources | null {
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
      { servername: string; url: string; isSw: boolean }[]
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

      const isSw = isStreamwish({ serverName: servername, url: rawUrl });
      const normalizedUrl = isSw ? normalizeStreamwishEmbedUrl(rawUrl) : rawUrl;

      entriesByLang[mappedLang].push({
        servername,
        url: normalizedUrl,
        isSw,
      });
    }

    for (const k of ["LAT", "ESP", "SUB"] as const) {
      entriesByLang[k].sort(
        (a, b) =>
          this.getServerPriorityWeight(a.servername, a.url) -
          this.getServerPriorityWeight(b.servername, b.url)
      );
    }

    const latPool =
      entriesByLang.LAT.length > 0 ? entriesByLang.LAT : entriesByLang.ESP;
    const subPool = entriesByLang.SUB;

    if (latPool.length === 0 && subPool.length === 0) {
      return null;
    }

    return {
      streamwishLat: latPool.filter((e) => e.isSw).map((e) => e.url),
      streamwishSub: subPool.filter((e) => e.isSw).map((e) => e.url),
      fallbackLat: latPool.filter((e) => !e.isSw).map((e) => e.url),
      fallbackSub: subPool.filter((e) => !e.isSw).map((e) => e.url),
    };
  }

  /**
   * Desempaqueta los enlaces de Embed69 separando estrictamente los mirrors
   * verificados de Streamwish (incluidos todos sus dominios espejo) de cualquier alternativa sucia.
   */
  public async extractDirectStreamwishFromEmbed69(
    slugOrImdbId: string
  ): Promise<SeparatedLanguageSources> {
    const empty: SeparatedLanguageSources = {
      streamwishLat: [],
      streamwishSub: [],
      fallbackLat: [],
      fallbackSub: [],
    };

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
            signal: AbortSignal.timeout(2500),
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
        return empty;
      }

      const domExtracted = this.parseDomOptionsFromEmbed69(html);
      if (domExtracted) {
        return domExtracted;
      }

      const challengeMatch = html.match(/POW_CHALLENGE\s*=\s*'([^']+)'/);
      const difficultyMatch = html.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
      const saltMatch = html.match(/POW_SALT\s*=\s*'([^']+)'/);

      if (!challengeMatch || !difficultyMatch || !saltMatch) {
        return empty;
      }

      const aesKey = this.solveEmbed69AesKey(
        challengeMatch[1],
        Number(difficultyMatch[1]),
        saltMatch[1]
      );
      if (!aesKey) {
        return empty;
      }

      const dataLinkMatch = html.match(
        /let\s+dataLink\s*=\s*(\[\{[\s\S]*?\}\])\s*;\s*let\s+currentLanguageServers/
      );
      if (!dataLinkMatch) {
        return empty;
      }

      const dataLink = JSON.parse(dataLinkMatch[1]) as Embed69LanguageBlock[];
      if (!Array.isArray(dataLink) || dataLink.length === 0) {
        return empty;
      }

      const swLatList: string[] = [];
      const swEspList: string[] = [];
      const swSubList: string[] = [];
      const dirtyLatList: string[] = [];
      const dirtyEspList: string[] = [];
      const dirtySubList: string[] = [];

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
            this.getServerPriorityWeight(a.servername, a.link) -
            this.getServerPriorityWeight(b.servername, b.link)
        );

        for (const candidate of orderedEmbeds) {
          if (!candidate.link) continue;
          const decrypted = this.decryptEmbed69Link(candidate.link, aesKey);
          if (!decrypted || !decrypted.startsWith("http")) continue;
          if (/1fichier\.com/i.test(decrypted)) continue;

          const isSw = isStreamwish({
            serverName: candidate.servername,
            url: decrypted,
          });
          const normalized = isSw
            ? normalizeStreamwishEmbedUrl(decrypted)
            : decrypted;

          if (lang === "LAT" || lang === "LATINO") {
            (isSw ? swLatList : dirtyLatList).push(normalized);
          } else if (lang === "ESP" || lang === "CASTELLANO") {
            (isSw ? swEspList : dirtyEspList).push(normalized);
          } else if (lang === "SUB" || lang === "VOSE") {
            (isSw ? swSubList : dirtySubList).push(normalized);
          }
        }
      }

      return {
        streamwishLat: swLatList.length > 0 ? swLatList : swEspList,
        streamwishSub: swSubList,
        fallbackLat: dirtyLatList.length > 0 ? dirtyLatList : dirtyEspList,
        fallbackSub: dirtySubList,
      };
    } catch {
      return empty;
    }
  }

  /**
   * Desempaqueta PlayLatinSrc separando estrictamente sus fuentes de Streamwish
   * de cualquier otro servidor alternativo.
   */
  public async extractPlayLatinFallbackSources(
    imdbId: string,
    isTv: boolean = false,
    seasonNumber: number = 1,
    episodeNumber: number = 1
  ): Promise<SeparatedLanguageSources> {
    const empty: SeparatedLanguageSources = {
      streamwishLat: [],
      streamwishSub: [],
      fallbackLat: [],
      fallbackSub: [],
    };

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

      if (!pageRes.ok) return empty;

      const html = await pageRes.text();
      const tokenMatch = html.match(/data-resolve-token="([^"]+)"/);
      if (!tokenMatch) return empty;

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

      if (!resolveRes.ok) return empty;

      const payload = (await resolveRes.json()) as PlayLatinResolveResponse;
      const sources = Array.isArray(payload.sources) ? payload.sources : [];

      const sortSources = (list: PlayLatinSourceEntry[]) => {
        return [...list].sort(
          (a, b) =>
            this.getServerPriorityWeight(a.server || a.name, a.url) -
            this.getServerPriorityWeight(b.server || b.name, b.url)
        );
      };

      const collectByVersion = (
        targetVersions: string[],
        includeUntaggedInTv: boolean
      ) => {
        const matching = sortSources(
          sources.filter((s) => {
            if (!s.url || !s.url.startsWith("http")) return false;
            const ver = (s.version || "").toLowerCase();
            if (targetVersions.includes(ver)) return true;
            if (includeUntaggedInTv && isTv && !ver) return true;
            return false;
          })
        );

        const swUrls: string[] = [];
        const dirtyUrls: string[] = [];

        for (const entry of matching) {
          if (!entry.url) continue;
          const isSw = isStreamwish({
            server: entry.server,
            name: entry.name,
            url: entry.url,
          });
          const url = isSw
            ? normalizeStreamwishEmbedUrl(entry.url)
            : entry.url;
          if (isSw) {
            if (!swUrls.includes(url)) swUrls.push(url);
          } else {
            if (!dirtyUrls.includes(url)) dirtyUrls.push(url);
          }
        }

        return { swUrls, dirtyUrls };
      };

      const latSources = collectByVersion(["latino", "castellano"], true);
      const subSources = collectByVersion(["subtitulado", "sub"], false);

      return {
        streamwishLat: latSources.swUrls,
        streamwishSub: subSources.swUrls,
        fallbackLat: latSources.dirtyUrls,
        fallbackSub: subSources.dirtyUrls,
      };
    } catch {
      return empty;
    }
  }

  private detectServerNameFromUrl(url: string, suffix: "Lat" | "Sub"): string {
    if (isStreamwish({ url })) {
      return `Streamwish-${suffix}`;
    }
    const lower = url.toLowerCase();
    const host = extractHostname(url);
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
    if (lower.includes("dood")) {
      return `Doodstream-${suffix}`;
    }
    if (lower.includes("embed69.org")) {
      return `Embed69-Fallback-${suffix}`;
    }
    if (host.includes("vidsrc")) {
      return `VidSrc-${suffix}`;
    }
    return `Dropload-${suffix}`;
  }

  private buildPrioritizedMirrorList(
    embed69Sources: SeparatedLanguageSources,
    playLatinSources: SeparatedLanguageSources,
    multiEmbedFallbackLatUrl: string | null,
    multiEmbedFallbackSubUrl: string | null,
    emergencyBackupUrl: string
  ): CreateMirrorInput[] {
    const rawCandidates: TaggedMirrorCandidate[] = [];
    const seenUrls = new Set<string>();

    const pushMirror = (
      rawUrl: string,
      serverName: string,
      language: "Latino" | "Inglés (Sub)",
      priority: number
    ) => {
      const trimmed = rawUrl.trim();
      if (!trimmed || seenUrls.has(trimmed)) return;
      seenUrls.add(trimmed);

      const clean = isStreamwish({ serverName, url: trimmed });
      rawCandidates.push({
        serverName,
        language,
        rawUrl: trimmed,
        url: trimmed,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority,
        isStreamwish: clean,
        isDirty: !clean,
      });
    };

    // 1. PRIORIDAD ABSOLUTA: Todos los mirrors reales de Streamwish (Latino -> Sub)
    const allSwLat = Array.from(
      new Set([
        ...embed69Sources.streamwishLat,
        ...playLatinSources.streamwishLat,
      ])
    );
    allSwLat.forEach((url, index) => {
      pushMirror(
        url,
        index === 0 ? "Streamwish-Lat" : `Streamwish-Lat-${index + 1}`,
        "Latino",
        index + 1
      );
    });

    const allSwSub = Array.from(
      new Set([
        ...embed69Sources.streamwishSub,
        ...playLatinSources.streamwishSub,
      ])
    );
    allSwSub.forEach((url, index) => {
      pushMirror(
        url,
        index === 0 ? "Streamwish-Sub" : `Streamwish-Sub-${index + 1}`,
        "Inglés (Sub)",
        20 + index
      );
    });

    // 2. CONTINGENCIA (solo se devuelve si STRICT_STREAMWISH_ONLY=false o FALLBACK_IF_EMPTY=true)
    const rawDirtyLat = Array.from(
      new Set([...embed69Sources.fallbackLat, ...playLatinSources.fallbackLat])
    ).sort(
      (a, b) =>
        this.getServerPriorityWeight(undefined, a) -
        this.getServerPriorityWeight(undefined, b)
    );
    const rawDirtySub = Array.from(
      new Set([...embed69Sources.fallbackSub, ...playLatinSources.fallbackSub])
    ).sort(
      (a, b) =>
        this.getServerPriorityWeight(undefined, a) -
        this.getServerPriorityWeight(undefined, b)
    );

    const hasExtractableAnywhere =
      allSwLat.length > 0 ||
      allSwSub.length > 0 ||
      rawDirtyLat.some((u) => isExtractableCleanHost({ url: u })) ||
      rawDirtySub.some((u) => isExtractableCleanHost({ url: u }));

    const allDirtyLat = hasExtractableAnywhere
      ? rawDirtyLat.filter((u) => isExtractableCleanHost({ url: u }))
      : rawDirtyLat;
    const allDirtySub = hasExtractableAnywhere
      ? rawDirtySub.filter((u) => isExtractableCleanHost({ url: u }))
      : rawDirtySub;

    allDirtyLat.forEach((url, index) => {
      pushMirror(
        url,
        this.detectServerNameFromUrl(url, "Lat"),
        "Latino",
        50 + index
      );
    });

    if (
      !hasExtractableAnywhere &&
      allSwLat.length === 0 &&
      allDirtyLat.length === 0 &&
      multiEmbedFallbackLatUrl
    ) {
      pushMirror(
        multiEmbedFallbackLatUrl,
        "Embed69-Fallback-Lat",
        "Latino",
        70
      );
    }

    allDirtySub.forEach((url, index) => {
      pushMirror(
        url,
        this.detectServerNameFromUrl(url, "Sub"),
        "Inglés (Sub)",
        80 + index
      );
    });

    if (
      !hasExtractableAnywhere &&
      allSwSub.length === 0 &&
      allDirtySub.length === 0 &&
      multiEmbedFallbackSubUrl
    ) {
      pushMirror(
        multiEmbedFallbackSubUrl,
        "Embed69-Fallback-Sub",
        "Inglés (Sub)",
        90
      );
    }

    if (!hasExtractableAnywhere) {
      pushMirror(emergencyBackupUrl, "Backup-En", "Inglés (Sub)", 99);
    }

    const filtered = filterAndPrioritizeMirrors(rawCandidates, {
      strictOnly: STRICT_STREAMWISH_ONLY,
      fallbackIfEmpty: FALLBACK_IF_EMPTY,
    });

    return filtered.map(({ item, isStreamwish: sw, isDirty }, idx) => ({
      serverName: item.serverName,
      language: item.language,
      rawUrl: item.rawUrl,
      format: item.format,
      quality: item.quality,
      priority: idx + 1,
      isStreamwish: sw,
      isDirty,
    }));
  }

  public async resolveDefaultMirrorsForTmdb(
    tmdbId: number
  ): Promise<CreateMirrorInput[]> {
    const imdbId = await this.fetchImdbId(tmdbId);

    let embed69Sources: SeparatedLanguageSources = {
      streamwishLat: [],
      streamwishSub: [],
      fallbackLat: [],
      fallbackSub: [],
    };
    let playLatinSources: SeparatedLanguageSources = {
      streamwishLat: [],
      streamwishSub: [],
      fallbackLat: [],
      fallbackSub: [],
    };

    if (imdbId) {
      [embed69Sources, playLatinSources] = await Promise.all([
        this.extractDirectStreamwishFromEmbed69(imdbId),
        this.extractPlayLatinFallbackSources(imdbId, false),
      ]);
    }

    return this.buildPrioritizedMirrorList(
      embed69Sources,
      playLatinSources,
      imdbId ? `https://embed69.org/f/${imdbId}?lang=LAT&prefer=streamwish` : null,
      imdbId ? `https://embed69.org/f/${imdbId}?lang=SUB&prefer=streamwish` : null,
      `https://vidsrc.me/embed/movie?tmdb=${tmdbId}&ds_lang=es`
    );
  }

  public async resolveDefaultMirrorsForTvEpisode(
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number,
    imdbIdHint?: string | null
  ): Promise<CreateMirrorInput[]> {
    const imdbId = imdbIdHint || (await this.fetchTvImdbId(tmdbId));
    let embed69EpisodeSlug: string | null = null;

    let embed69Sources: SeparatedLanguageSources = {
      streamwishLat: [],
      streamwishSub: [],
      fallbackLat: [],
      fallbackSub: [],
    };
    let playLatinSources: SeparatedLanguageSources = {
      streamwishLat: [],
      streamwishSub: [],
      fallbackLat: [],
      fallbackSub: [],
    };

    if (imdbId) {
      const paddedEp = String(episodeNumber).padStart(2, "0");
      embed69EpisodeSlug = `${imdbId}-${seasonNumber}x${paddedEp}`;

      [embed69Sources, playLatinSources] = await Promise.all([
        this.extractDirectStreamwishFromEmbed69(embed69EpisodeSlug),
        this.extractPlayLatinFallbackSources(
          imdbId,
          true,
          seasonNumber,
          episodeNumber
        ),
      ]);
    }

    return this.buildPrioritizedMirrorList(
      embed69Sources,
      playLatinSources,
      embed69EpisodeSlug
        ? `https://embed69.org/f/${embed69EpisodeSlug}?lang=LAT&prefer=streamwish`
        : null,
      embed69EpisodeSlug
        ? `https://embed69.org/f/${embed69EpisodeSlug}?lang=SUB&prefer=streamwish`
        : null,
      `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${seasonNumber}&episode=${episodeNumber}&ds_lang=es`
    );
  }
}
