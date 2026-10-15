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
  // Coordonnées du compte qui reçoit les virements (ex : compte Deblock). Jamais dans le code.
  BANK_ACCOUNT_HOLDER: z.string().trim().max(100).optional().default(""),
  BANK_IBAN: z
    .string()
    .optional()
    .default("")
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine((v) => v === "" || isValidIban(v), "BANK_IBAN invalide"),
  BANK_BIC: z.string().trim().toUpperCase().regex(/^([A-Z0-9]{8}|[A-Z0-9]{11})?$/, "BANK_BIC invalide").optional().default(""),
  // Emails (séparés par des virgules) autorisés à confirmer les virements reçus.
  ADMIN_EMAILS: z
    .string()
    .optional()
    .default("")
    .transform((v) => v.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)),
});

export type Env = z.infer<typeof schema>;

/** Contrôle ISO 13616 (modulo 97) : évite d'afficher un IBAN mal recopié aux clients. */
export function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  // Sur Vercel, APP_URL peut être omis : on prend le domaine de production fourni par la plateforme.
  const source = { ...process.env };
  if (!source.APP_URL && source.VERCEL_PROJECT_PRODUCTION_URL) source.APP_URL = `https://${source.VERCEL_PROJECT_PRODUCTION_URL}`;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuration invalide : ${issues}`);
  }
  const e = parsed.data;
  if (e.MAIL_PROVIDER === "mailgun" && (!e.MAILGUN_API_KEY || !e.MAILGUN_WEBHOOK_SIGNING_KEY)) {
    throw new Error("MAIL_PROVIDER=mailgun exige MAILGUN_API_KEY et MAILGUN_WEBHOOK_SIGNING_KEY");
  }
  cached = e;
  return e;
}

/** Réservé aux tests. */
export function resetEnvCache() {
  cached = null;
}
