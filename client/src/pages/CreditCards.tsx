import { useState, useCallback } from "react";
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
  Banknote,
  FileUp,
  Loader2,
  Upload,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CurrencyInput, parseCurrency } from "@/components/CurrencyInput";
import { CategorySelect } from "@/components/CategorySelect";

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

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

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
type PdfImportStep = "upload" | "review" | "done";
type PdfTransaction = {
  description: string;
  amount: number;
  is_negative?: boolean;
  purchase_date: string | null;
  date: string | null; // legado
  installment: string | null;
  installment_current: number | null;
  installment_total: number | null;
  category_hint: string | null;
  is_duplicate: boolean;
  has_future_installments: boolean;
  selected: boolean;
  categoryId: number | null;
};

function CreditCardsContent({ entityId }: { entityId: number }) {
  const utils = trpc.useUtils();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<any>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; cardId: number | null; cardName?: string }>({ open: false, cardId: null });
  const { data: txCountData } = trpc.creditCards.getTransactionCount.useQuery(
    { id: deleteDialog.cardId! },
    { enabled: deleteDialog.open && !!deleteDialog.cardId }
  );
  // PDF/CSV Import state
  const [pdfSheetOpen, setPdfSheetOpen] = useState(false);
  const [importType, setImportType] = useState<"pdf" | "csv">("pdf");
  const [pdfStep, setPdfStep] = useState<PdfImportStep>("upload");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvIsDragging, setCsvIsDragging] = useState(false);
  const [pdfCardId, setPdfCardId] = useState<string>("");
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfTransactions, setPdfTransactions] = useState<PdfTransaction[]>([]);
  const [pdfInvoiceMonth, setPdfInvoiceMonth] = useState<number | null>(null);
  const [pdfInvoiceYear, setPdfInvoiceYear] = useState<number | null>(null);
  const [pdfInvoiceDueDate, setPdfInvoiceDueDate] = useState<string | null>(null);
  const [pdfInvoiceTotal, setPdfInvoiceTotal] = useState<number | null>(null);
  const [pdfImportedCount, setPdfImportedCount] = useState<number>(0);
  const [pdfSkippedCount, setPdfSkippedCount] = useState<number>(0);
  const [pdfIsDragging, setPdfIsDragging] = useState(false);
  const [pdfPassword, setPdfPassword] = useState<string>("");
  const [pdfPasswordRequired, setPdfPasswordRequired] = useState(false);
  const [pdfWrongPassword, setPdfWrongPassword] = useState(false);
  const { data: categories } = trpc.categories.listByEntity.useQuery({ entityId }, { enabled: pdfSheetOpen });
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
  function handleDeleteCard(deleteTransactions: boolean) {
    if (!deleteDialog.cardId) return;
    deactivateMutation.mutate({ id: deleteDialog.cardId, deleteTransactions });
  }
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
  async function handlePdfFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Apenas arquivos PDF são aceitos");
      return;
    }
    setPdfFile(file);
  }
  async function handlePdfParse() {
    if (!pdfFile || !pdfCardId) {
      toast.error("Selecione o cartão e o arquivo PDF");
      return;
    }
    const selectedCard = cards?.find((c: any) => String(c.id) === pdfCardId);
    setPdfParsing(true);
    setPdfWrongPassword(false);
    try {
      const formData = new FormData();
      formData.append("file", pdfFile);
      formData.append("cardName", selectedCard?.name || "Cartão de Crédito");
      if (selectedCard?.id) formData.append("creditCardId", String(selectedCard.id));
      if (pdfPassword) formData.append("pdfPassword", pdfPassword);
      const res = await fetch("/api/credit-cards/import-pdf", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        if (err.code === "PASSWORD_REQUIRED") {
          setPdfPasswordRequired(true);
          return;
        }
        if (err.code === "WRONG_PASSWORD") {
          setPdfWrongPassword(true);
          setPdfPasswordRequired(true);
          return;
        }
        throw new Error(err.error || "Erro ao processar PDF");
      }
      const data = await res.json();
      setPdfTransactions((data.transactions || []).map((tx: any) => ({
        ...tx,
        // Duplicatas e créditos negativos (IOF de volta, pagamentos antecipados) começam desmarcados
        selected: !tx.is_duplicate && !tx.is_negative,
        categoryId: null,
      })));
      setPdfInvoiceMonth(data.invoiceMonth);
      setPdfInvoiceYear(data.invoiceYear);
      setPdfInvoiceDueDate(data.invoiceDueDate ?? null);
      setPdfInvoiceTotal(data.invoiceTotal ?? null);
      setPdfStep("review");
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar o PDF");
    } finally {
      setPdfParsing(false);
    }
  }
  async function handleCsvFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Apenas arquivos CSV são aceitos");
      return;
    }
    setCsvFile(file);
  }
  async function handleCsvParse() {
    if (!csvFile || !pdfCardId) {
      toast.error("Selecione o cartão e o arquivo CSV");
      return;
    }
    const selectedCard = cards?.find((c: any) => String(c.id) === pdfCardId);
    setPdfParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("cardName", selectedCard?.name || "Cartão de Crédito");
      if (selectedCard?.id) formData.append("creditCardId", String(selectedCard.id));
      const res = await fetch("/api/credit-cards/import-csv", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao processar CSV");
      }
      const data = await res.json();
      setPdfTransactions((data.transactions || []).map((tx: any) => ({
        ...tx,
        // Duplicatas e créditos negativos (IOF de volta, pagamentos antecipados) começam desmarcados
        selected: !tx.is_duplicate && !tx.is_negative,
        categoryId: null,
      })));
      setPdfInvoiceMonth(data.invoiceMonth);
      setPdfInvoiceYear(data.invoiceYear);      setPdfInvoiceDueDate(data.invoiceDueDate ?? null);
      setPdfInvoiceTotal(data.invoiceTotal ?? null);
      setPdfStep("review");
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar o CSV");    } finally {
      setPdfParsing(false);
    }
  }
  async function handlePdfImport() {
    const selectedCard = cards?.find((c: any) => String(c.id) === pdfCardId);
    if (!selectedCard) return;
    const toImport = pdfTransactions.filter((tx) => tx.selected && !tx.is_duplicate);
    if (toImport.length === 0) {
      toast.error("Selecione ao menos uma transação para importar");
      return;
    }
    setPdfImporting(true);
    let importedCount = 0;
    let skippedCount = pdfTransactions.filter(tx => tx.is_duplicate).length;
    try {
      // Função para calcular dueDate de uma transação importada do PDF.
      // PRIORIDADE: quando importamos um PDF, já sabemos a qual fatura pertence —
      // é a fatura cujo vencimento está no PDF (invoiceDueDate). Usamos esse valor
      // como dueDate para TODAS as transações da fatura importada.
      // A lógica de calcDueDate por closingDay só é usada como fallback quando
      // não temos o invoiceDueDate (ex: PDF sem data de vencimento legível).
      const dueDay = selectedCard.dueDay || 10;
      // Data de vencimento da fatura importada (fonte primária)
      const invoiceBaseDueDate = pdfInvoiceDueDate
        ? new Date(pdfInvoiceDueDate + "T12:00:00")
        : pdfInvoiceMonth && pdfInvoiceYear
          ? new Date(pdfInvoiceYear, pdfInvoiceMonth - 1, dueDay, 12, 0, 0)
          : null;

      const calcDueDate = (_purchaseDateStr: string | null): Date => {
        // Se temos o vencimento da fatura do PDF, sempre usar ele.
        // Isso garante que IOF, juros, encargos e compras normais
        // fiquem na fatura correta, independentemente da data da compra.
        if (invoiceBaseDueDate) return invoiceBaseDueDate;
        // Fallback: calcular pelo closingDay do cartão (usado quando o PDF
        // não tem data de vencimento legível)
        const closingDay = selectedCard.closingDay || 1;
        if (!_purchaseDateStr) return new Date();
        const purchase = new Date(_purchaseDateStr + "T12:00:00");
        let dueMonth = purchase.getMonth();
        let dueYear = purchase.getFullYear();
        if (purchase.getDate() >= closingDay) {
          dueMonth += 2;
        } else {
          dueMonth += 1;
        }
        if (dueMonth > 11) { dueMonth = dueMonth - 12; dueYear += 1; }
        if (dueMonth > 11) { dueMonth = dueMonth - 12; dueYear += 1; }
        return new Date(dueYear, dueMonth, dueDay, 12, 0, 0);
      };

      for (const tx of toImport) {
        const installCurrent = tx.installment_current;
        const installTotal = tx.installment_total;
        const isInstallment = installCurrent != null && installTotal != null;
        // Transações negativas (estornos, IOF de volta) são salvas como INCOME
        const txType = tx.is_negative ? "INCOME" : "EXPENSE";

        // Data da compra (para registro histórico)
        const purchaseDate = tx.purchase_date ? new Date(tx.purchase_date + "T12:00:00") : undefined;
        // dueDate calculado pela lógica de fechamento/vencimento do cartão
        const baseDueDate = calcDueDate(tx.purchase_date);

        if (isInstallment && tx.has_future_installments) {
          // Para parcelamentos em andamento (ex: parcela 8/12), o dueDate da parcela atual
          // é o mês da fatura importada (não calculado pela data original da compra).
          // As parcelas futuras avançam mês a mês a partir daí.
          // Usa invoiceBaseDueDate do escopo externo (vencimento da fatura do PDF).
          const installBaseDueDate = invoiceBaseDueDate ?? baseDueDate;
          const remainingInstallments = installTotal! - installCurrent!;
          // Parcela atual (do mês da fatura)
          await utils.client.transactions.create.mutate({
            entityId,
            type: txType,
            description: `${tx.description} (${installCurrent}/${installTotal})`,
            amount: tx.amount / 100,
            dueDate: installBaseDueDate,
            purchaseDate,
            status: "PENDING",
            categoryId: tx.categoryId ?? undefined,
            creditCardId: selectedCard.id,
            isRecurring: false,
          });
          importedCount++;
          // Criar apenas as parcelas RESTANTES nos meses seguintes
          for (let i = 1; i <= remainingInstallments; i++) {
            const futureDate = new Date(installBaseDueDate);
            futureDate.setMonth(futureDate.getMonth() + i);
            await utils.client.transactions.create.mutate({
              entityId,
              type: txType,
              description: `${tx.description} (${installCurrent! + i}/${installTotal})`,
              amount: tx.amount / 100,
              dueDate: futureDate,
              purchaseDate,
              status: "PENDING",
              categoryId: tx.categoryId ?? undefined,
              creditCardId: selectedCard.id,
              isRecurring: false,
            });
            importedCount++;
          }
        } else {
          // Transação à vista ou última parcela
          const description = isInstallment
            ? `${tx.description} (${installCurrent}/${installTotal})`
            : tx.description;
          await utils.client.transactions.create.mutate({
            entityId,
            type: txType,
            description,
            amount: tx.amount / 100,
            dueDate: baseDueDate,
            purchaseDate,
            status: "PENDING",
            categoryId: tx.categoryId ?? undefined,
            creditCardId: selectedCard.id,
            isRecurring: false,
          });
          importedCount++;
        }
      }
      setPdfImportedCount(importedCount);
      setPdfSkippedCount(skippedCount);
      setPdfStep("done");
      utils.creditCards.getSummary.invalidate({ cardId: selectedCard.id });
      utils.creditCards.getInvoicesByMonth.invalidate({ cardId: selectedCard.id });
      utils.transactions.listByEntity.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar transações");
    } finally {
      setPdfImporting(false);
    }
  }
  function closePdfSheet() {
    setPdfSheetOpen(false);
    setPdfStep("upload");
    setPdfFile(null);
    setCsvFile(null);
    setImportType("pdf");
    setPdfCardId("");
    setPdfTransactions([]);
    setPdfInvoiceMonth(null);
    setPdfInvoiceYear(null);
    setPdfInvoiceDueDate(null);
    setPdfInvoiceTotal(null);
    setPdfImportedCount(0);
    setPdfSkippedCount(0);
    setPdfPassword("");
    setPdfPasswordRequired(false);
    setPdfWrongPassword(false);
  }
  return (
    <>
      {/* Botão de importar fatura */}
      <div className="flex justify-end mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setPdfSheetOpen(true); setPdfStep("upload"); }}
          className="flex items-center gap-2"
        >
          <FileUp className="h-4 w-4" />
          Importar Fatura
        </Button>
      </div>
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
            entityId={entityId}
            onEdit={() => openEdit(card)}
            onDelete={() => setDeleteDialog({ open: true, cardId: card.id, cardName: card.name })}
          />
        ))}
      </div>
      {/* Sheet de criação/edição */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) { setEditingCard(null); resetForm(); } }}>
        <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col">
          {/* Header Fixo */}
          <div className="sticky top-0 z-10 border-b bg-white dark:bg-gray-800 px-8 py-4 flex items-center justify-between">
            <SheetTitle className="text-2xl font-bold">{editingCard ? "Editar Cartão" : "Novo Cartão"}</SheetTitle>
            <button onClick={() => setSheetOpen(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300">
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
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
            {/* Footer Fixo */}
            <div className="sticky bottom-0 z-10 border-t bg-white dark:bg-gray-800 px-8 py-4 flex gap-2 justify-end">
              <Button variant="outline" type="button" onClick={() => setSheetOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
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
      {/* Sheet de importação de PDF */}
      <Sheet open={pdfSheetOpen} onOpenChange={(o) => { if (!o) closePdfSheet(); }}>
        <SheetContent side="right" className="w-full sm:w-[700px] flex flex-col">
          {/* Header */}
          <div className="sticky top-0 z-10 border-b bg-white dark:bg-gray-800 px-8 py-4 flex items-center justify-between">
            <SheetTitle className="text-xl font-bold flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              Importar Fatura
            </SheetTitle>
            <button onClick={closePdfSheet} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Steps indicator */}
          <div className="px-8 pt-4 flex items-center gap-2">
            {(["upload", "review", "done"] as PdfImportStep[]).map((step, i) => (
              <>
                <div key={step} className={`flex items-center gap-1.5 text-xs font-medium ${
                  pdfStep === step ? "text-primary" : i < ["upload","review","done"].indexOf(pdfStep) ? "text-green-600" : "text-muted-foreground"
                }`}>
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center text-xs ${
                    i < ["upload","review","done"].indexOf(pdfStep) ? "bg-green-600 text-white" : pdfStep === step ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {i < ["upload","review","done"].indexOf(pdfStep) ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  {step === "upload" ? "Upload" : step === "review" ? "Revisão" : "Concluído"}
                </div>
                {i < 2 && <div className="flex-1 h-px bg-border" />}
              </>
            ))}
          </div>
          {/* Conteúdo por step */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {pdfStep === "upload" && (
              <div className="space-y-5">
                {/* Seletor de tipo: PDF ou CSV */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setImportType("pdf"); setPdfFile(null); setCsvFile(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                      importType === "pdf" ? "border-primary bg-primary/5 text-primary" : "border-muted hover:border-primary/40 text-muted-foreground"
                    }`}
                  >
                    <FileUp className="h-4 w-4" />
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => { setImportType("csv"); setPdfFile(null); setCsvFile(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                      importType === "csv" ? "border-primary bg-primary/5 text-primary" : "border-muted hover:border-primary/40 text-muted-foreground"
                    }`}
                  >
                    <FileUp className="h-4 w-4" />
                    CSV
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {importType === "pdf"
                    ? "Selecione o cartão e faça upload da fatura em PDF. A IA irá extrair todas as transações automaticamente."
                    : "Selecione o cartão e faça upload do CSV exportado pelo banco (ex: Nubank). As transações serão importadas diretamente, sem IA."}
                </p>
                {/* Seletor de cartão */}
                <div className="space-y-2">
                  <Label>Cartão de Crédito *</Label>
                  <Select value={pdfCardId} onValueChange={setPdfCardId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cartão" />
                    </SelectTrigger>
                    <SelectContent>
                      {cards?.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color || "#7C3AED" }} />
                            {c.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Área de upload PDF */}
                {importType === "pdf" && (
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                      pdfIsDragging ? "border-primary bg-primary/5" : pdfFile ? "border-green-500 bg-green-50 dark:bg-green-900/10" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setPdfIsDragging(true); }}
                    onDragLeave={() => setPdfIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setPdfIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handlePdfFile(f); }}
                    onClick={() => document.getElementById("pdf-upload-input")?.click()}
                  >
                    <input
                      id="pdf-upload-input"
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfFile(f); }}
                    />
                    {pdfFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-10 w-10 text-green-500" />
                        <p className="font-medium text-green-700 dark:text-green-400">{pdfFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(pdfFile.size / 1024).toFixed(0)} KB</p>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setPdfFile(null); }} className="text-xs text-red-500 hover:underline">Remover</button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-10 w-10 text-muted-foreground/50" />
                        <p className="font-medium">Arraste o PDF aqui ou clique para selecionar</p>
                        <p className="text-xs text-muted-foreground">Fatura do cartão em formato PDF (máx. 15MB)</p>
                      </div>
                    )}
                  </div>
                )}
                {/* Campo de senha para PDF protegido */}
                {importType === "pdf" && pdfPasswordRequired && (
                  <div className="mt-3 space-y-2">
                    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${pdfWrongPassword ? "border-red-400 bg-red-50 dark:bg-red-900/10" : "border-amber-400 bg-amber-50 dark:bg-amber-900/10"}`}>
                      <span className="text-lg">{pdfWrongPassword ? "❌" : "🔒"}</span>
                      <span className={pdfWrongPassword ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}>
                        {pdfWrongPassword ? "Senha incorreta. Tente novamente." : "Este PDF está protegido por senha. Digite a senha para continuar."}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="Senha do PDF"
                        value={pdfPassword}
                        onChange={(e) => { setPdfPassword(e.target.value); setPdfWrongPassword(false); }}
                        onKeyDown={(e) => { if (e.key === "Enter" && pdfPassword) handlePdfParse(); }}
                        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        autoFocus
                      />
                      <Button
                        onClick={handlePdfParse}
                        disabled={!pdfPassword || pdfParsing}
                        className="bg-primary hover:bg-primary/90"
                      >
                        {pdfParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Desbloquear"}
                      </Button>
                    </div>
                  </div>
                )}
                {/* Área de upload CSV */}
                {importType === "csv" && (
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                      csvIsDragging ? "border-primary bg-primary/5" : csvFile ? "border-green-500 bg-green-50 dark:bg-green-900/10" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setCsvIsDragging(true); }}
                    onDragLeave={() => setCsvIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setCsvIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
                    onClick={() => document.getElementById("csv-upload-input")?.click()}
                  >
                    <input
                      id="csv-upload-input"
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }}
                    />
                    {csvFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-10 w-10 text-green-500" />
                        <p className="font-medium text-green-700 dark:text-green-400">{csvFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(csvFile.size / 1024).toFixed(0)} KB</p>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setCsvFile(null); }} className="text-xs text-red-500 hover:underline">Remover</button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-10 w-10 text-muted-foreground/50" />
                        <p className="font-medium">Arraste o CSV aqui ou clique para selecionar</p>
                        <p className="text-xs text-muted-foreground">Arquivo CSV exportado pelo banco (máx. 5MB)</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {pdfStep === "review" && (
              <div className="space-y-4">
                {/* Cabeçalho com resumo */}
                <div className="rounded-lg bg-muted/40 border p-3 space-y-1">
                  {pdfInvoiceMonth && pdfInvoiceYear && (
                    <p className="text-sm font-semibold">
                      Fatura {MONTH_NAMES[pdfInvoiceMonth - 1]}/{pdfInvoiceYear}
                      {pdfInvoiceDueDate && ` — Vencimento: ${new Date(pdfInvoiceDueDate + "T12:00:00").toLocaleDateString("pt-BR")}`}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="text-green-600 font-medium">✓ {pdfTransactions.filter(t => !t.is_duplicate && !t.is_negative).length} para importar</span>
                    {pdfTransactions.filter(t => !t.is_duplicate && t.is_negative).length > 0 && (
                      <span className="text-green-600 font-medium">↓ {pdfTransactions.filter(t => !t.is_duplicate && t.is_negative).length} crédito{pdfTransactions.filter(t => !t.is_duplicate && t.is_negative).length > 1 ? 's' : ''} (desmarcado{pdfTransactions.filter(t => !t.is_duplicate && t.is_negative).length > 1 ? 's' : ''})</span>
                    )}
                    {pdfTransactions.filter(t => t.is_duplicate).length > 0 && (
                      <span className="text-amber-600 font-medium">⚠ {pdfTransactions.filter(t => t.is_duplicate).length} já existem (serão ignoradas)</span>
                    )}
                    {pdfTransactions.filter(t => !t.is_duplicate && t.has_future_installments).length > 0 && (
                      <span className="text-blue-600 font-medium">↻ {pdfTransactions.filter(t => !t.is_duplicate && t.has_future_installments).length} com parcelas futuras</span>
                    )}
                  </div>
                  {/* Totais para conferência */}
                  {(() => {
                    const selected = pdfTransactions.filter(t => t.selected && !t.is_duplicate);
                    const totalDebits = selected.filter(t => !t.is_negative).reduce((s, t) => s + t.amount, 0);
                    const totalCredits = selected.filter(t => t.is_negative).reduce((s, t) => s + t.amount, 0);
                    const totalNet = totalDebits - totalCredits;
                    return (
                      <div className="flex flex-wrap gap-4 text-xs mt-1">
                        <span>Selecionado: <strong className="text-red-600">{formatCurrency(totalDebits)}</strong> débitos</span>
                        {totalCredits > 0 && <span>Créditos: <strong className="text-green-600">-{formatCurrency(totalCredits)}</strong></span>}
                        <span>Líquido: <strong>{formatCurrency(totalNet)}</strong></span>
                        {pdfInvoiceTotal != null && pdfInvoiceTotal > 0 && (
                          <span className={Math.abs(totalNet - pdfInvoiceTotal) < 10 ? "text-green-600" : "text-amber-600"}>
                            Fatura: <strong>{formatCurrency(pdfInvoiceTotal)}</strong>
                            {Math.abs(totalNet - pdfInvoiceTotal) >= 10 && ` (Δ ${formatCurrency(Math.abs(totalNet - pdfInvoiceTotal))})`}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {pdfTransactions.filter(t => t.selected && !t.is_duplicate).length} selecionadas para importar
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPdfTransactions(t => t.map(tx => ({ ...tx, selected: !tx.is_duplicate && !tx.is_negative })))} className="text-xs text-primary hover:underline">Selecionar novas</button>
                    <span className="text-muted-foreground">·</span>
                    <button type="button" onClick={() => setPdfTransactions(t => t.map(tx => ({ ...tx, selected: false })))} className="text-xs text-muted-foreground hover:underline">Desmarcar todas</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {pdfTransactions.map((tx, i) => (
                    <div key={i} className={`rounded-lg border p-3 transition-colors ${
                      tx.is_duplicate
                        ? "border-amber-200 bg-amber-50 dark:bg-amber-900/10 opacity-60"
                        : tx.selected
                          ? "border-primary/30 bg-primary/5"
                          : "border-border opacity-50"
                    }`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={tx.selected && !tx.is_duplicate}
                          disabled={tx.is_duplicate}
                          onChange={(e) => !tx.is_duplicate && setPdfTransactions(prev => prev.map((t, j) => j === i ? { ...t, selected: e.target.checked } : t))}
                          className="mt-1 h-4 w-4 rounded border-gray-300 accent-primary disabled:opacity-40"
                        />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium truncate">{tx.description}</p>
                            <p className={`text-sm font-bold flex-shrink-0 ${tx.is_negative ? "text-green-600" : "text-red-600"}`}>
                              {tx.is_negative ? "-" : ""}{formatCurrency(tx.amount)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            {tx.purchase_date && <span>Compra: {new Date(tx.purchase_date + "T12:00:00").toLocaleDateString("pt-BR")}</span>}
                            {tx.installment && (
                              <span className={`px-1.5 py-0.5 rounded font-medium ${
                                tx.has_future_installments ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-muted text-muted-foreground"
                              }`}>
                                Parcela {tx.installment}
                                {tx.has_future_installments && " → cria futuras"}
                              </span>
                            )}
                            {tx.is_duplicate && (
                              <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
                                Já importada
                              </span>
                            )}
                            {tx.category_hint && !tx.is_duplicate && <span className="text-primary/70">{tx.category_hint}</span>}
                          </div>
                          {/* Seletor de categoria (apenas para não-duplicatas) */}
                          {!tx.is_duplicate && (
                            <CategorySelect
                              categories={categories || []}
                              value={tx.categoryId ? String(tx.categoryId) : ""}
                              onValueChange={(v) => setPdfTransactions(prev => prev.map((t, j) => j === i ? { ...t, categoryId: v ? Number(v) : null } : t))}
                              filterType="EXPENSE"
                              placeholder="Categoria (opcional)"
                              triggerClassName="h-7 text-xs"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {pdfStep === "done" && (
              <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
                <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <p className="text-lg font-semibold">Importação concluída!</p>
                  <div className="text-sm text-muted-foreground mt-2 space-y-1">
                    <p><span className="text-green-600 font-medium">{pdfImportedCount} transação(s)</span> adicionadas ao cartão</p>
                    {pdfSkippedCount > 0 && (
                      <p><span className="text-amber-600 font-medium">{pdfSkippedCount} transação(s)</span> ignoradas (já existiam)</p>
                    )}
                  </div>
                </div>
                <Button onClick={closePdfSheet} className="bg-primary hover:bg-primary/90">Fechar</Button>
              </div>
            )}
          </div>
          {/* Footer */}
          {pdfStep !== "done" && (
            <div className="sticky bottom-0 z-10 border-t bg-white dark:bg-gray-800 px-8 py-4 flex gap-2 justify-between">
              <Button variant="outline" onClick={pdfStep === "review" ? () => setPdfStep("upload") : closePdfSheet}>
                {pdfStep === "review" ? "Voltar" : "Cancelar"}
              </Button>
              {pdfStep === "upload" && (
                <Button
                  onClick={importType === "csv" ? handleCsvParse : handlePdfParse}
                  disabled={(importType === "pdf" ? !pdfFile : !csvFile) || !pdfCardId || pdfParsing}
                  className="bg-primary hover:bg-primary/90"
                >
                  {pdfParsing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{importType === "csv" ? "Processando CSV..." : "Processando com IA..."}</>
                  ) : (
                    <><FileUp className="h-4 w-4 mr-2" />{importType === "csv" ? "Processar CSV" : "Processar PDF"}</>
                  )}
                </Button>
              )}
              {pdfStep === "review" && (
                <Button
                  onClick={handlePdfImport}
                  disabled={pdfTransactions.filter(t => t.selected && !t.is_duplicate).length === 0 || pdfImporting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {pdfImporting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</>
                  ) : (
                    <><Check className="h-4 w-4 mr-2" />Importar {pdfTransactions.filter(t => t.selected && !t.is_duplicate).length} transações</>
                  )}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(o) => setDeleteDialog({ open: o, cardId: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Cartão?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {txCountData && txCountData.count > 0 ? (
                  <>
                    <p>O cartão <strong className="text-foreground">{deleteDialog.cardName}</strong> possui <strong className="text-foreground">{txCountData.count} transação(s)</strong> vinculada(s).</p>
                    <p>O que deseja fazer com as transações?</p>
                  </>
                ) : (
                  <p>O cartão <strong className="text-foreground">{deleteDialog.cardName}</strong> será desativado. Esta ação não pode ser desfeita.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-col gap-2">
            <AlertDialogCancel className="sm:mr-auto">Cancelar</AlertDialogCancel>
            {txCountData && txCountData.count > 0 ? (
              <>
                <AlertDialogAction
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => handleDeleteCard(false)}
                >
                  Remover cartão, manter transações
                </AlertDialogAction>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => handleDeleteCard(true)}
                >
                  Remover cartão e {txCountData.count} transação(s)
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => handleDeleteCard(false)}
              >
                Remover
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
// ─── Card visual de um cartão ─────────────────────────────────────────────────
function CreditCardCard({ card, entityId, onEdit, onDelete }: { card: any; entityId: number; onEdit: () => void; onDelete: () => void }) {
  const utils = trpc.useUtils();
  const { data: summary } = trpc.creditCards.getSummary.useQuery({ cardId: card.id });
  const { data: invoices } = trpc.creditCards.getInvoicesByMonth.useQuery({ cardId: card.id, months: 12 });
  const { data: bankAccounts } = trpc.bankAccounts.listByEntity.useQuery({ entityId });
  const [showInvoices, setShowInvoices] = useState(false);
  // Sheet de pagamento de fatura
  const [paySheet, setPaySheet] = useState<{ open: boolean; invoice: any | null }>({ open: false, invoice: null });
  const [payBankAccountId, setPayBankAccountId] = useState<string>("");
  const payInvoiceMutation = trpc.creditCards.payInvoice.useMutation({
    onSuccess: (data) => {
      toast.success(`Fatura paga com sucesso! ${formatCurrency(data.totalAmount)} debitados da conta.`);
      setPaySheet({ open: false, invoice: null });
      setPayBankAccountId("");
      utils.creditCards.getSummary.invalidate({ cardId: card.id });
      utils.creditCards.getInvoicesByMonth.invalidate({ cardId: card.id });
      utils.transactions.listByEntity.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const usagePercent = summary?.usagePercent ?? 0;
  const usedAmount = summary?.usedAmount ?? 0;
  const availableLimit = summary?.availableLimit ?? card.creditLimit;
  // Usar UTC para evitar problema de fuso: new Date(isoString) converte UTC→local
  // e pode subtrair 1 dia em fusos negativos (ex: GMT-3).
  // getUTC* garante que lemos o dia/mês/ano exato que o servidor enviou.
  const dueDate = summary?.dueDate ? (() => {
    const d = new Date(summary.dueDate);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  })() : null;
  const usageColor = usagePercent >= 90 ? "bg-red-500" : usagePercent >= 70 ? "bg-amber-500" : "bg-green-500";
  function openPaySheet(inv: any) {
    setPaySheet({ open: true, invoice: inv });
    // Pré-selecionar primeira conta bancária
    if (bankAccounts && bankAccounts.length > 0) {
      setPayBankAccountId(String(bankAccounts[0].id));
    }
  }
  function handlePayInvoice() {
    if (!paySheet.invoice || !payBankAccountId) return;
    payInvoiceMutation.mutate({
      cardId: card.id,
      month: paySheet.invoice.month,
      year: paySheet.invoice.year,
      bankAccountId: Number(payBankAccountId),
    });
  }
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
        {/* Vencimento próxima fatura */}
        {dueDate && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border/50">
            <Clock className="h-3 w-3" />
            <span>Próxima fatura vence em {format(dueDate, "dd 'de' MMMM", { locale: ptBR })}</span>
          </div>
        )}
        {/* Botão para ver faturas por mês */}
        {invoices && invoices.length > 0 && (
          <div className="pt-1 border-t border-border/50">
            <button
              onClick={() => setShowInvoices(!showInvoices)}
              className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <span>Faturas por mês ({invoices.length})</span>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showInvoices ? "rotate-90" : ""}`} />
            </button>
            {showInvoices && (
              <div className="mt-2 space-y-1.5">
                {invoices.map((inv: any) => {
                  // Usar UTC para evitar problema de fuso (GMT-3 subtrairia 1 dia)
                  const _invDueRaw = new Date(inv.dueDate);
                  const invDue = new Date(_invDueRaw.getUTCFullYear(), _invDueRaw.getUTCMonth(), _invDueRaw.getUTCDate());
                  const isCurrentMonth = invDue.getMonth() === new Date().getMonth() && invDue.getFullYear() === new Date().getFullYear();
                  const isPaid = inv.isPaid || inv.status === "PAID";
                  return (
                    <div
                      key={`${inv.year}-${inv.month}`}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                        isPaid
                          ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                          : isCurrentMonth
                          ? "bg-primary/10 border border-primary/20"
                          : "bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isPaid ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                        ) : isCurrentMonth ? (
                          <AlertCircle className="h-3 w-3 text-primary flex-shrink-0" />
                        ) : (
                          <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        )}
                        <span className="font-medium truncate">
                          {MONTH_NAMES[inv.month - 1]}/{inv.year}
                          {isCurrentMonth && !isPaid && <span className="ml-1 text-primary">(atual)</span>}
                          {isPaid && <span className="ml-1 text-green-600 dark:text-green-400">(paga)</span>}
                        </span>
                        <span className="text-muted-foreground flex-shrink-0">{inv.count} compra{inv.count !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className={`font-semibold ${
                          isPaid ? "text-green-600 dark:text-green-400" : isCurrentMonth ? "text-primary" : "text-foreground"
                        }`}>
                          {formatCurrency(inv.total)}
                        </span>
                        {!isPaid && (
                          <button
                            onClick={() => openPaySheet(inv)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
                          >
                            <Banknote className="h-3 w-3" />
                            Pagar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sheet de pagamento de fatura */}
      <Sheet open={paySheet.open} onOpenChange={(o) => { if (!o) { setPaySheet({ open: false, invoice: null }); setPayBankAccountId(""); } }}>
        <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col">
          {/* Header */}
          <div className="sticky top-0 z-10 border-b bg-white dark:bg-gray-800 px-8 py-4 flex items-center justify-between">
            <SheetTitle className="text-xl font-bold">Pagar Fatura</SheetTitle>
            <button onClick={() => setPaySheet({ open: false, invoice: null })} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Conteúdo */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
            {/* Resumo da fatura */}
            <div
              className="rounded-xl p-4 text-white space-y-1"
              style={{ background: `linear-gradient(135deg, ${card.color}dd, ${card.color}88)` }}
            >
              <p className="text-xs font-medium opacity-80 uppercase tracking-wider">{card.name}</p>
              <p className="text-2xl font-bold">
                {paySheet.invoice ? formatCurrency(paySheet.invoice.total) : "—"}
              </p>
              <p className="text-xs opacity-80">
                Fatura de {paySheet.invoice ? `${MONTH_NAMES[paySheet.invoice.month - 1]}/${paySheet.invoice.year}` : "—"}
                {" · "}{paySheet.invoice?.count ?? 0} transaç{paySheet.invoice?.count !== 1 ? "ões" : "ão"}
              </p>
            </div>
            {/* Aviso */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
              <p className="font-medium mb-1">O que acontece ao pagar:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>Todas as transações pendentes desta fatura serão marcadas como <strong>Pagas</strong></li>
                <li>Uma despesa de <strong>{paySheet.invoice ? formatCurrency(paySheet.invoice.total) : "—"}</strong> será lançada na conta selecionada</li>
                <li>O limite do cartão será liberado</li>
              </ul>
            </div>
            {/* Seletor de conta bancária */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Débitar da conta *</Label>
              {bankAccounts && bankAccounts.length > 0 ? (
                <Select value={payBankAccountId} onValueChange={setPayBankAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta bancária" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((acc: any) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: acc.color || "#6B7280" }} />
                          {acc.name}{acc.bank ? ` — ${acc.bank}` : ""}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma conta bancária cadastrada.</p>
              )}
            </div>
          </div>
          {/* Footer */}
          <div className="sticky bottom-0 z-10 border-t bg-white dark:bg-gray-800 px-8 py-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setPaySheet({ open: false, invoice: null })}>
              Cancelar
            </Button>
            <Button
              onClick={handlePayInvoice}
              disabled={!payBankAccountId || payInvoiceMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {payInvoiceMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</>
              ) : (
                <><Banknote className="h-4 w-4 mr-2" />Confirmar Pagamento</>
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
