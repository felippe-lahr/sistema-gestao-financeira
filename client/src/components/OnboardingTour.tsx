import { useEffect, useRef, useState } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";

// SVGs inline dos ícones Lucide usados no menu lateral
const ICONS = {
  home: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  building: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`,
  receipt: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>`,
  landmark: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`,
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
  settings: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  user: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>`,
};

function iconTitle(icon: string, label: string) {
  return `<span style="display:inline-flex;align-items:center;gap:8px;color:#2563eb">${icon}<span>${label}</span></span>`;
}

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
      // Passo 1 — Boas-vindas
      {
        popover: {
          title: "👋 Bem-vindo ao UnifiquePro!",
          description: `
            <div style="text-align:center;padding:4px 0;">
              <p style="font-size:15px;margin-bottom:12px;">
                Vamos te mostrar como organizar suas finanças em menos de 1 minuto.
              </p>
              <p style="font-size:13px;opacity:0.65;">
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
          title: iconTitle(ICONS.home, "Início — Dashboard Geral"),
          description: `
            <p>O <strong>Dashboard Geral</strong> exibe uma visão consolidada de todas as suas entidades — receitas, despesas, saldo e indicadores financeiros em um só lugar.</p>
            <p style="margin-top:8px;font-size:13px;opacity:0.65;">Cada entidade também tem seu próprio dashboard com dados específicos.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 3 — Entidades
      {
        element: el("[data-tour='nav-entities']"),
        popover: {
          title: iconTitle(ICONS.building, "Entidades"),
          description: `
            <p>Cada <strong>Entidade</strong> é um centro de custo independente — pode ser uma empresa, fazenda, projeto ou qualquer unidade financeira.</p>
            <p style="margin-top:8px;font-size:13px;opacity:0.65;">Comece criando sua primeira entidade para organizar receitas e despesas separadamente.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 4 — Transações
      {
        element: el("[data-tour='nav-transactions']"),
        popover: {
          title: iconTitle(ICONS.receipt, "Transações"),
          description: `
            <p>Registre <strong>receitas</strong> e <strong>despesas</strong> de forma simples. Categorize, adicione anexos e acompanhe o status de cada lançamento.</p>
            <p style="margin-top:8px;font-size:13px;opacity:0.65;">Cada transação pode ter categoria, conta bancária, meio de pagamento e documentos anexados.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 5 — Contas Bancárias
      {
        element: el("[data-tour='nav-bank-accounts']"),
        popover: {
          title: iconTitle(ICONS.landmark, "Contas Bancárias"),
          description: `
            <p>Gerencie suas <strong>contas bancárias</strong> e importe extratos no formato <strong>OFX</strong> diretamente do seu banco.</p>
            <p style="margin-top:8px;font-size:13px;opacity:0.65;">A importação OFX faz o match com transações já existentes e adiciona automaticamente as que não existem. Perfeito para a conciliação.</p>
          `,
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Passo 6 — Agenda
      {
        element: el("[data-tour='nav-agenda']"),
        popover: {
          title: iconTitle(ICONS.calendar, "Agenda"),
          description: `
            <p>A <strong>Agenda</strong> é sua central de compromissos financeiros e pessoais. Acompanhe vencimentos, pagamentos programados e eventos.</p>
            <p style="margin-top:8px;font-size:13px;opacity:0.65;">Sincronize com o <strong>Google Agenda</strong> para ter todos os seus compromissos em um só lugar.</p>
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
            <p style="margin-top:8px;font-size:13px;opacity:0.65;">Acesse os relatórios pelo painel de cada entidade.</p>
          `,
        },
      },
      // Passo 8 — Perfil / Configurações
      {
        element: el("[data-tour='user-menu']"),
        popover: {
          title: iconTitle(ICONS.user, "Seu Perfil"),
          description: `
            <p>Acesse seu <strong>perfil</strong> para configurar nome, senha e preferências da conta.</p>
            <p style="margin-top:8px;font-size:13px;opacity:0.65;">Você também pode retomar este tour a qualquer momento em <strong>Meu Perfil → Tour de Introdução</strong>.</p>
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
            <div style="text-align:center;padding:4px 0;">
              <p style="font-size:15px;margin-bottom:12px;">
                Você está pronto para começar a usar o <strong>UnifiquePro</strong>!
              </p>
              <p style="font-size:13px;opacity:0.65;margin-bottom:16px;">
                Crie sua primeira entidade e comece a registrar suas finanças agora mesmo.
              </p>
              <button
                id="onboarding-dont-show"
                style="font-size:12px;opacity:0.55;background:none;border:none;cursor:pointer;text-decoration:underline;padding:0;"
              >
                Não mostrar novamente
              </button>
            </div>
          `,
          doneBtnText: "Começar agora! 🚀",
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
      onHighlightStarted: () => {
        // Adicionar listener ao botão "Não mostrar novamente" quando o último passo aparecer
        setTimeout(() => {
          const btn = document.getElementById("onboarding-dont-show");
          if (btn) {
            btn.onclick = () => {
              markComplete();
              driverInstance.destroy();
            };
          }
        }, 100);
      },
      steps: steps as any,
    });

    driverRef.current = driverInstance;
    driverInstance.drive();
  };

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
