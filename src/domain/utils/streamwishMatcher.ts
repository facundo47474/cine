/**
 * Fuente única de verdad para detección universal de Streamwish y todos sus
 * dominios espejo (aliases), normalización de embeds y política de filtrado estricto.
 */

export const STRICT_STREAMWISH_ONLY: boolean =
  typeof process !== "undefined"
    ? process.env.STRICT_STREAMWISH_ONLY !== "false" &&
      process.env.NEXT_PUBLIC_STRICT_STREAMWISH_ONLY !== "false"
    : true;

// Contingencia automática activa por defecto: si Streamwish no está disponible
// (ej. agregador con Anubis PoW o título ausente en Streamwish), permite servidores
// extraíbles directamente a HLS/MP4 sin anuncios (Vidhide/Dropload/Mixdrop) marcados isDirty=true.
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

export function extractHostname(rawUrl?: string | null): string {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  try {
    const withProto = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.startsWith("//")
      ? `https:${trimmed}`
      : `https://${trimmed}`;
    return new URL(withProto).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isHttpUrl(value?: string | null): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

export function isMultiEmbedAggregatorUrl(rawUrl?: string | null): boolean {
  const host = extractHostname(rawUrl);
  if (!host) return false;
  return MULTI_EMBED_AGGREGATOR_HOSTS.some(
    (agg) => host === agg || host.endsWith(`.${agg}`)
  );
}

const EXTRACTABLE_FALLBACK_HOST_REGEX =
  /morencius\.com|vidhide|dr0pstream\.com|dropload|mxdrop\.|mixdrop|filemoon/i;

/**
 * Detecta servidores cuyo stream crudo (.m3u8/.mp4) puede extraerse en el backend
 * y reproducirse nativamente en HTML5 <video> con cero anuncios (además de Streamwish).
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

  const labels = `${target.serverName || ""} ${target.label || ""} ${target.name || ""} ${target.server || ""}`.toLowerCase();
  return EXTRACTABLE_FALLBACK_HOST_REGEX.test(labels);
}

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

export function isStreamwishUrl(rawUrl?: string | null): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  const host = extractHostname(trimmed);
  if (!host) return false;

  return isStreamwishHostname(host);
}

export function isStreamwishServerName(label?: string | null): boolean {
  if (!label) return false;
  return STREAMWISH_LABEL_REGEX.test(label.trim());
}

/**
 * Evalúa de forma universal si un servidor o URL pertenece a la familia Streamwish.
 * Cuando hay una URL HTTP externa real, el hostname de la URL es la verdad autoritativa
 * para evitar falsos positivos por etiquetas heredadas (ej. "Streamwish-Lat" apuntando a vidsrc/dropload).
 */
export function isStreamwish(
  target: string | StreamwishCandidateInput | null | undefined
): boolean {
  if (!target) return false;

  if (typeof target === "string") {
    const trimmed = target.trim();
    if (!trimmed) return false;
    if (isHttpUrl(trimmed) || trimmed.startsWith("//") || trimmed.includes(".")) {
      if (isStreamwishUrl(trimmed)) return true;
      if (isHttpUrl(trimmed)) return false;
    }
    return isStreamwishServerName(trimmed);
  }

  const candidateUrl = (target.rawUrl || target.url || "").trim();
  if (candidateUrl && isHttpUrl(candidateUrl)) {
    // Una URL externa concreta manda sobre la etiqueta para evitar servidores sucios disfrazados.
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
  ].filter((v): v is string => Boolean(v && v.trim()));

  return labels.some((lbl) => isStreamwishServerName(lbl));
}

export function extractStreamwishCode(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const match = rawUrl
    .trim()
    .match(/\/(?:e|embed|f|d)\/([a-zA-Z0-9_-]+)/i);
  return match?.[1] || null;
}

/**
 * Normaliza dominios antiguos o rotativos de Streamwish hacia el host canónico
 * preservando el file code para extracción y reproducción.
 */
export function normalizeStreamwishEmbedUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!isStreamwishUrl(trimmed)) return trimmed;

  const code = extractStreamwishCode(trimmed);
  if (!code) return trimmed;

  const host = extractHostname(trimmed);
  // Dominios ya optimizados para iframe/extracción directa se conservan tal cual;
  // aliases rotativos (*.wish.* / swdyu) se normalizan a hglink.to para consistencia.
  if (
    host === "hglink.to" ||
    host === "audinifer.com" ||
    host === "vibuxer.com" ||
    host === "hanerix.com"
  ) {
    return `https://${host}/e/${code}`;
  }

  return `https://hglink.to/e/${code}`;
}

export interface StreamwishExtractionTarget {
  fetchUrl: string;
  referer: string;
  sourceEmbedUrl: string;
}

/**
 * Genera la lista completa de endpoints de extracción para cualquier variante de Streamwish,
 * probando los nodos directos conocidos (audinifer, vibuxer, hglink) y el origen del alias original.
 */
export function buildStreamwishExtractionTargets(
  embedUrl: string
): StreamwishExtractionTarget[] {
  const targets: StreamwishExtractionTarget[] = [];
  const seen = new Set<string>();

  const add = (fetchUrl: string, referer: string, sourceEmbedUrl: string) => {
    if (!seen.has(fetchUrl)) {
      seen.add(fetchUrl);
      targets.push({ fetchUrl, referer, sourceEmbedUrl });
    }
  };

  let origin = "https://hglink.to";
  try {
    origin = new URL(embedUrl).origin;
  } catch {
    // Usar fallback hglink.to
  }

  if (isStreamwishUrl(embedUrl)) {
    const fileCode = extractStreamwishCode(embedUrl);
    if (fileCode) {
      const canonicalSwEmbed = normalizeStreamwishEmbedUrl(embedUrl);
      add(
        `https://audinifer.com/e/${fileCode}`,
        "https://hglink.to/",
        canonicalSwEmbed
      );
      add(
        `https://vibuxer.com/e/${fileCode}`,
        "https://hglink.to/",
        canonicalSwEmbed
      );
      add(
        `https://hglink.to/e/${fileCode}`,
        "https://hglink.to/",
        canonicalSwEmbed
      );
      if (
        origin !== "https://audinifer.com" &&
        origin !== "https://vibuxer.com" &&
        origin !== "https://hglink.to"
      ) {
        add(`${origin}/e/${fileCode}`, `${origin}/`, canonicalSwEmbed);
      }
    }
  }

  add(embedUrl, `${origin}/`, embedUrl);
  return targets;
}

/**
 * Aplica de forma determinista el filtrado y priorización estricta para cualquier lista de mirrors:
 * - Streamwish siempre ocupa los primeros índices (índice 0+).
 * - Si strictOnly=true: devuelve únicamente Streamwish.
 * - Si strictOnly=true y no hay Streamwish y fallbackIfEmpty=true: activa contingencia marcando isDirty=true.
 */
export function filterAndPrioritizeMirrors<
  T extends StreamwishCandidateInput & { priority?: number }
>(
  mirrors: readonly T[],
  options?: StreamwishMatchPolicyOptions
): PrioritizedMirrorResult<T>[] {
  const strictOnly = options?.strictOnly ?? STRICT_STREAMWISH_ONLY;
  const fallbackIfEmpty = options?.fallbackIfEmpty ?? FALLBACK_IF_EMPTY;

  const annotated = mirrors.map((item, idx) => {
    const clean = isStreamwish(item);
    const extractable = clean || isExtractableCleanHost(item);
    return {
      item,
      isStreamwish: clean,
      isExtractable: extractable,
      isDirty: !clean,
      originalIndex: idx,
    };
  });

  const sorted = [...annotated].sort((a, b) => {
    if (a.isStreamwish !== b.isStreamwish) {
      return a.isStreamwish ? -1 : 1;
    }
    if (a.isExtractable !== b.isExtractable) {
      return a.isExtractable ? -1 : 1;
    }
    const pa = a.item.priority ?? 99;
    const pb = b.item.priority ?? 99;
    if (pa !== pb) return pa - pb;
    return a.originalIndex - b.originalIndex;
  });

  const streamwishOnly = sorted.filter((entry) => entry.isStreamwish);

  if (strictOnly) {
    if (streamwishOnly.length > 0) {
      return streamwishOnly.map(({ item, isStreamwish: sw, isDirty }) => ({
        item,
        isStreamwish: sw,
        isDirty,
      }));
    }

    if (fallbackIfEmpty) {
      return sorted.map(({ item, isStreamwish: sw, isDirty }) => ({
        item,
        isStreamwish: sw,
        isDirty,
      }));
    }

    return [];
  }

  return sorted.map(({ item, isStreamwish: sw, isDirty }) => ({
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

