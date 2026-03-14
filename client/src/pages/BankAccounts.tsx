import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
  Upload,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  ChevronRight,
  History,
  RefreshCw,
  Ban,
  Banknote,
  Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CurrencyInput, parseCurrency } from "@/components/CurrencyInput";
// parseCurrency retorna o valor em reais (float), o tRPC router converte para centavos

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const BANK_COLORS = [
  "#2563EB", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type OfxTransaction = {
  ofxId: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  date: string;
  description: string;
  memo: string | null;
  suggestedStatus: "MATCHED" | "PENDING_REVIEW";
  matchedTransactionId: number | null;
};

type ParseResult = {
  bankAccount: { id: number; name: string; bank: string | null };
  period: { startDate?: string; endDate?: string };
  ledgerBalance?: number;
  availableBalance?: number;
  totalTransactions: number;
  duplicatesFound: number;
  transactions: OfxTransaction[];
};

type Decision = {
  ofxId: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  date: string;
  description: string;
  memo: string | null;
  action: "IMPORT" | "MATCH" | "IGNORE";
  matchedTransactionId: number | null;
  categoryId?: number | null;
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function BankAccounts() {
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);

  const { data: entities, isLoading: entitiesLoading } = trpc.entities.list.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  if (!selectedEntityId && entities && entities.length > 0) {
    setSelectedEntityId(entities[0].id);
  }

  const selectedEntity = entities?.find((e) => e.id === selectedEntityId);
  const myRole = (selectedEntity as any)?.sharedRole ?? "OWNER";
  const canWrite = myRole === "OWNER" || myRole === "ADMIN" || myRole === "EDITOR";
  const canDelete = myRole === "OWNER" || myRole === "ADMIN";

  if (entitiesLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!entities || entities.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Você precisa criar uma entidade antes de gerenciar contas bancárias.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contas Bancárias</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie suas contas e importe extratos OFX para conciliação automática.
        </p>
      </div>

      {/* Seletor de entidade (se mais de uma) */}
      {entities.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {entities.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelectedEntityId(e.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selectedEntityId === e.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}

      {selectedEntityId && (
        <BankAccountsList
          entityId={selectedEntityId}
          canWrite={canWrite}
          canDelete={canDelete}
          entities={entities}
          selectedEntityId={selectedEntityId}
          onEntityChange={(id) => setSelectedEntityId(id)}
        />
      )}
    </div>
  );
}

// ─── Lista de contas ──────────────────────────────────────────────────────────

function BankAccountsList({
  entityId,
  canWrite,
  canDelete,
  entities,
  selectedEntityId,
  onEntityChange,
}: {
  entityId: number;
  canWrite: boolean;
  canDelete: boolean;
  entities: any[];
  selectedEntityId: number;
  onEntityChange: (id: number) => void;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [ofxAccountId, setOfxAccountId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    bank: "",
    accountNumber: "",
    balance: "",
    color: "#2563EB",
    entityId: entityId,
  });

   const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.bankAccounts.listByEntity.useQuery({ entityId });
  const { data: balanceSummary } = trpc.bankAccounts.getBalanceSummary.useQuery({ entityId });
  const createMutation = trpc.bankAccounts.create.useMutation({
    onSuccess: () => {
      utils.bankAccounts.listByEntity.invalidate();
      setIsCreateOpen(false);
      resetForm();
      toast.success("Conta criada com sucesso!");
    },
    onError: (e) => toast.error("Erro ao criar conta: " + e.message),
  });

  const updateMutation = trpc.bankAccounts.update.useMutation({
    onSuccess: () => {
      utils.bankAccounts.listByEntity.invalidate();
      setIsEditOpen(false);
      setEditingAccount(null);
      resetForm();
      toast.success("Conta atualizada com sucesso!");
    },
    onError: (e) => toast.error("Erro ao atualizar conta: " + e.message),
  });

  const deleteMutation = trpc.bankAccounts.delete.useMutation({
    onSuccess: () => {
      utils.bankAccounts.listByEntity.invalidate();
      setDeleteId(null);
      toast.success("Conta excluída com sucesso!");
    },
    onError: (e) => toast.error("Erro ao excluir conta: " + e.message),
  });

  const resetForm = () =>
    setFormData({ name: "", bank: "", accountNumber: "", balance: "", color: "#2563EB", entityId });

  const handleCreate = () => {
    if (!formData.name.trim()) return toast.error("O nome da conta é obrigatório");
    if (!formData.entityId) return toast.error("Selecione uma entidade para vincular a conta");
    createMutation.mutate({
      entityId: formData.entityId,
      name: formData.name,
      bank: formData.bank || undefined,
      accountNumber: formData.accountNumber || undefined,
      balance: formData.balance ? parseCurrency(formData.balance) : undefined,
      color: formData.color,
    });
  };

  const handleEdit = (account: any) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      bank: account.bank || "",
      accountNumber: account.accountNumber || "",
      balance: (account.balance / 100).toFixed(2).replace(".", ","),
      color: account.color || "#2563EB",
      entityId: account.entityId || entityId,
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!formData.name.trim()) return toast.error("O nome da conta é obrigatório");
    updateMutation.mutate({
      id: editingAccount.id,
      name: formData.name,
      bank: formData.bank || undefined,
      accountNumber: formData.accountNumber || undefined,
      balance: formData.balance ? parseCurrency(formData.balance) : undefined,
      color: formData.color,
      isActive: editingAccount.isActive,
    });
  };

  // Saldo total real = soma dos saldos atuais por conta (saldo inicial + movimentações pagas)
  const totalCurrentBalance = balanceSummary?.reduce((sum, a) => sum + a.currentBalance, 0) ?? 0;
  // Saldo inicial total (para referência)
  const totalInitialBalance = accounts?.reduce((sum, a) => sum + a.balance, 0) ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Card de resumo */}
      {accounts && accounts.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-lg">
          <p className="text-blue-100 text-sm font-medium mb-1">Saldo atual em contas</p>
          <p className="text-3xl font-bold">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalCurrentBalance)}
          </p>
          <p className="text-blue-200 text-xs mt-2">
            {accounts.length} conta{accounts.length !== 1 ? "s" : ""} • Saldo inicial:{" "}
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalInitialBalance / 100)}
          </p>
        </div>
      )}

      {/* Botão nova conta */}
      {canWrite && (
        <Button
          onClick={() => { resetForm(); setIsCreateOpen(true); }}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 font-medium"
        >
          <Plus className="h-5 w-5 mr-2" />
          Nova Conta Bancária
        </Button>
      )}

      {/* Lista de contas */}
      {!accounts || accounts.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-14 text-center">
            <Landmark className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p className="font-medium text-gray-500 dark:text-gray-400">Nenhuma conta cadastrada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Adicione sua primeira conta para começar a conciliar extratos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <Card
              key={account.id}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all"
            >
              <CardContent className="p-4">
                {/* Mobile + Desktop layout */}
                <div className="flex items-start gap-4">
                  {/* Ícone colorido */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: account.color || "#2563EB" }}
                  >
                    <Banknote className="h-6 w-6 text-white" />
                  </div>

                  {/* Informações */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                          {account.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {account.bank && `${account.bank}`}
                          {account.bank && account.accountNumber && " • "}
                          {account.accountNumber && `Ag. ${account.accountNumber}`}
                          {!account.bank && !account.accountNumber && "Sem dados bancários"}
                        </p>
                      </div>
                      {!account.isActive && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">Inativa</Badge>
                      )}
                    </div>

                    {/* Saldo + ações */}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Saldo atual</p>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {(() => {
                              const summary = balanceSummary?.find(s => s.id === account.id);
                              const val = summary ? summary.currentBalance : account.balance / 100;
                              return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
                            })()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Saldo inicial</p>
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            {formatCurrency(account.balance)}
                          </p>
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-1">
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg"
                            onClick={() => setOfxAccountId(account.id)}
                          >
                            <Upload className="h-4 w-4 mr-1.5" />
                            <span className="text-xs font-medium">Importar OFX</span>
                          </Button>
                        )}
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-lg"
                            onClick={() => handleEdit(account)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-lg text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(account.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Sheet: Criar conta ── */}
      <AccountSheet
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Nova Conta Bancária"
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleCreate}
        submitLabel={createMutation.isPending ? "Criando..." : "Criar Conta"}
        isPending={createMutation.isPending}
        entities={entities}
        isEditing={false}
      />

      {/* ── Sheet: Editar conta ── */}
      <AccountSheet
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Editar Conta Bancária"
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleUpdate}
        submitLabel={updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
        isPending={updateMutation.isPending}
        entities={entities}
        isEditing={true}
      />

      {/* ── Alert: Confirmar exclusão ── */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O histórico de importações vinculado também será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Sheet: Importar OFX ── */}
      {ofxAccountId && (
        <OfxImportSheet
          accountId={ofxAccountId}
          entityId={entityId}
          onClose={() => {
            setOfxAccountId(null);
            utils.bankAccounts.listByEntity.invalidate();
          }}
        />
      )}
    </div>
  );
}

// ─── Sheet de formulário de conta ────────────────────────────────────────────

function AccountSheet({
  open,
  onOpenChange,
  title,
  formData,
  setFormData,
  onSubmit,
  submitLabel,
  isPending,
  entities,
  isEditing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  formData: any;
  setFormData: (v: any) => void;
  onSubmit: () => void;
  submitLabel: string;
  isPending: boolean;
  entities: any[];
  isEditing: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[480px] flex flex-col p-0">
        {/* Header fixo */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <SheetTitle className="text-xl font-bold">{title}</SheetTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* Seletor de entidade - sempre visível e obrigatório */}
          <div className="space-y-2">
            <Label htmlFor="acc-entity">
              Entidade *
              <span className="ml-1 text-xs text-muted-foreground font-normal">(conta será vinculada a esta entidade)</span>
            </Label>
            {entities.length === 1 ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entities[0].color || "#2563EB" }}
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{entities[0].name}</span>
                <span className="ml-auto text-xs text-muted-foreground">Selecionada automaticamente</span>
              </div>
            ) : (
              <Select
                value={formData.entityId?.toString()}
                onValueChange={(v) => setFormData({ ...formData, entityId: Number(v) })}
                disabled={isEditing}
              >
                <SelectTrigger id="acc-entity" className="rounded-xl">
                  <SelectValue placeholder="Selecione a entidade..." />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((e: any) => (
                    <SelectItem key={e.id} value={e.id.toString()}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: e.color || "#2563EB" }}
                        />
                        {e.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isEditing && entities.length > 1 && (
              <p className="text-xs text-muted-foreground">
                A entidade não pode ser alterada após a criação da conta.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-name">Nome da Conta *</Label>
            <Input
              id="acc-name"
              placeholder="Ex: Conta Corrente PJ Itaú"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="acc-bank">Banco</Label>
              <Input
                id="acc-bank"
                placeholder="Ex: Itaú, Nubank"
                value={formData.bank}
                onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-number">Agência / Conta</Label>
              <Input
                id="acc-number"
                placeholder="Ex: 0001 / 12345-6"
                value={formData.accountNumber}
                onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-balance">Saldo Inicial</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                R$
              </span>
              <CurrencyInput
                id="acc-balance"
                className="pl-9 rounded-xl"
                placeholder="0,00"
                value={formData.balance}
                onChange={(v) => setFormData({ ...formData, balance: v })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Informe o saldo da conta na data de início do uso do sistema.
            </p>
          </div>

          {/* Seletor de cor */}
          <div className="space-y-2">
            <Label>Cor de identificação</Label>
            <div className="flex gap-2 flex-wrap">
              {BANK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-8 h-8 rounded-full transition-all ${
                    formData.color === color
                      ? "ring-2 ring-offset-2 ring-blue-500 scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer fixo */}
        <div className="sticky bottom-0 z-10 bg-white dark:bg-gray-900 border-t dark:border-gray-700 px-6 py-4 flex gap-3">
          <Button
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-xl"
            onClick={onSubmit}
            disabled={isPending}
          >
            {submitLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Sheet de importação OFX ──────────────────────────────────────────────────

type OfxStep = "upload" | "review" | "done";

function OfxImportSheet({
  accountId,
  entityId,
  onClose,
}: {
  accountId: number;
  entityId: number;
  onClose: () => void;
}) {
  const [step, setStep] = useState<OfxStep>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    matchedCount: number;
    ignoredCount: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: accounts } = trpc.bankAccounts.listByEntity.useQuery({ entityId });
  const account = accounts?.find((a) => a.id === accountId);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file) return;
      const ext = file.name.toLowerCase().split(".").pop();
      if (ext !== "ofx" && ext !== "qfx") {
        toast.error("Apenas arquivos .OFX ou .QFX são aceitos");
        return;
      }

      setParsing(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("bankAccountId", String(accountId));

        const res = await fetch("/api/ofx/parse", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Erro ao processar arquivo");
        }

        const data: ParseResult = await res.json();
        setParseResult(data);

        // Inicializar decisões: duplicatas → MATCH, novas → IMPORT
        setDecisions(
          data.transactions.map((tx) => ({
            ofxId: tx.ofxId,
            type: tx.type,
            amount: tx.amount,
            date: tx.date,
            description: tx.description,
            memo: tx.memo,
            action: tx.matchedTransactionId ? "MATCH" : "IMPORT",
            matchedTransactionId: tx.matchedTransactionId,
            categoryId: null,
          }))
        );

        setStep("review");
      } catch (err: any) {
        toast.error(err.message || "Erro ao processar arquivo OFX");
      } finally {
        setParsing(false);
      }
    },
    [accountId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleImport = async () => {
    if (!parseResult) return;
    setImporting(true);
    try {
      const res = await fetch("/api/ofx/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bankAccountId: accountId,
          filename: "extrato.ofx",
          period: parseResult.period,
          ledgerBalance: parseResult.ledgerBalance,
          availableBalance: parseResult.availableBalance,
          decisions,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao importar");
      }

      const result = await res.json();
      setImportResult(result);
      setStep("done");
      toast.success("Extrato importado com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar extrato");
    } finally {
      setImporting(false);
    }
  };

  const setDecisionAction = (ofxId: string, action: "IMPORT" | "MATCH" | "IGNORE") => {
    setDecisions((prev) =>
      prev.map((d) => (d.ofxId === ofxId ? { ...d, action } : d))
    );
  };

  const stepProgress = step === "upload" ? 33 : step === "review" ? 66 : 100;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <SheetTitle className="text-xl font-bold">Importar Extrato OFX</SheetTitle>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Progresso */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className={step === "upload" ? "text-blue-600 font-medium" : ""}>
                1. Upload
              </span>
              <span className={step === "review" ? "text-blue-600 font-medium" : ""}>
                2. Revisão
              </span>
              <span className={step === "done" ? "text-blue-600 font-medium" : ""}>
                3. Concluído
              </span>
            </div>
            <Progress value={stepProgress} className="h-1.5" />
          </div>

          {/* Conta selecionada */}
          {account && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <div
                className="w-5 h-5 rounded-full flex-shrink-0"
                style={{ backgroundColor: account.color || "#2563EB" }}
              />
              <span className="font-medium text-gray-700 dark:text-gray-300">{account.name}</span>
              {account.bank && (
                <span className="text-muted-foreground">• {account.bank}</span>
              )}
            </div>
          )}
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Passo 1: Upload ── */}
          {step === "upload" && (
            <div className="p-6 space-y-6">
              {/* Zona de drop */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ofx,.qfx"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                {parsing ? (
                  <div className="space-y-3">
                    <RefreshCw className="h-10 w-10 mx-auto text-blue-500 animate-spin" />
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      Processando arquivo...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-2xl flex items-center justify-center mx-auto">
                      <Upload className="h-8 w-8 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        Arraste o arquivo OFX aqui
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        ou clique para selecionar
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      .OFX • .QFX • Máx. 5MB
                    </Badge>
                  </div>
                )}
              </div>

              {/* Instruções */}
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Como exportar o extrato OFX do seu banco:
                </p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {[
                    { bank: "Itaú", tip: "Internet Banking → Extrato → Exportar → OFX" },
                    { bank: "Bradesco", tip: "Internet Banking → Extrato → Salvar como OFX" },
                    { bank: "Nubank", tip: "App → Perfil → Exportar dados → OFX" },
                    { bank: "Banco do Brasil", tip: "Internet Banking → Extrato → Exportar → OFX" },
                    { bank: "Santander", tip: "Internet Banking → Extrato → Exportar → OFX" },
                  ].map(({ bank, tip }) => (
                    <div key={bank} className="flex gap-2">
                      <span className="font-medium text-gray-600 dark:text-gray-400 w-24 flex-shrink-0">
                        {bank}:
                      </span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Passo 2: Revisão ── */}
          {step === "review" && parseResult && (
            <div className="p-6 space-y-5">
              {/* Resumo do extrato */}
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950 p-4 space-y-2">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                  Resumo do extrato
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {parseResult.period.startDate && (
                    <div>
                      <p className="text-blue-600 dark:text-blue-400 text-xs">Período</p>
                      <p className="font-medium text-blue-900 dark:text-blue-100">
                        {format(new Date(parseResult.period.startDate), "dd/MM/yy", { locale: ptBR })}
                        {parseResult.period.endDate &&
                          ` – ${format(new Date(parseResult.period.endDate), "dd/MM/yy", { locale: ptBR })}`}
                      </p>
                    </div>
                  )}
                  {parseResult.ledgerBalance !== undefined && (
                    <div>
                      <p className="text-blue-600 dark:text-blue-400 text-xs">Saldo no extrato</p>
                      <p className="font-medium text-blue-900 dark:text-blue-100">
                        {formatCurrency(parseResult.ledgerBalance)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-blue-600 dark:text-blue-400 text-xs">Total de lançamentos</p>
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      {parseResult.totalTransactions}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-600 dark:text-blue-400 text-xs">Possíveis duplicatas</p>
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      {parseResult.duplicatesFound}
                    </p>
                  </div>
                </div>
              </div>

              {/* Legenda das ações */}
              <div className="flex gap-3 flex-wrap text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">Importar como nova</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">Conciliar com existente</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                  <span className="text-muted-foreground">Ignorar</span>
                </div>
              </div>

              <Separator />

              {/* Lista de transações */}
              <div className="space-y-2">
                {parseResult.transactions.map((tx, idx) => {
                  const decision = decisions.find((d) => d.ofxId === tx.ofxId);
                  const action = decision?.action ?? "IMPORT";

                  return (
                    <div
                      key={tx.ofxId + idx}
                      className={`rounded-xl border p-3 transition-all ${
                        action === "IGNORE"
                          ? "opacity-50 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                          : action === "MATCH"
                          ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950"
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Ícone tipo */}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            tx.type === "INCOME"
                              ? "bg-green-100 dark:bg-green-900"
                              : "bg-red-100 dark:bg-red-900"
                          }`}
                        >
                          {tx.type === "INCOME" ? (
                            <ArrowUpRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-red-600" />
                          )}
                        </div>

                        {/* Dados */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {tx.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(tx.date), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>

                        {/* Valor */}
                        <div className="text-right flex-shrink-0">
                          <p
                            className={`text-sm font-bold ${
                              tx.type === "INCOME" ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {tx.type === "INCOME" ? "+" : "-"}
                            {formatCurrency(tx.amount)}
                          </p>
                          {tx.matchedTransactionId && (
                            <Badge variant="secondary" className="text-xs mt-0.5">
                              Duplicata
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Botões de ação */}
                      <div className="flex gap-1.5 mt-2.5">
                        <button
                          onClick={() => setDecisionAction(tx.ofxId, "IMPORT")}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                            action === "IMPORT"
                              ? "bg-green-600 text-white"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-700"
                          }`}
                        >
                          <Plus className="h-3 w-3" />
                          Importar
                        </button>
                        {tx.matchedTransactionId && (
                          <button
                            onClick={() => setDecisionAction(tx.ofxId, "MATCH")}
                            className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                              action === "MATCH"
                                ? "bg-blue-600 text-white"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700"
                            }`}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Conciliar
                          </button>
                        )}
                        <button
                          onClick={() => setDecisionAction(tx.ofxId, "IGNORE")}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                            action === "IGNORE"
                              ? "bg-gray-500 text-white"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                          }`}
                        >
                          <Ban className="h-3 w-3" />
                          Ignorar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Passo 3: Concluído ── */}
          {step === "done" && importResult && (
            <div className="p-6 flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  Extrato importado!
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  As transações foram processadas com sucesso.
                </p>
              </div>

              <div className="w-full grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-green-50 dark:bg-green-950 p-4">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {importResult.importedCount}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">Importadas</p>
                </div>
                <div className="rounded-xl bg-blue-50 dark:bg-blue-950 p-4">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {importResult.matchedCount}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Conciliadas</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4">
                  <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                    {importResult.ignoredCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Ignoradas</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                As transações importadas aparecem na página de{" "}
                <strong>Transações</strong> com o badge "OFX".
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 bg-white dark:bg-gray-900 border-t dark:border-gray-700 px-6 py-4">
          {step === "upload" && (
            <Button variant="outline" className="w-full rounded-xl" onClick={onClose}>
              Cancelar
            </Button>
          )}
          {step === "review" && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setStep("upload")}
              >
                Voltar
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-xl"
                onClick={handleImport}
                disabled={importing || decisions.every((d) => d.action === "IGNORE")}
              >
                {importing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Confirmar Importação
                  </>
                )}
              </Button>
            </div>
          )}
          {step === "done" && (
            <Button className="w-full bg-blue-600 hover:bg-blue-700 rounded-xl" onClick={onClose}>
              Concluir
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
