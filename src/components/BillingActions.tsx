"use client";

import { useState } from "react";
import { api } from "./api-client";

export function CheckoutButton({ plan, label, primary }: { plan: "PRO" | "SCALE"; label: string; primary?: boolean }) {
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
            const { url } = await api<{ url: string }>("/api/console/billing/checkout", "POST", { plan });
            window.location.assign(url);
          } catch (e) {
            setError((e as Error).message);
            setPending(false);
          }
        }}
      >
        {pending ? "Redirection…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function PortalButton() {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className="btn-ghost"
        onClick={async () => {
          try {
            const { url } = await api<{ url: string }>("/api/console/billing/portal", "POST");
            window.location.assign(url);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Gérer mon abonnement et mes factures
      </button>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
