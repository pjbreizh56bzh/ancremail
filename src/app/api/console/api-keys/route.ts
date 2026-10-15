import { db } from "@/lib/db";
import { clientIp, handle, HttpError, json, readJson } from "@/lib/http";
import { requireSessionUser } from "@/lib/request-auth";
import { generateApiKey, MAX_KEYS_PER_USER } from "@/lib/api-keys";
import { createApiKeySchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const GET = handle(async (req: Request) => {
  const user = await requireSessionUser(req);
  const keys = await db.apiKey.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, expiresAt: true },
  });
  return json({ data: keys });
});

export const POST = handle(async (req: Request) => {
  const user = await requireSessionUser(req);
  const { name, expiresInDays } = createApiKeySchema.parse(await readJson(req, 10_000));
  const active = await db.apiKey.count({ where: { userId: user.id, revokedAt: null } });
  if (active >= MAX_KEYS_PER_USER) throw new HttpError(400, "too_many_keys", `${MAX_KEYS_PER_USER} clés actives maximum`);
  const { key, prefix, hash } = generateApiKey();
  const record = await db.apiKey.create({
    data: {
      userId: user.id,
      name,
      prefix,
      keyHash: hash,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400_000) : null,
    },
  });
  await audit(user.id, "api_key.create", `${name} (${prefix}…)`, clientIp(req));
  // La clé complète n'est renvoyée qu'ici, une seule fois.
  return json({ id: record.id, name, prefix, key, expiresAt: record.expiresAt }, 201);
});
