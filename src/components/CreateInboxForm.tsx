"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api-client";

export function CreateInboxForm({ domain }: { domain: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const username = String(form.get("username") ?? "").trim();
    const displayName = String(form.get("displayName") ?? "").trim();
    setPending(true);
    setError(null);
    try {
      await api("/api/v1/inboxes", "POST", {
        ...(username ? { username } : {}),
        ...(displayName ? { displayName } : {}),
      });
      formEl.reset();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="font-semibold">Nouvelle boîte</h2>
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="flex flex-1 items-center gap-1">
          <input className="input" name="username" placeholder="nom (laisser vide = aléatoire)" maxLength={40} aria-label="Nom de l'adresse" />
          <span className="whitespace-nowrap text-sm text-slate-500">@{domain}</span>
        </div>
        <input className="input md:w-56" name="displayName" placeholder="Nom affiché (facultatif)" maxLength={80} aria-label="Nom affiché" />
        <button className="btn-primary" disabled={pending}>{pending ? "Création…" : "Créer"}</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
