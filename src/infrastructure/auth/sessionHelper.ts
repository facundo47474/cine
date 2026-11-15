import { getServerSession } from "next-auth";
import { authOptions } from "./authOptions";
import { prisma } from "../database/prismaClient";

export interface AuthenticatedUserSession {
  userId: string;
  email?: string | null;
  name?: string | null;
}

/**
 * Obtiene el identificador de usuario, correo y nombre autenticado desde la sesión activa de NextAuth,
 * respaldado con PostgreSQL para garantizar la disponibilidad del correo del inicio de sesión.
 */
export async function getAuthenticatedUserSession(): Promise<
  AuthenticatedUserSession | undefined
> {
  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  const sessionEmail = session?.user?.email?.trim() || null;
  const sessionName = session?.user?.name?.trim() || null;

  if (!sessionUserId && !sessionEmail) return undefined;

  try {
    let dbUser = sessionUserId
      ? await prisma.user.findUnique({ where: { id: sessionUserId } })
      : null;

    if (
      sessionEmail &&
      (!dbUser ||
        dbUser.email.trim().toLowerCase() !== sessionEmail.toLowerCase())
    ) {
      const userByEmail = await prisma.user.findFirst({
        where: {
          email: {
            equals: sessionEmail,
            mode: "insensitive",
          },
        },
      });
      if (userByEmail) {
        dbUser = userByEmail;
      }
    }

    if (!dbUser && sessionEmail) {
      try {
        dbUser = await prisma.user.create({
          data: {
            email: sessionEmail.toLowerCase(),
            name: sessionName ?? "Usuario",
            avatarUrl: session?.user?.image ?? null,
            lastLoginAt: new Date(),
          },
        });
      } catch {
        dbUser = await prisma.user.findFirst({
          where: {
            email: {
              equals: sessionEmail,
              mode: "insensitive",
            },
          },
        });
      }
    }

    if (dbUser) {
      return {
        userId: dbUser.id,
        email: sessionEmail || dbUser.email,
        name: sessionName || dbUser.name,
      };
    }
  } catch (error) {
    console.warn(
      "[sessionHelper] No se pudo consultar usuario en PostgreSQL, usando sesión JWT:",
      error
    );
  }

  if (!sessionUserId) return undefined;

  return {
    userId: sessionUserId,
    email: sessionEmail,
    name: sessionName,
  };
}

/**
 * Obtiene el identificador de usuario autenticado (`userId`) desde la sesión activa de NextAuth.
 * Centraliza el acceso tipado a `session.user.id` para evitar casts repetitivos en rutas API y Server Actions.
 *
 * @returns El `userId` (UUID en PostgreSQL) si el usuario tiene sesión activa, o `undefined` si no está autenticado.
 */
export async function getAuthenticatedUserId(): Promise<string | undefined> {
  const auth = await getAuthenticatedUserSession();
  return auth?.userId;
}
