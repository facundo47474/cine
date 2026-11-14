export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Limitador de peticiones en memoria ligero y compatible con entornos Serverless (`RateLimiter`)
 * para proteger endpoints de API frente a abuso o scraping automatizado.
 */
export class RateLimiter {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly maxKeys = 2000;

  /**
   * Purga las entradas expiradas cuando el mapa supera el umbral máximo de claves (`maxKeys`).
   *
   * @param now Timestamp actual en milisegundos.
   */
  private cleanupExpired(now: number): void {
    if (this.store.size <= this.maxKeys) return;

    this.store.forEach((entry, key) => {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    });

    if (this.store.size > this.maxKeys) {
      this.store.clear();
    }
  }

  /**
   * Verifica y registra una petición entrante bajo una ventana fija de tiempo (`windowMs`).
   *
   * @param key Identificador único del cliente y recurso (ej. `"movies:192.0.2.1"`).
   * @param maxRequests Número máximo de peticiones permitidas dentro de la ventana.
   * @param windowMs Duración de la ventana en milisegundos.
   * @returns Estado del límite (`allowed`, `remaining`, `retryAfterSeconds`).
   */
  public checkLimit(
    key: string,
    maxRequests: number,
    windowMs: number
  ): RateLimitResult {
    const now = Date.now();
    this.cleanupExpired(now);

    const normalizedKey = key.trim() || "anonymous";
    const existing = this.store.get(normalizedKey);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.store.set(normalizedKey, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - 1),
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      };
    }

    existing.count += 1;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000)
    );

    if (existing.count > maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - existing.count),
      retryAfterSeconds,
    };
  }
}

export const apiRateLimiter = new RateLimiter();

/**
 * Extrae la dirección IP real del cliente desde las cabeceras de proxy inverso (`x-forwarded-for` o `x-real-ip`).
 *
 * @param request Objeto `Request` entrante.
 * @returns Dirección IP del cliente o `"unknown-ip"`.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown-ip";
}
