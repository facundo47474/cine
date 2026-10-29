import crypto from "crypto";
import { IMirrorResolver } from "@/domain/interfaces/IMirrorResolver";
import { CreateMirrorInput } from "@/domain/interfaces/IMovieRepository";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";

interface TmdbMovieExternalDetails {
  imdb_id?: string | null;
}

interface Embed69ServerItem {
  servername?: string;
  link?: string;
  type?: string;
}

interface Embed69LanguageBlock {
  file_id?: number;
  video_language?: string;
  sortedEmbeds?: Embed69ServerItem[];
}

/**
 * Desencripta un enlace AES-256-CBC de Embed69 usando la clave derivada del PoW.
 */
function decryptEmbed69Link(encryptedBase64: string, aesKey: Buffer): string | null {
  try {
    const raw = Buffer.from(encryptedBase64, "base64");
    if (raw.length <= 16) return null;
    const iv = raw.subarray(0, 16);
    const ciphertext = raw.subarray(16);
    const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey.subarray(0, 32), iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8").replace(/`/g, "").trim();
  } catch {
    return null;
  }
}

/**
 * Extrae directamente el enlace del reproductor Streamwish (Opción 1) desde Embed69
 * resolviendo el PoW criptográfico en el servidor para evitar iframes anidados
 * que rompen la pantalla completa en móviles Android e iOS y eliminando el resto de opciones.
 */
export async function resolveStreamwishFromEmbed69(
  imdbIdOrUrl: string
): Promise<string | null> {
  const imdbMatch = imdbIdOrUrl.match(/(tt\d+)/i);
  const imdbId = imdbMatch ? imdbMatch[1] : imdbIdOrUrl.trim();
  if (!imdbId.startsWith("tt")) return null;

  const embed69Url = `https://embed69.org/f/${imdbId}`;

  try {
    const res = await fetch(embed69Url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    const challenge = html.match(/POW_CHALLENGE\s*=\s*'([^']+)'/)?.[1];
    const difficulty = Number(
      html.match(/POW_DIFFICULTY\s*=\s*(\d+)/)?.[1] || "3"
    );
    const salt = html.match(/POW_SALT\s*=\s*'([^']+)'/)?.[1];
    const dataLinkRaw = html.match(/let\s+dataLink\s*=\s*(\[[\s\S]*?\]);/)?.[1];

    if (!challenge || !salt || !dataLinkRaw) return null;

    const dataLink = JSON.parse(dataLinkRaw) as Embed69LanguageBlock[];
    if (!Array.isArray(dataLink) || dataLink.length === 0) return null;

    const prefix = "0".repeat(Math.min(5, Math.max(1, difficulty)));
    let nonce = 0;
    const maxIterations = 800000;

    while (nonce < maxIterations) {
      const hash = crypto
        .createHash("sha256")
        .update(challenge + nonce)
        .digest("hex");
      if (hash.startsWith(prefix)) break;
      nonce++;
    }

    if (nonce >= maxIterations) return null;

    const aesKey = crypto
      .createHash("sha256")
      .update(challenge + nonce + salt)
      .digest();

    // Priorizar idioma LAT (Español Latino), luego ESP, luego cualquiera disponible
    const latBlock =
      dataLink.find(
        (b) => (b.video_language || "").toUpperCase() === "LAT"
      ) ||
      dataLink.find(
        (b) => (b.video_language || "").toUpperCase() === "ESP"
      ) ||
      dataLink[0];

    const embeds = latBlock?.sortedEmbeds || [];

    // Seleccionar exclusivamente Streamwish como Opción 1 preferida (o el primer embed disponible si no está nombrado)
    const streamwishEmbed =
      embeds.find(
        (e) => (e.servername || "").toLowerCase() === "streamwish"
      ) || embeds[0];

    if (!streamwishEmbed?.link) return null;

    const directUrl = decryptEmbed69Link(streamwishEmbed.link, aesKey);
    if (directUrl && /^https?:\/\//i.test(directUrl)) {
      return directUrl;
    }

    return null;
  } catch {
    return null;
  }
}

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

  public async resolveDefaultMirrorsForTmdb(
    tmdbId: number
  ): Promise<CreateMirrorInput[]> {
    const imdbId = await this.fetchImdbId(tmdbId);

    if (imdbId) {
      const directStreamwishUrl = await resolveStreamwishFromEmbed69(imdbId);

      return [
        {
          serverName: "Streamwish",
          language: "Latino",
          rawUrl: directStreamwishUrl || `https://embed69.org/f/${imdbId}`,
          format: MirrorFormat.EMBED,
          quality: "1080p",
          priority: 1,
        },
      ];
    }

    return [
      {
        serverName: "Streamwish",
        language: "Subtitulado",
        rawUrl: `https://vidsrc.cc/v2/embed/movie/${tmdbId}?autoPlay=false`,
        format: MirrorFormat.EMBED,
        quality: "1080p",
        priority: 1,
      },
    ];
  }
}
