import { db } from "@/lib/db";
import { clientIp, handle, HttpError } from "@/lib/http";
import { requireSessionUser } from "@/lib/request-auth";
import { audit } from "@/lib/audit";

export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ keyId: string }> }) => {
  const user = await requireSessionUser(req);
  const { keyId } = await ctx.params;
  const res = await db.apiKey.updateMany({
    where: { id: keyId.slice(0, 64), userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) throw new HttpError(404, "not_found", "Clé introuvable");
  await audit(user.id, "api_key.revoke", keyId, clientIp(req));
  return new Response(null, { status: 204 });
});
