import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ========== EXCEL EXPORT ==========

export async function generateTransactionsExcel(data: {
  entityName: string;
  transactions: any[];
  summary: any;
  period: string;
}) {
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
      amount: transaction.amount / 100,
      status:
        transaction.status === "PAID"
          ? "Pago"
          : transaction.status === "PENDING"
          ? "Pendente"
          : "Vencido",
      dueDate: transaction.dueDate ? format(new Date(transaction.dueDate), "dd/MM/yyyy") : "",
      paidDate: transaction.paidDate ? format(new Date(transaction.paidDate), "dd/MM/yyyy") : "",
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
  return buffer;
}

// ========== PDF EXPORT ==========

export function generateTransactionsPDF(data: {
  entityName: string;
  transactions: any[];
  summary: any;
  period: string;
  cashFlowData?: any[];
  categoryData?: any[];
  categoryExpenses?: any[];
  upcomingTransactions?: any[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Cabeçalho
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor("#2563EB")
      .text("Relatório Financeiro", { align: "center" });

    doc
      .fontSize(14)
      .font("Helvetica")
      .fillColor("#000000")
      .text(data.entityName, { align: "center" });

    doc
      .fontSize(10)
      .fillColor("#6B7280")
      .text(`Período: ${data.period}`, { align: "center" });

    doc
      .fontSize(8)
      .text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, {
        align: "center",
      });

    doc.moveDown(2);

    // Linha separadora
    doc.strokeColor("#E5E7EB").lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();

    doc.moveDown();

    // Resumo Executivo
    doc.fontSize(14).font("Helvetica-Bold").fillColor("#000000").text("Resumo Executivo");

    doc.moveDown(0.5);

    const summaryY = doc.y;
    
    // Box de Receitas
    doc.rect(50, summaryY, 160, 60).fillAndStroke("#D1FAE5", "#16A34A");
    doc.fontSize(10).fillColor("#16A34A").text("Total de Receitas", 60, summaryY + 15);
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(`R$ ${(data.summary.totalIncome / 100).toFixed(2)}`, 60, summaryY + 35);

    // Box de Despesas
    doc.rect(220, summaryY, 160, 60).fillAndStroke("#FECACA", "#DC2626");
    doc.fontSize(10).fillColor("#DC2626").text("Total de Despesas", 230, summaryY + 15);
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(`R$ ${(data.summary.totalExpenses / 100).toFixed(2)}`, 230, summaryY + 35);

    // Box de Saldo
    const balance = (data.summary.totalIncome - data.summary.totalExpenses) / 100;
    const balanceColor = balance >= 0 ? "#16A34A" : "#DC2626";
    const balanceBg = balance >= 0 ? "#D1FAE5" : "#FECACA";

    doc.rect(390, summaryY, 160, 60).fillAndStroke(balanceBg, balanceColor);
    doc.fontSize(10).fillColor(balanceColor).text("Saldo", 400, summaryY + 15);
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(`R$ ${balance.toFixed(2)}`, 400, summaryY + 35);

    doc.y = summaryY + 80;
    doc.moveDown(2);

    // Seção de Transações a Vencer
    if (data.upcomingTransactions && data.upcomingTransactions.length > 0) {
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#000000").text("Transações a Vencer");
      doc.fontSize(10).font("Helvetica").fillColor("#6B7280").text("Próximos 7 dias");
      doc.moveDown(0.5);

      const upcomingTableTop = doc.y;
      const upcomingColWidths = [200, 100, 80, 100];
      const upcomingHeaders = ["Descrição", "Categoria", "Vencimento", "Valor"];

      let upcomingXPos = 50;
      upcomingHeaders.forEach((header, i) => {
        doc
          .fontSize(9)
          .font("Helvetica-Bold")
          .fillColor("#FFFFFF")
          .rect(upcomingXPos, upcomingTableTop, upcomingColWidths[i], 20)
          .fillAndStroke("#F59E0B", "#F59E0B")
          .fillColor("#FFFFFF")
          .text(header, upcomingXPos + 5, upcomingTableTop + 6, { width: upcomingColWidths[i] - 10 });
        upcomingXPos += upcomingColWidths[i];
      });

      let upcomingRowY = upcomingTableTop + 20;

      data.upcomingTransactions.slice(0, 5).forEach((transaction: any, index: number) => {
        const bgColor = "#FEF3C7"; // Amarelo claro para destacar

        upcomingXPos = 50;
        const daysText = transaction.daysUntilDue === 0 
          ? "Hoje" 
          : transaction.daysUntilDue === 1 
          ? "Amanhã" 
          : `${transaction.daysUntilDue} dias`;
        
        const rowData = [
          transaction.description.substring(0, 35),
          (transaction.categoryName || "Sem Categoria").substring(0, 15),
          daysText,
          `R$ ${(transaction.amount / 100).toFixed(2)}`,
        ];

        rowData.forEach((cellData, i) => {
          doc
            .rect(upcomingXPos, upcomingRowY, upcomingColWidths[i], 20)
            .fillAndStroke(bgColor, "#E5E7EB")
            .fontSize(8)
            .font("Helvetica")
            .fillColor("#000000")
            .text(cellData, upcomingXPos + 5, upcomingRowY + 6, { width: upcomingColWidths[i] - 10 });
          upcomingXPos += upcomingColWidths[i];
        });

        upcomingRowY += 20;
      });

      doc.y = upcomingRowY;
      doc.moveDown(2);
    }

    // Tabela de Transações
    doc.fontSize(14).font("Helvetica-Bold").fillColor("#000000").text("Transações");

    doc.moveDown();

    // Cabeçalho da tabela
    const tableTop = doc.y;
    const colWidths = [70, 180, 60, 80, 60, 70];
    const headers = ["Data", "Descrição", "Tipo", "Valor", "Status", "Vencimento"];

    let xPos = 50;
    headers.forEach((header, i) => {
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor("#FFFFFF")
        .rect(xPos, tableTop, colWidths[i], 20)
        .fillAndStroke("#2563EB", "#2563EB")
        .fillColor("#FFFFFF")
        .text(header, xPos + 5, tableTop + 6, { width: colWidths[i] - 10 });
      xPos += colWidths[i];
    });

    doc.y = tableTop + 25;

    // Linhas da tabela
    let rowY = doc.y;
    data.transactions.slice(0, 20).forEach((transaction, index) => {
      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
      }

      const bgColor = index % 2 === 0 ? "#F9FAFB" : "#FFFFFF";

      xPos = 50;
      const rowData = [
        transaction.dueDate ? format(new Date(transaction.dueDate), "dd/MM/yyyy") : "",
        transaction.description.substring(0, 30),
        transaction.type === "INCOME" ? "Receita" : "Despesa",
        `R$ ${(transaction.amount / 100).toFixed(2)}`,
        transaction.status === "PAID" ? "Pago" : transaction.status === "PENDING" ? "Pendente" : "Vencido",
        transaction.dueDate ? format(new Date(transaction.dueDate), "dd/MM/yyyy") : "",
      ];

      rowData.forEach((data, i) => {
        doc
          .rect(xPos, rowY, colWidths[i], 20)
          .fillAndStroke(bgColor, "#E5E7EB")
          .fontSize(8)
          .font("Helvetica")
          .fillColor("#000000")
          .text(data, xPos + 5, rowY + 6, { width: colWidths[i] - 10 });
        xPos += colWidths[i];
      });

      rowY += 20;
    });

    // Rodapé da primeira página
    doc
      .fontSize(8)
      .fillColor("#6B7280")
      .text(
        "Sistema de Gestão Financeira - Relatório gerado automaticamente",
        50,
        750,
        { align: "center" }
      );

    // ========== SEGUNDA PÁGINA: GRÁFICOS ==========
    if (data.categoryExpenses && data.categoryExpenses.length > 0) {
      doc.addPage();

      // Título da página
      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .fillColor("#2563EB")
        .text("Análise Visual", { align: "center" });

      doc.moveDown(2);

      // Tabela de Despesas por Categoria
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#000000").text("Despesas por Categoria e Status");
      doc.moveDown();

      const categoryTableTop = doc.y;
      const categoryColWidths = [150, 80, 80, 80, 90];
      const categoryHeaders = ["Categoria", "Pago", "Pendente", "Vencido", "Total"];

      let categoryXPos = 50;
      categoryHeaders.forEach((header, i) => {
        doc
          .fontSize(9)
          .font("Helvetica-Bold")
          .fillColor("#FFFFFF")
          .rect(categoryXPos, categoryTableTop, categoryColWidths[i], 25)
          .fillAndStroke("#2563EB", "#2563EB")
          .fillColor("#FFFFFF")
          .text(header, categoryXPos + 5, categoryTableTop + 8, { width: categoryColWidths[i] - 10 });
        categoryXPos += categoryColWidths[i];
      });

      let categoryRowY = categoryTableTop + 25;

      data.categoryExpenses.forEach((cat: any, index: number) => {
        const bgColor = index % 2 === 0 ? "#F9FAFB" : "#FFFFFF";

        categoryXPos = 50;
        const rowData = [
          cat.categoryName || "Sem Categoria",
          `R$ ${(cat.paid / 100).toFixed(2)}`,
          `R$ ${(cat.pending / 100).toFixed(2)}`,
          `R$ ${(cat.overdue / 100).toFixed(2)}`,
          `R$ ${(cat.total / 100).toFixed(2)}`,
        ];

        rowData.forEach((cellData, i) => {
          doc
            .rect(categoryXPos, categoryRowY, categoryColWidths[i], 22)
            .fillAndStroke(bgColor, "#E5E7EB")
            .fontSize(8)
            .font("Helvetica")
            .fillColor("#000000")
            .text(cellData, categoryXPos + 5, categoryRowY + 7, { width: categoryColWidths[i] - 10 });
          categoryXPos += categoryColWidths[i];
        });

        categoryRowY += 22;
      });

      // Linha de total
      const totalPaid = data.categoryExpenses.reduce((sum: number, cat: any) => sum + cat.paid, 0);
      const totalPending = data.categoryExpenses.reduce((sum: number, cat: any) => sum + cat.pending, 0);
      const totalOverdue = data.categoryExpenses.reduce((sum: number, cat: any) => sum + cat.overdue, 0);
      const totalAll = data.categoryExpenses.reduce((sum: number, cat: any) => sum + cat.total, 0);

      categoryXPos = 50;
      const totalRowData = [
        "Total Geral",
        `R$ ${(totalPaid / 100).toFixed(2)}`,
        `R$ ${(totalPending / 100).toFixed(2)}`,
        `R$ ${(totalOverdue / 100).toFixed(2)}`,
        `R$ ${(totalAll / 100).toFixed(2)}`,
      ];

      totalRowData.forEach((cellData, i) => {
        doc
          .rect(categoryXPos, categoryRowY, categoryColWidths[i], 25)
          .fillAndStroke("#EFF6FF", "#2563EB")
          .fontSize(9)
          .font("Helvetica-Bold")
          .fillColor("#000000")
          .text(cellData, categoryXPos + 5, categoryRowY + 8, { width: categoryColWidths[i] - 10 });
        categoryXPos += categoryColWidths[i];
      });

      doc.y = categoryRowY + 40;

      // Gráfico de Pizza (Distribuição por Categoria)
      if (data.categoryData && data.categoryData.length > 0) {
        doc.fontSize(14).font("Helvetica-Bold").fillColor("#000000").text("Distribuição por Categoria");
        doc.moveDown();

        const pieX = 150;
        const pieY = doc.y + 80;
        const pieRadius = 70;

        const total = data.categoryData.reduce((sum: number, cat: any) => sum + cat.value, 0);
        let startAngle = -Math.PI / 2; // Começar no topo

        const COLORS = ["#6B7280", "#EF4444", "#10B981", "#06B6D4", "#F59E0B", "#8B5CF6"];

        data.categoryData.forEach((cat: any, index: number) => {
          const sliceAngle = (cat.value / total) * 2 * Math.PI;
          const endAngle = startAngle + sliceAngle;

          // Desenhar fatia
          doc.save();
          doc
            .moveTo(pieX, pieY)
            .lineTo(
              pieX + pieRadius * Math.cos(startAngle),
              pieY + pieRadius * Math.sin(startAngle)
            )
            .arc(pieX, pieY, pieRadius, startAngle, endAngle)
            .lineTo(pieX, pieY)
            .fillAndStroke(COLORS[index % COLORS.length], "#FFFFFF");
          doc.restore();

          startAngle = endAngle;
        });

        // Legenda
        let legendY = pieY - 70;
        const legendX = 350;

        data.categoryData.forEach((cat: any, index: number) => {
          // Quadrado de cor
          doc.rect(legendX, legendY, 12, 12).fillAndStroke(COLORS[index % COLORS.length], COLORS[index % COLORS.length]);

          // Texto
          const percentage = ((cat.value / total) * 100).toFixed(0);
          doc
            .fontSize(9)
            .font("Helvetica")
            .fillColor("#000000")
            .text(`${cat.name} ${percentage}%`, legendX + 18, legendY + 2);

          legendY += 18;
        });
      }

      // Rodapé da segunda página
      doc
        .fontSize(8)
        .fillColor("#6B7280")
        .text(
          "Sistema de Gestão Financeira - Relatório gerado automaticamente",
          50,
          750,
          { align: "center" }
        );
    }

    doc.end();
  });
}
