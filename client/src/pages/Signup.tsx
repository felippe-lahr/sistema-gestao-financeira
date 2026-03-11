import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Check, ChevronRight, Building2, User, Mail, Lock, ArrowLeft } from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface FormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  organizationName: string;
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Sua conta", icon: User },
  { id: 2, label: "Organização", icon: Building2 },
  { id: 3, label: "Confirmação", icon: Check },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const isCompleted = currentStep > step.id;
        const isCurrent = currentStep === step.id;

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                  ${isCompleted
                    ? "bg-blue-600 border-blue-600 text-white"
                    : isCurrent
                    ? "bg-white border-blue-600 text-blue-600"
                    : "bg-white border-gray-200 text-gray-400"
                  }
                `}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  isCurrent ? "text-blue-600" : isCompleted ? "text-blue-500" : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`w-16 h-0.5 mb-5 mx-1 transition-all duration-300 ${
                  currentStep > step.id ? "bg-blue-600" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Etapa 1: Dados da conta ──────────────────────────────────────────────────

function Step1({
  data,
  onChange,
  onNext,
}: {
  data: FormData;
  onChange: (field: keyof FormData, value: string) => void;
  onNext: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.name.trim()) {
      toast.error("Informe seu nome completo");
      return;
    }
    if (!data.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      toast.error("Informe um e-mail válido");
      return;
    }
    if (data.password.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres");
      return;
    }
    if (data.password !== data.confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    onNext();
  };

  const passwordStrength = (() => {
    const p = data.password;
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    return score;
  })();

  const strengthLabel = ["", "Fraca", "Razoável", "Boa", "Forte", "Muito forte"][passwordStrength];
  const strengthColor = ["", "bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-blue-500", "bg-green-500"][passwordStrength];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name" className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          Nome completo
        </Label>
        <Input
          id="name"
          type="text"
          placeholder="João Silva"
          value={data.name}
          onChange={(e) => onChange("name", e.target.value)}
          autoComplete="name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          E-mail
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="joao@empresa.com"
          value={data.email}
          onChange={(e) => onChange("email", e.target.value)}
          autoComplete="email"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          Senha
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Mínimo 8 caracteres"
            value={data.password}
            onChange={(e) => onChange("password", e.target.value)}
            autoComplete="new-password"
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
        {data.password && (
          <div className="space-y-1">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    i <= passwordStrength ? strengthColor : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
            <p className={`text-xs ${strengthColor.replace("bg-", "text-")}`}>
              Força da senha: {strengthLabel}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword" className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          Confirmar senha
        </Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirm ? "text" : "password"}
            placeholder="Repita a senha"
            value={data.confirmPassword}
            onChange={(e) => onChange("confirmPassword", e.target.value)}
            autoComplete="new-password"
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {data.confirmPassword && data.password !== data.confirmPassword && (
          <p className="text-xs text-red-500">As senhas não coincidem</p>
        )}
        {data.confirmPassword && data.password === data.confirmPassword && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <Check className="h-3 w-3" /> Senhas conferem
          </p>
        )}
      </div>

      <Button type="submit" className="w-full mt-2">
        Próximo
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </form>
  );
}

// ─── Etapa 2: Dados da organização ────────────────────────────────────────────

function Step2({
  data,
  onChange,
  onNext,
  onBack,
}: {
  data: FormData;
  onChange: (field: keyof FormData, value: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.organizationName.trim()) {
      toast.error("Informe o nome da sua organização");
      return;
    }
    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="organizationName" className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          Nome da organização
        </Label>
        <Input
          id="organizationName"
          type="text"
          placeholder="Ex: Pousada Sol Nascente, Empresa XYZ..."
          value={data.organizationName}
          onChange={(e) => onChange("organizationName", e.target.value)}
          autoComplete="organization"
          required
        />
        <p className="text-xs text-muted-foreground">
          Este será o nome exibido no sistema. Pode ser alterado depois.
        </p>
      </div>

      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-4 space-y-2">
        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">O que você terá acesso:</p>
        <ul className="space-y-1.5">
          {[
            "Gestão de transações (receitas e despesas)",
            "Controle de contas bancárias e categorias",
            "Módulo de agenda e vencimentos",
            "Relatórios financeiros",
            "Compartilhamento com sua equipe",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-400">
              <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-3 mt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <Button type="submit" className="flex-1">
          Próximo
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </form>
  );
}

// ─── Etapa 3: Confirmação ─────────────────────────────────────────────────────

function Step3({
  data,
  onBack,
  onSubmit,
  isLoading,
}: {
  data: FormData;
  onBack: () => void;
  onSubmit: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 divide-y">
        <div className="flex items-center gap-3 p-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Nome</p>
            <p className="text-sm font-medium truncate">{data.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
            <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">E-mail</p>
            <p className="text-sm font-medium truncate">{data.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Organização</p>
            <p className="text-sm font-medium truncate">{data.organizationName}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 p-3 flex items-start gap-2">
        <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
          Após criar sua conta, você receberá um e-mail de verificação em{" "}
          <strong className="font-semibold break-all">{data.email}</strong>. Clique no link para ativar o acesso ao sistema.
        </p>
      </div>

      <div className="flex gap-3 mt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1" disabled={isLoading}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <Button onClick={onSubmit} className="flex-1" disabled={isLoading}>
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Criando conta...
            </span>
          ) : (
            <>
              <Check className="h-4 w-4 mr-1" />
              Criar minha conta
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Signup() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    organizationName: "",
  });

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      let response: Response;
      try {
        response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name.trim(),
            email: formData.email.toLowerCase().trim(),
            password: formData.password,
            organizationName: formData.organizationName.trim(),
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const data = await response.json();

      if (response.ok) {
        setSubmittedEmail(formData.email.toLowerCase().trim());
        setSubmitted(true);
      } else if (response.status === 409) {
        toast.error("Este e-mail já está cadastrado. Faça login ou use outro e-mail.");
      } else if (response.status === 429) {
        toast.error("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else {
        toast.error(data.error || "Erro ao criar conta. Tente novamente.");
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        toast.error(
          "A requisição demorou muito. Verifique seu e-mail — sua conta pode ter sido criada. Se não receber o e-mail, tente novamente."
        );
      } else {
        toast.error("Erro de conexão. Verifique sua internet e tente novamente.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Tela de sucesso: aguardando verificação ──────────────────────────────────
  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="pt-8 pb-8 text-center space-y-6">
            <div className="flex justify-center mb-2">
              <>
            <img src="/logo-unifique-pro.png" alt="UnifiquePro" style={{ width: '280px' }} className="h-auto object-contain dark:hidden" />
            <img src="/logo-unifique-pro-dark.png" alt="UnifiquePro" style={{ width: '280px' }} className="h-auto object-contain hidden dark:block" />
          </>
            </div>
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Mail className="h-10 w-10 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Verifique seu e-mail</h2>
              <p className="text-muted-foreground text-sm">
                Enviamos um link de ativação para
              </p>
              <p className="font-semibold text-blue-600 dark:text-blue-400 break-all">
                {submittedEmail}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-left space-y-2">
              <p className="text-sm font-medium">Próximos passos:</p>
              <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
                <li>Abra seu e-mail</li>
                <li>Clique no link de verificação</li>
                <li>Você será redirecionado automaticamente para o sistema</li>
              </ol>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Não recebeu o e-mail?</p>
              <ResendButton email={submittedEmail} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              Voltar para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Formulário de cadastro ───────────────────────────────────────────────────
  const stepTitles = [
    { title: "Crie sua conta", description: "Informe seus dados de acesso" },
    { title: "Sua organização", description: "Como sua empresa ou projeto se chama?" },
    { title: "Tudo certo!", description: "Revise os dados antes de confirmar" },
  ];

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <>
            <img src="/logo-unifique-pro.png" alt="UnifiquePro" style={{ width: '280px' }} className="h-auto object-contain dark:hidden" />
            <img src="/logo-unifique-pro-dark.png" alt="UnifiquePro" style={{ width: '280px' }} className="h-auto object-contain hidden dark:block" />
          </>
          </div>
          <CardTitle className="text-2xl font-bold">{stepTitles[step - 1].title}</CardTitle>
          <CardDescription>{stepTitles[step - 1].description}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Botão Google OAuth - apenas no passo 1 */}
          {step === 1 && (
            <>
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
                  Cadastrar com Google
                </a>
              </div>
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">ou cadastre com e-mail</span>
                </div>
              </div>
            </>
          )}

          <StepIndicator currentStep={step} />

          {step === 1 && (
            <Step1 data={formData} onChange={handleChange} onNext={() => setStep(2)} />
          )}
          {step === 2 && (
            <Step2
              data={formData}
              onChange={handleChange}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Step3
              data={formData}
              onBack={() => setStep(2)}
              onSubmit={handleSubmit}
              isLoading={isLoading}
            />
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Já tem uma conta?{" "}
              <button
                type="button"
                onClick={() => navigate("/")}
                className="text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors"
              >
                Fazer login
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Botão de reenvio ─────────────────────────────────────────────────────────

function ResendButton({ email }: { email: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const handleResend = async () => {
    if (cooldown > 0) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success("Novo link enviado! Verifique sua caixa de entrada.");
        setCooldown(60);
        const interval = setInterval(() => {
          setCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        toast.error(data.error || "Erro ao reenviar e-mail");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleResend}
      disabled={isLoading || cooldown > 0}
      className="w-full"
    >
      {isLoading
        ? "Enviando..."
        : cooldown > 0
        ? `Reenviar em ${cooldown}s`
        : "Reenviar e-mail de verificação"}
    </Button>
  );
}
