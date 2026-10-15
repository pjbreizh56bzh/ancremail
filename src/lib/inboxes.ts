import { Prisma, type Inbox, type Message, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { env } from "./env";
import { randomToken } from "./crypto";
import { HttpError } from "./http";
import { PLANS, startOfMonthUtc } from "./plans";
import { mailProvider } from "./mail";
import type { InboundMail } from "./mail/provider";
import { createInboxSchema, paginationSchema, sendMessageSchema } from "./validation";
import { audit } from "./audit";

export function serializeInbox(i: Inbox) {
  return { id: i.id, address: i.address, displayName: i.displayName, createdAt: i.createdAt.toISOString() };
}

export function serializeMessage(m: Message) {
  return {
    id: m.id,
    inboxId: m.inboxId,
    direction: m.direction.toLowerCase(),
    status: m.status.toLowerCase(),
    from: m.fromAddress,
    to: m.toAddresses,
    subject: m.subject,
    text: m.text,
    html: m.html,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
  };
}

export async function usage(userId: string) {
  const [inboxes, sends] = await Promise.all([
    db.inbox.count({ where: { userId, deletedAt: null } }),
    db.message.count({
      where: { direction: "OUTBOUND", createdAt: { gte: startOfMonthUtc() }, inbox: { userId } },
    }),
  ]);
  return { inboxes, sends };
}

export async function createInbox(user: User, input: unknown, ip?: string) {
  const data = createInboxSchema.parse(input);
  const plan = PLANS[user.plan];
  const { inboxes } = await usage(user.id);
  if (inboxes >= plan.maxInboxes) {
    throw new HttpError(402, "quota_exceeded", `Limite de ${plan.maxInboxes} boîtes atteinte pour le plan ${plan.name}`);
  }
  const username = data.username ?? `agent-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
  const address = `${username}@${env().MAIL_DOMAIN.toLowerCase()}`;
  try {
    const inbox = await db.inbox.create({ data: { userId: user.id, address, displayName: data.displayName } });
    await audit(user.id, "inbox.create", address, ip);
    return inbox;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "address_taken", "Cette adresse est déjà prise");
    }
    throw err;
  }
}

export async function listInboxes(userId: string, query: unknown) {
  const { limit, cursor } = paginationSchema.parse(query);
  const items = await db.inbox.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  return { data: page.map(serializeInbox), nextCursor: hasMore ? page[page.length - 1].id : null };
}

/** Récupère une boîte en vérifiant qu'elle appartient à l'utilisateur (anti-IDOR). */
export async function getOwnedInbox(userId: string, inboxId: string) {
  if (!z.string().max(64).safeParse(inboxId).success) throw new HttpError(404, "not_found", "Boîte introuvable");
  const inbox = await db.inbox.findFirst({ where: { id: inboxId, userId, deletedAt: null } });
  if (!inbox) throw new HttpError(404, "not_found", "Boîte introuvable");
  return inbox;
}

export async function deleteInbox(userId: string, inboxId: string, ip?: string) {
  const inbox = await getOwnedInbox(userId, inboxId);
  await db.inbox.update({ where: { id: inbox.id }, data: { deletedAt: new Date() } });
  await audit(userId, "inbox.delete", inbox.address, ip);
}

export async function listMessages(userId: string, inboxId: string, query: unknown) {
  const inbox = await getOwnedInbox(userId, inboxId);
  const { limit, cursor } = paginationSchema.parse(query);
  const items = await db.message.findMany({
    where: { inboxId: inbox.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  return { data: page.map(serializeMessage), nextCursor: hasMore ? page[page.length - 1].id : null };
}

export async function getMessage(userId: string, inboxId: string, messageId: string) {
  const inbox = await getOwnedInbox(userId, inboxId);
  const msg = await db.message.findFirst({ where: { id: messageId.slice(0, 64), inboxId: inbox.id } });
  if (!msg) throw new HttpError(404, "not_found", "Message introuvable");
  if (!msg.readAt && msg.direction === "INBOUND") {
    return db.message.update({ where: { id: msg.id }, data: { readAt: new Date() } });
  }
  return msg;
}

export async function sendMessage(user: User, inboxId: string, input: unknown, idempotencyKey?: string | null) {
  if (!user.emailVerifiedAt) {
    throw new HttpError(403, "email_not_verified", "Vérifiez l'email de votre compte avant d'envoyer des messages");
  }
  const inbox = await getOwnedInbox(user.id, inboxId);
  const data = sendMessageSchema.parse(input);
  const key = idempotencyKey ? z.string().min(1).max(100).parse(idempotencyKey) : null;

  if (key) {
    const existing = await db.message.findUnique({ where: { inboxId_idempotencyKey: { inboxId: inbox.id, idempotencyKey: key } } });
    if (existing) return { message: existing, replayed: true };
  }

  const plan = PLANS[user.plan];
  const { sends } = await usage(user.id);
  if (sends >= plan.monthlySends) {
    throw new HttpError(402, "quota_exceeded", `Quota de ${plan.monthlySends} envois mensuels atteint`);
  }

  let message: Message;
  try {
    message = await db.message.create({
      data: {
        inboxId: inbox.id,
        direction: "OUTBOUND",
        status: "QUEUED",
        fromAddress: inbox.address,
        toAddresses: data.to,
        subject: data.subject,
        text: data.text,
        html: data.html,
        idempotencyKey: key,
      },
    });
  } catch (err) {
    if (key && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.message.findUniqueOrThrow({
        where: { inboxId_idempotencyKey: { inboxId: inbox.id, idempotencyKey: key } },
      });
      return { message: existing, replayed: true };
    }
    throw err;
  }

  try {
    const { providerMessageId } = await mailProvider().send({
      from: inbox.address,
      fromName: inbox.displayName,
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
    });
    message = await db.message.update({ where: { id: message.id }, data: { status: "SENT", providerMessageId } });
  } catch (err) {
    console.error("[mail] échec d'envoi", err);
    await db.message.update({ where: { id: message.id }, data: { status: "FAILED", error: "provider_error" } });
    throw new HttpError(502, "send_failed", "Le fournisseur d'email a refusé l'envoi");
  }
  return { message, replayed: false };
}

export async function receiveInbound(mail: InboundMail) {
  const inbox = await db.inbox.findUnique({ where: { address: mail.recipient } });
  if (!inbox || inbox.deletedAt) return { accepted: false as const };
  try {
    const message = await db.message.create({
      data: {
        inboxId: inbox.id,
        direction: "INBOUND",
        status: "RECEIVED",
        fromAddress: mail.from.slice(0, 320),
        toAddresses: mail.to.length ? mail.to : [mail.recipient],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        providerMessageId: mail.providerMessageId,
      },
    });
    return { accepted: true as const, messageId: message.id };
  } catch (err) {
    // Doublon (même Message-Id) : livraison déjà enregistrée, on acquitte sans recréer.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { accepted: true as const, duplicate: true };
    }
    throw err;
  }
}
