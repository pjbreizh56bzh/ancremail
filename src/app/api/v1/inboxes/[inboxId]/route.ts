import { clientIp, handle, json } from "@/lib/http";
import { authenticate } from "@/lib/request-auth";
import { deleteInbox, getOwnedInbox, serializeInbox } from "@/lib/inboxes";

type Ctx = { params: Promise<{ inboxId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { user } = await authenticate(req);
  const { inboxId } = await ctx.params;
  return json(serializeInbox(await getOwnedInbox(user.id, inboxId)));
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { user } = await authenticate(req);
  const { inboxId } = await ctx.params;
  await deleteInbox(user.id, inboxId, clientIp(req));
  return new Response(null, { status: 204 });
});
