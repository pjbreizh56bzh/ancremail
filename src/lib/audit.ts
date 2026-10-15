import { db } from "./db";

export async function audit(userId: string, action: string, detail?: string, ip?: string) {
  try {
    await db.auditLog.create({ data: { userId, action, detail: detail?.slice(0, 500), ip } });
  } catch (err) {
    // Le journal ne doit jamais faire échouer l'action principale.
    console.error("[audit] échec d'écriture", err);
  }
}
