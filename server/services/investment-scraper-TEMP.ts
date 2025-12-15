/**
 * Atualizar preço de título do Tesouro Direto (Tesouro Selic)
 * Cálculo baseado em taxa fixa diária de 0,0276%
 * Temporário: será revisado na segunda-feira
 */
export async function updateTesouroDiretoPrice(investmentId: number): Promise<PriceData> {
  try {
    const investment = await db.getInvestmentById(investmentId);
    if (!investment) {
      throw new Error("Investimento não encontrado");
    }

    // Taxa fixa diária (0,0276% ao dia para resultar em 2,74% em 98 dias)
    const taxaDiaria = 0.000276; // 0,0276% em decimal

    // Calcular dias corridos desde a compra
    const purchaseDate = new Date(investment.purchaseDate);
    const today = new Date();
    const diasCorridos = Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));

    // Calcular rentabilidade acumulada
    // Fórmula: Valor Atual = Valor Inicial × (1 + taxa_diária)^dias_corridos
    const fatorAcumulado = Math.pow(1 + taxaDiaria, diasCorridos);
    const valorAtual = investment.initialAmount * fatorAcumulado;
    const price = Math.round(valorAtual); // Já em centavos
    
    // Calcular variação percentual
    const rentabilidadePercent = (fatorAcumulado - 1) * 100;
    const change = Math.round(rentabilidadePercent * 100); // Converter para centésimos de %

    console.log(`[Tesouro Selic] Taxa diária fixa: ${(taxaDiaria * 100).toFixed(4)}%`);
    console.log(`[Tesouro Selic] Dias corridos: ${diasCorridos}`);
    console.log(`[Tesouro Selic] Rentabilidade: ${rentabilidadePercent.toFixed(4)}%`);
    console.log(`[Tesouro Selic] Valor inicial: R$ ${(investment.initialAmount / 100).toFixed(2)}`);
    console.log(`[Tesouro Selic] Valor atual: R$ ${(valorAtual / 100).toFixed(2)}`);

    return {
      price,
      change,
      source: "API",
      timestamp: new Date(),
    };
  } catch (error: any) {
    console.error(`[Investment Scraper] Erro ao calcular Tesouro Selic:`, error.message);
    throw new Error(`Falha ao calcular Tesouro Selic: ${error.message}`);
  }
}
