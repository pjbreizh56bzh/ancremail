import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { PLANS } from "@/lib/plans";

const nav = [
  { href: "/dashboard", label: "Vue d'ensemble" },
  { href: "/dashboard/inboxes", label: "Boîtes mail" },
  { href: "/dashboard/api-keys", label: "Clés API" },
  { href: "/dashboard/billing", label: "Abonnement" },
  { href: "/dashboard/activity", label: "Activité" },
  { href: "/docs", label: "Documentation" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white p-4 md:w-60 md:border-b-0 md:border-r">
        <Logo href="/dashboard" />
        <nav className="mt-6 flex flex-wrap gap-1 md:flex-col">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-foam hover:text-sea">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="truncate px-3 text-xs text-slate-500" title={user.email}>{user.email}</p>
          <p className="px-3 text-xs font-medium text-sea">Plan {PLANS[user.plan].name}</p>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
