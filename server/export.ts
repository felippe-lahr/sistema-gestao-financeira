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
  return buffer;
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

    // Formatar período com datas específicas
    let periodText = data.period;
    if (data.startDate && data.endDate) {
      const startFormatted = format(new Date(data.startDate), "dd/MM/yyyy", { locale: ptBR });
      const endFormatted = format(new Date(data.endDate), "dd/MM/yyyy", { locale: ptBR });
      periodText = `${data.period} (${startFormatted} até ${endFormatted})`;
    } else if (data.startDate) {
      const startFormatted = format(new Date(data.startDate), "dd/MM/yyyy", { locale: ptBR });
      periodText = `${data.period} (a partir de ${startFormatted})`;
    } else if (data.endDate) {
      const endFormatted = format(new Date(data.endDate), "dd/MM/yyyy", { locale: ptBR });
      periodText = `${data.period} (até ${endFormatted})`;
    }
    
    doc
      .fontSize(10)
      .fillColor("#6B7280")
      .text(`Período: ${periodText}`, { align: "center" });

    // Formatar horário com timezone GMT-3 (São Paulo)
    const now = new Date();
    const gmtMinus3Time = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    doc
      .fontSize(8)
      .text(`Gerado em: ${format(gmtMinus3Time, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, {
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
      .text(formatBRL(data.summary.totalIncome / 100), 60, summaryY + 35);

    // Box de Despesas
    doc.rect(220, summaryY, 160, 60).fillAndStroke("#FECACA", "#DC2626");
    doc.fontSize(10).fillColor("#DC2626").text("Total de Despesas", 230, summaryY + 15);
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(formatBRL(data.summary.totalExpenses / 100), 230, summaryY + 35);

    // Box de Saldo
    const balance = (data.summary.totalIncome - data.summary.totalExpenses) / 100;
    const balanceColor = balance >= 0 ? "#16A34A" : "#DC2626";
    const balanceBg = balance >= 0 ? "#D1FAE5" : "#FECACA";

    doc.rect(390, summaryY, 160, 60).fillAndStroke(balanceBg, balanceColor);
    doc.fontSize(10).fillColor(balanceColor).text("Saldo", 400, summaryY + 15);
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(formatBRL(balance), 400, summaryY + 35);

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
          formatBRL(transaction.amount / 100),
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

    // Seção de Receitas a Receber
    if (data.upcomingIncomeTransactions && data.upcomingIncomeTransactions.length > 0) {
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#000000").text("Receitas a Receber");
      doc.fontSize(10).font("Helvetica").fillColor("#6B7280").text("Próximos 7 dias");
      doc.moveDown(0.5);

      const incomeTableTop = doc.y;
      const incomeColWidths = [200, 100, 80, 100];
      const incomeHeaders = ["Descrição", "Categoria", "Recebimento", "Valor"];

      let incomeXPos = 50;
      incomeHeaders.forEach((header, i) => {
        doc
          .fontSize(9)
          .font("Helvetica-Bold")
          .fillColor("#FFFFFF")
          .rect(incomeXPos, incomeTableTop, incomeColWidths[i], 20)
          .fillAndStroke("#10B981", "#10B981")
          .fillColor("#FFFFFF")
          .text(header, incomeXPos + 5, incomeTableTop + 6, { width: incomeColWidths[i] - 10 });
        incomeXPos += incomeColWidths[i];
      });

      let incomeRowY = incomeTableTop + 20;

      data.upcomingIncomeTransactions.slice(0, 5).forEach((transaction: any, index: number) => {
        const bgColor = "#D1FAE5"; // Verde claro para destacar receitas

        incomeXPos = 50;
        const daysText = transaction.daysUntilDue === 0 
          ? "Hoje" 
          : transaction.daysUntilDue === 1 
          ? "Amanhã" 
          : `${transaction.daysUntilDue} dias`;
        
        const rowData = [
          transaction.description.substring(0, 35),
          (transaction.categoryName || "Sem Categoria").substring(0, 15),
          daysText,
          "+" + formatBRL(transaction.amount / 100),
        ];

        rowData.forEach((cellData, i) => {
          doc
            .rect(incomeXPos, incomeRowY, incomeColWidths[i], 20)
            .fillAndStroke(bgColor, "#E5E7EB")
            .fontSize(8)
            .font("Helvetica")
            .fillColor(i === 3 ? "#10B981" : "#000000")
            .text(cellData, incomeXPos + 5, incomeRowY + 6, { width: incomeColWidths[i] - 10 });
          incomeXPos += incomeColWidths[i];
        });

        incomeRowY += 20;
      });

      doc.y = incomeRowY;
      doc.moveDown(2);
    }

    // Tabela de Transações
    doc.fontSize(14).font("Helvetica-Bold").fillColor("#000000").text("Transações");

    doc.moveDown();

    // Cabeçalho da tabela
    const tableTop = doc.y;
    const colWidths = [55, 250, 50, 70, 50, 55];
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
    data.transactions.forEach((transaction, index) => {
      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
      }

      const bgColor = index % 2 === 0 ? "#F9FAFB" : "#FFFFFF";

      xPos = 50;
      const rowData = [
        transaction.dueDate ? format(new Date(transaction.dueDate), "dd/MM/yyyy") : "",
        transaction.description.substring(0, 50),
        transaction.type === "INCOME" ? "Receita" : "Despesa",
        formatBRL(transaction.amount / 100),
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
          formatBRL(cat.paid / 100),
          formatBRL(cat.pending / 100),
          formatBRL(cat.overdue / 100),
          formatBRL(cat.total / 100),
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
        formatBRL(totalPaid / 100),
        formatBRL(totalPending / 100),
        formatBRL(totalOverdue / 100),
        formatBRL(totalAll / 100),
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

// ========== ATTACHMENTS ZIP EXPORT ==========

import archiver from "archiver";
import { Readable } from "stream";

export async function generateAttachmentsZip(data: {
  entityName: string;
  attachments: any[];
}): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Máxima compressão
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
    for (const [type, typeAttachments] of Object.entries(attachmentsByType)) {
      const folderName = type.replace(/_/g, " ");
      
      for (const attachment of typeAttachments) {
        try {
          // Baixar arquivo do Vercel Blob
          const response = await fetch(attachment.blobUrl);
          if (!response.ok) {
            console.error(`Erro ao baixar anexo ${attachment.id}: ${response.statusText}`);
            continue;
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

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
        } catch (error) {
          console.error(`Erro ao processar anexo ${attachment.id}:`, error);
        }
      }
    }

    // Finalizar o ZIP
    archive.finalize();
  });
}
