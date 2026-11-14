import { getServerSession } from "next-auth";
import { authOptions } from "./authOptions";

/**
 * Obtiene el identificador de usuario autenticado (`userId`) desde la sesión activa de NextAuth.
 * Centraliza el acceso tipado a `session.user.id` para evitar casts repetitivos en rutas API y Server Actions.
 *
 * @returns El `userId` (UUID en PostgreSQL) si el usuario tiene sesión activa, o `undefined` si no está autenticado.
 */
export async function getAuthenticatedUserId(): Promise<string | undefined> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id;
}
