import { z } from "zod";

// Validation stricte de la configuration au démarrage : une variable manquante
// ou mal formée fait échouer tôt plutôt que de créer une faille silencieuse.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  MAIL_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/i, "MAIL_DOMAIN invalide"),
  MAIL_PROVIDER: z.enum(["mock", "mailgun"]).default("mock"),
  MAILGUN_API_KEY: z.string().optional().default(""),
  MAILGUN_BASE_URL: z.string().url().default("https://api.eu.mailgun.net"),
  MAILGUN_WEBHOOK_SIGNING_KEY: z.string().optional().default(""),
  INBOUND_WEBHOOK_SECRET: z.string().min(32, "INBOUND_WEBHOOK_SECRET doit faire 32 caractères minimum"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  STRIPE_PRICE_PRO: z.string().optional().default(""),
  STRIPE_PRICE_SCALE: z.string().optional().default(""),
  ALLOW_LIVE_PAYMENTS: z.enum(["true", "false"]).default("false"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuration invalide : ${issues}`);
  }
  const e = parsed.data;
  if (e.MAIL_PROVIDER === "mailgun" && (!e.MAILGUN_API_KEY || !e.MAILGUN_WEBHOOK_SIGNING_KEY)) {
    throw new Error("MAIL_PROVIDER=mailgun exige MAILGUN_API_KEY et MAILGUN_WEBHOOK_SIGNING_KEY");
  }
  if (e.STRIPE_SECRET_KEY.startsWith("sk_live_") && e.ALLOW_LIVE_PAYMENTS !== "true") {
    throw new Error("Clé Stripe live refusée : passez ALLOW_LIVE_PAYMENTS=true volontairement pour l'activer");
  }
  cached = e;
  return e;
}

/** Réservé aux tests. */
export function resetEnvCache() {
  cached = null;
}
