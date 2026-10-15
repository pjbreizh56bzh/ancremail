import { db } from "@/lib/db";
import { json } from "@/lib/http";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return json({ status: "ok" });
  } catch (error) {
    // Visible dans les journaux de l'hébergeur ; le client ne reçoit aucun détail.
    console.error("health: base de données injoignable", (error as Error).message);
    return json({ status: "degraded" }, 503);
  }
}
