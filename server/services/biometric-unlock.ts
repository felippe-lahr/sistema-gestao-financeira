/**
 * Desbloqueio com Face ID / digital (WebAuthn, autenticador do próprio aparelho).
 *
 * O app instalado com "Manter conectado" fica bloqueado após um tempo fora da
 * tela; para desbloquear, o aparelho assina um desafio com a biometria e o
 * servidor confere a assinatura com a chave pública registrada aqui.
 *
 * Desafios ficam em memória por 5 min (servidor único no Railway).
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { webauthnCredentials } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const RP_NAME = "UnifiquePro";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const challenges = new Map<string, { challenge: string; expiresAt: number }>();

function rp() {
  const origin = new URL(ENV.appUrl).origin;
  return { origin, rpID: new URL(origin).hostname };
}

function putChallenge(key: string, challenge: string) {
  const now = Date.now();
  challenges.forEach((v, k) => { if (v.expiresAt < now) challenges.delete(k); });
  challenges.set(key, { challenge, expiresAt: now + CHALLENGE_TTL_MS });
}

function takeChallenge(key: string): string | null {
  const entry = challenges.get(key);
  challenges.delete(key);
  return entry && entry.expiresAt > Date.now() ? entry.challenge : null;
}

const parseTransports = (raw: string | null): AuthenticatorTransportFuture[] | undefined => {
  try {
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

export async function registrationOptions(user: { id: number; email: string | null; name: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, user.id));
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp().rpID,
    userName: user.email || user.name || `usuario-${user.id}`,
    userDisplayName: user.name || user.email || "UnifiquePro",
    userID: new TextEncoder().encode(`unifique-user-${user.id}`),
    attestationType: "none",
    // Só o autenticador do próprio aparelho (Face ID / Touch ID / digital)
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: parseTransports(c.transports) })),
  });
  putChallenge(`reg:${user.id}`, options.challenge);
  return options;
}

export async function verifyRegistration(userId: number, response: RegistrationResponseJSON, deviceName?: string) {
  const expectedChallenge = takeChallenge(`reg:${userId}`);
  if (!expectedChallenge) throw new Error("Tempo esgotado. Tente novamente.");
  const { origin, rpID } = rp();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) throw new Error("Não foi possível confirmar a biometria.");

  const { credential } = verification.registrationInfo;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(webauthnCredentials)
    .values({
      userId,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      deviceName: deviceName?.slice(0, 255) ?? null,
    })
    .onConflictDoNothing();
  return { credentialId: credential.id };
}

export async function authenticationOptions(userId: number, credentialId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [cred] = await db
    .select()
    .from(webauthnCredentials)
    .where(and(eq(webauthnCredentials.userId, userId), eq(webauthnCredentials.credentialId, credentialId)))
    .limit(1);
  if (!cred) return null; // credencial removida/de outro usuário → o app desliga o bloqueio
  const options = await generateAuthenticationOptions({
    rpID: rp().rpID,
    userVerification: "required",
    allowCredentials: [{ id: cred.credentialId, transports: parseTransports(cred.transports) }],
  });
  putChallenge(`auth:${userId}`, options.challenge);
  return options;
}

export async function verifyAuthentication(userId: number, response: AuthenticationResponseJSON): Promise<boolean> {
  const expectedChallenge = takeChallenge(`auth:${userId}`);
  if (!expectedChallenge) return false;
  const db = await getDb();
  if (!db) return false;
  const [cred] = await db
    .select()
    .from(webauthnCredentials)
    .where(and(eq(webauthnCredentials.userId, userId), eq(webauthnCredentials.credentialId, response.id)))
    .limit(1);
  if (!cred) return false;

  const { origin, rpID } = rp();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: cred.credentialId,
      publicKey: isoBase64URL.toBuffer(cred.publicKey),
      counter: cred.counter,
      transports: parseTransports(cred.transports),
    },
  });
  if (!verification.verified) return false;
  await db
    .update(webauthnCredentials)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(webauthnCredentials.id, cred.id));
  return true;
}

export async function removeCredential(userId: number, credentialId: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(webauthnCredentials)
    .where(and(eq(webauthnCredentials.userId, userId), eq(webauthnCredentials.credentialId, credentialId)));
}
