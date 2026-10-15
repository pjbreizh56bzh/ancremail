import { handle, json } from "@/lib/http";
import { authenticate } from "@/lib/request-auth";
import { PLANS } from "@/lib/plans";
import { usage } from "@/lib/inboxes";

export const GET = handle(async (req: Request) => {
  const { user } = await authenticate(req);
  const plan = PLANS[user.plan];
  return json({
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    plan: { id: plan.id, name: plan.name, maxInboxes: plan.maxInboxes, monthlySends: plan.monthlySends },
    usage: await usage(user.id),
  });
});
