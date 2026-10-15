import { hmacSha256Hex, safeEqual } from "../crypto";
import { HttpError } from "../http";
import type { InboundMail, MailProvider, OutgoingMail } from "./provider";

/**
 * Adaptateur Mailgun.
 * - Envoi : API HTTP /v3/<domaine>/messages.
 * - Réception : une "Route" Mailgun catch-all (match_recipient(".*@<domaine>")) qui
 *   transfère vers https://<app>/api/webhooks/inbound. Signature vérifiée
 *   (HMAC-SHA256 de timestamp+token avec la clé de signature webhook).
 */
export class MailgunProvider implements MailProvider {
  readonly name = "mailgun";
  constructor(
    private opts: { apiKey: string; baseUrl: string; domain: string; signingKey: string },
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async send(mail: OutgoingMail) {
    const form = new FormData();
    form.set("from", mail.fromName ? `${mail.fromName.replace(/[<>"\r\n]/g, "")} <${mail.from}>` : mail.from);
    for (const to of mail.to) form.append("to", to);
    form.set("subject", mail.subject);
    if (mail.text) form.set("text", mail.text);
    if (mail.html) form.set("html", mail.html);

    const res = await this.fetchImpl(`${this.opts.baseUrl}/v3/${encodeURIComponent(this.opts.domain)}/messages`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`api:${this.opts.apiKey}`).toString("base64") },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Mailgun a répondu ${res.status}`);
    const body = (await res.json()) as { id?: string };
    if (!body.id) throw new Error("Réponse Mailgun sans identifiant");
    return { providerMessageId: body.id };
  }

  verifySignature(timestamp: string, token: string, signature: string, now = Date.now()) {
    const t = Number(timestamp);
    if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
    return safeEqual(hmacSha256Hex(this.opts.signingKey, timestamp + token), signature);
  }

  async parseInbound(req: Request): Promise<InboundMail> {
    const len = Number(req.headers.get("content-length") ?? "0");
    if (len > 25_000_000) throw new HttpError(413, "payload_too_large", "Message trop volumineux");
    const form = await req.formData();
    const get = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v : "";
    };
    if (!this.verifySignature(get("timestamp"), get("token"), get("signature"))) {
      throw new HttpError(401, "invalid_signature", "Signature invalide");
    }
    return {
      recipient: get("recipient").toLowerCase().split(",")[0].trim(),
      from: get("from") || get("sender"),
      to: get("To") ? get("To").split(",").map((s) => s.trim()).slice(0, 50) : [get("recipient")],
      subject: get("subject").slice(0, 998),
      text: get("body-plain").slice(0, 500_000) || undefined,
      html: get("body-html").slice(0, 1_000_000) || undefined,
      providerMessageId: get("Message-Id") || undefined,
    };
  }
}
