import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Eye, EyeOff } from "lucide-react";
import { computeMonthRentalStats, type RentalLike } from "@/lib/rentalStats";

// Mesmas cores das barras do calendário (Rentals.tsx → getSourceColor)
const SEGMENTS = [
  { key: "AIRBNB", label: "Airbnb", color: "#F87171" },
  { key: "DIRECT", label: "Direto", color: "#93C5FD" },
  { key: "BLOCKED", label: "Bloqueado", color: "#9CA3AF" },
  { key: "FREE", label: "Livre", color: "#E5E7EB" },
] as const;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const HIDDEN = "R$ ••••••";

/** Resumo do mês no calendário de Reservas: faturamento, ocupação e origem das noites. */
export function RentalMonthSummary({
  rentals,
  month,
  showValues,
  onToggleValues,
}: {
  rentals: RentalLike[];
  month: Date;
  showValues: boolean;
  onToggleValues: () => void;
}) {
  const stats = useMemo(
    () => computeMonthRentalStats(rentals, month.getFullYear(), month.getMonth() + 1),
    [rentals, month.getFullYear(), month.getMonth()],
  );
  const pct = (n: number) => (stats.nightsInMonth ? Math.round((n / stats.nightsInMonth) * 100) : 0);
  const money = (cents: number) => (showValues ? brl.format(cents / 100) : HIDDEN);
  const booked = stats.nights.AIRBNB + stats.nights.DIRECT;

  return (
    <div className="rounded-2xl border border-[#ECECEF] dark:border-[#2C2C3C] bg-white dark:bg-[#1C1C24] p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-[#6B6B75] dark:text-gray-400 first-letter:uppercase">
          Resumo de {format(month, "MMMM", { locale: ptBR })}
        </p>
        <button
          type="button"
          onClick={onToggleValues}
          aria-label={showValues ? "Ocultar valores" : "Mostrar valores"}
          title={showValues ? "Ocultar valores" : "Mostrar valores"}
          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-[#6B6B75] hover:bg-[#F6F6F8] dark:text-gray-400 dark:hover:bg-[#252532]"
        >
          {showValues ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        </button>
      </div>

      {/* Faturamento + ocupação */}
      <div className="mt-1 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className="text-[12px] text-[#8A8A92]">Faturamento</p>
          <p className="truncate text-[24px] md:text-[28px] font-bold tabular-nums leading-tight text-[#16161A] dark:text-gray-100">
            {money(stats.revenueCents)}
          </p>
          <p className="truncate text-[12px] text-[#8A8A92]">
            {stats.reservations} {stats.reservations === 1 ? "reserva" : "reservas"}
          </p>
          {stats.averageDailyRateCents !== null && (
            <p className="truncate text-[12px] text-[#8A8A92]">Diária média {money(stats.averageDailyRateCents)}</p>
          )}
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[12px] text-[#8A8A92]">Ocupação</p>
          <p className="text-[24px] md:text-[28px] font-bold tabular-nums leading-tight text-[#1661B5] dark:text-blue-300">
            {stats.occupancyPct}%
          </p>
          <p className="text-[12px] text-[#8A8A92]">{booked} de {stats.nightsInMonth} noites</p>
        </div>
      </div>

      {/* Barra de origem das noites */}
      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-[#F1F1F4] dark:bg-[#2C2C3C]">
        {SEGMENTS.map((s) => {
          const n = stats.nights[s.key];
          return n > 0 ? (
            <div key={s.key} style={{ width: `${(n / stats.nightsInMonth) * 100}%`, background: s.color }} title={`${s.label}: ${n} noites`} />
          ) : null;
        })}
      </div>

      {/* Legenda: % das noites do mês */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
        {SEGMENTS.map((s) => {
          const n = stats.nights[s.key];
          const revenue = s.key === "AIRBNB" || s.key === "DIRECT" ? stats.revenueBySource[s.key] : null;
          return (
            <div key={s.key} className="flex min-w-0 items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <div className="min-w-0">
                <p className="text-[13px] text-[#16161A] dark:text-gray-100">
                  {s.label} <span className="font-semibold tabular-nums">{pct(n)}%</span>
                </p>
                <p className="truncate text-[12px] text-[#8A8A92] tabular-nums">
                  {n} {n === 1 ? "noite" : "noites"}
                  {revenue !== null && revenue > 0 && ` · ${money(revenue)}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
