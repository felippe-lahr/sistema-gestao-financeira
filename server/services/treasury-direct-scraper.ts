/**
 * Serviço de scraping de Tesouro Direto
 * Usa a API pública da ANBIMA para obter preços e informações dos títulos
 * Fonte: https://developers.anbima.com.br/
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

interface ANBIMAResponse {
  data: ANBIMATitle[];
}

interface ANBIMATitle {
  tipo_titulo: string;
  expressao: string;
  data_vencimento: string;
  data_referencia: string;
  codigo_selic: string;
  taxa_compra: number;
  taxa_venda: number;
  taxa_indicativa: number;
  pu: number;
}

/**
 * Busca todos os títulos do Tesouro Direto usando API ANBIMA
 */
export async function fetchTreasuryDirectTitles(): Promise<TreasuryDirectTitle[]> {
  try {
    const url = "https://api.anbima.com.br/feed/precos-indices/v1/titulos-publicos/mercado-secundario-TPF";
    
    console.log("[Treasury Direct Scraper] Buscando títulos do Tesouro Direto via ANBIMA...");
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erro ao buscar API ANBIMA: ${response.statusText}`);
    }

    const jsonData = (await response.json()) as ANBIMAResponse;
    
    if (!jsonData.data || !Array.isArray(jsonData.data)) {
      throw new Error("Formato de resposta inválido da API ANBIMA");
    }

    const titles: TreasuryDirectTitle[] = [];
    const titleMap = new Map<string, TreasuryDirectTitle>(); // Para evitar duplicatas

    // Processar dados
    for (const item of jsonData.data) {
      try {
        const tipoTitulo = item.tipo_titulo?.trim() || "";
        const dataVencimento = item.data_vencimento?.trim() || "";
        const pu = item.pu || 0;
        const expressao = item.expressao?.trim() || "";

        if (!tipoTitulo || !dataVencimento || pu === 0) continue;

        // Extrair ano do vencimento
        const anoVencimento = dataVencimento.split("-")[0];
        const nomeCompleto = `${tipoTitulo} ${anoVencimento}`;

        // Determinar categoria
        let category: "SELIC" | "IPCA" | "EDUCAC" | "RENDA" | "PREFIXADO" = "SELIC";
        if (tipoTitulo.toUpperCase().includes("IPCA")) {
          category = "IPCA";
        } else if (tipoTitulo.toUpperCase().includes("EDUCA")) {
          category = "EDUCAC";
        } else if (tipoTitulo.toUpperCase().includes("RENDA")) {
          category = "RENDA";
        } else if (tipoTitulo.toUpperCase().includes("PREFIXADO")) {
          category = "PREFIXADO";
        }

        // Gerar código único
        const code = generateTitleCode(nomeCompleto, category);

        // Converter preço (PU está em reais com 6 casas decimais, converter para centavos)
        const unitaryPrice = Math.round(pu * 100);
        
        // Investimento mínimo (padrão R$ 30,00 = 3000 centavos)
        const minimumInvestment = 3000;

        // Usar apenas o registro mais recente
        const key = code;
        const existingTitle = titleMap.get(key);
        
        if (!existingTitle) {
          titleMap.set(key, {
            name: nomeCompleto,
            category,
            code,
            profitability: expressao || "N/A",
            unitaryPrice,
            minimumInvestment,
            maturityDate: dataVencimento,
          });
        }

        console.log(`[Treasury Direct Scraper] ✓ ${nomeCompleto} - R$ ${(unitaryPrice / 100).toFixed(2)}`);
      } catch (error) {
        console.error(`[Treasury Direct Scraper] Erro ao processar item:`, error);
      }
    }

    // Converter map para array
    const titlesList = Array.from(titleMap.values());

    if (titlesList.length === 0) {
      throw new Error("Nenhum título encontrado na API ANBIMA");
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
