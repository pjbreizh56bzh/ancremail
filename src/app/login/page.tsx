import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <Logo />
      <h1 className="text-2xl font-semibold">Connexion à la console</h1>
      <AuthForm mode="login" />
    </main>
  );
}
