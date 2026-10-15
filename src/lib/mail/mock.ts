import { randomToken, hmacSha256Hex, safeEqual } from "../crypto";
import { HttpError, readJson } from "../http";
import { z } from "zod";
import type { InboundMail, MailProvider, OutgoingMail } from "./provider";

export const sentMockMails: OutgoingMail[] = [];

const inboundSchema = z.object({
  recipient: z.string().email(),
  from: z.string().min(3).max(320),
  to: z.array(z.string()).max(50).default([]),
  subject: z.string().max(998).default(""),
  text: z.string().max(500_000).optional(),
  html: z.string().max(1_000_000).optional(),
  messageId: z.string().max(300).optional(),
});

/**
 * Signature : en-tête `x-ancre-signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`.
 * Rejette les signatures de plus de 5 minutes (anti-rejeu).
 */
export function signInbound(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${hmacSha256Hex(secret, `${t}.${body}`)}`;
}

export function verifyInboundSignature(secret: string, body: string, header: string | null, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300 || !parts.v1) return false;
  return safeEqual(hmacSha256Hex(secret, `${t}.${body}`), parts.v1);
}

export class MockProvider implements MailProvider {
  readonly name = "mock";
  constructor(private inboundSecret: string) {}

  async send(mail: OutgoingMail) {
    sentMockMails.push(mail);
    if (process.env.NODE_ENV !== "test") {
      console.info(`[mail:mock] ${mail.from} -> ${mail.to.join(", ")} : ${mail.subject}`);
    }
    return { providerMessageId: `mock-${randomToken(12)}` };
  }

  async parseInbound(req: Request): Promise<InboundMail> {
    const raw = await req.text();
    if (raw.length > 2_000_000) throw new HttpError(413, "payload_too_large", "Message trop volumineux");
    if (!verifyInboundSignature(this.inboundSecret, raw, req.headers.get("x-ancre-signature"))) {
      throw new HttpError(401, "invalid_signature", "Signature invalide");
    }
    const data = inboundSchema.parse(await readJson(new Request("http://x", { method: "POST", body: raw })));
    return {
      recipient: data.recipient.toLowerCase(),
      from: data.from,
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
      providerMessageId: data.messageId,
    };
  }
}
