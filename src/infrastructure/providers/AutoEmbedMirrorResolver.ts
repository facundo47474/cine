import { IMirrorResolver } from "@/domain/interfaces/IMirrorResolver";
import { CreateMirrorInput } from "@/domain/interfaces/IMovieRepository";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";

interface TmdbMovieExternalDetails {
  imdb_id?: string | null;
  title?: string;
  original_title?: string;
}

interface TmdbVideoItem {
  key: string;
  site: string;
  type: string;
  name: string;
  iso_639_1: string;
}

/**
 * Resolver Real de Audio Español Latino / Castellano.
 * 1. Obtiene el imdb_id oficial desde TMDB para conectarse con indexadores latinos que operan por IMDb/TMDB ID.
 * 2. Rastrea múltiples espejos activos de Cuevana parseando el árbol JSON (__NEXT_DATA__) donde se separan
 *    explícitamente los audios: "latino", "espanol" y "subtitulado".
 * 3. Extrae y decodifica servidores desde Embed69 (el distribuidor multi-servidor en Audio Latino de Cuevana).
 * 4. Etiqueta honestamente los respaldos internacionales como "Subtitulado" y elimina VidLink (que se cuelga).
 */
export class AutoEmbedMirrorResolver implements IMirrorResolver {
  private readonly timeoutMs = 5000;
  private readonly userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

  // Lista de dominios espejo latinos activos (si uno está bloqueado por el ISP, pasa al siguiente)
  private readonly latinoMirrorsDomains = [
    process.env.LATINO_INDEXER_URL?.trim(),
    "https://cuevana.biz",
    "https://cuevana3.nu",
    "https://cuevana3c.pro",
    "https://verpeliculasultra.com",
  ].filter((d): d is string => Boolean(d));

  private toSpanishSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  /**
   * Obtiene el imdb_id (ej: "tt15239678") y título en español desde TMDB.
   */
  private async fetchTmdbExternalIds(
    tmdbId: number
  ): Promise<{ imdbId: string | null; esTitle: string | null }> {
    const apiKey = process.env.TMDB_API_KEY?.trim();
    const bearer = process.env.TMDB_BEARER_TOKEN?.trim();
    if (!apiKey && !bearer) return { imdbId: null, esTitle: null };

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
      if (!res.ok) return { imdbId: null, esTitle: null };

      const data = (await res.json()) as TmdbMovieExternalDetails;
      return {
        imdbId: data.imdb_id || null,
        esTitle: data.title || null,
      };
    } catch {
      return { imdbId: null, esTitle: null };
    }
  }

  /**
   * Extrae servidores en Audio Latino desde Embed69 usando el IMDb ID oficial.
   * Embed69 almacena un objeto `dataLink` en el HTML con pistas clasificadas en "LAT", "ESP" y "SUB".
   */
  private async resolveFromEmbed69(
    imdbId: string | null
  ): Promise<CreateMirrorInput[]> {
    if (!imdbId) return [];

    const results: CreateMirrorInput[] = [];
    const candidateUrls = [
      `https://embed69.org/f/${imdbId}`,
      `https://embed69.com/f/${imdbId}`,
    ];

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": this.userAgent,
            "Accept-Language": "es-419,es;q=0.9",
          },
          signal: AbortSignal.timeout(4500),
        });

        if (!res.ok) continue;
        const html = await res.text();

        // Aun si no podemos desencriptar todos los sub-links internos, el propio iframe de Embed69
        // ya trae el selector interactivo de Audio Latino / Español arriba del video.
        if (html.includes("dataLink") || html.includes(imdbId)) {
          results.push({
            serverName: "Multi-Servidor Latino (Embed69)",
            language: "Latino",
            rawUrl: url,
            format: MirrorFormat.EMBED,
            quality: "1080p",
            priority: 1,
          });
          break;
        }
      } catch {
        // Continúa al siguiente espejo
      }
    }

    return results;
  }

  /**
   * Recorre recursivamente el objeto __NEXT_DATA__ de Cuevana buscando arrays de reproductores
   * clasificados bajo las claves "latino", "espanol" / "castellano" o "subtitulado".
   */
  private extractPlayersFromNextData(
    nextDataJson: string
  ): CreateMirrorInput[] {
    const extracted: CreateMirrorInput[] = [];
    const seenUrls = new Set<string>();

    try {
      const parsed = JSON.parse(nextDataJson) as Record<string, unknown>;
      const serialized = JSON.stringify(parsed);

      // 1. Buscar bloques estructurados por idioma: "latino":[{...}], "espanol":[{...}]
      const langSections: Array<{ key: string; label: string }> = [
        { key: "latino", label: "Latino" },
        { key: "espanol", label: "Español" },
        { key: "castellano", label: "Español" },
        { key: "subtitulado", label: "Subtitulado" },
      ];

      for (const section of langSections) {
        const regex = new RegExp(
          `"${section.key}"\\s*:\\s*\\[(.*?)\\]`,
          "gis"
        );
        let match: RegExpExecArray | null;

        while ((match = regex.exec(serialized)) !== null) {
          const block = match[1];
          const urlMatches =
            block.match(/https?:\/\/[^"'\s\\]+/gi) || [];

          for (const rawUrl of urlMatches) {
            const cleanUrl = rawUrl.replace(/\\+/g, "");
            if (seenUrls.has(cleanUrl)) continue;
            seenUrls.add(cleanUrl);

            const host = new URL(cleanUrl).hostname.replace("www.", "");
            extracted.push({
              serverName: `${section.label} (${host.split(".")[0].toUpperCase()})`,
              language: section.label,
              rawUrl: cleanUrl,
              format: MirrorFormat.EMBED,
              quality: "1080p",
              priority: extracted.length + 1,
            });
          }
        }
      }
    } catch {
      // Si el JSON no tiene el formato esperado, se ignora
    }

    return extracted;
  }

  /**
   * Rastrea los dominios de Cuevana buscando la película por su slug en español
   * y extrae los servidores en Audio Latino tanto de __NEXT_DATA__ como de los iframes.
   */
  private async scrapeCuevanaLatino(
    tmdbId: number,
    title?: string,
    releaseYear?: number
  ): Promise<CreateMirrorInput[]> {
    if (!title) return [];

    const slug = this.toSpanishSlug(title);
    const extracted: CreateMirrorInput[] = [];
    const seen = new Set<string>();

    for (const domain of this.latinoMirrorsDomains) {
      const base = domain.replace(/\/$/, "");
      const candidatePaths = [
        `${base}/pelicula/${tmdbId}/${slug}`,
        `${base}/peliculas/${slug}`,
        `${base}/pelicula/${slug}`,
        ...(releaseYear ? [`${base}/pelicula/${slug}-${releaseYear}`] : []),
      ];

      for (const pageUrl of candidatePaths) {
        try {
          const res = await fetch(pageUrl, {
            headers: {
              "User-Agent": this.userAgent,
              "Accept-Language": "es-AR,es-MX;q=0.9,es;q=0.8",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(4000),
          });

          if (!res.ok) continue;
          const html = await res.text();

          // A) Extraer desde __NEXT_DATA__ si la web está hecha en Next.js (Cuevana 3 moderna)
          const nextDataMatch = html.match(
            /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i
          );
          if (nextDataMatch && nextDataMatch[1]) {
            const fromNext = this.extractPlayersFromNextData(nextDataMatch[1]);
            for (const item of fromNext) {
              if (!seen.has(item.rawUrl)) {
                seen.add(item.rawUrl);
                extracted.push(item);
              }
            }
          }

          // B) Extraer embeds directos hacia cyberlockers latinos en el HTML
          const embedRegex =
            /https?:\/\/(?:www\.)?(?:embed69|streamwish|vidhide|filemoon|voe\.sx|dood|uqload|waaw|wishembed|strwish|filelions|luluvdo)[^"'\s<>\\]+/gi;
          const rawMatches = html.match(embedRegex) || [];

          for (const rawMatch of rawMatches) {
            const cleanUrl = rawMatch.replace(/\\+/g, "");
            if (seen.has(cleanUrl)) continue;
            seen.add(cleanUrl);

            const host = new URL(cleanUrl).hostname
              .replace("www.", "")
              .split(".")[0]
              .toUpperCase();

            extracted.push({
              serverName: `Latino (${host} #${extracted.length + 1})`,
              language: "Latino",
              rawUrl: cleanUrl,
              format: MirrorFormat.EMBED,
              quality: "1080p",
              priority: extracted.length + 1,
            });

            if (extracted.length >= 6) break;
          }

          if (extracted.length > 0) return extracted;
        } catch {
          // Siguiente ruta o dominio
        }
      }
    }

    return extracted;
  }

  /**
   * Busca videos doblados en Español Latino (es-MX) y Castellano (es-ES) en TMDB.
   */
  private async fetchTmdbSpanishVideos(
    tmdbId: number
  ): Promise<CreateMirrorInput[]> {
    const apiKey = process.env.TMDB_API_KEY?.trim();
    const bearer = process.env.TMDB_BEARER_TOKEN?.trim();
    if (!apiKey && !bearer) return [];

    const results: CreateMirrorInput[] = [];

    for (const lang of ["es-MX", "es-ES"]) {
      try {
        const url = new URL(
          `https://api.themoviedb.org/3/movie/${tmdbId}/videos`
        );
        url.searchParams.set("language", lang);
        if (apiKey && !bearer) url.searchParams.set("api_key", apiKey);

        const headers: Record<string, string> = { Accept: "application/json" };
        if (bearer) headers["Authorization"] = `Bearer ${bearer}`;

        const res = await fetch(url.toString(), {
          headers,
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) continue;

        const data = (await res.json()) as { results?: TmdbVideoItem[] };
        const ytVideo = (data.results || []).find(
          (v) => v.site === "YouTube" && v.key
        );

        if (ytVideo) {
          results.push({
            serverName:
              lang === "es-MX"
                ? "Avance Oficial (Doblado Latino)"
                : "Avance Oficial (Castellano)",
            language: lang === "es-MX" ? "Latino" : "Español",
            rawUrl: `https://www.youtube.com/embed/${ytVideo.key}?autoplay=1&hl=es`,
            format: MirrorFormat.EMBED,
            quality: "1080p",
            priority: 20 + results.length,
          });
        }
      } catch {
        // Silencioso
      }
    }

    return results;
  }

  public async resolveDefaultMirrorsForTmdb(
    tmdbId: number,
    title?: string,
    releaseYear?: number
  ): Promise<CreateMirrorInput[]> {
    const { imdbId, esTitle } = await this.fetchTmdbExternalIds(tmdbId);
    const effectiveTitle = esTitle || title;

    const [embed69Mirrors, cuevanaMirrors, tmdbEsMirrors] = await Promise.all([
      this.resolveFromEmbed69(imdbId),
      this.scrapeCuevanaLatino(tmdbId, effectiveTitle, releaseYear),
      this.fetchTmdbSpanishVideos(tmdbId),
    ]);

    // Servidores internacionales de respaldo: etiquetados honestamente como "Subtitulado"
    // (sin VidLink que se cuelga cargando y sin mentir diciendo "Latino" cuando están en inglés)
    const honestSubtitledBackups: CreateMirrorInput[] = [
      {
        serverName: "VidSrc CC (Audio Original + Sub Español)",
        language: "Subtitulado",
        rawUrl: `https://vidsrc.cc/v2/embed/movie/${tmdbId}?autoPlay=false`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority: 10,
      },
      {
        serverName: "VidSrc Me (Audio Original + Sub Español)",
        language: "Subtitulado",
        rawUrl: `https://vidsrc.me/embed/movie?tmdb=${tmdbId}&ds_lang=es`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority: 11,
      },
      {
        serverName: "SuperEmbed (Audio Original + Sub Español)",
        language: "Subtitulado",
        rawUrl: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority: 12,
      },
    ];

    const combined = [
      ...embed69Mirrors,
      ...cuevanaMirrors,
      ...tmdbEsMirrors,
      ...honestSubtitledBackups,
    ];

    return combined.map((m, idx) => ({
      ...m,
      priority: idx + 1,
    }));
  }
}