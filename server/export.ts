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
    const doc = new PDFDocument({ margin: 40, size: "A4", autoFirstPage: true });
    const chunks: Buffer[] = [];
    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 40;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    const FOOTER_Y = PAGE_HEIGHT - 25;

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ===== HELPERS =====

    const addFooter = () => {
      doc.fontSize(7).font("Helvetica").fillColor("#94A3B8")
        .text("UnifiquePro · Relatório gerado automaticamente", MARGIN, FOOTER_Y, {
          align: "center",
          width: CONTENT_WIDTH,
        });
    };

    // Verifica se há espaço suficiente; se não, adiciona nova página
    const checkSpace = (needed: number): number => {
      if (doc.y + needed > FOOTER_Y - 10) {
        addFooter();
        doc.addPage();
        return MARGIN;
      }
      return doc.y;
    };

    const drawLine = (y: number, color = "#E2E8F0") => {
      doc.strokeColor(color).lineWidth(0.5).moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).stroke();
    };

    // Desenha tabela de categoria | pago | pendente | vencido | total
    // Retorna o Y final após a tabela
    const drawCategoryTable = (
      title: string,
      entries: Array<{ categoryName: string; paid: number; pending: number; overdue: number; total: number }>,
      headerColor: string,
      startY: number
    ): number => {
      const COL = [220, 80, 80, 80, 55]; // larguras das colunas
      const ROW_H = 22;
      const HEADER_H = 26;

      let y = startY;

      // Título da seção
      y = checkSpace(HEADER_H + ROW_H * 2 + 30);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1E293B").text(title, MARGIN, y);
      y += 20;

      // Cabeçalho da tabela
      const headers = ["Categoria", "Pago", "Pendente", "Vencido", "Total"];
      let x = MARGIN;
      headers.forEach((h, i) => {
        doc.rect(x, y, COL[i], HEADER_H).fillAndStroke(headerColor, headerColor);
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF")
          .text(h, x + 6, y + 9, { width: COL[i] - 12, align: "left" });
        x += COL[i];
      });
      y += HEADER_H;

      // Linhas de dados
      if (entries.length === 0) {
        y = checkSpace(ROW_H);
        doc.rect(MARGIN, y, CONTENT_WIDTH, ROW_H).fillAndStroke("#F9FAFB", "#E2E8F0");
        doc.fontSize(8).font("Helvetica").fillColor("#94A3B8")
          .text("Nenhum lançamento no período", MARGIN + 6, y + 7, { width: CONTENT_WIDTH - 12 });
        y += ROW_H;
      } else {
        entries.forEach((cat, idx) => {
          y = checkSpace(ROW_H);
          const bg = idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
          x = MARGIN;
          const cells = [
            cat.categoryName || "Sem Categoria",
            formatBRL(cat.paid / 100),
            formatBRL(cat.pending / 100),
            formatBRL(cat.overdue / 100),
            formatBRL(cat.total / 100),
          ];
          cells.forEach((cell, ci) => {
            doc.rect(x, y, COL[ci], ROW_H).fillAndStroke(bg, "#E2E8F0");
            doc.fontSize(8).font("Helvetica").fillColor("#1E293B")
              .text(cell, x + 6, y + 7, { width: COL[ci] - 12, align: "left" });
            x += COL[ci];
          });
          y += ROW_H;
        });
      }

      // Linha de Total Geral
      y = checkSpace(ROW_H + 4);
      const tPaid = entries.reduce((s, c) => s + c.paid, 0);
      const tPending = entries.reduce((s, c) => s + c.pending, 0);
      const tOverdue = entries.reduce((s, c) => s + c.overdue, 0);
      const tTotal = entries.reduce((s, c) => s + c.total, 0);
      x = MARGIN;
      const totalCells = ["Total Geral", formatBRL(tPaid / 100), formatBRL(tPending / 100), formatBRL(tOverdue / 100), formatBRL(tTotal / 100)];
      totalCells.forEach((cell, ci) => {
        doc.rect(x, y, COL[ci], ROW_H).fillAndStroke("#EFF6FF", headerColor);
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#1E293B")
          .text(cell, x + 6, y + 7, { width: COL[ci] - 12, align: "left" });
        x += COL[ci];
      });
      y += ROW_H;

      return y;
    };

    // ===== DADOS CALCULADOS =====
    const incomes = data.transactions.filter(t => t.type === "INCOME");
    const expenses = data.transactions.filter(t => t.type === "EXPENSE");
    const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
    const saldoLiquido = totalIncome - totalExpense;
    const totalPending = data.transactions.filter(t => t.status === "PENDING").reduce((s, t) => s + t.amount, 0);
    const totalOverdue = data.transactions.filter(t => t.status === "OVERDUE").reduce((s, t) => s + t.amount, 0);

    // Receitas por categoria e status
    const incomeCatMap: Record<string, { paid: number; pending: number; overdue: number }> = {};
    incomes.forEach(t => {
      const cat = t.categoryName || "Sem Categoria";
      if (!incomeCatMap[cat]) incomeCatMap[cat] = { paid: 0, pending: 0, overdue: 0 };
      if (t.status === "PAID") incomeCatMap[cat].paid += t.amount;
      else if (t.status === "PENDING") incomeCatMap[cat].pending += t.amount;
      else incomeCatMap[cat].overdue += t.amount;
    });
    const incomeCatEntries = Object.entries(incomeCatMap)
      .map(([categoryName, v]) => ({ categoryName, ...v, total: v.paid + v.pending + v.overdue }))
      .sort((a, b) => b.total - a.total);

    // Despesas por categoria e status (usar categoryExpenses do servidor se disponível, senão calcular)
    let expenseCatEntries: Array<{ categoryName: string; paid: number; pending: number; overdue: number; total: number }>;
    if (data.categoryExpenses && data.categoryExpenses.length > 0) {
      expenseCatEntries = data.categoryExpenses;
    } else {
      const expCatMap: Record<string, { paid: number; pending: number; overdue: number }> = {};
      expenses.forEach(t => {
        const cat = t.categoryName || "Sem Categoria";
        if (!expCatMap[cat]) expCatMap[cat] = { paid: 0, pending: 0, overdue: 0 };
        if (t.status === "PAID") expCatMap[cat].paid += t.amount;
        else if (t.status === "PENDING") expCatMap[cat].pending += t.amount;
        else expCatMap[cat].overdue += t.amount;
      });
      expenseCatEntries = Object.entries(expCatMap)
        .map(([categoryName, v]) => ({ categoryName, ...v, total: v.paid + v.pending + v.overdue }))
        .sort((a, b) => b.total - a.total);
    }

    const statusLabel = (s: string) => ({ PAID: "Pago", PENDING: "Pendente", OVERDUE: "Atrasado" }[s] || s);

    // ===== PÁGINA 1: CABEÇALHO =====
    // Barra azul no topo
    doc.rect(0, 0, PAGE_WIDTH, 5).fill("#2563EB");

    let y = 20;
    doc.fontSize(22).font("Helvetica-Bold").fillColor("#1E293B")
      .text("Relatório Financeiro", MARGIN, y, { align: "center", width: CONTENT_WIDTH });
    y += 28;

    doc.fontSize(13).font("Helvetica").fillColor("#475569")
      .text(data.entityName, MARGIN, y, { align: "center", width: CONTENT_WIDTH });
    y += 18;

    let periodText = data.period;
    if (data.startDate && data.endDate) {
      const sf = format(new Date(data.startDate), "dd/MM/yyyy", { locale: ptBR });
      const ef = format(new Date(data.endDate), "dd/MM/yyyy", { locale: ptBR });
      periodText = `${data.period} (${sf} até ${ef})`;
    }
    doc.fontSize(9).fillColor("#64748B")
      .text(`Período: ${periodText}`, MARGIN, y, { align: "center", width: CONTENT_WIDTH });
    y += 13;

    const now = new Date();
    const spTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    doc.fontSize(8).fillColor("#94A3B8")
      .text(`Gerado em: ${format(spTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, MARGIN, y, { align: "center", width: CONTENT_WIDTH });
    y += 18;

    drawLine(y, "#2563EB");
    y += 16;

    // ===== RESUMO EXECUTIVO =====
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#1E293B").text("Resumo Executivo", MARGIN, y);
    y += 18;

    const CARD_W = (CONTENT_WIDTH - 16) / 5;
    const CARD_H = 58;
    const cards = [
      { label: "Total Receitas", value: formatBRL(totalIncome / 100), color: "#16A34A", bg: "#F0FDF4", border: "#16A34A", sub: `${incomes.length} lançamentos` },
      { label: "Total Despesas", value: formatBRL(totalExpense / 100), color: "#DC2626", bg: "#FEF2F2", border: "#DC2626", sub: `${expenses.length} lançamentos` },
      { label: "Saldo Líquido", value: `${saldoLiquido >= 0 ? "+" : ""}${formatBRL(saldoLiquido / 100)}`, color: saldoLiquido >= 0 ? "#2563EB" : "#F59E0B", bg: saldoLiquido >= 0 ? "#EFF6FF" : "#FFFBEB", border: saldoLiquido >= 0 ? "#2563EB" : "#F59E0B", sub: "" },
      { label: "Pendente", value: formatBRL(totalPending / 100), color: "#D97706", bg: "#FFFBEB", border: "#D97706", sub: `${data.transactions.filter(t => t.status === "PENDING").length} lançamentos` },
      { label: "Atrasado", value: formatBRL(totalOverdue / 100), color: "#DC2626", bg: "#FEF2F2", border: "#DC2626", sub: `${data.transactions.filter(t => t.status === "OVERDUE").length} lançamentos` },
    ];

    cards.forEach((card, i) => {
      const cx = MARGIN + i * (CARD_W + 4);
      doc.rect(cx, y, CARD_W, CARD_H).fillAndStroke(card.bg, "#E2E8F0");
      doc.rect(cx, y, CARD_W, 3).fill(card.border);
      doc.fontSize(7).font("Helvetica-Bold").fillColor("#64748B")
        .text(card.label.toUpperCase(), cx + 6, y + 8, { width: CARD_W - 12 });
      doc.fontSize(10).font("Helvetica-Bold").fillColor(card.color)
        .text(card.value, cx + 6, y + 22, { width: CARD_W - 12 });
      if (card.sub) {
        doc.fontSize(6).font("Helvetica").fillColor("#94A3B8")
          .text(card.sub, cx + 6, y + 40, { width: CARD_W - 12 });
      }
    });
    y += CARD_H + 24;

    // ===== RECEITAS POR CATEGORIA E STATUS =====
    doc.y = y;
    y = drawCategoryTable("Receitas por Categoria e Status", incomeCatEntries, "#16A34A", y);
    y += 20;

    // ===== DESPESAS POR CATEGORIA E STATUS =====
    doc.y = y;
    y = drawCategoryTable("Despesas por Categoria e Status", expenseCatEntries, "#2563EB", y);
    y += 20;

    // ===== TABELA DE TRANSAÇÕES =====
    y = checkSpace(60);
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#1E293B").text("Transações", MARGIN, y);
    y += 18;

    const T_COL = [60, 195, 80, 75, 55, 50];
    const T_HEADERS = ["Vencimento", "Descrição", "Categoria", "Valor", "Status", "Tipo"];
    const T_ROW_H = 18;
    const T_HEADER_H = 22;

    const drawTransactionHeader = (startY: number): number => {
      let x = MARGIN;
      T_HEADERS.forEach((h, i) => {
        doc.rect(x, startY, T_COL[i], T_HEADER_H).fillAndStroke("#2563EB", "#2563EB");
        doc.fontSize(8).font("Helvetica-Bold").fillColor("#FFFFFF")
          .text(h, x + 4, startY + 7, { width: T_COL[i] - 8, align: "left" });
        x += T_COL[i];
      });
      return startY + T_HEADER_H;
    };

    y = drawTransactionHeader(y);

    data.transactions.forEach((t, idx) => {
      if (y + T_ROW_H > FOOTER_Y - 10) {
        addFooter();
        doc.addPage();
        y = MARGIN;
        y = drawTransactionHeader(y);
      }
      const bg = idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
      let x = MARGIN;
      const isIncome = t.type === "INCOME";
      const cells = [
        t.dueDate ? format(new Date(t.dueDate), "dd/MM/yyyy") : "",
        (t.description || "").substring(0, 38),
        (t.categoryName || "Sem cat.").substring(0, 16),
        formatBRL(t.amount / 100),
        statusLabel(t.status),
        isIncome ? "Receita" : "Despesa",
      ];
      cells.forEach((cell, ci) => {
        doc.rect(x, y, T_COL[ci], T_ROW_H).fillAndStroke(bg, "#E2E8F0");
        const color = ci === 3 ? (isIncome ? "#16A34A" : "#DC2626") : "#1E293B";
        doc.fontSize(7).font(ci === 3 ? "Helvetica-Bold" : "Helvetica").fillColor(color)
          .text(cell, x + 4, y + 5, { width: T_COL[ci] - 8, align: "left" });
        x += T_COL[ci];
      });
      y += T_ROW_H;
    });

    y += 24;

    // ===== DRE SIMPLIFICADO =====
    y = checkSpace(200);
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#1E293B").text("DRE — Demonstração do Resultado do Exercício", MARGIN, y);
    y += 8;
    doc.fontSize(8).font("Helvetica").fillColor("#64748B").text(`Período: ${periodText}`, MARGIN, y);
    y += 18;

    const DRE_COL1 = CONTENT_WIDTH * 0.65;
    const DRE_COL2 = CONTENT_WIDTH * 0.35;
    const DRE_ROW_H = 22;

    // Cabeçalho DRE
    doc.rect(MARGIN, y, DRE_COL1, DRE_ROW_H).fillAndStroke("#1E293B", "#1E293B");
    doc.rect(MARGIN + DRE_COL1, y, DRE_COL2, DRE_ROW_H).fillAndStroke("#1E293B", "#1E293B");
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF")
      .text("Descrição", MARGIN + 8, y + 7, { width: DRE_COL1 - 16 });
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF")
      .text("Valor", MARGIN + DRE_COL1 + 8, y + 7, { width: DRE_COL2 - 16, align: "right" });
    y += DRE_ROW_H;

    const dreRow = (label: string, value: number, indent: number, bold: boolean, bg: string, valueColor?: string) => {
      y = checkSpace(DRE_ROW_H);
      doc.rect(MARGIN, y, DRE_COL1, DRE_ROW_H).fillAndStroke(bg, "#E2E8F0");
      doc.rect(MARGIN + DRE_COL1, y, DRE_COL2, DRE_ROW_H).fillAndStroke(bg, "#E2E8F0");
      const font = bold ? "Helvetica-Bold" : "Helvetica";
      const textColor = "#1E293B";
      doc.fontSize(bold ? 9 : 8).font(font).fillColor(textColor)
        .text(label, MARGIN + 8 + indent, y + 7, { width: DRE_COL1 - 16 - indent });
      const vColor = valueColor || (value >= 0 ? "#16A34A" : "#DC2626");
      doc.fontSize(bold ? 9 : 8).font(font).fillColor(vColor)
        .text(formatBRL(value / 100), MARGIN + DRE_COL1 + 8, y + 7, { width: DRE_COL2 - 16, align: "right" });
      y += DRE_ROW_H;
    };

    const dreLabel = (label: string, bg: string) => {
      y = checkSpace(DRE_ROW_H - 4);
      doc.rect(MARGIN, y, CONTENT_WIDTH, DRE_ROW_H - 4).fillAndStroke(bg, bg);
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#475569")
        .text(label.toUpperCase(), MARGIN + 8, y + 5, { width: CONTENT_WIDTH - 16 });
      y += DRE_ROW_H - 4;
    };

    // Receitas
    dreLabel("Receitas", "#F0FDF4");
    incomes.length > 0
      ? Object.entries(incomeCatMap).sort(([, a], [, b]) => (b.paid + b.pending + b.overdue) - (a.paid + a.pending + a.overdue)).forEach(([cat, v]) => {
          dreRow(cat, v.paid + v.pending + v.overdue, 8, false, "#FFFFFF", "#16A34A");
        })
      : dreRow("Sem receitas no período", 0, 8, false, "#FFFFFF", "#94A3B8");

    dreRow("(+) Total de Receitas", totalIncome, 0, true, "#F0FDF4", "#16A34A");

    y += 4;

    // Despesas
    dreLabel("Despesas", "#FEF2F2");
    const expCatMapDRE: Record<string, number> = {};
    expenses.forEach(t => { expCatMapDRE[t.categoryName || "Sem Categoria"] = (expCatMapDRE[t.categoryName || "Sem Categoria"] || 0) + t.amount; });
    Object.entries(expCatMapDRE).sort(([, a], [, b]) => b - a).forEach(([cat, val]) => {
      dreRow(`(-) ${cat}`, -val, 8, false, "#FFFFFF", "#DC2626");
    });
    if (expenses.length === 0) dreRow("Sem despesas no período", 0, 8, false, "#FFFFFF", "#94A3B8");

    dreRow("(-) Total de Despesas", -totalExpense, 0, true, "#FEF2F2", "#DC2626");

    y += 8;

    // Resultado
    y = checkSpace(DRE_ROW_H + 4);
    const resultBg = saldoLiquido >= 0 ? "#EFF6FF" : "#FFFBEB";
    const resultColor = saldoLiquido >= 0 ? "#2563EB" : "#F59E0B";
    doc.rect(MARGIN, y, CONTENT_WIDTH, DRE_ROW_H + 4).fillAndStroke(resultBg, resultColor);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 3).fill(resultColor);
    doc.fontSize(11).font("Helvetica-Bold").fillColor(resultColor)
      .text("= RESULTADO LÍQUIDO DO PERÍODO", MARGIN + 8, y + 8, { width: DRE_COL1 - 16 });
    doc.fontSize(11).font("Helvetica-Bold").fillColor(resultColor)
      .text(`${saldoLiquido >= 0 ? "+" : ""}${formatBRL(saldoLiquido / 100)}`, MARGIN + DRE_COL1 + 8, y + 8, { width: DRE_COL2 - 16, align: "right" });
    y += DRE_ROW_H + 4;

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
