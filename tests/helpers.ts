import { db } from "@/lib/db";
import { generateApiKey } from "@/lib/api-keys";
import { hashPassword } from "@/lib/crypto";
import { resetRateLimits } from "@/lib/rate-limit";
import type { Plan } from "@prisma/client";

export async function resetDb() {
  resetRateLimits();
  await db.$executeRawUnsafe(
    'TRUNCATE "Message","Inbox","ApiKey","Session","VerificationToken","AuditLog","StripeEvent","User" CASCADE',
  );
}

let pwHash: string | null = null;
export async function makeUser(opts: { email?: string; verified?: boolean; plan?: Plan } = {}) {
  pwHash ??= await hashPassword("motdepasse-solide-123");
  const user = await db.user.create({
    data: {
      email: opts.email ?? `u${Math.random().toString(36).slice(2)}@exemple.fr`,
      passwordHash: pwHash,
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      plan: opts.plan ?? "FREE",
    },
  });
  const { key, prefix, hash } = generateApiKey();
  await db.apiKey.create({ data: { userId: user.id, name: "test", prefix, keyHash: hash } });
  return { user, key };
}

export function req(url: string, init: { method?: string; key?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.key) headers.authorization = `Bearer ${init.key}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost:3000${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? (typeof init.body === "string" ? init.body : JSON.stringify(init.body)) : undefined,
  });
}

export const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
