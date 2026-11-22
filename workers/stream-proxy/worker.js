const DEFAULT_SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_BUFFERED_SEGMENT_BYTES = 16 * 1024 * 1024;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Accept, Origin",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

const BLOCKED_EXACT_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "::",
  "0:0:0:0:0:0:0:1",
  "0:0:0:0:0:0:0:0",
  "metadata",
  "metadata.google.internal",
  "169.254.169.254",
  "fd00:ec2::254",
]);

function isPrivateOrReservedIpv4Octets(a, b, c) {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpAddress(normalizedHost) {
  const ipv4Match = normalizedHost.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  );
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    const c = Number(ipv4Match[3]);
    const d = Number(ipv4Match[4]);
    if ([a, b, c, d].some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    return isPrivateOrReservedIpv4Octets(a, b, c);
  }

  if (!normalizedHost.includes(":")) {
    return false;
  }

  if (
    normalizedHost === "::1" ||
    normalizedHost === "::" ||
    normalizedHost === "0:0:0:0:0:0:0:1" ||
    normalizedHost === "0:0:0:0:0:0:0:0" ||
    /^f[cd][0-9a-f]{0,2}:/.test(normalizedHost) ||
    /^fe[89ab][0-9a-f]:/.test(normalizedHost)
  ) {
    return true;
  }

  const mappedDottedMatch = normalizedHost.match(
    /^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  );
  if (mappedDottedMatch) {
    return isPrivateOrReservedIpv4Octets(
      Number(mappedDottedMatch[1]),
      Number(mappedDottedMatch[2]),
      Number(mappedDottedMatch[3])
    );
  }

  const mappedHexMatch = normalizedHost.match(
    /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/
  );
  if (mappedHexMatch) {
    const hi = parseInt(mappedHexMatch[1], 16);
    const lo = parseInt(mappedHexMatch[2], 16);
    return isPrivateOrReservedIpv4Octets(
      (hi >> 8) & 0xff,
      hi & 0xff,
      (lo >> 8) & 0xff
    );
  }

  return false;
}

function isSafePublicHttpUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return false;

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  if (parsed.username || parsed.password) {
    return false;
  }

  const normalizedHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalizedHost) return false;

  if (
    BLOCKED_EXACT_HOSTS.has(normalizedHost) ||
    normalizedHost.endsWith(".localhost") ||
    normalizedHost.endsWith(".local") ||
    normalizedHost.endsWith(".internal") ||
    normalizedHost.endsWith(".home.arpa")
  ) {
    return false;
  }

  return !isBlockedIpAddress(normalizedHost);
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function rewriteHlsManifestLines(
  manifestText,
  finalBaseUrl,
  refererHeader,
  proxyEndpointUrl
) {
  const buildProxyUrl = (targetUrl) =>
    `${proxyEndpointUrl}?url=${encodeURIComponent(
      targetUrl
    )}&referer=${encodeURIComponent(refererHeader)}`;

  return manifestText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        return trimmed.replace(/URI="([^"]+)"/gi, (fullMatch, uriValue) => {
          try {
            const resolvedUri = new URL(uriValue, finalBaseUrl).toString();
            return `URI="${buildProxyUrl(resolvedUri)}"`;
          } catch {
            return fullMatch;
          }
        });
      }

      try {
        const resolvedSegmentUrl = new URL(trimmed, finalBaseUrl).toString();
        return buildProxyUrl(resolvedSegmentUrl);
      } catch {
        return trimmed;
      }
    })
    .join("\n");
}

function stripCamouflagedMpegTsHeader(rawBytes) {
  if (rawBytes.length <= 376 || rawBytes[0] === 0x47) {
    return rawBytes;
  }

  const maxInspectOffset = Math.min(rawBytes.length - 376, 4096);
  for (let offset = 0; offset < maxInspectOffset; offset++) {
    if (
      rawBytes[offset] === 0x47 &&
      rawBytes[offset + 188] === 0x47 &&
      rawBytes[offset + 376] === 0x47
    ) {
      return rawBytes.subarray(offset);
    }
  }

  return rawBytes;
}

async function readBoundedUint8Array(response, maxBytes) {
  if (!response.body) {
    return new Uint8Array(0);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }

    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return combined;
  } finally {
    reader.releaseLock();
  }
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonError("Método no permitido.", 405);
    }

    const requestUrl = new URL(request.url);
    const streamUrl = (requestUrl.searchParams.get("url") || "").trim();
    const rawReferer = (requestUrl.searchParams.get("referer") || "").trim();

    if (!streamUrl) {
      return jsonError("Parámetro 'url' requerido.", 400);
    }

    let parsedStreamUrl;
    try {
      parsedStreamUrl = new URL(streamUrl);
      if (
        parsedStreamUrl.protocol !== "http:" &&
        parsedStreamUrl.protocol !== "https:"
      ) {
        return jsonError("Protocolo de URL no permitido.", 400);
      }
    } catch {
      return jsonError("URL de stream inválida.", 400);
    }

    if (!isSafePublicHttpUrl(streamUrl)) {
      return jsonError("Destino de URL no permitido.", 403);
    }

    let refererHeader = `${parsedStreamUrl.origin}/`;
    let originHeader = parsedStreamUrl.origin;

    if (rawReferer && isSafePublicHttpUrl(rawReferer)) {
      try {
        const parsedReferer = new URL(rawReferer);
        refererHeader = parsedReferer.toString();
        originHeader = parsedReferer.origin;
      } catch {
        refererHeader = `${parsedStreamUrl.origin}/`;
        originHeader = parsedStreamUrl.origin;
      }
    }

    const upstreamHeaders = {
      "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
      Referer: refererHeader,
      Origin: originHeader,
      Accept: "*/*",
    };

    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      upstreamHeaders["Range"] = rangeHeader;
    }

    try {
      const upstreamResponse = await fetch(streamUrl, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: upstreamHeaders,
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });

      if (
        upstreamResponse.url &&
        !isSafePublicHttpUrl(upstreamResponse.url)
      ) {
        await upstreamResponse.body?.cancel().catch(() => {});
        return jsonError("Redirección hacia destino no permitido.", 403);
      }

      if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
        return jsonError(
          `El servidor de origen respondió con HTTP ${upstreamResponse.status}`,
          upstreamResponse.status
        );
      }

      if (request.method === "HEAD") {
        const headHeaders = new Headers(CORS_HEADERS);
        for (const h of [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "cache-control",
        ]) {
          const val = upstreamResponse.headers.get(h);
          if (val) headHeaders.set(h, val);
        }
        return new Response(null, {
          status: upstreamResponse.status,
          headers: headHeaders,
        });
      }

      const contentType = (
        upstreamResponse.headers.get("content-type") || ""
      ).toLowerCase();
      const finalBaseUrl = upstreamResponse.url || streamUrl;
      const proxyEndpointUrl = `${requestUrl.origin}${
        requestUrl.pathname === "/" ? "/" : requestUrl.pathname
      }`;

      const isHlsManifest =
        /\.m3u8(\?|$)/i.test(parsedStreamUrl.pathname) ||
        /\.m3u8/i.test(finalBaseUrl) ||
        /(?:master|index[^/]*)\.txt(\?|$)/i.test(parsedStreamUrl.pathname) ||
        /\/hls3\/.*\.txt(\?|$)/i.test(parsedStreamUrl.pathname) ||
        contentType.includes("mpegurl") ||
        contentType.includes("x-mpegurl");

      if (isHlsManifest) {
        const manifestText = await upstreamResponse.text();
        const modifiedManifest = rewriteHlsManifestLines(
          manifestText,
          finalBaseUrl,
          refererHeader,
          proxyEndpointUrl
        );
        return new Response(modifiedManifest, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      }

      const isMp4OrIsoSegment =
        /\.(?:mp4|m4s|m4v|cmfv|cmfa)(\?|$)/i.test(parsedStreamUrl.pathname) ||
        contentType.includes("video/mp4") ||
        contentType.includes("video/iso.segment") ||
        contentType.includes("audio/mp4");

      if (!isMp4OrIsoSegment) {
        const contentLengthHeader = Number(
          upstreamResponse.headers.get("content-length") || "0"
        );
        if (
          Number.isFinite(contentLengthHeader) &&
          contentLengthHeader > MAX_BUFFERED_SEGMENT_BYTES
        ) {
          await upstreamResponse.body?.cancel().catch(() => {});
          return jsonError("Segmento demasiado grande.", 413);
        }

        const rawBytes = await readBoundedUint8Array(
          upstreamResponse,
          MAX_BUFFERED_SEGMENT_BYTES
        );
        if (rawBytes === null) {
          return jsonError("Segmento demasiado grande.", 413);
        }

        if (rawBytes.length < 512_000) {
          const preview = new TextDecoder().decode(
            rawBytes.subarray(0, Math.min(rawBytes.length, 64))
          );
          if (preview.includes("#EXTM3U")) {
            const manifestText = new TextDecoder().decode(rawBytes);
            const modifiedManifest = rewriteHlsManifestLines(
              manifestText,
              finalBaseUrl,
              refererHeader,
              proxyEndpointUrl
            );
            return new Response(modifiedManifest, {
              status: 200,
              headers: {
                ...CORS_HEADERS,
                "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
                "Cache-Control": "no-store, no-cache, must-revalidate",
              },
            });
          }
        }

        const cleanTsBytes = stripCamouflagedMpegTsHeader(rawBytes);
        return new Response(cleanTsBytes, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            "Content-Type": "video/mp2t",
            "Content-Length": String(cleanTsBytes.length),
            "Cache-Control": "public, max-age=3600",
          },
        });
      }

      const responseHeaders = new Headers(CORS_HEADERS);
      for (const headerName of [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "cache-control",
      ]) {
        const headerValue = upstreamResponse.headers.get(headerName);
        if (headerValue) {
          responseHeaders.set(headerName, headerValue);
        }
      }

      if (!responseHeaders.has("content-type")) {
        if (/\.m4s(\?|$)/i.test(parsedStreamUrl.pathname)) {
          responseHeaders.set("content-type", "video/iso.segment");
        } else {
          responseHeaders.set("content-type", "video/mp4");
        }
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    } catch {
      return jsonError("Error en el proxy de streaming.", 502);
    }
  },
};
