import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Clock, Calendar, Filter, FileSpreadsheet, FileText, Download, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Pie, PieChart, Cell, Legend, BarChart, Bar } from "recharts";
import { useState } from "react";

export default function EntityDashboard() {
  const [, params] = useRoute("/dashboard/:id");
  const [, setLocation] = useLocation();
  const entityId = params?.id ? parseInt(params.id) : null;
  
  // Filtros
  const [filterPeriod, setFilterPeriod] = useState<"month" | "quarter" | "year" | "custom" | "all">("month");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  
  // Calcular quantos filtros estao ativos
  const activeFiltersCount = [
    filterPeriod !== "month",
    filterCategoryId !== "",
    customStartDate !== "" || customEndDate !== ""
  ].filter(Boolean).length;
  
  // Estados de exportação
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  
  // Mutations de exportação
  const exportExcelMutation = trpc.dashboard.exportExcel.useMutation();
  const exportPDFMutation = trpc.dashboard.exportPDF.useMutation();
  
  // Queries
  const { data: entity, isLoading: entityLoading } = trpc.entities.getById.useQuery(
    { id: entityId || 0 },
    { enabled: !!entityId }
  );

  const { data: metrics, isLoading: metricsLoading } = trpc.dashboard.metrics.useQuery(
    {
      entityId: entityId || 0,
      period: filterPeriod,
      startDate: customStartDate,
      endDate: customEndDate,
    },
    { enabled: !!entityId }
  );

  const { data: cashFlow, isLoading: cashFlowLoading } = trpc.dashboard.cashFlow.useQuery(
    {
      entityId: entityId || 0,
      period: filterPeriod,
      startDate: customStartDate,
      endDate: customEndDate,
    },
    { enabled: !!entityId }
  );

  const { data: categoryDistribution, isLoading: categoryLoading } = trpc.dashboard.categoryDistribution.useQuery(
    {
      entityId: entityId || 0,
      period: filterPeriod,
      startDate: customStartDate,
      endDate: customEndDate,
    },
    { enabled: !!entityId }
  );

  const { data: recentTransactions, isLoading: transactionsLoading } = trpc.dashboard.recentTransactions.useQuery(
    { entityId: entityId || 0 },
    { enabled: !!entityId }
  );

  const handleExportExcel = async () => {
    if (!entityId) return;
    setExportingExcel(true);
    try {
      const result = await exportExcelMutation.mutateAsync({
        entityId,
        period: filterPeriod,
        startDate: customStartDate,
        endDate: customEndDate,
      });
      const link = document.createElement("a");
      link.href = result.url;
      link.download = result.filename;
      link.click();
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPDF = async () => {
    if (!entityId) return;
    setExportingPDF(true);
    try {
      const result = await exportPDFMutation.mutateAsync({
        entityId,
        period: filterPeriod,
        startDate: customStartDate,
        endDate: customEndDate,
      });
      const link = document.createElement("a");
      link.href = result.url;
      link.download = result.filename;
      link.click();
    } finally {
      setExportingPDF(false);
    }
  };

  const formatDate = (date: string | Date) => {
    return format(new Date(date), "dd/MM/yyyy");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (!entityId) return <div>Entidade não encontrada</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          className="w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{entity?.name}</h1>
          <p className="text-muted-foreground">{entity?.description}</p>
        </div>
        <Button
          onClick={() => setLocation(`/investments/${entityId}`)}
          variant="outline"
          className="w-full sm:w-auto"
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          Investimentos
        </Button>
      </div>

      {/* Filtros */}
      {/* Mobile: Drawer de Filtros */}
      <div className="flex gap-2 items-center flex-wrap md:hidden">
        <Drawer open={isFilterDrawerOpen} onOpenChange={setIsFilterDrawerOpen}>
          <Button
            variant="outline"
            onClick={() => setIsFilterDrawerOpen(true)}
            className="relative"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge className="ml-2 bg-blue-500 text-white">{activeFiltersCount}</Badge>
            )}
          </Button>

          <DrawerContent>
            <DrawerHeader>
              <div className="flex items-center justify-between">
                <DrawerTitle>Filtros</DrawerTitle>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon">
                    <X className="h-4 w-4" />
                  </Button>
                </DrawerClose>
              </div>
            </DrawerHeader>

            <div className="space-y-6 p-4 overflow-y-auto max-h-[60vh]">
              {/* Período */}
              <div className="space-y-2">
                <Label>Período</Label>
                <Select value={filterPeriod} onValueChange={(v: any) => setFilterPeriod(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Mês Atual</SelectItem>
                    <SelectItem value="quarter">Últimos 3 Meses</SelectItem>
                    <SelectItem value="year">Ano Atual</SelectItem>
                    <SelectItem value="custom">Período Personalizado</SelectItem>
                    <SelectItem value="all">Todos os Períodos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Datas Personalizadas */}
              {filterPeriod === "custom" && (
                <>
                  <div className="space-y-2">
                    <Label>Data Inicial</Label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Final</Label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    />
                  </div>
                </>
              )}
            </div>

            <DrawerFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setFilterPeriod("month");
                  setFilterCategoryId("");
                  setCustomStartDate("");
                  setCustomEndDate("");
                }}
              >
                Limpar Filtros
              </Button>
              <Button onClick={() => setIsFilterDrawerOpen(false)}>
                Aplicar
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={exportingExcel}
          >
            {exportingExcel ? (
              <Download className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            disabled={exportingPDF}
          >
            {exportingPDF ? (
              <Download className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            PDF
          </Button>
        </div>
      </div>

      {/* Desktop: Filtros em linha horizontal */}
      <div className="hidden md:flex gap-4 items-center flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Período:</span>
          <Select value={filterPeriod} onValueChange={(v: any) => setFilterPeriod(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Mês Atual</SelectItem>
              <SelectItem value="quarter">Últimos 3 Meses</SelectItem>
              <SelectItem value="year">Ano Atual</SelectItem>
              <SelectItem value="custom">Período Personalizado</SelectItem>
              <SelectItem value="all">Todos os Períodos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filterPeriod === "custom" && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm">De:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm">Até:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              />
            </div>
          </>
        )}

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={exportingExcel}
          >
            {exportingExcel ? (
              <Download className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            disabled={exportingPDF}
          >
            {exportingPDF ? (
              <Download className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            PDF
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      {metricsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : metrics ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saldo Atual</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.balance)}</div>
              <p className="text-xs text-muted-foreground">Todas as transações pagas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receitas do Mês</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(metrics.income)}</div>
              <p className="text-xs text-muted-foreground">Mês atual</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Despesas do Mês</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{formatCurrency(metrics.expense)}</div>
              <p className="text-xs text-muted-foreground">Mês atual</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Despesas a Vencer</CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{formatCurrency(metrics.pendingExpense)}</div>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Cash Flow Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Fluxo de Caixa</CardTitle>
            <CardDescription>Receitas e despesas do mês atual</CardDescription>
          </CardHeader>
          <CardContent>
            {cashFlowLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : cashFlow && cashFlow.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={cashFlow}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="income" stackId="1" stroke="#10b981" fill="#10b981" />
                  <Area type="monotone" dataKey="expense" stackId="1" stroke="#ef4444" fill="#ef4444" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Categoria</CardTitle>
            <CardDescription>Despesas do mês atual</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : categoryDistribution && categoryDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || "#8884d8"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Transações Recentes</CardTitle>
          <CardDescription>Últimas 10 transações</CardDescription>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : recentTransactions && recentTransactions.length > 0 ? (
            <div className="space-y-2">
              {recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex flex-col gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  {/* Linha 1: Descrição */}
                  <p className="font-medium text-sm sm:text-base">{transaction.description}</p>

                  {/* Linha 2: Data */}
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {transaction.dueDate && formatDate(transaction.dueDate)}
                    {transaction.status === "PAID" && transaction.paymentDate && (
                      <span className="ml-2">• Pago em {formatDate(transaction.paymentDate)}</span>
                    )}
                  </p>

                  {/* Linha 3: Categoria */}
                  {transaction.categoryName && (
                    <div>
                      <span
                        className="inline-block px-2 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: transaction.categoryColor || "#6B7280" }}
                      >
                        {transaction.categoryName}
                      </span>
                    </div>
                  )}

                  {/* Linha 4: Valor + Status */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <p
                      className={`text-base sm:text-lg font-bold ${
                        transaction.type === "INCOME" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {transaction.type === "INCOME" ? "+" : "-"}
                      {formatCurrency(Math.abs(transaction.amount))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {transaction.status === "PAID" && "Pago"}
                      {transaction.status === "PENDING" && "Pendente"}
                      {transaction.status === "OVERDUE" && "Vencido"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">Nenhuma transação encontrada</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
