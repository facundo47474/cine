import { PrismaClient, MirrorLink as PrismaMirror } from "@prisma/client";
import { IMirrorRepository } from "@/domain/interfaces/IMirrorRepository";
import { MirrorLink } from "@/domain/entities/MirrorLink";
import { MirrorFormat } from "@/domain/enums/MirrorFormat";
import { MirrorStatus } from "@/domain/enums/MirrorStatus";

export class PrismaMirrorRepository implements IMirrorRepository {
  constructor(private readonly db: PrismaClient) {}

  private mapToDomain(row: PrismaMirror): MirrorLink {
    return new MirrorLink({
      id: row.id,
      movieId: row.movieId,
      serverName: row.serverName,
      language: row.language,
      rawUrl: row.rawUrl,
      format: row.format as MirrorFormat,
      quality: row.quality,
      priority: row.priority,
      status: row.status as MirrorStatus,
      consecutiveFailures: row.consecutiveFailures,
      lastCheckedAt: row.lastCheckedAt,
    });
  }

  public async findById(id: string): Promise<MirrorLink | null> {
    const row = await this.db.mirrorLink.findUnique({ where: { id } });
    return row ? this.mapToDomain(row) : null;
  }

  public async findByMovieId(movieId: string): Promise<MirrorLink[]> {
    const rows = await this.db.mirrorLink.findMany({
      where: { movieId },
      orderBy: { priority: "asc" },
    });
    return rows.map((r) => this.mapToDomain(r));
  }

  public async findBatchForHealthCheck(limit: number): Promise<MirrorLink[]> {
    const rows = await this.db.mirrorLink.findMany({
      orderBy: [
        { lastCheckedAt: { sort: "asc", nulls: "first" } },
        { priority: "asc" },
      ],
      take: limit,
    });
    return rows.map((r) => this.mapToDomain(r));
  }

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
