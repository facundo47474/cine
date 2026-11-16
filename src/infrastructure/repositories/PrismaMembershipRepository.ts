import { prisma } from "@/infrastructure/database/prismaClient";
import {
  BillingCycle,
  construirEstadoMembresia,
  MembershipPlan,
  MONTHLY_SUBSCRIPTION_DURATION_MS,
  UserMembershipStatusDto,
} from "@/domain/services/MembershipPolicy";

interface StoredMembershipRecord {
  userId: string;
  userEmail?: string | null;
  paymentId?: string | null;
  plan: MembershipPlan;
  billingCycle: BillingCycle;
  shieldModeEnabled: boolean;
  updatedAt: Date;
  expiresAt: Date | null;
}

const memoryMembershipFallback = new Map<string, StoredMembershipRecord>();

function normalizeEmail(email?: string | null): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

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
              "userEmail" TEXT,
              "paymentId" TEXT,
              "plan" TEXT NOT NULL DEFAULT 'FREE',
              "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
              "shieldModeEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
              "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              "expiresAt" TIMESTAMPTZ
            );
          `);
          await prisma.$executeRawUnsafe(`
            ALTER TABLE "UserMembership"
            ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;
          `);
          await prisma.$executeRawUnsafe(`
            ALTER TABLE "UserMembership"
            ADD COLUMN IF NOT EXISTS "userEmail" TEXT;
          `);
          await prisma.$executeRawUnsafe(`
            ALTER TABLE "UserMembership"
            ADD COLUMN IF NOT EXISTS "paymentId" TEXT;
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

  /**
   * Verifica si un `paymentId` de MercadoPago ya fue reclamado por otra cuenta de usuario diferente.
   */
  public async isPaymentAlreadyClaimedByAnotherUser(
    paymentId: string,
    userId: string
  ): Promise<boolean> {
    const cleanPaymentId = String(paymentId || "").trim();
    if (!cleanPaymentId || !userId) {
      return false;
    }

    const dbAvailable = await this.ensureMembershipTable();
    if (dbAvailable) {
      try {
        const rows = await prisma.$queryRaw<Array<{ userId: string }>>`
          SELECT "userId"
          FROM "UserMembership"
          WHERE "paymentId" = ${cleanPaymentId}
            AND "userId" <> ${userId}
          LIMIT 1
        `;
        if (rows.length > 0) {
          return true;
        }
      } catch (error) {
        console.warn(
          "[PrismaMembershipRepository] Error verificando paymentId reclamado:",
          error
        );
      }
    }

    let claimedInMemory = false;
    memoryMembershipFallback.forEach((entry) => {
      if (entry.paymentId === cleanPaymentId && entry.userId !== userId) {
        claimedInMemory = true;
      }
    });
    return claimedInMemory;
  }

  private async resolveEmailForUser(
    userId: string,
    explicitEmail?: string | null
  ): Promise<string | null> {
    const normalized = normalizeEmail(explicitEmail);
    if (normalized) {
      return normalized;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return normalizeEmail(user?.email);
    } catch {
      return null;
    }
  }

  private async readStoredRecord(
    userId: string,
    userEmail?: string | null
  ): Promise<StoredMembershipRecord | null> {
    const normalizedEmail = normalizeEmail(userEmail);
    const dbAvailable = await this.ensureMembershipTable();
    if (dbAvailable) {
      try {
        const rows = normalizedEmail
          ? await prisma.$queryRaw<
              Array<{
                userId: string;
                userEmail: string | null;
                paymentId: string | null;
                plan: string;
                billingCycle: string;
                shieldModeEnabled: boolean;
                updatedAt: Date;
                expiresAt: Date | null;
              }>
            >`
              SELECT "userId", "userEmail", "paymentId", "plan", "billingCycle", "shieldModeEnabled", "updatedAt", "expiresAt"
              FROM "UserMembership"
              WHERE "userId" = ${userId}
                 OR LOWER("userEmail") = ${normalizedEmail}
              ORDER BY CASE WHEN "plan" = 'PRO' THEN 0 ELSE 1 END, "updatedAt" DESC
              LIMIT 1
            `
          : await prisma.$queryRaw<
              Array<{
                userId: string;
                userEmail: string | null;
                paymentId: string | null;
                plan: string;
                billingCycle: string;
                shieldModeEnabled: boolean;
                updatedAt: Date;
                expiresAt: Date | null;
              }>
            >`
              SELECT "userId", "userEmail", "paymentId", "plan", "billingCycle", "shieldModeEnabled", "updatedAt", "expiresAt"
              FROM "UserMembership"
              WHERE "userId" = ${userId}
              LIMIT 1
            `;

        const row = rows[0];
        if (row) {
          const normalizedUpdatedAt =
            row.updatedAt instanceof Date
              ? row.updatedAt
              : new Date(row.updatedAt);
          const normalizedPlan: MembershipPlan =
            row.plan === "PRO" ? "PRO" : "FREE";
          let normalizedExpiresAt: Date | null = row.expiresAt
            ? row.expiresAt instanceof Date
              ? row.expiresAt
              : new Date(row.expiresAt)
            : null;
          if (normalizedPlan === "PRO" && !normalizedExpiresAt) {
            normalizedExpiresAt = new Date(
              normalizedUpdatedAt.getTime() + MONTHLY_SUBSCRIPTION_DURATION_MS
            );
          }

          const normalized: StoredMembershipRecord = {
            userId: row.userId,
            userEmail: normalizeEmail(row.userEmail) || normalizedEmail,
            paymentId: row.paymentId ?? null,
            plan: normalizedPlan,
            billingCycle: row.billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
            shieldModeEnabled: Boolean(row.shieldModeEnabled),
            updatedAt: normalizedUpdatedAt,
            expiresAt: normalizedExpiresAt,
          };
          memoryMembershipFallback.set(row.userId, normalized);
          return normalized;
        }
      } catch (error) {
        console.warn(
          "[PrismaMembershipRepository] Error consultando membresía en PostgreSQL:",
          error
        );
      }
    }

    const byId = memoryMembershipFallback.get(userId);
    if (byId) return byId;

    if (normalizedEmail) {
      let emailMatch: StoredMembershipRecord | null = null;
      memoryMembershipFallback.forEach((entry) => {
        if (normalizeEmail(entry.userEmail) === normalizedEmail) {
          if (!emailMatch || entry.plan === "PRO") {
            emailMatch = entry;
          }
        }
      });
      if (emailMatch) return emailMatch;
    }

    return null;
  }

  private async upsertStoredRecord(record: {
    userId: string;
    userEmail?: string | null;
    paymentId?: string | null;
    plan: MembershipPlan;
    billingCycle: BillingCycle;
    shieldModeEnabled: boolean;
    activatedAt?: Date;
    expiresAt?: Date | null;
  }): Promise<UserMembershipStatusDto> {
    const now = record.activatedAt ? new Date(record.activatedAt) : new Date();
    const resolvedEmail = await this.resolveEmailForUser(
      record.userId,
      record.userEmail
    );
    const resolvedPaymentId =
      record.plan === "FREE" ? null : (record.paymentId ?? null);
    const nextRecord: StoredMembershipRecord = {
      userId: record.userId,
      userEmail: resolvedEmail,
      paymentId: resolvedPaymentId,
      plan: record.plan,
      billingCycle: record.billingCycle,
      shieldModeEnabled: record.shieldModeEnabled,
      updatedAt: now,
      expiresAt: record.expiresAt ?? null,
    };

    memoryMembershipFallback.set(record.userId, nextRecord);

    const dbAvailable = await this.ensureMembershipTable();
    if (dbAvailable) {
      try {
        await prisma.$executeRaw`
          INSERT INTO "UserMembership" ("userId", "userEmail", "paymentId", "plan", "billingCycle", "shieldModeEnabled", "updatedAt", "expiresAt")
          VALUES (${nextRecord.userId}, ${nextRecord.userEmail ?? null}, ${nextRecord.paymentId ?? null}, ${nextRecord.plan}, ${nextRecord.billingCycle}, ${nextRecord.shieldModeEnabled}, ${now}, ${nextRecord.expiresAt})
          ON CONFLICT ("userId")
          DO UPDATE SET
            "userEmail" = COALESCE(EXCLUDED."userEmail", "UserMembership"."userEmail"),
            "paymentId" = CASE
              WHEN EXCLUDED."plan" = 'FREE' THEN NULL
              ELSE COALESCE(EXCLUDED."paymentId", "UserMembership"."paymentId")
            END,
            "plan" = EXCLUDED."plan",
            "billingCycle" = EXCLUDED."billingCycle",
            "shieldModeEnabled" = EXCLUDED."shieldModeEnabled",
            "updatedAt" = EXCLUDED."updatedAt",
            "expiresAt" = EXCLUDED."expiresAt"
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
   * Obtiene el estado de membresía y permisos del usuario buscando por `userId` y correo de Google (`userEmail`).
   * Si pertenece a `PRO_EMAILS` y no tiene registro previo, lo inicializa automáticamente como usuario Pro.
   * Si la suscripción mensual de 30 días venció, revierte la cuenta a `FREE` automáticamente.
   */
  public async getMembershipByUserId(
    userId: string,
    userEmail?: string | null
  ): Promise<UserMembershipStatusDto> {
    if (!userId && !userEmail) {
      return construirEstadoMembresia({ plan: "FREE" });
    }

    const existing = await this.readStoredRecord(userId, userEmail);
    if (existing) {
      const evaluated = construirEstadoMembresia(existing);
      if (existing.plan === "PRO" && evaluated.isExpired) {
        if (isVipEmailByEnv(userEmail || existing.userEmail)) {
          return this.activateProMembership(
            userId || existing.userId,
            "ANNUAL",
            undefined,
            userEmail || existing.userEmail
          );
        }
        return this.upsertStoredRecord({
          userId: existing.userId,
          userEmail: userEmail || existing.userEmail,
          paymentId: null,
          plan: "FREE",
          billingCycle: "MONTHLY",
          shieldModeEnabled: false,
          expiresAt: existing.expiresAt,
        });
      }
      return evaluated;
    }

    if (isVipEmailByEnv(userEmail) && userId) {
      return this.activateProMembership(userId, "ANNUAL", undefined, userEmail);
    }

    return construirEstadoMembresia({ plan: "FREE" });
  }

  /**
   * Activa la suscripción Piloto Pro habilitando el Modo Escudo durante 30 días desde `activatedAt`.
   */
  public async activateProMembership(
    userId: string,
    billingCycle: BillingCycle = "MONTHLY",
    activatedAt?: Date,
    userEmail?: string | null,
    paymentId?: string | null
  ): Promise<UserMembershipStatusDto> {
    const start = activatedAt ? new Date(activatedAt) : new Date();
    const expiresAt = new Date(
      start.getTime() + MONTHLY_SUBSCRIPTION_DURATION_MS
    );

    return this.upsertStoredRecord({
      userId,
      userEmail,
      paymentId: paymentId ?? null,
      plan: "PRO",
      billingCycle: billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
      shieldModeEnabled: true,
      activatedAt: start,
      expiresAt,
    });
  }

  /**
   * Revierte la cuenta al plan gratuito estándar desactivando el Modo Escudo y las herramientas Pro.
   */
  public async downgradeToFreeMembership(
    userId: string,
    userEmail?: string | null
  ): Promise<UserMembershipStatusDto> {
    return this.upsertStoredRecord({
      userId,
      userEmail,
      paymentId: null,
      plan: "FREE",
      billingCycle: "MONTHLY",
      shieldModeEnabled: false,
      expiresAt: null,
    });
  }

  /**
   * Activa o pausa el Modo Escudo exclusivamente cuando el usuario posee membresía Piloto Pro vigente.
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
      userEmail,
      plan: "PRO",
      billingCycle: current.billingCycle,
      shieldModeEnabled: Boolean(enabled),
      activatedAt: current.activatedAt
        ? new Date(current.activatedAt)
        : undefined,
      expiresAt: current.expiresAt ? new Date(current.expiresAt) : null,
    });
  }
}

export const prismaMembershipRepository = new PrismaMembershipRepository();

