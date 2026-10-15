import { z } from "zod";

export const RESERVED_USERNAMES = new Set([
  "abuse", "admin", "administrator", "billing", "hostmaster", "info", "mailer-daemon", "no-reply",
  "noreply", "postmaster", "root", "security", "support", "webmaster", "www",
]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("Adresse email invalide");

export const passwordSchema = z
  .string()
  .min(12, "12 caractères minimum")
  .max(128, "128 caractères maximum")
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), "Le mot de passe doit contenir des lettres et des chiffres");

export const credentialsSchema = z.object({ email: emailSchema, password: passwordSchema });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9._-]{1,38}[a-z0-9])$/, "3 à 40 caractères : lettres, chiffres, . _ -")
  .refine((u) => !/[._-]{2}/.test(u), "Pas deux séparateurs consécutifs")
  .refine((u) => !RESERVED_USERNAMES.has(u), "Ce nom est réservé");

export const createInboxSchema = z.object({
  username: usernameSchema.optional(),
  displayName: z.string().trim().max(80).optional(),
});

const addressList = z.array(emailSchema).min(1).max(50);

export const sendMessageSchema = z
  .object({
    to: z.union([emailSchema.transform((e) => [e]), addressList]),
    subject: z
      .string()
      .trim()
      .min(1)
      .max(998)
      .refine((s) => !/[\r\n]/.test(s), "Retour à la ligne interdit dans le sujet (injection d'en-tête)"),
    text: z.string().max(500_000).optional(),
    html: z.string().max(1_000_000).optional(),
  })
  .refine((m) => m.text || m.html, { message: "text ou html requis", path: ["text"] });

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(60),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(64).optional(),
});
