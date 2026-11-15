"use client";

import React from "react";
import { SessionProvider } from "next-auth/react";
import { MembershipProvider } from "@/components/MembershipProvider";

/**
 * Proveedor global de sesión de NextAuth y membresía Piloto Pro para envolver la jerarquía cliente.
 */
export default function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <MembershipProvider>{children}</MembershipProvider>
    </SessionProvider>
  );
}
