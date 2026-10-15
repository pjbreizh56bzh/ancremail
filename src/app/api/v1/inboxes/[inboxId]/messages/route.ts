import { handle, json, readJson } from "@/lib/http";
import { authenticate } from "@/lib/request-auth";
import { listMessages, sendMessage, serializeMessage } from "@/lib/inboxes";

type Ctx = { params: Promise<{ inboxId: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { user } = await authenticate(req);
  const { inboxId } = await ctx.params;
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return json(await listMessages(user.id, inboxId, params));
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { user } = await authenticate(req);
  const { inboxId } = await ctx.params;
  const body = await readJson(req, 2_000_000);
  const { message, replayed } = await sendMessage(user, inboxId, body, req.headers.get("idempotency-key"));
  return json(serializeMessage(message), replayed ? 200 : 201, replayed ? { "Idempotent-Replayed": "true" } : undefined);
});
