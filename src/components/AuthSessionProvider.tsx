"use client";

import React from "react";
import { SessionProvider } from "next-auth/react";

/**
 * Proveedor global de sesión de NextAuth para envolver la jerarquía de componentes cliente.
 */
export default function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
