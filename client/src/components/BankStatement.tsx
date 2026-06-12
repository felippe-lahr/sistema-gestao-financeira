import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowUpRight,
  ArrowDownRight,
  Landmark,
  Wallet,
  TrendingUp,
  TrendingDown,
  CircleDot,
} from "lucide-react";

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

// yyyy-MM-dd no fuso local (evita salto de dia por UTC)
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Period = "thisMonth" | "lastMonth" | "next30" | "custom";

function periodRange(period: Period): { start: string; end: string } {
  const now = new Date();
  if (period === "thisMonth") {
    return {
      start: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (period === "lastMonth") {
    return {
      start: toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: toISODate(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  // próximos 30 dias
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  return { start: toISODate(now), end: toISODate(in30) };
}

export default function BankStatement({ entityId }: { entityId: number }) {
  const [accountId, setAccountId] = useState<"all" | number>("all");
  const [period, setPeriod] = useState<Period>("thisMonth");
  const [status, setStatus] = useState<"ALL" | "PAID" | "PENDING">("ALL");
  const [includeUnassigned, setIncludeUnassigned] = useState(false);
  const [customStart, setCustomStart] = useState(() => periodRange("thisMonth").start);
  const [customEnd, setCustomEnd] = useState(() => periodRange("thisMonth").end);

  const { data: accounts } = trpc.bankAccounts.listByEntity.useQuery({ entityId });

  const { start, end } = useMemo(() => {
    if (period === "custom") return { start: customStart, end: customEnd };
    return periodRange(period);
  }, [period, customStart, customEnd]);

  const { data, isLoading, isFetching } = trpc.bankAccounts.getStatement.useQuery({
    entityId,
    bankAccountId: accountId === "all" ? null : accountId,
    startDate: start,
    endDate: end,
    status,
    includeUnassigned: accountId === "all" ? includeUnassigned : false,
  });

  const summary = data?.summary;
  const entries = data?.entries ?? [];

  return (
    <div className="space-y-4">
      {/* ── Filtros ── */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Conta */}
            <div className="space-y-1.5">
              <Label className="text-xs">Conta</Label>
              <Select value={String(accountId)} onValueChange={(v) => setAccountId(v === "all" ? "all" : Number(v))}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as contas da entidade</SelectItem>
                  {accounts?.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color || "#2563EB" }} />
                        {a.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Período */}
            <div className="space-y-1.5">
              <Label className="text-xs">Período</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="thisMonth">Este mês</SelectItem>
                  <SelectItem value="lastMonth">Mês passado</SelectItem>
                  <SelectItem value="next30">Próximos 30 dias</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Datas personalizadas */}
            {period === "custom" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-xl" />
                </div>
              </>
            )}

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  <SelectItem value="PAID">Apenas realizadas</SelectItem>
                  <SelectItem value="PENDING">Apenas previstas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Incluir lançamentos sem conta (só faz sentido em "Todas as contas") */}
          {accountId === "all" && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeUnassigned}
                onChange={(e) => setIncludeUnassigned(e.target.checked)}
                className="rounded border-gray-300"
              />
              Incluir lançamentos sem conta vinculada (visão de caixa)
            </label>
          )}
        </CardContent>
      </Card>

      {/* ── Resumo ── */}
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : summary ? (
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Saldo projetado ao fim do período</p>
              <p className="text-3xl font-bold">{formatCurrency(summary.projectedBalance)}</p>
            </div>
            <Wallet className="h-8 w-8 text-blue-200" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/10 p-3">
              <p className="text-blue-100 text-xs">Saldo inicial do período</p>
              <p className="font-semibold">{formatCurrency(summary.openingBalance)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <p className="text-blue-100 text-xs">Saldo realizado (até agora)</p>
              <p className="font-semibold">{formatCurrency(summary.realizedBalance)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <p className="text-blue-100 text-xs flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Entradas</p>
              <p className="font-semibold">
                +{formatCurrency(summary.paidIn)}
                {summary.pendingIn > 0 && (
                  <span className="text-blue-200 font-normal text-xs"> (+{formatCurrency(summary.pendingIn)} prev.)</span>
                )}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <p className="text-blue-100 text-xs flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Saídas</p>
              <p className="font-semibold">
                -{formatCurrency(summary.paidOut)}
                {summary.pendingOut > 0 && (
                  <span className="text-blue-200 font-normal text-xs"> (-{formatCurrency(summary.pendingOut)} prev.)</span>
                )}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Extrato ── */}
      <Card className="rounded-2xl">
        <CardContent className="p-0">
          {/* Linha de saldo inicial */}
          {summary && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-dashed border-gray-200 dark:border-gray-700 text-sm">
              <span className="text-muted-foreground">Saldo inicial do período</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(summary.openingBalance)}</span>
            </div>
          )}

          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-14 text-center">
              <Landmark className="h-10 w-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-muted-foreground">Nenhum lançamento no período selecionado.</p>
            </div>
          ) : (
            <div className={`divide-y divide-gray-100 dark:divide-gray-800 ${isFetching ? "opacity-60" : ""}`}>
              {entries.map((t) => {
                const isPending = t.status !== "PAID";
                const isIncome = t.type === "INCOME";
                return (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    {/* Ícone tipo */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isIncome ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"
                      }`}
                    >
                      {isIncome ? (
                        <ArrowUpRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-600" />
                      )}
                    </div>

                    {/* Descrição */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {t.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(new Date(t.dueDate as any), "dd/MM/yy", { locale: ptBR })}</span>
                        {t.bankAccountName && <span>• {t.bankAccountName}</span>}
                        {isPending && (
                          <Badge variant="secondary" className="text-[10px] py-0 h-4 gap-1">
                            <CircleDot className="h-2.5 w-2.5" /> Previsto
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Valor + saldo corrido */}
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${isIncome ? "text-green-600" : "text-red-600"} ${isPending ? "opacity-70" : ""}`}>
                        {isIncome ? "+" : "-"}{formatCurrency(t.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(t.runningBalance)}</p>
                    </div>
                  </div>
                );
              })}

              {/* Linha de saldo final */}
              {summary && (
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Saldo projetado ao fim</span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(summary.projectedBalance)}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
