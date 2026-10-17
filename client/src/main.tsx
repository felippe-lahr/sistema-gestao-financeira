import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";
import { ThemeProvider } from "@/components/theme-provider";
import { toast } from "sonner";
import { registerSW } from "virtual:pwa-register";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // dados ficam frescos por 30s
      refetchOnWindowFocus: true, // revalida ao voltar para a aba
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="gestao-financeira-theme">
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </ThemeProvider>
);

// PWA: registra o service worker. Se a nova versão for detectada logo ao
// abrir o app (nada em edição ainda), aplica na hora; depois disso nunca
// recarrega sozinha — o usuário confirma no aviso (evita perder formulário).
if ("serviceWorker" in navigator) {
  const openedAt = Date.now();
  const updateSW = registerSW({
    onNeedRefresh() {
      if (Date.now() - openedAt < 10_000) {
        updateSW(true);
        return;
      }
      toast("Nova versão disponível", {
        description: "Atualize para usar a versão mais recente do UnifiquePro.",
        duration: Infinity,
        action: { label: "Atualizar", onClick: () => updateSW(true) },
      });
    },
    onRegisteredSW(_url, registration) {
      // Verifica atualizações a cada hora em sessões longas (app instalado).
      if (registration) {
        setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
      }
    },
  });
}
