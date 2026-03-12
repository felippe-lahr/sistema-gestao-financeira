/**
 * Página de aceite de convite para entidade compartilhada.
 * Acessada via URL: /convite/:token
 *
 * Fluxo:
 * 1. Carrega informações do convite pelo token (nome da entidade, quem convidou, role)
 * 2. Detecta se o email do convite já tem conta cadastrada
 * 3a. Se NÃO tem conta: exibe formulário de CADASTRO (nome + senha)
 * 3b. Se JÁ tem conta: exibe formulário de LOGIN (email pré-preenchido + senha)
 * 4. Após autenticação: convite aceito automaticamente, redireciona para o dashboard
 */

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Edit,
  Shield,
  Clock,
  User,
  Lock,
  UserPlus,
  LogIn,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  VIEWER: "Visualizador",
  EDITOR: "Editor",
  ADMIN: "Administrador",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  VIEWER: "Você poderá visualizar dados e baixar arquivos desta entidade.",
  EDITOR: "Você poderá visualizar e criar/editar lançamentos nesta entidade.",
  ADMIN: "Você terá acesso completo para visualizar, criar, editar e excluir registros.",
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  VIEWER: <Eye className="h-5 w-5" />,
  EDITOR: <Edit className="h-5 w-5" />,
  ADMIN: <Shield className="h-5 w-5" />,
};

const ROLE_COLORS: Record<string, string> = {
  VIEWER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  EDITOR: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  ADMIN: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

type AuthMode = "register" | "login";

// Layout de erro/loading reutilizável com o mesmo estilo do login
function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Painel esquerdo — conteúdo */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white dark:bg-gray-950 min-h-screen">
        <div className="w-full max-w-md">
          {/* Logo — visível apenas no mobile */}
          <div className="flex justify-center mb-8 lg:hidden">
            <img
              src="/logo-unifique-pro.png"
              alt="UnifiquePro"
              style={{ width: "220px" }}
              className="h-auto object-contain dark:hidden"
            />
            <img
              src="/logo-unifique-pro-dark.png"
              alt="UnifiquePro"
              style={{ width: "220px" }}
              className="h-auto object-contain hidden dark:block"
            />
          </div>
          {children}
        </div>
      </div>
      {/* Painel direito — gradiente (oculto no mobile) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex-col items-center justify-center p-12">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-white rounded-full translate-x-1/3 translate-y-1/3" />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="relative z-10 text-center text-white max-w-md">
          <img
            src="/logo-unifique-pro-dark.png"
            alt="UnifiquePro"
            style={{ width: "260px" }}
            className="h-auto object-contain mx-auto mb-10 brightness-0 invert"
          />
          <h2 className="text-4xl font-bold mb-6 leading-tight">
            Gerencie suas finanças com inteligência
          </h2>
          <p className="text-blue-100 text-xl leading-relaxed">
            Controle transações, investimentos e patrimônio de múltiplas entidades em um único lugar.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvite() {
  const [, params] = useRoute("/convite/:token");
  const [, navigate] = useLocation();
  const token = params?.token;

  // Formulário
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: inviteInfo,
    isLoading: isLoadingInvite,
    error: inviteError,
  } = trpc.entitySharing.getInviteInfo.useQuery(
    { token: token! },
    {
      enabled: !!token,
      retry: false,
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      toast.error("Informe sua senha");
      return;
    }

    if (authMode === "register") {
      if (!name.trim()) {
        toast.error("Informe seu nome completo");
        return;
      }
      if (password.length < 6) {
        toast.error("A senha deve ter pelo menos 6 caracteres");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("As senhas não coincidem");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (authMode === "register") {
        const response = await fetch("/api/auth/register-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, name: name.trim(), password }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (data.emailExists) {
            toast.info("Este e-mail já possui uma conta. Faça login para aceitar o convite.");
            setAuthMode("login");
            setPassword("");
            setConfirmPassword("");
          } else {
            toast.error(data.error || "Erro ao criar conta");
          }
          return;
        }

        toast.success("Conta criada e convite aceito! Bem-vindo(a)!");
        localStorage.setItem("showFinancialValues", JSON.stringify(false));
        localStorage.setItem("rememberMe", JSON.stringify(false));
        window.location.href = `/dashboard/${data.entityId}`;
      } else {
        const response = await fetch("/api/auth/login-accept-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            email: inviteInfo?.inviteEmail,
            password,
            rememberMe: false,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          toast.error(data.error || "Email ou senha incorretos");
          return;
        }

        toast.success("Login realizado e convite aceito! Bem-vindo(a)!");
        localStorage.setItem("showFinancialValues", JSON.stringify(false));
        localStorage.setItem("rememberMe", JSON.stringify(false));
        window.location.href = `/dashboard/${data.entityId}`;
      }
    } catch (err) {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Estados de erro do convite ---
  if (!token) {
    return (
      <InviteLayout>
        <div className="text-center space-y-4">
          <XCircle className="h-14 w-14 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Link Inválido</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            O link de convite não é válido ou está malformado.
          </p>
          <Button className="w-full h-11 rounded-xl" variant="outline" onClick={() => navigate("/")}>
            Ir para o início
          </Button>
        </div>
      </InviteLayout>
    );
  }

  if (isLoadingInvite) {
    return (
      <InviteLayout>
        <div className="space-y-4">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 animate-pulse rounded" />
          <div className="h-4 w-64 bg-gray-200 dark:bg-gray-800 animate-pulse rounded" />
          <div className="h-20 bg-gray-200 dark:bg-gray-800 animate-pulse rounded-xl" />
          <div className="h-11 bg-gray-200 dark:bg-gray-800 animate-pulse rounded-xl" />
          <div className="h-11 bg-gray-200 dark:bg-gray-800 animate-pulse rounded-xl" />
        </div>
      </InviteLayout>
    );
  }

  if (inviteError || !inviteInfo) {
    const msg = inviteError?.message || "";
    const isExpired = msg.includes("expirou");
    const isUsed = msg.includes("utilizado") || msg.includes("aceito");

    return (
      <InviteLayout>
        <div className="text-center space-y-4">
          <XCircle className="h-14 w-14 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isExpired ? "Convite Expirado" : isUsed ? "Convite Já Utilizado" : "Convite Inválido"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isExpired
              ? "Este link de convite expirou. Peça ao proprietário da entidade um novo convite."
              : isUsed
              ? "Este convite já foi aceito anteriormente."
              : msg || "Este link de convite não é válido."}
          </p>
          <Button className="w-full h-11 rounded-xl" variant="outline" onClick={() => navigate("/")}>
            Ir para o início
          </Button>
        </div>
      </InviteLayout>
    );
  }

  // --- Página principal ---
  return (
    <InviteLayout>
      {/* Título */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Você foi convidado!</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Crie sua conta ou entre para aceitar o convite
        </p>
      </div>

      {/* Card da entidade */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 mb-5">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {inviteInfo.entityName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            Convidado por <strong>{inviteInfo.inviterName || inviteInfo.inviterEmail || "alguém"}</strong>
          </p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${ROLE_COLORS[inviteInfo.role]}`}>
          {ROLE_ICONS[inviteInfo.role]}
          {ROLE_LABELS[inviteInfo.role]}
        </div>
      </div>

      {/* Validade */}
      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mb-5">
        <Clock className="h-3 w-3" />
        <span>
          Convite válido até{" "}
          {format(new Date(inviteInfo.expiresAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </span>
      </div>

      {/* Tabs: Criar conta / Já tenho conta */}
      <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 p-1 mb-5 bg-gray-100 dark:bg-gray-800">
        <button
          type="button"
          onClick={() => { setAuthMode("register"); setPassword(""); setConfirmPassword(""); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            authMode === "register"
              ? "bg-white dark:bg-gray-950 shadow text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          <UserPlus className="h-4 w-4" />
          Criar conta
        </button>
        <button
          type="button"
          onClick={() => { setAuthMode("login"); setPassword(""); setConfirmPassword(""); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            authMode === "login"
              ? "bg-white dark:bg-gray-950 shadow text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          <LogIn className="h-4 w-4" />
          Já tenho conta
        </button>
      </div>

      {/* Formulário */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email (somente leitura, vem do convite) */}
        <div className="space-y-1.5">
          <Label htmlFor="invite-email-display" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            E-mail
          </Label>
          <Input
            id="invite-email-display"
            type="email"
            value={inviteInfo.inviteEmail || ""}
            readOnly
            className="h-11 rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-not-allowed text-gray-500 dark:text-gray-400"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500">E-mail definido pelo convite</p>
        </div>

        {/* Nome (apenas no cadastro) */}
        {authMode === "register" && (
          <div className="space-y-1.5">
            <Label htmlFor="invite-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              <User className="h-3 w-3 inline mr-1" />
              Nome completo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="invite-name"
              type="text"
              placeholder="Seu nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500"
            />
          </div>
        )}

        {/* Senha */}
        <div className="space-y-1.5">
          <Label htmlFor="invite-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            <Lock className="h-3 w-3 inline mr-1" />
            {authMode === "register" ? "Criar senha" : "Senha"}{" "}
            <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input
              id="invite-password"
              type={showPassword ? "text" : "password"}
              placeholder={authMode === "register" ? "Mínimo 6 caracteres" : "Sua senha"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Confirmar senha (apenas no cadastro) */}
        {authMode === "register" && (
          <div className="space-y-1.5">
            <Label htmlFor="invite-confirm-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirmar senha <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="invite-confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-11 rounded-xl border-gray-200 dark:border-gray-700 focus:border-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-500">As senhas não coincidem</p>
            )}
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all shadow-sm hover:shadow-md"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            "Processando..."
          ) : authMode === "register" ? (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Criar conta e aceitar convite
            </>
          ) : (
            <>
              <LogIn className="mr-2 h-4 w-4" />
              Entrar e aceitar convite
            </>
          )}
        </Button>
      </form>

      {/* Descrição do nível de acesso */}
      <p className="mt-5 text-center text-xs text-gray-400 dark:text-gray-500">
        {ROLE_DESCRIPTIONS[inviteInfo.role]}
      </p>
    </InviteLayout>
  );
}
