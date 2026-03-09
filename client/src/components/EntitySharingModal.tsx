/**
 * Modal de compartilhamento de entidade com RBAC.
 * Permite ao dono da entidade:
 * - Criar links de convite com roles específicos
 * - Ver e gerenciar membros atuais
 * - Revogar convites pendentes
 * - Remover membros
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Copy,
  Link,
  Trash2,
  UserPlus,
  Users,
  Clock,
  Shield,
  Eye,
  Edit,
  Crown,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Role = "VIEWER" | "EDITOR" | "ADMIN";

const ROLE_LABELS: Record<string, string> = {
  VIEWER: "Visualizador",
  EDITOR: "Editor",
  ADMIN: "Administrador",
  OWNER: "Proprietário",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  VIEWER: "Visualiza dados e baixa arquivos",
  EDITOR: "Visualiza + cria e edita lançamentos",
  ADMIN: "Editor + pode excluir registros",
  OWNER: "Acesso total + gerencia membros",
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  VIEWER: <Eye className="h-4 w-4" />,
  EDITOR: <Edit className="h-4 w-4" />,
  ADMIN: <Shield className="h-4 w-4" />,
  OWNER: <Crown className="h-4 w-4" />,
};

const ROLE_COLORS: Record<string, string> = {
  VIEWER: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  EDITOR: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  ADMIN: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  OWNER: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

interface EntitySharingModalProps {
  entity: { id: number; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EntitySharingModal({ entity, open, onOpenChange }: EntitySharingModalProps) {
  const [selectedRole, setSelectedRole] = useState<Role>("VIEWER");
  const [email, setEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [linkExpiry, setLinkExpiry] = useState<Date | null>(null);

  const utils = trpc.useUtils();

  const { data: sharingData, isLoading } = trpc.entitySharing.listMembers.useQuery(
    { entityId: entity.id },
    { enabled: open }
  );

  const createInviteMutation = trpc.entitySharing.createInvite.useMutation({
    onSuccess: (data) => {
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/convite/${data.token}`;
      setGeneratedLink(link);
      setLinkExpiry(new Date(data.expiresAt));
      utils.entitySharing.listMembers.invalidate({ entityId: entity.id });
      toast.success("Link de convite gerado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao gerar convite: " + error.message);
    },
  });

  const removeMemberMutation = trpc.entitySharing.removeMember.useMutation({
    onSuccess: () => {
      utils.entitySharing.listMembers.invalidate({ entityId: entity.id });
      toast.success("Membro removido com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao remover membro: " + error.message);
    },
  });

  const updateRoleMutation = trpc.entitySharing.updateMemberRole.useMutation({
    onSuccess: () => {
      utils.entitySharing.listMembers.invalidate({ entityId: entity.id });
      toast.success("Permissão atualizada!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar permissão: " + error.message);
    },
  });

  const revokeInviteMutation = trpc.entitySharing.revokeInvite.useMutation({
    onSuccess: () => {
      utils.entitySharing.listMembers.invalidate({ entityId: entity.id });
      toast.success("Convite revogado!");
    },
    onError: (error) => {
      toast.error("Erro ao revogar convite: " + error.message);
    },
  });

  const handleGenerateLink = () => {
    setGeneratedLink(null);
    createInviteMutation.mutate({
      entityId: entity.id,
      role: selectedRole,
      email: email.trim() || undefined,
    });
  };

  const handleCopyLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      toast.success("Link copiado para a área de transferência!");
    }
  };

  const handleClose = () => {
    setGeneratedLink(null);
    setEmail("");
    setSelectedRole("VIEWER");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Compartilhar: {entity.name}
          </DialogTitle>
          <DialogDescription>
            Convide pessoas para acessar esta entidade com diferentes níveis de permissão.
          </DialogDescription>
        </DialogHeader>

        {/* Seção: Criar Convite */}
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Gerar Link de Convite
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">E-mail do convidado (opcional)</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="contador@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Nível de acesso</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["VIEWER", "EDITOR", "ADMIN"] as Role[]).map((role) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        {ROLE_ICONS[role]}
                        <div>
                          <span className="font-medium">{ROLE_LABELS[role]}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            — {ROLE_DESCRIPTIONS[role]}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Descrição do role selecionado */}
          <div className="p-3 bg-muted rounded-lg text-sm">
            <div className="flex items-center gap-2 font-medium mb-1">
              {ROLE_ICONS[selectedRole]}
              {ROLE_LABELS[selectedRole]}
            </div>
            <p className="text-muted-foreground">{ROLE_DESCRIPTIONS[selectedRole]}</p>
          </div>

          <Button
            onClick={handleGenerateLink}
            disabled={createInviteMutation.isPending}
            className="w-full"
          >
            <Link className="mr-2 h-4 w-4" />
            {createInviteMutation.isPending ? "Gerando..." : "Gerar Link de Convite"}
          </Button>

          {/* Link gerado */}
          {generatedLink && (
            <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950 space-y-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-medium">
                <Link className="h-4 w-4" />
                Link gerado com sucesso!
              </div>
              <div className="flex gap-2">
                <Input
                  value={generatedLink}
                  readOnly
                  className="font-mono text-xs bg-white dark:bg-gray-900"
                />
                <Button size="sm" variant="outline" onClick={handleCopyLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {linkExpiry && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Expira em {format(linkExpiry, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Compartilhe este link com a pessoa que você quer convidar. O link é válido por 7 dias.
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* Seção: Membros Atuais */}
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Membros com Acesso
          </h3>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando membros...</p>
          ) : (
            <>
              {/* Dono */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                    <Crown className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Você</p>
                    <p className="text-xs text-muted-foreground">Proprietário</p>
                  </div>
                </div>
                <Badge className={ROLE_COLORS["OWNER"]}>
                  Proprietário
                </Badge>
              </div>

              {/* Membros */}
              {sharingData?.members && sharingData.members.length > 0 ? (
                sharingData.members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                          {(member.userName || member.userEmail || "?")[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{member.userName || "Usuário"}</p>
                        <p className="text-xs text-muted-foreground">{member.userEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={member.role}
                        onValueChange={(v) =>
                          updateRoleMutation.mutate({
                            entityId: entity.id,
                            userId: member.userId,
                            role: v as Role,
                          })
                        }
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["VIEWER", "EDITOR", "ADMIN"] as Role[]).map((role) => (
                            <SelectItem key={role} value={role} className="text-xs">
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() =>
                          removeMemberMutation.mutate({
                            entityId: entity.id,
                            userId: member.userId,
                          })
                        }
                        disabled={removeMemberMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Nenhum membro compartilhado ainda.
                </p>
              )}
            </>
          )}
        </div>

        {/* Seção: Convites Pendentes */}
        {sharingData?.invites && sharingData.invites.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Convites Pendentes
              </h3>
              {sharingData.invites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between p-3 border rounded-lg border-dashed">
                  <div>
                    <p className="text-sm font-medium">
                      {invite.email || "Link sem e-mail específico"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[invite.role]} · Expira em{" "}
                      {format(new Date(invite.expiresAt), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {ROLE_LABELS[invite.role]}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() =>
                        revokeInviteMutation.mutate({
                          inviteId: invite.id,
                          entityId: entity.id,
                        })
                      }
                      disabled={revokeInviteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
