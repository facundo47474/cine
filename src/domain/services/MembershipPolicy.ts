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

/**
 * Construye el DTO de membresía y permisos efectivos a partir del plan contratado.
 * Regla de negocio: los usuarios `PRO` tienen el Modo Escudo siempre activo; en `FREE` nunca existe protección.
 */
export function construirEstadoMembresia(params: {
  plan: MembershipPlan;
  billingCycle?: BillingCycle;
  shieldModeEnabled?: boolean;
  updatedAt?: Date | string;
}): UserMembershipStatusDto {
  const isPro = params.plan === "PRO";
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

  const resolvedDate =
    params.updatedAt instanceof Date
      ? params.updatedAt.toISOString()
      : params.updatedAt || new Date().toISOString();

  return {
    plan: isPro ? "PRO" : "FREE",
    billingCycle: params.billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY",
    shieldModeEnabled: effectiveShieldEnabled,
    isPro,
    isModoEscudoActive: isPro && effectiveShieldEnabled,
    entitlements,
    updatedAt: resolvedDate,
  };
}

