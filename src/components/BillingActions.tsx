"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api-client";

export function OrderButton({ plan, label, primary }: { plan: "PRO" | "SCALE"; label: string; primary?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div>
      <button
        className={`${primary ? "btn-primary" : "btn-ghost"} w-full`}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await api("/api/console/billing/orders", "POST", { plan, months: 1 });
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Création…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ml-2 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copié" : "Copier"}
    </button>
  );
}

export function AdminOrderActions({ orderId, label }: { orderId: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function act(action: "confirm" | "reject") {
    const question =
      action === "confirm"
        ? `Confirmer que le virement ${label} est bien arrivé sur le compte ? Le plan sera activé immédiatement.`
        : `Rejeter la commande ${label} ?`;
    if (!window.confirm(question)) return;
    setPending(true);
    try {
      await api(`/api/console/admin/orders/${orderId}`, "POST", { action });
      router.refresh();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex justify-end gap-2">
      <button className="btn-primary" disabled={pending} onClick={() => act("confirm")}>Virement reçu</button>
      <button className="btn-danger" disabled={pending} onClick={() => act("reject")}>Rejeter</button>
    </div>
  );
}
