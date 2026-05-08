/**
 * Rotas de autenticação de dois fatores (2FA) via TOTP (Google Authenticator).
 *
 * Endpoints:
 *   GET  /api/auth/2fa/status        — Retorna se o 2FA está ativo para o usuário logado
 *   POST /api/auth/2fa/setup         — Inicia a configuração: gera chave secreta e QR Code
 *   POST /api/auth/2fa/activate      — Confirma a ativação com um código TOTP válido
 *   POST /api/auth/2fa/deactivate    — Desativa o 2FA (requer código TOTP)
 *   POST /api/auth/2fa/verify        — Verifica um código TOTP durante o login (etapa 2)
 */
import { type Express, type Request, type Response } from "express";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import * as db from "../db";
import { COOKIE_NAME } from "@shared/const";

const APP_NAME = "UnifiquePro";

/**
 * Verifica um código TOTP contra uma chave secreta.
 * Usa window=1 para tolerar até ~30s de diferença de clock.
 * O verifySync do otplib v13 retorna { valid: boolean }, não um booleano direto.
 */
function verifyTotpCode(token: string, secret: string): boolean {
  const result = verifySync({ token, secret, strategy: "totp" });
  // otplib v13 retorna { valid: boolean } ou boolean dependendo da versão
  if (typeof result === "object" && result !== null && "valid" in result) {
    return (result as { valid: boolean }).valid;
  }
  return !!result;
}

/**
 * Extrai o userId da sessão atual da requisição.
 * Retorna null se não houver sessão válida.
 */
async function getUserIdFromSession(req: Request): Promise<{ userId: number; openId: string } | null> {
  try {
    const { sdk } = await import("./sdk");
    let sessionToken = req.cookies?.[COOKIE_NAME];
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        sessionToken = authHeader.substring(7);
      }
    }
    if (!sessionToken) return null;

    const sessionInfo = await sdk.verifySession(sessionToken);
    if (!sessionInfo?.openId) return null;

    const user = await db.getUserByOpenId(sessionInfo.openId);
    if (!user) return null;

    return { userId: user.id, openId: sessionInfo.openId };
  } catch {
    return null;
  }
}

export function registerTotpRoutes(app: Express) {
  // ─── GET /api/auth/2fa/status ────────────────────────────────────────────────
  app.get("/api/auth/2fa/status", async (req: Request, res: Response) => {
    try {
      const session = await getUserIdFromSession(req);
      if (!session) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      const totpData = await db.getUserTotpData(session.userId);
      res.json({
        enabled: totpData?.totpEnabled ?? false,
        hasPendingSetup: !!totpData?.totpPendingSecret,
      });
    } catch (error) {
      console.error("[2FA] Error getting status:", error);
      res.status(500).json({ error: "Erro ao verificar status do 2FA" });
    }
  });

  // ─── POST /api/auth/2fa/setup ────────────────────────────────────────────────
  app.post("/api/auth/2fa/setup", async (req: Request, res: Response) => {
    try {
      const session = await getUserIdFromSession(req);
      if (!session) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      const user = await db.getUserByOpenId(session.openId);
      if (!user) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
      }

      const totpData = await db.getUserTotpData(session.userId);
      if (totpData?.totpEnabled) {
        res.status(400).json({ error: "O 2FA já está ativo. Desative-o primeiro para reconfigurar." });
        return;
      }

      // Gerar nova chave secreta (otplib v13 API)
      const secret = generateSecret({});

      // Salvar como chave pendente (ainda não ativa)
      await db.saveTotpPendingSecret(session.userId, secret);

      // Gerar a URL TOTP (padrão otpauth://)
      const accountName = user.email || user.name || `user_${user.id}`;
      const otpauthUrl = generateURI({
        issuer: APP_NAME,
        label: accountName,
        secret,
        strategy: "totp",
      });

      // Gerar o QR Code como Data URL (base64 PNG)
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      res.json({ secret, qrCodeDataUrl, otpauthUrl });
    } catch (error) {
      console.error("[2FA] Error setting up:", error);
      res.status(500).json({ error: "Erro ao configurar o 2FA" });
    }
  });

  // ─── POST /api/auth/2fa/activate ─────────────────────────────────────────────
  app.post("/api/auth/2fa/activate", async (req: Request, res: Response) => {
    try {
      const session = await getUserIdFromSession(req);
      if (!session) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      const { code } = req.body;
      if (!code || typeof code !== "string" || code.length !== 6) {
        res.status(400).json({ error: "Código inválido. Informe os 6 dígitos do aplicativo." });
        return;
      }

      const totpData = await db.getUserTotpData(session.userId);
      if (!totpData?.totpPendingSecret) {
        res.status(400).json({ error: "Nenhuma configuração de 2FA pendente. Inicie o processo novamente." });
        return;
      }

      const isValid = verifyTotpCode(code, totpData.totpPendingSecret);

      if (!isValid) {
        res.status(400).json({ error: "Código incorreto. Verifique o aplicativo e tente novamente." });
        return;
      }

      await db.activateTotp(session.userId);

      console.log(`[2FA] Activated for userId: ${session.userId}`);
      res.json({ success: true, message: "Autenticação de dois fatores ativada com sucesso!" });
    } catch (error) {
      console.error("[2FA] Error activating:", error);
      res.status(500).json({ error: "Erro ao ativar o 2FA" });
    }
  });

  // ─── POST /api/auth/2fa/deactivate ───────────────────────────────────────────
  app.post("/api/auth/2fa/deactivate", async (req: Request, res: Response) => {
    try {
      const session = await getUserIdFromSession(req);
      if (!session) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      const { code } = req.body;
      if (!code || typeof code !== "string" || code.length !== 6) {
        res.status(400).json({ error: "Código inválido. Informe os 6 dígitos do aplicativo para confirmar." });
        return;
      }

      const totpData = await db.getUserTotpData(session.userId);
      if (!totpData?.totpEnabled || !totpData.totpSecret) {
        res.status(400).json({ error: "O 2FA não está ativo para este usuário." });
        return;
      }

      const isValid = verifyTotpCode(code, totpData.totpSecret);

      if (!isValid) {
        res.status(400).json({ error: "Código incorreto. Verifique o aplicativo e tente novamente." });
        return;
      }

      await db.deactivateTotp(session.userId);

      console.log(`[2FA] Deactivated for userId: ${session.userId}`);
      res.json({ success: true, message: "Autenticação de dois fatores desativada." });
    } catch (error) {
      console.error("[2FA] Error deactivating:", error);
      res.status(500).json({ error: "Erro ao desativar o 2FA" });
    }
  });

  // ─── POST /api/auth/2fa/verify ───────────────────────────────────────────────
  // Verifica o código TOTP durante o fluxo de login (etapa 2)
  app.post("/api/auth/2fa/verify", async (req: Request, res: Response) => {
    try {
      const { openId, code, rememberMe } = req.body;

      if (!openId || !code) {
        res.status(400).json({ error: "openId e código são obrigatórios" });
        return;
      }

      if (typeof code !== "string" || code.length !== 6) {
        res.status(400).json({ error: "Código inválido. Informe os 6 dígitos do aplicativo." });
        return;
      }

      const totpData = await db.getUserTotpDataByOpenId(openId);
      if (!totpData || !totpData.totpEnabled || !totpData.totpSecret) {
        res.status(400).json({ error: "2FA não está ativo para este usuário." });
        return;
      }

      const isValid = verifyTotpCode(code, totpData.totpSecret);

      if (!isValid) {
        res.status(401).json({ error: "Código incorreto. Verifique o aplicativo e tente novamente." });
        return;
      }

      // Código válido — criar a sessão definitiva
      const { sdk } = await import("./sdk");
      const { getSessionCookieOptions } = await import("./cookies");
      const user = await db.getUserByOpenId(openId);
      if (!user) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
      }

      const THIRTY_MINUTES_MS = 30 * 60 * 1000;
      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const sessionDuration = rememberMe ? TWENTY_FOUR_HOURS_MS : THIRTY_MINUTES_MS;

      const sessionToken = await sdk.createSessionToken(openId, {
        name: user.name || "",
        expiresInMs: sessionDuration,
        rememberMe: !!rememberMe,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionDuration });

      console.log(`[2FA] Login verified for userId: ${totpData.id}`);
      res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
      console.error("[2FA] Error verifying login code:", error);
      res.status(500).json({ error: "Erro ao verificar código 2FA" });
    }
  });
}
