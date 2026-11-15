"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2, Rocket, X } from "lucide-react";
import { CatalogCardDto } from "@/application/dto/CatalogFeedDto";
import {
  BillingCycle,
  construirEstadoMembresia,
  FREE_MY_LIST_LIMIT,
  ProFeatureKey,
  UserMembershipStatusDto,
} from "@/domain/services/MembershipPolicy";
import type { EmailDispatchResult } from "@/infrastructure/notifications/WelcomeEmailService";
import PilotoProModal from "@/components/PilotoProModal";

interface MembershipContextValue {
  membership: UserMembershipStatusDto;
  isPro: boolean;
  isModoEscudoActive: boolean;
  loadingMembership: boolean;
  lastEmailNotification: EmailDispatchResult | null;
  isSendingEmail: boolean;
  myList: CatalogCardDto[];
  isInMyList: (mediaId: string) => boolean;
  toggleMyListItem: (item: CatalogCardDto) => boolean;
  openUpgradeModal: (feature?: ProFeatureKey) => void;
  closeUpgradeModal: () => void;
  upgradeToPro: (cycle?: BillingCycle) => Promise<void>;
  downgradeToFree: () => Promise<void>;
  toggleModoEscudo: (enabled: boolean) => Promise<void>;
  resendSubscriptionEmail: () => Promise<void>;
  refreshMembership: () => Promise<void>;
}

const DEFAULT_FREE_MEMBERSHIP = construirEstadoMembresia({ plan: "FREE" });

const MembershipContext = createContext<MembershipContextValue | null>(null);

function getMyListStorageKey(userId?: string | null): string {
  return `piloto_mylist_${userId || "guest"}`;
}

/**
 * Proveedor global de membresía Piloto Pro, Modo Escudo y colección "Mi Lista".
 */
export function MembershipProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status: sessionStatus } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const isAuthenticated = sessionStatus === "authenticated" && Boolean(session?.user);

  const [membership, setMembership] = useState<UserMembershipStatusDto>(
    DEFAULT_FREE_MEMBERSHIP
  );
  const [loadingMembership, setLoadingMembership] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [requestedFeature, setRequestedFeature] =
    useState<ProFeatureKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [resolvedUserEmail, setResolvedUserEmail] = useState<string | null>(
    null
  );
  const [lastEmailNotification, setLastEmailNotification] =
    useState<EmailDispatchResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showPaymentThankYou, setShowPaymentThankYou] =
    useState<boolean>(false);
  const [myList, setMyList] = useState<CatalogCardDto[]>([]);
  const activeUserEmail = resolvedUserEmail || session?.user?.email || null;

  const refreshMembership = useCallback(async () => {
    setLoadingMembership(true);
    try {
      const response = await fetch("/api/subscription", { cache: "no-store" });
      const data = await response.json();
      if (response.ok && data.ok && data.membership) {
        setMembership(data.membership as UserMembershipStatusDto);
        setResolvedUserEmail(
          typeof data.userEmail === "string" ? data.userEmail : null
        );
      } else {
        setMembership(DEFAULT_FREE_MEMBERSHIP);
        setResolvedUserEmail(null);
      }
    } catch {
      setMembership(DEFAULT_FREE_MEMBERSHIP);
    } finally {
      setLoadingMembership(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    void refreshMembership();
  }, [sessionStatus, userId, refreshMembership]);

  // Procesa el retorno desde MercadoPago Checkout Pro (?mp_status=approved|pending|failure)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const mpStatus = url.searchParams.get("mp_status");
    if (!mpStatus) return;

    const mpParamsToClean = [
      "mp_status",
      "payment_id",
      "collection_id",
      "collection_status",
      "status",
      "preference_id",
      "external_reference",
      "payment_type",
      "merchant_order_id",
      "processing_mode",
      "site_id",
    ];
    for (const param of mpParamsToClean) {
      url.searchParams.delete(param);
    }
    const cleanRelativeUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", cleanRelativeUrl);

    if (mpStatus === "approved") {
      setActionError(null);
      setShowPaymentThankYou(true);
      void refreshMembership();
    } else if (mpStatus === "pending") {
      setActionError(
        "Tu pago con MercadoPago está pendiente de acreditación. Apenas se confirme se activará Piloto Pro automáticamente."
      );
      setIsModalOpen(true);
    } else {
      setActionError(
        "El pago con MercadoPago no se completó o fue cancelado. Podés intentarlo nuevamente cuando quieras."
      );
      setIsModalOpen(true);
    }
  }, [refreshMembership]);

  // Carga la colección "Mi Lista" persistida por usuario en localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedRaw = localStorage.getItem(getMyListStorageKey(userId));
      if (!storedRaw) {
        setMyList([]);
        return;
      }
      const parsed = JSON.parse(storedRaw) as unknown;
      setMyList(Array.isArray(parsed) ? (parsed as CatalogCardDto[]) : []);
    } catch {
      setMyList([]);
    }
  }, [userId]);

  const persistMyList = useCallback(
    (nextItems: CatalogCardDto[]) => {
      setMyList(nextItems);
      try {
        localStorage.setItem(
          getMyListStorageKey(userId),
          JSON.stringify(nextItems)
        );
      } catch {
        // Silencioso si localStorage no está disponible
      }
    },
    [userId]
  );

  const openUpgradeModal = useCallback((feature?: ProFeatureKey) => {
    setActionError(null);
    setRequestedFeature(feature ?? null);
    setIsModalOpen(true);
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setIsModalOpen(false);
    setActionError(null);
    setLastEmailNotification(null);
  }, []);

  const executeSubscriptionMutation = useCallback(
    async (
      payload: Record<string, unknown>,
      options: {
        closeOnSuccess?: boolean;
        trackAsEmailAction?: boolean;
        fallbackError?: string;
      } = {}
    ) => {
      const {
        closeOnSuccess = false,
        trackAsEmailAction = false,
        fallbackError = "No se pudo actualizar tu membresía Piloto Pro.",
      } = options;
      const setBusy = trackAsEmailAction ? setIsSendingEmail : setIsSubmitting;

      setBusy(true);
      setActionError(null);
      if (
        trackAsEmailAction ||
        payload.action === "UPGRADE_PRO" ||
        payload.action === "CREATE_CHECKOUT"
      ) {
        setLastEmailNotification(null);
      }

      try {
        const response = await fetch("/api/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (
          response.ok &&
          data.ok &&
          typeof data.checkoutUrl === "string" &&
          data.checkoutUrl
        ) {
          window.location.href = data.checkoutUrl;
          return;
        }
        if (!response.ok || !data.ok || !data.membership) {
          setActionError(data.error || fallbackError);
          return;
        }
        setMembership(data.membership as UserMembershipStatusDto);
        if (typeof data.userEmail === "string") {
          setResolvedUserEmail(data.userEmail);
        }
        if (data.emailNotification) {
          setLastEmailNotification(
            data.emailNotification as EmailDispatchResult
          );
        } else if (payload.action === "DOWNGRADE_FREE") {
          setLastEmailNotification(null);
        }
        if (closeOnSuccess) {
          setIsModalOpen(false);
        }
      } catch {
        setActionError("Error de conexión al comunicarse con el servidor.");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const upgradeToPro = useCallback(
    async (cycle: BillingCycle = "MONTHLY") => {
      await executeSubscriptionMutation(
        { action: "CREATE_CHECKOUT", billingCycle: cycle },
        { closeOnSuccess: false }
      );
    },
    [executeSubscriptionMutation]
  );

  const downgradeToFree = useCallback(async () => {
    await executeSubscriptionMutation({ action: "DOWNGRADE_FREE" });
  }, [executeSubscriptionMutation]);

  const toggleModoEscudo = useCallback(
    async (enabled: boolean) => {
      if (!membership.isPro) {
        openUpgradeModal("modo_escudo");
        return;
      }
      await executeSubscriptionMutation({
        action: "TOGGLE_SHIELD_MODE",
        enabled,
      });
    },
    [membership.isPro, openUpgradeModal, executeSubscriptionMutation]
  );

  const resendSubscriptionEmail = useCallback(async () => {
    await executeSubscriptionMutation(
      { action: "RESEND_RECEIPT_EMAIL" },
      {
        trackAsEmailAction: true,
        fallbackError: "No se pudo enviar el correo de agradecimiento.",
      }
    );
  }, [executeSubscriptionMutation]);

  const isInMyList = useCallback(
    (mediaId: string) => myList.some((item) => item.id === mediaId),
    [myList]
  );

  const toggleMyListItem = useCallback(
    (item: CatalogCardDto): boolean => {
      const exists = myList.some((entry) => entry.id === item.id);
      if (exists) {
        persistMyList(myList.filter((entry) => entry.id !== item.id));
        return false;
      }

      if (
        !membership.entitlements.hasUnlimitedMyList &&
        myList.length >= FREE_MY_LIST_LIMIT
      ) {
        openUpgradeModal("mi_lista");
        return false;
      }

      persistMyList([item, ...myList]);
      return true;
    },
    [
      myList,
      membership.entitlements.hasUnlimitedMyList,
      persistMyList,
      openUpgradeModal,
    ]
  );

  const value = useMemo<MembershipContextValue>(
    () => ({
      membership,
      isPro: membership.isPro,
      isModoEscudoActive: membership.isModoEscudoActive,
      loadingMembership,
      lastEmailNotification,
      isSendingEmail,
      myList,
      isInMyList,
      toggleMyListItem,
      openUpgradeModal,
      closeUpgradeModal,
      upgradeToPro,
      downgradeToFree,
      toggleModoEscudo,
      resendSubscriptionEmail,
      refreshMembership,
    }),
    [
      membership,
      loadingMembership,
      lastEmailNotification,
      isSendingEmail,
      myList,
      isInMyList,
      toggleMyListItem,
      openUpgradeModal,
      closeUpgradeModal,
      upgradeToPro,
      downgradeToFree,
      toggleModoEscudo,
      resendSubscriptionEmail,
      refreshMembership,
    ]
  );

  return (
    <MembershipContext.Provider value={value}>
      {children}
      <PilotoProModal
        isOpen={isModalOpen}
        onClose={closeUpgradeModal}
        requestedFeature={requestedFeature}
        membership={membership}
        isSubmitting={isSubmitting}
        errorMessage={actionError}
        isAuthenticated={isAuthenticated}
        onUpgrade={upgradeToPro}
        onDowngrade={downgradeToFree}
      />

      {showPaymentThankYou && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 right-4 sm:right-8 left-4 sm:left-auto z-[70] sm:max-w-md rounded-2xl bg-white text-slate-900 border border-slate-200 p-5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              {session?.user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name || "Foto de perfil"}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500 shadow-sm flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-emerald-100 border-2 border-emerald-500 flex items-center justify-center text-base font-extrabold text-emerald-700 flex-shrink-0 shadow-sm">
                  {(session?.user?.name || activeUserEmail || "P")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}

              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Pago aprobado • Piloto activo</span>
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 truncate mt-1">
                  ¡Gracias por suscribirte, {session?.user?.name || "Piloto"}!
                </h3>
                {activeUserEmail && (
                  <p className="text-xs text-slate-500 truncate">
                    {activeUserEmail}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPaymentThankYou(false)}
              aria-label="Cerrar mensaje de agradecimiento"
              title="Cerrar"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="mt-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
            Tu suscripción mensual de{" "}
            <span className="font-bold text-slate-900">$ 2.500/mes</span> fue
            confirmada correctamente. Ya tenés el{" "}
            <span className="font-semibold text-emerald-700">Modo Escudo</span>{" "}
            y todas las funciones de Piloto activadas.
          </p>

          <button
            type="button"
            onClick={() => setShowPaymentThankYou(false)}
            className="mt-4 w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm transition inline-flex items-center justify-center gap-2"
          >
            <Rocket className="w-4 h-4" />
            <span>¡Comenzar a disfrutar!</span>
          </button>
        </div>
      )}
    </MembershipContext.Provider>
  );
}

/**
 * Hook cliente para consultar permisos de Piloto Pro, Modo Escudo y Mi Lista.
 */
export function useMembership(): MembershipContextValue {
  const ctx = useContext(MembershipContext);
  if (!ctx) {
    return {
      membership: DEFAULT_FREE_MEMBERSHIP,
      isPro: false,
      isModoEscudoActive: false,
      loadingMembership: false,
      lastEmailNotification: null,
      isSendingEmail: false,
      myList: [],
      isInMyList: () => false,
      toggleMyListItem: () => false,
      openUpgradeModal: () => {},
      closeUpgradeModal: () => {},
      upgradeToPro: async () => {},
      downgradeToFree: async () => {},
      toggleModoEscudo: async () => {},
      resendSubscriptionEmail: async () => {},
      refreshMembership: async () => {},
    };
  }
  return ctx;
}

