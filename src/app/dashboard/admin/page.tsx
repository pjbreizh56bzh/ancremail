import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { expireStaleOrders, isAdmin } from "@/lib/billing";
import { AdminOrderActions } from "@/components/BillingActions";

export const metadata = { title: "Paiements à valider" };

const eur = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export default async function AdminPage() {
  const user = (await currentUser())!;
  if (!isAdmin(user)) notFound();
  await expireStaleOrders();
  const [pending, recent] = await Promise.all([
    db.order.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { user: { select: { email: true } } } }),
    db.order.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "desc" }, take: 20, include: { user: { select: { email: true } } } }),
  ]);
  const total = recent.reduce((s, o) => s + o.amountCents, 0);
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Paiements à valider</h1>
        <p className="mt-1 text-sm text-slate-600">
          Vérifiez sur votre compte bancaire qu'un virement du bon montant portant la référence est arrivé, puis validez.
        </p>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Référence</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Montant</th><th className="px-4 py-3">Créée le</th><th /></tr>
          </thead>
          <tbody>
            {pending.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-slate-600">Aucun virement en attente.</td></tr>}
            {pending.map((o) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono font-semibold">{o.reference}</td>
                <td className="px-4 py-3">{o.user.email}</td>
                <td className="px-4 py-3">{PLANS[o.plan].name} · {o.months} mois</td>
                <td className="px-4 py-3 font-semibold">{eur(o.amountCents)}</td>
                <td className="px-4 py-3">{o.createdAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</td>
                <td className="px-4 py-3"><AdminOrderActions orderId={o.id} label={o.reference} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="text-lg font-semibold">Derniers paiements validés ({eur(total)})</h2>
      <ul className="card divide-y divide-slate-100 p-0 text-sm">
        {recent.length === 0 && <li className="px-4 py-3 text-slate-600">Aucun.</li>}
        {recent.map((o) => (
          <li key={o.id} className="flex justify-between px-4 py-2">
            <span className="font-mono">{o.reference}</span>
            <span>{o.user.email}</span>
            <span>{eur(o.amountCents)}</span>
            <span className="text-slate-500">{o.paidAt?.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
