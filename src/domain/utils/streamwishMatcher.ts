/**
 * Fuente única de verdad para la detección universal de Streamwish y todos sus
 * dominios espejo (aliases), normalización de embeds y política de filtrado estricto.
 */

export const STRICT_STREAMWISH_ONLY: boolean =
  typeof process !== "undefined"
    ? process.env.STRICT_STREAMWISH_ONLY !== "false" &&
      process.env.NEXT_PUBLIC_STRICT_STREAMWISH_ONLY !== "false"
    : true;

/**
 * Contingencia automática activa por defecto: si Streamwish no está disponible
 * para un título específico, permite servidores extraíbles directamente a HLS/MP4
 * sin anuncios (Vidhide, Dropload, Mixdrop, Filemoon) marcados con `isDirty = true`.
 */
export const FALLBACK_IF_EMPTY: boolean =
  typeof process !== "undefined"
    ? process.env.FALLBACK_IF_EMPTY !== "false" &&
      process.env.NEXT_PUBLIC_FALLBACK_IF_EMPTY !== "false"
    : true;

export const STREAMWISH_KNOWN_DOMAINS: readonly string[] = [
  "streamwish.to",
  "streamwish.com",
  "streamwish.gg",
  "streamwish.fun",
  "streamwish.xyz",
  "streamwish.site",
  "streamwish.cc",
  "sfastwish.com",
  "flaswish.com",
  "obeywish.com",
  "cdnwish.com",
  "embedwish.com",
  "wishembed.pro",
  "wishembed.com",
  "hlswish.com",
  "dwish.pro",
  "awish.pro",
  "mwish.pro",
  "ewish.pro",
  "strwish.xyz",
  "strwish.com",
  "swdyu.com",
  "wishonly.site",
  "playerwish.com",
  "wishfast.top",
  "fastwish.io",
  "lionwish.com",
  "wolfwish.com",
  "cyberwish.com",
  "chillwish.com",
  "filewish.com",
  "vidwish.com",
  "swish.to",
  "hglink.to",
  "audinifer.com",
  "vibuxer.com",
  "hanerix.com",
  "cavanhabg.com",
  "dhcplay.com",
  "gradehgplus.com",
  "hglam.com",
  "hgcloud.to",
  "hgplaycdn.com",
  "haxloppd.com",
  "tryzendm.com",
  "dumbalag.com",
  "kravaxxa.com",
  "tayumn.com",
  "streamhg.to",
  "streamhg.com",
  "iplayerhls.com",
];

export const STREAMWISH_HOST_REGEX =
  /(?:^|\.)(?:(?:[a-z0-9-]+)?wish(?:[a-z0-9-]+)?\.(?:com|to|pro|io|net|sbs|cfd|top|gg|xyz|fun|site|cc|club|me|co|org|live|watch|stream|online)|(?:hglink\.to|audinifer\.com|vibuxer\.com|hanerix\.com|swdyu\.com|cavanhabg\.com|dhcplay\.com|gradehgplus\.com|hglam\.com|hgcloud\.to|hgplaycdn\.com|haxloppd\.com|tryzendm\.com|dumbalag\.com|kravaxxa\.com|tayumn\.com|streamhg\.(?:to|com)|iplayerhls\.com))$/i;

export const STREAMWISH_LABEL_REGEX =
  /streamwish|sfastwish|flaswish|obeywish|cdnwish|embedwish|wishembed|hlswish|dwish|awish|mwish|ewish|strwish|swdyu|wishonly|playerwish|wishfast|fastwish|lionwish|wolfwish|cyberwish|chillwish|filewish|vidwish|streamhg|hglink|audinifer|vibuxer|hanerix/i;

export const MULTI_EMBED_AGGREGATOR_HOSTS: readonly string[] = [
  "embed69.org",
  "playlatinsrc.co",
  "vidlink.pro",
  "autoembed.cc",
  "vidsrc.cc",
  "vidsrc.me",
  "multiembed.mov",
];

export interface StreamwishCandidateInput {
  serverName?: string | null;
  label?: string | null;
  name?: string | null;
  server?: string | null;
  url?: string | null;
  rawUrl?: string | null;
  isStreamwish?: boolean;
}

export interface StreamwishMatchPolicyOptions {
  strictOnly?: boolean;
  fallbackIfEmpty?: boolean;
}

export interface PrioritizedMirrorResult<T> {
  item: T;
  isStreamwish: boolean;
  isDirty: boolean;
}

/**
 * Extrae de forma segura el nombre de host en minúsculas desde cualquier cadena URL.
 *
 * @param rawUrl URL completa o parcial.
 * @returns Hostname en minúsculas o cadena vacía si no es una URL válida.
 */
export function extractHostname(rawUrl?: string | null): string {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  try {
    const urlWithProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.startsWith("//")
      ? `https:${trimmed}`
      : `https://${trimmed}`;
    return new URL(urlWithProtocol).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Verifica si una cadena comienza con el protocolo `http://` o `https://`.
 *
 * @param value Cadena a evaluar.
 * @returns `true` si es una URL HTTP/HTTPS.
 */
export function isHttpUrl(value?: string | null): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Determina si una URL apunta a un agregador multi-embed intermedio (`embed69`, `playlatinsrc`, `vidsrc`, etc.)
 * en lugar de un servidor de video final.
 *
 * @param rawUrl URL a verificar.
 * @returns `true` si pertenece a un agregador multi-embed conocido.
 */
export function isMultiEmbedAggregatorUrl(rawUrl?: string | null): boolean {
  const host = extractHostname(rawUrl);
  if (!host) return false;
  return MULTI_EMBED_AGGREGATOR_HOSTS.some(
    (aggregatorHost) =>
      host === aggregatorHost || host.endsWith(`.${aggregatorHost}`)
  );
}

const EXTRACTABLE_FALLBACK_HOST_REGEX =
  /morencius\.com|vidhide|dr0pstream\.com|dropload|mxdrop\.|mixdrop|filemoon/i;

/**
 * Detecta servidores cuyo stream crudo (`.m3u8` / `.mp4`) puede extraerse en el backend
 * y reproducirse nativamente en HTML5 `<video>` con cero anuncios (además de Streamwish).
 *
 * @param target URL o descriptor de candidato de servidor.
 * @returns `true` si el servidor soporta extracción directa limpia.
 */
export function isExtractableCleanHost(
  target?: string | StreamwishCandidateInput | null
): boolean {
  if (!target) return false;
  if (isStreamwish(target)) return true;

  if (typeof target === "string") {
    return EXTRACTABLE_FALLBACK_HOST_REGEX.test(target.toLowerCase());
  }

  const candidateUrl = (target.rawUrl || target.url || "").trim();
  if (candidateUrl && isHttpUrl(candidateUrl)) {
    return EXTRACTABLE_FALLBACK_HOST_REGEX.test(candidateUrl.toLowerCase());
  }

  const combinedLabels = `${target.serverName || ""} ${target.label || ""} ${target.name || ""} ${target.server || ""}`.toLowerCase();
  return EXTRACTABLE_FALLBACK_HOST_REGEX.test(combinedLabels);
}

/**
 * Verifica si un nombre de host pertenece a la red de dominios oficiales o espejos de Streamwish.
 *
 * @param hostname Nombre de host (ej. `hglink.to`, `sfastwish.com`).
 * @returns `true` si es un dominio de Streamwish.
 */
export function isStreamwishHostname(hostname?: string | null): boolean {
  if (!hostname) return false;
  const host = hostname.trim().toLowerCase();
  if (!host) return false;

  if (
    STREAMWISH_KNOWN_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    )
  ) {
    return true;
  }

  return STREAMWISH_HOST_REGEX.test(host);
}

/**
 * Evalúa si una URL completa apunta a un dominio de Streamwish.
 *
 * @param rawUrl URL del servidor o embed.
 * @returns `true` si el host de la URL pertenece a Streamwish.
 */
export function isStreamwishUrl(rawUrl?: string | null): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  const host = extractHostname(trimmed);
  if (!host) return false;

  return isStreamwishHostname(host);
}

/**
 * Evalúa si el nombre o etiqueta de un servidor corresponde a Streamwish.
 *
 * @param label Nombre del servidor (ej. `"Streamwish-Lat"`).
 * @returns `true` si coincide con el patrón de nombres de Streamwish.
 */
export function isStreamwishServerName(label?: string | null): boolean {
  if (!label) return false;
  return STREAMWISH_LABEL_REGEX.test(label.trim());
}

/**
 * Evalúa de forma universal si un servidor o URL pertenece a la familia Streamwish.
 * Cuando existe una URL HTTP externa real, el hostname de la URL es la verdad autoritativa
 * para impedir falsos positivos por etiquetas heredadas.
 *
 * @param target Cadena de texto (URL o nombre) u objeto descriptor del candidato.
 * @returns `true` si es un servidor Streamwish verificado.
 */
export function isStreamwish(
  target: string | StreamwishCandidateInput | null | undefined
): boolean {
  if (!target) return false;

  if (typeof target === "string") {
    const trimmed = target.trim();
    if (!trimmed) return false;
    if (
      isHttpUrl(trimmed) ||
      trimmed.startsWith("//") ||
      trimmed.includes(".")
    ) {
      if (isStreamwishUrl(trimmed)) return true;
      if (isHttpUrl(trimmed)) return false;
    }
    return isStreamwishServerName(trimmed);
  }

  const candidateUrl = (target.rawUrl || target.url || "").trim();
  if (candidateUrl && isHttpUrl(candidateUrl)) {
    return isStreamwishUrl(candidateUrl);
  }

  if (typeof target.isStreamwish === "boolean") {
    return target.isStreamwish;
  }

  const labels = [
    target.serverName,
    target.label,
    target.name,
    target.server,
  ].filter((value): value is string => Boolean(value && value.trim()));

  return labels.some((label) => isStreamwishServerName(label));
}

/**
 * Extrae el código alfanumérico del archivo de video desde una URL embed de Streamwish
 * (`/e/{code}`, `/embed/{code}`, `/f/{code}`, `/d/{code}`).
 *
 * @param rawUrl URL del embed de Streamwish.
 * @returns Código del archivo o `null` si no coincide con el formato.
 */
export function extractStreamwishCode(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const match = rawUrl
    .trim()
    .match(/\/(?:e|embed|f|d)\/([a-zA-Z0-9_-]+)/i);
  return match?.[1] || null;
}

/**
 * Normaliza dominios antiguos o rotativos de Streamwish hacia el host canónico (`hglink.to`)
 * preservando el código del archivo para extracción y reproducción.
 *
 * @param rawUrl URL original de Streamwish.
 * @returns URL de embed normalizada.
 */
export function normalizeStreamwishEmbedUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!isStreamwishUrl(trimmed)) return trimmed;

  const fileCode = extractStreamwishCode(trimmed);
  if (!fileCode) return trimmed;

  const host = extractHostname(trimmed);
  if (
    host === "hglink.to" ||
    host === "audinifer.com" ||
    host === "vibuxer.com" ||
    host === "hanerix.com"
  ) {
    return `https://${host}/e/${fileCode}`;
  }

  return `https://hglink.to/e/${fileCode}`;
}

export interface StreamwishExtractionTarget {
  fetchUrl: string;
  referer: string;
  sourceEmbedUrl: string;
}

/**
 * Genera la lista completa de endpoints espejo de extracción para cualquier variante de Streamwish,
 * probando los nodos directos conocidos (`audinifer.com`, `vibuxer.com`, `hglink.to`) y el origen original.
 *
 * @param embedUrl URL de embed de Streamwish.
 * @returns Lista deduplicada de objetivos de extracción con su cabecera Referer correspondiente.
 */
export function buildStreamwishExtractionTargets(
  embedUrl: string
): StreamwishExtractionTarget[] {
  const targets: StreamwishExtractionTarget[] = [];
  const seenUrls = new Set<string>();

  const registerTarget = (
    fetchUrl: string,
    referer: string,
    sourceEmbedUrl: string
  ) => {
    if (!seenUrls.has(fetchUrl)) {
      seenUrls.add(fetchUrl);
      targets.push({ fetchUrl, referer, sourceEmbedUrl });
    }
  };

  let origin = "https://hglink.to";
  try {
    origin = new URL(embedUrl).origin;
  } catch {
    // Mantener hglink.to como origen por defecto
  }

  if (isStreamwishUrl(embedUrl)) {
    const fileCode = extractStreamwishCode(embedUrl);
    if (fileCode) {
      const canonicalStreamwishEmbed = normalizeStreamwishEmbedUrl(embedUrl);
      registerTarget(
        `https://audinifer.com/e/${fileCode}`,
        "https://hglink.to/",
        canonicalStreamwishEmbed
      );
      registerTarget(
        `https://vibuxer.com/e/${fileCode}`,
        "https://hglink.to/",
        canonicalStreamwishEmbed
      );
      registerTarget(
        `https://hglink.to/e/${fileCode}`,
        "https://hglink.to/",
        canonicalStreamwishEmbed
      );
      if (
        origin !== "https://audinifer.com" &&
        origin !== "https://vibuxer.com" &&
        origin !== "https://hglink.to"
      ) {
        registerTarget(
          `${origin}/e/${fileCode}`,
          `${origin}/`,
          canonicalStreamwishEmbed
        );
      }
    }
  }

  registerTarget(embedUrl, `${origin}/`, embedUrl);
  return targets;
}

/**
 * Aplica de forma determinista el filtrado y priorización estricta para cualquier lista de mirrors:
 * - Streamwish siempre ocupa las primeras posiciones.
 * - Si `strictOnly = true`: devuelve únicamente mirrors de Streamwish.
 * - Si `strictOnly = true`, no hay Streamwish y `fallbackIfEmpty = true`: activa contingencia marcando `isDirty = true`.
 *
 * @param mirrors Lista de candidatos de mirrors a evaluar.
 * @param options Opciones de política de filtrado (`strictOnly`, `fallbackIfEmpty`).
 * @returns Lista priorizada y anotada con banderas `isStreamwish` e `isDirty`.
 */
export function filterAndPrioritizeMirrors<
  T extends StreamwishCandidateInput & { priority?: number }
>(
  mirrors: readonly T[],
  options?: StreamwishMatchPolicyOptions
): PrioritizedMirrorResult<T>[] {
  const strictOnly = options?.strictOnly ?? STRICT_STREAMWISH_ONLY;
  const fallbackIfEmpty = options?.fallbackIfEmpty ?? FALLBACK_IF_EMPTY;

  const annotatedMirrors = mirrors.map((item, originalIndex) => {
    const belongsToStreamwish = isStreamwish(item);
    const isCleanExtractable =
      belongsToStreamwish || isExtractableCleanHost(item);

    return {
      item,
      isStreamwish: belongsToStreamwish,
      isExtractable: isCleanExtractable,
      isDirty: !belongsToStreamwish,
      originalIndex,
    };
  });

  const sortedMirrors = [...annotatedMirrors].sort((first, second) => {
    if (first.isStreamwish !== second.isStreamwish) {
      return first.isStreamwish ? -1 : 1;
    }
    if (first.isExtractable !== second.isExtractable) {
      return first.isExtractable ? -1 : 1;
    }
    const firstPriority = first.item.priority ?? 99;
    const secondPriority = second.item.priority ?? 99;
    if (firstPriority !== secondPriority) {
      return firstPriority - secondPriority;
    }
    return first.originalIndex - second.originalIndex;
  });

  const streamwishOnlyMirrors = sortedMirrors.filter(
    (entry) => entry.isStreamwish
  );

  if (strictOnly) {
    if (streamwishOnlyMirrors.length > 0) {
      return streamwishOnlyMirrors.map(
        ({ item, isStreamwish: sw, isDirty }) => ({
          item,
          isStreamwish: sw,
          isDirty,
        })
      );
    }

    if (fallbackIfEmpty) {
      return sortedMirrors.map(({ item, isStreamwish: sw, isDirty }) => ({
        item,
        isStreamwish: sw,
        isDirty,
      }));
    }

    return [];
  }

  return sortedMirrors.map(({ item, isStreamwish: sw, isDirty }) => ({
    item,
    isStreamwish: sw,
    isDirty,
  }));
}

export const streamwishMatcher = {
  STRICT_STREAMWISH_ONLY,
  FALLBACK_IF_EMPTY,
  STREAMWISH_KNOWN_DOMAINS,
  STREAMWISH_HOST_REGEX,
  STREAMWISH_LABEL_REGEX,
  extractHostname,
  isMultiEmbedAggregatorUrl,
  isExtractableCleanHost,
  isStreamwishHostname,
  isStreamwishUrl,
  isStreamwishServerName,
  isStreamwish,
  extractStreamwishCode,
  normalizeStreamwishEmbedUrl,
  buildStreamwishExtractionTargets,
  filterAndPrioritizeMirrors,
} as const;
