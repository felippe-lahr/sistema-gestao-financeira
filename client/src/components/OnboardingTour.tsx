import { useEffect, useRef, useState } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";

/**
 * OnboardingTour — Tour interativo de boas-vindas para novos usuários.
 * Usa driver.js para destacar elementos da interface com overlay e tooltips.
 * O tour só aparece uma vez por conta (controlado pelo campo onboardingCompleted no banco).
 * Funciona em desktop e mobile (layout adaptado).
 */
export function OnboardingTour() {
  const isMobile = useIsMobile();
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const [started, setStarted] = useState(false);

  const { data: onboardingStatus, isLoading } = trpc.auth.getOnboardingStatus.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const completeOnboarding = trpc.auth.completeOnboarding.useMutation();
  const utils = trpc.useUtils();

  const markComplete = async () => {
    try {
      await completeOnboarding.mutateAsync();
      utils.auth.getOnboardingStatus.invalidate();
    } catch {
      // silencioso
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (onboardingStatus?.completed) return;
    if (started) return;

    // Pequeno delay para garantir que o DOM está montado
    const timer = setTimeout(() => {
      startTour();
    }, 800);

    return () => clearTimeout(timer);
  }, [isLoading, onboardingStatus, started]);

  const startTour = () => {
    setStarted(true);

    const popoverConfig = {
      className: "onboarding-popover",
      nextBtnText: "Próximo →",
      prevBtnText: "← Anterior",
      doneBtnText: "Começar agora! 🚀",
    };

    const steps = [
      // Passo 1 — Boas-vindas (modal central, sem elemento destacado)
      {
        popover: {
          ...popoverConfig,
          title: "👋 Bem-vindo ao UnifiquePro!",
          description: `
            <div style="text-align:center; padding: 4px 0;">
              <p style="font-size:15px; color:#555; margin-bottom:12px;">
                Vamos te mostrar como organizar suas finanças em menos de 1 minuto.
              </p>
              <p style="font-size:13px; color:#888;">
                Use os botões abaixo para navegar pelo tour, ou pressione <strong>ESC</strong> para pular.
              </p>
            </div>
          `,
        },
      },
      // Passo 2 — Entidades
      {
        element: isMobile ? undefined : "[data-tour='nav-entities']",
        popover: {
          ...popoverConfig,
          title: "🏢 Entidades",
          description: `
            <p>Cada <strong>Entidade</strong> é um centro de custo independente — pode ser uma empresa, fazenda, projeto ou qualquer unidade financeira.</p>
            <p style="margin-top:8px; font-size:13px; color:#888;">Comece criando sua primeira entidade para organizar receitas e despesas separadamente.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 3 — Transações
      {
        element: isMobile ? undefined : "[data-tour='nav-transactions']",
        popover: {
          ...popoverConfig,
          title: "💰 Transações",
          description: `
            <p>Registre <strong>receitas</strong> e <strong>despesas</strong> de forma simples. Você também pode importar extratos bancários no formato OFX.</p>
            <p style="margin-top:8px; font-size:13px; color:#888;">Cada transação pode ter categoria, conta bancária, meio de pagamento e anexos.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 4 — Agenda
      {
        element: isMobile ? undefined : "[data-tour='nav-agenda']",
        popover: {
          ...popoverConfig,
          title: "📅 Agenda Financeira",
          description: `
            <p>Acompanhe os <strong>vencimentos</strong> e pagamentos programados em uma agenda visual.</p>
            <p style="margin-top:8px; font-size:13px; color:#888;">Nunca mais perca um prazo de pagamento ou recebimento.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 5 — Relatórios (apenas desktop, pois é acessado pelo dashboard de entidade)
      {
        popover: {
          ...popoverConfig,
          title: "📊 Relatórios PDF",
          description: `
            <p>Gere <strong>relatórios financeiros completos</strong> em PDF com um clique — incluindo análise por categoria, evolução mensal e DRE.</p>
            <p style="margin-top:8px; font-size:13px; color:#888;">Acesse os relatórios pelo painel de cada entidade.</p>
          `,
        },
      },
      // Passo 6 — Configurações / Perfil
      {
        element: isMobile ? undefined : "[data-tour='user-menu']",
        popover: {
          ...popoverConfig,
          title: "⚙️ Seu Perfil",
          description: `
            <p>Acesse seu <strong>perfil</strong> para configurar nome, senha e preferências da conta.</p>
            <p style="margin-top:8px; font-size:13px; color:#888;">Você também pode retomar este tour a qualquer momento nas configurações.</p>
          `,
          side: "top",
          align: "end",
        },
      },
      // Passo 7 — Conclusão
      {
        popover: {
          ...popoverConfig,
          title: "🎉 Tudo pronto!",
          description: `
            <div style="text-align:center; padding: 4px 0;">
              <p style="font-size:15px; color:#555; margin-bottom:12px;">
                Você está pronto para começar a usar o <strong>UnifiquePro</strong>!
              </p>
              <p style="font-size:13px; color:#888;">
                Crie sua primeira entidade e comece a registrar suas finanças agora mesmo.
              </p>
            </div>
          `,
          doneBtnText: "Criar minha primeira entidade 🚀",
        },
      },
    ];

    const driverInstance = driver({
      showProgress: true,
      animate: true,
      overlayOpacity: 0.65,
      stagePadding: 8,
      stageRadius: 8,
      allowClose: true,
      popoverClass: "onboarding-popover-wrapper",
      progressText: "Passo {{current}} de {{total}}",
      nextBtnText: "Próximo →",
      prevBtnText: "← Anterior",
      doneBtnText: "Começar agora! 🚀",
      onDestroyStarted: () => {
        markComplete();
        driverInstance.destroy();
      },
      onDestroyed: () => {
        markComplete();
      },
      steps: steps as any,
    });

    driverRef.current = driverInstance;
    driverInstance.drive();
  };

  // Não renderiza nada — o tour é controlado pelo driver.js via DOM
  return null;
}

/**
 * Botão para reiniciar o tour (usado nas configurações/perfil).
 */
export function RestartOnboardingButton() {
  const resetOnboarding = trpc.auth.resetOnboarding.useMutation();
  const utils = trpc.useUtils();

  const handleRestart = async () => {
    try {
      await resetOnboarding.mutateAsync();
      await utils.auth.getOnboardingStatus.invalidate();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <button
      onClick={handleRestart}
      disabled={resetOnboarding.isPending}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 disabled:opacity-50"
    >
      {resetOnboarding.isPending ? "Aguarde..." : "Ver tour de introdução"}
    </button>
  );
}
