import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Plus, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: entities, isLoading } = trpc.entities.list.useQuery();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!entities || entities.length === 0) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Minhas Entidades</h1>
            <p className="text-muted-foreground">Gerencie suas finanças por entidade</p>
          </div>
        </div>
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Nenhuma entidade cadastrada</CardTitle>
            <CardDescription>
              Comece criando sua primeira entidade para organizar suas finanças
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => setLocation("/entities")}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Primeira Entidade
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Minhas Entidades</h1>
          <p className="text-muted-foreground">
            {entities.length} {entities.length === 1 ? "entidade cadastrada" : "entidades cadastradas"}
          </p>
        </div>
        <Button onClick={() => setLocation("/entities")}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Entidade
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {entities.map((entity) => (
          <EntityCard key={entity.id} entity={entity} />
        ))}
      </div>
    </div>
  );
}

function EntityCard({ entity }: { entity: any }) {
  const [, setLocation] = useLocation();
  const { data: metrics } = trpc.dashboard.metrics.useQuery({ entityId: entity.id });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const balance = metrics ? metrics.currentBalance : 0;
  const isPositive = balance >= 0;

  return (
    <Card
      className="cursor-pointer card-hover border-2 border-slate-200 dark:border-slate-700 hover:border-primary/60 hover:shadow-lg transition-all duration-200 shadow-sm"
      onClick={() => setLocation(`/dashboard/${entity.id}`)}
    >
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shadow-md"
            style={{ backgroundColor: entity.color || "#2563EB" }}
          >
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg font-bold">{entity.name}</CardTitle>
            {entity.description && (
              <CardDescription className="line-clamp-1 text-xs">{entity.description}</CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!metrics ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Saldo */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">Saldo</span>
              </div>
              <span className={`text-lg font-bold ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(balance)}
              </span>
            </div>

            {/* Receitas e Despesas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 font-semibold mb-1">
                  <TrendingUp className="h-3 w-3" />
                  <span>Receitas</span>
                </div>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(metrics.monthIncome)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-1 text-xs text-red-700 dark:text-red-300 font-semibold mb-1">
                  <TrendingDown className="h-3 w-3" />
                  <span>Despesas</span>
                </div>
                <p className="text-base font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(metrics.monthExpenses)}
                </p>
              </div>
            </div>

            {metrics.pendingExpenses > 0 && (
              <div className="p-3 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Despesas pendentes</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {formatCurrency(metrics.pendingExpenses)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
