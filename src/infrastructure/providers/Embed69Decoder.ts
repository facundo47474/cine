import crypto from "crypto";
import {
  FALLBACK_IF_EMPTY,
  STRICT_STREAMWISH_ONLY,
  filterAndPrioritizeMirrors,
  isStreamwish,
  normalizeStreamwishEmbedUrl,
} from "@/domain/utils/streamwishMatcher";

/**
 * Decodificador y Cliente HTTP unificado para el agregador `embed69.org`.
 *
 * Centraliza en un único módulo:
 * 1. El cálculo de pesos de prioridad de servidores (`calculateServerPriorityWeight`).
 * 2. La resolución del reto criptográfico Proof-of-Work (SHA-256) y derivación de clave AES-256-CBC.
 * 3. La desencriptación de enlaces cifrados en `dataLink` y la extracción desde el DOM (`SelectLangDisp`).
 * 4. La clasificación por idioma (`LAT`, `ESP`, `SUB`) separando mirrors limpios de Streamwish de respaldos.
 */

export const DEFAULT_SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export interface Embed69ServerEntry {
  servername?: string;
  link?: string;
  type?: string;
}

export interface Embed69LanguageBlock {
  file_id?: number;
  video_language?: string;
  sortedEmbeds?: Embed69ServerEntry[];
}

export interface SeparatedLanguageSources {
  streamwishLat: string[];
  streamwishSub: string[];
  fallbackLat: string[];
  fallbackSub: string[];
}

export interface Embed69RankedEmbedItem {
  serverName: string;
  url: string;
  language: string;
  priority: number;
  isStreamwish: boolean;
}

export interface Embed69SingleResolutionResult {
  url: string | null;
  status: "RESOLVED" | "NOT_FOUND" | "BLOCKED_OR_ERROR";
  cleanEmbedUrl: string;
  isStreamwish: boolean;
}

/**
 * Calcula el peso de prioridad de un servidor de video (menor número = mayor prioridad).
 * Streamwish siempre recibe prioridad #1 para garantizar reproducción nativa sin anuncios.
 *
 * @param serverName Nombre identificador del servidor (ej. "streamwish", "vidhide").
 * @param rawUrl URL cruda del embed o video.
 * @returns Peso numérico entre 1 (máxima prioridad) y 9 (menor prioridad).
 */
export function calculateServerPriorityWeight(
  serverName?: string,
  rawUrl?: string
): number {
  if (isStreamwish({ serverName, url: rawUrl })) {
    return 1;
  }

  const normalizedLabel = `${serverName || ""} ${rawUrl || ""}`.toLowerCase();
  if (
    normalizedLabel.includes("vidhide") ||
    normalizedLabel.includes("morencius")
  ) {
    return 2;
  }
  if (
    normalizedLabel.includes("dropload") ||
    normalizedLabel.includes("dr0pstream")
  ) {
    return 3;
  }
  if (
    normalizedLabel.includes("mixdrop") ||
    normalizedLabel.includes("mxdrop")
  ) {
    return 4;
  }
  if (normalizedLabel.includes("filemoon")) {
    return 5;
  }
  if (normalizedLabel.includes("voe")) {
    return 6;
  }
  if (
    normalizedLabel.includes("doodstream") ||
    normalizedLabel.includes("dood")
  ) {
    return 7;
  }
  if (normalizedLabel.includes("rapidvideo")) {
    return 8;
  }
  return 9;
}

/**
 * Calcula la jerarquía de un código de idioma según el idioma solicitado por el reproductor.
 *
 * @param rawLanguage Código de idioma crudo del proveedor (`LAT`, `ESP`, `SUB`, `VOSE`).
 * @param preferredLanguage Idioma solicitado (`LAT` o `SUB`).
 * @returns Rango numérico (1 = coincidencia principal, 2 = alternativa aceptable, 3 = última opción).
 */
export function calculateLanguagePreferenceRank(
  rawLanguage?: string,
  preferredLanguage: string = "LAT"
): number {
  const normalizedLang = (rawLanguage || "").toUpperCase();
  const normalizedPreference = preferredLanguage.toUpperCase();

  if (normalizedPreference === "SUB" || normalizedPreference === "VOSE") {
    if (normalizedLang === "SUB" || normalizedLang === "VOSE") return 1;
    if (normalizedLang === "LAT" || normalizedLang === "LATINO") return 2;
    return 3;
  }

  if (normalizedLang === "LAT" || normalizedLang === "LATINO") return 1;
  if (normalizedLang === "ESP" || normalizedLang === "CASTELLANO") return 2;
  return 3;
}

/**
 * Resuelve el reto criptográfico Proof-of-Work (SHA-256) exigido por `embed69.org`
 * para derivar la clave simétrica AES-256 de 32 bytes.
 *
 * @param challenge Cadena desafío (`POW_CHALLENGE`).
 * @param difficulty Cantidad de ceros hexadecimales iniciales requeridos (`POW_DIFFICULTY`).
 * @param salt Sal criptográfica para derivar la clave (`POW_SALT`).
 * @returns Buffer de 32 bytes con la clave AES o `null` si no converge en el límite seguro.
 */
export function solveEmbed69ProofOfWorkAesKey(
  challenge: string,
  difficulty: number,
  salt: string
): Buffer | null {
  try {
    const clampedDifficulty = Math.min(Math.max(1, difficulty), 5);
    const requiredZeroPrefix = "0".repeat(clampedDifficulty);
    const maxAllowedIterations = 500_000;

    for (let nonce = 0; nonce < maxAllowedIterations; nonce++) {
      const candidateHashHex = crypto
        .createHash("sha256")
        .update(challenge + String(nonce))
        .digest("hex");

      if (candidateHashHex.startsWith(requiredZeroPrefix)) {
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

/**
 * Desencripta un enlace individual de `embed69.org` cifrado en Base64 con AES-256-CBC
 * (donde los primeros 16 bytes corresponden al vector de inicialización IV).
 *
 * @param encryptedBase64 Enlace cifrado en Base64 o URL HTTP plana.
 * @param aesKey Clave AES de 32 bytes obtenida mediante `solveEmbed69ProofOfWorkAesKey`.
 * @returns URL desencriptada limpia o `null` si el bloque es inválido.
 */
export function decryptEmbed69CipherLink(
  encryptedBase64: string,
  aesKey: Buffer
): string | null {
  try {
    if (
      encryptedBase64.startsWith("http://") ||
      encryptedBase64.startsWith("https://")
    ) {
      return encryptedBase64.trim();
    }

    const rawBytes = Buffer.from(encryptedBase64, "base64");
    if (rawBytes.length <= 16) {
      return null;
    }

    const initializationVector = rawBytes.subarray(0, 16);
    const ciphertextBytes = rawBytes.subarray(16);
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      aesKey.subarray(0, 32),
      initializationVector
    );

    const decryptedText = Buffer.concat([
      decipher.update(ciphertextBytes),
      decipher.final(),
    ]).toString("utf8");

    return decryptedText.replace(/`/g, "").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Genera las variantes de slug para episodios de series en `embed69.org`
 * (ej. `tt0903747-1x01` y `tt0903747-1x1`) para cubrir inconsistencias de nomenclatura.
 *
 * @param slugOrUrl Slug de IMDb o URL completa de `embed69.org/f/...`.
 * @returns Lista de slugs o URLs candidatas a consultar en paralelo.
 */
export function buildEmbed69EpisodeCandidateTargets(slugOrUrl: string): string[] {
  const candidates = [slugOrUrl];
  const episodePatternMatch = slugOrUrl.match(/^(.*tt\d+-\d+x)(\d+)$/i);

  if (episodePatternMatch) {
    const prefix = episodePatternMatch[1];
    const episodeDigits = episodePatternMatch[2];
    const unpaddedEpisode = String(Number(episodeDigits));
    const zeroPaddedEpisode = unpaddedEpisode.padStart(2, "0");

    const alternativeTarget =
      episodeDigits === zeroPaddedEpisode
        ? `${prefix}${unpaddedEpisode}`
        : `${prefix}${zeroPaddedEpisode}`;

    if (alternativeTarget !== slugOrUrl) {
      candidates.push(alternativeTarget);
    }
  }

  return candidates;
}

/**
 * Extrae las opciones de servidores e idiomas desde el marcado DOM HTML de `embed69.org`
 * (`<ul class="SelectLangDisp">` y `<li data-url="..." data-lang="...">`).
 *
 * @param html Documento HTML devuelto por `embed69.org`.
 * @returns Arreglo de servidores detectados con su idioma normalizado (`LAT`, `ESP`, `SUB`).
 */
export function extractDomServerEntriesFromEmbed69Html(
  html: string
): { language: "LAT" | "ESP" | "SUB"; serverName: string; url: string; isStreamwish: boolean }[] {
  if (!html.includes("data-url=")) {
    return [];
  }

  const languageByCode = new Map<string, "LAT" | "ESP" | "SUB">([
    ["0", "LAT"],
    ["1", "ESP"],
    ["2", "SUB"],
  ]);

  const languageSelectorMatch = html.match(
    /<ul[^>]*class="[^"]*SelectLangDisp[^"]*"[^>]*>([\s\S]*?)<\/ul>/i
  );

  if (languageSelectorMatch?.[1]) {
    const langOptionRegex = /<li[^>]*data-lang="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;
    let langMatch: RegExpExecArray | null;
    while ((langMatch = langOptionRegex.exec(languageSelectorMatch[1])) !== null) {
      const langCode = langMatch[1].trim();
      const innerHtml = langMatch[2];
      if (/LAT\.png|latino/i.test(innerHtml)) {
        languageByCode.set(langCode, "LAT");
      } else if (/ESP\.png|espa|castellano/i.test(innerHtml)) {
        languageByCode.set(langCode, "ESP");
      } else if (/SUB\.png|subtitulado|vose/i.test(innerHtml)) {
        languageByCode.set(langCode, "SUB");
      }
    }
  }

  const extractedEntries: {
    language: "LAT" | "ESP" | "SUB";
    serverName: string;
    url: string;
    isStreamwish: boolean;
  }[] = [];

  const serverOptionRegex = /<li([^>]*data-url="[^"]+"[^>]*)>([\s\S]*?)<\/li>/gi;
  let optionMatch: RegExpExecArray | null;

  while ((optionMatch = serverOptionRegex.exec(html)) !== null) {
    const attributesText = optionMatch[1];
    const innerHtml = optionMatch[2];

    if (/data-download\s*=\s*["']1["']/i.test(attributesText)) {
      continue;
    }

    const urlAttributeMatch = attributesText.match(/data-url="([^"]+)"/i);
    if (!urlAttributeMatch?.[1]) {
      continue;
    }

    const rawUrl = urlAttributeMatch[1].trim();
    if (!rawUrl.startsWith("http") || /1fichier\.com/i.test(rawUrl)) {
      continue;
    }

    const langCode =
      attributesText.match(/data-lang="([^"]*)"/i)?.[1]?.trim() ?? "0";
    const mappedLanguage = languageByCode.get(langCode) || "LAT";

    const serverName =
      innerHtml.match(/<span>([^<]+)<\/span>/i)?.[1]?.trim() ||
      innerHtml.match(/alt="([^"]+)"/i)?.[1]?.trim() ||
      rawUrl;

    const belongsToStreamwish = isStreamwish({ serverName, url: rawUrl });
    const normalizedUrl = belongsToStreamwish
      ? normalizeStreamwishEmbedUrl(rawUrl)
      : rawUrl;

    extractedEntries.push({
      language: mappedLanguage,
      serverName,
      url: normalizedUrl,
      isStreamwish: belongsToStreamwish,
    });
  }

  return extractedEntries;
}

/**
 * Extrae las opciones de servidores e idiomas desde la variable JavaScript `dataLink`
 * en el HTML de `embed69.org`, resolviendo automáticamente el reto PoW + AES-256-CBC.
 *
 * @param html Documento HTML devuelto por `embed69.org`.
 * @returns Arreglo de servidores desencriptados con su idioma normalizado.
 */
export function extractEncryptedDataLinkEntriesFromEmbed69Html(
  html: string
): { language: "LAT" | "ESP" | "SUB"; serverName: string; url: string; isStreamwish: boolean }[] {
  const challengeMatch = html.match(/POW_CHALLENGE\s*=\s*'([^']+)'/);
  const difficultyMatch = html.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
  const saltMatch = html.match(/POW_SALT\s*=\s*'([^']+)'/);
  const dataLinkMatch = html.match(
    /let\s+dataLink\s*=\s*(\[\{[\s\S]*?\}\])\s*;\s*let\s+currentLanguageServers/
  );

  if (!challengeMatch || !difficultyMatch || !saltMatch || !dataLinkMatch) {
    return [];
  }

  const aesKey = solveEmbed69ProofOfWorkAesKey(
    challengeMatch[1],
    Number(difficultyMatch[1]),
    saltMatch[1]
  );

  if (!aesKey) {
    return [];
  }

  let languageBlocks: Embed69LanguageBlock[];
  try {
    languageBlocks = JSON.parse(dataLinkMatch[1]) as Embed69LanguageBlock[];
  } catch {
    return [];
  }

  if (!Array.isArray(languageBlocks) || languageBlocks.length === 0) {
    return [];
  }

  const extractedEntries: {
    language: "LAT" | "ESP" | "SUB";
    serverName: string;
    url: string;
    isStreamwish: boolean;
  }[] = [];

  for (const block of languageBlocks) {
    if (!Array.isArray(block.sortedEmbeds) || block.sortedEmbeds.length === 0) {
      continue;
    }

    const rawLang = (block.video_language || "").toUpperCase();
    const mappedLanguage: "LAT" | "ESP" | "SUB" =
      rawLang === "SUB" || rawLang === "VOSE"
        ? "SUB"
        : rawLang === "ESP" || rawLang === "CASTELLANO"
        ? "ESP"
        : "LAT";

    const sortedCandidates = [...block.sortedEmbeds].sort(
      (a, b) =>
        calculateServerPriorityWeight(a.servername, a.link) -
        calculateServerPriorityWeight(b.servername, b.link)
    );

    for (const candidate of sortedCandidates) {
      if (!candidate.link) continue;
      const decryptedUrl = decryptEmbed69CipherLink(candidate.link, aesKey);
      if (
        !decryptedUrl ||
        !decryptedUrl.startsWith("http") ||
        /1fichier\.com/i.test(decryptedUrl)
      ) {
        continue;
      }

      const belongsToStreamwish = isStreamwish({
        serverName: candidate.servername,
        url: decryptedUrl,
      });
      const normalizedUrl = belongsToStreamwish
        ? normalizeStreamwishEmbedUrl(decryptedUrl)
        : decryptedUrl;

      extractedEntries.push({
        language: mappedLanguage,
        serverName: candidate.servername || normalizedUrl,
        url: normalizedUrl,
        isStreamwish: belongsToStreamwish,
      });
    }
  }

  return extractedEntries;
}

/**
 * Descarga el HTML válido de `embed69.org` probando las variantes de slug (con y sin cero a la izquierda).
 *
 * @param baseEmbed69Url URL base de `embed69.org/f/{slug}` (sin query params).
 * @param timeoutMs Tiempo máximo de espera por petición en milisegundos.
 * @returns Estado de la descarga, URL final que respondió y contenido HTML.
 */
export async function fetchEmbed69PageHtml(
  baseEmbed69Url: string,
  timeoutMs: number = 3000
): Promise<{
  html: string | null;
  resolvedUrl: string;
  status: "OK" | "NOT_FOUND" | "BLOCKED_OR_ERROR";
}> {
  const candidateUrls = buildEmbed69EpisodeCandidateTargets(baseEmbed69Url);

  const probeSingleUrl = async (url: string) => {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 404) {
        return {
          html: null,
          resolvedUrl: url,
          notFound: true,
          blockedOrError: false,
        };
      }

      if (!response.ok) {
        return {
          html: null,
          resolvedUrl: url,
          notFound: false,
          blockedOrError: true,
        };
      }

      const htmlText = await response.text();
      if (
        htmlText.includes("No folders found") ||
        (!htmlText.includes("dataLink") && !htmlText.includes("data-url="))
      ) {
        return {
          html: null,
          resolvedUrl: url,
          notFound: true,
          blockedOrError: false,
        };
      }

      return {
        html: htmlText,
        resolvedUrl: url,
        notFound: false,
        blockedOrError: false,
      };
    } catch {
      return {
        html: null,
        resolvedUrl: url,
        notFound: false,
        blockedOrError: true,
      };
    }
  };

  const results = await Promise.all(candidateUrls.map((u) => probeSingleUrl(u)));
  const validMatch = results.find((r) => Boolean(r.html));

  if (validMatch && validMatch.html) {
    return {
      html: validMatch.html,
      resolvedUrl: validMatch.resolvedUrl,
      status: "OK",
    };
  }

  const anyBlocked = results.some((r) => r.blockedOrError);
  return {
    html: null,
    resolvedUrl: baseEmbed69Url,
    status: anyBlocked ? "BLOCKED_OR_ERROR" : "NOT_FOUND",
  };
}

/**
 * Extrae y clasifica por idioma todas las fuentes de `embed69.org` para un `imdbId` o slug de episodio,
 * separando estrictamente los mirrors de Streamwish de los servidores de respaldo.
 *
 * @param slugOrImdbId ID de IMDb (`tt1234567`) o slug de episodio (`tt1234567-1x01`).
 * @returns Estructura con listas separadas `streamwishLat`, `streamwishSub`, `fallbackLat`, `fallbackSub`.
 */
export async function extractCategorizedSourcesFromEmbed69(
  slugOrImdbId: string
): Promise<SeparatedLanguageSources> {
  const emptyResult: SeparatedLanguageSources = {
    streamwishLat: [],
    streamwishSub: [],
    fallbackLat: [],
    fallbackSub: [],
  };

  const baseUrl = slugOrImdbId.startsWith("http")
    ? slugOrImdbId.split("?")[0]
    : `https://embed69.org/f/${slugOrImdbId}`;

  const pageResult = await fetchEmbed69PageHtml(baseUrl, 2800);
  if (!pageResult.html) {
    return emptyResult;
  }

  const domEntries = extractDomServerEntriesFromEmbed69Html(pageResult.html);
  const allEntries =
    domEntries.length > 0
      ? domEntries
      : extractEncryptedDataLinkEntriesFromEmbed69Html(pageResult.html);

  if (allEntries.length === 0) {
    return emptyResult;
  }

  const entriesByLanguage: Record<
    "LAT" | "ESP" | "SUB",
    typeof allEntries
  > = {
    LAT: [],
    ESP: [],
    SUB: [],
  };

  for (const entry of allEntries) {
    entriesByLanguage[entry.language].push(entry);
  }

  for (const langKey of ["LAT", "ESP", "SUB"] as const) {
    entriesByLanguage[langKey].sort(
      (a, b) =>
        calculateServerPriorityWeight(a.serverName, a.url) -
        calculateServerPriorityWeight(b.serverName, b.url)
    );
  }

  const latinoPool =
    entriesByLanguage.LAT.length > 0
      ? entriesByLanguage.LAT
      : entriesByLanguage.ESP;
  const subtituladoPool = entriesByLanguage.SUB;

  const uniqueUrls = (items: typeof allEntries, streamwishFlag: boolean) =>
    Array.from(
      new Set(
        items
          .filter((item) => item.isStreamwish === streamwishFlag)
          .map((item) => item.url)
      )
    );

  return {
    streamwishLat: uniqueUrls(latinoPool, true),
    streamwishSub: uniqueUrls(subtituladoPool, true),
    fallbackLat: uniqueUrls(latinoPool, false),
    fallbackSub: uniqueUrls(subtituladoPool, false),
  };
}

/**
 * Extrae una lista ordenada de embeds directos a partir de una URL de `embed69.org`,
 * priorizando el idioma solicitado (`lang=LAT` o `lang=SUB`) y el peso del servidor.
 *
 * @param embed69Url URL completa de `embed69.org/f/...`.
 * @param timeoutMs Timeout HTTP en milisegundos.
 * @returns Lista ordenada de candidatos y estado de resolución.
 */
export async function resolveRankedEmbedsFromEmbed69Url(
  embed69Url: string,
  timeoutMs: number = 3500
): Promise<{
  items: Embed69RankedEmbedItem[];
  status: "RESOLVED" | "NOT_FOUND" | "BLOCKED_OR_ERROR";
  cleanEmbedUrl: string;
}> {
  let cleanEmbedUrl = embed69Url;
  let requestedLanguage = "LAT";

  try {
    const parsedUrl = new URL(embed69Url);
    requestedLanguage = (
      parsedUrl.searchParams.get("lang") || "LAT"
    ).toUpperCase();
    cleanEmbedUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    // Mantener valores por defecto si la URL no tiene query string
  }

  if (!embed69Url.includes("embed69.org/f/")) {
    return { items: [], status: "NOT_FOUND", cleanEmbedUrl };
  }

  const pageResult = await fetchEmbed69PageHtml(cleanEmbedUrl, timeoutMs);
  cleanEmbedUrl = pageResult.resolvedUrl;

  if (!pageResult.html) {
    return {
      items: [],
      status: pageResult.status === "BLOCKED_OR_ERROR" ? "BLOCKED_OR_ERROR" : "NOT_FOUND",
      cleanEmbedUrl,
    };
  }

  const domEntries = extractDomServerEntriesFromEmbed69Html(pageResult.html);
  const encryptedEntries = extractEncryptedDataLinkEntriesFromEmbed69Html(
    pageResult.html
  );
  const combinedEntries = [...domEntries, ...encryptedEntries];

  if (combinedEntries.length === 0) {
    return { items: [], status: "NOT_FOUND", cleanEmbedUrl };
  }

  const seenUrls = new Set<string>();
  const rankedItems: Embed69RankedEmbedItem[] = [];

  combinedEntries.forEach((entry, index) => {
    if (seenUrls.has(entry.url)) return;
    seenUrls.add(entry.url);

    const langRank = calculateLanguagePreferenceRank(
      entry.language,
      requestedLanguage
    );
    const serverWeight = calculateServerPriorityWeight(
      entry.serverName,
      entry.url
    );

    rankedItems.push({
      serverName: entry.serverName,
      url: entry.url,
      language: entry.language,
      priority: langRank * 1000 + serverWeight * 10 + index,
      isStreamwish: entry.isStreamwish,
    });
  });

  rankedItems.sort((a, b) => a.priority - b.priority);

  return {
    items: rankedItems,
    status: "RESOLVED",
    cleanEmbedUrl,
  };
}

/**
 * Resuelve el mejor enlace individual desde `embed69.org` aplicando la política
 * `STRICT_STREAMWISH_ONLY` y `FALLBACK_IF_EMPTY`.
 *
 * @param rawEmbed69Url URL de `embed69.org/f/...`.
 * @returns El enlace ganador desencriptado y su metadato de estado.
 */
export async function resolveBestEmbedFromEmbed69Url(
  rawEmbed69Url: string
): Promise<Embed69SingleResolutionResult> {
  const resolution = await resolveRankedEmbedsFromEmbed69Url(rawEmbed69Url, 2500);

  if (resolution.items.length === 0) {
    return {
      url: null,
      status: resolution.status,
      cleanEmbedUrl: resolution.cleanEmbedUrl,
      isStreamwish: false,
    };
  }

  const prioritized = filterAndPrioritizeMirrors(resolution.items, {
    strictOnly: STRICT_STREAMWISH_ONLY,
    fallbackIfEmpty: FALLBACK_IF_EMPTY,
  });

  if (prioritized.length === 0) {
    return {
      url: null,
      status: "NOT_FOUND",
      cleanEmbedUrl: resolution.cleanEmbedUrl,
      isStreamwish: false,
    };
  }

  return {
    url: prioritized[0].item.url,
    status: "RESOLVED",
    cleanEmbedUrl: resolution.cleanEmbedUrl,
    isStreamwish: prioritized[0].isStreamwish,
  };
}
