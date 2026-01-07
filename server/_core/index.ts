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
import { registerUploadRoutes } from "./upload-routes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { startCronJobs } from "../cron";
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

  // 3. Rate Limiting - Prevent brute force and DDoS
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Stricter rate limit for authentication endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts, please try again later.',
    skipSuccessfulRequests: true,
  });
  app.use('/api/oauth', authLimiter);
  app.use('/api/auth', authLimiter);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ========== ROUTES ==========
  
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Demo auth route for when OAuth is not available
  registerDemoAuthRoutes(app);
  // Password auth routes for email/password login
  registerPasswordAuthRoutes(app);
  // Upload routes for attachments
  registerUploadRoutes(app);

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
