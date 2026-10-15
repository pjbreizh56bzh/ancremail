import { z } from "zod";
import { handle, json, readJson } from "@/lib/http";
import { requireSessionUser } from "@/lib/request-auth";
import { createCheckout } from "@/lib/billing";

const schema = z.object({ plan: z.enum(["PRO", "SCALE"]) });

export const POST = handle(async (req: Request) => {
  const user = await requireSessionUser(req);
  const { plan } = schema.parse(await readJson(req, 1_000));
  return json({ url: await createCheckout(user, plan) });
});
