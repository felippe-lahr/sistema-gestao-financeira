import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Clock, Calendar, Filter, FileSpreadsheet, FileText, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Pie, PieChart, Cell, Legend, BarChart, Bar } from "recharts";

export default function EntityDashboard() {
  const [, params] = useRoute("/dashboard/:id");
  const [, setLocation] = useLocation();
  const entityId = params?.id ? parseInt(params.id) : null;
  
  // Filtros
  const [filterPeriod, setFilterPeriod] = useState<"month" | "quarter" | "year" | "custom" | "all">("month");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  
  // Estados de exportação
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  
  // Mutations de exportação
  const exportExcelMutation = trpc.exports.exportTransactionsExcel.useMutation();
  const exportPDFMutation = trpc.exports.exportTransactionsPDF.useMutation();

  // Query para transações a vencer
  const { data: upcomingTransactions, isLoading: upcomingLoading } = trpc.dashboard.upcomingTransactions.useQuery(
    { entityId: entityId!, daysAhead: 7 },
    { enabled: !!entityId }
  );

  // Calcular datas baseado no filtro
  const getFilterDates = () => {
    const now = new Date();
    switch (filterPeriod) {
      case "month":
        return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
      case "quarter":
        return { startDate: startOfMonth(subMonths(now, 2)), endDate: endOfMonth(now) };
      case "year":
        return { startDate: startOfYear(now), endDate: endOfYear(now) };
      case "custom":
        if (customStartDate && customEndDate) {
          return { 
            startDate: new Date(customStartDate + "T00:00:00"), 
            endDate: new Date(customEndDate + "T23:59:59") 
          };
        }
        return { startDate: undefined, endDate: undefined };
      case "all":
      default:
        return { startDate: undefined, endDate: undefined };
    }
  };

  const { startDate, endDate } = getFilterDates();

  const { data: entities } = trpc.entities.list.useQuery();
  const { data: metrics, isLoading: metricsLoading } = trpc.dashboard.metrics.useQuery(
    { entityId: entityId! },
    { enabled: !!entityId }
  );
  
  const { data: cashFlowData, isLoading: cashFlowLoading } = trpc.dashboard.cashFlow.useQuery(
    { entityId: entityId!, months: 6, startDate, endDate },
    { enabled: !!entityId }
  );
  
  const { data: categoryData, isLoading: categoryLoading } = trpc.dashboard.categoryDistribution.useQuery(
    { entityId: entityId!, startDate, endDate },
    { enabled: !!entityId }
  );
  
  const { data: recentTransactions, isLoading: transactionsLoading } = trpc.dashboard.recentTransactions.useQuery(
    { entityId: entityId!, limit: 10, startDate, endDate },
    { enabled: !!entityId }
  );
  
  const { data: categoryExpenses, isLoading: categoryExpensesLoading } = trpc.dashboard.categoryExpensesByStatus.useQuery(
    { entityId: entityId!, startDate, endDate },
    { enabled: !!entityId }
  );

  const entity = entities?.find((e) => e.id === entityId);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getPeriodDescription = () => {
    switch (filterPeriod) {
      case "month":
        return "Receitas e despesas do mês atual";
      case "quarter":
        return "Receitas e despesas dos últimos 3 meses";
      case "year":
        return "Receitas e despesas do ano atual";
      case "custom":
        if (customStartDate && customEndDate) {
          return `Receitas e despesas de ${format(new Date(customStartDate), "dd/MM/yyyy")} a ${format(new Date(customEndDate), "dd/MM/yyyy")}`;
        }
        return "Receitas e despesas do período selecionado";
      case "all":
      default:
        return "Receitas e despesas de todos os períodos";
    }
  };

  // Funções de exportação
  const handleExportExcel = async () => {
    if (!entityId) return;
    
    setExportingExcel(true);
    try {
      const periodLabels = {
        month: "Mês Atual",
        quarter: "Últimos 3 Meses",
        year: "Ano Atual",
        custom: "Período Personalizado",
        all: "Todos os Períodos",
      };
      
      const formatDateForAPI = (date: Date | undefined) => {
        if (!date) return undefined;
        // Converter para GMT-3 (São Paulo)
        const offset = 3 * 60 * 60 * 1000; // GMT-3 em milissegundos
        const localDate = new Date(date.getTime() - offset);
        const year = localDate.getUTCFullYear();
        const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(localDate.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      const result = await exportExcelMutation.mutateAsync({
        entityId,
        startDate: formatDateForAPI(startDate),
        endDate: formatDateForAPI(endDate),
        period: periodLabels[filterPeriod],
      });
      
      // Download do arquivo
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      alert('Erro ao exportar relatório. Tente novamente.');
    } finally {
      setExportingExcel(false);
    }
  };
  
  const handleExportPDF = async () => {
    if (!entityId) return;
    
    setExportingPDF(true);
    try {
      const { startDate, endDate } = getFilterDates();
      const periodLabels = {
        month: "Mês Atual",
        quarter: "Últimos 3 Meses",
        year: "Ano Atual",
        custom: "Período Personalizado",
        all: "Todos os Períodos",
      };
      
      const formatDateForAPI = (date: Date | undefined) => {
        if (!date) return undefined;
        // Converter para GMT-3 (São Paulo)
        const offset = 3 * 60 * 60 * 1000; // GMT-3 em milissegundos
        const localDate = new Date(date.getTime() - offset);
        const year = localDate.getUTCFullYear();
        const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(localDate.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      const result = await exportPDFMutation.mutateAsync({
        entityId,
        startDate: formatDateForAPI(startDate),
        endDate: formatDateForAPI(endDate),
        period: periodLabels[filterPeriod],
      });
      
      // Download do arquivo
      const blob = new Blob([Uint8Array.from(atob(result.data), c => c.charCodeAt(0))], {
        type: 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      alert('Erro ao exportar relatório. Tente novamente.');
    } finally {
      setExportingPDF(false);
    }
  };

  if (!entityId || !entity) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Entidade não encontrada</p>
            <Button className="mt-4" onClick={() => setLocation("/")}>
              Voltar para Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: entity.color || "#2563EB" }}
            >
              <span className="text-white font-bold text-lg">{entity.name.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{entity.name}</h1>
              <p className="text-muted-foreground">Visão geral das finanças</p>
            </div>
          </div>
          <Button
            onClick={() => setLocation(`/investments/${entityId}`)}
            variant="outline"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Investimentos
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Período:</span>
            </div>
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
        </CardContent>
      </Card>

      {/* Metrics Cards */}
      {metricsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
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
              <div className="text-2xl font-bold">{formatCurrency(metrics.currentBalance)}</div>
              <p className="text-xs text-muted-foreground">Todas as transações pagas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Receitas do Mês</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(metrics.monthIncome)}</div>
              <p className="text-xs text-muted-foreground">Mês atual</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Despesas do Mês</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{formatCurrency(metrics.monthExpenses)}</div>
              <p className="text-xs text-muted-foreground">Mês atual</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Despesas a Vencer</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{formatCurrency(metrics.pendingExpenses)}</div>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 h-[600px]">
        {/* Fluxo de Caixa */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Fluxo de Caixa</CardTitle>
            <CardDescription>{getPeriodDescription()}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 w-full p-4">
            <div className="h-full w-full">
            {cashFlowLoading ? (
              <Skeleton className="h-full w-full" />
            ) : cashFlowData && cashFlowData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: "#000" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stackId="1"
                    stroke="#10B981"
                    fill="#10B981"
                    name="Receitas"
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stackId="2"
                    stroke="#EF4444"
                    fill="#EF4444"
                    name="Despesas"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            )}
            </div>
          </CardContent>
        </Card>

        {/* Distribuição por Categoria */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Distribuição por Categoria</CardTitle>
            <CardDescription>Despesas do mês atual</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 w-full p-4">
            <div className="h-full w-full">
            {categoryLoading ? (
              <Skeleton className="h-full w-full" />
            ) : categoryData && categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[...categoryData].sort((a, b) => b.value - a.value).map((item: any) => ({
                    ...item,
                    percentage: categoryData.length > 0 ? ((item.value / categoryData.reduce((sum: number, cat: any) => sum + cat.value, 0)) * 100).toFixed(1) : 0
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label: string) => `${label}`}
                    content={({ active, payload }) => {
                      if (active && payload && payload[0]) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-card border border-border rounded p-2 text-sm">
                            <p className="font-semibold">{data.name}</p>
                            <p className="text-primary">{formatCurrency(data.value)}</p>
                            <p className="text-muted-foreground font-medium">{data.percentage || '0'}% do total</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="value" fill="#8884d8" radius={[0, 8, 8, 0]}>
                    {categoryData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Despesas por Categoria e Status */}
      <Card>
        <CardHeader>
          <CardTitle>Despesas por Categoria</CardTitle>
          <CardDescription>Valores pagos, pendentes e vencidos por categoria</CardDescription>
        </CardHeader>
        <CardContent>
          {categoryExpensesLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : categoryExpenses && categoryExpenses.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Categoria</th>
                    <th className="text-right py-3 px-4 font-medium text-green-600">Pago</th>
                    <th className="text-right py-3 px-4 font-medium text-yellow-600">Pendente</th>
                    <th className="text-right py-3 px-4 font-medium text-red-600">Vencido</th>
                    <th className="text-right py-3 px-4 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryExpenses.map((cat, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.categoryColor }}
                          />
                          <span className="font-medium">{cat.categoryName}</span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 text-green-600 font-medium">
                        {formatCurrency(cat.paid)}
                      </td>
                      <td className="text-right py-3 px-4 text-yellow-600 font-medium">
                        {formatCurrency(cat.pending)}
                      </td>
                      <td className="text-right py-3 px-4 text-red-600 font-medium">
                        {formatCurrency(cat.overdue)}
                      </td>
                      <td className="text-right py-3 px-4 font-bold">
                        {formatCurrency(cat.total)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-bold">
                    <td className="py-3 px-4">Total Geral</td>
                    <td className="text-right py-3 px-4 text-green-600">
                      {formatCurrency(categoryExpenses.reduce((sum, cat) => sum + cat.paid, 0))}
                    </td>
                    <td className="text-right py-3 px-4 text-yellow-600">
                      {formatCurrency(categoryExpenses.reduce((sum, cat) => sum + cat.pending, 0))}
                    </td>
                    <td className="text-right py-3 px-4 text-red-600">
                      {formatCurrency(categoryExpenses.reduce((sum, cat) => sum + cat.overdue, 0))}
                    </td>
                    <td className="text-right py-3 px-4">
                      {formatCurrency(categoryExpenses.reduce((sum, cat) => sum + cat.total, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">Nenhuma despesa encontrada</div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Transactions */}
      {upcomingTransactions && upcomingTransactions.length > 0 && (
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Transações a Vencer
            </CardTitle>
            <CardDescription>Próximos 7 dias</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingTransactions.map((transaction) => {
                  const urgencyColor = 
                    transaction.daysUntilDue === 0 ? "bg-red-50 border-red-200 hover:bg-red-100" :
                    transaction.daysUntilDue <= 3 ? "bg-yellow-50 border-yellow-200 hover:bg-yellow-100" :
                    "bg-blue-50 border-blue-200 hover:bg-blue-100";
                  
                  const urgencyBadge = 
                    transaction.daysUntilDue === 0 ? "bg-red-500" :
                    transaction.daysUntilDue <= 3 ? "bg-yellow-500" :
                    "bg-blue-500";

                  return (
                    <div
                      key={transaction.id}
                      className={`flex items-center justify-between p-4 rounded-lg border transition-all ${urgencyColor}`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`w-2 h-2 rounded-full ${urgencyBadge}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{transaction.description}</p>
                            <span 
                              className="inline-block w-3 h-3 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: transaction.categoryColor }}
                              title={transaction.categoryName}
                            />
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-muted-foreground">
                              {transaction.categoryName}
                            </p>
                            <span className="text-xs text-muted-foreground">•</span>
                            <p className="text-xs text-muted-foreground">
                              {transaction.daysUntilDue === 0 ? "Vence hoje" :
                               transaction.daysUntilDue === 1 ? "Vence amanhã" :
                               `Vence em ${transaction.daysUntilDue} dias`}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="font-semibold text-red-600">
                          -R$ {transaction.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(transaction.dueDate!), "dd/MM/yyyy")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{transaction.description}</p>
                      {transaction.categoryName && (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: transaction.categoryColor || "#6B7280" }}
                        >
                          {transaction.categoryName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {transaction.dueDate && formatDate(transaction.dueDate)}
                      {transaction.status === "PAID" && transaction.paymentDate && (
                        <span className="ml-2">• Pago em {formatDate(transaction.paymentDate)}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-lg font-bold ${
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
