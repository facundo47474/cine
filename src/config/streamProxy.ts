/**
 * Resuelve la URL base del proxy de streaming HLS/MP4.
 *
 * Si `NEXT_PUBLIC_STREAM_PROXY_URL` apunta a un Cloudflare Worker externo
 * (p. ej. `https://piloto-stream-proxy.usuario.workers.dev`), delega el
 * tráfico pesado de segmentos de video allí; de lo contrario usa `/api/stream-proxy`.
 */
export function getStreamProxyBaseUrl(): string {
  const externalProxyUrl = process.env.NEXT_PUBLIC_STREAM_PROXY_URL?.trim();
  if (externalProxyUrl) {
    try {
      const parsed = new URL(externalProxyUrl);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        const normalizedPath = parsed.pathname.replace(/\/+$/, "");
        return normalizedPath
          ? `${parsed.origin}${normalizedPath}`
          : `${parsed.origin}/`;
      }
    } catch {
      // Silencioso: cae al endpoint interno
    }
  }
  return "/api/stream-proxy";
}

/**
 * Construye la URL completa del proxy de streaming con los parámetros `url` y `referer`.
 */
export function buildStreamProxyUrl(
  streamUrl: string,
  referer?: string | null
): string {
  const base = getStreamProxyBaseUrl();
  return `${base}?url=${encodeURIComponent(
    streamUrl
  )}&referer=${encodeURIComponent(referer || "")}`;
}
