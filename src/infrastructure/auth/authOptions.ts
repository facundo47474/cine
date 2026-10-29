import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "../database/prismaClient";

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

      try {
        await prisma.user.upsert({
          where: { email: user.email },
          update: {
            name: user.name ?? undefined,
            avatarUrl: user.image ?? undefined,
            googleId: account?.providerAccountId ?? undefined,
            lastLoginAt: new Date(),
          },
          create: {
            email: user.email,
            name: user.name ?? "Usuario",
            avatarUrl: user.image ?? null,
            googleId: account?.providerAccountId ?? null,
            lastLoginAt: new Date(),
          },
        });
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

