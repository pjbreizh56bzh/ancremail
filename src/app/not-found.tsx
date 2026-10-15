import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-2xl font-semibold text-ink">Page introuvable</h1>
      <p className="text-sm text-slate-600">Cette page n'existe pas ou vous n'y avez pas accès.</p>
      <Link href="/dashboard" className="btn-primary">Retour à la console</Link>
    </main>
  );
}
