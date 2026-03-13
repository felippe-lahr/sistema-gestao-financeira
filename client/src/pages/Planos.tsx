import { useState, useEffect } from "react";
import { Check, Zap, Building2, Loader2, ExternalLink, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface BillingStatus {
  plan: "free" | "pro" | "enterprise";
  hasSubscription: boolean;
  stripeCustomerId: string | null;
}

export default function Planos() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<"month" | "year" | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [interval, setInterval] = useState<"month" | "year">("year");

  useEffect(() => {
    fetchBillingStatus();
  }, []);

  async function fetchBillingStatus() {
    try {
      const res = await fetch("/api/billing/status");
      if (res.ok) {
        const data = await res.json();
        setBilling(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(selectedInterval: "month" | "year") {
    setCheckoutLoading(selectedInterval);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: selectedInterval }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erro ao iniciar checkout");
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (err: any) {
      toast.error("Erro ao iniciar pagamento", { description: err.message });
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erro ao abrir portal");
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err: any) {
      toast.error("Erro ao abrir portal", { description: err.message });
    } finally {
      setPortalLoading(false);
    }
  }

  const isPro = billing?.plan === "pro" || billing?.plan === "enterprise";

  const proFeatures = [
    "Entidades ilimitadas",
    "Transações ilimitadas",
    "Relatórios avançados",
    "Exportação de dados (Excel, PDF)",
    "Sincronização com Google Calendar",
    "Compartilhamento de entidades (RBAC)",
    "Módulo de Aluguéis",
    "Módulo de Investimentos",
    "Suporte prioritário por e-mail",
    "14 dias grátis para testar",
  ];

  const freeFeatures = [
    "1 entidade",
    "Até 50 transações/mês",
    "Relatórios básicos",
    "Acesso ao dashboard",
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Planos UnifiquePro
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg">
          Escolha o plano ideal para a sua gestão financeira
        </p>

        {/* Toggle mensal/anual */}
        <div className="flex flex-col items-center gap-3 mt-6">
          <div className="inline-flex rounded-full border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-1">
            <button
              onClick={() => setInterval("month")}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all ${
                interval === "month"
                  ? "bg-white dark:bg-gray-900 text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setInterval("year")}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all ${
                interval === "year"
                  ? "bg-white dark:bg-gray-900 text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Anual
            </button>
          </div>
          <Badge className="bg-green-100 text-green-700 text-xs border-0 px-3 py-1">
            Economize 20% no plano anual
          </Badge>
        </div>
      </div>

      {/* Cards de planos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Plano Free */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-8 bg-white dark:bg-gray-900 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5 text-gray-500" />
            <span className="font-semibold text-gray-700 dark:text-gray-300">Free</span>
            {billing?.plan === "free" && !isPro && (
              <Badge variant="secondary" className="ml-auto">Plano atual</Badge>
            )}
          </div>
          <div className="mt-4 mb-6">
            <span className="text-4xl font-bold text-gray-900 dark:text-white">R$ 0</span>
            <span className="text-gray-400 ml-1">/mês</span>
          </div>
          <ul className="space-y-3 flex-1 mb-8">
            {freeFeatures.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Check className="w-4 h-4 text-gray-400 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <Button variant="outline" disabled className="w-full">
            Plano gratuito
          </Button>
        </div>

        {/* Plano Pro */}
        <div className="rounded-2xl border-2 border-blue-600 p-8 bg-white dark:bg-gray-900 flex flex-col relative shadow-lg">
          {/* Badge popular */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-blue-600 text-white px-4 py-1 text-xs font-semibold">
              MAIS POPULAR
            </Badge>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-blue-600">Pro</span>
            {isPro && (
              <Badge className="ml-auto bg-blue-100 text-blue-700">Plano atual</Badge>
            )}
          </div>

          <div className="mt-4 mb-1">
            {interval === "year" ? (
              <>
                <span className="text-4xl font-bold text-gray-900 dark:text-white">R$ 79</span>
                <span className="text-gray-400 ml-1">/mês</span>
                <p className="text-sm text-gray-400 mt-1">Cobrado R$ 950,40/ano</p>
              </>
            ) : (
              <>
                <span className="text-4xl font-bold text-gray-900 dark:text-white">R$ 99</span>
                <span className="text-gray-400 ml-1">/mês</span>
                <p className="text-sm text-green-600 mt-1">14 dias grátis para testar</p>
              </>
            )}
          </div>

          <ul className="space-y-3 flex-1 mb-8 mt-6">
            {proFeatures.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          {loading ? (
            <Button disabled className="w-full">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Carregando...
            </Button>
          ) : isPro ? (
            <Button
              variant="outline"
              className="w-full border-blue-600 text-blue-600 hover:bg-blue-50"
              onClick={handlePortal}
              disabled={portalLoading}
            >
              {portalLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ExternalLink className="w-4 h-4 mr-2" />
              )}
              Gerenciar assinatura
            </Button>
          ) : (
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => handleCheckout(interval)}
              disabled={!!checkoutLoading}
            >
              {checkoutLoading === interval ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              {interval === "year" ? "Assinar Pro Anual" : "Começar 14 dias grátis"}
            </Button>
          )}
        </div>
      </div>

      {/* Nota de segurança */}
      <p className="text-center text-xs text-gray-400 mt-8">
        Pagamento seguro processado pelo Stripe. Cancele a qualquer momento.
      </p>
    </div>
  );
}
