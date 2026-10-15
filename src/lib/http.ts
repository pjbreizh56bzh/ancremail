import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Encapsule un handler : erreurs connues -> JSON propre, inconnues -> 500 sans fuite d'info interne. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: { code: err.code, message: err.message } }, err.status, err.headers);
      }
      if (err instanceof ZodError) {
        return json(
          {
            error: {
              code: "validation_error",
              message: "Données invalides",
              details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            },
          },
          400,
        );
      }
      console.error("[erreur interne]", err);
      return json({ error: { code: "internal_error", message: "Erreur interne" } }, 500);
    }
  };
}

/** Lecture JSON avec limite de taille (anti-DoS). */
export async function readJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new HttpError(413, "payload_too_large", "Requête trop volumineuse");
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new HttpError(413, "payload_too_large", "Requête trop volumineuse");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "JSON invalide");
  }
}

export function clientIp(req: Request): string {
  // Derrière un proxy de confiance (Vercel, Nginx), x-forwarded-for est fiable.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
