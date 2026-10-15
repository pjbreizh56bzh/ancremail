import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PLANS } from "@/lib/plans";

const features = [
  { t: "Une adresse en un appel", d: "POST /v1/inboxes et votre agent a sa propre adresse, prête à envoyer et recevoir." },
  { t: "Réception en temps réel", d: "Les emails entrants sont stockés, paginés et lisibles par API en quelques millisecondes." },
  { t: "Sécurité par défaut", d: "Clés API hachées, CSP stricte, anti-CSRF, limitation de débit, journal d'audit." },
  { t: "Envois idempotents", d: "En-tête Idempotency-Key : un agent qui réessaie n'envoie jamais deux fois le même mail." },
  { t: "Adresses jamais recyclées", d: "Une adresse supprimée n'est jamais réattribuée : aucun mail ne tombe chez un inconnu." },
  { t: "Anti-pistage", d: "Les images distantes des emails HTML sont bloquées dans la console." },
];

export default function Home() {
  return (
    <div>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/docs" className="text-slate-700 hover:text-ink">Documentation</Link>
          <a href="#tarifs" className="text-slate-700 hover:text-ink">Tarifs</a>
          <Link href="/login" className="btn-ghost">Connexion</Link>
          <Link href="/signup" className="btn-primary">Commencer</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center">
        <div>
          <p className="mb-3 inline-block rounded-full bg-foam px-3 py-1 text-xs font-medium text-sea">API email pour agents IA</p>
          <h1 className="text-4xl font-bold leading-tight text-ink md:text-5xl">Donnez une vraie boîte mail à chacun de vos agents.</h1>
          <p className="mt-4 text-lg text-slate-600">
            Créez, lisez et envoyez des emails par API. Idéal pour les inscriptions, codes de vérification,
            échanges avec des clients ou automatisations.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/signup" className="btn-primary">Créer un compte gratuit</Link>
            <Link href="/docs" className="btn-ghost">Lire la doc</Link>
          </div>
        </div>
        <pre className="overflow-x-auto rounded-xl bg-ink p-5 text-sm leading-relaxed text-teal-100 shadow-lg">{`curl -X POST https://votre-domaine/api/v1/inboxes \\
  -H "Authorization: Bearer amk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"username":"assistant-ventes"}'

{
  "id": "cm1x...",
  "address": "assistant-ventes@agents.exemple.fr",
  "createdAt": "2026-10-15T18:30:00.000Z"
}`}</pre>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.t} className="card">
              <h3 className="font-semibold text-ink">{f.t}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="tarifs" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold text-ink">Tarifs simples</h2>
        <p className="mt-2 text-center text-slate-600">Sans engagement, résiliable à tout moment.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {Object.values(PLANS).map((p) => (
            <div key={p.id} className={`card flex flex-col ${p.id === "PRO" ? "ring-2 ring-sea" : ""}`}>
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-2 text-3xl font-bold text-ink">
                {p.priceEurMonthly} €<span className="text-sm font-normal text-slate-500"> / mois</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
                {p.features.map((f) => <li key={f}>✓ {f}</li>)}
              </ul>
              <Link href="/signup" className={`mt-6 ${p.id === "PRO" ? "btn-primary" : "btn-ghost"}`}>Choisir {p.name}</Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} AncreMail
      </footer>
    </div>
  );
}
