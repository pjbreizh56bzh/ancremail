// Test de bout en bout dans un vrai navigateur (Chromium) contre l'app démarrée.
// Usage : BASE_URL=http://localhost:3100 INBOUND_WEBHOOK_SECRET=... DATABASE_URL=... node e2e/smoke.mjs
import { chromium } from "playwright";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.INBOUND_WEBHOOK_SECRET;
const DOMAIN = process.env.MAIL_DOMAIN ?? "agents.localhost";
const db = new PrismaClient();
const problems = [];
const step = (s) => console.log("✓", s);
const assert = (cond, msg) => { if (!cond) throw new Error("ÉCHEC : " + msg); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
page.on("pageerror", (e) => problems.push(e.message));

try {
  // 1. En-têtes de sécurité
  const res = await page.goto(BASE + "/");
  const h = res.headers();
  for (const k of ["content-security-policy", "x-frame-options", "x-content-type-options", "strict-transport-security", "referrer-policy", "permissions-policy"]) {
    assert(h[k], `en-tête ${k} manquant`);
  }
  assert(/nonce-/.test(h["content-security-policy"]), "CSP sans nonce");
  assert(!h["x-powered-by"], "x-powered-by exposé");
  step("page d'accueil + en-têtes de sécurité");

  // 2. Inscription
  const email = `e2e-${Date.now()}@exemple.fr`;
  const bot = `e2e-${Date.now().toString(36)}`;
  await page.goto(BASE + "/signup");
  await page.fill("#email", email);
  await page.fill("#password", "motdepasse-solide-123");
  await page.click("button[type=submit], form button");
  await page.waitForURL("**/dashboard");
  assert(await page.getByText("Confirmez votre email").isVisible(), "bannière de vérification absente");
  step("inscription et redirection vers la console");

  // Vérification d'email (le lien est envoyé par le fournisseur factice ; on le simule en base)
  await db.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });

  // 3. Clé API
  await page.goto(BASE + "/dashboard/api-keys");
  await page.fill("#name", "e2e");
  await page.getByRole("button", { name: "Créer la clé" }).click();
  const key = (await page.locator("code").first().textContent()).trim();
  assert(key.startsWith("amk_"), "clé API non affichée");
  step("création de clé API (affichée une fois)");

  // 4. Boîte via l'interface
  await page.goto(BASE + "/dashboard/inboxes");
  await page.fill("input[name=username]", bot);
  await page.getByRole("button", { name: "Créer" }).click();
  await page.getByText(`${bot}@${DOMAIN}`).waitFor();
  step("création de boîte depuis la console");

  // 5. API par clé
  const list = await fetch(BASE + "/api/v1/inboxes", { headers: { authorization: `Bearer ${key}` } }).then((r) => r.json());
  assert(list.data.length === 1 && list.data[0].address === `${bot}@${DOMAIN}`, "API v1 liste incorrecte");
  const inboxId = list.data[0].id;
  step("API v1 avec clé Bearer");

  // 6. Réception d'un email signé, contenant un script et une image de pistage
  const body = JSON.stringify({
    recipient: `${bot}@${DOMAIN}`, from: "alice@exemple.fr", subject: "Bienvenue e2e",
    html: '<p id="c">Bonjour</p><script>parent.document.title="PIRATE"</script><img src="https://tracker.example/p.gif">',
    messageId: `<e2e-${Date.now()}@x>`,
  });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex")}`;
  const inbound = await fetch(BASE + "/api/webhooks/inbound", { method: "POST", headers: { "x-ancre-signature": sig }, body }).then((r) => r.json());
  assert(inbound.accepted, "message entrant refusé");
  const forged = await fetch(BASE + "/api/webhooks/inbound", { method: "POST", headers: { "x-ancre-signature": `t=${t},v1=00` }, body });
  assert(forged.status === 401, "webhook non signé accepté");
  step("webhook entrant signé accepté, faux refusé");

  await page.goto(`${BASE}/dashboard/inboxes/${inboxId}`);
  await page.getByText("Bienvenue e2e").click();
  await page.waitForURL(/m=/);
  const frame = page.frameLocator("iframe[title='Contenu HTML du message']");
  await frame.locator("#c").waitFor();
  assert((await page.title()) !== "PIRATE", "le script de l'email s'est exécuté !");
  step("lecture d'un email HTML dans une iframe isolée (script neutralisé)");

  // 7. Envoi
  await page.fill("input[name=to]", "client@exemple.fr");
  await page.fill("input[name=subject]", "Réponse e2e");
  await page.fill("textarea[name=text]", "Merci !");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await page.getByText("Message envoyé.").waitFor();
  step("envoi depuis la console");

  // 8. Anti-CSRF : requête cookie depuis une autre origine
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const csrf = await fetch(BASE + "/api/v1/inboxes", {
    method: "POST",
    headers: { cookie: cookieHeader, origin: "https://site-malveillant.example", "content-type": "application/json" },
    body: "{}",
  });
  assert(csrf.status === 403, `CSRF non bloqué (${csrf.status})`);
  const sameOrigin = await fetch(BASE + "/api/v1/me", { headers: { cookie: cookieHeader } });
  assert(sameOrigin.status === 200, "session cookie non reconnue");
  const c = cookies.find((x) => x.name.includes("ancre_session"));
  assert(c.httpOnly && c.sameSite === "Lax", "cookie de session mal protégé");
  step("anti-CSRF + cookie httpOnly/SameSite");

  // 9. Autres pages
  for (const p of ["/dashboard", "/dashboard/billing", "/dashboard/activity", "/docs"]) {
    const r = await page.goto(BASE + p);
    assert(r.status() === 200, `${p} -> ${r.status()}`);
  }
  step("pages abonnement, activité, documentation");

  // 10. Déconnexion
  await page.goto(BASE + "/dashboard");
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await page.waitForURL("**/login");
  const after = await fetch(BASE + "/api/v1/me", { headers: { cookie: cookieHeader } });
  assert(after.status === 401, "session toujours valide après déconnexion");
  step("déconnexion (session invalidée côté serveur)");

  const csp = problems.filter((p) => /Content Security Policy|Refused/.test(p) && !/tracker\.example/.test(p));
  assert(csp.length === 0, "violations CSP : " + csp.join(" | "));
  const other = problems.filter((p) => !/Content Security Policy|Refused|Blocked script execution|sandboxed/.test(p));
  assert(other.length === 0, "erreurs navigateur : " + other.join(" | "));
  step("aucune violation CSP ni erreur JavaScript");
  console.log("\nTEST DE BOUT EN BOUT : OK");
} catch (e) {
  console.error(e.message);
  console.error("Messages navigateur :", problems);
  process.exitCode = 1;
} finally {
  await browser.close();
  await db.$disconnect();
}
