import cron from "node-cron";
import * as db from "../db";
import * as scraper from "./investment-scraper";
import { investments } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Cron job para atualização diária de investimentos
 * Executa todos os dias às 18:00 (após o fechamento do mercado)
 */
export function startInvestmentCron() {
  console.log("[Investment Cron] Iniciando agendamento de atualização diária...");

  // Executar todos os dias às 18:00 (horário de Brasília)
  // Formato: segundos minutos horas dia mês dia-da-semana
  cron.schedule("0 0 18 * * *", async () => {
    console.log("[Investment Cron] ⏰ Iniciando atualização diária de investimentos...");

    try {
      // Buscar todas as entidades que têm investimentos
      const allInvestments = await getAllInvestmentsWithAutoUpdate();

      if (allInvestments.length === 0) {
        console.log("[Investment Cron] Nenhum investimento com atualização automática encontrado");
        return;
      }

      console.log(`[Investment Cron] Encontrados ${allInvestments.length} investimentos para atualizar`);

      let successCount = 0;
      let failCount = 0;

      // Atualizar cada investimento
      for (const investment of allInvestments) {
        try {
          const result = await scraper.updateInvestmentPrice(investment.id);

          if (result.success) {
            successCount++;
          } else {
            failCount++;
            console.error(`[Investment Cron] Falha ao atualizar ${investment.name}: ${result.error}`);
          }

          // Aguardar 500ms entre requisições para não sobrecarregar APIs
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error: any) {
          failCount++;
          console.error(`[Investment Cron] Erro ao processar ${investment.name}:`, error.message);
        }
      }

      console.log(`[Investment Cron] ✅ Atualização concluída: ${successCount} sucesso, ${failCount} falhas`);
    } catch (error: any) {
      console.error("[Investment Cron] ❌ Erro crítico na atualização diária:", error.message);
    }
  });

  console.log("[Investment Cron] ✅ Cron job agendado para 18:00 todos os dias");
}

/**
 * Buscar todos os investimentos com atualização automática habilitada
 */
async function getAllInvestmentsWithAutoUpdate() {
  const dbInstance = await db.getDb();
  if (!dbInstance) return [];

  return await dbInstance
    .select()
    .from(investments)
    .where(eq(investments.autoUpdate, true));
}

/**
 * Executar atualização manual (útil para testes)
 */
export async function runManualUpdate() {
  console.log("[Investment Cron] 🔧 Executando atualização manual...");

  const allInvestments = await getAllInvestmentsWithAutoUpdate();

  if (allInvestments.length === 0) {
    console.log("[Investment Cron] Nenhum investimento encontrado");
    return { success: 0, failed: 0 };
  }

  let successCount = 0;
  let failCount = 0;

  for (const investment of allInvestments) {
    try {
      const result = await scraper.updateInvestmentPrice(investment.id);

      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      failCount++;
    }
  }

  console.log(`[Investment Cron] Manual update completed: ${successCount} success, ${failCount} failed`);

  return { success: successCount, failed: failCount };
}
