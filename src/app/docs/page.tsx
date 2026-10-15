import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Documentation API" };

const endpoints: { m: string; p: string; d: string; body?: string }[] = [
  { m: "GET", p: "/api/v1/me", d: "Plan, quotas et consommation du compte." },
  { m: "GET", p: "/api/v1/inboxes?limit=20&cursor=…", d: "Liste paginée de vos boîtes." },
  { m: "POST", p: "/api/v1/inboxes", d: "Crée une boîte. username facultatif (aléatoire sinon).", body: `{"username":"support-bot","displayName":"Support"}` },
  { m: "GET", p: "/api/v1/inboxes/{id}", d: "Détail d'une boîte." },
  { m: "DELETE", p: "/api/v1/inboxes/{id}", d: "Supprime une boîte (l'adresse reste réservée, jamais réattribuée)." },
  { m: "GET", p: "/api/v1/inboxes/{id}/messages", d: "Messages reçus et envoyés, du plus récent au plus ancien." },
  { m: "POST", p: "/api/v1/inboxes/{id}/messages", d: "Envoie un email. En-tête Idempotency-Key recommandé.", body: `{"to":["client@exemple.fr"],"subject":"Bonjour","text":"…","html":"<p>…</p>"}` },
  { m: "GET", p: "/api/v1/inboxes/{id}/messages/{messageId}", d: "Lit un message (le marque comme lu)." },
];

const errors = [
  ["400", "validation_error / invalid_json", "Corps de requête invalide"],
  ["401", "unauthorized", "Clé absente, invalide, expirée ou révoquée"],
  ["402", "quota_exceeded", "Limite du plan atteinte"],
  ["403", "email_not_verified", "Email du compte à vérifier avant d'envoyer"],
  ["404", "not_found", "Ressource inexistante ou appartenant à un autre compte"],
  ["409", "address_taken", "Adresse déjà utilisée"],
  ["429", "rate_limited", "Trop de requêtes (voir Retry-After)"],
];

export default function Docs() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-10 flex items-center justify-between">
        <Logo />
        <Link href="/dashboard" className="btn-ghost">Console</Link>
      </header>
      <h1 className="text-3xl font-bold text-ink">API REST v1</h1>
      <p className="mt-3 text-slate-700">
        Authentifiez chaque requête avec <code className="rounded bg-slate-200 px-1">Authorization: Bearer amk_…</code>.
        Créez vos clés dans la console (elles ne sont affichées qu'une fois). Réponses en JSON, erreurs au format
        <code className="rounded bg-slate-200 px-1">{`{"error":{"code","message"}}`}</code>.
      </p>
      <h2 className="mt-10 text-xl font-semibold">Points d'accès</h2>
      <div className="mt-4 space-y-3">
        {endpoints.map((e) => (
          <div key={e.m + e.p} className="card">
            <p className="font-mono text-sm">
              <span className="mr-2 rounded bg-foam px-2 py-0.5 font-semibold text-sea">{e.m}</span>
              {e.p}
            </p>
            <p className="mt-2 text-sm text-slate-600">{e.d}</p>
            {e.body && <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2 text-xs">{e.body}</pre>}
          </div>
        ))}
      </div>
      <h2 className="mt-10 text-xl font-semibold">Exemple Python</h2>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-sm text-teal-100">{`import os, uuid, requests

BASE = "https://votre-domaine/api/v1"
H = {"Authorization": f"Bearer {os.environ['ANCREMAIL_API_KEY']}"}

inbox = requests.post(f"{BASE}/inboxes", json={"username": "agent-demo"}, headers=H).json()
requests.post(
    f"{BASE}/inboxes/{inbox['id']}/messages",
    json={"to": ["moi@exemple.fr"], "subject": "Bonjour", "text": "Message de mon agent"},
    headers={**H, "Idempotency-Key": str(uuid.uuid4())},
).raise_for_status()
messages = requests.get(f"{BASE}/inboxes/{inbox['id']}/messages", headers=H).json()["data"]`}</pre>
      <h2 className="mt-10 text-xl font-semibold">Codes d'erreur</h2>
      <table className="mt-3 w-full text-left text-sm">
        <tbody>
          {errors.map(([s, c, d]) => (
            <tr key={s} className="border-b border-slate-200">
              <td className="py-2 font-mono">{s}</td>
              <td className="py-2 font-mono text-sea">{c}</td>
              <td className="py-2 text-slate-600">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
