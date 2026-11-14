import dns from "dns";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_SCRAPER_USER_AGENT } from "@/infrastructure/providers/Embed69Decoder";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Silencioso en entornos donde no aplique
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Límite seguro por debajo de los 4.5 MB máximos de payload por invocación Serverless en Vercel.
 */
const MAX_VERCEL_MP4_CHUNK_BYTES = 3_500_000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Accept, Origin",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

/**
 * Responde a las pre-peticiones CORS (`OPTIONS`).
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Reescribe todas las URLs de segmentos y claves dentro de un manifiesto HLS (`.m3u8`)
 * para que atraviesen el proxy `/api/stream-proxy` conservando el `Referer` requerido.
 *
 * @param manifestText Contenido texto del manifiesto `.m3u8`.
 * @param finalBaseUrl URL base desde donde se descargó el manifiesto.
 * @param refererHeader Cabecera Referer que debe propagarse a cada segmento.
 * @returns Manifiesto HLS reescrito.
 */
function rewriteHlsManifestLines(
  manifestText: string,
  finalBaseUrl: string,
  refererHeader: string
): string {
  const buildProxyUrl = (targetUrl: string): string =>
    `/api/stream-proxy?url=${encodeURIComponent(
      targetUrl
    )}&referer=${encodeURIComponent(refererHeader)}`;

  return manifestText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        // Reescribe también atributos URI="..." en etiquetas como #EXT-X-KEY o #EXT-X-MAP
        return trimmed.replace(/URI="([^"]+)"/gi, (fullMatch, uriValue: string) => {
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

/**
 * Elimina cabeceras falsas camufladas (ej. PNG/JPEG/HTML inyectados al inicio de segmentos `.ts` por servidores como Streamwish)
 * buscando la triple marca de sincronización MPEG-TS (`0x47` cada 188 bytes).
 *
 * @param rawBuffer Buffer crudo del segmento MPEG-TS.
 * @returns Sub-buffer limpio alineado al primer paquete MPEG-TS (`0x47`).
 */
function stripCamouflagedMpegTsHeader(rawBuffer: Buffer): Buffer {
  if (rawBuffer.length <= 376 || rawBuffer[0] === 0x47) {
    return rawBuffer;
  }

  const maxInspectOffset = Math.min(rawBuffer.length - 376, 1024);
  for (let offset = 0; offset < maxInspectOffset; offset++) {
    if (
      rawBuffer[offset] === 0x47 &&
      rawBuffer[offset + 188] === 0x47 &&
      rawBuffer[offset + 376] === 0x47
    ) {
      return rawBuffer.subarray(offset);
    }
  }

  return rawBuffer;
}

/**
 * Endpoint Proxy de Streaming (`GET /api/stream-proxy?url=<STREAM_URL>&referer=<REFERER_URL>`).
 *
 * Inyecta cabeceras `Referer`, `Origin` y `User-Agent`, reescribe manifiestos HLS (`.m3u8`)
 * y transmite segmentos MPEG-TS (`.ts`), segmentos fMP4 (`.m4s`) o archivos `.mp4` directos
 * evitando bloqueos `403 Forbidden` y errores CORS.
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
    "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
    Referer: refererHeader,
    Origin: originHeader,
    Accept: "*/*",
  };

  const isLikelyMp4Request = /\.mp4(\?|$)/i.test(parsedStreamUrl.pathname);
  const rangeHeader = request.headers.get("range");

  if (isLikelyMp4Request) {
    // Acota cada petición Range de archivos .mp4 a bloques de 3.5 MB (HTTP 206)
    // para respetar el límite de respuesta de Vercel Serverless (4.5 MB).
    const rangeMatch = rangeHeader?.match(/bytes=(\d+)-(\d*)/i);
    const startByte = rangeMatch ? Number(rangeMatch[1]) : 0;
    const requestedEnd =
      rangeMatch && rangeMatch[2] ? Number(rangeMatch[2]) : null;
    const maxEndByte = startByte + MAX_VERCEL_MP4_CHUNK_BYTES - 1;
    const safeEndByte =
      requestedEnd !== null
        ? Math.min(requestedEnd, maxEndByte)
        : maxEndByte;
    upstreamHeaders["Range"] = `bytes=${startByte}-${safeEndByte}`;
  } else if (rangeHeader) {
    upstreamHeaders["Range"] = rangeHeader;
  }

  try {
    const upstreamResponse = await fetch(streamUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      return NextResponse.json(
        {
          error: `El servidor de origen respondió con HTTP ${upstreamResponse.status}`,
        },
        { status: upstreamResponse.status, headers: CORS_HEADERS }
      );
    }

    const contentType = (
      upstreamResponse.headers.get("content-type") || ""
    ).toLowerCase();
    const finalBaseUrl = upstreamResponse.url || streamUrl;
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
        refererHeader
      );

      return new NextResponse(modifiedManifest, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // Distingue archivos/segmentos MP4 e ISO-BMFF (.mp4, .m4s, .m4v, .cmfv) de segmentos MPEG-TS (.ts)
    const isMp4OrIsoSegment =
      /\.(?:mp4|m4s|m4v|cmfv|cmfa)(\?|$)/i.test(parsedStreamUrl.pathname) ||
      contentType.includes("video/mp4") ||
      contentType.includes("video/iso.segment") ||
      contentType.includes("audio/mp4");

    if (!isMp4OrIsoSegment) {
      const rawBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
      const cleanTsBuffer = stripCamouflagedMpegTsHeader(rawBuffer);

      return new NextResponse(new Uint8Array(cleanTsBuffer), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "video/mp2t",
          "Content-Length": String(cleanTsBuffer.length),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Transmite directamente el ReadableStream para archivos .mp4 y segmentos fMP4 (.m4s)
    const responseHeaders = new Headers(CORS_HEADERS);
    const passthroughHeaderNames = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
    ];

    for (const headerName of passthroughHeaderNames) {
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

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
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
