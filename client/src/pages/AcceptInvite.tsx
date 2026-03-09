/**
 * Página de aceite de convite para entidade compartilhada.
 * Acessada via URL: /convite/:token
 *
 * Fluxo:
 * 1. Carrega informações do convite pelo token
 * 2. Se o usuário não estiver logado, redireciona para login com redirect de volta
 * 3. Se estiver logado, exibe informações do convite e botão de aceitar
 * 4. Após aceitar, redireciona para o dashboard da entidade
 */

import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  CheckCircle,
  XCircle,
  Eye,
  Edit,
  Shield,
  Clock,
  User,
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

export default function AcceptInvite() {
  const [, params] = useRoute("/convite/:token");
  const [, navigate] = useLocation();
  const token = params?.token;

  const { data: currentUser } = trpc.auth.me.useQuery();

  const {
    data: inviteInfo,
    isLoading: isLoadingInvite,
    error: inviteError,
  } = trpc.entitySharing.getInviteInfo.useQuery(
    { token: token! },
    { enabled: !!token }
  );

  const acceptMutation = trpc.entitySharing.acceptInvite.useMutation({
    onSuccess: (data) => {
      toast.success("Convite aceito! Você agora tem acesso à entidade.");
      // Redirecionar para o dashboard da entidade
      navigate(`/dashboard/${data.entityId}`);
    },
    onError: (error) => {
      toast.error("Erro ao aceitar convite: " + error.message);
    },
  });

  const handleAccept = () => {
    if (!currentUser) {
      // Redirecionar para login com redirect de volta
      const redirectUrl = encodeURIComponent(window.location.pathname);
      navigate(`/?redirect=${redirectUrl}`);
      return;
    }
    if (token) {
      acceptMutation.mutate({ token });
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Link Inválido</CardTitle>
            <CardDescription>
              O link de convite não é válido ou está malformado.
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

  if (isLoadingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-8 w-3/4 mb-2" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inviteError) {
    const isExpired = inviteError.message.includes("expirou");
    const isUsed = inviteError.message.includes("utilizado");

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>{isExpired ? "Convite Expirado" : isUsed ? "Convite Já Utilizado" : "Convite Inválido"}</CardTitle>
            <CardDescription>
              {isExpired
                ? "Este link de convite expirou. Peça ao proprietário da entidade um novo convite."
                : isUsed
                ? "Este convite já foi aceito anteriormente."
                : inviteError.message}
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

  if (!inviteInfo) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-4">
        {/* Header da plataforma */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Sistema de Gestão Financeira</h1>
          <p className="text-muted-foreground text-sm">Convite de acesso compartilhado</p>
        </div>

        <Card>
          <CardHeader className="text-center pb-4">
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-3 bg-primary"
            >
              <Building2 className="h-8 w-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-xl">{inviteInfo.entityName}</CardTitle>
            <CardDescription>
              Você foi convidado para acessar esta entidade
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Quem convidou */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Convidado por</p>
                <p className="text-sm text-muted-foreground">
                  {inviteInfo.inviterName || inviteInfo.inviterEmail || "Proprietário"}
                </p>
              </div>
            </div>

            {/* Nível de acesso */}
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <div className={`p-2 rounded-lg ${ROLE_COLORS[inviteInfo.role]}`}>
                {ROLE_ICONS[inviteInfo.role]}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Nível de acesso: <span className="font-bold">{ROLE_LABELS[inviteInfo.role]}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {ROLE_DESCRIPTIONS[inviteInfo.role]}
                </p>
              </div>
            </div>

            {/* Validade */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                Convite válido até{" "}
                {format(new Date(inviteInfo.expiresAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>

            {/* Aviso se não estiver logado */}
            {!currentUser && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Você precisa estar logado para aceitar este convite. Clique em "Aceitar Convite" para fazer login.
                </p>
              </div>
            )}

            {/* Info se já estiver logado */}
            {currentUser && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Você está logado como <strong>{currentUser.name || currentUser.email}</strong>.
                  Ao aceitar, você terá acesso a esta entidade.
                </p>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/")}
            >
              Recusar
            </Button>
            <Button
              className="flex-1"
              onClick={handleAccept}
              disabled={acceptMutation.isPending}
            >
              {acceptMutation.isPending ? (
                "Aceitando..."
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Aceitar Convite
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
