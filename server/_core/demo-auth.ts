import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

/**
 * Demo authentication route - bypasses OAuth when not available
 * Creates a demo user and sets a session cookie
 */
export function registerDemoAuthRoutes(app: Express) {
  app.get("/api/auth/demo-login", async (req: Request, res: Response) => {
    try {
      // Use owner email as demo user, or fallback to demo email
      const demoEmail = ENV.ownerOpenId || "demo@sistema-gestao-financeira.com";
      const demoOpenId = `demo_${demoEmail}`;

      console.log("[Demo Auth] Creating demo session for:", demoEmail);

      // Upsert demo user in database
      await db.upsertUser({
        openId: demoOpenId,
        name: "Demo User",
        email: demoEmail,
        loginMethod: "demo",
        lastSignedIn: new Date(),
        role: "admin", // Give admin role to demo user
      });

      // Create session token
      const sessionToken = await sdk.createSessionToken(demoOpenId, {
        name: "Demo User",
        expiresInMs: ONE_YEAR_MS,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect to home
      res.redirect(302, "/");
    } catch (error) {
      console.error("[Demo Auth] Failed to create demo session", error);
      res.status(500).json({ error: "Demo login failed" });
    }
  });
}
