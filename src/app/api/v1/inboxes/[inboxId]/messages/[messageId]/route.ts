import { handle, json } from "@/lib/http";
import { authenticate } from "@/lib/request-auth";
import { getMessage, serializeMessage } from "@/lib/inboxes";

type Ctx = { params: Promise<{ inboxId: string; messageId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { user } = await authenticate(req);
  const { inboxId, messageId } = await ctx.params;
  return json(serializeMessage(await getMessage(user.id, inboxId, messageId)));
});
