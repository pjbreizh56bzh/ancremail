import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { bankDetails, formatIban } from "@/lib/billing";
import { CopyButton, OrderButton } from "@/components/BillingActions";
import { DeleteButton } from "@/components/DeleteButton";

export const metadata = { title: "Abonnement" };

const eur = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const day = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

export default async function BillingPage() {
  const user = (await currentUser())!;
  const bank = bankDetails();
  const orders = await db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 });
  const pending = orders.filter((o) => o.status === "PENDING");
  const history = orders.filter((o) => o.status !== "PENDING");

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Abonnement</h1>

      <div className="card">
        <p className="text-sm text-slate-600">Plan actuel</p>
        <p className="text-xl font-semibold">{PLANS[user.plan].name}</p>
        {user.planExpiresAt && (
          <p className="mt-1 text-sm text-slate-600">
            Payé jusqu'au {day(user.planExpiresAt)}. Passez une nouvelle commande avant cette date pour prolonger.
          </p>
        )}
      </div>

      {!bank && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Le paiement par virement n'est pas encore configuré sur ce serveur.
        </p>
      )}

      {pending.map((o) => (
        <div key={o.id} className="card border-sea">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Commande en attente de virement : plan {PLANS[o.plan].name}, {o.months} mois</h2>
              <p className="mt-1 text-sm text-slate-600">
                Effectuez un virement avec exactement ces informations. Votre plan est activé dès que le paiement est reçu et vérifié.
              </p>
            </div>
            <DeleteButton url={`/api/console/billing/orders/${o.id}`} label="Annuler" confirmText="Annuler cette commande ?" />
          </div>
          {bank && (
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-slate-500">Bénéficiaire</dt>
              <dd className="font-medium">{bank.holder}</dd>
              <dt className="text-slate-500">IBAN</dt>
              <dd className="font-mono">{formatIban(bank.iban)}<CopyButton value={bank.iban} /></dd>
              {bank.bic && (<><dt className="text-slate-500">BIC</dt><dd className="font-mono">{bank.bic}</dd></>)}
              <dt className="text-slate-500">Montant</dt>
              <dd className="font-semibold">{eur(o.amountCents)}</dd>
              <dt className="text-slate-500">Libellé / référence</dt>
              <dd className="font-mono font-semibold text-sea">{o.reference}<CopyButton value={o.reference} /></dd>
            </dl>
          )}
          <p className="mt-3 text-xs text-slate-500">
            La référence est indispensable pour rattacher votre virement à votre compte. Une commande non réglée est annulée après 14 jours.
          </p>
        </div>
      ))}

      <div className="grid gap-4 md:grid-cols-3">
        {Object.values(PLANS).map((p) => (
          <div key={p.id} className={`card flex flex-col ${user.plan === p.id ? "ring-2 ring-sea" : ""}`}>
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-1 text-2xl font-bold">{p.priceEurMonthly} €<span className="text-sm font-normal text-slate-500"> / mois</span></p>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-slate-700">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
            <div className="mt-4">
              {p.id === "FREE" ? (
                <p className="text-center text-xs text-slate-500">{user.plan === "FREE" ? "Plan actuel" : "Retour automatique à échéance"}</p>
              ) : bank ? (
                <OrderButton
                  plan={p.id}
                  primary={p.id === "PRO"}
                  label={user.plan === p.id ? "Prolonger d'un mois" : `Commander ${p.name} (1 mois)`}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {history.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Référence</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Montant</th><th className="px-4 py-3">Statut</th></tr>
            </thead>
            <tbody>
              {history.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{day(o.createdAt)}</td>
                  <td className="px-4 py-2 font-mono">{o.reference}</td>
                  <td className="px-4 py-2">{PLANS[o.plan].name} · {o.months} mois</td>
                  <td className="px-4 py-2">{eur(o.amountCents)}</td>
                  <td className="px-4 py-2">{o.status === "PAID" ? `Payé le ${day(o.paidAt!)}` : "Annulée"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">Paiement par virement bancaire : aucune donnée de carte n'est demandée ni stockée.</p>
    </div>
  );
}
