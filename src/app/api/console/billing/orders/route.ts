import { z } from "zod";
import { db } from "@/lib/db";
import { handle, json, readJson } from "@/lib/http";
import { requireSessionUser } from "@/lib/request-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createOrder, serializeOrder } from "@/lib/billing";

const schema = z.object({ plan: z.enum(["PRO", "SCALE"]), months: z.number().int().min(1).max(12).default(1) });

export const GET = handle(async (req: Request) => {
  const user = await requireSessionUser(req);
  const orders = await db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return json({ data: orders.map(serializeOrder) });
});

export const POST = handle(async (req: Request) => {
  const user = await requireSessionUser(req);
  enforceRateLimit(`order:${user.id}`, 10, 3600_000);
  const { plan, months } = schema.parse(await readJson(req, 1_000));
  return json(serializeOrder(await createOrder(user, plan, months)), 201);
});
