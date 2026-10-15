import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { randomToken, sha256 } from "./crypto";
import { HttpError } from "./http";
import { refreshPlan } from "./billing";

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

export function sessionCookieName() {
  // Préfixe __Host- en production : cookie lié à l'hôte, Secure, Path=/, sans Domain.
  return env().NODE_ENV === "production" ? "__Host-ancre_session" : "ancre_session";
}

export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: { id: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 200) },
  });
  const jar = await cookies();
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(sessionCookieName());
}

export async function userFromSessionToken(token: string | undefined): Promise<User | null> {
  if (!token || token.length > 100) return null;
  const session = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return refreshPlan(session.user);
}

/** Utilisateur courant (pages serveur). */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return userFromSessionToken(jar.get(sessionCookieName())?.value);
}

/**
 * Anti-CSRF pour les requêtes authentifiées par cookie qui modifient l'état :
 * l'en-tête Origin (ou à défaut Referer) doit correspondre exactement à APP_URL.
 * Combiné à SameSite=Lax, cela bloque les soumissions inter-sites.
 */
export function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const expected = new URL(env().APP_URL).origin;
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== expected) throw new HttpError(403, "csrf_rejected", "Origine non autorisée");
    return;
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin === expected) return;
    } catch {
      /* referer invalide */
    }
  }
  throw new HttpError(403, "csrf_rejected", "Origine manquante");
}
