export type OutgoingMail = {
  from: string;
  fromName?: string | null;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
};

export type InboundMail = {
  recipient: string;
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  providerMessageId?: string;
};

export interface MailProvider {
  readonly name: string;
  send(mail: OutgoingMail): Promise<{ providerMessageId: string }>;
  /** Vérifie et décode un webhook entrant. Lève une erreur si la signature est invalide. */
  parseInbound(req: Request): Promise<InboundMail>;
}
