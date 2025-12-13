import cron from "node-cron";
import { updateOverdueTransactions } from "./db";
import { startInvestmentCron } from "./services/investment-cron";

export function startCronJobs() {
  // Atualizar status vencidos todos os dias à meia-noite (horário do servidor)
  // Cron format: segundo minuto hora dia mês dia-da-semana
  // "0 0 0 * * *" = todo dia à meia-noite
  cron.schedule("0 0 0 * * *", async () => {
    try {
      console.log("[CRON] Iniciando atualização de status vencidos...");
      const updatedCount = await updateOverdueTransactions();
      console.log(`[CRON] ${updatedCount} transações atualizadas para OVERDUE`);
    } catch (error) {
      console.error("[CRON] Erro ao atualizar status vencidos:", error);
    }
  });

  // Iniciar cron job de investimentos
  startInvestmentCron();

  console.log("[CRON] Jobs agendados:");
  console.log("  - Atualização de status vencidos (diariamente à meia-noite)");
  console.log("  - Atualização de investimentos (diariamente às 18:00)");
}
