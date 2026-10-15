import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { usage } from "@/lib/inboxes";
import { PLANS } from "@/lib/plans";
import { ResendVerification } from "@/components/ResendVerification";

export const metadata = { title: "Console" };

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="card">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">
        {value.toLocaleString("fr-FR")} <span className="text-base font-normal text-slate-500">/ {max.toLocaleString("fr-FR")}</span>
      </p>
      <div className="mt-3 h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${pct >= 90 ? "bg-red-500" : "bg-sea"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ verified?: string }> }) {
  const user = (await currentUser())!;
  const { verified } = await searchParams;
  const u = await usage(user.id);
  const plan = PLANS[user.plan];
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Vue d'ensemble</h1>
      {verified === "1" && <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">Adresse email confirmée. Vous pouvez envoyer des messages.</p>}
      {verified === "0" && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Lien de vérification invalide ou expiré.</p>}
      {!user.emailVerifiedAt && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Confirmez votre email ({user.email}) pour pouvoir envoyer des messages. <ResendVerification />
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Meter label="Boîtes mail actives" value={u.inboxes} max={plan.maxInboxes} />
        <Meter label="Envois ce mois-ci" value={u.sends} max={plan.monthlySends} />
      </div>
      <div className="card">
        <h2 className="font-semibold">Démarrer en 3 étapes</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li><Link className="text-sea underline" href="/dashboard/api-keys">Créez une clé API</Link> (affichée une seule fois).</li>
          <li><Link className="text-sea underline" href="/dashboard/inboxes">Créez une boîte</Link> ou appelez <code>POST /api/v1/inboxes</code>.</li>
          <li>Envoyez et lisez des emails : voir la <Link className="text-sea underline" href="/docs">documentation</Link>.</li>
        </ol>
      </div>
    </div>
  );
}
