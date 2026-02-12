import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
    
    // Renovar cookie de sessão a cada requisição autenticada com sucesso
    if (user) {
      const cookies = sdk.parseCookiesPublic(opts.req.headers.cookie);
      const sessionCookie = cookies.get(COOKIE_NAME);
      
      if (sessionCookie) {
        // Verificar sessão para obter tempo de expiração
        const session = await sdk.verifySession(sessionCookie);
        
        if (session) {
          // Renovar cookie com o mesmo token mas com maxAge atualizado
          // Isso mantém o cookie "vivo" no navegador
          const cookieOptions = getSessionCookieOptions(opts.req);
          
          // Determinar maxAge baseado no tempo restante do JWT
          // Por padrão, usar 24 horas (assumindo rememberMe)
          const maxAge = 24 * 60 * 60 * 1000; // 24 horas
          
          opts.res.cookie(COOKIE_NAME, sessionCookie, { 
            ...cookieOptions, 
            maxAge 
          });
          
          console.log("[Auth] Cookie renewed for user:", user.id);
        }
      }
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // DEMO MODE: If no OAuth server is configured, create a demo user
  if (!user && !ENV.oAuthServerUrl) {
    console.log("[Auth] OAuth not configured, using demo user");
    const demoOpenId = ENV.ownerOpenId || "demo@sistema-gestao-financeira.com";
    
    // Ensure demo user exists in database
    await db.upsertUser({
      openId: demoOpenId,
      name: "Demo User",
      email: demoOpenId,
      loginMethod: "demo",
      lastSignedIn: new Date(),
    });
    
    user = await db.getUserByOpenId(demoOpenId) || null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
