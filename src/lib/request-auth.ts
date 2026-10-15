import type { User } from "@prisma/client";
import { cookies } from "next/headers";
import { assertSameOrigin, sessionCookieName, userFromSessionToken } from "./auth";
import { findUserByApiKey } from "./api-keys";
import { HttpError } from "./http";
import { enforceRateLimit } from "./rate-limit";
import { PLANS } from "./plans";

export type AuthContext = { user: User; via: "api_key" | "session"; apiKeyId?: string };

/**
 * Authentifie une requête de l'API v1 : clé API (Authorization: Bearer amk_...) ou
 * cookie de session (console web, avec contrôle d'origine anti-CSRF).
 * Applique le quota de débit du plan.
 */
export async function authenticate(req: Request): Promise<AuthContext> {
  const header = req.headers.get("authorization");
  let ctx: AuthContext | null = null;

  if (header) {
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    const found = match ? await findUserByApiKey(match[1]) : null;
    if (!found) throw new HttpError(401, "unauthorized", "Clé API invalide, expirée ou révoquée");
    ctx = { user: found.user, via: "api_key", apiKeyId: found.apiKeyId };
  } else {
    const jar = await cookies();
    const user = await userFromSessionToken(jar.get(sessionCookieName())?.value);
    if (!user) throw new HttpError(401, "unauthorized", "Authentification requise");
    assertSameOrigin(req);
    ctx = { user, via: "session" };
  }

  const plan = PLANS[ctx.user.plan];
  enforceRateLimit(`api:${ctx.apiKeyId ?? ctx.user.id}`, plan.apiRequestsPerMinute, 60_000);
  return ctx;
}

/** Pour les routes console (clés API, facturation) : session obligatoire + anti-CSRF. */
export async function requireSessionUser(req: Request): Promise<User> {
  const jar = await cookies();
  const user = await userFromSessionToken(jar.get(sessionCookieName())?.value);
  if (!user) throw new HttpError(401, "unauthorized", "Authentification requise");
  assertSameOrigin(req);
  return user;
}
