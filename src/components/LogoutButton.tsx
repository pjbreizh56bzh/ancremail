"use client";

import { useRouter } from "next/navigation";
import { api } from "./api-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100"
      onClick={async () => {
        await api("/api/auth/logout", "POST").catch(() => {});
        router.push("/login");
        router.refresh();
      }}
    >
      Déconnexion
    </button>
  );
}
