import { handle, json, HttpError } from "@/lib/http";
import { requireSessionUser } from "@/lib/request-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/users";

export const POST = handle(async (req: Request) => {
  const user = await requireSessionUser(req);
  if (user.emailVerifiedAt) throw new HttpError(400, "already_verified", "Email déjà vérifié");
  enforceRateLimit(`resend:${user.id}`, 3, 3600_000);
  await sendVerificationEmail(user.id, user.email);
  return json({ ok: true });
});
