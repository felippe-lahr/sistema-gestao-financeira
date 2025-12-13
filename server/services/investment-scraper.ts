import axios from "axios";
import * as cheerio from "cheerio";
import * as db from "../db";

// ============================================
// TYPES
// ============================================

export interface PriceData {
  price: number; // Preço em centavos
  change: number; // Variação diária em centésimos de %
  source: "WEB_SCRAPING" | "API" | "MANUAL";
  timestamp: Date;
}

export interface UpdateResult {
  investmentId: number;
  success: boolean;
  error?: string;
  priceData?: PriceData;
}

// ============================================
// AÇÕES E FIIs - BRAPI (API Brasileira Gratuita)
// ============================================

/**
 * Atualizar preço de ação ou FII usando Brapi
 * Documentação: https://brapi.dev/docs
 */
export async function updateStockPrice(ticker: string): Promise<PriceData> {
  try {
    const response = await axios.get(`https://brapi.dev/api/quote/${ticker}`, {
      params: {
        token: process.env.BRAPI_TOKEN || "", // Token opcional para mais requests
      },
      timeout: 10000,
    });

    const data = response.data;

    if (!data.results || data.results.length === 0) {
      throw new Error(`Ticker ${ticker} não encontrado`);
    }

    const stock = data.results[0];
    const price = Math.round(stock.regularMarketPrice * 100); // Converter para centavos
    const change = Math.round(stock.regularMarketChangePercent * 100); // Converter para centésimos de %

    return {
      price,
      change,
      source: "API",
      timestamp: new Date(),
    };
  } catch (error: any) {
    console.error(`[Investment Scraper] Erro ao buscar ${ticker}:`, error.message);
    throw new Error(`Falha ao buscar preço de ${ticker}: ${error.message}`);
  }
}

// ============================================
// TESOURO DIRETO
// ============================================

/**
 * Atualizar preço de título do Tesouro Direto (Tesouro Selic)
 * Cálculo baseado na taxa Selic atual + spread do título
 * Fonte: API do Banco Central (série 432 - Meta Selic)
 */
export async function updateTesouroDiretoPrice(investmentId: number): Promise<PriceData> {
  try {
    const investment = await db.getInvestmentById(investmentId);
    if (!investment) {
      throw new Error("Investimento não encontrado");
    }

    // Buscar taxa Selic atual do Banco Central (série 432 - Meta Selic)
    const selicResponse = await axios.get(
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1',
      {
        params: { formato: 'json' },
        timeout: 10000
      }
    );

    const selicData = selicResponse.data;
    
    if (!selicData || selicData.length === 0) {
      throw new Error("Taxa Selic não disponível");
    }

    // Taxa Selic atual (% a.a.)
    const taxaSelicAnual = parseFloat(selicData[0].valor) / 100; // Converter para decimal
    
    // Spread do título (ex: Tesouro Selic 2031 = +0,1027%)
    // TODO: Buscar spread do banco de dados (campo investment.spread)
    // Por enquanto, assumir 0,1027% como padrão
    const spreadTitulo = 0.001027; // 0,1027% em decimal
    
    // Taxa total do investimento
    const taxaTotal = taxaSelicAnual + spreadTitulo;

    // Calcular dias úteis desde a compra
    const purchaseDate = new Date(investment.purchaseDate);
    const today = new Date();
    
    // Função para contar dias úteis (aproximação sem feriados)
    const contarDiasUteis = (inicio: Date, fim: Date): number => {
      let count = 0;
      const current = new Date(inicio);
      while (current <= fim) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Não é sábado nem domingo
          count++;
        }
        current.setDate(current.getDate() + 1);
      }
      return count;
    };

    const diasUteis = contarDiasUteis(purchaseDate, today);

    // Calcular rentabilidade acumulada
    // Fórmula: Valor Atual = Valor Inicial × (1 + taxa_total)^(dias_úteis / 252)
    const fatorAcumulado = Math.pow(1 + taxaTotal, diasUteis / 252);
    const valorAtual = investment.initialAmount * fatorAcumulado;
    const price = Math.round(valorAtual); // Já em centavos
    
    // Calcular variação percentual
    const rentabilidadePercent = (fatorAcumulado - 1) * 100;
    const change = Math.round(rentabilidadePercent * 100); // Converter para centésimos de %

    console.log(`[Tesouro Selic] Taxa Selic: ${(taxaSelicAnual * 100).toFixed(2)}% a.a.`);
    console.log(`[Tesouro Selic] Spread: ${(spreadTitulo * 100).toFixed(4)}%`);
    console.log(`[Tesouro Selic] Taxa total: ${(taxaTotal * 100).toFixed(4)}% a.a.`);
    console.log(`[Tesouro Selic] Dias úteis: ${diasUteis}`);
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

// ============================================
// CDB, LCI, LCA - CÁLCULO BASEADO EM CDI
// ============================================

/**
 * Atualizar valor de CDB/LCI/LCA baseado em CDI
 * Fonte: API do Banco Central
 */
export async function updateCDBPrice(investmentId: number): Promise<PriceData> {
  try {
    const investment = await db.getInvestmentById(investmentId);
    if (!investment) {
      throw new Error("Investimento não encontrado");
    }

    // Buscar taxa CDI atual do Banco Central
    const cdiResponse = await axios.get(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/1",
      {
        params: { formato: "json" },
        timeout: 10000,
      }
    );

    const cdiData = cdiResponse.data[0];
    const cdiRate = parseFloat(cdiData.valor); // Taxa CDI anual em %

    // Calcular dias desde a compra
    const purchaseDate = new Date(investment.purchaseDate);
    const today = new Date();
    const daysDiff = Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));

    // Calcular valor futuro: VF = VP * (1 + taxa/100) ^ (dias/252)
    // Assumindo 100% do CDI (pode ser ajustado com campo adicional no banco)
    const percentualCDI = 1.0; // 100% do CDI
    const taxaEfetiva = (cdiRate / 100) * percentualCDI;
    const valorFuturo = investment.initialAmount * Math.pow(1 + taxaEfetiva, daysDiff / 252);

    const price = Math.round(valorFuturo); // Já em centavos
    const change = investment.currentAmount
      ? Math.round(((valorFuturo - investment.currentAmount) / investment.currentAmount) * 10000)
      : 0;

    return {
      price,
      change,
      source: "API",
      timestamp: new Date(),
    };
  } catch (error: any) {
    console.error(`[Investment Scraper] Erro ao calcular CDB:`, error.message);
    throw new Error(`Falha ao calcular CDB: ${error.message}`);
  }
}

// ============================================
// CRIPTOMOEDAS - COINGECKO
// ============================================

/**
 * Atualizar preço de criptomoeda usando CoinGecko
 * Documentação: https://www.coingecko.com/en/api/documentation
 */
export async function updateCryptoPrice(symbol: string): Promise<PriceData> {
  try {
    // Mapear símbolos comuns para IDs do CoinGecko
    const symbolMap: Record<string, string> = {
      BTC: "bitcoin",
      ETH: "ethereum",
      USDT: "tether",
      BNB: "binancecoin",
      SOL: "solana",
      XRP: "ripple",
      ADA: "cardano",
      DOGE: "dogecoin",
    };

    const coinId = symbolMap[symbol.toUpperCase()] || symbol.toLowerCase();

    const response = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
      params: {
        ids: coinId,
        vs_currencies: "brl",
        include_24hr_change: "true",
      },
      timeout: 10000,
    });

    const data = response.data[coinId];

    if (!data) {
      throw new Error(`Criptomoeda ${symbol} não encontrada`);
    }

    const price = Math.round(data.brl * 100); // Converter para centavos
    const change = Math.round(data.brl_24h_change * 100); // Converter para centésimos de %

    return {
      price,
      change,
      source: "API",
      timestamp: new Date(),
    };
  } catch (error: any) {
    console.error(`[Investment Scraper] Erro ao buscar ${symbol}:`, error.message);
    throw new Error(`Falha ao buscar criptomoeda ${symbol}: ${error.message}`);
  }
}

// ============================================
// ATUALIZAÇÃO DE INVESTIMENTO
// ============================================

/**
 * Atualizar preço de um investimento específico
 */
export async function updateInvestmentPrice(investmentId: number): Promise<UpdateResult> {
  try {
    const investment = await db.getInvestmentById(investmentId);

    if (!investment) {
      return {
        investmentId,
        success: false,
        error: "Investimento não encontrado",
      };
    }

    if (!investment.autoUpdate) {
      return {
        investmentId,
        success: false,
        error: "Atualização automática desabilitada",
      };
    }

    let priceData: PriceData;

    // Buscar preço baseado no tipo
    switch (investment.type) {
      case "ACAO":
      case "FII":
        if (!investment.ticker) {
          throw new Error("Ticker não definido");
        }
        priceData = await updateStockPrice(investment.ticker);
        break;

      case "TESOURO_DIRETO":
        // Para Tesouro Selic, calcular baseado na taxa Selic acumulada
        priceData = await updateTesouroDiretoPrice(investmentId);
        break;

      case "CDB":
      case "LCI":
      case "LCA":
        priceData = await updateCDBPrice(investmentId);
        break;

      case "CRIPTO":
        if (!investment.ticker) {
          throw new Error("Símbolo não definido");
        }
        priceData = await updateCryptoPrice(investment.ticker);
        break;

      case "FUNDO":
        // TODO: Implementar busca de fundos via CVM
        throw new Error("Fundos: Implementação pendente");

      case "OUTRO":
        return {
          investmentId,
          success: false,
          error: "Tipo 'OUTRO' não suporta atualização automática",
        };

      default:
        throw new Error(`Tipo de investimento desconhecido: ${investment.type}`);
    }

    // Calcular novo valor total
    let newAmount: number;
    if (investment.quantity) {
      // Se tem quantidade, calcular baseado em quantidade * preço
      newAmount = Math.round((investment.quantity / 1000) * priceData.price); // quantity está em milésimos
    } else {
      // Senão, usar o preço diretamente
      newAmount = priceData.price;
    }

    // Calcular lucro/prejuízo
    const profitLoss = newAmount - investment.initialAmount;
    const profitLossPercent = investment.initialAmount > 0
      ? Math.round((profitLoss / investment.initialAmount) * 10000)
      : 0;

    // Atualizar investimento
    await db.updateInvestment(investmentId, {
      currentPrice: priceData.price,
      currentAmount: newAmount,
      profitLoss,
      profitLossPercent,
      dailyChange: priceData.change,
      lastUpdate: priceData.timestamp,
    });

    // Adicionar ao histórico
    await db.addInvestmentHistory({
      investmentId,
      date: priceData.timestamp,
      price: priceData.price,
      amount: newAmount,
      profitLoss,
      profitLossPercent,
      source: priceData.source,
    });

    console.log(`[Investment Scraper] ✓ Atualizado investimento ${investmentId} (${investment.name})`);

    return {
      investmentId,
      success: true,
      priceData,
    };
  } catch (error: any) {
    console.error(`[Investment Scraper] ✗ Erro ao atualizar investimento ${investmentId}:`, error.message);

    return {
      investmentId,
      success: false,
      error: error.message,
    };
  }
}

// ============================================
// ATUALIZAÇÃO EM LOTE
// ============================================

/**
 * Atualizar todos os investimentos de uma entidade
 */
export async function updateInvestmentsByEntity(entityId: number): Promise<UpdateResult[]> {
  console.log(`[Investment Scraper] Atualizando investimentos da entidade ${entityId}...`);

  const investments = await db.getInvestmentsByEntity(entityId);
  const results: UpdateResult[] = [];

  for (const investment of investments) {
    const result = await updateInvestmentPrice(investment.id);
    results.push(result);

    // Aguardar 500ms entre requisições para não sobrecarregar APIs
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  console.log(`[Investment Scraper] Finalizado: ${successCount} sucesso, ${failCount} falhas`);

  return results;
}

/**
 * Atualizar todos os investimentos do sistema
 */
export async function updateAllInvestments(): Promise<UpdateResult[]> {
  console.log(`[Investment Scraper] Iniciando atualização de todos os investimentos...`);

  // TODO: Implementar busca de todas as entidades e atualizar
  // Por enquanto, retornar vazio
  return [];
}
