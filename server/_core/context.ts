import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { sdk } from "./sdk";
import { ENV } from "./env";

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
