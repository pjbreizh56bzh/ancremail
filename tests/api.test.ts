import { beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { ctx, makeUser, req, resetDb } from "./helpers";
import * as inboxesRoute from "@/app/api/v1/inboxes/route";
import * as inboxRoute from "@/app/api/v1/inboxes/[inboxId]/route";
import * as messagesRoute from "@/app/api/v1/inboxes/[inboxId]/messages/route";
import * as messageRoute from "@/app/api/v1/inboxes/[inboxId]/messages/[messageId]/route";
import * as meRoute from "@/app/api/v1/me/route";
import * as inboundRoute from "@/app/api/webhooks/inbound/route";
import * as stripeRoute from "@/app/api/webhooks/stripe/route";
import { signInbound, sentMockMails } from "@/lib/mail/mock";
import { login, signup, verifyEmail } from "@/lib/users";
import { handleStripeEvent, setStripeClient } from "@/lib/billing";

const SECRET = "test-inbound-secret-0123456789abcdef0123";

async function createInbox(key: string, body: unknown = {}) {
  return inboxesRoute.POST(req("/api/v1/inboxes", { method: "POST", key, body }));
}

beforeEach(async () => {
  await resetDb();
  sentMockMails.length = 0;
});

describe("authentification API", () => {
  it("401 sans clé, avec une clé inconnue, révoquée ou expirée", async () => {
    const { user, key } = await makeUser();
    expect((await meRoute.GET(req("/api/v1/me", { key: "amk_inconnue" }))).status).toBe(401);
    expect((await meRoute.GET(req("/api/v1/me", { headers: { authorization: "Basic abc" } }))).status).toBe(401);
    expect((await meRoute.GET(req("/api/v1/me", { key }))).status).toBe(200);

    await db.apiKey.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await meRoute.GET(req("/api/v1/me", { key }))).status).toBe(401);
    await db.apiKey.updateMany({ where: { userId: user.id }, data: { expiresAt: null, revokedAt: new Date() } });
    expect((await meRoute.GET(req("/api/v1/me", { key }))).status).toBe(401);
  });

  it("ne stocke jamais la clé en clair", async () => {
    const { key } = await makeUser();
    const rows = await db.apiKey.findMany();
    expect(JSON.stringify(rows)).not.toContain(key);
  });
});

describe("boîtes mail", () => {
  it("crée, liste, lit et supprime une boîte", async () => {
    const { key } = await makeUser();
    const res = await createInbox(key, { username: "support-bot", displayName: "Support" });
    expect(res.status).toBe(201);
    const inbox = await res.json();
    expect(inbox.address).toBe("support-bot@agents.test");

    const list = await (await inboxesRoute.GET(req("/api/v1/inboxes", { key }))).json();
    expect(list.data).toHaveLength(1);

    expect((await inboxRoute.GET(req(`/api/v1/inboxes/${inbox.id}`, { key }), ctx({ inboxId: inbox.id }))).status).toBe(200);
    expect((await inboxRoute.DELETE(req(`/api/v1/inboxes/${inbox.id}`, { method: "DELETE", key }), ctx({ inboxId: inbox.id }))).status).toBe(204);
    expect((await inboxRoute.GET(req(`/api/v1/inboxes/${inbox.id}`, { key }), ctx({ inboxId: inbox.id }))).status).toBe(404);
  });

  it("une adresse supprimée n'est jamais réattribuée", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const inbox = await (await createInbox(a.key, { username: "recyclage" })).json();
    await inboxRoute.DELETE(req(`/x`, { method: "DELETE", key: a.key }), ctx({ inboxId: inbox.id }));
    const res = await createInbox(b.key, { username: "recyclage" });
    expect(res.status).toBe(409);
  });

  it("isole les comptes (pas d'accès aux boîtes d'autrui : anti-IDOR)", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const inbox = await (await createInbox(a.key)).json();
    expect((await inboxRoute.GET(req("/x", { key: b.key }), ctx({ inboxId: inbox.id }))).status).toBe(404);
    expect((await inboxRoute.DELETE(req("/x", { method: "DELETE", key: b.key }), ctx({ inboxId: inbox.id }))).status).toBe(404);
    expect((await messagesRoute.GET(req("/x", { key: b.key }), ctx({ inboxId: inbox.id }))).status).toBe(404);
    const list = await (await inboxesRoute.GET(req("/api/v1/inboxes", { key: b.key }))).json();
    expect(list.data).toHaveLength(0);
  });

  it("applique le quota du plan gratuit (3 boîtes)", async () => {
    const { key } = await makeUser();
    for (let i = 0; i < 3; i++) expect((await createInbox(key)).status).toBe(201);
    const res = await createInbox(key);
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("quota_exceeded");
  });

  it("valide les entrées et renvoie 400 propre", async () => {
    const { key } = await makeUser();
    expect((await createInbox(key, { username: "admin" })).status).toBe(400);
    const bad = await inboxesRoute.POST(req("/api/v1/inboxes", { method: "POST", key, body: "{pas du json" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("invalid_json");
  });

  it("pagine avec un curseur", async () => {
    const { key } = await makeUser({ plan: "PRO" });
    for (let i = 0; i < 5; i++) await createInbox(key);
    const p1 = await (await inboxesRoute.GET(req("/api/v1/inboxes?limit=2", { key }))).json();
    expect(p1.data).toHaveLength(2);
    const p2 = await (await inboxesRoute.GET(req(`/api/v1/inboxes?limit=2&cursor=${p1.nextCursor}`, { key }))).json();
    const p3 = await (await inboxesRoute.GET(req(`/api/v1/inboxes?limit=2&cursor=${p2.nextCursor}`, { key }))).json();
    const ids = [...p1.data, ...p2.data, ...p3.data].map((i: { id: string }) => i.id);
    expect(new Set(ids).size).toBe(5);
    expect(p3.nextCursor).toBeNull();
  });
});

describe("envoi de messages", () => {
  it("refuse l'envoi tant que l'email du compte n'est pas vérifié", async () => {
    const { key } = await makeUser({ verified: false });
    const inbox = await (await createInbox(key)).json();
    const res = await messagesRoute.POST(
      req("/x", { method: "POST", key, body: { to: "a@b.fr", subject: "s", text: "t" } }),
      ctx({ inboxId: inbox.id }),
    );
    expect(res.status).toBe(403);
    expect(sentMockMails).toHaveLength(0);
  });

  it("envoie, et l'Idempotency-Key évite les doublons", async () => {
    const { key } = await makeUser();
    const inbox = await (await createInbox(key, { username: "ventes" })).json();
    const send = () =>
      messagesRoute.POST(
        req("/x", { method: "POST", key, body: { to: ["Client@Exemple.fr"], subject: "Devis", text: "Bonjour" }, headers: { "idempotency-key": "k1" } }),
        ctx({ inboxId: inbox.id }),
      );
    const r1 = await send();
    expect(r1.status).toBe(201);
    const m1 = await r1.json();
    expect(m1.status).toBe("sent");
    expect(m1.from).toBe("ventes@agents.test");
    expect(m1.to).toEqual(["client@exemple.fr"]);
    const r2 = await send();
    expect(r2.status).toBe(200);
    expect(r2.headers.get("Idempotent-Replayed")).toBe("true");
    expect((await r2.json()).id).toBe(m1.id);
    expect(sentMockMails).toHaveLength(1);
  });

  it("applique le quota mensuel d'envois", async () => {
    const { key } = await makeUser();
    const inbox = await (await createInbox(key)).json();
    await db.message.createMany({
      data: Array.from({ length: 100 }, () => ({
        inboxId: inbox.id, direction: "OUTBOUND" as const, status: "SENT" as const, fromAddress: inbox.address, toAddresses: ["x@y.fr"], subject: "s",
      })),
    });
    const res = await messagesRoute.POST(req("/x", { method: "POST", key, body: { to: "a@b.fr", subject: "s", text: "t" } }), ctx({ inboxId: inbox.id }));
    expect(res.status).toBe(402);
  });

  it("marque le message en échec si le fournisseur refuse", async () => {
    const { setMailProvider } = await import("@/lib/mail");
    setMailProvider({ name: "ko", send: async () => { throw new Error("down"); }, parseInbound: async () => { throw new Error(); } });
    try {
      const { key } = await makeUser();
      const inbox = await (await createInbox(key)).json();
      const res = await messagesRoute.POST(req("/x", { method: "POST", key, body: { to: "a@b.fr", subject: "s", text: "t" } }), ctx({ inboxId: inbox.id }));
      expect(res.status).toBe(502);
      const msg = await db.message.findFirstOrThrow({ where: { inboxId: inbox.id } });
      expect(msg.status).toBe("FAILED");
    } finally {
      setMailProvider(null);
    }
  });
});

describe("réception (webhook entrant)", () => {
  function inbound(payload: unknown, sign = true) {
    const body = JSON.stringify(payload);
    return inboundRoute.POST(
      new Request("http://localhost:3000/api/webhooks/inbound", {
        method: "POST",
        headers: sign ? { "x-ancre-signature": signInbound(SECRET, body) } : {},
        body,
      }),
    );
  }

  it("stocke un message entrant signé, ignore les doublons, et le rend lisible", async () => {
    const { key } = await makeUser();
    const inbox = await (await createInbox(key, { username: "reception" })).json();
    const payload = { recipient: "Reception@agents.test", from: "Alice <alice@x.fr>", subject: "Code 123456", text: "Votre code", messageId: "<id-1@x.fr>" };
    const r1 = await (await inbound(payload)).json();
    expect(r1.accepted).toBe(true);
    const r2 = await (await inbound(payload)).json();
    expect(r2.duplicate).toBe(true);

    const list = await (await messagesRoute.GET(req("/x", { key }), ctx({ inboxId: inbox.id }))).json();
    expect(list.data).toHaveLength(1);
    expect(list.data[0].subject).toBe("Code 123456");
    expect(list.data[0].readAt).toBeNull();

    const read = await (await messageRoute.GET(req("/x", { key }), ctx({ inboxId: inbox.id, messageId: list.data[0].id }))).json();
    expect(read.readAt).not.toBeNull();
  });

  it("rejette une signature absente ou fausse", async () => {
    expect((await inbound({ recipient: "a@agents.test", from: "x@y.fr" }, false)).status).toBe(401);
  });

  it("n'accepte rien pour une boîte supprimée ou inconnue", async () => {
    const { key } = await makeUser();
    const inbox = await (await createInbox(key, { username: "fermee" })).json();
    await inboxRoute.DELETE(req("/x", { method: "DELETE", key }), ctx({ inboxId: inbox.id }));
    expect((await (await inbound({ recipient: "fermee@agents.test", from: "x@y.fr" })).json()).accepted).toBe(false);
    expect((await (await inbound({ recipient: "personne@agents.test", from: "x@y.fr" })).json()).accepted).toBe(false);
    expect(await db.message.count()).toBe(0);
  });
});

describe("comptes", () => {
  it("inscription, doublon refusé, vérification d'email", async () => {
    const user = await signup({ email: "Jean@Exemple.fr", password: "motdepasse-solide-123" });
    expect(user.email).toBe("jean@exemple.fr");
    expect(user.emailVerifiedAt).toBeNull();
    await expect(signup({ email: "jean@exemple.fr", password: "motdepasse-solide-123" })).rejects.toMatchObject({ status: 409 });

    const mail = sentMockMails.find((m) => m.to[0] === "jean@exemple.fr");
    const token = /token=([^\s]+)/.exec(mail!.text!)![1];
    expect(await verifyEmail(decodeURIComponent(token))).toBe(true);
    expect(await verifyEmail(decodeURIComponent(token))).toBe(false); // usage unique
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull();
  });

  it("verrouille le compte après 5 échecs de connexion", async () => {
    await signup({ email: "cible@exemple.fr", password: "motdepasse-solide-123" });
    for (let i = 0; i < 5; i++) {
      await expect(login({ email: "cible@exemple.fr", password: "mauvais" })).rejects.toMatchObject({ status: 401 });
    }
    await expect(login({ email: "cible@exemple.fr", password: "motdepasse-solide-123" })).rejects.toMatchObject({ status: 423 });
  });

  it("même erreur pour un email inconnu (pas d'énumération de comptes)", async () => {
    await expect(login({ email: "inconnu@exemple.fr", password: "x" })).rejects.toMatchObject({ status: 401, code: "invalid_credentials" });
  });
});

describe("facturation Stripe", () => {
  const stripeLib = new Stripe("sk_test_dummy");

  function subEvent(id: string, type: string, sub: Partial<Stripe.Subscription>) {
    return { id, type, data: { object: { object: "subscription", ...sub } } } as unknown as Stripe.Event;
  }

  it("active, modifie puis résilie un abonnement ; ignore les événements rejoués", async () => {
    const { user } = await makeUser();
    const base = { id: "sub_1", customer: "cus_1", metadata: { userId: user.id } };
    const items = (price: string) => ({ data: [{ price: { id: price } }] }) as unknown as Stripe.Subscription["items"];

    await handleStripeEvent(subEvent("evt_1", "customer.subscription.created", { ...base, status: "active", items: items("price_pro_test") }));
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).plan).toBe("PRO");

    const dup = await handleStripeEvent(subEvent("evt_1", "customer.subscription.created", { ...base, status: "active", items: items("price_pro_test") }));
    expect(dup.duplicate).toBe(true);

    await handleStripeEvent(subEvent("evt_2", "customer.subscription.updated", { ...base, status: "active", items: items("price_scale_test") }));
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).plan).toBe("SCALE");

    await handleStripeEvent(subEvent("evt_3", "customer.subscription.deleted", { ...base, status: "canceled", items: items("price_scale_test") }));
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.plan).toBe("FREE");
    expect(after.stripeSubscriptionId).toBeNull();
  });

  it("le webhook rejette une signature invalide et accepte une signature valide", async () => {
    setStripeClient(stripeLib);
    const payload = JSON.stringify({ id: "evt_x", object: "event", type: "invoice.paid", data: { object: {} } });
    const bad = await stripeRoute.POST(new Request("http://x", { method: "POST", headers: { "stripe-signature": "t=1,v1=abc" }, body: payload }));
    expect(bad.status).toBe(400);
    const header = stripeLib.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_dummy" });
    const ok = await stripeRoute.POST(new Request("http://x", { method: "POST", headers: { "stripe-signature": header }, body: payload }));
    expect(ok.status).toBe(200);
  });
});
