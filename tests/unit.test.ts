import { describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { createInboxSchema, credentialsSchema, sendMessageSchema } from "@/lib/validation";
import { signInbound, verifyInboundSignature } from "@/lib/mail/mock";
import { MailgunProvider } from "@/lib/mail/mailgun";
import { hmacSha256Hex } from "@/lib/crypto";
import { env, isValidIban, resetEnvCache } from "@/lib/env";
import { newReference } from "@/lib/billing";
import { generateApiKey } from "@/lib/api-keys";

describe("mots de passe", () => {
  it("hache et vérifie, rejette un mauvais mot de passe", async () => {
    const h = await hashPassword("correct horse 123");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse 123", h)).toBe(true);
    expect(await verifyPassword("correct horse 124", h)).toBe(false);
  });
  it("deux hachages du même mot de passe diffèrent (sel aléatoire)", async () => {
    expect(await hashPassword("abc123abc123")).not.toBe(await hashPassword("abc123abc123"));
  });
  it("rejette un hash mal formé", async () => {
    expect(await verifyPassword("x", "md5$abc")).toBe(false);
  });
});

describe("limitation de débit", () => {
  it("bloque au-delà de la limite puis libère après la fenêtre", () => {
    resetRateLimits();
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t + i).ok).toBe(true);
    const blocked = rateLimit("k", 3, 1000, t + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(rateLimit("k", 3, 1000, t + 1001).ok).toBe(true);
  });
});

describe("validation", () => {
  it("refuse les noms réservés et invalides", () => {
    expect(createInboxSchema.safeParse({ username: "postmaster" }).success).toBe(false);
    expect(createInboxSchema.safeParse({ username: "ab" }).success).toBe(false);
    expect(createInboxSchema.safeParse({ username: "a..b" }).success).toBe(false);
    expect(createInboxSchema.safeParse({ username: "../etc" }).success).toBe(false);
    expect(createInboxSchema.safeParse({ username: "Agent.Ventes-01" }).data?.username).toBe("agent.ventes-01");
  });
  it("bloque l'injection d'en-tête dans le sujet", () => {
    const r = sendMessageSchema.safeParse({ to: "a@b.fr", subject: "Salut\r\nBcc: victime@x.fr", text: "x" });
    expect(r.success).toBe(false);
  });
  it("exige text ou html et des destinataires valides", () => {
    expect(sendMessageSchema.safeParse({ to: "a@b.fr", subject: "s" }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ to: "pas-un-email", subject: "s", text: "t" }).success).toBe(false);
    expect(sendMessageSchema.parse({ to: "A@B.fr", subject: "s", text: "t" }).to).toEqual(["a@b.fr"]);
  });
  it("politique de mot de passe", () => {
    expect(credentialsSchema.safeParse({ email: "a@b.fr", password: "court1" }).success).toBe(false);
    expect(credentialsSchema.safeParse({ email: "a@b.fr", password: "toutenlettres" }).success).toBe(false);
    expect(credentialsSchema.safeParse({ email: "a@b.fr", password: "bonmotdepasse42" }).success).toBe(true);
  });
});

describe("clés API", () => {
  it("format et unicité", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^amk_[A-Za-z0-9_-]{43}$/);
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).not.toContain(a.key);
  });
});

describe("signature du webhook entrant", () => {
  const secret = "s".repeat(40);
  it("accepte une signature valide et récente", () => {
    const body = '{"a":1}';
    expect(verifyInboundSignature(secret, body, signInbound(secret, body))).toBe(true);
  });
  it("refuse un corps modifié, un mauvais secret ou une signature périmée", () => {
    const body = '{"a":1}';
    expect(verifyInboundSignature(secret, '{"a":2}', signInbound(secret, body))).toBe(false);
    expect(verifyInboundSignature("x".repeat(40), body, signInbound(secret, body))).toBe(false);
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyInboundSignature(secret, body, signInbound(secret, body, old))).toBe(false);
    expect(verifyInboundSignature(secret, body, null)).toBe(false);
    expect(verifyInboundSignature(secret, body, "t=abc,v1=")).toBe(false);
  });
});

describe("adaptateur Mailgun", () => {
  const opts = { apiKey: "key-test", baseUrl: "https://api.eu.mailgun.net", domain: "agents.test", signingKey: "sign-key" };

  it("envoie via l'API HTTP avec authentification Basic", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "<abc@agents.test>" }), { status: 200 }));
    const mg = new MailgunProvider(opts, fetchMock as unknown as typeof fetch);
    const r = await mg.send({ from: "bot@agents.test", fromName: 'Bot "<x>"', to: ["a@b.fr"], subject: "s", text: "t" });
    expect(r.providerMessageId).toBe("<abc@agents.test>");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.eu.mailgun.net/v3/agents.test/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Basic " + Buffer.from("api:key-test").toString("base64"));
    expect((init.body as FormData).get("from")).toBe("Bot x <bot@agents.test>");
  });

  it("remonte une erreur si Mailgun refuse", async () => {
    const mg = new MailgunProvider(opts, (async () => new Response("no", { status: 401 })) as unknown as typeof fetch);
    await expect(mg.send({ from: "a@agents.test", to: ["b@c.fr"], subject: "s", text: "t" })).rejects.toThrow();
  });

  it("vérifie la signature des webhooks entrants", async () => {
    const mg = new MailgunProvider(opts);
    const ts = String(Math.floor(Date.now() / 1000));
    const token = "tok123";
    const signature = hmacSha256Hex("sign-key", ts + token);
    const form = new FormData();
    Object.entries({ timestamp: ts, token, signature, recipient: "Bot@agents.test", sender: "x@y.fr", subject: "Hi", "body-plain": "Yo", "Message-Id": "<m1>" })
      .forEach(([k, v]) => form.set(k, v));
    const parsed = await mg.parseInbound(new Request("http://x", { method: "POST", body: form }));
    expect(parsed.recipient).toBe("bot@agents.test");
    expect(parsed.text).toBe("Yo");

    form.set("signature", "0".repeat(64));
    await expect(mg.parseInbound(new Request("http://x", { method: "POST", body: form }))).rejects.toThrow("Signature invalide");
  });
});

describe("configuration bancaire", () => {
  it("valide les IBAN (modulo 97) et refuse une faute de frappe", () => {
    expect(isValidIban("FR7630006000011234567890189")).toBe(true);
    expect(isValidIban("FR7630006000011234567890188")).toBe(false);
    expect(isValidIban("pas-un-iban")).toBe(false);
  });
  it("normalise l'IBAN de la configuration et refuse un IBAN invalide au démarrage", () => {
    expect(env().BANK_IBAN).toBe("FR7630006000011234567890189");
    const prev = process.env.BANK_IBAN;
    process.env.BANK_IBAN = "FR7630006000011234567890188";
    resetEnvCache();
    expect(() => env()).toThrow(/BANK_IBAN/);
    process.env.BANK_IBAN = prev;
    resetEnvCache();
  });
  it("génère des références lisibles et uniques", () => {
    const refs = new Set(Array.from({ length: 500 }, () => newReference()));
    expect(refs.size).toBe(500);
    for (const r of refs) expect(r).toMatch(/^ANCRE-[2-9A-HJKMNP-Z]{8}$/);
  });
});
