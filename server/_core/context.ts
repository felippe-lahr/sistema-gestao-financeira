import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User, Organization } from "../../drizzle/schema";
import * as db from "../db";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { COOKIE_NAME } from "@shared/const";
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
            
            if (session.rememberMe === true) {
              // SESSÃO FIXA (24h): Renovar cookie mas manter expiração original
              maxAge = expiresInSeconds * 1000;
              const hoursRemaining = (expiresInSeconds / 3600).toFixed(2);
              console.log(`[Auth] Cookie renewed (FIXED 24h) for user ${user.id} - expires in ${hoursRemaining}h`);
            } else {
              // SESSÃO DESLIZANTE (30min inatividade): Renovar cookie com 30min completos
              const THIRTY_MINUTES_MS = 30 * 60 * 1000;
              maxAge = THIRTY_MINUTES_MS;
              console.log(`[Auth] Cookie renewed (SLIDING 30min) for user ${user.id} - 30min from now`);
            }
            
            opts.res.cookie(COOKIE_NAME, sessionCookie, { 
              ...cookieOptions, 
              maxAge 
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
