import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BedDouble, CalendarCheck, Eye, EyeOff, Receipt } from "lucide-react";
import { computeMonthRentalStats, type RentalLike } from "@/lib/rentalStats";

// Mesmas cores das barras do calendário (Rentals.tsx → getSourceColor)
const SEGMENTS = [
  { key: "AIRBNB", label: "Airbnb", color: "#F87171" },
  { key: "DIRECT", label: "Direto", color: "#93C5FD" },
  { key: "BLOCKED", label: "Bloqueado", color: "#9CA3AF" },
  { key: "FREE", label: "Livre", color: "#E5E7EB" },
] as const;

const BRAND = "#1661B5";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const HIDDEN = "R$ ••••••";

/** Anel de ocupação (SVG), com a porcentagem no centro. */
function OccupancyRing({ pct }: { pct: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" strokeWidth="8" className="stroke-[#EEF2F8] dark:stroke-[#2C2C3C]" />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke={BRAND}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[20px] font-bold tabular-nums leading-none text-[#16161A] dark:text-gray-100">{pct}%</span>
        <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-[#8A8A92]">ocupação</span>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#F6F8FC] px-3 py-2.5 dark:bg-[#252532]">
      <div className="flex items-center gap-1.5 text-[#1661B5] dark:text-blue-300">
        {icon}
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-[#6B6B75] dark:text-gray-400">{label}</span>
      </div>
      <p className="mt-1 truncate text-[15px] font-semibold tabular-nums text-[#16161A] dark:text-gray-100">{value}</p>
    </div>
  );
}

/** Resumo do mês no calendário de Reservas: faturamento, ocupação e origem das noites. */
export function RentalMonthSummary({
  rentals,
  month,
  showValues,
  onToggleValues,
  className = "",
}: {
  rentals: RentalLike[];
  month: Date;
  showValues: boolean;
  onToggleValues: () => void;
  className?: string;
}) {
  const stats = useMemo(
    () => computeMonthRentalStats(rentals, month.getFullYear(), month.getMonth() + 1),
    [rentals, month.getFullYear(), month.getMonth()],
  );
  const pct = (n: number) => (stats.nightsInMonth ? Math.round((n / stats.nightsInMonth) * 100) : 0);
  const money = (cents: number) => (showValues ? brl.format(cents / 100) : HIDDEN);
  const booked = stats.nights.AIRBNB + stats.nights.DIRECT;

  return (
    <section
      className={`rounded-2xl border border-[#ECECEF] dark:border-[#2C2C3C] bg-white dark:bg-[#1C1C24] p-4 md:p-6 ${className}`}
      aria-label={`Resumo de ${format(month, "MMMM", { locale: ptBR })}`}
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A8A92]">Resumo do mês</p>
          <h2 className="text-[17px] font-semibold text-[#16161A] dark:text-gray-100 first-letter:uppercase">
            {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
          </h2>
        </div>
        <button
          type="button"
          onClick={onToggleValues}
          aria-label={showValues ? "Ocultar valores" : "Mostrar valores"}
          title={showValues ? "Ocultar valores" : "Mostrar valores"}
          className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ECECEF] text-[#6B6B75] transition-colors hover:bg-[#F6F6F8] dark:border-[#2C2C3C] dark:text-gray-400 dark:hover:bg-[#252532]"
        >
          {showValues ? <Eye className="h-[18px] w-[18px]" /> : <EyeOff className="h-[18px] w-[18px]" />}
        </button>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
        {/* Faturamento + ocupação + indicadores */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] text-[#6B6B75] dark:text-gray-400">Faturamento</p>
              <p className="truncate text-[28px] md:text-[32px] font-bold tabular-nums leading-tight tracking-tight text-[#16161A] dark:text-gray-100">
                {money(stats.revenueCents)}
              </p>
            </div>
            <OccupancyRing pct={stats.occupancyPct} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Kpi icon={<Receipt className="h-3.5 w-3.5 shrink-0" />} label="Reservas" value={String(stats.reservations)} />
            <Kpi
              icon={<BedDouble className="h-3.5 w-3.5 shrink-0" />}
              label="Diária"
              value={stats.averageDailyRateCents !== null ? money(stats.averageDailyRateCents) : "—"}
            />
            <Kpi icon={<CalendarCheck className="h-3.5 w-3.5 shrink-0" />} label="Noites" value={`${booked}/${stats.nightsInMonth}`} />
          </div>
        </div>

        {/* Origem das noites */}
        <div className="min-w-0 md:border-l md:border-[#ECECEF] md:pl-8 md:dark:border-[#2C2C3C]">
          <p className="text-[13px] text-[#6B6B75] dark:text-gray-400">Origem das noites</p>
          <div className="mt-2 flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full">
            {SEGMENTS.map((s) => {
              const n = stats.nights[s.key];
              return n > 0 ? (
                <div
                  key={s.key}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${(n / stats.nightsInMonth) * 100}%`, background: s.color }}
                  title={`${s.label}: ${n} noites`}
                />
              ) : null;
            })}
          </div>
          <ul className="mt-3 divide-y divide-[#F1F1F4] dark:divide-[#2C2C3C]">
            {SEGMENTS.map((s) => {
              const n = stats.nights[s.key];
              const revenue = s.key === "AIRBNB" || s.key === "DIRECT" ? stats.revenueBySource[s.key] : null;
              return (
                <li key={s.key} className="flex items-center gap-3 py-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="min-w-0 flex-1 text-[14px] text-[#16161A] dark:text-gray-100">
                    {s.label}
                    <span className="ml-1.5 text-[12px] text-[#8A8A92] tabular-nums">
                      {n} {n === 1 ? "noite" : "noites"}
                      {revenue !== null && revenue > 0 && <span className="sm:hidden"> · {money(revenue)}</span>}
                    </span>
                  </span>
                  {revenue !== null && (
                    <span className="hidden sm:inline text-[13px] tabular-nums text-[#6B6B75] dark:text-gray-400">{money(revenue)}</span>
                  )}
                  <span className="w-11 text-right text-[14px] font-semibold tabular-nums text-[#16161A] dark:text-gray-100">{pct(n)}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
