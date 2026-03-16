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
import { DatePicker } from "@/components/ui/date-picker";

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
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = (d: string | Date | null | undefined) => {
      if (!d) return '—';
      const dt = typeof d === 'string' ? new Date(d + (d.includes('T') ? '' : 'T00:00:00')) : d;
      return dt.toLocaleDateString('pt-BR');
    };
    const statusLabel = (s: string) => ({ PAID: 'Pago', PENDING: 'Pendente', OVERDUE: 'Atrasado' }[s] || s);
    const statusColor = (s: string) => ({ PAID: '#16a34a', PENDING: '#d97706', OVERDUE: '#dc2626' }[s] || '#6b7280');

    // Filtrar transações pelo período selecionado
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const periodStart = new Date(sy, sm - 1, sd);
    const periodEnd = new Date(ey, em - 1, ed, 23, 59, 59);

    const txAll = (transactions || []).filter(t => {
      const d = new Date(t.dueDate);
      return d >= periodStart && d <= periodEnd;
    });

    const incomes = txAll.filter(t => t.type === 'INCOME');
    const expenses = txAll.filter(t => t.type === 'EXPENSE');

    const totalIncome = incomes.reduce((s, t) => s + t.amount / 100, 0);
    const totalExpense = expenses.reduce((s, t) => s + t.amount / 100, 0);
    const saldoLiquido = totalIncome - totalExpense;
    const totalPaid = txAll.filter(t => t.status === 'PAID').reduce((s, t) => s + t.amount / 100, 0);
    const totalPending = txAll.filter(t => t.status === 'PENDING').reduce((s, t) => s + t.amount / 100, 0);
    const totalOverdue = txAll.filter(t => t.status === 'OVERDUE').reduce((s, t) => s + t.amount / 100, 0);

    // Receitas por categoria
    const incomeByCat: Record<string, { total: number; count: number; color: string }> = {};
    incomes.forEach(t => {
      const cat = t.categoryName || 'Sem categoria';
      if (!incomeByCat[cat]) incomeByCat[cat] = { total: 0, count: 0, color: t.categoryColor || '#6b7280' };
      incomeByCat[cat].total += t.amount / 100;
      incomeByCat[cat].count++;
    });

    // Despesas por categoria
    const expenseByCat: Record<string, { total: number; count: number; color: string }> = {};
    expenses.forEach(t => {
      const cat = t.categoryName || 'Sem categoria';
      if (!expenseByCat[cat]) expenseByCat[cat] = { total: 0, count: 0, color: t.categoryColor || '#6b7280' };
      expenseByCat[cat].total += t.amount / 100;
      expenseByCat[cat].count++;
    });

    // Receitas por status
    const incomeByStatus: Record<string, number> = {};
    incomes.forEach(t => { incomeByStatus[t.status] = (incomeByStatus[t.status] || 0) + t.amount / 100; });

    // Despesas por status
    const expenseByStatus: Record<string, number> = {};
    expenses.forEach(t => { expenseByStatus[t.status] = (expenseByStatus[t.status] || 0) + t.amount / 100; });

    // Evolução mensal
    const monthlyMap: Record<string, { income: number; expense: number }> = {};
    txAll.forEach(t => {
      const d = new Date(t.dueDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[key]) monthlyMap[key] = { income: 0, expense: 0 };
      if (t.type === 'INCOME') monthlyMap[key].income += t.amount / 100;
      else monthlyMap[key].expense += t.amount / 100;
    });
    const monthlyData = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => {
      const [yr, mo] = key.split('-').map(Number);
      const label = new Date(yr, mo - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      return { label, ...v, saldo: v.income - v.expense };
    });

    const tableRowStyle = `style="border-bottom: 1px solid #e5e7eb; padding: 7px 10px;"`;
    const thStyle = `style="background: #f8fafc; padding: 8px 10px; text-align: left; font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0;"`;

    const renderTransactionRows = (list: typeof txAll) =>
      list.map((t, i) => `
        <tr style="background: ${i % 2 === 0 ? '#fff' : '#f9fafb'}">
          <td ${tableRowStyle}>${fmtDate(t.dueDate)}</td>
          <td ${tableRowStyle}>${t.description}</td>
          <td ${tableRowStyle}>${t.categoryName || '<span style="color:#9ca3af">Sem categoria</span>'}</td>
          <td ${tableRowStyle} style="text-align:right; font-weight:600; color:${t.type === 'INCOME' ? '#16a34a' : '#dc2626'}">
            ${t.type === 'INCOME' ? '+' : '-'}R$ ${fmt(t.amount / 100)}
          </td>
          <td ${tableRowStyle} style="text-align:center">
            <span style="background:${statusColor(t.status)}22; color:${statusColor(t.status)}; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600">${statusLabel(t.status)}</span>
          </td>
          <td ${tableRowStyle} style="color:#6b7280; font-size:12px">${t.bankAccountName || '—'}</td>
        </tr>
      `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório Financeiro — UnifiquePro</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; font-size: 13px; }
          .page { max-width: 900px; margin: 0 auto; padding: 32px 28px; }
          /* Header */
          .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 3px solid #3b82f6; margin-bottom: 28px; }
          .header-left h1 { font-size: 22px; font-weight: 700; color: #1e293b; }
          .header-left p { color: #64748b; font-size: 12px; margin-top: 4px; }
          .header-right { text-align: right; }
          .header-right .badge { background: #3b82f6; color: #fff; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; }
          .header-right p { color: #94a3b8; font-size: 11px; margin-top: 6px; }
          /* Resumo executivo */
          .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 28px; }
          .summary-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 12px; }
          .summary-card .label { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
          .summary-card .value { font-size: 16px; font-weight: 700; }
          .summary-card.income { border-top: 3px solid #16a34a; }
          .summary-card.expense { border-top: 3px solid #dc2626; }
          .summary-card.saldo-pos { border-top: 3px solid #3b82f6; }
          .summary-card.saldo-neg { border-top: 3px solid #f59e0b; }
          .summary-card.pending { border-top: 3px solid #d97706; }
          .summary-card.overdue { border-top: 3px solid #dc2626; }
          /* Seções */
          .section { margin-bottom: 32px; }
          .section-title { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 14px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; display: flex; align-items: center; gap: 8px; }
          .section-title .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
          /* Tabelas */
          table { width: 100%; border-collapse: collapse; }
          th { ${thStyle.replace('style="', '').replace('"', '')} }
          /* Análise por categoria */
          .cat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
          .cat-table { width: 100%; border-collapse: collapse; }
          .cat-table th { background: #f8fafc; padding: 7px 10px; text-align: left; font-size: 11px; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
          .cat-table td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
          /* Evolução mensal */
          .monthly-table th { background: #f8fafc; padding: 8px 10px; text-align: center; font-size: 11px; color: #64748b; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
          .monthly-table td { padding: 8px 10px; text-align: center; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
          /* Footer */
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="page">

          <!-- CABEÇALHO -->
          <div class="header">
            <div class="header-left">
              <h1>📊 Relatório Financeiro</h1>
              <p>Período: ${fmtDate(startDate)} a ${fmtDate(endDate)} &nbsp;|&nbsp; ${txAll.length} transações</p>
            </div>
            <div class="header-right">
              <span class="badge">UnifiquePro</span>
              <p>Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>

          <!-- RESUMO EXECUTIVO -->
          <div class="section">
            <div class="section-title"><span class="dot" style="background:#3b82f6"></span>Resumo Executivo</div>
            <div class="summary-grid">
              <div class="summary-card income">
                <div class="label">Total Receitas</div>
                <div class="value" style="color:#16a34a">R$ ${fmt(totalIncome)}</div>
                <div style="font-size:11px;color:#64748b;margin-top:4px">${incomes.length} lançamentos</div>
              </div>
              <div class="summary-card expense">
                <div class="label">Total Despesas</div>
                <div class="value" style="color:#dc2626">R$ ${fmt(totalExpense)}</div>
                <div style="font-size:11px;color:#64748b;margin-top:4px">${expenses.length} lançamentos</div>
              </div>
              <div class="summary-card ${saldoLiquido >= 0 ? 'saldo-pos' : 'saldo-neg'}">
                <div class="label">Saldo Líquido</div>
                <div class="value" style="color:${saldoLiquido >= 0 ? '#3b82f6' : '#f59e0b'}">${saldoLiquido >= 0 ? '+' : ''}R$ ${fmt(saldoLiquido)}</div>
              </div>
              <div class="summary-card pending">
                <div class="label">Pendente</div>
                <div class="value" style="color:#d97706">R$ ${fmt(totalPending)}</div>
                <div style="font-size:11px;color:#64748b;margin-top:4px">${txAll.filter(t => t.status === 'PENDING').length} lançamentos</div>
              </div>
              <div class="summary-card overdue">
                <div class="label">Atrasado</div>
                <div class="value" style="color:#dc2626">R$ ${fmt(totalOverdue)}</div>
                <div style="font-size:11px;color:#64748b;margin-top:4px">${txAll.filter(t => t.status === 'OVERDUE').length} lançamentos</div>
              </div>
            </div>
          </div>

          <!-- ANÁLISE POR CATEGORIA E STATUS -->
          <div class="section">
            <div class="section-title"><span class="dot" style="background:#8b5cf6"></span>Análise por Categoria e Status</div>
            <div class="cat-grid">
              <!-- Receitas por categoria -->
              <div>
                <div style="font-size:13px;font-weight:700;color:#16a34a;margin-bottom:10px">✅ Receitas por Categoria</div>
                <table class="cat-table">
                  <thead><tr><th>Categoria</th><th style="text-align:right">Total</th><th style="text-align:center">Qtd</th><th style="text-align:right">%</th></tr></thead>
                  <tbody>
                    ${Object.entries(incomeByCat).sort(([,a],[,b]) => b.total - a.total).map(([cat, v], i) => `
                      <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
                        <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${v.color};margin-right:6px"></span>${cat}</td>
                        <td style="text-align:right;font-weight:600;color:#16a34a">R$ ${fmt(v.total)}</td>
                        <td style="text-align:center;color:#64748b">${v.count}</td>
                        <td style="text-align:right;color:#64748b">${totalIncome > 0 ? Math.round(v.total/totalIncome*100) : 0}%</td>
                      </tr>
                    `).join('')}
                    ${incomes.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:12px">Nenhuma receita no período</td></tr>' : ''}
                  </tbody>
                </table>
                <!-- Receitas por status -->
                <div style="margin-top:14px;font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px">Por Status</div>
                <table class="cat-table">
                  <thead><tr><th>Status</th><th style="text-align:right">Total</th><th style="text-align:right">%</th></tr></thead>
                  <tbody>
                    ${Object.entries(incomeByStatus).map(([st, val]) => `
                      <tr>
                        <td><span style="background:${statusColor(st)}22;color:${statusColor(st)};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600">${statusLabel(st)}</span></td>
                        <td style="text-align:right;font-weight:600">R$ ${fmt(val)}</td>
                        <td style="text-align:right;color:#64748b">${totalIncome > 0 ? Math.round(val/totalIncome*100) : 0}%</td>
                      </tr>
                    `).join('')}
                    ${incomes.length === 0 ? '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:8px">—</td></tr>' : ''}
                  </tbody>
                </table>
              </div>
              <!-- Despesas por categoria -->
              <div>
                <div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:10px">❌ Despesas por Categoria</div>
                <table class="cat-table">
                  <thead><tr><th>Categoria</th><th style="text-align:right">Total</th><th style="text-align:center">Qtd</th><th style="text-align:right">%</th></tr></thead>
                  <tbody>
                    ${Object.entries(expenseByCat).sort(([,a],[,b]) => b.total - a.total).map(([cat, v], i) => `
                      <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
                        <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${v.color};margin-right:6px"></span>${cat}</td>
                        <td style="text-align:right;font-weight:600;color:#dc2626">R$ ${fmt(v.total)}</td>
                        <td style="text-align:center;color:#64748b">${v.count}</td>
                        <td style="text-align:right;color:#64748b">${totalExpense > 0 ? Math.round(v.total/totalExpense*100) : 0}%</td>
                      </tr>
                    `).join('')}
                    ${expenses.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:12px">Nenhuma despesa no período</td></tr>' : ''}
                  </tbody>
                </table>
                <!-- Despesas por status -->
                <div style="margin-top:14px;font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px">Por Status</div>
                <table class="cat-table">
                  <thead><tr><th>Status</th><th style="text-align:right">Total</th><th style="text-align:right">%</th></tr></thead>
                  <tbody>
                    ${Object.entries(expenseByStatus).map(([st, val]) => `
                      <tr>
                        <td><span style="background:${statusColor(st)}22;color:${statusColor(st)};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600">${statusLabel(st)}</span></td>
                        <td style="text-align:right;font-weight:600">R$ ${fmt(val)}</td>
                        <td style="text-align:right;color:#64748b">${totalExpense > 0 ? Math.round(val/totalExpense*100) : 0}%</td>
                      </tr>
                    `).join('')}
                    ${expenses.length === 0 ? '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:8px">—</td></tr>' : ''}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- EVOLUÇÃO MENSAL -->
          ${monthlyData.length > 0 ? `
          <div class="section">
            <div class="section-title"><span class="dot" style="background:#f59e0b"></span>Evolução Mensal</div>
            <table class="monthly-table">
              <thead>
                <tr>
                  <th style="text-align:left">Mês</th>
                  <th style="color:#16a34a">Receitas</th>
                  <th style="color:#dc2626">Despesas</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                ${monthlyData.map((m, i) => `
                  <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
                    <td style="text-align:left;font-weight:600">${m.label}</td>
                    <td style="color:#16a34a;font-weight:600">R$ ${fmt(m.income)}</td>
                    <td style="color:#dc2626;font-weight:600">R$ ${fmt(m.expense)}</td>
                    <td style="font-weight:700;color:${m.saldo >= 0 ? '#3b82f6' : '#f59e0b'}">${m.saldo >= 0 ? '+' : ''}R$ ${fmt(m.saldo)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="background:#f8fafc;font-weight:700;border-top:2px solid #e2e8f0">
                  <td style="text-align:left;padding:8px 10px">TOTAL</td>
                  <td style="text-align:center;color:#16a34a;padding:8px 10px">R$ ${fmt(totalIncome)}</td>
                  <td style="text-align:center;color:#dc2626;padding:8px 10px">R$ ${fmt(totalExpense)}</td>
                  <td style="text-align:center;color:${saldoLiquido>=0?'#3b82f6':'#f59e0b'};padding:8px 10px">${saldoLiquido>=0?'+':''}R$ ${fmt(saldoLiquido)}</td>
                </tr>
              </tfoot>
            </table>
          </div>` : ''}

          <!-- TABELA DE RECEITAS -->
          ${incomes.length > 0 ? `
          <div class="section">
            <div class="section-title"><span class="dot" style="background:#16a34a"></span>Receitas (${incomes.length})</div>
            <table>
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th style="text-align:right">Valor</th>
                  <th style="text-align:center">Status</th>
                  <th>Conta Bancária</th>
                </tr>
              </thead>
              <tbody>${renderTransactionRows(incomes)}</tbody>
              <tfoot>
                <tr style="background:#f0fdf4;font-weight:700;border-top:2px solid #bbf7d0">
                  <td colspan="3" style="padding:8px 10px">TOTAL RECEITAS</td>
                  <td style="text-align:right;color:#16a34a;padding:8px 10px">R$ ${fmt(totalIncome)}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>` : ''}

          <!-- TABELA DE DESPESAS -->
          ${expenses.length > 0 ? `
          <div class="section">
            <div class="section-title"><span class="dot" style="background:#dc2626"></span>Despesas (${expenses.length})</div>
            <table>
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th style="text-align:right">Valor</th>
                  <th style="text-align:center">Status</th>
                  <th>Conta Bancária</th>
                </tr>
              </thead>
              <tbody>${renderTransactionRows(expenses)}</tbody>
              <tfoot>
                <tr style="background:#fef2f2;font-weight:700;border-top:2px solid #fecaca">
                  <td colspan="3" style="padding:8px 10px">TOTAL DESPESAS</td>
                  <td style="text-align:right;color:#dc2626;padding:8px 10px">R$ ${fmt(totalExpense)}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>` : ''}

          <!-- TABELA GERAL DE TRANSAÇÕES -->
          ${txAll.length > 0 ? `
          <div class="section">
            <div class="section-title"><span class="dot" style="background:#6b7280"></span>Todas as Transações (${txAll.length})</div>
            <table>
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th style="text-align:right">Valor</th>
                  <th style="text-align:center">Status</th>
                  <th>Conta Bancária</th>
                </tr>
              </thead>
              <tbody>${renderTransactionRows(txAll)}</tbody>
            </table>
          </div>` : `
          <div class="section">
            <p style="text-align:center;color:#94a3b8;padding:32px">Nenhuma transação encontrada no período selecionado.</p>
          </div>`}

          <!-- FOOTER -->
          <div class="footer">
            UnifiquePro &nbsp;·&nbsp; Relatório gerado em ${new Date().toLocaleString('pt-BR')} &nbsp;·&nbsp; Período: ${fmtDate(startDate)} a ${fmtDate(endDate)}
          </div>

        </div>
      </body>
      </html>
    `;

    // Usar iframe oculto para evitar bloqueio de popup
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '1100px';
    iframe.style.height = '900px';
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 600);
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
              <DatePicker id="start-date" value={startDate} onChange={(v) => setStartDate(v)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">Data Final</Label>
              <DatePicker id="end-date" value={endDate} onChange={(v) => setEndDate(v)} />
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
                        <div className="bg-white dark:bg-gray-800 p-2 border border dark:border-gray-700-gray-300 rounded shadow-lg text-sm">
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
                    <span className="text-gray-600 dark:text-gray-400">Reservas:</span>
                    <span className="float-right font-semibold">{source.count}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Receita:</span>
                    <span className="float-right font-semibold">
                      R$ {source.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Ticket Médio:</span>
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
                    <div key={month} className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border dark:border-gray-700-yellow-200 rounded-lg">
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
