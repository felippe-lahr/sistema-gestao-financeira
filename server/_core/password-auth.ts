import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import bcrypt from "bcryptjs";

export function registerPasswordAuthRoutes(app: Express) {
  // Login com email e senha
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: "Email e senha sao obrigatorios" });
        return;
      }

      // Buscar usuario pelo email
      const user = await db.getUserByEmail(email);
      if (!user) {
        res.status(401).json({ error: "Email ou senha incorretos" });
        return;
      }

      // Verificar senha
      const passwordHash = await db.getUserPassword(user.id);
      if (!passwordHash) {
        res.status(401).json({ error: "Usuario nao possui senha configurada" });
        return;
      }

      const isValid = await bcrypt.compare(password, passwordHash);
      if (!isValid) {
        res.status(401).json({ error: "Email ou senha incorretos" });
        return;
      }

      // Atualizar ultimo login
      await db.upsertUser({
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: "password",
        lastSignedIn: new Date(),
      });

      // Criar sessao
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
      console.error("[Password Auth] Login failed", error);
      res.status(500).json({ error: "Erro ao fazer login" });
    }
  });

  // Setup inicial de senha (rota temporaria para configurar senha inicial)
  app.post("/api/auth/setup-password", async (req: Request, res: Response) => {
    try {
      const { email, password, setupKey } = req.body;

      // Chave de setup para seguranca (deve ser removida apos configuracao)
      if (setupKey !== "SETUP_INITIAL_2026") {
        res.status(403).json({ error: "Chave de setup invalida" });
        return;
      }

      if (!email || !password) {
        res.status(400).json({ error: "Email e senha sao obrigatorios" });
        return;
      }

      // Buscar usuario pelo email
      const user = await db.getUserByEmail(email);
      if (!user) {
        res.status(404).json({ error: "Usuario nao encontrado" });
        return;
      }

      // Verificar se ja tem senha
      const existingPassword = await db.getUserPassword(user.id);
      if (existingPassword) {
        res.status(400).json({ error: "Usuario ja possui senha configurada" });
        return;
      }

      // Configurar senha
      const passwordHash = await bcrypt.hash(password, 10);
      await db.setUserPassword(user.id, passwordHash);

      // Atualizar nome do usuario
      await db.upsertUser({
        openId: user.openId,
        name: "Felippe Lahr",
        email: user.email,
        loginMethod: "password",
        lastSignedIn: new Date(),
      });

      res.json({ success: true, message: "Senha configurada com sucesso" });
    } catch (error) {
      console.error("[Password Auth] Setup password failed", error);
      res.status(500).json({ error: "Erro ao configurar senha" });
    }
  });

  // Alterar senha
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: "Senha atual e nova senha sao obrigatorias" });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({ error: "A nova senha deve ter pelo menos 6 caracteres" });
        return;
      }

      // Obter usuario da sessao
      const sessionToken = req.cookies[COOKIE_NAME];
      if (!sessionToken) {
        res.status(401).json({ error: "Nao autenticado" });
        return;
      }

      const sessionInfo = await sdk.verifySession(sessionToken);
      if (!sessionInfo || !sessionInfo.openId) {
        res.status(401).json({ error: "Sessao invalida" });
        return;
      }

      const user = await db.getUserByOpenId(sessionInfo.openId);
      if (!user) {
        res.status(401).json({ error: "Usuario nao encontrado" });
        return;
      }

      // Verificar senha atual
      const currentPasswordHash = await db.getUserPassword(user.id);
      if (currentPasswordHash) {
        const isValid = await bcrypt.compare(currentPassword, currentPasswordHash);
        if (!isValid) {
          res.status(401).json({ error: "Senha atual incorreta" });
          return;
        }
      }

      // Atualizar senha
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await db.setUserPassword(user.id, newPasswordHash);

      res.json({ success: true });
    } catch (error) {
      console.error("[Password Auth] Change password failed", error);
      res.status(500).json({ error: "Erro ao alterar senha" });
    }
  });
}
