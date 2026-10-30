/**
 * Resumo mensal das reservas (calendário de Reservas).
 *
 * - Noites: cada dia D do mês representa a noite D→D+1; a reserva ocupa as
 *   noites de startDate até endDate (exclusivo — dia do check-out fica livre),
 *   mesma regra dos Relatórios. Reserva de um dia só conta 1 noite.
 * - Faturamento: soma de totalAmount das reservas (Airbnb/Direto) cuja data de
 *   competência (CHECK_IN = início, CHECK_OUT = fim) cai no mês.
 * - Ocupação: noites reservadas (Airbnb + Direto) ÷ noites do mês.
 */
export type RentalLike = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  source: "AIRBNB" | "DIRECT" | "BLOCKED" | string;
  totalAmount?: number | null; // centavos
  competencyDate?: string | null;
};

export type MonthRentalStats = {
  nightsInMonth: number;
  nights: { AIRBNB: number; DIRECT: number; BLOCKED: number; FREE: number };
  occupancyPct: number;
  revenueCents: number;
  revenueBySource: { AIRBNB: number; DIRECT: number };
  reservations: number;
  /** Diária média das reservas faturadas no mês (centavos), ou null. */
  averageDailyRateCents: number | null;
};

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function nightsBetween(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000));
}

export function computeMonthRentalStats(rentals: RentalLike[], year: number, month: number): MonthRentalStats {
  const daysInMonth = new Date(year, month, 0).getDate();
  const nights = { AIRBNB: 0, DIRECT: 0, BLOCKED: 0, FREE: 0 };

  for (let d = 1; d <= daysInMonth; d++) {
    const day = ymd(year, month, d);
    // Se houver sobreposição, reserva paga tem prioridade sobre bloqueio
    let state: "AIRBNB" | "DIRECT" | "BLOCKED" | null = null;
    for (const r of rentals) {
      const start = r.startDate.slice(0, 10);
      const end = r.endDate.slice(0, 10);
      const occupies = start === end ? day === start : day >= start && day < end;
      if (!occupies) continue;
      if (r.source === "AIRBNB" || r.source === "DIRECT") {
        state = r.source;
        break;
      }
      if (r.source === "BLOCKED") state = "BLOCKED";
    }
    nights[state ?? "FREE"]++;
  }

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  let revenueCents = 0;
  let billedNights = 0;
  let reservations = 0;
  const revenueBySource = { AIRBNB: 0, DIRECT: 0 };
  for (const r of rentals) {
    if (r.source !== "AIRBNB" && r.source !== "DIRECT") continue;
    const competency = r.competencyDate === "CHECK_OUT" ? r.endDate : r.startDate;
    if (!competency.startsWith(monthPrefix)) continue;
    const amount = r.totalAmount ?? 0;
    revenueCents += amount;
    revenueBySource[r.source] += amount;
    reservations++;
    if (amount > 0) billedNights += nightsBetween(r.startDate.slice(0, 10), r.endDate.slice(0, 10));
  }

  const booked = nights.AIRBNB + nights.DIRECT;
  return {
    nightsInMonth: daysInMonth,
    nights,
    occupancyPct: daysInMonth ? Math.round((booked / daysInMonth) * 100) : 0,
    revenueCents,
    revenueBySource,
    reservations,
    averageDailyRateCents: billedNights > 0 ? Math.round(revenueCents / billedNights) : null,
  };
}
