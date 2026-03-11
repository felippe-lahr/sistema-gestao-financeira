/**
 * Google OAuth 2.0 Authentication
 *
 * Fluxo seguro:
 * 1. /api/auth/google        → gera state token (CSRF) + redireciona para Google
 * 2. /api/auth/google/callback → valida state, troca código por token, verifica com Google,
 *                                cria/atualiza usuário, cria sessão interna
 *
 * Segurança:
 * - State token armazenado em cookie HttpOnly para prevenir CSRF
 * - Token ID verificado com a chave pública do Google (não apenas decodificado)
 * - Sem armazenamento de tokens do Google — apenas sessão interna após verificação
 * - HTTPS obrigatório em produção (cookies Secure)
 */

import { randomBytes } from "crypto";
import type { Express, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

const GOOGLE_STATE_COOKIE = "google_oauth_state";
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function getOAuth2Client(): OAuth2Client {
  const redirectUri = `${ENV.appUrl}/api/auth/google/callback`;
  return new OAuth2Client({
    clientId: ENV.googleClientId,
    clientSecret: ENV.googleClientSecret,
    redirectUri,
  });
}

export function registerGoogleAuthRoutes(app: Express) {
  /**
   * Inicia o fluxo OAuth com o Google.
   * Gera um state token aleatório, armazena em cookie HttpOnly e redireciona para o Google.
   */
  app.get("/api/auth/google", (req: Request, res: Response) => {
    if (!ENV.googleClientId || !ENV.googleClientSecret) {
      console.error("[Google Auth] GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não configurados");
      res.redirect("/?error=google_not_configured");
      return;
    }

    // Gerar state token aleatório para prevenir CSRF
    const state = randomBytes(32).toString("hex");

    // Armazenar state em cookie HttpOnly (15 minutos de validade)
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(GOOGLE_STATE_COOKIE, state, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 minutos
      httpOnly: true,
    });

    const client = getOAuth2Client();
    const authUrl = client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      prompt: "select_account",
    });

    console.log("[Google Auth] Redirecionando para Google OAuth");
    res.redirect(302, authUrl);
  });

  /**
   * Callback do Google OAuth.
   * Valida o state token, troca o código de autorização pelo token de ID,
   * verifica o token com a chave pública do Google, cria/atualiza o usuário
   * e cria uma sessão interna.
   */
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const error = typeof req.query.error === "string" ? req.query.error : null;

    // Limpar cookie de state independentemente do resultado
    res.clearCookie(GOOGLE_STATE_COOKIE);

    // Usuário cancelou o login
    if (error) {
      console.warn("[Google Auth] Usuário cancelou ou erro do Google:", error);
      res.redirect("/?error=google_cancelled");
      return;
    }

    if (!code || !state) {
      console.error("[Google Auth] Código ou state ausente no callback");
      res.redirect("/?error=google_invalid_callback");
      return;
    }

    // Validar state token (proteção CSRF)
    const storedState = req.cookies?.[GOOGLE_STATE_COOKIE];
    if (!storedState || storedState !== state) {
      console.error("[Google Auth] State token inválido — possível ataque CSRF");
      res.redirect("/?error=google_invalid_state");
      return;
    }

    try {
      const client = getOAuth2Client();

      // Trocar código de autorização por tokens
      const { tokens } = await client.getToken(code);

      if (!tokens.id_token) {
        console.error("[Google Auth] id_token ausente na resposta do Google");
        res.redirect("/?error=google_no_id_token");
        return;
      }

      // Verificar e decodificar o ID token com a chave pública do Google
      // Isso garante que o token foi emitido pelo Google e não foi adulterado
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: ENV.googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        console.error("[Google Auth] Payload do token inválido");
        res.redirect("/?error=google_invalid_token");
        return;
      }

      const googleId = payload.sub;
      const email = payload.email ?? null;
      const name = payload.name ?? null;
      const emailVerified = payload.email_verified ?? false;

      if (!email) {
        console.error("[Google Auth] E-mail não disponível no token do Google");
        res.redirect("/?error=google_no_email");
        return;
      }

      console.log(`[Google Auth] Login Google bem-sucedido para: ${email}`);

      // Verificar se já existe usuário com este e-mail (conta criada via senha)
      const existingUserByEmail = await db.getUserByEmail(email);

      let openId: string;

      if (existingUserByEmail) {
        // Usuário já existe — vincular conta Google ao usuário existente
        openId = existingUserByEmail.openId;
        await db.upsertUser({
          openId,
          name: existingUserByEmail.name || name,
          email,
          loginMethod: "google",
          lastSignedIn: new Date(),
        });

        // Se o usuário tinha e-mail não verificado, marcar como verificado
        // (Google já verificou o e-mail)
        if (emailVerified) {
          try {
            // Marcar e-mail como verificado via Google (inserir registro verificado se não existir)
            await db.ensureEmailVerifiedForGoogleUser(existingUserByEmail.id);
          } catch {
            // Pode não ter registro de verificação — ignorar
          }
        }

        console.log(`[Google Auth] Usuário existente vinculado ao Google: ${email}`);
      } else {
        // Novo usuário — criar conta automaticamente
        openId = `google:${googleId}`;

        await db.upsertUser({
          openId,
          name,
          email,
          loginMethod: "google",
          lastSignedIn: new Date(),
        });

        // Criar organização padrão para o novo usuário
        try {
          const user = await db.getUserByOpenId(openId);
          if (user) {
            await db.ensureOrganizationForUser(user);
          }
        } catch (orgError) {
          console.error("[Google Auth] Erro ao criar organização:", orgError);
          // Não bloquear o login por falha na criação da org
        }

        console.log(`[Google Auth] Novo usuário criado via Google: ${email}`);
      }

      // Criar sessão interna (30 minutos por padrão, sem "lembrar")
      const sessionToken = await sdk.createSessionToken(openId, {
        name: name || "",
        expiresInMs: THIRTY_MINUTES_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: THIRTY_MINUTES_MS,
      });

      // Definir valores financeiros como ocultos por padrão (via redirect com script)
      res.redirect(302, "/auth/google/success");
    } catch (error) {
      console.error("[Google Auth] Erro no callback:", error);
      res.redirect("/?error=google_auth_failed");
    }
  });
}
