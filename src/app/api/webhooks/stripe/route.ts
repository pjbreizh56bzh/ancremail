import type Stripe from "stripe";
import { env } from "@/lib/env";
import { handle, HttpError, json } from "@/lib/http";
import { handleStripeEvent, stripe } from "@/lib/billing";

export const POST = handle(async (req: Request) => {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, "billing_disabled", "Webhook Stripe non configuré");
  const signature = req.headers.get("stripe-signature");
  if (!signature) throw new HttpError(400, "invalid_signature", "Signature manquante");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch {
    throw new HttpError(400, "invalid_signature", "Signature invalide");
  }
  return json({ received: true, ...(await handleStripeEvent(event)) });
});
