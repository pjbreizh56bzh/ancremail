import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiKeysManager } from "@/components/ApiKeysManager";

export const metadata = { title: "Clés API" };

export default async function ApiKeysPage() {
  const user = (await currentUser())!;
  const keys = await db.apiKey.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, expiresAt: true },
  });
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Clés API</h1>
        <p className="mt-1 text-sm text-slate-600">Seule une empreinte SHA-256 est conservée : une clé perdue doit être recréée.</p>
      </div>
      <ApiKeysManager
        keys={keys.map((k) => ({
          ...k,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          expiresAt: k.expiresAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
