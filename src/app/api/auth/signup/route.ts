import { assertSameOrigin, createSession } from "@/lib/auth";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { signup } from "@/lib/users";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  enforceRateLimit(`signup:${ip}`, 5, 3600_000);
  const user = await signup(await readJson(req, 10_000), ip);
  await createSession(user.id, req.headers.get("user-agent"));
  return json({ ok: true }, 201);
});
