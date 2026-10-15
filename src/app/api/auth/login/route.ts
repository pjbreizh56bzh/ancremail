import { assertSameOrigin, createSession } from "@/lib/auth";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { login } from "@/lib/users";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  enforceRateLimit(`login:${ip}`, 10, 60_000);
  const body = await readJson(req, 10_000);
  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email.toLowerCase() : "";
  enforceRateLimit(`login-email:${email}`, 5, 60_000);
  const user = await login(body, ip);
  await createSession(user.id, req.headers.get("user-agent"));
  return json({ ok: true });
});
