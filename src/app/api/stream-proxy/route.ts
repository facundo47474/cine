import dns from "dns";
import { NextRequest, NextResponse } from "next/server";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Silencioso en entornos donde no aplique
}

export const dynamic = "force-dynamic";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Accept, Origin",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * PASO 3: Endpoint Proxy de Streaming (/api/stream-proxy?url=<STREAM_URL>&referer=<REFERER_URL>)
 * Inyecta cabeceras Referer, Origin y User-Agent, reescribe manifiestos HLS (.m3u8) y transmite
 * segmentos (.ts, .m4s) o archivos (.mp4) evitando bloqueos 403 Forbidden y errores CORS.
 */
export async function GET(request: NextRequest) {
  const streamUrl = request.nextUrl.searchParams.get("url")?.trim() || "";
  const rawReferer = request.nextUrl.searchParams.get("referer")?.trim() || "";

  if (!streamUrl) {
    return NextResponse.json(
      { error: "Parámetro 'url' requerido." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  let parsedStreamUrl: URL;
  try {
    parsedStreamUrl = new URL(streamUrl);
    if (
      parsedStreamUrl.protocol !== "http:" &&
      parsedStreamUrl.protocol !== "https:"
    ) {
      return NextResponse.json(
        { error: "Protocolo de URL no permitido." },
        { status: 400, headers: CORS_HEADERS }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "URL de stream inválida." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  let refererHeader = rawReferer || `${parsedStreamUrl.origin}/`;
  let originHeader = parsedStreamUrl.origin;

  try {
    if (rawReferer) {
      const parsedReferer = new URL(rawReferer);
      refererHeader = parsedReferer.toString();
      originHeader = parsedReferer.origin;
    }
  } catch {
    refererHeader = `${parsedStreamUrl.origin}/`;
    originHeader = parsedStreamUrl.origin;
  }

  const upstreamHeaders: Record<string, string> = {
    "User-Agent": BROWSER_USER_AGENT,
    Referer: refererHeader,
    Origin: originHeader,
    Accept: "*/*",
  };

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    upstreamHeaders["Range"] = rangeHeader;
  }

  try {
    const upstreamRes = await fetch(streamUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return NextResponse.json(
        {
          error: `El servidor de origen respondió con HTTP ${upstreamRes.status}`,
        },
        { status: upstreamRes.status, headers: CORS_HEADERS }
      );
    }

    const contentType = (
      upstreamRes.headers.get("content-type") || ""
    ).toLowerCase();
    const finalBaseUrl = upstreamRes.url || streamUrl;
    const isHlsManifest =
      /\.m3u8(\?|$)/i.test(parsedStreamUrl.pathname) ||
      /\.m3u8/i.test(finalBaseUrl) ||
      /(?:master|index[^/]*)\.txt(\?|$)/i.test(parsedStreamUrl.pathname) ||
      /\/hls3\/.*\.txt(\?|$)/i.test(parsedStreamUrl.pathname) ||
      contentType.includes("mpegurl") ||
      contentType.includes("x-mpegurl");

    const buildProxyUrl = (targetUrl: string): string => {
      return `/api/stream-proxy?url=${encodeURIComponent(
        targetUrl
      )}&referer=${encodeURIComponent(refererHeader)}`;
    };

    if (isHlsManifest) {
      const manifestText = await upstreamRes.text();

      const rewrittenLines = manifestText.split(/\r?\n/).map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        if (trimmed.startsWith("#")) {
          // Reescribir también atributos URI="..." en etiquetas como #EXT-X-KEY o #EXT-X-MAP
          return trimmed.replace(/URI="([^"]+)"/gi, (_full, uriVal: string) => {
            try {
              const resolvedUri = new URL(uriVal, finalBaseUrl).toString();
              return `URI="${buildProxyUrl(resolvedUri)}"`;
            } catch {
              return _full;
            }
          });
        }

        try {
          const resolvedSegmentUrl = new URL(trimmed, finalBaseUrl).toString();
          return buildProxyUrl(resolvedSegmentUrl);
        } catch {
          return trimmed;
        }
      });

      const modifiedManifest = rewrittenLines.join("\n");

      return new NextResponse(modifiedManifest, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // Si es un segmento HLS (no un archivo .mp4 completo), verificamos si trae cabecera camuflada
    // (ej. PNG/JPEG/HTML falso antes del byte de sincronización MPEG-TS 0x47 alineado a 188 bytes)
    const isDirectMp4 =
      /\.mp4(\?|$)/i.test(parsedStreamUrl.pathname) ||
      contentType.includes("video/mp4");

    if (!isDirectMp4) {
      const rawBuffer = Buffer.from(await upstreamRes.arrayBuffer());
      let tsStartOffset = 0;
      if (rawBuffer.length > 376 && rawBuffer[0] !== 0x47) {
        for (let i = 0; i < Math.min(rawBuffer.length - 376, 1024); i++) {
          if (
            rawBuffer[i] === 0x47 &&
            rawBuffer[i + 188] === 0x47 &&
            rawBuffer[i + 376] === 0x47
          ) {
            tsStartOffset = i;
            break;
          }
        }
      }
      const cleanTsBuffer =
        tsStartOffset > 0 ? rawBuffer.subarray(tsStartOffset) : rawBuffer;
      return new NextResponse(cleanTsBuffer, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "video/mp2t",
          "Content-Length": String(cleanTsBuffer.length),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Si es un segmento de video (.ts, .m4s) o un archivo .mp4 directo, transmitir el ReadableStream
    const responseHeaders = new Headers(CORS_HEADERS);

    const passthroughHeaderNames = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
    ];

    for (const headerName of passthroughHeaderNames) {
      const val = upstreamRes.headers.get(headerName);
      if (val) {
        responseHeaders.set(headerName, val);
      }
    }

    if (!responseHeaders.has("content-type")) {
      if (/\.mp4(\?|$)/i.test(parsedStreamUrl.pathname)) {
        responseHeaders.set("content-type", "video/mp4");
      } else {
        responseHeaders.set("content-type", "video/mp2t");
      }
    }

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error en el proxy de streaming.",
      },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

