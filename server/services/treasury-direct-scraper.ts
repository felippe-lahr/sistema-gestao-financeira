import fetch from "node-fetch";
import * as csv from "csv-parse/sync";

export interface TreasuryDirectTitle {
  name: string;
  category: "SELIC" | "IPCA" | "EDUCAC" | "RENDA" | "PREFIXADO";
  code: string;
  profitability: string;
  unitaryPrice: number; // em centavos
  minimumInvestment: number; // em centavos
  maturityDate: string;
}

/**
 * Busca todos os títulos do Tesouro Direto usando API do governo
 * Fonte: https://www.tesourotransparente.gov.br/
 */
export async function fetchTreasuryDirectTitles(): Promise<TreasuryDirectTitle[]> {
  try {
    const url = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";
    
    console.log("[Treasury Direct Scraper] Buscando títulos do Tesouro Direto...");
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erro ao buscar CSV: ${response.statusText}`);
    }

    const csvContent = await response.text();
    
    // Parse CSV
    const records = csv.parse(csvContent, {
      columns: false,
      delimiter: ";",
      skip_empty_lines: true,
    }) as string[][];

    const titles: TreasuryDirectTitle[] = [];
    const titleMap = new Map<string, TreasuryDirectTitle>(); // Para evitar duplicatas

    // Processar linhas (pular header)
    for (let i = 1; i < records.length; i++) {
      try {
        const row = records[i];
        if (!row || row.length < 6) continue;

        // Colunas do CSV:
        // [0] Tipo Título (ex: "Tesouro Selic")
        // [1] Data Vencimento (ex: "2031-03-01")
        // [2] Data Base (data da cotação)
        // [3] Taxa Rentabilidade (ex: "SELIC + 0,1025%")
        // [4] PU Compra Manhã (preço unitário)
        // [5] PU Venda Manhã
        // [6] Investimento Mínimo

        const tipoTitulo = row[0]?.trim();
        const dataVencimento = row[1]?.trim();
        const dataBase = row[2]?.trim();
        const taxaRentabilidade = row[3]?.trim();
        const puCompra = row[4]?.trim();
        const investimentoMinimo = row[6]?.trim();

        if (!tipoTitulo || !dataVencimento || !puCompra) continue;

        // Extrair ano do vencimento
        const anoVencimento = dataVencimento.split("-")[0];
        const nomeCompleto = `${tipoTitulo} ${anoVencimento}`;

        // Determinar categoria
        let category: "SELIC" | "IPCA" | "EDUCAC" | "RENDA" | "PREFIXADO" = "SELIC";
        if (tipoTitulo.includes("IPCA")) {
          category = "IPCA";
        } else if (tipoTitulo.includes("Educa")) {
          category = "EDUCAC";
        } else if (tipoTitulo.includes("Renda")) {
          category = "RENDA";
        } else if (tipoTitulo.includes("Prefixado")) {
          category = "PREFIXADO";
        }

        // Gerar código único
        const code = generateTitleCode(nomeCompleto, category);

        // Converter preços
        const unitaryPrice = parsePrice(puCompra);
        const minimumInvestment = parsePrice(investimentoMinimo);

        // Usar apenas o registro mais recente (baseado em dataBase)
        const key = code;
        const existingTitle = titleMap.get(key);
        
        if (!existingTitle || (dataBase && (!existingTitle.maturityDate || dataBase > existingTitle.maturityDate))) {
          titleMap.set(key, {
            name: nomeCompleto,
            category,
            code,
            profitability: taxaRentabilidade || "N/A",
            unitaryPrice,
            minimumInvestment,
            maturityDate: dataVencimento,
          });
        }

        console.log(`[Treasury Direct Scraper] ✓ ${nomeCompleto} - R$ ${(unitaryPrice / 100).toFixed(2)}`);
      } catch (error) {
        console.error(`[Treasury Direct Scraper] Erro ao processar linha ${i}:`, error);
      }
    }

    // Converter map para array
    const titlesList = Array.from(titleMap.values());

    if (titlesList.length === 0) {
      throw new Error("Nenhum título encontrado no CSV");
    }

    console.log(`[Treasury Direct Scraper] ✓ Total de ${titlesList.length} títulos encontrados`);
    return titlesList;
  } catch (error) {
    console.error("[Treasury Direct Scraper] Erro ao buscar títulos:", error);
    throw error;
  }
}

/**
 * Converte string de preço (ex: "178,91") para centavos
 */
function parsePrice(priceStr: string): number {
  try {
    if (!priceStr) return 0;
    
    // Remove espaços
    let cleaned = priceStr.trim();
    
    // Converte vírgula para ponto
    cleaned = cleaned.replace(",", ".");
    
    const price = parseFloat(cleaned);
    if (isNaN(price)) {
      throw new Error(`Preço inválido: ${priceStr}`);
    }
    
    // Converte para centavos
    return Math.round(price * 100);
  } catch (error) {
    console.error(`[Treasury Direct Scraper] Erro ao converter preço "${priceStr}":`, error);
    return 0;
  }
}

/**
 * Gera um código único para o título
 */
function generateTitleCode(titleName: string, category: string): string {
  // Extrai ano do título (ex: "2031" de "Tesouro Selic 2031")
  const yearMatch = titleName.match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : "XXXX";
  
  // Gera código (ex: "SELIC_2031")
  return `${category}_${year}`;
}

/**
 * Busca apenas os títulos de uma categoria específica
 */
export async function fetchTreasuryDirectTitlesByCategory(
  category: "SELIC" | "IPCA" | "EDUCAC" | "RENDA" | "PREFIXADO"
): Promise<TreasuryDirectTitle[]> {
  const allTitles = await fetchTreasuryDirectTitles();
  return allTitles.filter((title) => title.category === category);
}

/**
 * Busca um título específico pelo código
 */
export async function fetchTreasuryDirectTitleByCode(code: string): Promise<TreasuryDirectTitle | null> {
  const allTitles = await fetchTreasuryDirectTitles();
  return allTitles.find((title) => title.code === code) || null;
}
