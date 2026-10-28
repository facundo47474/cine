import { ICacheService } from "@/domain/interfaces/ICacheService";

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * Servicio de Caché en Memoria de Alta Velocidad (LRU / FIFO con TTL).
 * Limita el almacenamiento a un máximo de 500 claves para proteger la RAM del servidor
 * y responde consultas repetidas en < 1ms.
 */
export class MemoryCacheService implements ICacheService {
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = 500) {
    this.maxEntries = maxEntries;
  }

  public get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    // Refrescamos orden LRU moviendo la clave al final del Map
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlSeconds: number): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
    });
  }

  public delete(key: string): void {
    this.store.delete(key);
  }
}
