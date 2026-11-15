import { prisma } from "@/infrastructure/database/prismaClient";
import {
  BillingCycle,
  construirEstadoMembresia,
  MembershipPlan,
  UserMembershipStatusDto,
} from "@/domain/services/MembershipPolicy";

interface StoredMembershipRecord {
  userId: string;
  plan: MembershipPlan;
  billingCycle: BillingCycle;
  shieldModeEnabled: boolean;
  updatedAt: Date;
}

const memoryMembershipFallback = new Map<string, StoredMembershipRecord>();

function isVipEmailByEnv(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const rawList = process.env.PRO_EMAILS?.trim();
  if (!rawList) return false;

  return rawList
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

/**
 * Repositorio PostgreSQL (con fallback en memoria) para el estado de suscripción Piloto Pro y Modo Escudo.
 * Auto-inicializa la tabla `"UserMembership"` de forma idempotente sin requerir migraciones manuales previas.
 */
export class PrismaMembershipRepository {
  private tableReadyPromise: Promise<boolean> | null = null;

  private async ensureMembershipTable(): Promise<boolean> {
    if (!this.tableReadyPromise) {
      this.tableReadyPromise = (async () => {
        try {
          await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "UserMembership" (
              "userId" TEXT PRIMARY KEY,
              "plan" TEXT NOT NULL DEFAULT 'FREE',
              "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
              "shieldModeEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
              "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
          `);
          return true;
        } catch (error) {
          console.warn(
            "[PrismaMembershipRepository] No se pudo verificar tabla UserMembership; usando respaldo en memoria:",
            error
          );
          this.tableReadyPromise = null;
          return false;
        }
      })();
    }

    return this.tableReadyPromise;
  }

  private async readStoredRecord(
    userId: string
  ): Promise<StoredMembershipRecord | null> {
    const dbAvailable = await this.ensureMembershipTable();
    if (dbAvailable) {
      try {
        const rows = await prisma.$queryRaw<
          Array<{
            userId: string;
            plan: string;
            billingCycle: string;
            shieldModeEnabled: boolean;
            updatedAt: Date;
          }>
        >`
          SELECT "userId", "plan", "billingCycle", "shieldModeEnabled", "updatedAt"
          FROM "UserMembership"
          WHERE "userId" = ${userId}
          LIMIT 1
        `;

        const row = rows[0];
        if (row) {
          const normalized: StoredMembershipRecord = {
            userId: row.userId,
            plan: row.plan === "PRO" ? "PRO" : "FREE",
            billingCycle: row.billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
            shieldModeEnabled: Boolean(row.shieldModeEnabled),
            updatedAt:
              row.updatedAt instanceof Date
                ? row.updatedAt
                : new Date(row.updatedAt),
          };
          memoryMembershipFallback.set(userId, normalized);
          return normalized;
        }
      } catch (error) {
        console.warn(
          "[PrismaMembershipRepository] Error consultando membresía en PostgreSQL:",
          error
        );
      }
    }

    return memoryMembershipFallback.get(userId) || null;
  }

  private async upsertStoredRecord(
    record: Omit<StoredMembershipRecord, "updatedAt">
  ): Promise<UserMembershipStatusDto> {
    const now = new Date();
    const nextRecord: StoredMembershipRecord = {
      ...record,
      updatedAt: now,
    };

    memoryMembershipFallback.set(record.userId, nextRecord);

    const dbAvailable = await this.ensureMembershipTable();
    if (dbAvailable) {
      try {
        await prisma.$executeRaw`
          INSERT INTO "UserMembership" ("userId", "plan", "billingCycle", "shieldModeEnabled", "updatedAt")
          VALUES (${nextRecord.userId}, ${nextRecord.plan}, ${nextRecord.billingCycle}, ${nextRecord.shieldModeEnabled}, ${now})
          ON CONFLICT ("userId")
          DO UPDATE SET
            "plan" = EXCLUDED."plan",
            "billingCycle" = EXCLUDED."billingCycle",
            "shieldModeEnabled" = EXCLUDED."shieldModeEnabled",
            "updatedAt" = EXCLUDED."updatedAt"
        `;
      } catch (error) {
        console.warn(
          "[PrismaMembershipRepository] Error persistiendo membresía en PostgreSQL:",
          error
        );
      }
    }

    return construirEstadoMembresia(nextRecord);
  }

  /**
   * Obtiene el estado de membresía y permisos del usuario; si pertenece a `PRO_EMAILS`
   * y no tiene registro previo, lo inicializa automáticamente como usuario Pro con Modo Escudo activo.
   */
  public async getMembershipByUserId(
    userId: string,
    userEmail?: string | null
  ): Promise<UserMembershipStatusDto> {
    if (!userId) {
      return construirEstadoMembresia({ plan: "FREE" });
    }

    const existing = await this.readStoredRecord(userId);
    if (existing) {
      return construirEstadoMembresia(existing);
    }

    if (isVipEmailByEnv(userEmail)) {
      return this.upsertStoredRecord({
        userId,
        plan: "PRO",
        billingCycle: "ANNUAL",
        shieldModeEnabled: true,
      });
    }

    return construirEstadoMembresia({ plan: "FREE" });
  }

  /**
   * Activa la suscripción Piloto Pro habilitando de inmediato el Modo Escudo y demás funciones avanzadas.
   */
  public async activateProMembership(
    userId: string,
    billingCycle: BillingCycle = "MONTHLY"
  ): Promise<UserMembershipStatusDto> {
    return this.upsertStoredRecord({
      userId,
      plan: "PRO",
      billingCycle: billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
      shieldModeEnabled: true,
    });
  }

  /**
   * Revierte la cuenta al plan gratuito estándar desactivando el Modo Escudo y las herramientas Pro.
   */
  public async downgradeToFreeMembership(
    userId: string
  ): Promise<UserMembershipStatusDto> {
    return this.upsertStoredRecord({
      userId,
      plan: "FREE",
      billingCycle: "MONTHLY",
      shieldModeEnabled: false,
    });
  }

  /**
   * Activa o pausa el Modo Escudo exclusivamente cuando el usuario posee membresía Piloto Pro.
   */
  public async setShieldModeEnabled(
    userId: string,
    enabled: boolean,
    userEmail?: string | null
  ): Promise<UserMembershipStatusDto> {
    const current = await this.getMembershipByUserId(userId, userEmail);
    if (!current.isPro) {
      return current;
    }

    return this.upsertStoredRecord({
      userId,
      plan: "PRO",
      billingCycle: current.billingCycle,
      shieldModeEnabled: Boolean(enabled),
    });
  }
}

export const prismaMembershipRepository = new PrismaMembershipRepository();

