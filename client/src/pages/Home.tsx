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
    }).format(value / 100);
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
    }).format(value / 100);
  };

  const balance = metrics ? metrics.currentBalance : 0;
  const isPositive = balance >= 0;

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={() => setLocation(`/dashboard/${entity.id}`)}
    >
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: entity.color || "#2563EB" }}
          >
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-xl">{entity.name}</CardTitle>
            {entity.description && (
              <CardDescription className="line-clamp-1">{entity.description}</CardDescription>
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
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Saldo</span>
              </div>
              <span className={`text-lg font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(balance)}
              </span>
            </div>

            {/* Receitas e Despesas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span>Receitas</span>
                </div>
                <p className="text-sm font-semibold text-green-600">
                  {formatCurrency(metrics.monthIncome)}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingDown className="h-3 w-3" />
                  <span>Despesas</span>
                </div>
                <p className="text-sm font-semibold text-red-600">
                  {formatCurrency(metrics.monthExpenses)}
                </p>
              </div>
            </div>

            {/* Despesas Pendentes */}
            {metrics.pendingExpenses > 0 && (
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Despesas pendentes</span>
                  <span className="font-medium text-orange-600">
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
