import { env } from "../env";
import { MailgunProvider } from "./mailgun";
import { MockProvider } from "./mock";
import type { MailProvider } from "./provider";

let provider: MailProvider | null = null;

export function mailProvider(): MailProvider {
  if (provider) return provider;
  const e = env();
  provider =
    e.MAIL_PROVIDER === "mailgun"
      ? new MailgunProvider({
          apiKey: e.MAILGUN_API_KEY,
          baseUrl: e.MAILGUN_BASE_URL,
          domain: e.MAIL_DOMAIN,
          signingKey: e.MAILGUN_WEBHOOK_SIGNING_KEY,
        })
      : new MockProvider(e.INBOUND_WEBHOOK_SECRET);
  return provider;
}

/** Réservé aux tests. */
export function setMailProvider(p: MailProvider | null) {
  provider = p;
}
