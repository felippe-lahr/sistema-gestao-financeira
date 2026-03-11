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
import { LayoutDashboard, LogOut, Menu, Building2, Receipt, Settings, Clock, User, Eye, EyeOff, Calendar, ShieldCheck } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { toast } from "sonner";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

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

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md mx-4 shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <img
              src="/logo-unifique-pro.png"
              alt="UnifiquePro"
              style={{ width: '280px' }} className="h-auto object-contain dark:hidden"
            />
            <img
              src="/logo-unifique-pro-dark.png"
              alt="UnifiquePro"
              style={{ width: '280px' }} className="h-auto object-contain hidden dark:block"
            />
          </div>
          <CardDescription className="text-sm text-muted-foreground">simplificando suas finanças</CardDescription>
        </CardHeader>
        <CardContent>
          {emailNotVerified && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-amber-600 dark:text-amber-400 text-sm font-medium">⚠️ E-mail não verificado</span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Verifique sua caixa de entrada e clique no link de ativação enviado para <strong>{unverifiedEmail}</strong>.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-100"
                onClick={handleResendVerification}
                disabled={resendLoading || resendCooldown > 0}
              >
                {resendLoading ? "Enviando..." : resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : "Reenviar e-mail de verificação"}
              </Button>
            </div>
          )}
          {/* Botão Google OAuth */}
          <div className="mb-4">
            <a
              href="/api/auth/google"
              className="flex items-center justify-center gap-3 w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Entrar com Google
            </a>
          </div>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border dark:border-gray-700-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="rememberMe" className="text-sm font-normal cursor-pointer">
                Manter conectado por 24 horas
              </Label>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Não tem uma conta?{" "}
              <a
                href="/signup"
                className="text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors"
              >
                Cadastre-se gratuitamente
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const menuItems = [
  { icon: LayoutDashboard, label: "Inicio", path: "/" },
  { icon: Building2, label: "Entidades", path: "/entities" },
  { icon: Receipt, label: "Transacoes", path: "/transactions" },
  { icon: Calendar, label: "Agenda", path: "/agenda" },
  { icon: Settings, label: "Configuracoes", path: "/settings" },
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
    <div className="flex flex-col gap-0.5 px-2 py-1.5 text-center border dark:border-gray-700-b border dark:border-gray-700-border dark:border-gray-700/40">
      <div className="text-xs font-mono text-muted-foreground">
        {formatDate(time)}
      </div>
      <div className="text-sm font-mono font-medium tracking-wider">
        {formatTime(time)}
      </div>
    </div>
  );
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
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
          className="border dark:border-gray-700-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center justify-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-10 w-10 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <Menu className="h-5 w-5 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center min-w-0 flex-1">
                  <img
                    src="/logo-unifique-pro.png"
                    alt="UnifiquePro"
                    style={{ width: '180px' }} className="h-auto object-contain dark:hidden"
                  />
                  <img
                    src="/logo-unifique-pro-dark.png"
                    alt="UnifiquePro"
                    style={{ width: '180px' }} className="h-auto object-contain hidden dark:block"
                  />
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 flex flex-col">
            <SidebarMenu className="px-2 py-1 flex-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-5 w-5 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {user?.role === "admin" && (
                <SidebarMenuItem key="/admin">
                  <SidebarMenuButton
                    isActive={location === "/admin"}
                    onClick={() => setLocation("/admin")}
                    tooltip="Painel Admin"
                    className={`h-10 transition-all font-normal text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300`}
                  >
                    <ShieldCheck className={`h-5 w-5 ${location === "/admin" ? "text-purple-600 dark:text-purple-400" : ""}`} />
                    <span>Painel Admin</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3 space-y-2">
            <LiveClock />
            <div className="flex items-center justify-center group-data-[collapsible=icon]:justify-center">
              <ModeToggle />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border dark:border-gray-700 shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
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
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border dark:border-gray-700-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-10 w-10 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            <ModeToggle />
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
