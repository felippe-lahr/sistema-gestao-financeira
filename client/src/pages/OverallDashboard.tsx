"use client";

import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, AlertCircle, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { useLocation } from "wouter";
import { format, startOfMonth, endOfMonth, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function OverallDashboard() {
  const [, setLocation] = useLocation();
  const [selectedEntities, setSelectedEntities] = useState<number[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<"month" | "year" | "custom">("month");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const { data: entities = [] } = trpc.entities.list.useQuery();
  const utils = trpc.useUtils();

  // Inicializar com todas as entidades selecionadas
  useEffect(() => {
    if (entities.length > 0 && selectedEntities.length === 0) {
      setSelectedEntities(entities.map(e => e.id));
    }
  }, [entities]);

  // Calcular datas do período
  const getDateRange = () => {
    if (filterPeriod === "month") {
      const start = startOfMonth(new Date(filterYear, filterMonth - 1));
      const end = endOfMonth(new Date(filterYear, filterMonth - 1));
      return { start, end };
    } else if (filterPeriod === "year") {
      const start = new Date(filterYear, 0, 1);
      const end = new Date(filterYear, 11, 31);
      return { start, end };
    } else {
      return {
        start: new Date(filterStartDate),
        end: new Date(filterEndDate)
      };
    }
  };

  const dateRange = getDateRange();

  // Buscar transações de todas as entidades selecionadas
  const { data: allTransactions = [] } = trpc.transactions.listByEntity.useQuery(
    { entityId: selectedEntities[0] || 0 },
    { enabled: selectedEntities.length > 0 }
  );

  // Calcular métricas
  const calculateMetrics = () => {
    let totalIncome = 0;
    let totalExpense = 0;
    let accountsPayable = 0;

    // Aqui você precisará implementar uma query que retorne transações de múltiplas entidades
    // Por enquanto, vamos usar um placeholder

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      accountsPayable
    };
  };

  const metrics = calculateMetrics();

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="mb-4"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Overall</h1>
        <p className="text-gray-600 mt-2">Consolidado de todas as entidades</p>
      </div>

      {/* Filtros */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Seleção de Entidades */}
          <div>
            <Label className="font-semibold mb-3 block">Entidades</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {entities.map((entity) => (
                <div key={entity.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`entity-${entity.id}`}
                    checked={selectedEntities.includes(entity.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedEntities([...selectedEntities, entity.id]);
                      } else {
                        setSelectedEntities(selectedEntities.filter(id => id !== entity.id));
                      }
                    }}
                  />
                  <label
                    htmlFor={`entity-${entity.id}`}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {entity.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Período */}
          <div>
            <Label className="font-semibold mb-3 block">Período</Label>
            <Select value={filterPeriod} onValueChange={(value: any) => setFilterPeriod(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mês</SelectItem>
                <SelectItem value="year">Ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mês/Ano */}
          {filterPeriod === "month" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Mês</Label>
                <Select value={filterMonth.toString()} onValueChange={(v) => setFilterMonth(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        {format(new Date(2024, i), "MMMM", { locale: ptBR })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ano</Label>
                <Input
                  type="number"
                  value={filterYear}
                  onChange={(e) => setFilterYear(parseInt(e.target.value))}
                />
              </div>
            </div>
          )}

          {filterPeriod === "year" && (
            <div>
              <Label>Ano</Label>
              <Input
                type="number"
                value={filterYear}
                onChange={(e) => setFilterYear(parseInt(e.target.value))}
              />
            </div>
          )}

          {filterPeriod === "custom" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data Início</Label>
                <Input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Data Fim</Label>
                <Input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total de Receita</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-green-600">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(metrics.totalIncome / 100)}
              </div>
              <TrendingUp className="h-8 w-8 text-green-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total de Despesa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-red-600">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(metrics.totalExpense / 100)}
              </div>
              <TrendingDown className="h-8 w-8 text-red-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Saldo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className={`text-2xl font-bold ${metrics.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(metrics.balance / 100)}
              </div>
              <Wallet className="h-8 w-8 text-blue-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Contas a Pagar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-orange-600">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(metrics.accountsPayable / 100)}
              </div>
              <AlertCircle className="h-8 w-8 text-orange-600 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contas a Vencer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Contas a Vencer (Próximos 7 dias)</CardTitle>
            <CardDescription>Transações pendentes nos próximos 7 dias</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Placeholder para contas a vencer */}
              <p className="text-sm text-gray-500">Nenhuma conta a vencer nos próximos 7 dias</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contas Vencidas</CardTitle>
            <CardDescription>Transações com vencimento passado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Placeholder para contas vencidas */}
              <p className="text-sm text-gray-500">Nenhuma conta vencida</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
