import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMessage, getOwnedInbox } from "@/lib/inboxes";
import { HttpError } from "@/lib/http";
import { SendMessageForm } from "@/components/SendMessageForm";
import { DeleteButton } from "@/components/DeleteButton";

export const metadata = { title: "Boîte mail" };

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ inboxId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const user = (await currentUser())!;
  const { inboxId } = await params;
  const { m } = await searchParams;

  const inbox = await getOwnedInbox(user.id, inboxId).catch((e) => {
    if (e instanceof HttpError) notFound();
    throw e;
  });
  const messages = await db.message.findMany({
    where: { inboxId: inbox.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const selected = m ? await getMessage(user.id, inbox.id, m).catch(() => null) : null;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/inboxes" className="text-sm text-sea">← Boîtes mail</Link>
          <h1 className="font-mono text-xl font-semibold text-ink">{inbox.address}</h1>
        </div>
        <DeleteButton
          url={`/api/v1/inboxes/${inbox.id}`}
          redirectTo="/dashboard/inboxes"
          confirmText="Supprimer cette boîte ? L'adresse restera réservée et ne pourra plus être utilisée."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <ul className="card divide-y divide-slate-100 p-0">
            {messages.length === 0 && <li className="p-5 text-sm text-slate-600">Aucun message.</li>}
            {messages.map((msg) => (
              <li key={msg.id}>
                <Link
                  href={`/dashboard/inboxes/${inbox.id}?m=${msg.id}`}
                  className={`block px-4 py-3 hover:bg-slate-50 ${selected?.id === msg.id ? "bg-foam" : ""}`}
                >
                  <p className="flex items-center justify-between text-xs text-slate-500">
                    <span>{msg.direction === "INBOUND" ? `De ${msg.fromAddress}` : `À ${msg.toAddresses.join(", ")}`}</span>
                    <span>{msg.status === "FAILED" ? "Échec" : msg.direction === "OUTBOUND" ? "Envoyé" : ""}</span>
                  </p>
                  <p className={`truncate text-sm ${msg.direction === "INBOUND" && !msg.readAt ? "font-semibold" : ""}`}>
                    {msg.subject || "(sans sujet)"}
                  </p>
                  <p className="text-xs text-slate-400">{msg.createdAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-6 lg:col-span-3">
          {selected && (
            <article className="card space-y-3">
              <h2 className="text-lg font-semibold">{selected.subject || "(sans sujet)"}</h2>
              <p className="text-xs text-slate-500">De : {selected.fromAddress} · À : {selected.toAddresses.join(", ")}</p>
              {selected.html ? (
                // Iframe sans aucun droit (sandbox vide) : pas de script, pas de formulaire, pas de navigation.
                <iframe
                  title="Contenu HTML du message"
                  sandbox=""
                  srcDoc={selected.html}
                  className="h-96 w-full rounded border border-slate-200 bg-white"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-800">{selected.text}</pre>
              )}
            </article>
          )}
          <SendMessageForm inboxId={inbox.id} disabled={!user.emailVerifiedAt} />
        </div>
      </div>
    </div>
  );
}
