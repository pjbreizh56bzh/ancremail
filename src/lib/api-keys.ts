import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { refreshPlan } from "./billing";

export const API_KEY_PREFIX = "amk_";
export const MAX_KEYS_PER_USER = 10;

/** Génère une clé : elle n'est montrée qu'une fois ; seule son empreinte SHA-256 est stockée. */
export function generateApiKey() {
  const key = API_KEY_PREFIX + randomToken(32);
  return { key, prefix: key.slice(0, 12), hash: sha256(key) };
}

export async function findUserByApiKey(key: string) {
  if (!key.startsWith(API_KEY_PREFIX) || key.length > 100) return null;
  const record = await db.apiKey.findUnique({ where: { keyHash: sha256(key) }, include: { user: true } });
  if (!record || record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;
  // Mise à jour de lastUsedAt au plus une fois par minute pour limiter les écritures.
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
    await db.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { user: await refreshPlan(record.user), apiKeyId: record.id };
}
