"use client";

import React from "react";
import Link from "next/link";
import {
  BookmarkCheck,
  Cast,
  Check,
  Cloud,
  CreditCard,
  FastForward,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  BillingCycle,
  PRO_FEATURES_CATALOG,
  ProFeatureKey,
  UserMembershipStatusDto,
} from "@/domain/services/MembershipPolicy";

interface PilotoProModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestedFeature?: ProFeatureKey | null;
  membership: UserMembershipStatusDto;
  isSubmitting: boolean;
  errorMessage?: string | null;
  isAuthenticated: boolean;
  onUpgrade: (cycle: BillingCycle) => Promise<void>;
  onDowngrade: () => Promise<void>;
}

const FEATURE_ICON_MAP: Record<
  ProFeatureKey,
  React.ComponentType<{ className?: string }>
> = {
  modo_escudo: ShieldCheck,
  transmitir_tv: Cast,
  modo_maraton: FastForward,
  cloud_sync: Cloud,
  mi_lista: BookmarkCheck,
};

const MONTHLY_PRICE_LABEL = "$ 2.500";

/**
 * Modal de suscripción Piloto Pro.
 * Diseño editorial en fondo blanco con controles en verde, orientado a plan mensual único de $2.500 ARS.
 */
export default function PilotoProModal({
  isOpen,
  onClose,
  requestedFeature,
  membership,
  isSubmitting,
  errorMessage,
  isAuthenticated,
  onUpgrade,
  onDowngrade,
}: PilotoProModalProps) {
  if (!isOpen) return null;

  const highlightedFeature =
    PRO_FEATURES_CATALOG.find((item) => item.key === requestedFeature) ||
    PRO_FEATURES_CATALOG[0];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="piloto-pro-modal-title"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-3xl max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Cabecera limpia en blanco */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-7 sm:py-5 border-b border-slate-200 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                {membership.isPro
                  ? "Suscripción Piloto Pro • Activa"
                  : "Piloto Pro • Plan Mensual"}
              </p>
              <h2
                id="piloto-pro-modal-title"
                className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 leading-snug"
              >
                {membership.isPro
                  ? "Tu cuenta Piloto Pro"
                  : `Activá ${highlightedFeature.title} con Piloto Pro`}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-7 space-y-5">
          {errorMessage && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs sm:text-sm text-red-700 flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!isAuthenticated ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-6 text-center space-y-4">
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-900">
                  Iniciá sesión para continuar
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Necesitás vincular tu cuenta de Google para habilitar{" "}
                  <strong className="text-slate-900">Piloto Pro</strong>, el{" "}
                  <strong className="text-slate-900">Modo Escudo</strong> y
                  sincronizar tu historial en todos tus dispositivos.
                </p>
              </div>
              <Link
                href="/login"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition shadow-sm"
              >
                Ingresar con Google
              </Link>
            </div>
          ) : membership.isPro ? (
            <div className="space-y-5">
              {/* Resumen de prestaciones incluidas */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Herramientas habilitadas en tu cuenta
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PRO_FEATURES_CATALOG.map((feature) => {
                    const Icon = FEATURE_ICON_MAP[feature.key];
                    return (
                      <div
                        key={feature.key}
                        className="rounded-xl bg-white border border-slate-200 p-3.5 flex items-start gap-3"
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-50 text-emerald-700">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900">
                            {feature.title}
                          </p>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                            {feature.proDetail}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
                <span>
                  Suscripción actual:{" "}
                  <strong className="text-slate-900">
                    Piloto Pro ({MONTHLY_PRICE_LABEL} ARS / mes)
                  </strong>
                </span>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void onDowngrade()}
                  className="text-left sm:text-right font-semibold text-slate-500 hover:text-red-600 underline underline-offset-4 transition disabled:opacity-50"
                >
                  Cambiar a Plan Gratuito
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              {/* Columna izquierda: detalle de funcionalidades */}
              <div className="md:col-span-7 space-y-3">
                <div className="space-y-2">
                  {PRO_FEATURES_CATALOG.map((feature) => {
                    const Icon = FEATURE_ICON_MAP[feature.key];
                    const isHighlighted = feature.key === requestedFeature;
                    return (
                      <div
                        key={feature.key}
                        className={`rounded-xl p-3 border transition ${
                          isHighlighted
                            ? "bg-emerald-50/60 border-emerald-300"
                            : "bg-slate-50/70 border-slate-200"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 text-emerald-700">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs sm:text-sm font-bold text-slate-900">
                                {feature.title}
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                                {feature.badge}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[11px]">
                              <span className="text-slate-500">
                                Gratis: {feature.freeDetail}
                              </span>
                              <span className="text-emerald-700 font-semibold">
                                Pro: {feature.proDetail}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Columna derecha: tarjeta de suscripción mensual única */}
              <div className="md:col-span-5 rounded-2xl bg-slate-50 border border-slate-200 p-5 space-y-5">
                <div className="space-y-1">
                  <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-md">
                    Suscripción Mensual
                  </span>
                  <h3 className="text-lg font-extrabold text-slate-900 pt-1">
                    Piloto Pro
                  </h3>
                  <p className="text-xs text-slate-600">
                    Acceso completo al Modo Escudo, transmisión a TV y
                    sincronización Cloud.
                  </p>
                </div>

                <div className="pt-3 pb-3 border-y border-slate-200">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black tracking-tight text-slate-900 tabular-nums">
                      {MONTHLY_PRICE_LABEL}
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      ARS / mes
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Pesos argentinos finales • Renovación mensual cancelable
                  </p>
                </div>

                <ul className="space-y-2 text-xs text-slate-700">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Modo Escudo con nuestro propio reproductor</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Chromecast / AirPlay directo del video</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Saltar intro y autoplay en series</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Historial Cloud y Mi Lista sin límites</span>
                  </li>
                </ul>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void onUpgrade("MONTHLY")}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4" />
                    )}
                    <span>Pagar con MercadoPago • {MONTHLY_PRICE_LABEL}/mes</span>
                  </button>

                  <p className="text-[11px] text-center text-slate-500 leading-snug">
                    Cobro en pesos mediante{" "}
                    <strong className="text-slate-700">MercadoPago</strong>. El
                    catálogo es gratuito; pagás únicamente por las herramientas
                    del reproductor y la nube.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
