import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "../database/prismaClient";
import { welcomeEmailService } from "../notifications/WelcomeEmailService";

/**
 * Valida si una dirección de correo electrónico está permitida según la lista blanca
 * configurada en `process.env.ALLOWED_EMAILS` (separada por comas).
 * Si `ALLOWED_EMAILS` no está definida, permite el acceso a cualquier cuenta de Google válida.
 *
 * @param email Correo electrónico del usuario autenticado por Google.
 * @returns `true` si el correo tiene permiso de acceso.
 */
function isEmailAuthorizedByAllowlist(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const rawAllowedEmails = process.env.ALLOWED_EMAILS?.trim();

  if (!rawAllowedEmails) {
    return true;
  }

  const allowedEmailsList = rawAllowedEmails
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (allowedEmailsList.length === 0) {
    return true;
  }

  return allowedEmailsList.includes(normalizedEmail);
}

/**
 * Configuración central de NextAuth.js con proveedor Google OAuth 2.0,
 * estrategia de sesión basada en JWT (30 días) y sincronización automática con PostgreSQL.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  secret:
    process.env.NEXTAUTH_SECRET ||
    process.env.STREAM_TOKEN_SECRET ||
    "piloto_default_nextauth_secret_2026",
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  },
  callbacks: {
    /**
     * Valida la lista blanca de correos, registra nuevos usuarios en PostgreSQL
     * disparando el correo de bienvenida y actualiza `lastLoginAt` en inicios posteriores.
     */
    async signIn({ user, account }) {
      if (!user.email) return false;

      if (!isEmailAuthorizedByAllowlist(user.email)) {
        console.warn(
          `[NextAuth signIn] Acceso denegado para correo fuera de ALLOWED_EMAILS: ${user.email.trim().toLowerCase()}`
        );
        return false;
      }

      try {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (!existingUser) {
          await prisma.user.create({
            data: {
              email: user.email,
              name: user.name ?? "Usuario",
              avatarUrl: user.image ?? null,
              googleId: account?.providerAccountId ?? null,
              lastLoginAt: new Date(),
            },
          });

          void welcomeEmailService.sendWelcomeEmail({
            toEmail: user.email,
            userName: user.name,
          });
        } else {
          await prisma.user.update({
            where: { email: user.email },
            data: {
              name: user.name ?? undefined,
              avatarUrl: user.image ?? undefined,
              googleId: account?.providerAccountId ?? undefined,
              lastLoginAt: new Date(),
            },
          });
        }

        return true;
      } catch (error) {
        console.error("[NextAuth signIn] Error registrando usuario:", error);
        return false;
      }
    },

    /**
     * Adjunta el UUID interno del usuario (`userId`) dentro del token JWT.
     */
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
        });
        if (dbUser) {
          token.userId = dbUser.id;
        }
      }
      return token;
    },

    /**
     * Propaga el `userId` del token JWT hacia el objeto `session.user` accesible en cliente y servidor.
     */
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as { id?: string }).id = String(token.userId);
      }
      return session;
    },
  },
};
