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
import { LayoutDashboard, LogOut, Menu, Building2, Receipt, Settings, Clock, User, Eye, EyeOff, Calendar, ShieldCheck, Crown, Landmark, CreditCard, Smartphone, TrendingUp, Shield, Zap, BarChart2, PieChart, ArrowUpDown, Wallet, Banknote } from "lucide-react";
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

  // Painel direito reutilizável
  const RightPanel = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div
      className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden flex-col items-center justify-center p-12"
      style={{ background: 'linear-gradient(145deg, #0A3270 0%, #1255A8 38%, #1a67c2 68%, #0E4A99 100%)' }}
    >
      {/* Radial glows */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 25% 18%, rgba(255,255,255,0.1) 0%, transparent 52%),
            radial-gradient(ellipse at 75% 82%, rgba(0,0,0,0.22) 0%, transparent 52%),
            radial-gradient(ellipse at 55% 45%, rgba(26,103,194,0.25) 0%, transparent 60%)
          `,
        }}
      />

      {/* Decorative rings */}
      <div className="absolute pointer-events-none" style={{ width: 420, height: 420, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
      <div className="absolute pointer-events-none" style={{ width: 640, height: 640, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.03)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />

      {/* ── Floating SVG Widgets ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">

        {/* Widget 1 — Transaction list (top-left) */}
        <div className="lf1 absolute" style={{ top: '6%', left: '3%' }}>
          <div style={{ width: 200, borderRadius: 14, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.18)', padding: '12px 14px', boxShadow: '0 20px 60px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.25)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Transações</div>
            {[
              { icon: '↑', bg: 'rgba(74,222,128,0.25)', color: '#4ADE80', name: 'Salário', cat: 'Renda', amount: '+R$8.500', amtColor: '#4ADE80' },
              { icon: '↓', bg: 'rgba(248,113,113,0.25)', color: '#F87171', name: 'Aluguel', cat: 'Moradia', amount: '-R$2.200', amtColor: '#F87171' },
              { icon: '↓', bg: 'rgba(248,113,113,0.25)', color: '#F87171', name: 'Bradesco', cat: 'Cartão', amount: '-R$769,06', amtColor: '#F87171' },
            ].map((tx, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: i < 2 ? 8 : 0, borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none', marginBottom: i < 2 ? 8 : 0 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: tx.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, color: tx.color, fontWeight: 700 }}>{tx.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2 }}>{tx.name}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>{tx.cat}</div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: tx.amtColor, flexShrink: 0 }}>{tx.amount}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Widget 2 — Bar chart / Monthly spend (top-right) */}
        <div className="lf3 absolute" style={{ top: '5%', right: '2%' }}>
          <div style={{ width: 188, borderRadius: 14, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.16)', padding: '12px 14px', boxShadow: '0 16px 50px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Gastos Mensais</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4ADE80' }}>↑ 12%</div>
            </div>
            <svg width="160" height="58" viewBox="0 0 160 58">
              {[
                { h: 28, x: 0 }, { h: 44, x: 28 }, { h: 34, x: 56 },
                { h: 50, x: 84 }, { h: 38, x: 112 }, { h: 54, x: 140 },
              ].map(({ h, x }, i) => (
                <rect key={i} x={x} y={58 - h} width="19" height={h} rx="4"
                  fill={i === 5 ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.22)'} />
              ))}
              <line x1="0" y1="57.5" x2="160" y2="57.5" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
              {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'].map(m => (
                <span key={m} style={{ fontSize: 8, color: 'rgba(255,255,255,0.28)', width: 19, textAlign: 'center', display: 'block' }}>{m}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Widget 3 — Credit card (mid-left) */}
        <div className="lf5 absolute" style={{ top: '40%', left: '1%' }}>
          <div style={{ width: 210, borderRadius: 16, background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.2)', padding: '16px 18px', boxShadow: '0 20px 60px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.28)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ width: 32, height: 24, borderRadius: 5, background: 'rgba(255,255,255,0.28)', position: 'relative', overflow: 'hidden' }}>
                <svg width="32" height="24" viewBox="0 0 32 24" style={{ position: 'absolute', inset: 0 }}>
                  <line x1="0" y1="8" x2="32" y2="8" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
                  <line x1="0" y1="16" x2="32" y2="16" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
                  <line x1="11" y1="0" x2="11" y2="24" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
                  <line x1="22" y1="0" x2="22" y2="24" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
                </svg>
              </div>
              <div style={{ display: 'flex' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.32)' }} />
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', marginLeft: -9 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {['••••', '••••', '••••', '3452'].map((p, i) => (
                <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.08em' }}>{p}</span>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Portador</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.88)' }}>DEMO USER</div>
              </div>
              <div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Validade</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.88)' }}>12/28</div>
              </div>
            </div>
          </div>
        </div>

        {/* Widget 4 — Category donut (mid-right) */}
        <div className="lf2 absolute" style={{ top: '38%', right: '2%' }}>
          <div style={{ width: 168, borderRadius: 14, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.15)', padding: '12px 14px', boxShadow: '0 16px 50px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Categorias</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Donut — r=22, circ≈138.23 */}
              <svg width="60" height="60" viewBox="0 0 60 60" style={{ flexShrink: 0 }}>
                <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="10"
                  strokeDasharray="55.29 82.94" strokeDashoffset="0" transform="rotate(-90 30 30)" />
                <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(74,222,128,0.7)" strokeWidth="10"
                  strokeDasharray="41.47 96.76" strokeDashoffset="-55.29" transform="rotate(-90 30 30)" />
                <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(248,113,113,0.6)" strokeWidth="10"
                  strokeDasharray="41.47 96.76" strokeDashoffset="-96.76" transform="rotate(-90 30 30)" />
              </svg>
              <div style={{ flex: 1 }}>
                {[
                  { color: 'rgba(255,255,255,0.65)', label: 'Moradia', pct: '40%' },
                  { color: 'rgba(74,222,128,0.7)', label: 'Renda', pct: '30%' },
                  { color: 'rgba(248,113,113,0.6)', label: 'Outros', pct: '30%' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: i < 2 ? 6 : 0 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', flex: 1 }}>{item.label}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{item.pct}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Widget 5 — Monthly summary / line chart (bottom-left) */}
        <div className="lf4 absolute" style={{ bottom: '6%', left: '2%' }}>
          <div style={{ width: 196, borderRadius: 14, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.16)', padding: '12px 14px', boxShadow: '0 20px 60px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.22)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Resumo do Mês</div>
            <svg width="168" height="52" viewBox="0 0 168 52">
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
              </defs>
              <path d="M0,48 C24,42 34,34 56,28 C78,22 88,30 112,16 C130,6 148,12 168,9 L168,52 L0,52 Z" fill="url(#lineGrad)" />
              <path d="M0,48 C24,42 34,34 56,28 C78,22 88,30 112,16 C130,6 148,12 168,9" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="112" cy="16" r="3.5" fill="white" opacity="0.85" />
              <circle cx="168" cy="9" r="3.5" fill="white" opacity="0.95" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.38)' }}>Receitas</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4ADE80' }}>+R$12.5k</div>
              </div>
              <div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.38)' }}>Despesas</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#F87171' }}>-R$8.3k</div>
              </div>
              <div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.38)' }}>Saldo</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>+R$4.2k</div>
              </div>
            </div>
          </div>
        </div>

        {/* Widget 6 — Quick stats (bottom-right) */}
        <div className="lf6 absolute" style={{ bottom: '8%', right: '2%' }}>
          <div style={{ width: 170, borderRadius: 14, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,0.15)', padding: '12px 14px', boxShadow: '0 16px 50px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Relatório</div>
            {[
              { label: 'Contas pagas', value: '14', icon: '✓', color: '#4ADE80' },
              { label: 'Pendentes', value: '3', icon: '◉', color: '#FBBF24' },
              { label: 'Vencidas', value: '1', icon: '✕', color: '#F87171' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < 2 ? 7 : 0 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: `${item.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, color: item.color }}>{item.icon}</div>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', flex: 1 }}>{item.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
      {/* ── / Floating Widgets ── */}

      {/* Main content — centered */}
      <div className="relative z-10 text-center" style={{ maxWidth: 380 }}>
        <div className="flex justify-center mb-8">
          <img src="/logo-unifique-pro-dark.png" alt="UnifiquePro" style={{ width: 300, height: 'auto' }} />
        </div>

        <h2 style={{ fontSize: 30, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25, marginBottom: 14, letterSpacing: '-0.025em' }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ color: 'rgba(255,255,255,0.58)', fontSize: 15, lineHeight: 1.75, marginBottom: 44 }}>
            {subtitle}
          </p>
        )}

        <div className="grid grid-cols-3 gap-6" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 32 }}>
          {[
            { value: '500+', label: 'empresas' },
            { value: 'R$2M+', label: 'gerenciados' },
            { value: '99.9%', label: 'uptime' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div style={{ fontSize: 24, fontWeight: 800, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', marginTop: 4 }}>{stat.label}</div>
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
        {/* Painel esquerdo — 2FA limpo */}
        <div
          className="flex-1 flex items-center justify-center p-6 sm:p-10 min-h-screen"
          style={{ background: 'var(--bg-surface)' }}
        >
          <div className="w-full max-w-md">
            <div className="mb-8 text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-full" style={{ background: 'var(--accent-soft)' }}>
                  <Smartphone style={{ width: 32, height: 32, color: 'var(--primary)' }} />
                </div>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                Verificação em dois fatores
              </h1>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Abra o <strong style={{ color: 'var(--text-secondary)' }}>Google Authenticator</strong> e insira o código de 6 dígitos gerado para o <strong style={{ color: 'var(--text-secondary)' }}>UnifiquePro</strong>.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={totpCode} onChange={(value) => setTotpCode(value)} onComplete={handleVerify2FA}>
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
              <Button onClick={handleVerify2FA} className="w-full" disabled={twoFaLoading || totpCode.length !== 6} style={{ height: 50 }}>
                {twoFaLoading ? "Verificando..." : "Verificar e Entrar"}
              </Button>
              <button
                type="button"
                onClick={() => { setRequiresTwoFactor(false); setTotpCode(""); }}
                style={{ width: '100%', fontSize: 14, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                className="hover:text-[#3C3C44] dark:hover:text-[#C4C4D0] transition-colors"
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
      {/* Painel esquerdo — formulário limpo */}
      <div
        className="flex-1 flex items-center justify-center p-6 sm:p-10 min-h-screen"
        style={{ background: 'var(--bg-surface)' }}
      >
        <div className="w-full max-w-md">
          {/* Título */}
          <div className="mb-8">
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Seja bem-vindo
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Faça seu login ou cadastre-se</p>
          </div>

          {/* Alerta e-mail não verificado */}
          {emailNotVerified && (
            <div
              className="mb-5 rounded-[12px] p-4 space-y-3"
              style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber-border)' }}
            >
              <span style={{ color: '#7a5c00', fontSize: 14, fontWeight: 600 }} className="dark:text-amber-300">
                E-mail não verificado
              </span>
              <p style={{ fontSize: 13, lineHeight: 1.5 }} className="text-amber-800 dark:text-amber-400">
                Verifique sua caixa de entrada e clique no link de ativação enviado para{" "}
                <strong>{unverifiedEmail}</strong>.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
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
            className="flex items-center justify-center gap-3 w-full transition-all border border-[#E4E4E8] dark:border-[#2C2C3C] rounded-[12px] hover:bg-[#F6F6F8] dark:hover:bg-[#252532]"
            style={{
              height: 50,
              padding: '0 16px',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              fontWeight: 500,
              fontSize: 14,
              marginBottom: 20,
              textDecoration: 'none',
            }}
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
              <span className="w-full border-t border-[#ECECEF] dark:border-[#2C2C3C]" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-[11px] uppercase tracking-widest text-[#A6A6AE] dark:text-[#60607A]" style={{ background: 'var(--bg-surface)' }}>
                ou entre com e-mail
              </span>
            </div>
          </div>

          {/* Formulário */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px] font-semibold text-[#3C3C44] dark:text-[#C4C4D0]">
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
              <Label htmlFor="password" className="text-[13px] font-semibold text-[#3C3C44] dark:text-[#C4C4D0]">
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors text-[#A6A6AE] dark:text-[#60607A] hover:text-[#5C5C66] dark:hover:text-[#A0A0B8]"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
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
                  style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid #E4E4E8', accentColor: '#1a67c2', cursor: 'pointer' }}
                />
                <Label htmlFor="rememberMe" className="text-[13px] font-normal text-[#5C5C66] dark:text-[#A0A0B8] cursor-pointer">
                  Lembrar-me
                </Label>
              </div>
              <a
                href="/recuperar-senha"
                style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 500, textDecoration: 'none' }}
                className="hover:underline transition-colors"
              >
                Esqueci minha senha
              </a>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading} style={{ height: 50 }}>
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-[14px] text-[#8A8A92] dark:text-[#80809A]">
            Não tem uma conta?{" "}
            <a
              href="/signup"
              style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
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
    <div className="flex flex-col gap-0.5 px-2 py-1.5 text-center border-b border-[#ECECEF] dark:border-[#2C2C3C]">
      <div className="text-xs font-mono text-[#A6A6AE] dark:text-[#60607A]">
        {formatDate(time)}
      </div>
      <div className="text-sm font-mono font-medium tracking-wider text-[#5C5C66] dark:text-[#A0A0B8]" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
          style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border-default)' }}
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
                <div className="flex items-center min-w-0">
                  <img
                    src="/logo-unifique-pro.png"
                    alt="UnifiquePro"
                    className="h-8 w-auto dark:hidden"
                    style={{ maxWidth: 160 }}
                  />
                  <img
                    src="/logo-unifique-pro-dark.png"
                    alt="UnifiquePro"
                    className="h-8 w-auto hidden dark:block"
                    style={{ maxWidth: 160 }}
                  />
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
                        color: isActive ? 'var(--primary)' : 'var(--text-tertiary)',
                        background: isActive ? 'var(--sidebar-accent)' : 'transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <item.icon
                        style={{ width: 17, height: 17, color: isActive ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0 }}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* Divider */}
              {!isCollapsed && (
                <div style={{ margin: '8px 4px', borderTop: '1px solid var(--border-default)' }} />
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
                    color: location === "/planos" ? 'var(--primary)' : 'var(--text-tertiary)',
                    background: location === "/planos" ? 'var(--sidebar-accent)' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <Crown style={{ width: 17, height: 17, color: location === "/planos" ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0 }} />
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
                      color: location === "/admin" ? 'var(--primary)' : 'var(--text-tertiary)',
                      background: location === "/admin" ? 'var(--sidebar-accent)' : 'transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <ShieldCheck style={{ width: 17, height: 17, color: location === "/admin" ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0 }} />
                    <span>Painel Admin</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter style={{ padding: '12px 10px 16px' }}>
            {/* Version + date */}
            <div className="group-data-[collapsible=icon]:hidden px-2 mb-2">
              <p className="text-[11px] text-center select-none text-[#8A8A92] dark:text-[#60607A]">
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
                  className="flex items-center gap-3 w-full text-left focus:outline-none transition-all group-data-[collapsible=icon]:justify-center rounded-[12px] border border-[#EDEDF0] dark:border-[#2C2C3C] bg-[#F6F6F8] dark:bg-[#1C1C24] hover:border-[#D6D6DC] dark:hover:border-[#3C3C50]"
                  style={{ padding: '10px 12px' }}
                >
                  <Avatar style={{ width: 32, height: 32, flexShrink: 0 }}>
                    <AvatarFallback className="text-[12px] font-semibold bg-[#EBF3FC] dark:bg-[#1E2D4A] text-[#1a67c2] dark:text-[#93C5FD]">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-[13px] font-semibold text-[#16161A] dark:text-[#F0F0F6] overflow-hidden text-ellipsis whitespace-nowrap leading-[1.3]">
                      {user?.name || "-"}
                    </p>
                    <p className="text-[11px] text-[#8A8A92] dark:text-[#60607A] overflow-hidden text-ellipsis whitespace-nowrap mt-0.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                  <LogOut className="w-[14px] h-[14px] text-[#A6A6AE] dark:text-[#60607A] shrink-0 group-data-[collapsible=icon]:hidden" />
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
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1a67c233'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        />
      </div>

      <SidebarInset style={{ background: 'var(--bg-page)' }}>
        {isMobile && (
          <div
            className="flex h-14 items-center justify-between px-2 sticky top-0 z-40 border-b border-[#ECECEF] dark:border-[#2C2C3C]"
            style={{ background: 'var(--bg-page)', backdropFilter: 'blur(8px)', opacity: 0.97 }}
          >
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-10 w-10 rounded-lg" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 15 }}>
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
