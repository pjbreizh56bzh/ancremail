import { assertSameOrigin, destroySession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  await destroySession();
  return json({ ok: true });
});
