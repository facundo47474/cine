export type MembershipPlan = "FREE" | "PRO";

export type BillingCycle = "MONTHLY" | "ANNUAL";

export type ProFeatureKey =
  | "modo_escudo"
  | "transmitir_tv"
  | "modo_maraton"
  | "cloud_sync"
  | "mi_lista";

export const FREE_CONTINUE_WATCHING_LIMIT = 2;
export const FREE_MY_LIST_LIMIT = 3;
export const MONTHLY_SUBSCRIPTION_DURATION_DAYS = 30;
export const MONTHLY_SUBSCRIPTION_DURATION_MS =
  MONTHLY_SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000;

export interface MembershipEntitlements {
  canUseModoEscudo: boolean;
  canCastToTv: boolean;
  canUseMarathonMode: boolean;
  hasUnlimitedCloudSync: boolean;
  hasUnlimitedMyList: boolean;
  maxContinueWatchingItems: number;
  maxMyListItems: number;
}

export interface UserMembershipStatusDto {
  plan: MembershipPlan;
  billingCycle: BillingCycle;
  shieldModeEnabled: boolean;
  isPro: boolean;
  isModoEscudoActive: boolean;
  entitlements: MembershipEntitlements;
  updatedAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number;
  isExpired: boolean;
}

export interface ProFeatureDescriptor {
  key: ProFeatureKey;
  title: string;
  badge: string;
  summary: string;
  freeDetail: string;
  proDetail: string;
}

export const PRO_FEATURES_CATALOG: ProFeatureDescriptor[] = [
  {
    key: "modo_escudo",
    title: "Modo Escudo",
    badge: "Reproductor propio",
    summary: "Experiencia directa con nuestro propio reproductor optimizado.",
    freeDetail: "Reproductor estándar externo",
    proDetail: "Experiencia con nuestro propio reproductor",
  },
  {
    key: "transmitir_tv",
    title: "Transmitir a Smart TV",
    badge: "Chromecast y AirPlay",
    summary:
      "Envía el video directo a tu televisor con reanudación sincronizada.",
    freeDetail: "Solo disponible en pantalla local",
    proDetail: "Envío directo a Chromecast y Apple AirPlay",
  },
  {
    key: "modo_maraton",
    title: "Modo Maratón en Series",
    badge: "Saltar Intro + Autoplay",
    summary:
      "Salta automáticamente la introducción de tus capítulos y pasa al siguiente episodio sin tocar controles.",
    freeDetail: "Cambio de episodio y avance manual",
    proDetail: "Saltar intro automático y siguiente capítulo en 5s",
  },
  {
    key: "cloud_sync",
    title: "Sincronización Cloud Ilimitada",
    badge: "Continuar Viendo",
    summary:
      "Sincroniza el segundo exacto de reproducción de todas tus películas y series entre PC, celular y TV.",
    freeDetail: `Hasta ${FREE_CONTINUE_WATCHING_LIMIT} títulos recientes`,
    proDetail: "Historial ilimitado en todos tus dispositivos",
  },
  {
    key: "mi_lista",
    title: "Mi Lista Personalizada",
    badge: "Colección Guardada",
    summary:
      "Guarda y organiza todas tus películas y series pendientes sin restricciones de espacio.",
    freeDetail: `Máximo ${FREE_MY_LIST_LIMIT} títulos guardados`,
    proDetail: "Títulos ilimitados en Mi Lista",
  },
];

function parseValidDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Construye el DTO de membresía y permisos efectivos a partir del plan contratado.
 * Regla de negocio: los usuarios `PRO` tienen el Modo Escudo siempre activo durante sus 30 días vigentes;
 * al vencer la fecha de expiración (`expiresAt`), la membresía vuelve automáticamente a `FREE`.
 */
export function construirEstadoMembresia(params: {
  plan: MembershipPlan;
  billingCycle?: BillingCycle;
  shieldModeEnabled?: boolean;
  updatedAt?: Date | string;
  expiresAt?: Date | string | null;
}): UserMembershipStatusDto {
  const isRequestedPro = params.plan === "PRO";
  const resolvedUpdatedAt = parseValidDate(params.updatedAt) || new Date();

  let activatedAt: string | null = null;
  let expiresAt: string | null = null;
  let isExpired = false;
  let daysRemaining = 0;
  let isPro = false;

  if (isRequestedPro) {
    const expirationDate =
      parseValidDate(params.expiresAt) ||
      new Date(resolvedUpdatedAt.getTime() + MONTHLY_SUBSCRIPTION_DURATION_MS);
    const remainingMs = expirationDate.getTime() - Date.now();
    activatedAt = resolvedUpdatedAt.toISOString();
    expiresAt = expirationDate.toISOString();

    if (remainingMs <= 0) {
      isExpired = true;
      isPro = false;
      daysRemaining = 0;
    } else {
      isExpired = false;
      isPro = true;
      daysRemaining = Math.max(
        1,
        Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
      );
    }
  } else {
    const pastExpiration = parseValidDate(params.expiresAt);
    if (pastExpiration && pastExpiration.getTime() <= Date.now()) {
      expiresAt = pastExpiration.toISOString();
      isExpired = true;
    }
  }

  const effectiveShieldEnabled = isPro;

  const entitlements: MembershipEntitlements = {
    canUseModoEscudo: isPro,
    canCastToTv: isPro,
    canUseMarathonMode: isPro,
    hasUnlimitedCloudSync: isPro,
    hasUnlimitedMyList: isPro,
    maxContinueWatchingItems: isPro
      ? Number.MAX_SAFE_INTEGER
      : FREE_CONTINUE_WATCHING_LIMIT,
    maxMyListItems: isPro ? Number.MAX_SAFE_INTEGER : FREE_MY_LIST_LIMIT,
  };

  return {
    plan: isPro ? "PRO" : "FREE",
    billingCycle: params.billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
    shieldModeEnabled: effectiveShieldEnabled,
    isPro,
    isModoEscudoActive: isPro && effectiveShieldEnabled,
    entitlements,
    updatedAt: resolvedUpdatedAt.toISOString(),
    activatedAt,
    expiresAt,
    daysRemaining,
    isExpired,
  };
}

