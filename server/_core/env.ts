export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  // Email
  emailFromName: process.env.EMAIL_FROM_NAME ?? "UnifiquePro",
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "noreply@unifiquepro.com.br",
  emailLogoUrl: process.env.EMAIL_LOGO_URL ?? "https://files.manuscdn.com/user_upload_by_module/session_file/310419663029179004/NujcpHuyWRVgvVLk.png",
  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceProMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
  stripePriceProYearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? "",
  // Evolution API (WhatsApp Bot)
  evolutionApiUrl: process.env.EVOLUTION_API_URL ?? "",
  evolutionApiKey: process.env.EVOLUTION_API_KEY ?? "",
  evolutionInstanceName: process.env.EVOLUTION_INSTANCE_NAME ?? "sgf-bot",
};
