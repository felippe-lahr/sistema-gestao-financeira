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
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const M = 40;
    const CW = PAGE_W - M * 2;   // 515.28
    // IMPORTANTE: PDFKit com margin:40 tem limite interno em PAGE_H - 40 = 801.89
    // Qualquer text() com y > 801.89 cria página automática (gerando páginas em branco)
    // Por isso o rodapé deve ficar em y <= 801.89
    const FOOTER_Y = PAGE_H - M - 12; // 789.89 - seguro dentro do limite
    const CONTENT_BOTTOM = FOOTER_Y - 10; // 779.89 - espaço antes do rodapé

    const doc = new PDFDocument({ margin: M, size: "A4", autoFirstPage: true });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ─── HELPERS ────────────────────────────────────────────────────────────

    // Escreve rodapé na posição fixa sem alterar doc.y
    const footer = () => {
      const savedY = doc.y;
      doc.fontSize(7).font("Helvetica").fillColor("#94A3B8")
        .text(
          "UnifiquePro · Relatório Financeiro · gerado automaticamente",
          M, FOOTER_Y,
          { align: "center", width: CW, lineBreak: false }
        );
      doc.y = savedY;
    };

    // Garante espaço; se não couber, fecha página e abre nova
    const need = (h: number): number => {
      if (doc.y + h > CONTENT_BOTTOM) {
        footer();
        doc.addPage();
        doc.y = M;
      }
      return doc.y;
    };

    const hline = (y: number, color = "#CBD5E1", lw = 0.5) => {
      doc.save().strokeColor(color).lineWidth(lw)
        .moveTo(M, y).lineTo(PAGE_W - M, y).stroke().restore();
    };

    // Título de seção
    const secTitle = (text: string) => {
      need(30);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1E293B")
        .text(text, M, doc.y, { lineBreak: false });
      doc.y += 22;
    };

    // Desenha uma célula de tabela com texto truncado (sem quebra de linha)
    const cell = (
      text: string, x: number, y: number, w: number, h: number,
      bg: string, border: string, textColor: string, bold: boolean, fontSize = 8
    ) => {
      doc.rect(x, y, w, h).fillAndStroke(bg, border);
      // Truncar texto manualmente para evitar quebra de linha
      const maxChars = Math.floor((w - 10) / (fontSize * 0.52)); // estimativa de chars
      const displayText = text.length > maxChars ? text.substring(0, maxChars - 1) + "…" : text;
      doc.fontSize(fontSize)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fillColor(textColor)
        .text(displayText, x + 5, y + (h - fontSize) / 2 + 1, {
          width: w - 10,
          lineBreak: false,
        });
    };

    // Desenha uma linha de tabela; retorna novo Y
    const tRow = (
      cells: string[], widths: number[], rh: number,
      bg: string, colors: string[], bold = false, border = "#CBD5E1",
      fontSize = 8
    ): number => {
      need(rh);
      const y = doc.y;
      let x = M;
      cells.forEach((text, i) => {
        cell(text, x, y, widths[i], rh, bg, border, colors[i] || "#1E293B", bold, fontSize);
        x += widths[i];
      });
      doc.y = y + rh;
      return doc.y;
    };

    // Cabeçalho de tabela
    const tHead = (
      headers: string[], widths: number[], color: string, hh = 26
    ): number => {
      need(hh + 20);
      const y = doc.y;
      let x = M;
      headers.forEach((h, i) => {
        doc.rect(x, y, widths[i], hh).fillAndStroke(color, color);
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF")
          .text(h, x + 5, y + (hh - 9) / 2, { width: widths[i] - 10, lineBreak: false });
        x += widths[i];
      });
      doc.y = y + hh;
      return doc.y;
    };

    // ─── DADOS ──────────────────────────────────────────────────────────────

    const incomes  = data.transactions.filter(t => t.type === "INCOME");
    const expenses = data.transactions.filter(t => t.type === "EXPENSE");
    const totInc   = incomes.reduce((s, t) => s + t.amount, 0);
    const totExp   = expenses.reduce((s, t) => s + t.amount, 0);
    const saldo    = totInc - totExp;
    const totPend  = data.transactions.filter(t => t.status === "PENDING").reduce((s, t) => s + t.amount, 0);
    const totOver  = data.transactions.filter(t => t.status === "OVERDUE").reduce((s, t) => s + t.amount, 0);

    const incCatMap: Record<string, { paid: number; pending: number; overdue: number }> = {};
    incomes.forEach(t => {
      const c = t.categoryName || "Sem Categoria";
      if (!incCatMap[c]) incCatMap[c] = { paid: 0, pending: 0, overdue: 0 };
      if (t.status === "PAID")         incCatMap[c].paid    += t.amount;
      else if (t.status === "PENDING") incCatMap[c].pending += t.amount;
      else                             incCatMap[c].overdue += t.amount;
    });
    const incCatList = Object.entries(incCatMap)
      .map(([n, v]) => ({ n, ...v, tot: v.paid + v.pending + v.overdue }))
      .sort((a, b) => b.tot - a.tot);

    let expCatList: Array<{ n: string; paid: number; pending: number; overdue: number; tot: number }>;
    if (data.categoryExpenses && data.categoryExpenses.length > 0) {
      expCatList = data.categoryExpenses.map((c: any) => ({
        n: c.categoryName, paid: c.paid, pending: c.pending, overdue: c.overdue, tot: c.total,
      }));
    } else {
      const expCatMap: Record<string, { paid: number; pending: number; overdue: number }> = {};
      expenses.forEach(t => {
        const c = t.categoryName || "Sem Categoria";
        if (!expCatMap[c]) expCatMap[c] = { paid: 0, pending: 0, overdue: 0 };
        if (t.status === "PAID")         expCatMap[c].paid    += t.amount;
        else if (t.status === "PENDING") expCatMap[c].pending += t.amount;
        else                             expCatMap[c].overdue += t.amount;
      });
      expCatList = Object.entries(expCatMap)
        .map(([n, v]) => ({ n, ...v, tot: v.paid + v.pending + v.overdue }))
        .sort((a, b) => b.tot - a.tot);
    }

    const stLabel = (s: string) => ({ PAID: "Pago", PENDING: "Pendente", OVERDUE: "Atrasado" }[s] || s);

    let periodText = data.period;
    if (data.startDate && data.endDate) {
      const sf = format(new Date(data.startDate), "dd/MM/yyyy", { locale: ptBR });
      const ef = format(new Date(data.endDate), "dd/MM/yyyy", { locale: ptBR });
      periodText = `${data.period} (${sf} até ${ef})`;
    }

    // ─── CABEÇALHO ──────────────────────────────────────────────────────────

    doc.rect(0, 0, PAGE_W, 6).fill("#2563EB");
    doc.y = 22;

    doc.fontSize(22).font("Helvetica-Bold").fillColor("#1E293B")
      .text("Relatório Financeiro", M, doc.y, { align: "center", width: CW, lineBreak: false });
    doc.y += 30;

    doc.fontSize(13).font("Helvetica").fillColor("#475569")
      .text(data.entityName, M, doc.y, { align: "center", width: CW, lineBreak: false });
    doc.y += 20;

    doc.fontSize(9).fillColor("#64748B")
      .text(`Período: ${periodText}`, M, doc.y, { align: "center", width: CW, lineBreak: false });
    doc.y += 14;

    const spTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    doc.fontSize(8).fillColor("#94A3B8")
      .text(`Gerado em: ${format(spTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
            M, doc.y, { align: "center", width: CW, lineBreak: false });
    doc.y += 18;

    hline(doc.y, "#2563EB", 1);
    doc.y += 22;

    // ─── RESUMO EXECUTIVO ────────────────────────────────────────────────────

    secTitle("Resumo Executivo");
    doc.y += 4;

    const CARD_W = Math.floor((CW - 16) / 5);
    const CARD_H = 64;
    const cards = [
      { label: "TOTAL RECEITAS", val: formatBRL(totInc / 100), color: "#16A34A", bg: "#F0FDF4", bdr: "#16A34A", sub: `${incomes.length} lançamentos` },
      { label: "TOTAL DESPESAS", val: formatBRL(totExp / 100), color: "#DC2626", bg: "#FEF2F2", bdr: "#DC2626", sub: `${expenses.length} lançamentos` },
      { label: "SALDO LÍQUIDO",  val: `${saldo >= 0 ? "+" : ""}${formatBRL(saldo / 100)}`,
        color: saldo >= 0 ? "#2563EB" : "#D97706",
        bg:    saldo >= 0 ? "#EFF6FF" : "#FFFBEB",
        bdr:   saldo >= 0 ? "#2563EB" : "#D97706", sub: "" },
      { label: "PENDENTE",  val: formatBRL(totPend / 100), color: "#D97706", bg: "#FFFBEB", bdr: "#D97706",
        sub: `${data.transactions.filter(t => t.status === "PENDING").length} lançamentos` },
      { label: "ATRASADO",  val: formatBRL(totOver / 100), color: "#DC2626", bg: "#FEF2F2", bdr: "#DC2626",
        sub: `${data.transactions.filter(t => t.status === "OVERDUE").length} lançamentos` },
    ];

    const cy = doc.y;
    cards.forEach((card, i) => {
      const cx = M + i * (CARD_W + 4);
      doc.rect(cx, cy, CARD_W, CARD_H).fillAndStroke(card.bg, "#E2E8F0");
      doc.rect(cx, cy, CARD_W, 3).fill(card.bdr);
      doc.fontSize(7).font("Helvetica-Bold").fillColor("#64748B")
        .text(card.label, cx + 6, cy + 10, { width: CARD_W - 12, lineBreak: false });
      doc.fontSize(10).font("Helvetica-Bold").fillColor(card.color)
        .text(card.val, cx + 6, cy + 26, { width: CARD_W - 12, lineBreak: false });
      if (card.sub) {
        doc.fontSize(6.5).font("Helvetica").fillColor("#94A3B8")
          .text(card.sub, cx + 6, cy + 46, { width: CARD_W - 12, lineBreak: false });
      }
    });
    doc.y = cy + CARD_H + 32;

    // ─── TABELA CATEGORIA/STATUS ─────────────────────────────────────────────
    // CW = 515.28
    // Categoria: 175, Pago: 82, Pendente: 82, Vencido: 82, Total: 94.28
    // Total precisa de ~75px para "R$ 9.000,00" - damos 94px
    const C_CAT  = 175;
    const C_VAL  = 82;
    const C_TOT  = Math.round(CW - C_CAT - C_VAL * 3); // ~94
    const CAT_COLS = [C_CAT, C_VAL, C_VAL, C_VAL, C_TOT];
    const CAT_RH   = 24;
    const CAT_HH   = 28;

    const drawCatTable = (
      title: string,
      list: Array<{ n: string; paid: number; pending: number; overdue: number; tot: number }>,
      color: string
    ) => {
      secTitle(title);
      doc.y += 4;
      tHead(["Categoria", "Pago", "Pendente", "Vencido", "Total"], CAT_COLS, color, CAT_HH);

      if (list.length === 0) {
        tRow(["Nenhum lançamento no período", "", "", "", ""],
             CAT_COLS, CAT_RH, "#F9FAFB", ["#94A3B8"], false, "#CBD5E1");
      } else {
        list.forEach((cat, idx) => {
          tRow(
            [cat.n, formatBRL(cat.paid/100), formatBRL(cat.pending/100), formatBRL(cat.overdue/100), formatBRL(cat.tot/100)],
            CAT_COLS, CAT_RH,
            idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
            ["#1E293B", "#16A34A", "#D97706", "#DC2626", "#1E293B"],
            false, "#CBD5E1"
          );
        });
      }

      // Total Geral
      const tP  = list.reduce((s, c) => s + c.paid, 0);
      const tPn = list.reduce((s, c) => s + c.pending, 0);
      const tO  = list.reduce((s, c) => s + c.overdue, 0);
      const tT  = list.reduce((s, c) => s + c.tot, 0);
      tRow(
        ["Total Geral", formatBRL(tP/100), formatBRL(tPn/100), formatBRL(tO/100), formatBRL(tT/100)],
        CAT_COLS, CAT_RH, "#EFF6FF",
        ["#1E293B", "#16A34A", "#D97706", "#DC2626", "#1E293B"],
        true, color
      );
      doc.y += 28;
    };

    drawCatTable("Receitas por Categoria e Status", incCatList, "#16A34A");
    drawCatTable("Despesas por Categoria e Status", expCatList, "#2563EB");

    // ─── TABELA DE TRANSAÇÕES ────────────────────────────────────────────────
    // CW = 515.28
    // Data: 65, Descrição: 170, Categoria: 88, Tipo: 52, Valor: 88, Status: restante ~52
    const TX_DATE = 65;
    const TX_DESC = 170;
    const TX_CAT  = 88;
    const TX_TYPE = 52;
    const TX_VAL  = 88;
    const TX_STAT = Math.round(CW - TX_DATE - TX_DESC - TX_CAT - TX_TYPE - TX_VAL); // ~52
    const TX_COLS = [TX_DATE, TX_DESC, TX_CAT, TX_TYPE, TX_VAL, TX_STAT];
    const TX_RH   = 20;
    const TX_HH   = 24;

    secTitle(`Transações (${data.transactions.length})`);
    doc.y += 4;

    const drawTxHead = () =>
      tHead(["Vencimento", "Descrição", "Categoria", "Tipo", "Valor", "Status"], TX_COLS, "#2563EB", TX_HH);

    drawTxHead();

    data.transactions.forEach((t, idx) => {
      if (doc.y + TX_RH > CONTENT_BOTTOM) {
        footer();
        doc.addPage();
        doc.y = M;
        drawTxHead();
      }
      const isInc = t.type === "INCOME";
      tRow(
        [
          t.dueDate ? format(new Date(t.dueDate), "dd/MM/yyyy") : "—",
          (t.description || "").substring(0, 42),
          (t.categoryName || "Sem cat.").substring(0, 18),
          isInc ? "Receita" : "Despesa",
          formatBRL(t.amount / 100),
          stLabel(t.status),
        ],
        TX_COLS, TX_RH,
        idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
        ["#475569", "#1E293B", "#475569", isInc ? "#16A34A" : "#DC2626", isInc ? "#16A34A" : "#DC2626", "#475569"],
        false, "#CBD5E1"
      );
    });

    doc.y += 32;

    // ─── DRE ────────────────────────────────────────────────────────────────

    need(60);
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#1E293B")
      .text("DRE — Demonstração do Resultado do Exercício", M, doc.y, { lineBreak: false });
    doc.y += 18;
    doc.fontSize(8.5).font("Helvetica").fillColor("#64748B")
      .text(`Período: ${periodText}`, M, doc.y, { lineBreak: false });
    doc.y += 18;

    const DC1 = Math.round(CW * 0.65);
    const DC2 = CW - DC1;
    const DRH = 22;
    const DSH = 18;

    // Cabeçalho DRE
    need(DRH);
    let dy = doc.y;
    doc.rect(M, dy, DC1, DRH).fillAndStroke("#1E293B", "#1E293B");
    doc.rect(M + DC1, dy, DC2, DRH).fillAndStroke("#1E293B", "#1E293B");
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF")
      .text("Descrição", M + 8, dy + 7, { width: DC1 - 16, lineBreak: false });
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF")
      .text("Valor", M + DC1 + 8, dy + 7, { width: DC2 - 16, align: "right", lineBreak: false });
    doc.y = dy + DRH;

    const dreSection = (label: string, bg: string) => {
      need(DSH);
      dy = doc.y;
      doc.rect(M, dy, CW, DSH).fillAndStroke(bg, bg);
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#475569")
        .text(label, M + 8, dy + 5, { width: CW - 16, lineBreak: false });
      doc.y = dy + DSH;
    };

    const dreRow = (label: string, value: number, indent: number, bold: boolean, bg: string, vc: string) => {
      need(DRH);
      dy = doc.y;
      doc.rect(M, dy, DC1, DRH).fillAndStroke(bg, "#CBD5E1");
      doc.rect(M + DC1, dy, DC2, DRH).fillAndStroke(bg, "#CBD5E1");
      const fs = bold ? 9 : 8;
      const fn = bold ? "Helvetica-Bold" : "Helvetica";
      const maxChars = Math.floor((DC1 - 16 - indent) / (fs * 0.52));
      const displayLabel = label.length > maxChars ? label.substring(0, maxChars - 1) + "…" : label;
      doc.fontSize(fs).font(fn).fillColor("#1E293B")
        .text(displayLabel, M + 8 + indent, dy + 7, { width: DC1 - 16 - indent, lineBreak: false });
      doc.fontSize(fs).font(fn).fillColor(vc)
        .text(formatBRL(value / 100), M + DC1 + 8, dy + 7, { width: DC2 - 16, align: "right", lineBreak: false });
      doc.y = dy + DRH;
    };

    // Receitas
    dreSection("RECEITAS", "#F0FDF4");
    if (incCatList.length > 0) {
      incCatList.forEach(c => dreRow(c.n, c.tot, 12, false, "#FFFFFF", "#16A34A"));
    } else {
      dreRow("Sem receitas no período", 0, 12, false, "#FFFFFF", "#94A3B8");
    }
    dreRow("(+) Total de Receitas", totInc, 0, true, "#F0FDF4", "#16A34A");
    doc.y += 6;

    // Despesas
    dreSection("DESPESAS", "#FEF2F2");
    if (expCatList.length > 0) {
      expCatList.forEach(c => dreRow(`(-) ${c.n}`, c.tot, 12, false, "#FFFFFF", "#DC2626"));
    } else {
      dreRow("Sem despesas no período", 0, 12, false, "#FFFFFF", "#94A3B8");
    }
    dreRow("(-) Total de Despesas", totExp, 0, true, "#FEF2F2", "#DC2626");
    doc.y += 10;

    // Resultado Líquido
    need(DRH + 8);
    dy = doc.y;
    const rBg  = saldo >= 0 ? "#EFF6FF" : "#FFFBEB";
    const rCol = saldo >= 0 ? "#2563EB" : "#D97706";
    doc.rect(M, dy, CW, DRH + 8).fillAndStroke(rBg, rCol);
    doc.rect(M, dy, CW, 3).fill(rCol);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(rCol)
      .text("= RESULTADO LÍQUIDO DO PERÍODO", M + 10, dy + 10, { width: DC1 - 20, lineBreak: false });
    doc.fontSize(10).font("Helvetica-Bold").fillColor(rCol)
      .text(`${saldo >= 0 ? "+" : ""}${formatBRL(saldo / 100)}`, M + DC1 + 8, dy + 10, { width: DC2 - 16, align: "right", lineBreak: false });
    doc.y = dy + DRH + 8;

    // ─── RODAPÉ FINAL ────────────────────────────────────────────────────────
    footer();

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
