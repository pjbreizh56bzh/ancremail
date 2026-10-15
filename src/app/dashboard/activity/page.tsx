import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Activité" };

const labels: Record<string, string> = {
  "account.signup": "Création du compte",
  "account.login": "Connexion",
  "account.login_failed": "Échec de connexion",
  "account.email_verified": "Email confirmé",
  "api_key.create": "Clé API créée",
  "api_key.revoke": "Clé API révoquée",
  "inbox.create": "Boîte créée",
  "inbox.delete": "Boîte supprimée",
  "billing.subscription": "Abonnement mis à jour",
};

export default async function ActivityPage() {
  const user = (await currentUser())!;
  const logs = await db.auditLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Journal d'activité</h1>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Détail</th><th className="px-4 py-3">IP</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-4 py-2">{l.createdAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</td>
                <td className={`px-4 py-2 ${l.action.endsWith("failed") ? "text-red-700" : ""}`}>{labels[l.action] ?? l.action}</td>
                <td className="px-4 py-2 text-slate-600">{l.detail ?? ""}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{l.ip ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
