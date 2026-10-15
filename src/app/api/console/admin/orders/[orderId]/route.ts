import { z } from "zod";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { requireSessionUser } from "@/lib/request-auth";
import { confirmOrder, rejectOrder, requireAdmin } from "@/lib/billing";

const schema = z.object({ action: z.enum(["confirm", "reject"]) });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const admin = await requireSessionUser(req);
  requireAdmin(admin);
  const { orderId } = await ctx.params;
  const { action } = schema.parse(await readJson(req, 1_000));
  if (action === "confirm") {
    const { expires } = await confirmOrder(admin, orderId, clientIp(req));
    return json({ ok: true, planExpiresAt: expires.toISOString() });
  }
  await rejectOrder(admin, orderId, clientIp(req));
  return json({ ok: true });
});
