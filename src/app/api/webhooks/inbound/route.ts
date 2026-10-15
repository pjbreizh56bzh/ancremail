import { clientIp, handle, json } from "@/lib/http";
import { mailProvider } from "@/lib/mail";
import { receiveInbound } from "@/lib/inboxes";
import { enforceRateLimit } from "@/lib/rate-limit";

export const POST = handle(async (req: Request) => {
  enforceRateLimit(`inbound:${clientIp(req)}`, 600, 60_000);
  const mail = await mailProvider().parseInbound(req);
  return json(await receiveInbound(mail));
});
