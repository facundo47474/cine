import { ILinkProber, LinkProbeResult } from "@/domain/interfaces/ILinkProber";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";

/**
 * Adaptador de Red para verificación de enlaces (Health Checker).
 * Utiliza HTTP HEAD para no descargar el archivo de video completo.
 * Si el servidor bloquea HEAD (405 Method Not Allowed), hace fallback a GET con Range: bytes=0-0.
 */
export class HttpHeadLinkProber implements ILinkProber {
  private readonly timeoutMs: number;
  private readonly userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

  constructor(timeoutMs: number = 7000) {
    this.timeoutMs = timeoutMs;
  }

  public async probeUrl(
    url: string,
    format: MirrorFormat
  ): Promise<LinkProbeResult> {
    const startTime = Date.now();

    try {
      let response = await fetch(url, {
        method: "HEAD",
        headers: {
          "User-Agent": this.userAgent,
          Accept: "*/*",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.status === 405 || response.status === 501) {
        response = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": this.userAgent,
            Range: "bytes=0-0",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      }

      const elapsed = Date.now() - startTime;
      const status = response.status;
      // En plataformas serverless (Vercel AWS IPs), Cloudflare suele devolver 403 a peticiones HEAD/GET
      // sobre servidores EMBED válidos (embed69, hglink, dr0pstream, vidsrc). No degradar por 403 en EMBED.
      const isCloudflareEmbedChallenge =
        format === MirrorFormat.EMBED && (status === 403 || status === 429);
      const isAlive =
        (status >= 200 && status < 400) || isCloudflareEmbedChallenge;
      const isPermanentGone = status === 404 || status === 410;

      return {
        isAlive,
        httpStatus: status,
        isPermanentGone,
        responseTimeMs: elapsed,
        reason: isAlive ? "OK" : `HTTP ${status}`,
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      return {
        isAlive: false,
        httpStatus: 0,
        isPermanentGone: false,
        responseTimeMs: elapsed,
        reason: error instanceof Error ? error.message : "Network timeout/error",
      };
    }
  }
}
