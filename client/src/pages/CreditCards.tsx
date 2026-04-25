import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  CreditCard,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CurrencyInput, parseCurrency } from "@/components/CurrencyInput";

// ─── Paleta de cores (mesma das categorias) ───────────────────────────────────
const COLOR_PALETTE = [
  "#EF4444","#F97316","#F59E0B","#EAB308","#84CC16","#22C55E",
  "#10B981","#14B8A6","#06B6D4","#3B82F6","#6366F1","#8B5CF6",
  "#A855F7","#D946EF","#EC4899","#F43F5E","#64748B","#374151",
  "#92400E","#065F46","#1E3A5F","#4C1D95","#831843","#7F1D1D",
  "#1F2937","#0F172A","#134E4A","#1E40AF","#5B21B6","#9D174D",
];

const BRAND_LABELS: Record<string, string> = {
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  ELO: "Elo",
  AMERICAN_EXPRESS: "American Express",
  HIPERCARD: "Hipercard",
  OTHER: "Outra",
};

const BRAND_COLORS: Record<string, string> = {
  VISA: "#1A1F71",
  MASTERCARD: "#EB001B",
  ELO: "#FFD700",
  AMERICAN_EXPRESS: "#007BC1",
  HIPERCARD: "#CC0000",
  OTHER: "#6B7280",
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CreditCards() {
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);

  const { data: entities, isLoading: entitiesLoading } = trpc.entities.list.useQuery(undefined, {
    onSuccess: (data) => {
      if (!selectedEntityId && data && data.length > 0) {
        setSelectedEntityId(data[0].id);
      }
    },
  });

  if (!selectedEntityId && entities && entities.length > 0) {
    setSelectedEntityId(entities[0].id);
  }

  if (entitiesLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!entities || entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <CreditCard className="h-12 w-12 opacity-30" />
        <p>Nenhuma entidade encontrada. Crie uma entidade primeiro.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cartões de Crédito</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie seus cartões e acompanhe os limites</p>
        </div>
        {/* Seletor de entidade */}
        {entities.length > 1 && (
          <Select value={String(selectedEntityId)} onValueChange={(v) => setSelectedEntityId(Number(v))}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Selecione a entidade" />
            </SelectTrigger>
            <SelectContent>
              {entities.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedEntityId && (
        <CreditCardsContent entityId={selectedEntityId} />
      )}
    </div>
  );
}

// ─── Conteúdo da entidade selecionada ─────────────────────────────────────────
function CreditCardsContent({ entityId }: { entityId: number }) {
  const utils = trpc.useUtils();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<any>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; cardId: number | null }>({ open: false, cardId: null });

  const [form, setForm] = useState({
    name: "",
    brand: "OTHER" as string,
    lastFourDigits: "",
    creditLimit: "",
    closingDay: "1",
    dueDay: "10",
    color: "#7C3AED",
  });

  const { data: cards, isLoading } = trpc.creditCards.listByEntity.useQuery({ entityId });

  const createMutation = trpc.creditCards.create.useMutation({
    onSuccess: () => {
      utils.creditCards.listByEntity.invalidate({ entityId });
      toast.success("Cartão criado com sucesso!");
      setSheetOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.creditCards.update.useMutation({
    onSuccess: () => {
      utils.creditCards.listByEntity.invalidate({ entityId });
      toast.success("Cartão atualizado!");
      setSheetOpen(false);
      setEditingCard(null);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const deactivateMutation = trpc.creditCards.deactivate.useMutation({
    onSuccess: () => {
      utils.creditCards.listByEntity.invalidate({ entityId });
      toast.success("Cartão removido.");
      setDeleteDialog({ open: false, cardId: null });
    },
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setForm({ name: "", brand: "OTHER", lastFourDigits: "", creditLimit: "", closingDay: "1", dueDay: "10", color: "#7C3AED" });
  }

  function openCreate() {
    setEditingCard(null);
    resetForm();
    setSheetOpen(true);
  }

  function openEdit(card: any) {
    setEditingCard(card);
    setForm({
      name: card.name,
      brand: card.brand,
      lastFourDigits: card.lastFourDigits ?? "",
      creditLimit: String(card.creditLimit / 100),
      closingDay: String(card.closingDay),
      dueDay: String(card.dueDay),
      color: card.color ?? "#7C3AED",
    });
    setSheetOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const limitValue = parseCurrency(form.creditLimit);
    if (editingCard) {
      updateMutation.mutate({
        id: editingCard.id,
        name: form.name,
        brand: form.brand as any,
        lastFourDigits: form.lastFourDigits || undefined,
        creditLimit: limitValue,
        closingDay: Number(form.closingDay),
        dueDay: Number(form.dueDay),
        color: form.color,
      });
    } else {
      createMutation.mutate({
        entityId,
        name: form.name,
        brand: form.brand as any,
        lastFourDigits: form.lastFourDigits || undefined,
        creditLimit: limitValue,
        closingDay: Number(form.closingDay),
        dueDay: Number(form.dueDay),
        color: form.color,
      });
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
      </div>
    );
  }

  return (
    <>
      {/* Grid de cartões */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Botão de adicionar */}
        <button
          onClick={openCreate}
          className="h-52 rounded-2xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30 transition-all flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary group"
        >
          <div className="h-10 w-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
            <Plus className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium">Novo Cartão</span>
        </button>

        {/* Cards dos cartões */}
        {cards?.map((card) => (
          <CreditCardCard
            key={card.id}
            card={card}
            onEdit={() => openEdit(card)}
            onDelete={() => setDeleteDialog({ open: true, cardId: card.id })}
          />
        ))}
      </div>

      {/* Sheet de criação/edição */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) { setEditingCard(null); resetForm(); } }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <SheetTitle>{editingCard ? "Editar Cartão" : "Novo Cartão"}</SheetTitle>
            <Button variant="ghost" size="icon" onClick={() => setSheetOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Preview do cartão */}
            <div
              className="h-36 rounded-2xl p-5 flex flex-col justify-between text-white shadow-lg"
              style={{ background: `linear-gradient(135deg, ${form.color}dd, ${form.color}88)` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium opacity-80">{BRAND_LABELS[form.brand] || "Cartão"}</span>
                <CreditCard className="h-6 w-6 opacity-70" />
              </div>
              <div>
                <p className="text-lg font-bold tracking-wider">
                  {form.lastFourDigits ? `•••• •••• •••• ${form.lastFourDigits}` : "•••• •••• •••• ••••"}
                </p>
                <p className="text-sm opacity-80 mt-1">{form.name || "Nome do cartão"}</p>
              </div>
            </div>

            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome do Cartão *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Nubank Roxinho"
                required
              />
            </div>

            {/* Bandeira */}
            <div className="space-y-1.5">
              <Label>Bandeira</Label>
              <Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(BRAND_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Últimos 4 dígitos */}
            <div className="space-y-1.5">
              <Label>Últimos 4 Dígitos</Label>
              <Input
                value={form.lastFourDigits}
                onChange={(e) => setForm({ ...form, lastFourDigits: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                placeholder="Ex: 1234"
                maxLength={4}
              />
            </div>

            {/* Limite */}
            <div className="space-y-1.5">
              <Label>Limite de Crédito</Label>
              <CurrencyInput
                value={form.creditLimit}
                onChange={(v) => setForm({ ...form, creditLimit: v })}
                placeholder="R$ 0,00"
              />
            </div>

            {/* Dia de fechamento e vencimento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dia de Fechamento</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.closingDay}
                  onChange={(e) => setForm({ ...form, closingDay: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Dia de Vencimento</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.dueDay}
                  onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                />
              </div>
            </div>

            {/* Cor */}
            <div className="space-y-2">
              <Label>Cor do Cartão</Label>
              <div className="grid grid-cols-10 gap-1.5">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-7 w-7 rounded-full transition-all hover:scale-110 ${form.color === color ? "ring-2 ring-offset-2 ring-gray-900 dark:ring-white scale-110" : ""}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setForm({ ...form, color })}
                  />
                ))}
              </div>
            </div>

            </div>
            <div className="px-6 py-4 border-t shrink-0">
              <Button
                type="submit"
                className="w-full"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Salvando..."
                  : editingCard ? "Salvar Alterações" : "Criar Cartão"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(o) => setDeleteDialog({ open: o, cardId: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Cartão?</AlertDialogTitle>
            <AlertDialogDescription>
              O cartão será desativado. As transações vinculadas a ele serão mantidas no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteDialog.cardId && deactivateMutation.mutate({ id: deleteDialog.cardId })}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Card visual de um cartão ─────────────────────────────────────────────────
function CreditCardCard({ card, onEdit, onDelete }: { card: any; onEdit: () => void; onDelete: () => void }) {
  const { data: summary } = trpc.creditCards.getSummary.useQuery({ cardId: card.id });

  const usagePercent = summary?.usagePercent ?? 0;
  const usedAmount = summary?.usedAmount ?? 0;
  const availableLimit = summary?.availableLimit ?? card.creditLimit;
  const dueDate = summary?.dueDate ? new Date(summary.dueDate) : null;

  const usageColor = usagePercent >= 90 ? "bg-red-500" : usagePercent >= 70 ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="rounded-2xl overflow-hidden shadow-md border border-border/50 flex flex-col">
      {/* Topo colorido — visual do cartão */}
      <div
        className="h-32 p-4 flex flex-col justify-between text-white relative"
        style={{ background: `linear-gradient(135deg, ${card.color}dd, ${card.color}88)` }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold opacity-80 uppercase tracking-wider">{BRAND_LABELS[card.brand]}</span>
          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="h-6 w-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={onDelete}
              className="h-6 w-6 rounded-full bg-white/20 hover:bg-red-500/60 flex items-center justify-center transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div>
          <p className="text-sm font-bold tracking-wider opacity-90">
            {card.lastFourDigits ? `•••• ${card.lastFourDigits}` : "••••"}
          </p>
          <p className="text-sm font-semibold mt-0.5">{card.name}</p>
        </div>
      </div>

      {/* Corpo — informações de limite */}
      <div className="p-4 space-y-3 bg-card flex-1">
        {/* Barra de uso */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Limite usado</span>
            <span className="font-medium text-foreground">{usagePercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${usageColor}`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Valores */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Utilizado</p>
            <p className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(usedAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Disponível</p>
            <p className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(availableLimit)}</p>
          </div>
        </div>

        {/* Vencimento */}
        {dueDate && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border/50">
            <Clock className="h-3 w-3" />
            <span>Vence em {format(dueDate, "dd 'de' MMMM", { locale: ptBR })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
