import { handle } from "@/lib/http";
import { requireSessionUser } from "@/lib/request-auth";
import { cancelOwnOrder } from "@/lib/billing";

export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const user = await requireSessionUser(req);
  const { orderId } = await ctx.params;
  await cancelOwnOrder(user, orderId);
  return new Response(null, { status: 204 });
});
