import crypto from "crypto";
import dns from "dns";
import { NextRequest, NextResponse } from "next/server";
import { tokenCryptoService } from "@/infrastructure/container";
import { prisma } from "@/infrastructure/database/prismaClient";
import {
  FALLBACK_IF_EMPTY,
  STRICT_STREAMWISH_ONLY,
  StreamwishExtractionTarget,
  buildStreamwishExtractionTargets,
  filterAndPrioritizeMirrors,
  isExtractableCleanHost,
  isMultiEmbedAggregatorUrl,
  isStreamwish,
  isStreamwishUrl,
  normalizeStreamwishEmbedUrl,
} from "@/domain/utils/streamwishMatcher";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Silencioso en entornos donde no aplique
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

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

interface CandidateEmbedDescriptor {
  url: string;
  serverName: string;
  priority: number;
  isStreamwish: boolean;
  isDirty: boolean;
}

/**
 * Desempaqueta todos los bloques ofuscados con Dean Edwards Packer (`eval(function(p,a,c,k,e,d)...)`)
 * en TypeScript puro sin utilizar `eval`.
 */
function unpackDeanEdwardsBlocks(html: string): string {
  const packerGlobalRegex =
    /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)(?:,\s*\d+,\s*\{\})?\)\)/g;

  const unpackedChunks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = packerGlobalRegex.exec(html)) !== null) {
    try {
      const payload = match[1].replace(/\\'/g, "'");
      const radix = Number(match[2]);
      const count = Number(match[3]);
      const symtab = match[4].split("|");

      if (!radix || !count || symtab.length === 0) continue;

      const encodeBase = (num: number, base: number): string => {
        const chars =
          "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (base <= 36) {
          return num.toString(base);
        }
        let result = "";
        let n = num;
        do {
          result = chars[n % base] + result;
          n = Math.floor(n / base);
        } while (n > 0);
        return result;
      };

      const lookup = new Map<string, string>();
      for (let i = 0; i < count; i++) {
        if (symtab[i]) {
          lookup.set(encodeBase(i, radix), symtab[i]);
        }
      }

      const unpacked = payload.replace(/\b[0-9a-zA-Z]+\b/g, (word) => {
        return lookup.get(word) ?? word;
      });
      unpackedChunks.push(unpacked);
    } catch {
      // Continuar con el siguiente bloque si alguno está malformado
    }
  }

  return unpackedChunks.join("\n");
}

function solveEmbed69AesKey(
  challenge: string,
  difficulty: number,
  salt: string
): Buffer | null {
  try {
    const safeDifficulty = Math.min(Math.max(1, difficulty), 5);
    const prefix = "0".repeat(safeDifficulty);
    for (let nonce = 0; nonce < 500_000; nonce++) {
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

function decryptEmbed69Link(
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

function getServerPriorityWeight(
  servername?: string,
  rawUrl?: string
): number {
  if (isStreamwish({ serverName: servername, url: rawUrl })) return 1;
  const normalized = `${servername || ""} ${rawUrl || ""}`.toLowerCase();
  if (normalized.includes("mixdrop") || normalized.includes("mxdrop")) return 2;
  if (normalized.includes("vidhide") || normalized.includes("morencius")) return 3;
  if (normalized.includes("filemoon")) return 4;
  if (normalized.includes("voe")) return 5;
  if (normalized.includes("dropload") || normalized.includes("dr0pstream")) return 6;
  if (normalized.includes("doodstream") || normalized.includes("dood")) return 7;
  if (normalized.includes("rapidvideo")) return 8;
  return 9;
}

function parseDomEmbedsFromEmbed69Html(
  html: string,
  requestedLang: string
): { servername: string; url: string; weight: number }[] {
  if (!html.includes("data-url=")) return [];

  const langByCode = new Map<string, string>([
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

  const parsedItems: { lang: string; servername: string; url: string }[] = [];
  const optionLiRegex = /<li([^>]*data-url="[^"]+"[^>]*)>([\s\S]*?)<\/li>/gi;
  let optMatch: RegExpExecArray | null;
  while ((optMatch = optionLiRegex.exec(html)) !== null) {
    const attrs = optMatch[1];
    const inner = optMatch[2];
    if (/data-download\s*=\s*["']1["']/i.test(attrs)) continue;

    const urlMatch = attrs.match(/data-url="([^"]+)"/i);
    if (!urlMatch?.[1]) continue;

    const rawUrl = urlMatch[1].trim();
    if (!rawUrl.startsWith("http") || /1fichier\.com/i.test(rawUrl)) continue;

    const langCode = attrs.match(/data-lang="([^"]*)"/i)?.[1]?.trim() ?? "0";
    const lang = langByCode.get(langCode) || "LAT";
    const servername =
      inner.match(/<span>([^<]+)<\/span>/i)?.[1]?.trim() ||
      inner.match(/alt="([^"]+)"/i)?.[1]?.trim() ||
      rawUrl;

    parsedItems.push({
      lang,
      servername,
      url: isStreamwish({ serverName: servername, url: rawUrl })
        ? normalizeStreamwishEmbedUrl(rawUrl)
        : rawUrl,
    });
  }

  const getLangRank = (langRaw: string) => {
    const l = langRaw.toUpperCase();
    if (requestedLang === "SUB") {
      if (l === "SUB" || l === "VOSE") return 1;
      if (l === "LAT" || l === "LATINO") return 2;
      return 3;
    }
    if (l === "LAT" || l === "LATINO") return 1;
    if (l === "ESP" || l === "CASTELLANO") return 2;
    return 3;
  };

  parsedItems.sort((a, b) => {
    const langDiff = getLangRank(a.lang) - getLangRank(b.lang);
    if (langDiff !== 0) return langDiff;
    return (
      getServerPriorityWeight(a.servername, a.url) -
      getServerPriorityWeight(b.servername, b.url)
    );
  });

  return parsedItems.map((i, idx) => ({
    servername: i.servername,
    url: i.url,
    weight: getServerPriorityWeight(i.servername, i.url) * 100 + idx,
  }));
}

/**
 * Desempaqueta agregadores multi-embed (Embed69 y PlayLatinSrc) aplicando
 * STRICT_STREAMWISH_ONLY / FALLBACK_IF_EMPTY de forma determinista.
 */
async function resolveEmbed69OrPlayLatinToDirectEmbeds(
  rawUrl: string
): Promise<CandidateEmbedDescriptor[]> {
  const collected: { serverName: string; url: string; priority: number }[] = [];
  const seenUrls = new Set<string>();

  const addUnique = (url?: string | null, serverName?: string, priority?: number) => {
    if (!url) return;
    const isSw = isStreamwish({ serverName, url });
    const trimmed = isSw ? normalizeStreamwishEmbedUrl(url) : url.trim();
    if (!trimmed.startsWith("http") || seenUrls.has(trimmed)) return;
    seenUrls.add(trimmed);
    collected.push({
      serverName: serverName || trimmed,
      url: trimmed,
      priority: priority ?? collected.length + 1,
    });
  };

  try {
    const parsedUrl = new URL(rawUrl);
    const requestedLang = (
      parsedUrl.searchParams.get("lang") || "LAT"
    ).toUpperCase();
    const baseCleanUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;

    const resolveFromEmbed69 = async (): Promise<
      { serverName: string; url: string; priority: number }[]
    > => {
      const list: { serverName: string; url: string; priority: number }[] = [];
      if (!rawUrl.includes("embed69.org/f/")) return list;
      try {
        const candidateUrls = [baseCleanUrl];
        const epMatch = baseCleanUrl.match(
          /^(https?:\/\/[^/]+\/f\/tt\d+-\d+x)(\d+)$/i
        );
        if (epMatch) {
          const prefix = epMatch[1];
          const epDigits = epMatch[2];
          const unpadded = String(Number(epDigits));
          const padded = unpadded.padStart(2, "0");
          const altUrl =
            epDigits === padded ? `${prefix}${unpadded}` : `${prefix}${padded}`;
          if (altUrl !== baseCleanUrl) candidateUrls.push(altUrl);
        }

        const fetchCandidate = async (url: string): Promise<string | null> => {
          try {
            const res = await fetch(url, {
              headers: {
                "User-Agent": BROWSER_USER_AGENT,
                Accept:
                  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              },
              signal: AbortSignal.timeout(4500),
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

        const htmlList = await Promise.all(
          candidateUrls.map((u) => fetchCandidate(u))
        );
        const html = htmlList.find((h): h is string => Boolean(h));

        if (html) {
          const domItems = parseDomEmbedsFromEmbed69Html(html, requestedLang);
          for (const item of domItems) {
            list.push({
              serverName: item.servername,
              url: item.url,
              priority: item.weight,
            });
          }

          const cm = html.match(/POW_CHALLENGE\s*=\s*'([^']+)'/);
          const dm = html.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
          const sm = html.match(/POW_SALT\s*=\s*'([^']+)'/);
          const dlm = html.match(
            /let\s+dataLink\s*=\s*(\[\{[\s\S]*?\}\])\s*;\s*let\s+currentLanguageServers/
          );

          if (cm && dm && sm && dlm) {
            const aesKey = solveEmbed69AesKey(cm[1], Number(dm[1]), sm[1]);
            if (aesKey) {
              const dataLink = JSON.parse(dlm[1]) as Embed69LanguageBlock[];
              if (Array.isArray(dataLink) && dataLink.length > 0) {
                dataLink.sort((a, b) => {
                  const getRank = (langRaw?: string) => {
                    const l = (langRaw || "").toUpperCase();
                    if (requestedLang === "SUB") {
                      if (l === "SUB" || l === "VOSE") return 1;
                      if (l === "LAT" || l === "LATINO") return 2;
                      return 3;
                    }
                    if (l === "LAT" || l === "LATINO") return 1;
                    if (l === "ESP" || l === "CASTELLANO") return 2;
                    return 3;
                  };
                  return getRank(a.video_language) - getRank(b.video_language);
                });

                for (const block of dataLink) {
                  if (!Array.isArray(block.sortedEmbeds)) continue;
                  const ordered = [...block.sortedEmbeds].sort(
                    (a, b) =>
                      getServerPriorityWeight(a.servername, a.link) -
                      getServerPriorityWeight(b.servername, b.link)
                  );
                  ordered.forEach((entry, idx) => {
                    if (!entry.link) return;
                    const dec = decryptEmbed69Link(entry.link, aesKey);
                    if (dec) {
                      const clean = isStreamwish({
                        serverName: entry.servername,
                        url: dec,
                      });
                      list.push({
                        serverName: entry.servername || dec,
                        url: clean ? normalizeStreamwishEmbedUrl(dec) : dec,
                        priority:
                          getServerPriorityWeight(entry.servername, dec) * 100 +
                          idx,
                      });
                    }
                  });
                }
              }
            }
          }
        }
      } catch {
        // Silencioso
      }
      return list;
    };

    const resolveFromPlayLatin = async (): Promise<
      { serverName: string; url: string; priority: number }[]
    > => {
      const list: { serverName: string; url: string; priority: number }[] = [];
      try {
        const tvMatch = rawUrl.match(/(tt\d+)-(\d+)x(\d+)/i);
        const movieMatch = rawUrl.match(/(tt\d+)/i);
        if (!tvMatch && !movieMatch) return list;

        const isTv = Boolean(tvMatch);
        const imdbId = tvMatch ? tvMatch[1] : movieMatch![1];
        const seasonStr = tvMatch ? String(Number(tvMatch[2])) : "1";
        const episodeStr = tvMatch ? String(Number(tvMatch[3])) : "1";

        const pageUrl = isTv
          ? `https://playlatinsrc.co/custom/serial/${imdbId}/${seasonStr}/${episodeStr}`
          : `https://playlatinsrc.co/custom/movie/${imdbId}`;
        const pageRes = await fetch(pageUrl, {
          headers: { "User-Agent": BROWSER_USER_AGENT },
          signal: AbortSignal.timeout(4500),
        });
        if (!pageRes.ok) return list;

        const pageHtml = await pageRes.text();
        const tokenMatch = pageHtml.match(/data-resolve-token="([^"]+)"/);
        if (!tokenMatch) return list;

        const resolveRes = await fetch("https://playlatinsrc.co/api/resolve", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Referer: pageUrl,
            "User-Agent": BROWSER_USER_AGENT,
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
        if (!resolveRes.ok) return list;

        const data = (await resolveRes.json()) as PlayLatinResolveResponse;
        const sources = Array.isArray(data.sources) ? data.sources : [];
        const validSources = sources.filter((s) =>
          Boolean(s.url && s.url.startsWith("http"))
        );

        const targetVersion =
          requestedLang === "SUB" || requestedLang === "VOSE"
            ? "subtitulado"
            : "latino";

        const langFiltered = validSources.filter((s) => {
          const ver = (s.version || "").toLowerCase();
          if (targetVersion === "subtitulado") {
            return ver === "subtitulado" || ver === "sub";
          }
          return ver === "latino" || ver === "castellano" || (isTv && !ver);
        });

        const orderedSources = [
          ...(langFiltered.length > 0 ? langFiltered : validSources),
        ].sort(
          (a, b) =>
            getServerPriorityWeight(a.server || a.name, a.url) -
            getServerPriorityWeight(b.server || b.name, b.url)
        );

        orderedSources.forEach((s, idx) => {
          if (s.url) {
            list.push({
              serverName: s.server || s.name || s.url,
              url: s.url,
              priority:
                getServerPriorityWeight(s.server || s.name, s.url) * 100 +
                50 +
                idx,
            });
          }
        });
      } catch {
        // Silencioso
      }
      return list;
    };

    const [embed69List, playLatinList] = await Promise.all([
      resolveFromEmbed69(),
      resolveFromPlayLatin(),
    ]);

    for (const item of embed69List) {
      addUnique(item.url, item.serverName, item.priority);
    }
    for (const item of playLatinList) {
      addUnique(item.url, item.serverName, item.priority);
    }
  } catch {
    // Continuar con los candidatos ya recolectados
  }

  const prioritized = filterAndPrioritizeMirrors(collected, {
    strictOnly: STRICT_STREAMWISH_ONLY,
    fallbackIfEmpty: FALLBACK_IF_EMPTY,
  });

  return prioritized.map(({ item, isStreamwish: sw, isDirty }) => ({
    url: item.url,
    serverName: item.serverName,
    priority: item.priority,
    isStreamwish: sw,
    isDirty,
  }));
}

interface ExtractedStreamCandidate {
  streamUrl: string;
  type: "hls" | "mp4";
  durationSeconds?: number;
  posterUrl?: string;
}

/**
 * Extrae todas las URLs de stream candidatas (.m3u8 o .mp4) analizando el HTML original
 * y los bloques desempaquetados.
 */
function extractCandidatesFromText(
  combinedText: string,
  baseOrigin: string
): ExtractedStreamCandidate[] {
  const durationMatch = combinedText.match(/duration\s*:\s*["']?([0-9.]+)["']?/i);
  const durationSeconds = durationMatch
    ? Math.floor(Number(durationMatch[1]) || 0)
    : undefined;
  const posterMatch = combinedText.match(/image\s*:\s*["']([^"']+)["']/i);
  const rawPoster = posterMatch?.[1]?.replace(/\\\//g, "/").trim();
  const posterUrl = rawPoster
    ? rawPoster.startsWith("//")
      ? `https:${rawPoster}`
      : rawPoster
    : undefined;

  const resolveCandidateUrl = (rawCandidate: string): string | null => {
    const cleaned = rawCandidate.replace(/\\\//g, "/").trim();
    if (!cleaned) return null;
    if (cleaned.startsWith("//")) {
      return `https:${cleaned}`;
    }
    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
      return cleaned;
    }
    if (cleaned.startsWith("/")) {
      try {
        return new URL(cleaned, baseOrigin).toString();
      } catch {
        return null;
      }
    }
    return null;
  };

  const candidates: ExtractedStreamCandidate[] = [];
  const seenUrls = new Set<string>();

  const pushCandidate = (rawUrl: string, forcedType?: "hls" | "mp4") => {
    const resolved = resolveCandidateUrl(rawUrl);
    if (!resolved || seenUrls.has(resolved)) return;
    if (/preroll|vast|adserver|banner|promo/i.test(resolved)) return;
    seenUrls.add(resolved);

    const isMp4 =
      forcedType === "mp4" ||
      (/\.mp4(\?|$)/i.test(resolved) && !/\.m3u8/i.test(resolved));

    candidates.push({
      streamUrl: resolved,
      type: isMp4 ? "mp4" : "hls",
      durationSeconds,
      posterUrl,
    });
  };

  const jsonKeyRegexes: { regex: RegExp; forcedType?: "hls" | "mp4" }[] = [
    { regex: /"hls4"\s*:\s*"([^"]+)"/i, forcedType: "hls" },
    { regex: /"hls2"\s*:\s*"([^"]+)"/i, forcedType: "hls" },
    { regex: /"hls3"\s*:\s*"([^"]+)"/i, forcedType: "hls" },
    {
      regex: /(?:MDCore\.)?wurl\s*=\s*["']((?:https?:)?\/\/[^"']+\.mp4[^"']*)["']/i,
      forcedType: "mp4",
    },
    { regex: /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i, forcedType: "hls" },
    {
      regex: /sources\s*:\s*\[\s*\{[^}]*?file\s*:\s*["']([^"']+)["']/i,
    },
    {
      regex: /file\s*:\s*["']((?:https?:)?\/\/[^"']+\.mp4[^"']*)["']/i,
      forcedType: "mp4",
    },
  ];

  for (const item of jsonKeyRegexes) {
    const match = combinedText.match(item.regex);
    if (match && match[1]) {
      pushCandidate(match[1], item.forcedType);
    }
  }

  const m3u8Regex = /((?:https?:)?\/\/[^\s"'<>\\]+?\.m3u8[^\s"'<>\\]*)/gi;
  const m3u8Matches = combinedText.match(m3u8Regex);
  if (m3u8Matches) {
    for (const m of m3u8Matches) {
      pushCandidate(m, "hls");
    }
  }

  const mp4Regex = /((?:https?:)?\/\/[^\s"'<>\\]+?\.mp4[^\s"'<>\\]*)/gi;
  const mp4Matches = combinedText.match(mp4Regex);
  if (mp4Matches) {
    for (const m of mp4Matches) {
      pushCandidate(m, "mp4");
    }
  }

  return candidates;
}

async function verifyStreamCandidateAlive(
  candidate: ExtractedStreamCandidate,
  referer: string
): Promise<boolean> {
  if (candidate.type === "mp4") {
    return true;
  }
  try {
    const res = await fetch(candidate.streamUrl, {
      method: "GET",
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Referer: referer,
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(2800),
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes("#EXTM3U");
  } catch {
    return false;
  }
}

interface ProbeHitResult extends ExtractedStreamCandidate {
  referer: string;
  sourceEmbedUrl: string;
  isStreamwish: boolean;
  isDirty: boolean;
}

/**
 * PASO 2: Endpoint Extractor (/api/extractor?url=<EMBED_URL>)
 * Prioriza de forma estricta y determinista todos los dominios espejo de Streamwish
 * antes de evaluar cualquier servidor alternativo en modo contingencia.
 */
export async function GET(request: NextRequest) {
  const inputUrl = request.nextUrl.searchParams.get("url")?.trim() || "";

  if (!inputUrl) {
    return NextResponse.json(
      {
        success: false,
        fallbackUrl: "",
        isStreamwish: false,
        isDirty: false,
        reason: "Parámetro 'url' requerido.",
      },
      { status: 200 }
    );
  }

  let targetEmbedUrl = inputUrl;
  let fallbackIframeUrl = inputUrl;
  let decryptedMirrorId: string | null = null;
  let decryptedMovieId: string | null = null;
  let originalRawUrl: string | null = null;
  let tokenServerName: string | undefined;

  try {
    if (
      inputUrl.startsWith("/api/stream/") ||
      inputUrl.includes("/api/stream/")
    ) {
      const afterPrefix = inputUrl.split("/api/stream/")[1] || "";
      const tokenPart = afterPrefix.split("?")[0].split("#")[0];
      if (tokenPart) {
        const decodedToken = decodeURIComponent(tokenPart);
        const payload = tokenCryptoService.decryptStreamToken(decodedToken);
        targetEmbedUrl = payload.rawUrl;
        originalRawUrl = payload.rawUrl;
        decryptedMirrorId = payload.mirrorId;
        decryptedMovieId = payload.movieId;
        tokenServerName = payload.serverName;
        fallbackIframeUrl = inputUrl;
      }
    }

    const parsedInitial = new URL(targetEmbedUrl);
    const initialOrigin = parsedInitial.origin;
    const initialIsSw = isStreamwish({
      serverName: tokenServerName,
      url: targetEmbedUrl,
    });

    if (
      STRICT_STREAMWISH_ONLY &&
      !FALLBACK_IF_EMPTY &&
      !initialIsSw &&
      !isMultiEmbedAggregatorUrl(targetEmbedUrl) &&
      !/\.m3u8(\?|$)|\.mp4(\?|$)/i.test(parsedInitial.pathname)
    ) {
      return NextResponse.json(
        {
          success: false,
          fallbackUrl: "",
          isStreamwish: false,
          isDirty: true,
          reason:
            "Bloqueado por STRICT_STREAMWISH_ONLY: el servidor de origen no pertenece a Streamwish.",
        },
        { status: 200 }
      );
    }

    // 1. Si ya es un enlace directo .m3u8 o .mp4, devolverlo directamente como exitoso
    if (/\.m3u8(\?|$)/i.test(parsedInitial.pathname)) {
      return NextResponse.json({
        success: true,
        streamUrl: targetEmbedUrl,
        type: "hls",
        referer: initialOrigin,
        isStreamwish: initialIsSw,
        isDirty: !initialIsSw,
      });
    }

    if (/\.mp4(\?|$)/i.test(parsedInitial.pathname)) {
      return NextResponse.json({
        success: true,
        streamUrl: targetEmbedUrl,
        type: "mp4",
        referer: initialOrigin,
        isStreamwish: initialIsSw,
        isDirty: !initialIsSw,
      });
    }

    const rawCandidates: {
      url: string;
      serverName: string;
      priority: number;
    }[] = [
      {
        url: isStreamwishUrl(targetEmbedUrl)
          ? normalizeStreamwishEmbedUrl(targetEmbedUrl)
          : targetEmbedUrl,
        serverName: tokenServerName || targetEmbedUrl,
        priority: isStreamwishUrl(targetEmbedUrl) ? 1 : 50,
      },
    ];

    let embed69LookupUrl: string | null = targetEmbedUrl.includes("embed69.org/f/")
      ? targetEmbedUrl
      : null;

    if (!embed69LookupUrl && decryptedMovieId && !targetEmbedUrl.includes("vidsrc.me")) {
      try {
        const siblings = decryptedMirrorId?.startsWith("ep-")
          ? await prisma.episodeMirror.findMany({
              where: {
                episodeId: decryptedMirrorId.slice(3).replace(/-\d+$/, ""),
              },
              orderBy: { priority: "asc" },
            })
          : await prisma.mirrorLink.findMany({
              where: { movieId: decryptedMovieId },
              orderBy: { priority: "asc" },
            });

        for (const sib of siblings) {
          if (!sib.rawUrl || sib.rawUrl === targetEmbedUrl) continue;
          if (sib.rawUrl.includes("embed69.org/f/")) {
            if (!embed69LookupUrl && !isStreamwishUrl(targetEmbedUrl)) {
              embed69LookupUrl = sib.rawUrl;
            }
          } else if (!sib.rawUrl.includes("vidsrc.me")) {
            rawCandidates.push({
              url: isStreamwishUrl(sib.rawUrl)
                ? normalizeStreamwishEmbedUrl(sib.rawUrl)
                : sib.rawUrl,
              serverName: sib.serverName,
              priority: sib.priority,
            });
          }
        }
      } catch {
        // Silencioso
      }
    }

    let prioritizedDescriptors: CandidateEmbedDescriptor[] = [];

    if (embed69LookupUrl) {
      prioritizedDescriptors =
        await resolveEmbed69OrPlayLatinToDirectEmbeds(embed69LookupUrl);
      if (prioritizedDescriptors.length > 0 && !inputUrl.includes("/api/stream/")) {
        fallbackIframeUrl = prioritizedDescriptors[0].url;
      }
    }

    if (prioritizedDescriptors.length === 0) {
      const nonAggregatorCandidates = rawCandidates.filter(
        (c) => !isMultiEmbedAggregatorUrl(c.url)
      );
      const filtered = filterAndPrioritizeMirrors(nonAggregatorCandidates, {
        strictOnly: STRICT_STREAMWISH_ONLY,
        fallbackIfEmpty: FALLBACK_IF_EMPTY,
      });

      prioritizedDescriptors = filtered.map(
        ({ item, isStreamwish: sw, isDirty }) => ({
          url: item.url,
          serverName: item.serverName,
          priority: item.priority,
          isStreamwish: sw,
          isDirty,
        })
      );
    }

    if (prioritizedDescriptors.length === 0) {
      return NextResponse.json(
        {
          success: false,
          fallbackUrl: STRICT_STREAMWISH_ONLY ? "" : fallbackIframeUrl,
          isStreamwish: false,
          isDirty: true,
          reason:
            "No se encontraron servidores Streamwish disponibles bajo el modo estricto.",
        },
        { status: 200 }
      );
    }

    const probeTarget = async (
      target: StreamwishExtractionTarget,
      meta: { isStreamwish: boolean; isDirty: boolean }
    ): Promise<ProbeHitResult | null> => {
      try {
        const res = await fetch(target.fetchUrl, {
          method: "GET",
          headers: {
            "User-Agent": BROWSER_USER_AGENT,
            Referer: target.referer,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(6000),
        });

        if (!res.ok) return null;

        const html = await res.text();
        const unpacked = unpackDeanEdwardsBlocks(html);
        const combinedText = `${html}\n${unpacked}`;
        const fetchOrigin = new URL(target.fetchUrl).origin;
        const streamReferer = `${fetchOrigin}/`;

        const extractedCandidates = extractCandidatesFromText(
          combinedText,
          fetchOrigin
        );
        if (extractedCandidates.length === 0) return null;

        const aliveChecks = await Promise.all(
          extractedCandidates.map(async (candidate) => {
            const alive = await verifyStreamCandidateAlive(
              candidate,
              streamReferer
            );
            return alive ? candidate : null;
          })
        );
        const firstAliveCandidate = aliveChecks.find((c) => Boolean(c));
        if (firstAliveCandidate) {
          return {
            ...firstAliveCandidate,
            referer: streamReferer,
            sourceEmbedUrl: target.sourceEmbedUrl,
            isStreamwish: meta.isStreamwish,
            isDirty: meta.isDirty,
          };
        }

        return null;
      } catch {
        return null;
      }
    };

    const runPhaseForDescriptors = async (
      descriptors: CandidateEmbedDescriptor[]
    ): Promise<ProbeHitResult | null> => {
      if (descriptors.length === 0) return null;

      const targetsWithMeta: {
        target: StreamwishExtractionTarget;
        isStreamwish: boolean;
        isDirty: boolean;
      }[] = [];
      const seenFetchUrls = new Set<string>();

      for (const desc of descriptors) {
        const targets = desc.isStreamwish
          ? buildStreamwishExtractionTargets(desc.url)
          : [
              {
                fetchUrl: desc.url,
                referer: `${new URL(desc.url).origin}/`,
                sourceEmbedUrl: desc.url,
              },
            ];

        for (const t of targets) {
          if (!seenFetchUrls.has(t.fetchUrl)) {
            seenFetchUrls.add(t.fetchUrl);
            targetsWithMeta.push({
              target: t,
              isStreamwish: desc.isStreamwish,
              isDirty: desc.isDirty,
            });
          }
        }
      }

      const results = await Promise.all(
        targetsWithMeta.map((entry) =>
          probeTarget(entry.target, {
            isStreamwish: entry.isStreamwish,
            isDirty: entry.isDirty,
          })
        )
      );

      return results.find((r): r is ProbeHitResult => Boolean(r)) || null;
    };

    // FASE 1 DETERMINISTA: Evaluar TODOS los targets de Streamwish en paralelo primero.
    const streamwishDescriptors = prioritizedDescriptors.filter(
      (d) => d.isStreamwish
    );
    let hit = await runPhaseForDescriptors(streamwishDescriptors);

    // FASE 2 CONTINGENCIA: Solo si Streamwish falló por completo y está habilitado el fallback.
    // Se prueban primero los hosts extraíbles sin anuncios (Vidhide, Dropload, Mixdrop, Filemoon).
    if (!hit && (!STRICT_STREAMWISH_ONLY || FALLBACK_IF_EMPTY)) {
      const dirtyDescriptors = prioritizedDescriptors.filter(
        (d) => !d.isStreamwish
      );
      const extractableDirty = dirtyDescriptors.filter((d) =>
        isExtractableCleanHost({ serverName: d.serverName, url: d.url })
      );
      if (extractableDirty.length > 0) {
        hit = await runPhaseForDescriptors(extractableDirty);
      }
      if (!hit) {
        const remainingDirty = dirtyDescriptors.filter(
          (d) => !isExtractableCleanHost({ serverName: d.serverName, url: d.url })
        );
        hit = await runPhaseForDescriptors(remainingDirty);
      }
    }

    if (hit) {
      // Auto-reparación en BD únicamente cuando el mirror resuelto es un Streamwish verificado.
      if (
        decryptedMirrorId &&
        originalRawUrl &&
        hit.sourceEmbedUrl &&
        hit.sourceEmbedUrl !== originalRawUrl &&
        hit.isStreamwish &&
        isStreamwishUrl(hit.sourceEmbedUrl) &&
        (isMultiEmbedAggregatorUrl(originalRawUrl) ||
          /dr0pstream\.com|doodstream/i.test(originalRawUrl))
      ) {
        void (async () => {
          try {
            if (decryptedMirrorId.startsWith("ep-")) {
              const epId = decryptedMirrorId.slice(3).replace(/-\d+$/, "");
              await prisma.episodeMirror.updateMany({
                where: { episodeId: epId, rawUrl: originalRawUrl },
                data: {
                  rawUrl: hit.sourceEmbedUrl,
                  serverName: "Streamwish-Lat",
                },
              });
            } else {
              await prisma.mirrorLink.updateMany({
                where: { id: decryptedMirrorId },
                data: {
                  rawUrl: hit.sourceEmbedUrl,
                  serverName: "Streamwish-Lat",
                },
              });
            }
          } catch {
            // Silencioso en background
          }
        })();
      }

      return NextResponse.json({
        success: true,
        streamUrl: hit.streamUrl,
        type: hit.type,
        referer: hit.referer,
        durationSeconds: hit.durationSeconds,
        posterUrl: hit.posterUrl,
        isStreamwish: hit.isStreamwish,
        isDirty: hit.isDirty,
      });
    }

    const firstDescriptor = prioritizedDescriptors[0];
    return NextResponse.json(
      {
        success: false,
        fallbackUrl: fallbackIframeUrl,
        isStreamwish: firstDescriptor?.isStreamwish ?? initialIsSw,
        isDirty: firstDescriptor?.isDirty ?? !initialIsSw,
        reason:
          "No se encontró un manifiesto .m3u8 o archivo .mp4 directo o el servidor bloqueó la IP.",
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        fallbackUrl: fallbackIframeUrl,
        isStreamwish: false,
        isDirty: true,
        reason:
          error instanceof Error
            ? error.message
            : "Error al intentar extraer el stream.",
      },
      { status: 200 }
    );
  }
}
