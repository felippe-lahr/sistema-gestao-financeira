import fetch from "node-fetch";

/**
 * Busca o valor atualizado do Tesouro Selic usando a API do governo
 * Retorna o valor em centavos (multiplicado por 100)
 * 
 * NOTA: Agora usa a API do governo em vez de planilha Excel
 * Veja treasury-direct-scraper.ts para detalhes
 */
export async function fetchTreasurySelicPrice(): Promise<number> {
  try {
    // Usar a mesma API do Tesouro Direto para buscar o preço do Selic
    const { fetchTreasuryDirectTitleByCode } = await import("./treasury-direct-scraper");
    
    const selicTitle = await fetchTreasuryDirectTitleByCode("SELIC_2031");
    
    if (!selicTitle) {
      throw new Error("Tesouro Selic 2031 não encontrado na API");
    }
    
    console.log(`[Treasury Selic Scraper] ✓ Preço do Tesouro Selic 2031: R$ ${(selicTitle.unitaryPrice / 100).toFixed(2)}`);
    return selicTitle.unitaryPrice;
  } catch (error) {
    console.error("[Treasury Selic Scraper] Erro ao buscar preço:", error);
    throw error;
  }
}
