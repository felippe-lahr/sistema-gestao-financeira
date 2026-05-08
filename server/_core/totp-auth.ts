/**
 * Rotas de autenticação de dois fatores (2FA) via TOTP (Google Authenticator).
 *
 * Endpoints:
 *   GET  /api/auth/2fa/status        — Retorna se o 2FA está ativo para o usuário logado
 *   POST /api/auth/2fa/setup         — Inicia a configuração: gera chave secreta e QR Code
 *   POST /api/auth/2fa/activate      — Confirma a ativação com um código TOTP válido
 *   POST /api/auth/2fa/deactivate    — Desativa o 2FA (requer código TOTP ou senha)
 *   POST /api/auth/2fa/verify        — Verifica um código TOTP durante o login (etapa 2)
 */
import { type Express, type Request, type Response } from "express";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import * as db from "../db";
import { COOKIE_NAME } from "@shared/const";

// Configurar o authenticator para compatibilidade com Google Authenticator
authenticator.options = {
  window: 1, // Aceita 1 passo antes/depois para tolerância de clock skew (~30s)
};

const APP_NAME = "UnifiquePro";

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
  // Retorna o status do 2FA para o usuário logado
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
  // Inicia a configuração do 2FA: gera uma nova chave secreta e retorna o QR Code
  app.post("/api/auth/2fa/setup", async (req: Request, res: Response) => {
    try {
      const session = await getUserIdFromSession(req);
      if (!session) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }

      // Buscar o e-mail do usuário para o QR Code
      const user = await db.getUserByOpenId(session.openId);
      if (!user) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
      }

      // Verificar se o 2FA já está ativo
      const totpData = await db.getUserTotpData(session.userId);
      if (totpData?.totpEnabled) {
        res.status(400).json({ error: "O 2FA já está ativo. Desative-o primeiro para reconfigurar." });
        return;
      }

      // Gerar nova chave secreta
      const secret = authenticator.generateSecret();

      // Salvar como chave pendente (ainda não ativa)
      await db.saveTotpPendingSecret(session.userId, secret);

      // Gerar a URL TOTP (padrão otpauth://)
      const accountName = user.email || user.name || `user_${user.id}`;
      const otpauthUrl = authenticator.keyuri(accountName, APP_NAME, secret);

      // Gerar o QR Code como Data URL (base64 PNG)
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      res.json({
        secret,
        qrCodeDataUrl,
        otpauthUrl,
      });
    } catch (error) {
      console.error("[2FA] Error setting up:", error);
      res.status(500).json({ error: "Erro ao configurar o 2FA" });
    }
  });

  // ─── POST /api/auth/2fa/activate ─────────────────────────────────────────────
  // Confirma a ativação do 2FA com um código TOTP válido
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

      // Buscar a chave pendente
      const totpData = await db.getUserTotpData(session.userId);
      if (!totpData?.totpPendingSecret) {
        res.status(400).json({ error: "Nenhuma configuração de 2FA pendente. Inicie o processo novamente." });
        return;
      }

      // Validar o código com a chave pendente
      const isValid = authenticator.verify({
        token: code,
        secret: totpData.totpPendingSecret,
      });

      if (!isValid) {
        res.status(400).json({ error: "Código incorreto. Verifique o aplicativo e tente novamente." });
        return;
      }

      // Ativar o 2FA (move pending → active)
      await db.activateTotp(session.userId);

      console.log(`[2FA] Activated for userId: ${session.userId}`);
      res.json({ success: true, message: "Autenticação de dois fatores ativada com sucesso!" });
    } catch (error) {
      console.error("[2FA] Error activating:", error);
      res.status(500).json({ error: "Erro ao ativar o 2FA" });
    }
  });

  // ─── POST /api/auth/2fa/deactivate ───────────────────────────────────────────
  // Desativa o 2FA (requer código TOTP atual para confirmar)
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

      // Buscar a chave ativa
      const totpData = await db.getUserTotpData(session.userId);
      if (!totpData?.totpEnabled || !totpData.totpSecret) {
        res.status(400).json({ error: "O 2FA não está ativo para este usuário." });
        return;
      }

      // Validar o código com a chave ativa
      const isValid = authenticator.verify({
        token: code,
        secret: totpData.totpSecret,
      });

      if (!isValid) {
        res.status(400).json({ error: "Código incorreto. Verifique o aplicativo e tente novamente." });
        return;
      }

      // Desativar o 2FA
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
  // Recebe: { openId, code }
  // Retorna: { success: true } ou erro
  // NOTA: Este endpoint é chamado ANTES da criação da sessão definitiva.
  //       O frontend deve chamar /api/auth/login primeiro, receber { requiresTwoFactor: true, openId },
  //       e então chamar este endpoint com o código. Após verificação bem-sucedida, a sessão é criada.
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

      // Buscar dados TOTP pelo openId
      const totpData = await db.getUserTotpDataByOpenId(openId);
      if (!totpData || !totpData.totpEnabled || !totpData.totpSecret) {
        res.status(400).json({ error: "2FA não está ativo para este usuário." });
        return;
      }

      // Validar o código
      const isValid = authenticator.verify({
        token: code,
        secret: totpData.totpSecret,
      });

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
