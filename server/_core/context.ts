import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User, Organization } from "../../drizzle/schema";
import * as db from "../db";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { COOKIE_NAME, SESSION_DEFAULT_MS, SESSION_REMEMBER_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  organization: Organization | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let organization: Organization | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
    
    // Renovar cookie de sessão a cada requisição autenticada com sucesso
    if (user) {
      const cookies = sdk.parseCookiesPublic(opts.req.headers.cookie);
      const sessionCookie = cookies.get(COOKIE_NAME);
      
      if (sessionCookie) {
        // Verificar sessão para obter tempo de expiração
        const session = await sdk.verifySession(sessionCookie);
        
        if (session && session.exp) {
          const cookieOptions = getSessionCookieOptions(opts.req);
          const now = Math.floor(Date.now() / 1000);
          const expiresInSeconds = session.exp - now;
          
          if (expiresInSeconds > 0) {
            let maxAge: number;
            let cookieValue = sessionCookie;

            if (session.rememberMe === true) {
              // "MANTER CONECTADO NESTE APARELHO": 30 dias renovados a cada uso.
              // Re-emite no máximo 1x por dia para não gerar Set-Cookie a cada request.
              const totalS = SESSION_REMEMBER_MS / 1000;
              if (totalS - expiresInSeconds > 24 * 60 * 60) {
                cookieValue = await sdk.createSessionToken(user.openId, {
                  expiresInMs: SESSION_REMEMBER_MS,
                  name: (session as any).name || user.name || "",
                  rememberMe: true,
                });
                maxAge = SESSION_REMEMBER_MS;
              } else {
                maxAge = expiresInSeconds * 1000;
              }
            } else {
              // SESSÃO DESLIZANTE (30min de INATIVIDADE): re-emite o token com
              // 30min completos a partir de agora, para que a sessão só expire
              // após 30min SEM atividade — e não 30min após o login.
              // Throttle: só re-emite se passou > 5min desde a última emissão,
              // evitando gerar token/Set-Cookie a cada requisição.
              const THIRTY_MINUTES_S = SESSION_DEFAULT_MS / 1000;
              const elapsedSeconds = THIRTY_MINUTES_S - expiresInSeconds;
              if (elapsedSeconds > 300) {
                cookieValue = await sdk.createSessionToken(user.openId, {
                  expiresInMs: THIRTY_MINUTES_S * 1000,
                  name: (session as any).name || user.name || "",
                  rememberMe: false,
                });
                maxAge = THIRTY_MINUTES_S * 1000;
              } else {
                // Token ainda "fresco" — só acompanha o tempo restante.
                maxAge = expiresInSeconds * 1000;
              }
            }

            opts.res.cookie(COOKIE_NAME, cookieValue, {
              ...cookieOptions,
              maxAge,
            });
          }
        }
      }

      // Carregar organização ativa do usuário (multi-tenancy)
      // Por enquanto, usamos a primeira organização do usuário.
      // No futuro, o usuário poderá selecionar a organização ativa via header ou cookie.
      try {
        const orgIdHeader = opts.req.headers["x-organization-id"];
        if (orgIdHeader && typeof orgIdHeader === "string") {
          const orgId = parseInt(orgIdHeader, 10);
          if (!isNaN(orgId)) {
            const org = await db.getOrganizationById(orgId);
            if (org) {
              const userOrgs = await db.getOrganizationsByUserId(user.id);
              if (userOrgs.some(o => o.id === org.id)) {
                organization = org;
              }
            }
          }
        }
        
        // Se não encontrou via header, usar a primeira organização do usuário
        if (!organization) {
          organization = await db.getOrFirstOrganizationForUser(user.id);
        }
      } catch (orgError) {
        // Organização é opcional por enquanto — não bloqueia o sistema
        console.warn("[Auth] Could not load organization for user:", user.id, orgError);
        organization = null;
      }
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
    organization = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    organization,
  };
}
