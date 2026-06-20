import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ModeToggle } from "@/components/mode-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, Menu, Building2, Receipt, Settings, Clock, User, Eye, EyeOff, Calendar, ShieldCheck, Crown, Landmark, CreditCard, Smartphone, BarChart2, TrendingUp, Shield, Zap } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { toast } from "sonner";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { OnboardingTour } from './OnboardingTour';
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./ui/input-otp";

// Componente de Login
function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // ─── Estado do 2FA no login ─────────────────────────────────────────────────────────────────────────────
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorOpenId, setTwoFactorOpenId] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  const handleVerify2FA = async () => {
    if (totpCode.length !== 6) {
      toast.error("Digite o código de 6 dígitos do aplicativo");
      return;
    }
    setTwoFaLoading(true);
    try {
      const response = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openId: twoFactorOpenId, code: totpCode, rememberMe }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        toast.success("Login realizado com sucesso!");
        localStorage.setItem('showFinancialValues', JSON.stringify(false));
        localStorage.setItem('rememberMe', JSON.stringify(rememberMe));
        window.location.href = '/';
      } else {
        toast.error(data.error || "Código incorreto. Tente novamente.");
        setTotpCode("");
      }
    } catch {
      toast.error("Erro ao verificar código 2FA");
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Preencha email e senha");
      return;
    }
    setEmailNotVerified(false);
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const data = await response.json();
      if (response.ok) {
        // Verificar se o 2FA é necessário
        if (data.requiresTwoFactor) {
          setTwoFactorOpenId(data.openId);
          setRequiresTwoFactor(true);
          setTotpCode("");
          setIsLoading(false);
          return;
        }
        toast.success("Login realizado com sucesso!");
        // Definir valores como ocultos por padrão
        localStorage.setItem('showFinancialValues', JSON.stringify(false));
        // Salvar preferência de rememberMe para controle de inatividade
        localStorage.setItem('rememberMe', JSON.stringify(rememberMe));
        // Redirecionar para página de entidades
        window.location.href = '/';
      } else if (data.code === "EMAIL_NOT_VERIFIED") {
        setEmailNotVerified(true);
        setUnverifiedEmail(data.email || email);
      } else {
        toast.error(data.error || "Email ou senha incorretos");
      }
    } catch (error) {
      toast.error("Erro ao fazer login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    setResendLoading(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("Novo link de verificação enviado! Verifique sua caixa de entrada.");
        setResendCooldown(60);
        const interval = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) { clearInterval(interval); return 0; }
            return prev - 1;
          });
        }, 1000);
      } else {
        toast.error(data.error || "Erro ao reenviar e-mail");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setResendLoading(false);
    }
  };

  // Painel direito (dark) reutilizável
  const RightPanel = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div
      className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden flex-col items-center justify-center p-12"
      style={{ background: '#16161A' }}
    >
      {/* Background decoration */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: `radial-gradient(circle at 70% 30%, oklch(0.52 0.16 256 / 0.15) 0%, transparent 60%),
            radial-gradient(circle at 20% 80%, oklch(0.52 0.12 158 / 0.1) 0%, transparent 50%)`,
        }}
      />

      <div className="relative z-10 text-center max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <BarChart2 style={{ color: 'oklch(0.52 0.16 256)', width: 32, height: 32 }} />
          <span style={{ fontSize: 26, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
            UnifiquePro
          </span>
        </div>

        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3, marginBottom: 16 }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.7, marginBottom: 48 }}>
            {subtitle}
          </p>
        )}

        {/* Trust stats */}
        <div
          className="grid grid-cols-3 gap-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 36 }}
        >
          {[
            { value: '500+', label: 'empresas' },
            { value: 'R$2M+', label: 'gerenciados' },
            { value: '99.9%', label: 'uptime' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Se o 2FA for necessário, exibir a tela de verificação
  if (requiresTwoFactor) {
    return (
      <div className="flex min-h-screen">
        {/* Painel esquerdo — formulário 2FA */}
        <div
          className="flex-1 flex items-center justify-center p-6 sm:p-10 min-h-screen"
          style={{ background: '#FFFFFF' }}
        >
          <div className="w-full max-w-md">
            {/* Logo mobile */}
            <div className="flex items-center justify-center gap-2 mb-8 lg:hidden">
              <BarChart2 style={{ color: 'oklch(0.52 0.16 256)', width: 24, height: 24 }} />
              <span style={{ fontSize: 20, fontWeight: 800, color: '#16161A' }}>UnifiquePro</span>
            </div>

            <div className="mb-8 text-center">
              <div className="flex justify-center mb-4">
                <div
                  className="p-3 rounded-full"
                  style={{ background: 'oklch(0.96 0.028 256)' }}
                >
                  <Smartphone style={{ width: 32, height: 32, color: 'oklch(0.52 0.16 256)' }} />
                </div>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#16161A', marginBottom: 8 }}>
                Verificação em dois fatores
              </h1>
              <p style={{ fontSize: 14, color: '#8A8A92', lineHeight: 1.6 }}>
                Abra o <strong style={{ color: '#3C3C44' }}>Google Authenticator</strong> e insira o código de 6 dígitos gerado para o <strong style={{ color: '#3C3C44' }}>UnifiquePro</strong>.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={totpCode}
                  onChange={(value) => setTotpCode(value)}
                  onComplete={handleVerify2FA}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button
                onClick={handleVerify2FA}
                className="w-full"
                disabled={twoFaLoading || totpCode.length !== 6}
                style={{ height: 50 }}
              >
                {twoFaLoading ? "Verificando..." : "Verificar e Entrar"}
              </Button>
              <button
                type="button"
                onClick={() => { setRequiresTwoFactor(false); setTotpCode(""); }}
                style={{ width: '100%', fontSize: 14, color: '#8A8A92', background: 'none', border: 'none', cursor: 'pointer' }}
                className="hover:text-[#3C3C44] transition-colors"
              >
                ← Voltar ao login
              </button>
            </div>
          </div>
        </div>

        <RightPanel title="Segurança em primeiro lugar" subtitle="Seu acesso está protegido com autenticação de dois fatores." />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}>
      {/* Painel esquerdo — formulário */}
      <div
        className="flex-1 flex items-center justify-center p-6 sm:p-10 min-h-screen"
        style={{ background: '#FFFFFF' }}
      >
        <div className="w-full max-w-md">
          {/* Logo — visível apenas no mobile */}
          <div className="flex items-center justify-center gap-2 mb-8 lg:hidden">
            <BarChart2 style={{ color: 'oklch(0.52 0.16 256)', width: 24, height: 24 }} />
            <span style={{ fontSize: 20, fontWeight: 800, color: '#16161A' }}>UnifiquePro</span>
          </div>

          {/* Título */}
          <div className="mb-8">
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#16161A', marginBottom: 6 }}>
              Seja bem-vindo
            </h1>
            <p style={{ fontSize: 14, color: '#8A8A92' }}>Faça seu login ou cadastre-se</p>
          </div>

          {/* Alerta e-mail não verificado */}
          {emailNotVerified && (
            <div
              className="mb-5 rounded-[12px] p-4 space-y-3"
              style={{ background: '#FBF3E0', border: '1px solid #EFE7CF' }}
            >
              <span style={{ color: 'oklch(0.52 0.10 72)', fontSize: 14, fontWeight: 600 }}>
                E-mail não verificado
              </span>
              <p style={{ fontSize: 13, color: 'oklch(0.45 0.09 72)', lineHeight: 1.5 }}>
                Verifique sua caixa de entrada e clique no link de ativação enviado para{" "}
                <strong>{unverifiedEmail}</strong>.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                style={{ borderColor: '#EFE7CF', color: 'oklch(0.52 0.10 72)' }}
                onClick={handleResendVerification}
                disabled={resendLoading || resendCooldown > 0}
              >
                {resendLoading ? "Enviando..." : resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : "Reenviar e-mail de verificação"}
              </Button>
            </div>
          )}

          {/* Botão Google */}
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full transition-all"
            style={{
              height: 50,
              padding: '0 16px',
              borderRadius: 12,
              border: '1px solid #E4E4E8',
              background: '#FFFFFF',
              color: '#3C3C44',
              fontWeight: 500,
              fontSize: 14,
              marginBottom: 20,
              textDecoration: 'none',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F6F6F8'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style={{ width: 20, height: 20, flexShrink: 0 }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Entrar com Google
          </a>

          {/* Divisor */}
          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full" style={{ borderTop: '1px solid #ECECEF' }} />
            </div>
            <div className="relative flex justify-center">
              <span style={{ background: '#FFFFFF', padding: '0 12px', fontSize: 12, color: '#A6A6AE', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ou entre com e-mail
              </span>
            </div>
          </div>

          {/* Formulário */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" style={{ fontSize: 13, fontWeight: 600, color: '#3C3C44' }}>
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" style={{ fontSize: 13, fontWeight: 600, color: '#3C3C44' }}>
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: 48 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#A6A6AE', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#5C5C66'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#A6A6AE'; }}
                >
                  {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid #E4E4E8', accentColor: 'oklch(0.52 0.16 256)', cursor: 'pointer' }}
                />
                <Label htmlFor="rememberMe" style={{ fontSize: 13, fontWeight: 400, color: '#5C5C66', cursor: 'pointer' }}>
                  Lembrar-me
                </Label>
              </div>
              <a
                href="/recuperar-senha"
                style={{ fontSize: 13, color: 'oklch(0.52 0.16 256)', fontWeight: 500, textDecoration: 'none' }}
                className="hover:underline transition-colors"
              >
                Esqueci minha senha
              </a>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              style={{ height: 50 }}
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center" style={{ fontSize: 14, color: '#8A8A92' }}>
            Não tem uma conta?{" "}
            <a
              href="/signup"
              style={{ color: 'oklch(0.52 0.16 256)', fontWeight: 600, textDecoration: 'none' }}
              className="hover:underline transition-colors"
            >
              Cadastre-se gratuitamente
            </a>
          </p>
        </div>
      </div>

      <RightPanel
        title="Controle total das suas finanças"
        subtitle="Gerencie transações, investimentos e patrimônio de múltiplas entidades em um único lugar."
      />
    </div>
  );
}

const menuItems = [
  { icon: LayoutDashboard, label: "Início", path: "/" },
  { icon: Building2, label: "Entidades", path: "/entities" },
  { icon: Receipt, label: "Transações", path: "/transactions" },
  { icon: Landmark, label: "Contas Bancárias", path: "/bank-accounts" },
  { icon: CreditCard, label: "Cartões", path: "/credit-cards" },
  { icon: Calendar, label: "Agenda", path: "/agenda" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

function LiveClock() {
  const [time, setTime] = useState(new Date());
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Sao_Paulo'
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo'
    });
  };

  if (isCollapsed) {
    return (
      <div className="flex items-center justify-center px-2 py-1.5">
        <Clock className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5 text-center" style={{ borderBottom: '1px solid #ECECEF' }}>
      <div className="text-xs font-mono" style={{ color: '#A6A6AE' }}>
        {formatDate(time)}
      </div>
      <div className="text-sm font-mono font-medium tracking-wider" style={{ color: '#5C5C66', fontVariantNumeric: 'tabular-nums' }}>
        {formatTime(time)}
      </div>
    </div>
  );
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 252;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    // Verificar se o usuário marcou "Manter conectado por 24h"
    const rememberMe = JSON.parse(localStorage.getItem('rememberMe') || 'false');

    // Se rememberMe está ativo, não aplicar timer de inatividade
    // A sessão será controlada apenas pelo JWT (24h fixas)
    if (rememberMe) {
      console.log('[Auth] RememberMe ativo - timer de inatividade desabilitado');
      return;
    }

    // Sem rememberMe: logout após 30min de inatividade
    const INACTIVITY_TIMEOUT = 30 * 60 * 1000;
    const resetTimer = () => {
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = setTimeout(() => {
        localStorage.removeItem('rememberMe');
        logout();
        setLocation('/');
      }, INACTIVITY_TIMEOUT);
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer();
    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    };
  }, [logout, setLocation]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return <LoginForm />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          style={{ background: '#FFFFFF', borderRight: '1px solid #ECECEF' }}
          disableTransition={isResizing}
        >
          {/* Sidebar Header - Logo */}
          <SidebarHeader style={{ padding: '22px 16px 16px' }}>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSidebar}
                className="flex items-center justify-center rounded-[10px] transition-colors focus:outline-none"
                style={{ width: 36, height: 36 }}
                aria-label="Toggle navigation"
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F4F4F6'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Menu style={{ width: 18, height: 18, color: '#8A8A92' }} />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <BarChart2 style={{ width: 22, height: 22, color: 'oklch(0.52 0.16 256)', flexShrink: 0 }} />
                  <span style={{ fontSize: 19, fontWeight: 800, color: '#16161A', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                    UnifiquePro
                  </span>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 flex flex-col">
            <SidebarMenu style={{ padding: '4px 10px', flex: 1 }}>
              {/* Main nav items */}
              {menuItems.map(item => {
                const isActive = location === item.path;
                const tourId = {
                  '/': 'nav-home',
                  '/entities': 'nav-entities',
                  '/transactions': 'nav-transactions',
                  '/bank-accounts': 'nav-bank-accounts',
                  '/agenda': 'nav-agenda',
                  '/settings': 'nav-settings',
                }[item.path];
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      data-tour={tourId}
                      style={{
                        height: 38,
                        borderRadius: 10,
                        padding: '0 12px',
                        fontSize: 14,
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? 'oklch(0.52 0.16 256)' : '#5C5C66',
                        background: isActive ? 'oklch(0.96 0.028 256)' : 'transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <item.icon
                        style={{ width: 17, height: 17, color: isActive ? 'oklch(0.52 0.16 256)' : '#8A8A92', flexShrink: 0 }}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* Divider */}
              {!isCollapsed && (
                <div style={{ margin: '8px 4px', borderTop: '1px solid #ECECEF' }} />
              )}

              {/* Secondary nav - Plans */}
              <SidebarMenuItem key="/planos">
                <SidebarMenuButton
                  isActive={location === "/planos"}
                  onClick={() => setLocation("/planos")}
                  tooltip="Planos"
                  style={{
                    height: 38,
                    borderRadius: 10,
                    padding: '0 12px',
                    fontSize: 14,
                    fontWeight: location === "/planos" ? 600 : 500,
                    color: location === "/planos" ? 'oklch(0.52 0.16 256)' : '#5C5C66',
                    background: location === "/planos" ? 'oklch(0.96 0.028 256)' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <Crown style={{ width: 17, height: 17, color: location === "/planos" ? 'oklch(0.52 0.16 256)' : '#8A8A92', flexShrink: 0 }} />
                  <span>Planos</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {user?.role === "admin" && (
                <SidebarMenuItem key="/admin">
                  <SidebarMenuButton
                    isActive={location === "/admin"}
                    onClick={() => setLocation("/admin")}
                    tooltip="Painel Admin"
                    style={{
                      height: 38,
                      borderRadius: 10,
                      padding: '0 12px',
                      fontSize: 14,
                      fontWeight: location === "/admin" ? 600 : 500,
                      color: location === "/admin" ? 'oklch(0.52 0.16 256)' : '#5C5C66',
                      background: location === "/admin" ? 'oklch(0.96 0.028 256)' : 'transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <ShieldCheck style={{ width: 17, height: 17, color: location === "/admin" ? 'oklch(0.52 0.16 256)' : '#8A8A92', flexShrink: 0 }} />
                    <span>Painel Admin</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter style={{ padding: '12px 10px 16px' }}>
            {/* Version + date */}
            <div className="group-data-[collapsible=icon]:hidden px-2 mb-2">
              <p style={{ fontSize: 11, color: '#8A8A92', textAlign: 'center', userSelect: 'none' }}>
                v{__APP_VERSION__}
              </p>
            </div>

            <LiveClock />

            {/* Mode toggle */}
            <div className="flex items-center justify-center my-2">
              <ModeToggle />
            </div>

            {/* User avatar card */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-tour="user-menu"
                  className="flex items-center gap-3 w-full text-left focus:outline-none transition-all group-data-[collapsible=icon]:justify-center"
                  style={{
                    background: '#F6F6F8',
                    border: '1px solid #EDEDF0',
                    borderRadius: 12,
                    padding: '10px 12px',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#D6D6DC'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#EDEDF0'; }}
                >
                  <Avatar style={{ width: 32, height: 32, flexShrink: 0 }}>
                    <AvatarFallback style={{ fontSize: 12, fontWeight: 600, background: 'oklch(0.96 0.028 256)', color: 'oklch(0.52 0.16 256)' }}>
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#16161A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                      {user?.name || "-"}
                    </p>
                    <p style={{ fontSize: 11, color: '#8A8A92', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {user?.email || "-"}
                    </p>
                  </div>
                  <LogOut style={{ width: 14, height: 14, color: '#A6A6AE', flexShrink: 0 }} className="group-data-[collapsible=icon]:hidden" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => window.location.href = '/profile'}
                  className="cursor-pointer"
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>Meu Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'oklch(0.52 0.16 256 / 0.2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        />
      </div>

      <SidebarInset style={{ background: 'var(--bg-page)' }}>
        {isMobile && (
          <div
            className="flex h-14 items-center justify-between px-2 sticky top-0 z-40"
            style={{ background: 'rgba(246,246,248,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #ECECEF' }}
          >
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-10 w-10 rounded-lg" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span style={{ color: '#16161A', fontWeight: 600, fontSize: 15 }}>
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            <ModeToggle />
          </div>
        )}
        <main className="flex-1" style={{ padding: '30px 38px 56px' }}>{children}</main>
      </SidebarInset>
      <OnboardingTour />
    </>
  );
}
