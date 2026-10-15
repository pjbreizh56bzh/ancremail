"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "./api-client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      await api(`/api/auth/${mode}`, "POST", { email: form.get("email"), password: form.get("password") });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      </div>
      <div>
        <label className="label" htmlFor="password">Mot de passe</label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 12 : 1}
          maxLength={128}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
        {mode === "signup" && <p className="mt-1 text-xs text-slate-500">12 caractères minimum, avec lettres et chiffres.</p>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Patientez…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}
      </button>
      <p className="text-center text-sm text-slate-600">
        {mode === "signup" ? (
          <>Déjà inscrit ? <Link className="text-sea underline" href="/login">Se connecter</Link></>
        ) : (
          <>Pas encore de compte ? <Link className="text-sea underline" href="/signup">Créer un compte</Link></>
        )}
      </p>
    </form>
  );
}
