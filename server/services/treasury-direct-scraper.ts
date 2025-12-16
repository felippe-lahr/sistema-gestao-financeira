/**
 * Serviço de scraping de Tesouro Direto
 * Usa a API pública do Tesouro Direto para obter preços e informações dos títulos
 * Fonte: https://www.tesourodireto.com.br/
 */

export interface TreasuryDirectTitle {
  name: string;
  category: "SELIC" | "IPCA" | "EDUCAC" | "RENDA" | "PREFIXADO";
  code: string;
  profitability: string;
  unitaryPrice: number; // em centavos
  minimumInvestment: number; // em centavos
  maturityDate: string;
}

interface TreasuryDirectResponse {
  TrsrBdTradgList: TreasuryDirectItem[];
}

interface TreasuryDirectItem {
  TrsrBd: {
    nm: string; // Nome do título
    mtrtyDt: string; // Data de vencimento
    untrRedVal: number; // Preço unitário de resgate
    minInvstmtAmt: number; // Investimento mínimo
    anulInvstmtRate: number; // Taxa anual de investimento
    anulRedRate: number; // Taxa anual de resgate
  };
  FinIndxs?: {
    nm: string; // Nome do índice (SELIC, IPCA, etc)
  };
}

/**
 * Busca todos os títulos do Tesouro Direto usando API pública
 */
export async function fetchTreasuryDirectTitles(): Promise<TreasuryDirectTitle[]> {
  try {
    const url = "https://api.radaropcoes.com/bonds.json";
    
    console.log("[Treasury Direct Scraper] Buscando títulos do Tesouro Direto...");
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erro ao buscar API: ${response.statusText}`);
    }

    const jsonData = (await response.json()) as TreasuryDirectResponse;
    
    if (!jsonData.TrsrBdTradgList || !Array.isArray(jsonData.TrsrBdTradgList)) {
      throw new Error("Formato de resposta inválido");
    }

    const titles: TreasuryDirectTitle[] = [];
    const titleMap = new Map<string, TreasuryDirectTitle>(); // Para evitar duplicatas

    // Processar dados
    for (const item of jsonData.TrsrBdTradgList) {
      try {
        const treasuryBond = item.TrsrBd;
        if (!treasuryBond) continue;

        const nome = treasuryBond.nm?.trim() || "";
        const dataVencimento = treasuryBond.mtrtyDt?.split("T")[0] || "";
        const precoUnitario = treasuryBond.untrRedVal || 0;
        const investimentoMinimo = treasuryBond.minInvstmtAmt || 30; // Padrão R$ 30

        if (!nome || !dataVencimento || precoUnitario === 0) continue;

        // Determinar categoria
        let category: "SELIC" | "IPCA" | "EDUCAC" | "RENDA" | "PREFIXADO" = "SELIC";
        const indexName = item.FinIndxs?.nm?.toUpperCase() || "";
        const nomeMaiuscula = nome.toUpperCase();

        if (indexName.includes("IPCA") || nomeMaiuscula.includes("IPCA")) {
          category = "IPCA";
        } else if (nomeMaiuscula.includes("EDUCA")) {
          category = "EDUCAC";
        } else if (nomeMaiuscula.includes("RENDA")) {
          category = "RENDA";
        } else if (nomeMaiuscula.includes("PREFIXADO")) {
          category = "PREFIXADO";
        } else if (nomeMaiuscula.includes("SELIC")) {
          category = "SELIC";
        }

        // Gerar código único
        const code = generateTitleCode(nome, category);

        // Converter preços para centavos
        const unitaryPrice = Math.round(precoUnitario * 100);
        const minimumInvestment = Math.round(investimentoMinimo * 100);

        // Determinar rentabilidade
        let profitability = "N/A";
        if (category === "SELIC") {
          profitability = `SELIC + ${treasuryBond.anulInvstmtRate?.toFixed(2)}%` || "SELIC";
        } else if (category === "IPCA") {
          profitability = `IPCA + ${treasuryBond.anulInvstmtRate?.toFixed(2)}%` || "IPCA";
        } else if (category === "PREFIXADO") {
          profitability = `${treasuryBond.anulInvstmtRate?.toFixed(2)}%` || "Prefixado";
        }

        // Usar apenas o registro mais recente
        const key = code;
        if (!titleMap.has(key)) {
          titleMap.set(key, {
            name: nome,
            category,
            code,
            profitability,
            unitaryPrice,
            minimumInvestment,
            maturityDate: dataVencimento,
          });
        }

        console.log(`[Treasury Direct Scraper] ✓ ${nome} - R$ ${(unitaryPrice / 100).toFixed(2)}`);
      } catch (error) {
        console.error(`[Treasury Direct Scraper] Erro ao processar item:`, error);
      }
    }

    // Converter map para array
    const titlesList = Array.from(titleMap.values());

    if (titlesList.length === 0) {
      throw new Error("Nenhum título encontrado");
    }

    console.log(`[Treasury Direct Scraper] ✓ Total de ${titlesList.length} títulos encontrados`);
    return titlesList;
  } catch (error) {
    console.error("[Treasury Direct Scraper] Erro ao buscar títulos:", error);
    throw error;
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
