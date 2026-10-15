import { Prisma } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { getDummyHash, hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import { HttpError } from "./http";
import { credentialsSchema, loginSchema } from "./validation";
import { mailProvider } from "./mail";
import { audit } from "./audit";

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 3600 * 1000;

export async function signup(input: unknown, ip?: string) {
  const { email, password } = credentialsSchema.parse(input);
  const passwordHash = await hashPassword(password);
  try {
    const user = await db.user.create({ data: { email, passwordHash } });
    await audit(user.id, "account.signup", undefined, ip);
    await sendVerificationEmail(user.id, user.email);
    return user;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "email_taken", "Un compte existe déjà avec cet email");
    }
    throw err;
  }
}

export async function login(input: unknown, ip?: string) {
  const { email, password } = loginSchema.parse(input);
  const user = await db.user.findUnique({ where: { email } });
  const invalid = new HttpError(401, "invalid_credentials", "Email ou mot de passe incorrect");

  if (!user) {
    await verifyPassword(password, await getDummyHash());
    throw invalid;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new HttpError(423, "account_locked", "Compte temporairement verrouillé après plusieurs échecs. Réessayez dans 15 minutes.");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: failed },
    });
    await audit(user.id, "account.login_failed", undefined, ip);
    throw invalid;
  }
  if (user.failedLogins || user.lockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  }
  await audit(user.id, "account.login", undefined, ip);
  return user;
}

export async function sendVerificationEmail(userId: string, email: string) {
  const token = randomToken(32);
  await db.verificationToken.deleteMany({ where: { userId } });
  await db.verificationToken.create({
    data: { tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
  });
  const link = `${env().APP_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
  try {
    await mailProvider().send({
      from: `no-reply@${env().MAIL_DOMAIN}`,
      fromName: "AncreMail",
      to: [email],
      subject: "Confirmez votre adresse email",
      text: `Bienvenue sur AncreMail.\n\nConfirmez votre adresse en ouvrant ce lien (valable 24 h) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`,
    });
  } catch (err) {
    console.error("[verify] envoi impossible", err);
  }
  if (env().NODE_ENV === "development") console.info(`[verify] lien de vérification (dev) : ${link}`);
  return token;
}

export async function verifyEmail(token: string) {
  if (!token || token.length > 100) return false;
  const record = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.expiresAt < new Date()) return false;
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    db.verificationToken.deleteMany({ where: { userId: record.userId } }),
  ]);
  await audit(record.userId, "account.email_verified");
  return true;
}
