import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { VitePWA } from "vite-plugin-pwa";

const BRAND_COLOR = "#1661B5";

const plugins = [
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  vitePluginManusRuntime(),
  // PWA: app instalável (Tela de Início) + shell offline.
  // registerType "prompt": nunca recarrega sozinho (evita perder formulário
  // em edição) — o usuário confirma a atualização num aviso.
  VitePWA({
    registerType: "prompt",
    injectRegister: false, // registro manual em main.tsx (virtual:pwa-register)
    includeAssets: ["favicon.ico", "icons/apple-touch-icon-180-v2.png"],
    manifest: {
      id: "/",
      name: "UnifiquePro — Gestão Financeira",
      short_name: "UnifiquePro",
      description: "Controle total das suas finanças: transações, cartões, investimentos e agenda.",
      lang: "pt-BR",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "any",
      theme_color: BRAND_COLOR,
      background_color: "#ffffff",
      icons: [
        { src: "/icons/icon-192-v2.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512-v2.png", sizes: "512x512", type: "image/png", purpose: "any" },
        // Android recorta em círculo/squircle: fundo cheio e marca na zona segura.
        { src: "/icons/maskable-512-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    workbox: {
      // Precache atômico do build (index + chunks com hash) — mantém HTML e
      // assets sempre consistentes entre si; caches antigos são limpos.
      globPatterns: ["**/*.{js,css,html,ico,svg,woff2}", "*.png"],
      globIgnores: ["**/login-bg-illustration_original.png", "**/google*.html"],
      maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      // Handlers de push/notificationclick (client/public/push-sw.js).
      importScripts: ["/push-sw.js"],
      navigateFallback: "/index.html",
      // NUNCA servir o shell para rotas do backend (OAuth callback, uploads,
      // downloads, webhooks) — senão o login com Google quebra.
      // Arquivos (ex.: /icons/x.png aberto direto na barra) vão para a rede.
      navigateFallbackDenylist: [/^\/api\//, /^\/google[0-9a-f]+\.html$/, /\/[^/?]+\.[a-z0-9]+$/i],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts",
            expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
  }),
];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "client", "src"),
      "@shared": path.resolve(process.cwd(), "shared"),
      "@assets": path.resolve(process.cwd(), "attached_assets"),
    },
  },
  envDir: path.resolve(process.cwd()),
  root: path.resolve(process.cwd(), "client"),
  publicDir: path.resolve(process.cwd(), "client", "public"),
  define: {
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? "0.5.0-beta"),
    // Commit publicado (Railway injeta RAILWAY_GIT_COMMIT_SHA no build) —
    // aparece ao lado da versão para conferir qual deploy está no ar.
    __APP_BUILD__: JSON.stringify((process.env.RAILWAY_GIT_COMMIT_SHA ?? "dev").slice(0, 7)),
  },
  build: {
    outDir: path.resolve(process.cwd(), "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
