import express from "express";
import type { Express } from "express";
import { sdk } from "./sdk";
import {
  getOrCreateStripeCustomer,
  createCheckoutSession,
  createPortalSession,
  processWebhookEvent,
  STRIPE_PRICES,
} from "../services/stripe";
import {
  getOrFirstOrganizationForUser,
  updateOrganizationBilling,
  updateOrganizationStripeCustomer,
  getOrganizationByStripeCustomer,
} from "../db";
import { ENV } from "./env";

export function registerStripeRoutes(app: Express) {
  // ========== CHECKOUT — Iniciar assinatura ==========
  app.post("/api/billing/checkout", async (req, res) => {
    try {
      const session = await sdk.verifySession(req);
      if (!session?.userId) {
        return res.status(401).json({ error: "Não autenticado" });
      }

      const { priceId, interval } = req.body as { priceId?: string; interval?: "month" | "year" };

      // Determinar o price ID
      const resolvedPriceId =
        priceId ??
        (interval === "year" ? STRIPE_PRICES.pro_yearly : STRIPE_PRICES.pro_monthly);

      if (!resolvedPriceId) {
        return res.status(400).json({ error: "Plano não configurado" });
      }

      // Buscar organização do usuário
      const org = await getOrFirstOrganizationForUser(session.userId);
      if (!org) {
        return res.status(400).json({ error: "Organização não encontrada" });
      }

      // Criar ou recuperar customer no Stripe
      const customerId = await getOrCreateStripeCustomer({
        organizationId: org.id,
        organizationName: org.name,
        userEmail: session.email ?? "",
        existingCustomerId: org.stripeCustomerId,
      });

      // Salvar customerId se for novo
      if (!org.stripeCustomerId) {
        await updateOrganizationStripeCustomer(org.id, customerId);
      }

      const appUrl = ENV.appUrl;
      const checkoutUrl = await createCheckoutSession({
        customerId,
        priceId: resolvedPriceId,
        organizationId: org.id,
        successUrl: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${appUrl}/planos`,
        trialDays: 14,
      });

      res.json({ url: checkoutUrl });
    } catch (err: any) {
      console.error("[Stripe] Erro no checkout:", err.message);
      res.status(500).json({ error: "Erro ao iniciar checkout" });
    }
  });

  // ========== PORTAL — Gerenciar assinatura ==========
  app.post("/api/billing/portal", async (req, res) => {
    try {
      const session = await sdk.verifySession(req);
      if (!session?.userId) {
        return res.status(401).json({ error: "Não autenticado" });
      }

      const org = await getOrFirstOrganizationForUser(session.userId);
      if (!org?.stripeCustomerId) {
        return res.status(400).json({ error: "Nenhuma assinatura ativa encontrada" });
      }

      const portalUrl = await createPortalSession({
        customerId: org.stripeCustomerId,
        returnUrl: `${ENV.appUrl}/planos`,
      });

      res.json({ url: portalUrl });
    } catch (err: any) {
      console.error("[Stripe] Erro no portal:", err.message);
      res.status(500).json({ error: "Erro ao abrir portal de billing" });
    }
  });

  // ========== WEBHOOK — Receber eventos do Stripe ==========
  // IMPORTANTE: deve usar express.raw() antes do json parser global
  app.post(
    "/api/billing/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const signature = req.headers["stripe-signature"] as string;

      if (!signature) {
        return res.status(400).json({ error: "Assinatura ausente" });
      }

      try {
        const result = await processWebhookEvent(req.body as Buffer, signature);

        if (result && result.organizationId && result.plan) {
          await updateOrganizationBilling({
            organizationId: result.organizationId,
            plan: result.plan,
            stripeCustomerId: result.stripeCustomerId,
            stripeSubscriptionId: result.stripeSubscriptionId,
          });
          console.log(
            `[Stripe] Webhook processado: ${result.type} | org=${result.organizationId} | plan=${result.plan}`
          );
        }

        res.json({ received: true });
      } catch (err: any) {
        console.error("[Stripe] Erro no webhook:", err.message);
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ========== STATUS — Retornar plano atual ==========
  app.get("/api/billing/status", async (req, res) => {
    try {
      const session = await sdk.verifySession(req);
      if (!session?.userId) {
        return res.status(401).json({ error: "Não autenticado" });
      }

      const org = await getOrFirstOrganizationForUser(session.userId);
      if (!org) {
        return res.json({ plan: "free", hasSubscription: false });
      }

      res.json({
        plan: org.plan,
        hasSubscription: !!org.stripeSubscriptionId,
        stripeCustomerId: org.stripeCustomerId ?? null,
      });
    } catch (err: any) {
      console.error("[Stripe] Erro ao buscar status:", err.message);
      res.status(500).json({ error: "Erro ao buscar status do plano" });
    }
  });
}
