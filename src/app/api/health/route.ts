import { db } from "@/lib/db";
import { json } from "@/lib/http";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return json({ status: "ok" });
  } catch {
    return json({ status: "degraded" }, 503);
  }
}
