import cron from "node-cron";
import { updateOverdueTransactions } from "./db";
import { runNotificationTick } from "./services/push-notifications";

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

  // Notificações push: lembretes da agenda, resumo das 7h e novas reservas.
  // Cada aviso é deduplicado em notification_log, então rodar com frequência é seguro.
  let pushRunning = false;
  cron.schedule("0 */5 * * * *", async () => {
    if (pushRunning) return;
    pushRunning = true;
    try {
      await runNotificationTick();
    } catch (error) {
      console.error("[CRON] Erro nas notificações push:", error);
    } finally {
      pushRunning = false;
    }
  });

  console.log("[CRON] Jobs agendados:");
  console.log("  - Atualização de status vencidos (diariamente à meia-noite)");
  console.log("  - Notificações push (a cada 5 minutos)");
}
