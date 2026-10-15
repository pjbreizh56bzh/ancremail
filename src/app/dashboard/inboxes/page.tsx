import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { PLANS } from "@/lib/plans";
import { CreateInboxForm } from "@/components/CreateInboxForm";

export const metadata = { title: "Boîtes mail" };

export default async function InboxesPage() {
  const user = (await currentUser())!;
  const inboxes = await db.inbox.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { messages: { where: { direction: "INBOUND", readAt: null } } } } },
  });
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-ink">Boîtes mail</h1>
        <p className="text-sm text-slate-500">{inboxes.length} / {PLANS[user.plan].maxInboxes}</p>
      </div>
      <CreateInboxForm domain={env().MAIL_DOMAIN} />
      {inboxes.length === 0 ? (
        <p className="card text-sm text-slate-600">Aucune boîte pour l'instant.</p>
      ) : (
        <ul className="card divide-y divide-slate-100 p-0">
          {inboxes.map((i) => (
            <li key={i.id}>
              <Link href={`/dashboard/inboxes/${i.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                <div>
                  <p className="font-mono text-sm text-ink">{i.address}</p>
                  {i.displayName && <p className="text-xs text-slate-500">{i.displayName}</p>}
                </div>
                {i._count.messages > 0 && (
                  <span className="rounded-full bg-sea px-2 py-0.5 text-xs font-medium text-white">{i._count.messages} non lu(s)</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
