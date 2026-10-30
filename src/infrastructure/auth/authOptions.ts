import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "../database/prismaClient";
import { welcomeEmailService } from "../notifications/WelcomeEmailService";

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
    async signIn({ user, account }) {
      if (!user.email) return false;

      const normalizedEmail = user.email.trim().toLowerCase();
      const rawAllowedEmails = process.env.ALLOWED_EMAILS?.trim();

      if (rawAllowedEmails) {
        const allowedList = rawAllowedEmails
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean);

        if (allowedList.length > 0 && !allowedList.includes(normalizedEmail)) {
          console.warn(
            `[NextAuth signIn] Acceso denegado para correo fuera de ALLOWED_EMAILS: ${normalizedEmail}`
          );
          return false;
        }
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

    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as { id?: string }).id = String(token.userId);
      }
      return session;
    },
  },
};
