import { google } from "googleapis";
import { ENV } from "../_core/env";
import * as db from "../db";

/**
 * Cria um cliente OAuth2 autenticado com o refresh_token do usuário.
 */
function getCalendarClient(refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    ENV.googleClientId,
    ENV.googleClientSecret,
    `${ENV.appUrl}/api/auth/google/calendar/callback`
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Mapeia a prioridade da tarefa para texto legível.
 */
function formatPriority(priority: string): string {
  const map: Record<string, string> = {
    LOW: "Baixa",
    MEDIUM: "Média",
    HIGH: "Alta",
  };
  return map[priority] ?? priority;
}

/**
 * Mapeia o status da tarefa para texto legível.
 */
function formatStatus(status: string): string {
  const map: Record<string, string> = {
    PENDING: "Pendente",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluída",
    CANCELLED: "Cancelada",
  };
  return map[status] ?? status;
}

/**
 * Constrói o objeto de evento para a Google Calendar API a partir de uma tarefa.
 */
function buildCalendarEvent(
  task: {
    title: string;
    description?: string | null;
    dueDate: Date;
    dueTime?: string | null;
    endDate?: Date | null;
    endTime?: string | null;
    allDay: boolean;
    priority: string;
    status: string;
  },
  entityName?: string | null
) {
  const titlePrefix = entityName ? `[${entityName}] ` : "";
  const summary = `${titlePrefix}${task.title}`;

  // Montar descrição rica
  const descLines: string[] = [];
  descLines.push(`📋 Tarefa: ${task.title}`);
  if (entityName) descLines.push(`🏢 Entidade: ${entityName}`);
  if (task.description) descLines.push(`📝 Descrição: ${task.description}`);
  descLines.push(`⚡ Prioridade: ${formatPriority(task.priority)}`);
  descLines.push(`📌 Status: ${formatStatus(task.status)}`);
  descLines.push("");
  descLines.push("Criado pelo UnifiquePro");
  const description = descLines.join("\n");

  // Evento de dia inteiro
  if (task.allDay) {
    const dateStr = task.dueDate.toISOString().split("T")[0];
    // endDate para dia inteiro: se tiver endDate usa ela, senão usa o mesmo dia (Google Calendar é exclusivo no end)
    const endDateStr = task.endDate
      ? new Date(task.endDate.getTime() + 86400000).toISOString().split("T")[0]
      : new Date(task.dueDate.getTime() + 86400000).toISOString().split("T")[0];

    return {
      summary,
      description,
      start: { date: dateStr },
      end: { date: endDateStr },
    };
  }

  // Evento com horário
  const timeZone = "America/Sao_Paulo";

  // Montar datetime de início
  const startDateStr = task.dueDate.toISOString().split("T")[0];
  const startTime = task.dueTime ?? "09:00";
  const startDateTime = `${startDateStr}T${startTime}:00`;

  // Montar datetime de fim
  let endDateTime: string;
  if (task.endDate && task.endTime) {
    const endDateStr = task.endDate.toISOString().split("T")[0];
    endDateTime = `${endDateStr}T${task.endTime}:00`;
  } else if (task.endDate) {
    const endDateStr = task.endDate.toISOString().split("T")[0];
    endDateTime = `${endDateStr}T${startTime}:00`;
  } else if (task.endTime) {
    endDateTime = `${startDateStr}T${task.endTime}:00`;
  } else {
    // Padrão: 1 hora de duração
    const [h, m] = startTime.split(":").map(Number);
    const endH = String((h + 1) % 24).padStart(2, "0");
    endDateTime = `${startDateStr}T${endH}:${String(m).padStart(2, "0")}:00`;
  }

  return {
    summary,
    description,
    start: { dateTime: startDateTime, timeZone },
    end: { dateTime: endDateTime, timeZone },
  };
}

/**
 * Cria ou atualiza um evento no Google Calendar do usuário.
 * Retorna o ID do evento criado/atualizado.
 */
export async function syncTaskToGoogleCalendar(
  task: {
    id: number;
    title: string;
    description?: string | null;
    dueDate: Date;
    dueTime?: string | null;
    endDate?: Date | null;
    endTime?: string | null;
    allDay: boolean;
    priority: string;
    status: string;
    googleCalendarEventId?: string | null;
    entityId?: number | null;
  },
  refreshToken: string
): Promise<string | null> {
  try {
    const calendar = getCalendarClient(refreshToken);

    // Buscar nome da entidade se houver
    let entityName: string | null = null;
    if (task.entityId) {
      const entity = await db.getEntityById(task.entityId);
      entityName = entity?.name ?? null;
    }

    const event = buildCalendarEvent(task, entityName);

    if (task.googleCalendarEventId) {
      // Atualizar evento existente
      try {
        const response = await calendar.events.update({
          calendarId: "primary",
          eventId: task.googleCalendarEventId,
          requestBody: event,
        });
        console.log(`[Google Calendar] Evento atualizado: ${response.data.id}`);
        return response.data.id ?? task.googleCalendarEventId;
      } catch (updateError: any) {
        // Se o evento não existe mais no Google (404), criar novo
        if (updateError?.code === 404 || updateError?.status === 404) {
          console.log(`[Google Calendar] Evento não encontrado, criando novo...`);
          const response = await calendar.events.insert({
            calendarId: "primary",
            requestBody: event,
          });
          const newEventId = response.data.id ?? null;
          if (newEventId) {
            await db.updateTaskGoogleCalendarEventId(task.id, newEventId);
          }
          return newEventId;
        }
        throw updateError;
      }
    } else {
      // Criar novo evento
      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
      });
      const eventId = response.data.id ?? null;
      if (eventId) {
        await db.updateTaskGoogleCalendarEventId(task.id, eventId);
      }
      console.log(`[Google Calendar] Evento criado: ${eventId}`);
      return eventId;
    }
  } catch (error: any) {
    console.error(`[Google Calendar] Erro ao sincronizar tarefa ${task.id}:`, error?.message ?? error);
    return null;
  }
}

/**
 * Remove um evento do Google Calendar.
 */
export async function deleteTaskFromGoogleCalendar(
  googleCalendarEventId: string,
  refreshToken: string
): Promise<void> {
  try {
    const calendar = getCalendarClient(refreshToken);
    await calendar.events.delete({
      calendarId: "primary",
      eventId: googleCalendarEventId,
    });
    console.log(`[Google Calendar] Evento removido: ${googleCalendarEventId}`);
  } catch (error: any) {
    // Ignorar erros 404 (evento já não existe)
    if (error?.code !== 404 && error?.status !== 404) {
      console.error(`[Google Calendar] Erro ao remover evento:`, error?.message ?? error);
    }
  }
}

/**
 * Sincroniza todas as tarefas pendentes/em andamento de um usuário para o Google Calendar.
 */
export async function syncAllTasksToGoogleCalendar(
  userId: number,
  refreshToken: string
): Promise<{ synced: number; errors: number }> {
  const tasks = await db.getTasksByUserId(userId);
  let synced = 0;
  let errors = 0;

  for (const task of tasks) {
    if (task.status === "CANCELLED") continue;
    const eventId = await syncTaskToGoogleCalendar(task, refreshToken);
    if (eventId) {
      synced++;
    } else {
      errors++;
    }
  }

  return { synced, errors };
}
