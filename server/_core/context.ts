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
        
        if (session && session.exp) {
          const cookieOptions = getSessionCookieOptions(opts.req);
          const now = Math.floor(Date.now() / 1000);
          const expiresInSeconds = session.exp - now;
          
          if (expiresInSeconds > 0) {
            let maxAge: number;
            
            if (session.rememberMe === true) {
              // SESSÃO FIXA (24h): Renovar cookie mas manter expiração original
              // Cookie expira no mesmo momento que o JWT (não estende)
              maxAge = expiresInSeconds * 1000;
              const hoursRemaining = (expiresInSeconds / 3600).toFixed(2);
              console.log(`[Auth] Cookie renewed (FIXED 24h) for user ${user.id} - expires in ${hoursRemaining}h`);
            } else {
              // SESSÃO DESLIZANTE (30min inatividade): Renovar cookie com 30min completos
              // A cada requisição, o cookie é estendido por mais 30min
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
