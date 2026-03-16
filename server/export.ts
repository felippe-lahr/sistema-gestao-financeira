import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Função para formatar valores em moeda brasileira
function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// ========== EXCEL EXPORT ==========

export async function generateTransactionsExcel(data: {
  entityName: string;
  transactions: any[];
  summary: any;
  period: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema de Gestão Financeira";
  workbook.created = new Date();

  // ABA 1: Transações
  const transactionsSheet = workbook.addWorksheet("Transações", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
  });

  // Cabeçalho
  transactionsSheet.columns = [
    { header: "Data", key: "date", width: 12 },
    { header: "Descrição", key: "description", width: 35 },
    { header: "Tipo", key: "type", width: 10 },
    { header: "Categoria", key: "category", width: 20 },
    { header: "Conta Bancária", key: "bankAccount", width: 22 },
    { header: "Origem", key: "origin", width: 12 },
    { header: "Valor", key: "amount", width: 15 },
    { header: "Status", key: "status", width: 12 },
    { header: "Vencimento", key: "dueDate", width: 12 },
    { header: "Pagamento", key: "paidDate", width: 12 },
  ];

  // Estilo do cabeçalho
  transactionsSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  transactionsSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2563EB" },
  };
  transactionsSheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  transactionsSheet.getRow(1).height = 25;

  // Adicionar dados
  data.transactions.forEach((transaction) => {
    const row = transactionsSheet.addRow({
      date: transaction.createdAt ? format(new Date(transaction.createdAt), "dd/MM/yyyy") : "",
      description: transaction.description,
      type: transaction.type === "INCOME" ? "Receita" : "Despesa",
      category: transaction.categoryName || "",
      bankAccount: transaction.bankAccountName || "",
      origin: transaction.importOrigin === "OFX" ? "OFX" : "Manual",
      amount: transaction.amount / 100,
      status:
        transaction.status === "PAID"
          ? "Pago"
          : transaction.status === "PENDING"
          ? "Pendente"
          : "Vencido",
      dueDate: transaction.dueDate ? format(new Date(transaction.dueDate), "dd/MM/yyyy") : "",
      paidDate: transaction.paymentDate ? format(new Date(transaction.paymentDate), "dd/MM/yyyy") : "",
    });

    // Formatação de valor
    row.getCell("amount").numFmt = 'R$ #,##0.00';
    
    // Cor baseada no tipo
    if (transaction.type === "INCOME") {
      row.getCell("amount").font = { color: { argb: "FF16A34A" } };
    } else {
      row.getCell("amount").font = { color: { argb: "FFDC2626" } };
    }

    // Cor baseada no status
    const statusCell = row.getCell("status");
    if (transaction.status === "PAID") {
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD1FAE5" },
      };
      statusCell.font = { color: { argb: "FF16A34A" } };
    } else if (transaction.status === "OVERDUE") {
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFECACA" },
      };
      statusCell.font = { color: { argb: "FFDC2626" } };
    } else {
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFEF3C7" },
      };
      statusCell.font = { color: { argb: "FFCA8A04" } };
    }
  });

  // Bordas em todas as células
  transactionsSheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  });

  // ABA 2: Resumo
  const summarySheet = workbook.addWorksheet("Resumo");

  summarySheet.mergeCells("A1:D1");
  summarySheet.getCell("A1").value = `Relatório Financeiro - ${data.entityName}`;
  summarySheet.getCell("A1").font = { bold: true, size: 16 };
  summarySheet.getCell("A1").alignment = { horizontal: "center" };

  summarySheet.mergeCells("A2:D2");
  summarySheet.getCell("A2").value = `Período: ${data.period}`;
  summarySheet.getCell("A2").alignment = { horizontal: "center" };

  summarySheet.addRow([]);

  // Resumo de valores
  summarySheet.addRow(["Métrica", "Valor"]);
  summarySheet.getRow(4).font = { bold: true };
  
  summarySheet.addRow(["Total de Receitas", data.summary.totalIncome / 100]);
  summarySheet.addRow(["Total de Despesas", data.summary.totalExpenses / 100]);
  summarySheet.addRow(["Saldo", (data.summary.totalIncome - data.summary.totalExpenses) / 100]);

  summarySheet.getColumn(2).numFmt = 'R$ #,##0.00';
  summarySheet.getColumn(1).width = 25;
  summarySheet.getColumn(2).width = 20;

  // Retornar buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ========== PDF EXPORT ==========

export function generateTransactionsPDF(data: {
  entityName: string;
  transactions: any[];
  summary: any;
  period: string;
  startDate?: string;
  endDate?: string;
  cashFlowData?: any[];
  categoryData?: any[];
  categoryExpenses?: any[];
  upcomingTransactions?: any[];
  upcomingIncomeTransactions?: any[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 40;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ===== HELPER: desenhar linha separadora =====
    const drawSeparator = (y: number, color = "#E2E8F0") => {
      doc.strokeColor(color).lineWidth(1).moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
    };

    // ===== HELPER: desenhar cabeçalho de tabela =====
    const drawTableHeader = (headers: string[], colWidths: number[], y: number, color = "#2563EB") => {
      let x = MARGIN;
      headers.forEach((header, i) => {
        doc.rect(x, y, colWidths[i], 22).fillAndStroke(color, color);
        doc.fontSize(8).font("Helvetica-Bold").fillColor("#FFFFFF")
          .text(header, x + 4, y + 7, { width: colWidths[i] - 8, align: "left" });
        x += colWidths[i];
      });
      return y + 22;
    };

    // ===== HELPER: verificar se precisa nova página =====
    const ensureSpace = (needed: number) => {
      if (doc.y > PAGE_HEIGHT - MARGIN - needed) {
        addFooter();
        doc.addPage();
        doc.y = MARGIN;
      }
    };

    // ===== HELPER: rodapé =====
    const addFooter = () => {
      doc.fontSize(7).font("Helvetica").fillColor("#94A3B8")
        .text("UnifiquePro · Relatório gerado automaticamente", MARGIN, PAGE_HEIGHT - 30, { align: "center", width: CONTENT_WIDTH });
    };

    // ===== DADOS CALCULADOS =====
    const incomes = data.transactions.filter(t => t.type === "INCOME");
    const expenses = data.transactions.filter(t => t.type === "EXPENSE");
    const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
    const saldoLiquido = totalIncome - totalExpense;
    const totalPaid = data.transactions.filter(t => t.status === "PAID").reduce((s, t) => s + t.amount, 0);
    const totalPending = data.transactions.filter(t => t.status === "PENDING").reduce((s, t) => s + t.amount, 0);
    const totalOverdue = data.transactions.filter(t => t.status === "OVERDUE").reduce((s, t) => s + t.amount, 0);

    // Receitas por categoria
    const incomeByCat: Record<string, { total: number; count: number }> = {};
    incomes.forEach(t => {
      const cat = t.categoryName || "Sem categoria";
      if (!incomeByCat[cat]) incomeByCat[cat] = { total: 0, count: 0 };
      incomeByCat[cat].total += t.amount;
      incomeByCat[cat].count++;
    });

    // Despesas por categoria
    const expenseByCat: Record<string, { total: number; count: number }> = {};
    expenses.forEach(t => {
      const cat = t.categoryName || "Sem categoria";
      if (!expenseByCat[cat]) expenseByCat[cat] = { total: 0, count: 0 };
      expenseByCat[cat].total += t.amount;
      expenseByCat[cat].count++;
    });

    // Receitas por status
    const incomeByStatus: Record<string, number> = {};
    incomes.forEach(t => { incomeByStatus[t.status] = (incomeByStatus[t.status] || 0) + t.amount; });

    // Despesas por status
    const expenseByStatus: Record<string, number> = {};
    expenses.forEach(t => { expenseByStatus[t.status] = (expenseByStatus[t.status] || 0) + t.amount; });

    // Evolução mensal
    const monthlyMap: Record<string, { income: number; expense: number }> = {};
    data.transactions.forEach(t => {
      if (!t.dueDate) return;
      const d = new Date(t.dueDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyMap[key]) monthlyMap[key] = { income: 0, expense: 0 };
      if (t.type === "INCOME") monthlyMap[key].income += t.amount;
      else monthlyMap[key].expense += t.amount;
    });
    const monthlyData = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => {
      const [yr, mo] = key.split("-").map(Number);
      const label = new Date(yr, mo - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      return { label, income: v.income, expense: v.expense, saldo: v.income - v.expense };
    });

    const statusLabel = (s: string) => ({ PAID: "Pago", PENDING: "Pendente", OVERDUE: "Atrasado" }[s] || s);

    // ===== PÁGINA 1: CABEÇALHO =====
    // Linha azul no topo
    doc.rect(0, 0, PAGE_WIDTH, 4).fill("#3B82F6");

    doc.moveDown(1);
    doc.fontSize(22).font("Helvetica-Bold").fillColor("#1E293B")
      .text("Relatório Financeiro", { align: "center" });
    doc.fontSize(13).font("Helvetica").fillColor("#475569")
      .text(data.entityName, { align: "center" });

    // Período
    let periodText = data.period;
    if (data.startDate && data.endDate) {
      const sf = format(new Date(data.startDate), "dd/MM/yyyy", { locale: ptBR });
      const ef = format(new Date(data.endDate), "dd/MM/yyyy", { locale: ptBR });
      periodText = `${data.period} (${sf} até ${ef})`;
    }
    doc.fontSize(9).fillColor("#64748B").text(`Período: ${periodText}`, { align: "center" });

    const now = new Date();
    const gmtMinus3Time = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    doc.fontSize(8).text(`Gerado em: ${format(gmtMinus3Time, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, { align: "center" });

    doc.moveDown(1);
    drawSeparator(doc.y, "#3B82F6");
    doc.moveDown(1.5);

    // ===== RESUMO EXECUTIVO (5 cards) =====
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#1E293B").text("Resumo Executivo");
    doc.moveDown(0.5);

    const cardW = (CONTENT_WIDTH - 16) / 5;
    const cardH = 55;
    const cardY = doc.y;
    const cards = [
      { label: "Total Receitas", value: formatBRL(totalIncome / 100), color: "#16A34A", border: "#16A34A", bg: "#F0FDF4", sub: `${incomes.length} lançamentos` },
      { label: "Total Despesas", value: formatBRL(totalExpense / 100), color: "#DC2626", border: "#DC2626", bg: "#FEF2F2", sub: `${expenses.length} lançamentos` },
      { label: "Saldo Líquido", value: `${saldoLiquido >= 0 ? "+" : ""}${formatBRL(saldoLiquido / 100)}`, color: saldoLiquido >= 0 ? "#3B82F6" : "#F59E0B", border: saldoLiquido >= 0 ? "#3B82F6" : "#F59E0B", bg: saldoLiquido >= 0 ? "#EFF6FF" : "#FFFBEB", sub: "" },
      { label: "Pendente", value: formatBRL(totalPending / 100), color: "#D97706", border: "#D97706", bg: "#FFFBEB", sub: `${data.transactions.filter(t => t.status === "PENDING").length} lançamentos` },
      { label: "Atrasado", value: formatBRL(totalOverdue / 100), color: "#DC2626", border: "#DC2626", bg: "#FEF2F2", sub: `${data.transactions.filter(t => t.status === "OVERDUE").length} lançamentos` },
    ];

    cards.forEach((card, i) => {
      const x = MARGIN + i * (cardW + 4);
      doc.rect(x, cardY, cardW, cardH).fillAndStroke(card.bg, "#E2E8F0");
      doc.rect(x, cardY, cardW, 3).fill(card.border);
      doc.fontSize(7).font("Helvetica-Bold").fillColor("#64748B").text(card.label.toUpperCase(), x + 6, cardY + 8, { width: cardW - 12 });
      doc.fontSize(11).font("Helvetica-Bold").fillColor(card.color).text(card.value, x + 6, cardY + 22, { width: cardW - 12 });
      if (card.sub) {
        doc.fontSize(6).font("Helvetica").fillColor("#94A3B8").text(card.sub, x + 6, cardY + 38, { width: cardW - 12 });
      }
    });

    doc.y = cardY + cardH + 20;

    // ===== ANÁLISE POR CATEGORIA E STATUS =====
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#1E293B").text("Análise por Categoria e Status");
    doc.moveDown(0.5);

    const halfWidth = (CONTENT_WIDTH - 10) / 2;

    // --- Receitas por Categoria (lado esquerdo) ---
    const catStartY = doc.y;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#16A34A").text("Receitas por Categoria", MARGIN, catStartY);
    let catY = catStartY + 16;

    const incCatEntries = Object.entries(incomeByCat).sort(([, a], [, b]) => b.total - a.total);
    if (incCatEntries.length > 0) {
      // Header
      const iColW = [halfWidth * 0.45, halfWidth * 0.3, halfWidth * 0.25];
      let ix = MARGIN;
      ["Categoria", "Total", "%"].forEach((h, hi) => {
        doc.rect(ix, catY, iColW[hi], 16).fillAndStroke("#F0FDF4", "#BBF7D0");
        doc.fontSize(7).font("Helvetica-Bold").fillColor("#16A34A").text(h, ix + 4, catY + 5, { width: iColW[hi] - 8 });
        ix += iColW[hi];
      });
      catY += 16;

      incCatEntries.forEach(([cat, v], idx) => {
        const bg = idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
        ix = MARGIN;
        const pct = totalIncome > 0 ? Math.round((v.total / totalIncome) * 100) : 0;
        const rowData = [cat.substring(0, 20), formatBRL(v.total / 100), `${pct}%`];
        rowData.forEach((cell, ci) => {
          doc.rect(ix, catY, iColW[ci], 14).fillAndStroke(bg, "#F1F5F9");
          doc.fontSize(7).font("Helvetica").fillColor("#1E293B").text(cell, ix + 4, catY + 4, { width: iColW[ci] - 8 });
          ix += iColW[ci];
        });
        catY += 14;
      });
    } else {
      doc.fontSize(8).font("Helvetica").fillColor("#94A3B8").text("Nenhuma receita no período", MARGIN, catY);
      catY += 14;
    }

    // Receitas por status
    catY += 8;
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#64748B").text("Por Status", MARGIN, catY);
    catY += 12;
    Object.entries(incomeByStatus).forEach(([st, val]) => {
      const pct = totalIncome > 0 ? Math.round((val / totalIncome) * 100) : 0;
      doc.fontSize(7).font("Helvetica").fillColor("#1E293B")
        .text(`${statusLabel(st)}: ${formatBRL(val / 100)} (${pct}%)`, MARGIN + 4, catY);
      catY += 11;
    });

    // --- Despesas por Categoria (lado direito) ---
    const rightX = MARGIN + halfWidth + 10;
    let dCatY = catStartY;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#DC2626").text("Despesas por Categoria", rightX, dCatY);
    dCatY += 16;

    const expCatEntries = Object.entries(expenseByCat).sort(([, a], [, b]) => b.total - a.total);
    if (expCatEntries.length > 0) {
      const eColW = [halfWidth * 0.45, halfWidth * 0.3, halfWidth * 0.25];
      let ex = rightX;
      ["Categoria", "Total", "%"].forEach((h, hi) => {
        doc.rect(ex, dCatY, eColW[hi], 16).fillAndStroke("#FEF2F2", "#FECACA");
        doc.fontSize(7).font("Helvetica-Bold").fillColor("#DC2626").text(h, ex + 4, dCatY + 5, { width: eColW[hi] - 8 });
        ex += eColW[hi];
      });
      dCatY += 16;

      expCatEntries.forEach(([cat, v], idx) => {
        const bg = idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
        ex = rightX;
        const pct = totalExpense > 0 ? Math.round((v.total / totalExpense) * 100) : 0;
        const rowData = [cat.substring(0, 20), formatBRL(v.total / 100), `${pct}%`];
        rowData.forEach((cell, ci) => {
          doc.rect(ex, dCatY, eColW[ci], 14).fillAndStroke(bg, "#F1F5F9");
          doc.fontSize(7).font("Helvetica").fillColor("#1E293B").text(cell, ex + 4, dCatY + 4, { width: eColW[ci] - 8 });
          ex += eColW[ci];
        });
        dCatY += 14;
      });
    } else {
      doc.fontSize(8).font("Helvetica").fillColor("#94A3B8").text("Nenhuma despesa no período", rightX, dCatY);
      dCatY += 14;
    }

    // Despesas por status
    dCatY += 8;
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#64748B").text("Por Status", rightX, dCatY);
    dCatY += 12;
    Object.entries(expenseByStatus).forEach(([st, val]) => {
      const pct = totalExpense > 0 ? Math.round((val / totalExpense) * 100) : 0;
      doc.fontSize(7).font("Helvetica").fillColor("#1E293B")
        .text(`${statusLabel(st)}: ${formatBRL(val / 100)} (${pct}%)`, rightX + 4, dCatY);
      dCatY += 11;
    });

    doc.y = Math.max(catY, dCatY) + 20;

    // ===== EVOLUÇÃO MENSAL =====
    if (monthlyData.length > 0) {
      ensureSpace(40 + monthlyData.length * 18);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1E293B").text("Evolução Mensal");
      doc.moveDown(0.5);

      const mColW = [CONTENT_WIDTH * 0.25, CONTENT_WIDTH * 0.25, CONTENT_WIDTH * 0.25, CONTENT_WIDTH * 0.25];
      let mY = drawTableHeader(["Mês", "Receitas", "Despesas", "Saldo"], mColW, doc.y, "#F59E0B");

      monthlyData.forEach((m, idx) => {
        const bg = idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
        let mx = MARGIN;
        const rowData = [
          m.label,
          formatBRL(m.income / 100),
          formatBRL(m.expense / 100),
          `${m.saldo >= 0 ? "+" : ""}${formatBRL(m.saldo / 100)}`,
        ];
        const colors = ["#1E293B", "#16A34A", "#DC2626", m.saldo >= 0 ? "#3B82F6" : "#F59E0B"];

        rowData.forEach((cell, ci) => {
          doc.rect(mx, mY, mColW[ci], 16).fillAndStroke(bg, "#F1F5F9");
          doc.fontSize(8).font(ci === 0 ? "Helvetica-Bold" : "Helvetica").fillColor(colors[ci])
            .text(cell, mx + 4, mY + 4, { width: mColW[ci] - 8, align: ci === 0 ? "left" : "right" });
          mx += mColW[ci];
        });
        mY += 16;
      });

      // Total
      let mx = MARGIN;
      const totalRow = ["TOTAL", formatBRL(totalIncome / 100), formatBRL(totalExpense / 100), `${saldoLiquido >= 0 ? "+" : ""}${formatBRL(saldoLiquido / 100)}`];
      const totalColors = ["#1E293B", "#16A34A", "#DC2626", saldoLiquido >= 0 ? "#3B82F6" : "#F59E0B"];
      totalRow.forEach((cell, ci) => {
        doc.rect(mx, mY, mColW[ci], 20).fillAndStroke("#F8FAFC", "#E2E8F0");
        doc.fontSize(9).font("Helvetica-Bold").fillColor(totalColors[ci])
          .text(cell, mx + 4, mY + 6, { width: mColW[ci] - 8, align: ci === 0 ? "left" : "right" });
        mx += mColW[ci];
      });

      doc.y = mY + 30;
    }

    // ===== TABELA DE RECEITAS =====
    if (incomes.length > 0) {
      ensureSpace(60);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#16A34A").text(`Receitas (${incomes.length})`);
      doc.moveDown(0.3);

      const rColW = [60, 180, 80, 80, 50, 65];
      let rY = drawTableHeader(["Vencimento", "Descrição", "Categoria", "Valor", "Status", "Conta"], rColW, doc.y, "#16A34A");

      incomes.forEach((t, idx) => {
        if (rY > PAGE_HEIGHT - 60) {
          addFooter();
          doc.addPage();
          rY = MARGIN;
          rY = drawTableHeader(["Vencimento", "Descrição", "Categoria", "Valor", "Status", "Conta"], rColW, rY, "#16A34A");
        }
        const bg = idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
        let rx = MARGIN;
        const rowData = [
          t.dueDate ? format(new Date(t.dueDate), "dd/MM/yyyy") : "",
          (t.description || "").substring(0, 35),
          (t.categoryName || "Sem cat.").substring(0, 15),
          "+" + formatBRL(t.amount / 100),
          statusLabel(t.status),
          (t.bankAccountName || "").substring(0, 12),
        ];
        rowData.forEach((cell, ci) => {
          doc.rect(rx, rY, rColW[ci], 16).fillAndStroke(bg, "#F1F5F9");
          const color = ci === 3 ? "#16A34A" : "#1E293B";
          doc.fontSize(7).font(ci === 3 ? "Helvetica-Bold" : "Helvetica").fillColor(color)
            .text(cell, rx + 3, rY + 4, { width: rColW[ci] - 6 });
          rx += rColW[ci];
        });
        rY += 16;
      });

      // Total receitas
      let rx = MARGIN;
      doc.rect(rx, rY, rColW[0] + rColW[1] + rColW[2], 20).fillAndStroke("#F0FDF4", "#BBF7D0");
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#16A34A").text("TOTAL RECEITAS", rx + 4, rY + 6);
      rx += rColW[0] + rColW[1] + rColW[2];
      doc.rect(rx, rY, rColW[3], 20).fillAndStroke("#F0FDF4", "#BBF7D0");
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#16A34A").text(formatBRL(totalIncome / 100), rx + 3, rY + 6, { width: rColW[3] - 6 });
      rx += rColW[3];
      doc.rect(rx, rY, rColW[4] + rColW[5], 20).fillAndStroke("#F0FDF4", "#BBF7D0");

      doc.y = rY + 30;
    }

    // ===== TABELA DE DESPESAS =====
    if (expenses.length > 0) {
      ensureSpace(60);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#DC2626").text(`Despesas (${expenses.length})`);
      doc.moveDown(0.3);

      const eColW = [60, 180, 80, 80, 50, 65];
      let eY = drawTableHeader(["Vencimento", "Descrição", "Categoria", "Valor", "Status", "Conta"], eColW, doc.y, "#DC2626");

      expenses.forEach((t, idx) => {
        if (eY > PAGE_HEIGHT - 60) {
          addFooter();
          doc.addPage();
          eY = MARGIN;
          eY = drawTableHeader(["Vencimento", "Descrição", "Categoria", "Valor", "Status", "Conta"], eColW, eY, "#DC2626");
        }
        const bg = idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
        let ex = MARGIN;
        const rowData = [
          t.dueDate ? format(new Date(t.dueDate), "dd/MM/yyyy") : "",
          (t.description || "").substring(0, 35),
          (t.categoryName || "Sem cat.").substring(0, 15),
          "-" + formatBRL(t.amount / 100),
          statusLabel(t.status),
          (t.bankAccountName || "").substring(0, 12),
        ];
        rowData.forEach((cell, ci) => {
          doc.rect(ex, eY, eColW[ci], 16).fillAndStroke(bg, "#F1F5F9");
          const color = ci === 3 ? "#DC2626" : "#1E293B";
          doc.fontSize(7).font(ci === 3 ? "Helvetica-Bold" : "Helvetica").fillColor(color)
            .text(cell, ex + 3, eY + 4, { width: eColW[ci] - 6 });
          ex += eColW[ci];
        });
        eY += 16;
      });

      // Total despesas
      let ex = MARGIN;
      doc.rect(ex, eY, eColW[0] + eColW[1] + eColW[2], 20).fillAndStroke("#FEF2F2", "#FECACA");
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#DC2626").text("TOTAL DESPESAS", ex + 4, eY + 6);
      ex += eColW[0] + eColW[1] + eColW[2];
      doc.rect(ex, eY, eColW[3], 20).fillAndStroke("#FEF2F2", "#FECACA");
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#DC2626").text(formatBRL(totalExpense / 100), ex + 3, eY + 6, { width: eColW[3] - 6 });
      ex += eColW[3];
      doc.rect(ex, eY, eColW[4] + eColW[5], 20).fillAndStroke("#FEF2F2", "#FECACA");

      doc.y = eY + 30;
    }

    // ===== GRÁFICO DE PIZZA (Distribuição por Categoria) =====
    if (data.categoryData && data.categoryData.length > 0) {
      ensureSpace(200);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1E293B").text("Distribuição de Despesas por Categoria");
      doc.moveDown(1);

      const pieX = MARGIN + 100;
      const pieY = doc.y + 70;
      const pieRadius = 65;
      const total = data.categoryData.reduce((sum: number, cat: any) => sum + cat.value, 0);
      let startAngle = -Math.PI / 2;
      const COLORS = ["#6B7280", "#EF4444", "#10B981", "#06B6D4", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6"];

      data.categoryData.forEach((cat: any, index: number) => {
        const sliceAngle = (cat.value / total) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;
        doc.save();
        doc.moveTo(pieX, pieY)
          .lineTo(pieX + pieRadius * Math.cos(startAngle), pieY + pieRadius * Math.sin(startAngle))
          .arc(pieX, pieY, pieRadius, startAngle, endAngle)
          .lineTo(pieX, pieY)
          .fillAndStroke(COLORS[index % COLORS.length], "#FFFFFF");
        doc.restore();
        startAngle = endAngle;
      });

      // Legenda
      let legendY = pieY - 60;
      const legendX = MARGIN + 250;
      data.categoryData.forEach((cat: any, index: number) => {
        doc.rect(legendX, legendY, 10, 10).fillAndStroke(COLORS[index % COLORS.length], COLORS[index % COLORS.length]);
        const percentage = ((cat.value / total) * 100).toFixed(0);
        doc.fontSize(8).font("Helvetica").fillColor("#1E293B")
          .text(`${cat.name} (${percentage}%)`, legendX + 15, legendY + 1);
        legendY += 16;
      });

      doc.y = pieY + pieRadius + 20;
    }

    // ===== RODAPÉ FINAL =====
    addFooter();

    doc.end();
  });
}

// ========== ATTACHMENTS ZIP EXPORT ==========

import archiver from "archiver";
import { Readable } from "stream";
import { getPresignedUrl, isS3Configured } from "./_core/s3";

export async function generateAttachmentsZip(data: {
  entityName: string;
  attachments: any[];
}): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    const archive = archiver("zip", {
      zlib: { level: 6 }, // Compressão padrão (compatível com macOS Archive Utility)
    });

    const chunks: Buffer[] = [];

    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    // Agrupar anexos por tipo
    const attachmentsByType: Record<string, any[]> = {};
    
    for (const attachment of data.attachments) {
      const type = attachment.type || "DOCUMENTOS";
      if (!attachmentsByType[type]) {
        attachmentsByType[type] = [];
      }
      attachmentsByType[type].push(attachment);
    }

    // Adicionar arquivos ao ZIP organizados por tipo
    let filesAdded = 0;
    for (const [type, typeAttachments] of Object.entries(attachmentsByType)) {
      const folderName = type.replace(/_/g, " ");
      console.log(`[ZIP] Processando tipo: ${type} (${typeAttachments.length} anexos)`);
      
      for (const attachment of typeAttachments) {
        try {
          console.log(`[ZIP] Baixando anexo ${attachment.id}: ${attachment.blobUrl}`);
          // Gerar URL de acesso: pré-assinada para S3 (bucket privado) ou URL direta para Supabase
          let downloadUrl = attachment.blobUrl;
          if (isS3Configured() && attachment.blobUrl.includes("amazonaws.com")) {
            downloadUrl = await getPresignedUrl(attachment.blobUrl, 300); // 5 minutos
            console.log(`[ZIP] URL pré-assinada gerada para anexo ${attachment.id}`);
          } else {
            console.log(`[ZIP] Usando URL direta para anexo ${attachment.id} (não é S3)`);
          }

          const response = await fetch(downloadUrl);
          console.log(`[ZIP] Resposta para anexo ${attachment.id}: ${response.status} ${response.statusText}`);
          if (!response.ok) {
            console.error(`[ZIP] Erro ao baixar anexo ${attachment.id}: ${response.status} ${response.statusText}`);
            continue;
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          console.log(`[ZIP] Anexo ${attachment.id} baixado: ${buffer.length} bytes`);

          // Criar nome de arquivo seguro com ID do anexo para garantir unicidade
          const transactionDesc = attachment.transactionDescription
            ?.replace(/[^a-zA-Z0-9]/g, "_")
            .substring(0, 30) || "sem_descricao";
          
          const extension = attachment.filename.split(".").pop() || "bin";
          const safeFilename = `transacao_${attachment.transactionId}_${transactionDesc}_anexo${attachment.id}.${extension}`;

          // Adicionar ao ZIP
          archive.append(buffer, { 
            name: `${folderName}/${safeFilename}` 
          });
          filesAdded++;
          console.log(`[ZIP] Arquivo adicionado: ${folderName}/${safeFilename}`);
        } catch (error) {
          console.error(`[ZIP] Erro ao processar anexo ${attachment.id}:`, error);
        }
      }
    }

    // Finalizar o ZIP
    console.log(`[ZIP] Finalizando arquivo com ${filesAdded} arquivos adicionados`);
    archive.finalize();
  });
}
