/**
 * Utilidad de coordinación de concurrencia bajo el patrón *Singleflight / Request Coalescing*
 * (`InFlightOperationCoalescer`).
 *
 * Unifica múltiples llamadas asíncronas simultáneas identificadas por la misma clave lógica
 * en una única ejecución en vuelo compartida, evitando:
 * - Condiciones de carrera en base de datos (`P2002 Unique constraint failed` / `P2034`).
 * - Doble disparo en React StrictMode o recargas rápidas del usuario.
 * - Llamadas redundantes a proveedores externos (TMDB, Embed69, PlayLatin).
 */
export class InFlightOperationCoalescer {
  private readonly inFlightOperationsByKey = new Map<string, Promise<unknown>>();

  /**
   * Ejecuta una tarea asíncrona garantizando que solo exista una instancia en vuelo
   * por cada `operationKey` en un momento dado. Si ya hay una ejecución activa para esa clave,
   * devuelve exactamente la misma promesa compartida.
   *
   * @param operationKey Clave representativa única de la operación (ej. `"movie-playback:tmdb-693134"`).
   * @param asynchronousTask Función asíncrona a ejecutar si no existe una en progreso.
   * @returns Promesa resuelta o rechazada de la operación compartida.
   */
  public executeSingleFlight<T>(
    operationKey: string,
    asynchronousTask: () => Promise<T>
  ): Promise<T> {
    const existingPromise = this.inFlightOperationsByKey.get(operationKey);
    if (existingPromise) {
      return existingPromise as Promise<T>;
    }

    const trackedPromise = Promise.resolve()
      .then(() => asynchronousTask())
      .finally(() => {
        if (this.inFlightOperationsByKey.get(operationKey) === trackedPromise) {
          this.inFlightOperationsByKey.delete(operationKey);
        }
      });

    this.inFlightOperationsByKey.set(operationKey, trackedPromise);
    return trackedPromise;
  }

  /**
   * Indica cuántas operaciones diferentes permanecen actualmente activas en vuelo.
   *
   * @returns Número de operaciones en progreso.
   */
  public getActiveOperationCount(): number {
    return this.inFlightOperationsByKey.size;
  }
}

