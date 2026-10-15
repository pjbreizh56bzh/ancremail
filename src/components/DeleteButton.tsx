"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api-client";

export function DeleteButton({ url, confirmText, redirectTo, label = "Supprimer" }: {
  url: string;
  confirmText: string;
  redirectTo?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      className="btn-danger"
      disabled={pending}
      onClick={async () => {
        if (!window.confirm(confirmText)) return;
        setPending(true);
        try {
          await api(url, "DELETE");
          if (redirectTo) router.push(redirectTo);
          router.refresh();
        } catch (e) {
          window.alert((e as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      {label}
    </button>
  );
}
