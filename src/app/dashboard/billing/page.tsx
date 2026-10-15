import { currentUser } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { CheckoutButton, PortalButton } from "@/components/BillingActions";

export const metadata = { title: "Abonnement" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = (await currentUser())!;
  const { status } = await searchParams;
  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Abonnement</h1>
      {status === "success" && <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">Paiement reçu. Votre plan sera actif dès la confirmation de Stripe (quelques secondes).</p>}
      {status === "cancel" && <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">Paiement annulé, aucun montant n'a été prélevé.</p>}
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-600">Plan actuel</p>
          <p className="text-xl font-semibold">{PLANS[user.plan].name}{user.subscriptionStatus ? ` · ${user.subscriptionStatus}` : ""}</p>
        </div>
        {user.stripeCustomerId && <PortalButton />}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Object.values(PLANS).map((p) => (
          <div key={p.id} className={`card flex flex-col ${user.plan === p.id ? "ring-2 ring-sea" : ""}`}>
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-1 text-2xl font-bold">{p.priceEurMonthly} €<span className="text-sm font-normal text-slate-500"> / mois</span></p>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-slate-700">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
            <div className="mt-4">
              {user.plan === p.id ? (
                <p className="text-center text-sm font-medium text-sea">Plan actuel</p>
              ) : p.id === "FREE" ? (
                <p className="text-center text-xs text-slate-500">Résiliez depuis le portail pour revenir au plan gratuit.</p>
              ) : user.stripeSubscriptionId ? (
                <p className="text-center text-xs text-slate-500">Changez de plan depuis le portail.</p>
              ) : (
                <CheckoutButton plan={p.id} label={`Passer au plan ${p.name}`} primary={p.id === "PRO"} />
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Paiement sécurisé par Stripe : aucune donnée bancaire ne transite par nos serveurs.</p>
    </div>
  );
}
