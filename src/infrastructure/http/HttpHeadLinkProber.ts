import { ILinkProber, LinkProbeResult } from "@/domain/interfaces/ILinkProber";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";

/**
 * Adaptador de Red para verificación de enlaces (`HttpHeadLinkProber`).
 *
 * Utiliza peticiones `HTTP HEAD` para comprobar la salud del enlace sin descargar el video completo.
 * Si el servidor de origen bloquea `HEAD` (`405 Method Not Allowed` o `501 Not Implemented`),
 * realiza fallback automático a `GET` solicitando únicamente el primer byte (`Range: bytes=0-0`).
 */
export class HttpHeadLinkProber implements ILinkProber {
  private readonly timeoutMs: number;
  private readonly userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

  constructor(timeoutMs: number = 7000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Sondea una URL de video o embed y devuelve su estado HTTP, latencia y si fue dada de baja.
   *
   * @param url URL cruda del recurso a verificar.
   * @param format Formato del mirror (`MP4`, `HLS` o `EMBED`).
   * @returns Resultado detallado del sondeo (`LinkProbeResult`).
   */
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

      const elapsedMs = Date.now() - startTime;
      const httpStatus = response.status;

      // En entornos serverless (IPs de datacenter), Cloudflare suele responder 403/429 a peticiones
      // HEAD/GET sobre servidores EMBED válidos. No se degradan enlaces EMBED por retos 403/429.
      const isCloudflareEmbedChallenge =
        format === MirrorFormat.EMBED &&
        (httpStatus === 403 || httpStatus === 429);
      const isAlive =
        (httpStatus >= 200 && httpStatus < 400) || isCloudflareEmbedChallenge;
      const isPermanentGone = httpStatus === 404 || httpStatus === 410;

      return {
        isAlive,
        httpStatus,
        isPermanentGone,
        responseTimeMs: elapsedMs,
        reason: isAlive ? "OK" : `HTTP ${httpStatus}`,
      };
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      return {
        isAlive: false,
        httpStatus: 0,
        isPermanentGone: false,
        responseTimeMs: elapsedMs,
        reason:
          error instanceof Error ? error.message : "Network timeout/error",
      };
    }
  }
}
