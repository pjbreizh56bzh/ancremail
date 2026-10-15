import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Inscription" };

export default async function SignupPage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold">Créer un compte</h1>
        <p className="mt-1 text-sm text-slate-600">Gratuit : 3 boîtes mail et 100 envois par mois, sans carte bancaire.</p>
      </div>
      <AuthForm mode="signup" />
    </main>
  );
}
