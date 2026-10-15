import Stripe from "stripe";
import type { Plan, User } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { HttpError } from "./http";
import { audit } from "./audit";

let client: Stripe | null = null;

export function stripe(): Stripe {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, "billing_disabled", "Le paiement n'est pas configuré sur ce serveur");
  client ??= new Stripe(key);
  return client;
}

/** Réservé aux tests. */
export function setStripeClient(c: Stripe | null) {
  client = c;
}

export function priceForPlan(plan: Plan): string {
  const e = env();
  const price = plan === "PRO" ? e.STRIPE_PRICE_PRO : plan === "SCALE" ? e.STRIPE_PRICE_SCALE : "";
  if (!price) throw new HttpError(400, "invalid_plan", "Plan indisponible");
  return price;
}

export function planForPrice(priceId: string | undefined | null): Plan {
  const e = env();
  if (priceId && priceId === e.STRIPE_PRICE_PRO) return "PRO";
  if (priceId && priceId === e.STRIPE_PRICE_SCALE) return "SCALE";
  return "FREE";
}

export async function createCheckout(user: User, plan: Plan) {
  if (plan === "FREE") throw new HttpError(400, "invalid_plan", "Plan invalide");
  if (user.stripeSubscriptionId && user.subscriptionStatus === "active") {
    throw new HttpError(409, "already_subscribed", "Abonnement déjà actif : utilisez le portail de facturation pour changer de plan");
  }
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceForPlan(plan), quantity: 1 }],
    client_reference_id: user.id,
    customer: user.stripeCustomerId ?? undefined,
    customer_email: user.stripeCustomerId ? undefined : user.email,
    metadata: { userId: user.id, plan },
    subscription_data: { metadata: { userId: user.id } },
    success_url: `${env().APP_URL}/dashboard/billing?status=success`,
    cancel_url: `${env().APP_URL}/dashboard/billing?status=cancel`,
  });
  if (!session.url) throw new HttpError(502, "stripe_error", "Stripe n'a pas renvoyé d'URL");
  return session.url;
}

export async function createPortal(user: User) {
  if (!user.stripeCustomerId) throw new HttpError(400, "no_customer", "Aucun abonnement à gérer");
  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${env().APP_URL}/dashboard/billing`,
  });
  return session.url;
}

async function applySubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = sub.metadata?.userId;
  const user = userId
    ? await db.user.findUnique({ where: { id: userId } })
    : await db.user.findUnique({ where: { stripeCustomerId: customerId } });
  if (!user) return;
  const activeLike = ["active", "trialing", "past_due"].includes(sub.status);
  const plan = activeLike ? planForPrice(sub.items.data[0]?.price?.id) : "FREE";
  await db.user.update({
    where: { id: user.id },
    data: {
      plan,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.status === "canceled" ? null : sub.id,
      subscriptionStatus: sub.status,
    },
  });
  await audit(user.id, "billing.subscription", `${sub.status} -> ${plan}`);
}

/** Traite un événement Stripe déjà vérifié. Idempotent via la table StripeEvent. */
export async function handleStripeEvent(event: Stripe.Event) {
  const already = await db.stripeEvent.findUnique({ where: { id: event.id } });
  if (already) return { duplicate: true };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.client_reference_id ?? s.metadata?.userId;
      if (userId && s.subscription) {
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
        const sub = await stripe().subscriptions.retrieve(subId);
        sub.metadata = { ...sub.metadata, userId };
        await applySubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }
  await db.stripeEvent.create({ data: { id: event.id } }).catch(() => {});
  return { duplicate: false };
}
