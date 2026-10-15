import type { Order, Plan, User } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { env } from "./env";
import { HttpError } from "./http";
import { audit } from "./audit";
import { PLANS } from "./plans";

const MAX_PENDING_ORDERS = 3;
const ORDER_TTL_DAYS = 14;
// Alphabet sans caractères ambigus (0/O, 1/I/L) pour une référence facile à recopier.
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newReference(): string {
  const bytes = randomBytes(8);
  let ref = "";
  for (const b of bytes) ref += REF_ALPHABET[b % REF_ALPHABET.length];
  return `ANCRE-${ref}`;
}

export function bankDetails() {
  const e = env();
  if (!e.BANK_IBAN || !e.BANK_ACCOUNT_HOLDER) return null;
  return { holder: e.BANK_ACCOUNT_HOLDER, iban: e.BANK_IBAN, bic: e.BANK_BIC || null };
}

export function formatIban(iban: string) {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

export function isAdmin(user: Pick<User, "email">) {
  return env().ADMIN_EMAILS.includes(user.email.toLowerCase());
}

export function requireAdmin(user: User) {
  // 404 plutôt que 403 : on ne révèle pas l'existence de l'espace d'administration.
  if (!isAdmin(user)) throw new HttpError(404, "not_found", "Introuvable");
}

/** Repasse le compte en FREE si la période payée est terminée. Appelé à chaque authentification. */
export async function refreshPlan<T extends User>(user: T): Promise<T> {
  if (user.plan !== "FREE" && user.planExpiresAt && user.planExpiresAt <= new Date()) {
    await db.user.update({ where: { id: user.id }, data: { plan: "FREE", planExpiresAt: null } });
    await audit(user.id, "billing.expired", `${user.plan} -> FREE`);
    return { ...user, plan: "FREE", planExpiresAt: null };
  }
  return user;
}

export async function createOrder(user: User, plan: Plan, months: number) {
  if (plan === "FREE") throw new HttpError(400, "invalid_plan", "Plan invalide");
  if (!bankDetails()) throw new HttpError(503, "billing_disabled", "Le paiement par virement n'est pas encore configuré");
  const pending = await db.order.count({ where: { userId: user.id, status: "PENDING" } });
  if (pending >= MAX_PENDING_ORDERS) {
    throw new HttpError(409, "too_many_pending", "Vous avez déjà des commandes en attente : réglez ou annulez-les d'abord");
  }
  const amountCents = PLANS[plan].priceEurMonthly * 100 * months;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await db.order.create({ data: { userId: user.id, plan, months, amountCents, reference: newReference() } });
      await audit(user.id, "billing.order_created", `${order.reference} ${plan} x${months}`);
      return order;
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err; // collision de référence : on réessaie
    }
  }
  throw new HttpError(500, "internal_error", "Impossible de générer une référence");
}

export async function cancelOwnOrder(user: User, orderId: string) {
  const res = await db.order.updateMany({
    where: { id: orderId.slice(0, 64), userId: user.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (res.count === 0) throw new HttpError(404, "not_found", "Commande introuvable ou déjà traitée");
  await audit(user.id, "billing.order_cancelled", orderId);
}

/** L'administrateur confirme avoir reçu le virement : le plan est activé ou prolongé. */
export async function confirmOrder(admin: User, orderId: string, ip?: string) {
  requireAdmin(admin);
  return db.$transaction(async (tx) => {
    // Passage PENDING -> PAID atomique : un double clic ne prolonge jamais deux fois.
    const res = await tx.order.updateMany({
      where: { id: orderId.slice(0, 64), status: "PENDING" },
      data: { status: "PAID", paidAt: new Date(), confirmedBy: admin.email },
    });
    if (res.count === 0) throw new HttpError(409, "not_pending", "Commande introuvable ou déjà traitée");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { user: true } });
    const now = new Date();
    const sameActivePlan = order.user.plan === order.plan && order.user.planExpiresAt && order.user.planExpiresAt > now;
    const start = sameActivePlan ? order.user.planExpiresAt! : now;
    const expires = new Date(start);
    expires.setUTCMonth(expires.getUTCMonth() + order.months);
    await tx.user.update({ where: { id: order.userId }, data: { plan: order.plan, planExpiresAt: expires } });
    await tx.auditLog.createMany({
      data: [
        { userId: order.userId, action: "billing.payment_confirmed", detail: `${order.reference} ${order.plan} jusqu'au ${expires.toISOString().slice(0, 10)}` },
        { userId: admin.id, action: "admin.payment_confirmed", detail: `${order.reference} (${order.user.email})`, ip },
      ],
    });
    return { order, expires };
  });
}

export async function rejectOrder(admin: User, orderId: string, ip?: string) {
  requireAdmin(admin);
  const res = await db.order.updateMany({ where: { id: orderId.slice(0, 64), status: "PENDING" }, data: { status: "CANCELLED", confirmedBy: admin.email } });
  if (res.count === 0) throw new HttpError(409, "not_pending", "Commande introuvable ou déjà traitée");
  await audit(admin.id, "admin.order_rejected", orderId, ip);
}

/** Annule les commandes restées sans paiement trop longtemps. */
export async function expireStaleOrders() {
  const cutoff = new Date(Date.now() - ORDER_TTL_DAYS * 86400_000);
  return db.order.updateMany({ where: { status: "PENDING", createdAt: { lt: cutoff } }, data: { status: "CANCELLED" } });
}

export function serializeOrder(o: Order) {
  return {
    id: o.id,
    plan: o.plan,
    months: o.months,
    amountEur: o.amountCents / 100,
    reference: o.reference,
    status: o.status.toLowerCase(),
    createdAt: o.createdAt.toISOString(),
    paidAt: o.paidAt?.toISOString() ?? null,
  };
}
