import { PrismaClient } from "@prisma/client";
import { IMirrorRepository } from "@/domain/interfaces/IMirrorRepository";
import { MirrorLink } from "@/domain/entities/MirrorLink";
import { mapPrismaMirrorToDomain } from "./mappers/PrismaDomainMappers";

/**
 * Repositorio concreto de enlaces Mirror (`MirrorLink`) sobre PostgreSQL utilizando Prisma ORM.
 */
export class PrismaMirrorRepository implements IMirrorRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Busca un enlace mirror específico por su UUID.
   *
   * @param id UUID del mirror.
   * @returns Instancia de dominio `MirrorLink` o `null` si no existe.
   */
  public async findById(id: string): Promise<MirrorLink | null> {
    const row = await this.db.mirrorLink.findUnique({ where: { id } });
    return row ? mapPrismaMirrorToDomain(row) : null;
  }

  /**
   * Obtiene todos los mirrors pertenecientes a una película ordenados por prioridad ascendente.
   *
   * @param movieId UUID de la película.
   * @returns Lista de entidades `MirrorLink`.
   */
  public async findByMovieId(movieId: string): Promise<MirrorLink[]> {
    const rows = await this.db.mirrorLink.findMany({
      where: { movieId },
      orderBy: { priority: "asc" },
    });
    return rows.map((row) => mapPrismaMirrorToDomain(row));
  }

  /**
   * Obtiene un lote de mirrors para auditoría de salud, priorizando aquellos que nunca fueron
   * verificados (`lastCheckedAt: null`) o cuya última verificación es más antigua.
   *
   * @param limit Cantidad máxima de mirrors a recuperar.
   * @returns Lista de entidades `MirrorLink`.
   */
  public async findBatchForHealthCheck(limit: number): Promise<MirrorLink[]> {
    const rows = await this.db.mirrorLink.findMany({
      orderBy: [
        { lastCheckedAt: { sort: "asc", nulls: "first" } },
        { priority: "asc" },
      ],
      take: limit,
    });
    return rows.map((row) => mapPrismaMirrorToDomain(row));
  }

  /**
   * Persiste en la base de datos el estado de salud actualizado de un mirror (`status`,
   * `consecutiveFailures` y `lastCheckedAt`).
   *
   * @param mirror Entidad `MirrorLink` modificada.
   */
  public async save(mirror: MirrorLink): Promise<void> {
    const data = mirror.toObject();
    await this.db.mirrorLink.update({
      where: { id: data.id },
      data: {
        status: data.status,
        consecutiveFailures: data.consecutiveFailures,
        lastCheckedAt: data.lastCheckedAt,
      },
    });
  }
}
