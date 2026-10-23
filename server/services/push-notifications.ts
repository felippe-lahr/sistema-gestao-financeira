/**
 * Notificações push (Web Push / PWA).
 *
 * - Chaves VAPID: env VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; se ausentes, são
 *   geradas uma vez e guardadas em app_settings (sobrevivem a novos deploys).
 * - runNotificationTick() roda a cada 5 min (server/cron.ts):
 *     • lembretes de compromissos com horário (antecedência configurável)
 *     • resumo diário às 7h (São Paulo): agenda do dia, contas a pagar,
 *       contas a receber, check-ins/check-outs
 *     • nova reserva criada por outro membro da entidade
 * - Cada aviso passa por notification_log (userId + dedupeKey) antes do envio,
 *   então nunca é enviado duas vezes, mesmo com reinícios ou ticks atrasados.
 */
import webpush from "web-push";
import { and, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { getDb, getEntitiesByUserId, getSharedEntitiesForUser } from "../db";
import {
  appSettings,
  notificationLog,
  notificationPreferences,
  pushSubscriptions,
  rentals,
  tasks,
  transactions,
} from "../../drizzle/schema";
import {
  DAILY_SUMMARY_HOUR,
  normalizeNotificationPreferences,
  type NotificationPreferences,
} from "@shared/notifications";

const TZ = "America/Sao_Paulo";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Lembrete atrasado (servidor reiniciando, tick perdido) ainda é enviado até este limite. */
const LATE_TOLERANCE_MS = 20 * 60 * 1000;

export type PushPayload = {
  title: string;
  body: string;
  /** Rota do app aberta ao tocar na notificação. */
  url: string;
  /** Notificações com a mesma tag substituem a anterior no aparelho. */
  tag?: string;
};

// ─── VAPID ────────────────────────────────────────────────────────────────────

let vapidPublicKey: string | null = null;

export async function getVapidPublicKey(): Promise<string | null> {
  if (vapidPublicKey) return vapidPublicKey;

  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, "vapid_keys")).limit(1);
    if (rows[0]) {
      ({ publicKey, privateKey } = JSON.parse(rows[0].value));
    } else {
      const generated = webpush.generateVAPIDKeys();
      await db
        .insert(appSettings)
        .values({ key: "vapid_keys", value: JSON.stringify(generated) })
        .onConflictDoNothing();
      // Outro processo pode ter gravado antes — relê para usar sempre o mesmo par.
      const saved = await db.select().from(appSettings).where(eq(appSettings.key, "vapid_keys")).limit(1);
      ({ publicKey, privateKey } = JSON.parse(saved[0].value));
      console.log("[Push] Chaves VAPID geradas e salvas em app_settings");
    }
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contato@unifiquepro.com.br",
    publicKey!,
    privateKey!,
  );
  vapidPublicKey = publicKey!;
  return vapidPublicKey;
}

// ─── Inscrições e preferências ───────────────────────────────────────────────

export async function saveSubscription(
  userId: number,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // O mesmo aparelho pode trocar de usuário (logout/login): o endpoint é único.
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent?.slice(0, 512) ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 512) ?? null },
    });
}

export async function removeSubscription(userId: number, endpoint: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function countSubscriptions(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  return rows.length;
}

export async function getPreferences(userId: number): Promise<NotificationPreferences> {
  const db = await getDb();
  if (!db) return normalizeNotificationPreferences(null);
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  if (!rows[0]) return normalizeNotificationPreferences(null);
  try {
    return normalizeNotificationPreferences(JSON.parse(rows[0].settings));
  } catch {
    return normalizeNotificationPreferences(null);
  }
}

export async function savePreferences(userId: number, prefs: unknown): Promise<NotificationPreferences> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalized = normalizeNotificationPreferences(prefs);
  const settings = JSON.stringify(normalized);
  await db
    .insert(notificationPreferences)
    .values({ userId, settings })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: { settings, updatedAt: new Date() } });
  return normalized;
}

// ─── Envio ──────────────────────────────────────────────────────────────────

/** Envia para todos os aparelhos do usuário. Retorna quantos receberam. */
export async function sendToUser(userId: number, payload: PushPayload): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  if (!(await getVapidPublicKey())) return 0;

  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let delivered = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 12 * 60 * 60, urgency: "normal" },
      );
      delivered++;
      await db.update(pushSubscriptions).set({ lastSuccessAt: new Date() }).where(eq(pushSubscriptions.id, sub.id));
    } catch (err: any) {
      // 404/410 = inscrição expirada ou app removido do aparelho.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else {
        console.error(`[Push] Falha ao enviar para userId=${userId}:`, err?.statusCode ?? "", err?.body || err?.message);
      }
    }
  }
  return delivered;
}

/** Reserva a chave de deduplicação. true = ainda não enviado (pode enviar). */
async function claim(userId: number, dedupeKey: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const inserted = await db
    .insert(notificationLog)
    .values({ userId, dedupeKey: dedupeKey.slice(0, 255) })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  return inserted.length > 0;
}

async function sendOnce(userId: number, dedupeKey: string, payload: PushPayload) {
  if (await claim(userId, dedupeKey)) await sendToUser(userId, payload);
}

// ─── Datas no fuso de São Paulo ──────────────────────────────────────────────

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function localParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute };
}

/** "YYYY-MM-DD" da data no fuso de São Paulo. */
export function localDateKey(d: Date): string {
  const { y, m, d: day } = localParts(d);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Instante UTC de uma data/hora local de São Paulo. */
export function zonedToUtc(key: string, hhmm: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = localParts(new Date(guess));
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - guess;
  return new Date(guess - offset);
}

function shortDate(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (cents: number) => brl.format(cents / 100);

function listTitles(titles: string[], max = 3): string {
  const shown = titles.slice(0, max).join(", ");
  return titles.length > max ? `${shown} e mais ${titles.length - max}` : shown;
}

// ─── Tick ────────────────────────────────────────────────────────────────────

type UserEntity = { id: number; name: string; temporaryRentalEnabled: boolean | null };

function allowed(prefsIds: number[] | null, entityId: number) {
  return prefsIds === null || prefsIds.includes(entityId);
}

export async function runNotificationTick(now = new Date()) {
  const db = await getDb();
  if (!db) return;
  if (!(await getVapidPublicKey())) return;

  const userRows = await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions);
  for (const { userId } of userRows) {
    try {
      const prefs = await getPreferences(userId);
      const [owned, shared] = await Promise.all([getEntitiesByUserId(userId), getSharedEntitiesForUser(userId)]);
      const entities: UserEntity[] = [...owned, ...shared].map((e: any) => ({
        id: e.id,
        name: e.name,
        temporaryRentalEnabled: e.temporaryRentalEnabled,
      }));
      await notifyAgendaReminders(userId, prefs, entities, now);
      await notifyNewRentals(userId, prefs, entities, now);
      if (localParts(now).hh >= DAILY_SUMMARY_HOUR && localParts(now).hh < DAILY_SUMMARY_HOUR + 3) {
        await notifyDailySummary(userId, prefs, entities, now);
      }
    } catch (err) {
      console.error(`[Push] Erro no tick para userId=${userId}:`, err);
    }
  }
}

function taskAllowed(prefs: NotificationPreferences, entityId: number | null) {
  if (entityId === null) return prefs.agenda.includePersonal;
  return allowed(prefs.agenda.entityIds, entityId);
}

/** Lembretes de compromissos com horário. */
async function notifyAgendaReminders(userId: number, prefs: NotificationPreferences, entities: UserEntity[], now: Date) {
  if (!prefs.agenda.enabled) return;
  const db = (await getDb())!;
  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.status, ["PENDING", "IN_PROGRESS"]),
        eq(tasks.allDay, false),
        sql`${tasks.dueTime} IS NOT NULL`,
        gte(tasks.dueDate, new Date(now.getTime() - 2 * DAY_MS)),
        lte(tasks.dueDate, new Date(now.getTime() + 3 * DAY_MS)),
      ),
    );

  const names = new Map(entities.map((e) => [e.id, e.name]));
  for (const task of rows) {
    if (!task.dueTime || !/^\d{2}:\d{2}$/.test(task.dueTime)) continue;
    if (!taskAllowed(prefs, task.entityId)) continue;
    const dayKey = localDateKey(task.dueDate);
    const eventAt = zonedToUtc(dayKey, task.dueTime);
    const lead = task.reminderMinutes ?? prefs.agenda.leadMinutes;
    const remindAt = eventAt.getTime() - lead * 60 * 1000;
    if (remindAt > now.getTime() || now.getTime() - remindAt > LATE_TOLERANCE_MS) continue;

    const entityName = task.entityId ? names.get(task.entityId) : null;
    const when = lead === 0 ? "agora" : lead < 60 ? `em ${lead} min` : `às ${task.dueTime}`;
    await sendOnce(userId, `task:${task.id}:${eventAt.toISOString()}`, {
      title: `📅 ${task.title}`,
      body: `${when === "agora" ? "Agora" : `Começa ${when}`} · ${task.dueTime}${entityName ? ` · ${entityName}` : ""}`,
      url: "/agenda",
      tag: `task-${task.id}`,
    });
  }
}

/** Nova reserva criada por outra pessoa (quem cadastrou não precisa ser avisado). */
async function notifyNewRentals(userId: number, prefs: NotificationPreferences, entities: UserEntity[], now: Date) {
  if (!prefs.rentals.enabled) return;
  const ids = entities.filter((e) => allowed(prefs.rentals.entityIds, e.id)).map((e) => e.id);
  if (ids.length === 0) return;
  const db = (await getDb())!;
  const rows = await db
    .select()
    .from(rentals)
    .where(
      and(
        inArray(rentals.entityId, ids),
        inArray(rentals.status, ["RESERVED_AIRBNB", "RESERVED_DIRECT"]),
        ne(rentals.userId, userId),
        gte(rentals.createdAt, new Date(now.getTime() - 60 * 60 * 1000)),
      ),
    );
  const names = new Map(entities.map((e) => [e.id, e.name]));
  for (const r of rows) {
    const period = `${shortDate(localDateKey(r.startDate))} a ${shortDate(localDateKey(r.endDate))}`;
    const parts = [period, r.guestName, r.source === "AIRBNB" ? "Airbnb" : "Direta"];
    if (prefs.showValues && r.totalAmount) parts.push(money(r.totalAmount));
    await sendOnce(userId, `rental-new:${r.id}`, {
      title: `🏠 Nova reserva — ${names.get(r.entityId) ?? "Reserva"}`,
      body: parts.filter(Boolean).join(" · "),
      url: `/rentals/${r.entityId}`,
      tag: `rental-new-${r.id}`,
    });
  }
}

/** Resumo das 7h: agenda do dia, contas a pagar/receber e movimento de reservas. */
async function notifyDailySummary(userId: number, prefs: NotificationPreferences, entities: UserEntity[], now: Date) {
  const db = (await getDb())!;
  const today = localDateKey(now);

  // Agenda do dia (todas as tarefas de hoje, inclusive dia inteiro/sem horário)
  if (prefs.agenda.enabled) {
    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          inArray(tasks.status, ["PENDING", "IN_PROGRESS"]),
          gte(tasks.dueDate, new Date(now.getTime() - 2 * DAY_MS)),
          lte(tasks.dueDate, new Date(now.getTime() + 2 * DAY_MS)),
        ),
      );
    const todays = rows
      .filter((t) => localDateKey(t.dueDate) === today && taskAllowed(prefs, t.entityId))
      .sort((a, b) => (a.dueTime ?? "").localeCompare(b.dueTime ?? ""));
    if (todays.length > 0) {
      await sendOnce(userId, `daily:agenda:${today}`, {
        title: `📅 Agenda de hoje — ${todays.length} ${todays.length === 1 ? "compromisso" : "compromissos"}`,
        body: listTitles(todays.map((t) => (t.dueTime && !t.allDay ? `${t.dueTime} ${t.title}` : t.title))),
        url: "/agenda",
        tag: `daily-agenda-${today}`,
      });
    }
  }

  // Contas a pagar / a receber, por entidade
  for (const kind of ["expenses", "income"] as const) {
    const p = prefs[kind];
    if (!p.enabled) continue;
    const targets = entities.filter((e) => allowed(p.entityIds, e.id));
    if (targets.length === 0) continue;
    const dayKeys = p.leadDays > 0 ? [today, addDaysKey(today, p.leadDays)] : [today];
    const rows = await db
      .select()
      .from(transactions)
      .where(
        and(
          inArray(transactions.entityId, targets.map((e) => e.id)),
          eq(transactions.type, kind === "expenses" ? "EXPENSE" : "INCOME"),
          or(eq(transactions.status, "PENDING"), eq(transactions.status, "OVERDUE")),
          gte(transactions.dueDate, new Date(now.getTime() - 2 * DAY_MS)),
          lte(transactions.dueDate, new Date(now.getTime() + (p.leadDays + 2) * DAY_MS)),
        ),
      );

    for (const entity of targets) {
      for (const dayKey of dayKeys) {
        const items = rows.filter((t) => t.entityId === entity.id && localDateKey(t.dueDate) === dayKey);
        if (items.length === 0) continue;
        const total = items.reduce((s, t) => s + t.amount, 0);
        const isToday = dayKey === today;
        const n = items.length;
        const what =
          kind === "expenses"
            ? `${n} ${n === 1 ? "conta vence" : "contas vencem"}`
            : `${n} ${n === 1 ? "recebimento previsto" : "recebimentos previstos"}`;
        const when = isToday ? "hoje" : `em ${shortDate(dayKey)}`;
        await sendOnce(userId, `daily:${kind}:${entity.id}:${dayKey}:${today}`, {
          title: `${kind === "expenses" ? "💸" : "💰"} ${entity.name} — ${what} ${when}`,
          body: `${prefs.showValues ? `${money(total)} · ` : ""}${listTitles(items.map((t) => t.description))}`,
          url: `/dashboard/${entity.id}`,
          tag: `daily-${kind}-${entity.id}-${dayKey}`,
        });
      }
    }
  }

  // Reservas: check-in hoje/amanhã e check-out hoje
  if (prefs.rentals.enabled) {
    const targets = entities.filter((e) => e.temporaryRentalEnabled && allowed(prefs.rentals.entityIds, e.id));
    if (targets.length > 0) {
      const tomorrow = addDaysKey(today, 1);
      const rows = await db
        .select()
        .from(rentals)
        .where(
          and(
            inArray(rentals.entityId, targets.map((e) => e.id)),
            inArray(rentals.status, ["RESERVED_AIRBNB", "RESERVED_DIRECT"]),
            lte(rentals.startDate, new Date(now.getTime() + 3 * DAY_MS)),
            gte(rentals.endDate, new Date(now.getTime() - 2 * DAY_MS)),
          ),
        );
      for (const entity of targets) {
        const mine = rows.filter((r) => r.entityId === entity.id);
        const guest = (r: (typeof rows)[number]) => r.guestName || (r.source === "AIRBNB" ? "Hóspede Airbnb" : "Hóspede");
        const checkInToday = mine.filter((r) => localDateKey(r.startDate) === today);
        const checkOutToday = mine.filter((r) => localDateKey(r.endDate) === today);
        const checkInTomorrow = mine.filter((r) => localDateKey(r.startDate) === tomorrow);
        const lines: string[] = [];
        if (checkInToday.length)
          lines.push(`Check-in hoje: ${checkInToday.map((r) => `${guest(r)}${r.checkInTime ? ` (${r.checkInTime})` : ""}`).join(", ")}`);
        if (checkOutToday.length)
          lines.push(`Check-out hoje: ${checkOutToday.map((r) => `${guest(r)}${r.checkOutTime ? ` (${r.checkOutTime})` : ""}`).join(", ")}`);
        if (checkInTomorrow.length) lines.push(`Check-in amanhã: ${checkInTomorrow.map(guest).join(", ")}`);
        if (lines.length === 0) continue;
        await sendOnce(userId, `daily:rentals:${entity.id}:${today}`, {
          title: `🏠 ${entity.name} — reservas`,
          body: lines.join(" · "),
          url: `/rentals/${entity.id}`,
          tag: `daily-rentals-${entity.id}-${today}`,
        });
      }
    }
  }
}
