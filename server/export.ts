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

    // Rodapé
    doc
      .fontSize(8)
      .fillColor("#6B7280")
      .text(
        "Sistema de Gestão Financeira - Relatório gerado automaticamente",
        50,
        750,
        { align: "center" }
      );

    doc.end();
  });
}
