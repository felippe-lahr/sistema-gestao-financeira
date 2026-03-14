/**
 * OFX Import Service
 * Responsável por fazer o parse de arquivos OFX e preparar as transações para conciliação.
 */

import * as ofxJs from "ofx-js";

export interface ParsedOfxTransaction {
  ofxId: string;       // FITID — identificador único do banco
  type: "INCOME" | "EXPENSE";
  amount: number;      // em centavos, sempre positivo
  date: Date;
  description: string; // MEMO ou NAME
  memo: string | null;
}

export interface ParsedOfxFile {
  bankId?: string;
  accountId?: string;
  accountType?: string;
  startDate?: Date;
  endDate?: Date;
  ledgerBalance?: number;    // em centavos
  availableBalance?: number; // em centavos
  transactions: ParsedOfxTransaction[];
}

/**
 * Converte string de data OFX (YYYYMMDD ou YYYYMMDDHHMMSS) para Date
 */
function parseOfxDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  // Remove timezone info se houver (ex: 20240101120000[-3:BRT])
  const clean = dateStr.replace(/\[.*\]/, "").trim();
  const year = parseInt(clean.substring(0, 4));
  const month = parseInt(clean.substring(4, 6)) - 1;
  const day = parseInt(clean.substring(6, 8));
  const hour = clean.length >= 10 ? parseInt(clean.substring(8, 10)) : 0;
  const min = clean.length >= 12 ? parseInt(clean.substring(10, 12)) : 0;
  const sec = clean.length >= 14 ? parseInt(clean.substring(12, 14)) : 0;
  return new Date(year, month, day, hour, min, sec);
}

/**
 * Converte valor OFX (string com ponto ou vírgula) para centavos
 */
function parseOfxAmount(amountStr: string): number {
  if (!amountStr) return 0;
  // OFX usa ponto como separador decimal
  const normalized = amountStr.replace(",", ".").trim();
  const value = parseFloat(normalized);
  if (isNaN(value)) return 0;
  return Math.round(Math.abs(value) * 100);
}

/**
 * Determina o tipo da transação OFX
 * TRNTYPE: CREDIT, DEP, INT, DIV, FEE, SRVCHG, DEP, ATM, POS, XFER, CHECK, PAYMENT, CASH, DIRECTDEP, DIRECTDEBIT, REPEATPMT, OTHER
 */
function parseOfxType(trnType: string, amount: string): "INCOME" | "EXPENSE" {
  const value = parseFloat((amount || "0").replace(",", "."));
  // Se o valor for negativo, é despesa
  if (value < 0) return "EXPENSE";
  // Se o valor for positivo, é receita
  if (value > 0) return "INCOME";
  // Fallback por tipo
  const incomeTypes = ["CREDIT", "DEP", "INT", "DIV", "DIRECTDEP"];
  const type = (trnType || "").toUpperCase();
  return incomeTypes.includes(type) ? "INCOME" : "EXPENSE";
}

/**
 * Faz o parse de um arquivo OFX e retorna as transações estruturadas
 */
export async function parseOfxFile(content: string): Promise<ParsedOfxFile> {
  try {
    const parsed = await ofxJs.parse(content);

    // Navegar pela estrutura do OFX
    const ofxData = parsed?.OFX;
    if (!ofxData) {
      // Tentar parsear como XML puro (alguns bancos exportam sem wrapper OFX)
      throw new Error("Arquivo OFX inválido: estrutura OFX não encontrada. Verifique se o arquivo é um extrato OFX válido.");
    }

    // Tentar encontrar o statement em todas as variações conhecidas
    // Alguns bancos brasileiros usam estruturas não-padrão
    const bankMsg =
      ofxData.BANKMSGSRSV1 ||
      ofxData.CREDITCARDMSGSRSV1 ||
      ofxData.INVSTMTMSGSRSV1 ||
      // Variações com V1 no final
      (ofxData as any).BANKMSGSRSV2 ||
      (ofxData as any).CREDITCARDMSGSRSV2;

    if (!bankMsg) {
      const keys = Object.keys(ofxData).join(", ");
      throw new Error(`Arquivo OFX inválido: nenhum extrato bancário encontrado. Chaves encontradas: ${keys}`);
    }

    const stmtrs =
      bankMsg.STMTRS ||
      bankMsg.CCSTMTRS ||
      bankMsg.INVSTMTRS ||
      // Alguns bancos colocam direto no nível do bankMsg
      (bankMsg.STMTTRNRS?.STMTRS) ||
      (bankMsg.STMTTRNRS?.CCSTMTRS);

    if (!stmtrs) {
      const keys = Object.keys(bankMsg).join(", ");
      throw new Error(`Arquivo OFX inválido: STMTRS não encontrado. Chaves encontradas: ${keys}`);
    }

    // Dados da conta
    const acctFrom = stmtrs.BANKACCTFROM || stmtrs.CCACCTFROM || {};
    const bankId = acctFrom.BANKID || undefined;
    const accountId = acctFrom.ACCTID || undefined;
    const accountType = acctFrom.ACCTTYPE || undefined;

    // Período
    const tranList = stmtrs.BANKTRANLIST || {};
    const startDate = tranList.DTSTART ? parseOfxDate(tranList.DTSTART) : undefined;
    const endDate = tranList.DTEND ? parseOfxDate(tranList.DTEND) : undefined;

    // Saldos
    let ledgerBalance: number | undefined;
    let availableBalance: number | undefined;

    if (stmtrs.LEDGERBAL?.BALAMT) {
      ledgerBalance = parseOfxAmount(stmtrs.LEDGERBAL.BALAMT);
    }
    if (stmtrs.AVAILBAL?.BALAMT) {
      availableBalance = parseOfxAmount(stmtrs.AVAILBAL.BALAMT);
    }

    // Transações
    const rawTransactions = tranList.STMTTRN || [];
    const txArray = Array.isArray(rawTransactions) ? rawTransactions : [rawTransactions];

    const transactions: ParsedOfxTransaction[] = txArray
      .filter((tx: any) => tx && tx.FITID)
      .map((tx: any) => {
        const amountStr = tx.TRNAMT || "0";
        const description = tx.MEMO || tx.NAME || tx.FITID || "Sem descrição";
        const memo = tx.MEMO || null;

        return {
          ofxId: String(tx.FITID).trim(),
          type: parseOfxType(tx.TRNTYPE || "", amountStr),
          amount: parseOfxAmount(amountStr),
          date: tx.DTPOSTED ? parseOfxDate(tx.DTPOSTED) : new Date(),
          description: String(description).trim().substring(0, 500),
          memo: memo ? String(memo).trim().substring(0, 500) : null,
        };
      });

    return {
      bankId,
      accountId,
      accountType,
      startDate,
      endDate,
      ledgerBalance,
      availableBalance,
      transactions,
    };
  } catch (error: any) {
    if (error.message?.includes("OFX inválido")) throw error;
    throw new Error(`Erro ao processar arquivo OFX: ${error.message}`);
  }
}

/**
 * Detecta possíveis duplicatas comparando transações OFX com transações existentes.
 * Retorna o ID da transação existente se encontrar match, ou null.
 *
 * Critérios de match (todos devem ser verdadeiros):
 * - Mesmo tipo (INCOME/EXPENSE)
 * - Mesmo valor (±1 centavo para tolerância de arredondamento)
 * - Data próxima (±3 dias)
 */
export function detectDuplicate(
  ofxTx: ParsedOfxTransaction,
  existingTransactions: Array<{
    id: number;
    type: string;
    amount: number;
    dueDate: Date | string;
    paymentDate?: Date | string | null;
    description: string;
  }>
): number | null {
  const ofxDate = ofxTx.date.getTime();
  const threeDays = 3 * 24 * 60 * 60 * 1000;

  for (const tx of existingTransactions) {
    // Tipo deve ser igual
    if (tx.type !== ofxTx.type) continue;

    // Valor deve ser igual (tolerância de 1 centavo)
    if (Math.abs(tx.amount - ofxTx.amount) > 1) continue;

    // Data de pagamento ou vencimento deve ser próxima (±3 dias)
    const txDate = tx.paymentDate
      ? new Date(tx.paymentDate).getTime()
      : new Date(tx.dueDate).getTime();

    if (Math.abs(txDate - ofxDate) <= threeDays) {
      return tx.id;
    }
  }

  return null;
}
