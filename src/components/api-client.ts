"use client";

export type ApiError = { code: string; message: string; details?: { path: string; message: string }[] };

/** Appel same-origin : le navigateur ajoute Origin, vérifié côté serveur (anti-CSRF). */
export async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: ApiError = data?.error ?? { code: "http_" + res.status, message: "Erreur inattendue" };
    const detail = err.details?.map((d) => d.message).join(", ");
    throw new Error(detail ? `${err.message} : ${detail}` : err.message);
  }
  return data as T;
}
