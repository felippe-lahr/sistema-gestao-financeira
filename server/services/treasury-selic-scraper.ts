import * as fs from "fs";
import * as path from "path";
import fetch from "node-fetch";

/**
 * Busca o valor atualizado do Tesouro Selic da planilha oficial
 * Retorna o valor em centavos (multiplicado por 100)
 */
export async function fetchTreasurySelicPrice(): Promise<number> {
  try {
    const tmpDir = "/tmp";
    const fileName = "LFT_2025_temp.xls";
    const filePath = path.join(tmpDir, fileName);
    const url = "https://cdn.tesouro.gov.br/sistemas-internos/apex/producao/sistemas/sistd/2025/LFT_2025.xls";

    // Baixar arquivo
    console.log("Baixando planilha do Tesouro...");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erro ao baixar arquivo: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    fs.writeFileSync(filePath, buffer);

    // Usar xlsx para ler o arquivo
    const XLSX = await import("xlsx");
    const workbook = XLSX.readFile(filePath);
    
    // Procurar pela sheet "LFT 010331"
    let sheet = null;
    for (const sheetName of workbook.SheetNames) {
      if (sheetName.includes("010331")) {
        sheet = workbook.Sheets[sheetName];
        console.log(`Encontrada sheet: ${sheetName}`);
        break;
      }
    }

    if (!sheet) {
      // Se não encontrar, usar a última sheet
      const lastSheetName = workbook.SheetNames[workbook.SheetNames.length - 1];
      sheet = workbook.Sheets[lastSheetName];
      console.log(`Sheet específica não encontrada. Usando última sheet: ${lastSheetName}`);
    }

    // Converter sheet para array de arrays
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    if (!data || data.length === 0) {
      throw new Error("Planilha vazia ou inválida");
    }

    // Encontrar a coluna "PU Base Manhã" (coluna 5, índice 4)
    // A última linha contém o valor mais recente
    const lastRow = data[data.length - 1];
    
    if (!lastRow || lastRow.length < 5) {
      throw new Error("Formato de planilha inválido");
    }

    // Coluna 5 (índice 4) é "PU Base Manhã"
    let puBaseManhaValue = lastRow[4];
    
    // Se for string, converter para número
    if (typeof puBaseManhaValue === "string") {
      // Remover espaços e converter vírgula para ponto
      puBaseManhaValue = parseFloat(puBaseManhaValue.replace(/\s/g, "").replace(",", "."));
    } else {
      puBaseManhaValue = parseFloat(String(puBaseManhaValue));
    }

    if (isNaN(puBaseManhaValue)) {
      throw new Error(`Valor inválido na coluna 5: ${lastRow[4]}`);
    }

    // Limpar arquivo temporário
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Converter para centavos
    const currentPrice = Math.round(puBaseManhaValue * 100);
    console.log(`Valor atualizado: R$ ${(currentPrice / 100).toFixed(2)}`);

    return currentPrice;
  } catch (error) {
    console.error("Erro ao buscar preço do Tesouro Selic:", error);
    throw error;
  }
}
