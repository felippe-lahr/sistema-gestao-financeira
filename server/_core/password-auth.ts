import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

export function registerPasswordAuthRoutes(app: Express) {
  // Login com email e senha
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password, rememberMe } = req.body;

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

      // Verificar se o e-mail foi confirmado (apenas para contas criadas via registro self-service)
      // Usuários legados (sem registro em email_verifications) são considerados verificados
      const hasVerificationRecord = await db.hasEmailVerificationRecord(user.id);
      if (hasVerificationRecord) {
        const emailVerified = await db.isUserEmailVerified(user.id);
        if (!emailVerified) {
          res.status(403).json({
            error: "E-mail não verificado. Verifique sua caixa de entrada e clique no link de ativação.",
            code: "EMAIL_NOT_VERIFIED",
            email: user.email,
          });
          return;
        }
      }

      // Atualizar ultimo login
      await db.upsertUser({
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: "password",
        lastSignedIn: new Date(),
      });

      // Criar sessao com duração baseada em rememberMe
      // 30 minutos (1800000 ms) por padrão, 24 horas (86400000 ms) se rememberMe = true
      const THIRTY_MINUTES_MS = 30 * 60 * 1000;
      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const sessionDuration = rememberMe ? TWENTY_FOUR_HOURS_MS : THIRTY_MINUTES_MS;
      
      console.log("[Password Auth] Login - rememberMe:", rememberMe);
      console.log("[Password Auth] Login - sessionDuration (ms):", sessionDuration);
      console.log("[Password Auth] Login - sessionDuration (hours):", sessionDuration / (60 * 60 * 1000));
      
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: sessionDuration,
        rememberMe: rememberMe,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionDuration });

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

      // Configurar ou resetar senha (sobrescreve se já existir)
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

  // Registro de novo usuário via convite
  // Fluxo: token de convite válido + email + nome + senha => cria conta + aceita convite + faz login
  app.post("/api/auth/register-invite", async (req: Request, res: Response) => {
    try {
      const { token, name, password } = req.body;

      if (!token || !name || !password) {
        res.status(400).json({ error: "Token, nome e senha são obrigatórios" });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
        return;
      }

      // Validar o convite pelo token
      const invite = await db.getEntityInviteByToken(token);
      if (!invite) {
        res.status(404).json({ error: "Convite não encontrado ou inválido" });
        return;
      }
      if (invite.status !== "PENDING") {
        res.status(400).json({ error: "Este convite já foi utilizado" });
        return;
      }
      if (new Date() > new Date(invite.expiresAt)) {
        res.status(400).json({ error: "Este convite expirou" });
        return;
      }

      // O email vem do convite (obrigatório)
      const email = invite.email;
      if (!email) {
        res.status(400).json({ error: "Este convite não possui email associado" });
        return;
      }

      // Verificar se o email já está cadastrado
      const existingUser = await db.getUserByEmail(email);
      if (existingUser) {
        res.status(409).json({ error: "Este email já possui uma conta. Faça login para aceitar o convite.", emailExists: true });
        return;
      }

      // Criar novo usuário com openId único
      const openId = `local_${randomUUID().replace(/-/g, "")}`;
      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "password",
        lastSignedIn: new Date(),
      });

      const newUser = await db.getUserByEmail(email);
      if (!newUser) {
        res.status(500).json({ error: "Erro ao criar usuário" });
        return;
      }

      // Definir senha
      const passwordHash = await bcrypt.hash(password, 10);
      await db.setUserPassword(newUser.id, passwordHash);

      // Aceitar o convite: adicionar como membro da entidade
      await db.addEntityMember({
        entityId: invite.entityId,
        userId: newUser.id,
        role: invite.role,
        invitedBy: invite.invitedBy,
      });
      await db.acceptEntityInvite(token);

      // Criar sessão (24h)
      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: TWENTY_FOUR_HOURS_MS,
        rememberMe: false,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: TWENTY_FOUR_HOURS_MS });

      res.json({
        success: true,
        user: { id: newUser.id, name: newUser.name, email: newUser.email },
        entityId: invite.entityId,
      });
    } catch (error) {
      console.error("[Password Auth] Register invite failed", error);
      res.status(500).json({ error: "Erro ao criar conta" });
    }
  });

  // Aceitar convite com login (usuário já tem conta)
  // Fluxo: token de convite válido + email + senha => faz login + aceita convite
  app.post("/api/auth/login-accept-invite", async (req: Request, res: Response) => {
    try {
      const { token, email, password, rememberMe } = req.body;

      if (!token || !email || !password) {
        res.status(400).json({ error: "Token, email e senha são obrigatórios" });
        return;
      }

      // Validar o convite
      const invite = await db.getEntityInviteByToken(token);
      if (!invite) {
        res.status(404).json({ error: "Convite não encontrado ou inválido" });
        return;
      }
      if (invite.status !== "PENDING") {
        res.status(400).json({ error: "Este convite já foi utilizado" });
        return;
      }
      if (new Date() > new Date(invite.expiresAt)) {
        res.status(400).json({ error: "Este convite expirou" });
        return;
      }

      // Verificar se o email bate com o do convite
      if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
        res.status(403).json({ error: "Este convite foi enviado para outro email" });
        return;
      }

      // Login normal
      const user = await db.getUserByEmail(email);
      if (!user) {
        res.status(401).json({ error: "Email ou senha incorretos" });
        return;
      }

      const passwordHash = await db.getUserPassword(user.id);
      if (!passwordHash) {
        res.status(401).json({ error: "Usuário não possui senha configurada" });
        return;
      }

      const isValid = await bcrypt.compare(password, passwordHash);
      if (!isValid) {
        res.status(401).json({ error: "Email ou senha incorretos" });
        return;
      }

      // Verificar se já é membro
      const isMember = await db.isEntityMember(invite.entityId, user.id);
      if (!isMember) {
        // Adicionar como membro
        await db.addEntityMember({
          entityId: invite.entityId,
          userId: user.id,
          role: invite.role,
          invitedBy: invite.invitedBy,
        });
        await db.acceptEntityInvite(token);
      }

      // Atualizar último login
      await db.upsertUser({
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: "password",
        lastSignedIn: new Date(),
      });

      const THIRTY_MINUTES_MS = 30 * 60 * 1000;
      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const sessionDuration = rememberMe ? TWENTY_FOUR_HOURS_MS : THIRTY_MINUTES_MS;

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: sessionDuration,
        rememberMe,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionDuration });

      res.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email },
        entityId: invite.entityId,
      });
    } catch (error) {
      console.error("[Password Auth] Login accept invite failed", error);
      res.status(500).json({ error: "Erro ao fazer login" });
    }
  });

  // Alterar senha
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    try {
      console.log("[Password Auth] Change password request received");
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        console.log("[Password Auth] Missing passwords");
        res.status(400).json({ error: "Senha atual e nova senha sao obrigatorias" });
        return;
      }

      if (newPassword.length < 6) {
        console.log("[Password Auth] New password too short");
        res.status(400).json({ error: "A nova senha deve ter pelo menos 6 caracteres" });
        return;
      }

      // Obter usuario da sessao - tentar de cookies ou header
      let sessionToken = req.cookies?.[COOKIE_NAME];
      
      // Se não encontrou no cookies, tentar no header Authorization
      if (!sessionToken) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          sessionToken = authHeader.substring(7);
        }
      }
      
      console.log("[Password Auth] Session token found:", !!sessionToken);
      console.log("[Password Auth] Cookies:", JSON.stringify(req.cookies));
      
      if (!sessionToken) {
        console.log("[Password Auth] No session token");
        res.status(401).json({ error: "Nao autenticado - sessao nao encontrada" });
        return;
      }

      const sessionInfo = await sdk.verifySession(sessionToken);
      console.log("[Password Auth] Session info:", JSON.stringify(sessionInfo));
      
      if (!sessionInfo || !sessionInfo.openId) {
        console.log("[Password Auth] Invalid session");
        res.status(401).json({ error: "Sessao invalida" });
        return;
      }

      const user = await db.getUserByOpenId(sessionInfo.openId);
      console.log("[Password Auth] User found:", !!user, user?.id);
      
      if (!user) {
        console.log("[Password Auth] User not found");
        res.status(401).json({ error: "Usuario nao encontrado" });
        return;
      }

      // Verificar senha atual
      const currentPasswordHash = await db.getUserPassword(user.id);
      console.log("[Password Auth] Current password hash found:", !!currentPasswordHash);
      
      if (currentPasswordHash) {
        const isValid = await bcrypt.compare(currentPassword, currentPasswordHash);
        console.log("[Password Auth] Password valid:", isValid);
        if (!isValid) {
          res.status(401).json({ error: "Senha atual incorreta" });
          return;
        }
      }

      // Atualizar senha
      console.log("[Password Auth] Updating password for user:", user.id);
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await db.setUserPassword(user.id, newPasswordHash);

      console.log("[Password Auth] Password updated successfully");
      res.json({ success: true });
    } catch (error) {
      console.error("[Password Auth] Change password failed", error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({ error: "Erro ao alterar senha: " + errorMessage });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // REGISTRO SELF-SERVICE — Cadastro de novo usuário com organização
  // ─────────────────────────────────────────────────────────────────────────────

  // POST /api/auth/register — Cria conta + organização + envia e-mail de verificação
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { name, email, password, organizationName } = req.body;

      if (!name || !email || !password || !organizationName) {
        res.status(400).json({ error: "Todos os campos são obrigatórios" });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres" });
        return;
      }

      // Verificar se o e-mail já está cadastrado
      const existingUser = await db.getUserByEmail(email.toLowerCase().trim());
      if (existingUser) {
        res.status(409).json({ error: "Este e-mail já está cadastrado. Faça login ou use outro e-mail." });
        return;
      }

      // Criar o usuário
      const openId = `local_${randomUUID().replace(/-/g, "")}`;
      await db.upsertUser({
        openId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        loginMethod: "password",
        lastSignedIn: new Date(),
      });

      const newUser = await db.getUserByEmail(email.toLowerCase().trim());
      if (!newUser) {
        res.status(500).json({ error: "Erro ao criar usuário" });
        return;
      }

      // Definir senha
      const passwordHash = await bcrypt.hash(password, 10);
      await db.setUserPassword(newUser.id, passwordHash);

      // Criar organização
      const slug = organizationName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 100);

      await db.createOrganization({
        name: organizationName.trim(),
        ownerId: newUser.id,
        slug: `${slug}-${newUser.id}`,
      });

      // Gerar token de verificação de e-mail
      const verificationToken = randomUUID().replace(/-/g, "");
      await db.createEmailVerificationToken(newUser.id, verificationToken);

      // Enviar e-mail de verificação
      const { ENV } = await import("./env");
      const { sendVerificationEmail } = await import("./email");
      const verificationUrl = `${ENV.appUrl}/verificar-email?token=${verificationToken}`;

      try {
        await sendVerificationEmail({
          to: email.toLowerCase().trim(),
          name: name.trim(),
          verificationUrl,
        });
      } catch (emailError) {
        console.error("[Register] Failed to send verification email:", emailError);
        // Não bloquear o cadastro se o e-mail falhar — apenas logar
      }

      res.status(201).json({
        success: true,
        message: "Conta criada com sucesso. Verifique seu e-mail para ativar o acesso.",
        email: email.toLowerCase().trim(),
      });
    } catch (error) {
      console.error("[Password Auth] Register failed", error);
      res.status(500).json({ error: "Erro ao criar conta" });
    }
  });

  // POST /api/auth/verify-email — Verifica o token de e-mail e ativa a conta
  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({ error: "Token de verificação é obrigatório" });
        return;
      }

      // Buscar o token
      const verification = await db.getEmailVerificationToken(token);
      if (!verification) {
        res.status(404).json({ error: "Token inválido ou expirado" });
        return;
      }

      if (verification.verifiedAt) {
        res.status(400).json({ error: "Este e-mail já foi verificado. Faça login para continuar." });
        return;
      }

      if (new Date() > new Date(verification.expiresAt)) {
        res.status(400).json({ error: "Este link de verificação expirou. Solicite um novo." });
        return;
      }

      // Marcar como verificado
      await db.markEmailVerified(token);

      // Buscar o usuário para criar sessão automática
      const user = await db.getUserById(verification.userId);

      if (!user) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
      }

      // Enviar e-mail de boas-vindas
      try {
        const { sendWelcomeEmail } = await import("./email");
        const orgs = await db.getOrganizationsByUserId(user.id);
        const orgName = orgs.length > 0 ? orgs[0].name : "sua organização";
        await sendWelcomeEmail({
          to: user.email ?? "",
          name: user.name ?? "Usuário",
          organizationName: orgName,
        });
      } catch (emailError) {
        console.error("[Verify Email] Failed to send welcome email:", emailError);
      }

      // Criar sessão automática (24h)
      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const { COOKIE_NAME } = await import("@shared/const");
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: TWENTY_FOUR_HOURS_MS,
        rememberMe: false,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: TWENTY_FOUR_HOURS_MS });

      res.json({
        success: true,
        message: "E-mail verificado com sucesso! Bem-vindo ao sistema.",
        user: { id: user.id, name: user.name, email: user.email },
      });
    } catch (error) {
      console.error("[Password Auth] Verify email failed", error);
      res.status(500).json({ error: "Erro ao verificar e-mail" });
    }
  });

  // POST /api/auth/resend-verification — Reenvia o e-mail de verificação
  app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: "E-mail é obrigatório" });
        return;
      }

      const user = await db.getUserByEmail(email.toLowerCase().trim());
      if (!user) {
        // Não revelar se o e-mail existe ou não (segurança)
        res.json({ success: true, message: "Se o e-mail estiver cadastrado, você receberá um novo link." });
        return;
      }

      // Verificar se já foi verificado
      const alreadyVerified = await db.isUserEmailVerified(user.id);
      if (alreadyVerified) {
        res.status(400).json({ error: "Este e-mail já foi verificado. Faça login para continuar." });
        return;
      }

      // Gerar novo token
      const verificationToken = randomUUID().replace(/-/g, "");
      await db.createEmailVerificationToken(user.id, verificationToken);

      const { ENV } = await import("./env");
      const { sendVerificationEmail } = await import("./email");
      const verificationUrl = `${ENV.appUrl}/verificar-email?token=${verificationToken}`;

      await sendVerificationEmail({
        to: user.email ?? "",
        name: user.name ?? "Usuário",
        verificationUrl,
      });

      res.json({ success: true, message: "Novo link de verificação enviado para seu e-mail." });
    } catch (error) {
      console.error("[Password Auth] Resend verification failed", error);
      res.status(500).json({ error: "Erro ao reenviar e-mail" });
    }
  });
}
