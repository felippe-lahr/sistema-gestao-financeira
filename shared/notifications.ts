/**
 * Preferências de notificações push — compartilhado entre servidor e cliente.
 *
 * `entityIds: null` = todas as entidades a que o usuário tem acesso.
 */
export type NotificationTypePrefs = {
  enabled: boolean;
  entityIds: number[] | null;
};

export type NotificationPreferences = {
  /** Compromissos da agenda (tarefas do próprio usuário). */
  agenda: NotificationTypePrefs & {
    /** Tarefas sem entidade vinculada. */
    includePersonal: boolean;
    /** Antecedência do aviso quando a tarefa não define o próprio lembrete. */
    leadMinutes: number;
  };
  /** Contas a pagar (débitos pendentes). */
  expenses: NotificationTypePrefs & { leadDays: number };
  /** Contas a receber (créditos pendentes). */
  income: NotificationTypePrefs & { leadDays: number };
  /** Reservas (entidades com locação por temporada). */
  rentals: NotificationTypePrefs;
  /** Exibir valores em R$ no texto da notificação. */
  showValues: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  agenda: { enabled: true, entityIds: null, includePersonal: true, leadMinutes: 30 },
  expenses: { enabled: true, entityIds: null, leadDays: 0 },
  income: { enabled: true, entityIds: null, leadDays: 0 },
  rentals: { enabled: true, entityIds: null },
  showValues: true,
};

/** Horário (São Paulo) do resumo diário de vencimentos, recebimentos e reservas. */
export const DAILY_SUMMARY_HOUR = 7;

/** Mescla o JSON salvo com os padrões (tolera campos ausentes de versões antigas). */
export function normalizeNotificationPreferences(raw: unknown): NotificationPreferences {
  const d = DEFAULT_NOTIFICATION_PREFERENCES;
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof NotificationPreferences, any>>;
  const ids = (v: any): number[] | null =>
    Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : null;
  const num = (v: any, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
  const bool = (v: any, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

  return {
    agenda: {
      enabled: bool(r.agenda?.enabled, d.agenda.enabled),
      entityIds: ids(r.agenda?.entityIds),
      includePersonal: bool(r.agenda?.includePersonal, d.agenda.includePersonal),
      leadMinutes: num(r.agenda?.leadMinutes, d.agenda.leadMinutes, 0, 24 * 60),
    },
    expenses: {
      enabled: bool(r.expenses?.enabled, d.expenses.enabled),
      entityIds: ids(r.expenses?.entityIds),
      leadDays: num(r.expenses?.leadDays, d.expenses.leadDays, 0, 7),
    },
    income: {
      enabled: bool(r.income?.enabled, d.income.enabled),
      entityIds: ids(r.income?.entityIds),
      leadDays: num(r.income?.leadDays, d.income.leadDays, 0, 7),
    },
    rentals: {
      enabled: bool(r.rentals?.enabled, d.rentals.enabled),
      entityIds: ids(r.rentals?.entityIds),
    },
    showValues: bool(r.showValues, d.showValues),
  };
}
