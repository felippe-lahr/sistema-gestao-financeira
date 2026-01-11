import { useState, useMemo } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText, BarChart3, TrendingUp, Users, Zap, ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export function Reports() {
  const { entityId } = useParams();
  const [, setLocation] = useLocation();
  const [reportType, setReportType] = useState("occupancy");
  const [periodType, setPeriodType] = useState("month");
  const [startDate, setStartDate] = useState(format(subMonths(new Date(), 12), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [exportFormat, setExportFormat] = useState("pdf");

  const { data: rentals, isLoading: rentalsLoading } = trpc.rentals.list.useQuery(
    { entityId: parseInt(entityId) },
    { enabled: !!entityId }
  );

  const { data: transactions, isLoading: transactionsLoading } = trpc.transactions.listByEntity.useQuery(
    { entityId: parseInt(entityId) },
    { enabled: !!entityId }
  );

  // Calcular dados de ocupação
  const calculateOccupancyData = () => {
    if (!rentals || rentals.length === 0) return [];

    const monthlyData: Record<string, { occupied: number; total: number }> = {};
    // Parse dates manually to avoid timezone issues
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const filterStart = new Date(startYear, startMonth - 1, startDay);
    const filterEnd = new Date(endYear, endMonth - 1, endDay);

    // Inicializar todos os meses que têm dias no intervalo
    let current = new Date(filterStart.getFullYear(), filterStart.getMonth(), 1);
    const endOfLastMonth = new Date(filterEnd.getFullYear(), filterEnd.getMonth() + 1, 0);
    
    while (current <= endOfLastMonth) {
      const monthKey = format(current, "yyyy-MM");
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      
      // Se o mês está dentro do período, adicionar
      if (monthStart <= filterEnd && monthEnd >= filterStart) {
        // Calcular quantos dias deste mês estão no intervalo do filtro
        const rangeStart = new Date(Math.max(monthStart.getTime(), filterStart.getTime()));
        const rangeEnd = new Date(Math.min(monthEnd.getTime(), filterEnd.getTime()));
        const daysInRange = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        monthlyData[monthKey] = { occupied: 0, total: daysInRange };
      }
      
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }

    // Contar dias ocupados por mês
    rentals.forEach((rental) => {
      const start = new Date(rental.startDate);
      const end = new Date(rental.endDate);

      let current = new Date(Math.max(start.getTime(), filterStart.getTime()));
      const endDateLimit = new Date(Math.min(end.getTime(), filterEnd.getTime()));

      while (current < endDateLimit) {
        const monthKey = format(current, "yyyy-MM");
        if (monthlyData[monthKey]) {
          monthlyData[monthKey].occupied++;
        }
        current.setDate(current.getDate() + 1);
      }
    });

    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => {
        const [year, monthNum] = month.split('-').map(Number);
        const monthDate = new Date(year, monthNum - 1, 1);
        return {
          month: format(monthDate, "MMM/yy", { locale: ptBR }),
          occupancy: data.total > 0 ? Math.round((data.occupied / data.total) * 100) : 0,
          occupied: data.occupied,
          total: data.total,
        };
      });
  };

  // Calcular dados financeiros
  const calculateFinancialData = () => {
    if (!rentals) return { total: 0, average: 0, bySource: {}, taxesTotal: 0 };

    let total = 0;
    let taxesTotal = 0;
    const bySource: Record<string, number> = {};

    rentals.forEach((rental) => {
      const amount = rental.totalAmount / 100;
      total += amount;

      if (!bySource[rental.source]) {
        bySource[rental.source] = 0;
      }
      bySource[rental.source] += amount;

      if (rental.extraFeeAmount) {
        taxesTotal += rental.extraFeeAmount / 100;
      }
    });

    return {
      total,
      average: rentals.length > 0 ? total / rentals.length : 0,
      bySource,
      taxesTotal,
      count: rentals.length,
    };
  };

  // Calcular dados de hóspedes
  const calculateGuestData = () => {
    if (!rentals) return { recurring: 0, avgGuests: 0, avgStay: 0 };

    const guestMap: Record<string, number> = {};
    let totalGuests = 0;
    let totalStays = 0;

    rentals.forEach((rental) => {
      if (rental.guestName) {
        guestMap[rental.guestName] = (guestMap[rental.guestName] || 0) + 1;
      }

      totalGuests += rental.numberOfGuests || 1;

      const start = new Date(rental.startDate);
      const end = new Date(rental.endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      totalStays += days;
    });

    const recurringGuests = Object.values(guestMap).filter((count) => count > 1).length;

    return {
      recurring: recurringGuests,
      avgGuests: rentals.length > 0 ? totalGuests / rentals.length : 0,
      avgStay: rentals.length > 0 ? totalStays / rentals.length : 0,
    };
  };

  // Calcular dados de performance por fonte
  const calculateSourcePerformance = () => {
    if (!rentals) return [];

    const sourceData: Record<string, { count: number; revenue: number }> = {};

    rentals.forEach((rental) => {
      if (!sourceData[rental.source]) {
        sourceData[rental.source] = { count: 0, revenue: 0 };
      }
      sourceData[rental.source].count++;
      sourceData[rental.source].revenue += rental.totalAmount / 100;
    });

    return Object.entries(sourceData).map(([source, data]) => ({
      source,
      count: data.count,
      revenue: data.revenue,
      avgTicket: data.revenue / data.count,
    }));
  };

  // Calcular previsão
  const calculateForecast = () => {
    if (!rentals) return { confirmed: 0, revenue: 0, lowOccupancyMonths: [] };

    const today = new Date();
    const confirmedRentals = rentals.filter((r) => new Date(r.startDate) >= today);
    let confirmedRevenue = 0;

    confirmedRentals.forEach((r) => {
      confirmedRevenue += r.totalAmount / 100;
    });

    const occupancyData = calculateOccupancyData();
    const lowOccupancyMonths = occupancyData.filter((m) => m.occupancy < 30).map((m) => m.month);

    return {
      confirmed: confirmedRentals.length,
      revenue: confirmedRevenue,
      lowOccupancyMonths,
    };
  };

  const occupancyData = useMemo(() => calculateOccupancyData(), [startDate, endDate, rentals]);
  const financialData = useMemo(() => calculateFinancialData(), [rentals]);
  const guestData = useMemo(() => calculateGuestData(), [rentals]);
  const sourcePerformance = useMemo(() => calculateSourcePerformance(), [rentals]);
  const forecast = useMemo(() => calculateForecast(), [rentals, startDate, endDate]);

  const sourceColors: Record<string, string> = {
    AIRBNB: "#FF5A5F",
    BOOKING: "#003580",
    DIRECT: "#4285F4",
    BLOCKED: "#9E9E9E",
  };

  const handleExport = (format: string) => {
    try {
      if (format === "pdf") {
        exportToPDF();
      } else if (format === "excel") {
        exportToExcel();
      } else if (format === "csv") {
        exportToCSV();
      }
      toast.success(`Relatório exportado com sucesso em ${format.toUpperCase()}!`);
    } catch (error) {
      toast.error(`Erro ao exportar relatório: ${error}`);
    }
  };

  const exportToPDF = () => {
    // Criar conteúdo HTML para o PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Ocupação</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .summary { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 20px; }
          .card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
          .card h3 { margin: 0 0 10px 0; color: #666; }
          .card .value { font-size: 24px; font-weight: bold; color: #333; }
        </style>
      </head>
      <body>
        <h1>Relatório de Ocupação</h1>
        <p>Período: ${startDate} a ${endDate}</p>
        
        <div class="summary">
          <div class="card">
            <h3>Ocupação Média</h3>
            <div class="value">${occupancyData.length > 0 ? Math.round(occupancyData.reduce((sum, m) => sum + m.occupancy, 0) / occupancyData.length) : 0}%</div>
          </div>
          <div class="card">
            <h3>Dias Ocupados</h3>
            <div class="value">${occupancyData.reduce((sum, m) => sum + m.occupied, 0)}</div>
          </div>
          <div class="card">
            <h3>Total de Reservas</h3>
            <div class="value">${rentals?.length || 0}</div>
          </div>
        </div>
        
        <h2>Ocupação por Mês</h2>
        <table>
          <thead>
            <tr>
              <th>Mês</th>
              <th>Ocupação (%)</th>
              <th>Dias Ocupados</th>
              <th>Total de Dias</th>
            </tr>
          </thead>
          <tbody>
            ${occupancyData.map(m => `
              <tr>
                <td>${m.month}</td>
                <td>${m.occupancy}%</td>
                <td>${m.occupied}</td>
                <td>${m.total}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    // Usar html2pdf se disponível, senão usar print
    const printWindow = window.open('', '', 'height=400,width=800');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const exportToExcel = () => {
    // Criar dados para Excel
    const data = [
      ['Relatório de Ocupação'],
      ['Período:', `${startDate} a ${endDate}`],
      [],
      ['Resumo'],
      ['Ocupação Média', occupancyData.length > 0 ? Math.round(occupancyData.reduce((sum, m) => sum + m.occupancy, 0) / occupancyData.length) : 0],
      ['Dias Ocupados', occupancyData.reduce((sum, m) => sum + m.occupied, 0)],
      ['Total de Reservas', rentals?.length || 0],
      [],
      ['Ocupação por Mês'],
      ['Mês', 'Ocupação (%)', 'Dias Ocupados', 'Total de Dias'],
      ...occupancyData.map(m => [m.month, m.occupancy, m.occupied, m.total]),
    ];

    // Converter para CSV
    const csv = data.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio-ocupacao-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToCSV = () => {
    // Criar dados para CSV
    const data = [
      ['Relatório de Ocupação'],
      ['Período:', `${startDate} a ${endDate}`],
      [],
      ['Resumo'],
      ['Ocupação Média', occupancyData.length > 0 ? Math.round(occupancyData.reduce((sum, m) => sum + m.occupancy, 0) / occupancyData.length) : 0],
      ['Dias Ocupados', occupancyData.reduce((sum, m) => sum + m.occupied, 0)],
      ['Total de Reservas', rentals?.length || 0],
      [],
      ['Ocupação por Mês'],
      ['Mês', 'Ocupação (%)', 'Dias Ocupados', 'Total de Dias'],
      ...occupancyData.map(m => [m.month, m.occupancy, m.occupied, m.total]),
    ];

    // Converter para CSV
    const csv = data.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio-ocupacao-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (rentalsLoading || transactionsLoading) {
    return <div className="p-6">Carregando dados...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Responsivo */}
      <div className="space-y-4">
        {/* Linha superior: botão voltar e título */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <Button onClick={() => setLocation(`/rentals/${entityId}`)} variant="ghost" className="gap-2 self-start">
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Voltar para Reservas</span>
            <span className="sm:hidden">Voltar</span>
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold flex-1">Relatórios</h1>
        </div>
        {/* Linha inferior: botões de exportação */}
        <div className="flex flex-wrap gap-2">
          <Select value={exportFormat} onValueChange={setExportFormat}>
            <SelectTrigger className="w-28 sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="excel">Excel</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => handleExport(exportFormat)} className="gap-2 flex-1 sm:flex-none">
            <Download className="w-4 h-4" />
            <span>Exportar</span>
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Data Inicial</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">Data Final</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-type">Período</Label>
              <Select value={periodType} onValueChange={setPeriodType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mensal</SelectItem>
                  <SelectItem value="quarter">Trimestral</SelectItem>
                  <SelectItem value="year">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs de Relatórios */}
      <Tabs value={reportType} onValueChange={setReportType} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="occupancy" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Ocupação</span>
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            <span className="hidden sm:inline">Financeiro</span>
          </TabsTrigger>
          <TabsTrigger value="guests" className="gap-2">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Hóspedes</span>
          </TabsTrigger>
          <TabsTrigger value="sources" className="gap-2">
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Fontes</span>
          </TabsTrigger>
          <TabsTrigger value="forecast" className="gap-2">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Previsão</span>
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Resumo</span>
          </TabsTrigger>
        </TabsList>

        {/* Relatório de Ocupação */}
        <TabsContent value="occupancy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Taxa de Ocupação</CardTitle>
              <CardDescription>Percentual de dias ocupados por mês</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={occupancyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-2 border border-gray-300 rounded shadow-lg text-sm">
                          <p className="font-semibold">{data.month}</p>
                          <p>Ocupação: {data.occupancy}%</p>
                          <p>Dias Alugados: {data.occupied}/{data.total}</p>
                        </div>
                      );
                    }
                    return null;
                  }} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="occupancy"
                    stroke="#3b82f6"
                    name="Ocupação (%)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Ocupação Média</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {occupancyData.length > 0
                    ? Math.round(occupancyData.reduce((sum, m) => sum + m.occupancy, 0) / occupancyData.length)
                    : 0}
                  %
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Dias Ocupados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {occupancyData.reduce((sum, m) => sum + m.occupied, 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Total de Reservas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{rentals?.length || 0}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Relatório Financeiro */}
        <TabsContent value="financial" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Receita Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  R$ {financialData.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Receita Média</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  R$ {financialData.average.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Ticket Médio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  R$ {(financialData.total / (financialData.count || 1)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Taxas Extras</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  R$ {financialData.taxesTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Receita por Fonte</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={Object.entries(financialData.bySource).map(([source, revenue]) => ({
                      name: source,
                      value: revenue,
                    }))}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) =>
                      `${name}: R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {Object.keys(financialData.bySource).map((source) => (
                      <Cell key={source} fill={sourceColors[source] || "#8884d8"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Relatório de Hóspedes */}
        <TabsContent value="guests" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Hóspedes Recorrentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{guestData.recurring}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Média de Hóspedes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{guestData.avgGuests.toFixed(1)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tempo Médio de Estadia</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{guestData.avgStay.toFixed(1)} dias</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Relatório de Performance por Fonte */}
        <TabsContent value="sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance por Fonte</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={sourcePerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="source" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" fill="#3b82f6" name="Quantidade de Reservas" />
                  <Bar yAxisId="right" dataKey="revenue" fill="#10b981" name="Receita (R$)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sourcePerformance.map((source) => (
              <Card key={source.source}>
                <CardHeader>
                  <CardTitle className="text-sm">{source.source}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="text-gray-600">Reservas:</span>
                    <span className="float-right font-semibold">{source.count}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Receita:</span>
                    <span className="float-right font-semibold">
                      R$ {source.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Ticket Médio:</span>
                    <span className="float-right font-semibold">
                      R$ {source.avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Relatório de Previsão */}
        <TabsContent value="forecast" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Reservas Confirmadas (Futuras)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{forecast.confirmed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Receita Prevista</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  R$ {forecast.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
          </div>

          {forecast.lowOccupancyMonths.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Períodos com Baixa Ocupação</CardTitle>
                <CardDescription>Oportunidades para promoção</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {forecast.lowOccupancyMonths.map((month) => (
                    <div key={month} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      {month}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Resumo Geral */}
        <TabsContent value="summary" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Total de Reservas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{rentals?.length || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Receita Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  R$ {financialData.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Ocupação Média</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {occupancyData.length > 0
                    ? Math.round(occupancyData.reduce((sum, m) => sum + m.occupancy, 0) / occupancyData.length)
                    : 0}
                  %
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Hóspedes Recorrentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{guestData.recurring}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Média de Hóspedes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{guestData.avgGuests.toFixed(1)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tempo Médio de Estadia</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{guestData.avgStay.toFixed(1)} dias</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
