"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api-client";
import { DeleteButton } from "./DeleteButton";

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; expiresAt: string | null };

export function ApiKeysManager({ keys }: { keys: Key[] }) {
  const router = useRouter();
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const days = Number(form.get("expiresInDays"));
    setError(null);
    try {
      const res = await api<{ key: string }>("/api/console/api-keys", "POST", {
        name: form.get("name"),
        ...(days ? { expiresInDays: days } : {}),
      });
      setCreated(res.key);
      setCopied(false);
      formEl.reset();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("fr-FR") : "—");

  return (
    <div className="space-y-6">
      {created && (
        <div className="card border-amber-300 bg-amber-50">
          <p className="text-sm font-medium text-amber-900">Copiez cette clé maintenant : elle ne sera plus jamais affichée.</p>
          <div className="mt-2 flex gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-white px-3 py-2 font-mono text-sm">{created}</code>
            <button
              className="btn-ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(created);
                setCopied(true);
              }}
            >
              {copied ? "Copiée" : "Copier"}
            </button>
          </div>
        </div>
      )}
      <form onSubmit={onSubmit} className="card flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="name">Nom de la clé</label>
          <input id="name" className="input" name="name" required maxLength={60} placeholder="ex : agent-production" />
        </div>
        <div>
          <label className="label" htmlFor="expiresInDays">Expiration</label>
          <select id="expiresInDays" name="expiresInDays" className="input" defaultValue="90">
            <option value="30">30 jours</option>
            <option value="90">90 jours</option>
            <option value="365">1 an</option>
            <option value="">Jamais</option>
          </select>
        </div>
        <button className="btn-primary">Créer la clé</button>
      </form>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Nom</th><th className="px-4 py-3">Clé</th><th className="px-4 py-3">Dernière utilisation</th><th className="px-4 py-3">Expire</th><th /></tr>
          </thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-slate-600">Aucune clé active.</td></tr>}
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{k.name}</td>
                <td className="px-4 py-3 font-mono">{k.prefix}…</td>
                <td className="px-4 py-3">{fmt(k.lastUsedAt)}</td>
                <td className="px-4 py-3">{fmt(k.expiresAt)}</td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton url={`/api/console/api-keys/${k.id}`} label="Révoquer" confirmText={`Révoquer la clé « ${k.name} » ? Les appels qui l'utilisent échoueront immédiatement.`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
