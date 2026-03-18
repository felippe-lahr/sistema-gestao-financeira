import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDemoAuthRoutes } from "./demo-auth";
import { registerPasswordAuthRoutes } from "./password-auth";
import { registerGoogleAuthRoutes } from "./google-auth";
import { registerUploadRoutes } from "./upload-routes";
import { registerStripeRoutes } from "./stripe-routes";
import { registerOfxRoutes } from "./ofx-routes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { startCronJobs } from "../cron";
import { ensureEntitySharingTables, ensureEmailVerificationsTable, ensureOnboardingColumn } from "../db";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ========== SECURITY MIDDLEWARE ==========
  
  // 1. Helmet - Set HTTP headers for security
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: "deny",
    },
    noSniff: true,
    xssFilter: true,
  }));

  // 2. CORS - Restrict cross-origin requests
  const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [process.env.FRONTEND_URL || 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  };
  app.use(cors(corsOptions));

  // 2.5. Cookie Parser - Parse cookies from requests
  app.use(cookieParser());

  // 2.55. Body Parser - DEVE vir antes dos rate limiters e rotas para que req.body esteja disponível
  // IMPORTANTE: se o body parser vier depois das rotas, req.body será undefined nas rotas de auth
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // 2.6. Trust proxy - necessário para Railway (reverse proxy)
  // Sem isso, o rate limiter vê o IP do proxy e bloqueia todos os usuários juntos
  app.set('trust proxy', 1);

  // 3. Rate Limiting - Prevent brute force and DDoS
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500, // 500 req por IP a cada 15 min (suficiente para uso normal)
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Rate limit para login (proteção contra brute force)
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30, // 30 tentativas de login por IP a cada 15 min
    message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    skipSuccessfulRequests: true,
  });
  app.use('/api/oauth', loginLimiter);
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth/demo-login', loginLimiter);
  app.use('/api/auth/google', loginLimiter);

  // Rate limit para registro e verificação de e-mail
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 30, // 30 tentativas por hora
    message: 'Muitas tentativas de cadastro. Tente novamente em 1 hora.',
    skipSuccessfulRequests: true,
  });
  app.use('/api/auth/register', registerLimiter);
  app.use('/api/auth/verify-email', registerLimiter);
  app.use('/api/auth/resend-verification', registerLimiter);

  // ========== ROUTES ==========
  
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Demo auth route for when OAuth is not available
  registerDemoAuthRoutes(app);
  // Password auth routes for email/password login
  registerPasswordAuthRoutes(app);
  // Google OAuth routes
  registerGoogleAuthRoutes(app);
  // Upload routes for attachments
  registerUploadRoutes(app);
  // OFX import routes
  registerOfxRoutes(app);
  // Stripe billing routes (webhook must come before json body parser)
  registerStripeRoutes(app);

  // tRPC API with rate limiting
  app.use(
    "/api/trpc",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      skipSuccessfulRequests: false,
    }),
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log('[Security] Helmet headers enabled');
    console.log('[Security] CORS protection enabled');
    console.log('[Security] Rate limiting enabled');
  });

  // Garantir que as tabelas de compartilhamento existam (migração segura)
  await ensureEntitySharingTables();
  // Garantir que a tabela de verificação de e-mail existe
  await ensureEmailVerificationsTable();
  // Garantir que a coluna de onboarding existe
  await ensureOnboardingColumn();

  // Start cron jobs
  startCronJobs();

  // ========== ERROR HANDLING ==========
  
  // Global error handler - don't expose sensitive info
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Error]', err.message);
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    const message = isDevelopment ? err.message : 'Internal server error';
    
    res.status(err.status || 500).json({
      error: message,
      ...(isDevelopment && { stack: err.stack }),
    });
  });
}

startServer().catch(console.error);
