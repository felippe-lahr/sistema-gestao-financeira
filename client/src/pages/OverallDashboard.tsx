"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, AlertCircle, TrendingUp, TrendingDown, Wallet, Filter, ChevronDown, Calendar } from "lucide-react";
import { useLocation } from "wouter";
import { format, startOfMonth, endOfMonth, addDays, isBefore, isAfter, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { trpc } from "@/lib/trpc";

export default function OverallDashboard() {
  const [, setLocation] = useLocation();
  const [selectedEntities, setSelectedEntities] = useState<number[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<"month" | "year" | "custom">("month");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const { data: entities = [] } = trpc.entities.list.useQuery();

  // Inicializar com todas as entidades selecionadas
  useEffect(() => {
    if (entities.length > 0 && selectedEntities.length === 0) {
      setSelectedEntities(entities.map(e => e.id));
    }
  }, [entities]);

  // Calcular datas do período
  const dateRange = useMemo(() => {
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
        start: filterStartDate ? new Date(filterStartDate) : new Date(),
        end: filterEndDate ? new Date(filterEndDate) : new Date()
      };
    }
  }, [filterPeriod, filterYear, filterMonth, filterStartDate, filterEndDate]);

  // Buscar transações de todas as entidades selecionadas usando useQueries
  const transactionQueries = trpc.useQueries((t) =>
    selectedEntities.map((entityId) =>
      t.transactions.listByEntity({ entityId })
    )
  );

  // Combinar todas as transações
  const allTransactions = useMemo(() => {
    const transactions: any[] = [];
    transactionQueries.forEach((query, index) => {
      if (query.data) {
        const entityId = selectedEntities[index];
        const entity = entities.find(e => e.id === entityId);
        query.data.forEach((t: any) => {
          transactions.push({
            ...t,
            entityName: entity?.name || 'Desconhecido',
            entityColor: entity?.color || '#6B7280'
          });
        });
      }
    });
    return transactions;
  }, [transactionQueries, selectedEntities, entities]);

  // Filtrar transações pelo período
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(t => {
      const dueDate = new Date(t.dueDate);
      return dueDate >= dateRange.start && dueDate <= dateRange.end;
    });
  }, [allTransactions, dateRange]);

  // Calcular métricas
  const metrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let accountsPayable = 0;

    filteredTransactions.forEach(t => {
      if (t.type === 'INCOME') {
        totalIncome += t.amount || 0;
      } else {
        totalExpense += t.amount || 0;
      }
      
      if (t.type === 'EXPENSE' && t.status === 'PENDING') {
        accountsPayable += t.amount || 0;
      }
    });

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      accountsPayable
    };
  }, [filteredTransactions]);

  // Contas a vencer nos próximos 7 dias
  const upcomingBills = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = addDays(today, 7);
    
    return allTransactions
      .filter(t => {
        const dueDate = new Date(t.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return t.status === 'PENDING' && 
               t.type === 'EXPENSE' &&
               dueDate >= today && 
               dueDate <= sevenDaysFromNow;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [allTransactions]);

  // Contas vencidas
  const overdueBills = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return allTransactions
      .filter(t => {
        const dueDate = new Date(t.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return (t.status === 'PENDING' || t.status === 'OVERDUE') && 
               t.type === 'EXPENSE' &&
               dueDate < today;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [allTransactions]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
  };

  const selectedEntitiesCount = selectedEntities.length;
  const totalEntitiesCount = entities.length;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="mb-2"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Overall</h1>
        <p className="text-gray-600">Consolidado de todas as entidades</p>
      </div>

      {/* Filtros Compactos */}
      <div className="flex flex-wrap gap-3 mb-6 items-center bg-white p-4 rounded-lg border shadow-sm">
        {/* Seleção de Entidades - Dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-[180px] justify-between">
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                {selectedEntitiesCount === totalEntitiesCount 
                  ? "Todas entidades" 
                  : `${selectedEntitiesCount} entidade${selectedEntitiesCount > 1 ? 's' : ''}`}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-2 border-b">
                <span className="text-sm font-medium">Entidades</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs"
                  onClick={() => {
                    if (selectedEntities.length === entities.length) {
                      setSelectedEntities([]);
                    } else {
                      setSelectedEntities(entities.map(e => e.id));
                    }
                  }}
                >
                  {selectedEntities.length === entities.length ? "Desmarcar" : "Selecionar"} todas
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {entities.map((entity) => (
                  <div key={entity.id} className="flex items-center space-x-2 py-1">
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
                      className="text-sm cursor-pointer flex-1"
                    >
                      {entity.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Período */}
        <Select value={filterPeriod} onValueChange={(value: any) => setFilterPeriod(value)}>
          <SelectTrigger className="w-[130px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mês</SelectItem>
            <SelectItem value="year">Ano</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>

        {/* Mês/Ano */}
        {filterPeriod === "month" && (
          <>
            <Select value={filterMonth.toString()} onValueChange={(v) => setFilterMonth(parseInt(v))}>
              <SelectTrigger className="w-[120px]">
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
            <Input
              type="number"
              value={filterYear}
              onChange={(e) => setFilterYear(parseInt(e.target.value))}
              className="w-[90px]"
            />
          </>
        )}

        {filterPeriod === "year" && (
          <Input
            type="number"
            value={filterYear}
            onChange={(e) => setFilterYear(parseInt(e.target.value))}
            className="w-[90px]"
          />
        )}

        {filterPeriod === "custom" && (
          <>
            <Input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-[150px]"
            />
            <span className="text-gray-500">até</span>
            <Input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-[150px]"
            />
          </>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total de Receita</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(metrics.totalIncome)}
              </div>
              <TrendingUp className="h-8 w-8 text-green-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total de Despesa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(metrics.totalExpense)}
              </div>
              <TrendingDown className="h-8 w-8 text-red-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Saldo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className={`text-2xl font-bold ${metrics.balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(metrics.balance)}
              </div>
              <Wallet className="h-8 w-8 text-blue-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Contas a Pagar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(metrics.accountsPayable)}
              </div>
              <AlertCircle className="h-8 w-8 text-orange-600 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contas a Vencer e Vencidas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Contas a Vencer (Próximos 7 dias)</CardTitle>
            <CardDescription>Transações pendentes nos próximos 7 dias</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {upcomingBills.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">Nenhuma conta a vencer nos próximos 7 dias</p>
              ) : (
                upcomingBills.map((bill) => (
                  <div key={bill.id} className="p-3 bg-gray-50 rounded-lg border">
                    <div className="mb-2">
                      <span className="font-medium text-sm">{bill.description}</span>
                    </div>
                    <div className="mb-2">
                      <Badge 
                        variant="outline" 
                        className="text-xs"
                        style={{ borderColor: bill.entityColor, color: bill.entityColor }}
                      >
                        {bill.entityName}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500">
                        Vence em {format(new Date(bill.dueDate), "dd/MM/yyyy")}
                      </div>
                      <div className="font-semibold text-orange-600">
                        {formatCurrency(bill.amount)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Contas Vencidas</CardTitle>
            <CardDescription>Transações com vencimento passado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {overdueBills.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">Nenhuma conta vencida</p>
              ) : (
                overdueBills.map((bill) => (
                  <div key={bill.id} className="p-3 bg-red-50 rounded-lg border border-red-100">
                    <div className="mb-2">
                      <span className="font-medium text-sm">{bill.description}</span>
                    </div>
                    <div className="mb-2">
                      <Badge 
                        variant="outline" 
                        className="text-xs"
                        style={{ borderColor: bill.entityColor, color: bill.entityColor }}
                      >
                        {bill.entityName}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-red-600">
                        Venceu em {format(new Date(bill.dueDate), "dd/MM/yyyy")}
                      </div>
                      <div className="font-semibold text-red-600">
                        {formatCurrency(bill.amount)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
