"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api-client";

export function SendMessageForm({ inboxId, disabled }: { inboxId: string; disabled?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const to = String(form.get("to") ?? "").split(/[,;\s]+/).filter(Boolean);
    setPending(true);
    setStatus(null);
    try {
      await api(`/api/v1/inboxes/${inboxId}/messages`, "POST", {
        to,
        subject: form.get("subject"),
        text: form.get("text"),
      });
      formEl.reset();
      setStatus({ ok: true, text: "Message envoyé." });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="font-semibold">Envoyer un email</h2>
      {disabled && <p className="text-sm text-amber-800">Confirmez l'email de votre compte pour activer l'envoi.</p>}
      <input className="input" name="to" placeholder="Destinataire(s), séparés par des virgules" required disabled={disabled} aria-label="Destinataires" />
      <input className="input" name="subject" placeholder="Sujet" required maxLength={998} disabled={disabled} aria-label="Sujet" />
      <textarea className="input min-h-32" name="text" placeholder="Message" required disabled={disabled} aria-label="Message" />
      {status && <p role="status" className={`text-sm ${status.ok ? "text-green-700" : "text-red-700"}`}>{status.text}</p>}
      <button className="btn-primary" disabled={pending || disabled}>{pending ? "Envoi…" : "Envoyer"}</button>
    </form>
  );
}
