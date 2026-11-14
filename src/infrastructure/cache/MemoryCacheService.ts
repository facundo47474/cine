import { ICacheService } from "@/domain/interfaces/ICacheService";

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * Servicio de Caché en Memoria de Alta Velocidad (LRU con TTL).
 *
 * Limita el almacenamiento a un máximo configurable de claves (`maxEntries = 500` por defecto)
 * para proteger la memoria RAM del proceso Node.js y responde consultas repetidas en `< 1ms`.
 */
export class MemoryCacheService implements ICacheService {
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = 500) {
    this.maxEntries = maxEntries;
  }

  /**
   * Obtiene un valor tipado desde la caché si existe y no ha expirado,
   * actualizando su posición de uso reciente (LRU).
   *
   * @param key Clave única de caché.
   * @returns Valor almacenado o `null` si no existe o venció su TTL.
   */
  public get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    // Refresca el orden LRU moviendo la clave al final del Map
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value as T;
  }

  /**
   * Almacena un valor en la caché con un tiempo de vida en segundos (`ttlSeconds`).
   * Si se alcanzó la capacidad máxima (`maxEntries`), desaloja la entrada menos usada recientemente.
   *
   * @param key Clave única de caché.
   * @param value Valor a guardar.
   * @param ttlSeconds Tiempo de vida en segundos.
   */
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

  /**
   * Elimina manualmente una entrada de la caché por su clave.
   *
   * @param key Clave a eliminar.
   */
  public delete(key: string): void {
    this.store.delete(key);
  }
}
