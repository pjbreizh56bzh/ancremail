import { handle, json } from "@/lib/http";
import { requireSessionUser } from "@/lib/request-auth";
import { createPortal } from "@/lib/billing";

export const POST = handle(async (req: Request) => {
  const user = await requireSessionUser(req);
  return json({ url: await createPortal(user) });
});
