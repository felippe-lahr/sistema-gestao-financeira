import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users,
  Building2,
  ShieldCheck,
  TrendingUp,
  CheckCircle2,
  Clock,
  Search,
  MailCheck,
  Crown,
  RefreshCw,
  AlertTriangle,
  MoreHorizontal,
  Trash2,
  UserX,
  UserCheck,
  Ban,
  ShieldAlert,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(d: Date | string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  pro: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  enterprise: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  active: {
    label: "Ativo",
    className: "text-green-700 border-green-200 bg-green-50 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800",
    icon: UserCheck,
  },
  suspended: {
    label: "Suspenso",
    className: "text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
    icon: UserX,
  },
  banned: {
    label: "Banido",
    className: "text-red-700 border-red-200 bg-red-50 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
    icon: Ban,
  },
};

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconClass,
  bgClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  iconClass?: string;
  bgClass?: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{label}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl flex-shrink-0 ${bgClass ?? "bg-blue-50 dark:bg-blue-950/30"}`}>
            <Icon className={`h-5 w-5 ${iconClass ?? "text-blue-600 dark:text-blue-400"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Delete Confirm Dialog ───────────────────────────────────────────────────

function DeleteUserDialog({
  user,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  user: { name: string | null; email: string | null } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" />
            Deletar usuário
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span>Você está prestes a deletar permanentemente o usuário:</span>
            <span className="block font-semibold text-foreground">
              {user?.name ?? "—"} ({user?.email ?? "—"})
            </span>
            <span className="block text-red-600 dark:text-red-400 font-medium">
              Esta ação é irreversível. Todos os dados do usuário serão removidos.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {isPending ? "Deletando..." : "Deletar permanentemente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Users Tab ───────────────────────────────────────────────────────────────

function UsersTab() {
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string | null; email: string | null } | null>(null);
  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.admin.listUsers.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const forceVerifyMutation = trpc.admin.forceVerifyUser.useMutation({
    onSuccess: () => {
      toast.success("E-mail verificado com sucesso.");
      utils.admin.listUsers.invalidate();
      utils.admin.getStats.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const setRoleMutation = trpc.admin.setUserRole.useMutation({
    onSuccess: () => {
      toast.success("Permissão atualizada.");
      utils.admin.listUsers.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const setStatusMutation = trpc.admin.setUserStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado.");
      utils.admin.listUsers.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deleteUserMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário deletado com sucesso.");
      setDeleteTarget(null);
      utils.admin.listUsers.invalidate();
      utils.admin.getStats.invalidate();
    },
    onError: (e) => {
      toast.error("Erro ao deletar: " + e.message);
    },
  });

  const filtered = (users ?? []).filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.organizationName?.toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, e-mail ou organização..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "usuário" : "usuários"} encontrado{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Usuário</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Organização</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">E-mail</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Conta</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Cadastro</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Último acesso</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="h-8 w-8 opacity-30" />
                      <span>Nenhum usuário encontrado.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const statusCfg = STATUS_CONFIG[(u as any).status ?? "active"] ?? STATUS_CONFIG.active;
                  const StatusIcon = statusCfg.icon;
                  return (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                      {/* Usuário */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 shadow-sm">
                            {(u.name ?? u.email ?? "?")[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium leading-tight">{u.name ?? "—"}</p>
                              {u.role === "admin" && (
                                <Crown className="h-3 w-3 text-purple-500 flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{u.email ?? "—"}</p>
                          </div>
                        </div>
                      </td>

                      {/* Organização */}
                      <td className="px-4 py-3">
                        {u.organizationName ? (
                          <div>
                            <p className="font-medium leading-tight text-sm">{u.organizationName}</p>
                            {u.organizationPlan && (
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PLAN_COLORS[u.organizationPlan] ?? PLAN_COLORS.free}`}>
                                {PLAN_LABELS[u.organizationPlan] ?? u.organizationPlan}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* E-mail verificado */}
                      <td className="px-4 py-3">
                        {u.emailVerified ? (
                          <Badge variant="outline" className="gap-1 text-green-700 border-green-200 bg-green-50 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 text-xs">
                            <CheckCircle2 className="h-3 w-3" />
                            Verificado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 text-xs">
                            <Clock className="h-3 w-3" />
                            Pendente
                          </Badge>
                        )}
                      </td>

                      {/* Status da conta */}
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`gap-1 text-xs ${statusCfg.className}`}>
                                <StatusIcon className="h-3 w-3" aria-hidden />
                          {statusCfg.label}
                        </Badge>
                      </td>

                      {/* Cadastro */}
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(u.createdAt)}
                      </td>

                      {/* Último acesso */}
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDateTime(u.lastSignedIn)}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                                {u.name ?? u.email}
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />

                              {/* Verificar e-mail */}
                              {!u.emailVerified && (
                                <DropdownMenuItem
                                  onClick={() => forceVerifyMutation.mutate({ userId: u.id })}
                                  disabled={forceVerifyMutation.isPending}
                                >
                                  <MailCheck className="h-4 w-4 mr-2 text-green-600" />
                                  Verificar e-mail
                                </DropdownMenuItem>
                              )}

                              {/* Alterar role */}
                              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal pt-2">Permissão</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => setRoleMutation.mutate({ userId: u.id, role: "user" })}
                                disabled={u.role === "user" || setRoleMutation.isPending}
                              >
                                <Users className="h-4 w-4 mr-2" />
                                Definir como Usuário
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setRoleMutation.mutate({ userId: u.id, role: "admin" })}
                                disabled={u.role === "admin" || setRoleMutation.isPending}
                              >
                                <ShieldAlert className="h-4 w-4 mr-2 text-purple-600" />
                                Definir como Admin
                              </DropdownMenuItem>

                              {/* Alterar status */}
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Status da conta</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => setStatusMutation.mutate({ userId: u.id, status: "active" })}
                                disabled={(u as any).status === "active" || setStatusMutation.isPending}
                              >
                                <UserCheck className="h-4 w-4 mr-2 text-green-600" />
                                Ativar conta
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setStatusMutation.mutate({ userId: u.id, status: "suspended" })}
                                disabled={(u as any).status === "suspended" || setStatusMutation.isPending}
                              >
                                <UserX className="h-4 w-4 mr-2 text-amber-600" />
                                Suspender conta
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setStatusMutation.mutate({ userId: u.id, status: "banned" })}
                                disabled={(u as any).status === "banned" || setStatusMutation.isPending}
                              >
                                <Ban className="h-4 w-4 mr-2 text-red-600" />
                                Banir conta
                              </DropdownMenuItem>

                              {/* Deletar */}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30"
                                onClick={() => setDeleteTarget({ id: u.id, name: u.name, email: u.email })}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Deletar usuário
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteUserDialog
        user={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteUserMutation.mutate({ userId: deleteTarget.id })}
        isPending={deleteUserMutation.isPending}
      />
    </div>
  );
}

// ─── Organizations Tab ────────────────────────────────────────────────────────

function OrganizationsTab() {
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const { data: orgs, isLoading } = trpc.admin.listOrganizations.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const setPlanMutation = trpc.admin.setOrganizationPlan.useMutation({
    onSuccess: () => {
      toast.success("Plano atualizado com sucesso.");
      utils.admin.listOrganizations.invalidate();
      utils.admin.getStats.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const filtered = (orgs ?? []).filter((o) => {
    const q = search.toLowerCase();
    return (
      !q ||
      o.name.toLowerCase().includes(q) ||
      o.ownerEmail?.toLowerCase().includes(q) ||
      o.ownerName?.toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou e-mail do owner..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "organização" : "organizações"} encontrada{filtered.length !== 1 ? "s" : ""}
      </p>

      <div className="rounded-xl border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Organização</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Owner</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Membros</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Criada em</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Plano</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Building2 className="h-8 w-8 opacity-30" />
                      <span>Nenhuma organização encontrada.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    {/* Organização */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 shadow-sm">
                          {o.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium leading-tight">{o.name}</p>
                          {o.slug && (
                            <p className="text-xs text-muted-foreground font-mono">{o.slug}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Owner */}
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight text-sm">{o.ownerName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{o.ownerEmail ?? "—"}</p>
                    </td>

                    {/* Membros */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium">{o.memberCount}</span>
                      <span className="text-muted-foreground text-xs ml-1">membro{o.memberCount !== 1 ? "s" : ""}</span>
                    </td>

                    {/* Criada em */}
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {formatDate(o.createdAt)}
                    </td>

                    {/* Plano */}
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Select
                          value={o.plan}
                          onValueChange={(plan) =>
                            setPlanMutation.mutate({
                              orgId: o.id,
                              plan: plan as "free" | "pro" | "enterprise",
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Admin() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();

  const { data: stats, isLoading: statsLoading } = trpc.admin.getStats.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  if (loading) {
    return (
      <div className="container py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="container py-16 flex flex-col items-center justify-center gap-4">
        <div className="p-4 rounded-full bg-red-50 dark:bg-red-950/30">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold">Acesso restrito</h1>
        <p className="text-muted-foreground text-center max-w-sm">
          Esta área é exclusiva para administradores do sistema.
        </p>
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          Voltar ao início
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-1.5 rounded-lg bg-blue-600 dark:bg-blue-500">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Painel Admin</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Gerencie usuários, organizações e planos do sistema
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start"
          onClick={() => {
            utils.admin.getStats.invalidate();
            utils.admin.listUsers.invalidate();
            utils.admin.listOrganizations.invalidate();
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <StatCard
              icon={Users}
              label="Total de usuários"
              value={stats?.totalUsers ?? 0}
              bgClass="bg-blue-50 dark:bg-blue-950/30"
              iconClass="text-blue-600 dark:text-blue-400"
            />
            <StatCard
              icon={CheckCircle2}
              label="E-mails verificados"
              value={stats?.verifiedUsers ?? 0}
              sub={
                stats && stats.totalUsers > 0
                  ? `${Math.round((stats.verifiedUsers / stats.totalUsers) * 100)}% do total`
                  : undefined
              }
              bgClass="bg-green-50 dark:bg-green-950/30"
              iconClass="text-green-600 dark:text-green-400"
            />
            <StatCard
              icon={TrendingUp}
              label="Novos esta semana"
              value={stats?.newUsersThisWeek ?? 0}
              bgClass="bg-indigo-50 dark:bg-indigo-950/30"
              iconClass="text-indigo-600 dark:text-indigo-400"
            />
            <StatCard
              icon={Building2}
              label="Organizações"
              value={stats?.totalOrganizations ?? 0}
              sub={
                stats
                  ? `${stats.planCounts.pro} Pro · ${stats.planCounts.enterprise} Enterprise`
                  : undefined
              }
              bgClass="bg-purple-50 dark:bg-purple-950/30"
              iconClass="text-purple-600 dark:text-purple-400"
            />
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users">
        <TabsList className="mb-2">
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="organizations" className="gap-2">
            <Building2 className="h-4 w-4" />
            Organizações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>

        <TabsContent value="organizations" className="mt-4">
          <OrganizationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
