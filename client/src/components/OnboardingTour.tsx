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

    // No mobile, não tentamos destacar elementos do menu (sidebar fica oculta)
    const el = (selector: string) => (isMobile ? undefined : selector);

    const steps = [
      // Passo 1 — Boas-vindas (modal central)
      {
        popover: {
          title: "👋 Bem-vindo ao UnifiquePro!",
          description: `
            <div style="text-align:center; padding: 4px 0;">
              <p style="font-size:15px; margin-bottom:12px;">
                Vamos te mostrar como organizar suas finanças em menos de 1 minuto.
              </p>
              <p style="font-size:13px; opacity:0.7;">
                Use os botões abaixo para navegar pelo tour, ou pressione <strong>ESC</strong> para pular.
              </p>
            </div>
          `,
        },
      },
      // Passo 2 — Início / Dashboard Geral
      {
        element: el("[data-tour='nav-home']"),
        popover: {
          title: "🏠 Início — Dashboard Geral",
          description: `
            <p>O <strong>Dashboard Geral</strong> exibe uma visão consolidada de todas as suas entidades — receitas, despesas, saldo e indicadores financeiros em um só lugar.</p>
            <p style="margin-top:8px; font-size:13px; opacity:0.7;">Cada entidade também tem seu próprio dashboard com dados específicos.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 3 — Entidades
      {
        element: el("[data-tour='nav-entities']"),
        popover: {
          title: "🏢 Entidades",
          description: `
            <p>Cada <strong>Entidade</strong> é um centro de custo independente — pode ser uma empresa, fazenda, projeto ou qualquer unidade financeira.</p>
            <p style="margin-top:8px; font-size:13px; opacity:0.7;">Comece criando sua primeira entidade para organizar receitas e despesas separadamente.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 4 — Transações
      {
        element: el("[data-tour='nav-transactions']"),
        popover: {
          title: "💰 Transações",
          description: `
            <p>Registre <strong>receitas</strong> e <strong>despesas</strong> de forma simples. Categorize, adicione anexos e acompanhe o status de cada lançamento.</p>
            <p style="margin-top:8px; font-size:13px; opacity:0.7;">Cada transação pode ter categoria, conta bancária, meio de pagamento e documentos anexados.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 5 — Contas Bancárias
      {
        element: el("[data-tour='nav-bank-accounts']"),
        popover: {
          title: "🏦 Contas Bancárias",
          description: `
            <p>Gerencie suas <strong>contas bancárias</strong> e importe extratos no formato <strong>OFX</strong> diretamente do seu banco.</p>
            <p style="margin-top:8px; font-size:13px; opacity:0.7;">A importação OFX categoriza automaticamente as transações, economizando tempo no lançamento manual.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 6 — Agenda
      {
        element: el("[data-tour='nav-agenda']"),
        popover: {
          title: "📅 Agenda",
          description: `
            <p>A <strong>Agenda</strong> é sua central de compromissos financeiros e pessoais. Acompanhe vencimentos, pagamentos programados e eventos.</p>
            <p style="margin-top:8px; font-size:13px; opacity:0.7;">Sincronize com o <strong>Google Agenda</strong> para ter todos os seus compromissos em um só lugar.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 7 — Relatórios PDF
      {
        popover: {
          title: "📊 Relatórios PDF",
          description: `
            <p>Gere <strong>relatórios financeiros completos</strong> em PDF com um clique — incluindo análise por categoria, evolução mensal e DRE (Demonstração do Resultado do Exercício).</p>
            <p style="margin-top:8px; font-size:13px; opacity:0.7;">Acesse os relatórios pelo painel de cada entidade.</p>
          `,
        },
      },
      // Passo 8 — Perfil / Configurações
      {
        element: el("[data-tour='user-menu']"),
        popover: {
          title: "⚙️ Seu Perfil",
          description: `
            <p>Acesse seu <strong>perfil</strong> para configurar nome, senha e preferências da conta.</p>
            <p style="margin-top:8px; font-size:13px; opacity:0.7;">Você também pode retomar este tour a qualquer momento em <strong>Meu Perfil → Tour de Introdução</strong>.</p>
          `,
          side: "top",
          align: "end",
        },
      },
      // Passo 9 — Conclusão
      {
        popover: {
          title: "🎉 Tudo pronto!",
          description: `
            <div style="text-align:center; padding: 4px 0;">
              <p style="font-size:15px; margin-bottom:12px;">
                Você está pronto para começar a usar o <strong>UnifiquePro</strong>!
              </p>
              <p style="font-size:13px; opacity:0.7;">
                Crie sua primeira entidade e comece a registrar suas finanças agora mesmo.
              </p>
            </div>
          `,
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
      className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
    >
      {resetOnboarding.isPending ? "Aguarde..." : "▶ Ver tour de introdução"}
    </button>
  );
}
