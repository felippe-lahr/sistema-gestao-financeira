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
  /** Horário (São Paulo, "HH:MM") do resumo diário. */
  summaryTime: string;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  agenda: { enabled: true, entityIds: null, includePersonal: true, leadMinutes: 30 },
  expenses: { enabled: true, entityIds: null, leadDays: 0 },
  income: { enabled: true, entityIds: null, leadDays: 0 },
  rentals: { enabled: true, entityIds: null },
  showValues: true,
  summaryTime: "07:00",
};

/** Horários oferecidos para o resumo diário (de 30 em 30 min, 05:00–22:00). */
export const SUMMARY_TIME_OPTIONS = Array.from({ length: 35 }, (_, i) => {
  const minutes = 5 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

/** "07:00" → "7h", "07:30" → "7h30". */
export function formatSummaryTime(time: string): string {
  const [h, m] = time.split(":");
  return `${Number(h)}h${m === "00" ? "" : m}`;
}

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
    summaryTime:
      typeof r.summaryTime === "string" && SUMMARY_TIME_OPTIONS.includes(r.summaryTime) ? r.summaryTime : d.summaryTime,
  };
}
