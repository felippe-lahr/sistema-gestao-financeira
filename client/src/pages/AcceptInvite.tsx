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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
  VIEWER: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  EDITOR: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  ADMIN: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

type AuthMode = "register" | "login";

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
        // Criar conta + aceitar convite
        const response = await fetch("/api/auth/register-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, name: name.trim(), password }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (data.emailExists) {
            // Email já cadastrado, mudar para modo login
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
        // Login + aceitar convite
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
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Link Inválido</CardTitle>
            <CardDescription>O link de convite não é válido ou está malformado.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" variant="outline" onClick={() => navigate("/")}>
              Ir para o início
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (isLoadingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="h-12 w-12 rounded-full bg-muted animate-pulse mx-auto mb-2" />
            <div className="h-6 w-48 bg-muted animate-pulse rounded mx-auto mb-2" />
            <div className="h-4 w-64 bg-muted animate-pulse rounded mx-auto" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="h-16 bg-muted animate-pulse rounded-lg" />
              <div className="h-16 bg-muted animate-pulse rounded-lg" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inviteError || !inviteInfo) {
    const msg = inviteError?.message || "";
    const isExpired = msg.includes("expirou");
    const isUsed = msg.includes("utilizado") || msg.includes("aceito");

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>
              {isExpired ? "Convite Expirado" : isUsed ? "Convite Já Utilizado" : "Convite Inválido"}
            </CardTitle>
            <CardDescription>
              {isExpired
                ? "Este link de convite expirou. Peça ao proprietário da entidade um novo convite."
                : isUsed
                ? "Este convite já foi aceito anteriormente."
                : msg || "Este link de convite não é válido."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" variant="outline" onClick={() => navigate("/")}>
              Ir para o início
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // --- Página principal ---
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md space-y-4">

        {/* Header da plataforma */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sistema de Gestão Financeira</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Convite de acesso compartilhado</p>
        </div>

        <Card className="shadow-xl">
          {/* Info do convite */}
          <CardHeader className="text-center pb-4">
            <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-3 bg-primary">
              <Building2 className="h-8 w-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-xl">{inviteInfo.entityName}</CardTitle>
            <CardDescription>
              <strong>{inviteInfo.inviterName || inviteInfo.inviterEmail || "Alguém"}</strong> convidou você para acessar esta entidade
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Nível de acesso */}
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <div className={`p-2 rounded-lg ${ROLE_COLORS[inviteInfo.role]}`}>
                {ROLE_ICONS[inviteInfo.role]}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Acesso como: <span className="font-bold">{ROLE_LABELS[inviteInfo.role]}</span>
                </p>
                <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[inviteInfo.role]}</p>
              </div>
            </div>

            {/* Email do convite */}
            {inviteInfo.inviteEmail && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="text-muted-foreground">
                  Este convite é para: <strong className="text-foreground">{inviteInfo.inviteEmail}</strong>
                </p>
              </div>
            )}

            {/* Validade */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                Convite válido até{" "}
                {format(new Date(inviteInfo.expiresAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>

            <div className="border-t pt-4">
              {/* Tabs: Criar conta / Já tenho conta */}
              <div className="flex rounded-lg border p-1 mb-4 bg-muted">
                <button
                  type="button"
                  onClick={() => { setAuthMode("register"); setPassword(""); setConfirmPassword(""); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    authMode === "register"
                      ? "bg-background shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <UserPlus className="h-4 w-4" />
                  Criar conta
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode("login"); setPassword(""); setConfirmPassword(""); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    authMode === "login"
                      ? "bg-background shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LogIn className="h-4 w-4" />
                  Já tenho conta
                </button>
              </div>

              {/* Formulário */}
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Email (somente leitura, vem do convite) */}
                <div className="space-y-1">
                  <Label htmlFor="invite-email-display">E-mail</Label>
                  <Input
                    id="invite-email-display"
                    type="email"
                    value={inviteInfo.inviteEmail || ""}
                    readOnly
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">E-mail definido pelo convite</p>
                </div>

                {/* Nome (apenas no cadastro) */}
                {authMode === "register" && (
                  <div className="space-y-1">
                    <Label htmlFor="invite-name">
                      <User className="h-3 w-3 inline mr-1" />
                      Nome completo <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="invite-name"
                      type="text"
                      placeholder="Seu nome completo"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                )}

                {/* Senha */}
                <div className="space-y-1">
                  <Label htmlFor="invite-password">
                    <Lock className="h-3 w-3 inline mr-1" />
                    {authMode === "register" ? "Criar senha" : "Senha"}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="invite-password"
                      type={showPassword ? "text" : "password"}
                      placeholder={authMode === "register" ? "Mínimo 6 caracteres" : "Sua senha"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirmar senha (apenas no cadastro) */}
                {authMode === "register" && (
                  <div className="space-y-1">
                    <Label htmlFor="invite-confirm-password">
                      Confirmar senha <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="invite-confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Repita a senha"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-destructive">As senhas não coincidem</p>
                    )}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isSubmitting}>
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
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
