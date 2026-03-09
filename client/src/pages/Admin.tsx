import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color ?? "bg-blue-50 dark:bg-blue-950/30"}`}>
            <Icon className={`h-5 w-5 ${color ? "" : "text-blue-600 dark:text-blue-400"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Users Tab ───────────────────────────────────────────────────────────────

function UsersTab() {
  const [search, setSearch] = useState("");
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
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
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
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuário</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Organização</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cadastro</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Último acesso</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-muted-foreground">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    {/* Usuário */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300 font-semibold text-xs flex-shrink-0">
                          {(u.name ?? u.email ?? "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium leading-tight">{u.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{u.email ?? "—"}</p>
                        </div>
                      </div>
                    </td>

                    {/* Organização */}
                    <td className="px-4 py-3">
                      {u.organizationName ? (
                        <div>
                          <p className="font-medium leading-tight">{u.organizationName}</p>
                          {u.organizationPlan && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PLAN_COLORS[u.organizationPlan] ?? PLAN_COLORS.free}`}>
                              {PLAN_LABELS[u.organizationPlan] ?? u.organizationPlan}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Sem organização</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {u.emailVerified ? (
                          <Badge variant="outline" className="gap-1 text-green-700 border-green-200 bg-green-50 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 w-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            Verificado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 w-fit">
                            <Clock className="h-3 w-3" />
                            Pendente
                          </Badge>
                        )}
                        {u.role === "admin" && (
                          <Badge variant="outline" className="gap-1 text-purple-700 border-purple-200 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800 w-fit">
                            <Crown className="h-3 w-3" />
                            Admin
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Cadastro */}
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDate(u.createdAt)}
                    </td>

                    {/* Último acesso */}
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDateTime(u.lastSignedIn)}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {!u.emailVerified && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => forceVerifyMutation.mutate({ userId: u.id })}
                            disabled={forceVerifyMutation.isPending}
                            title="Forçar verificação de e-mail"
                          >
                            <MailCheck className="h-3 w-3" />
                            Verificar
                          </Button>
                        )}
                        <Select
                          value={u.role}
                          onValueChange={(role) =>
                            setRoleMutation.mutate({ userId: u.id, role: role as "user" | "admin" })
                          }
                        >
                          <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Usuário</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
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
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
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

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Organização</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Membros</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Criada em</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Plano</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground">
                    Nenhuma organização encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                    {/* Organização */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex-shrink-0">
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
                      <p className="font-medium leading-tight">{o.ownerName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{o.ownerEmail ?? "—"}</p>
                    </td>

                    {/* Membros */}
                    <td className="px-4 py-3">
                      <span className="text-muted-foreground">{o.memberCount}</span>
                    </td>

                    {/* Criada em */}
                    <td className="px-4 py-3 text-muted-foreground text-xs">
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

  // Verificar se o usuário é admin
  if (loading) {
    return (
      <div className="container py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
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
          Esta área é exclusiva para administradores do sistema. Você não tem permissão para acessar esta página.
        </p>
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          Voltar ao início
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-3xl font-bold tracking-tight">Painel Admin</h1>
          </div>
          <p className="text-muted-foreground">
            Gerencie usuários, organizações e planos do sistema
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-auto"
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
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard
              icon={Users}
              label="Total de usuários"
              value={stats?.totalUsers ?? 0}
              color="bg-blue-50 dark:bg-blue-950/30"
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
              color="bg-green-50 dark:bg-green-950/30"
            />
            <StatCard
              icon={TrendingUp}
              label="Novos esta semana"
              value={stats?.newUsersThisWeek ?? 0}
              color="bg-indigo-50 dark:bg-indigo-950/30"
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
              color="bg-purple-50 dark:bg-purple-950/30"
            />
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="organizations" className="gap-2">
            <Building2 className="h-4 w-4" />
            Organizações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <UsersTab />
        </TabsContent>

        <TabsContent value="organizations" className="mt-6">
          <OrganizationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
