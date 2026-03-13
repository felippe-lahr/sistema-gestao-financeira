import Stripe from "stripe";
import { ENV } from "../_core/env";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY não configurada");
    }
    _stripe = new Stripe(ENV.stripeSecretKey, {
      apiVersion: "2025-02-24.acacia",
    });
  }
  return _stripe;
}

// Price IDs dos planos (configurados via env para flexibilidade entre test/live)
export const STRIPE_PRICES = {
  pro_monthly: ENV.stripePriceProMonthly,
  pro_yearly: ENV.stripePriceProYearly,
};

/**
 * Cria ou recupera um Stripe Customer para a organização.
 */
export async function getOrCreateStripeCustomer(opts: {
  organizationId: number;
  organizationName: string;
  userEmail: string;
  existingCustomerId?: string | null;
}): Promise<string> {
  const stripe = getStripe();

  if (opts.existingCustomerId) {
    return opts.existingCustomerId;
  }

  const customer = await stripe.customers.create({
    email: opts.userEmail,
    name: opts.organizationName,
    metadata: {
      organizationId: String(opts.organizationId),
    },
  });

  return customer.id;
}

/**
 * Cria uma Checkout Session para assinatura.
 */
export async function createCheckoutSession(opts: {
  customerId: string;
  priceId: string;
  organizationId: number;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}): Promise<string> {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    customer: opts.customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    subscription_data: {
      trial_period_days: opts.trialDays,
      metadata: {
        organizationId: String(opts.organizationId),
      },
    },
    metadata: {
      organizationId: String(opts.organizationId),
    },
    allow_promotion_codes: true,
    locale: "pt-BR",
  });

  return session.url!;
}

/**
 * Cria uma sessão do Customer Portal para gerenciar assinatura.
 */
export async function createPortalSession(opts: {
  customerId: string;
  returnUrl: string;
}): Promise<string> {
  const stripe = getStripe();

  const session = await stripe.billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: opts.returnUrl,
  });

  return session.url;
}

/**
 * Processa eventos de webhook do Stripe.
 * Retorna o plano atualizado e o organizationId, se aplicável.
 */
export async function processWebhookEvent(
  payload: Buffer,
  signature: string
): Promise<{
  type: string;
  organizationId?: number;
  plan?: "free" | "pro" | "enterprise";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
} | null> {
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      ENV.stripeWebhookSecret!
    );
  } catch (err) {
    throw new Error(`Webhook signature inválida: ${err}`);
  }

  const getOrgId = (metadata?: Stripe.Metadata | null): number | undefined => {
    const id = metadata?.organizationId;
    return id ? parseInt(id) : undefined;
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = getOrgId(session.metadata);
      if (!orgId) return null;
      return {
        type: event.type,
        organizationId: orgId,
        plan: "pro",
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: session.subscription as string,
      };
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = getOrgId(sub.metadata);
      if (!orgId) return null;
      const isActive = ["active", "trialing"].includes(sub.status);
      return {
        type: event.type,
        organizationId: orgId,
        plan: isActive ? "pro" : "free",
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
      };
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = getOrgId(sub.metadata);
      if (!orgId) return null;
      return {
        type: event.type,
        organizationId: orgId,
        plan: "free",
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
      };
    }

    default:
      return { type: event.type };
  }
}
