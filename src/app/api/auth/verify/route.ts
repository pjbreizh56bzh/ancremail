import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyEmail } from "@/lib/users";

export async function GET(req: Request) {
  const base = env().APP_URL;
  if (!rateLimit(`verify:${clientIp(req)}`, 20, 3600_000).ok) {
    return NextResponse.redirect(new URL("/dashboard?verified=0", base));
  }
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = await verifyEmail(token);
  return NextResponse.redirect(new URL(`/dashboard?verified=${ok ? 1 : 0}`, base));
}
