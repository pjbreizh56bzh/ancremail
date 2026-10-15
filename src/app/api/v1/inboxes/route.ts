import { clientIp, handle, json, readJson } from "@/lib/http";
import { authenticate } from "@/lib/request-auth";
import { createInbox, listInboxes, serializeInbox } from "@/lib/inboxes";

export const GET = handle(async (req: Request) => {
  const { user } = await authenticate(req);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return json(await listInboxes(user.id, params));
});

export const POST = handle(async (req: Request) => {
  const { user } = await authenticate(req);
  const inbox = await createInbox(user, await readJson(req, 10_000), clientIp(req));
  return json(serializeInbox(inbox), 201);
});
