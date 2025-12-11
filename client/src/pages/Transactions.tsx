import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowUpRight, ArrowDownRight, Filter, Search, Edit2, Calendar, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { AttachmentUploader } from "@/components/AttachmentUploader";
import { uploadFile, deleteFile } from "@/lib/supabase";

export default function Transactions() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "income" | "expense">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  
  // Filter states
  const [filterPeriod, setFilterPeriod] = useState<"all" | "month" | "year" | "custom">("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);

  const [formData, setFormData] = useState({
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    description: "",
    amount: "",
    dueDate: format(new Date(), "yyyy-MM-dd"),
    paymentDate: "",
    status: "PENDING" as "PENDING" | "PAID" | "OVERDUE",
    categoryId: "",
    bankAccountId: "",
    paymentMethodId: "",
    notes: "",
    isRecurring: false,
    recurrenceCount: "1",
    recurrenceFrequency: "MONTH" as "DAY" | "WEEK" | "MONTH" | "YEAR",
    attachments: [] as number[],
  });

  // Estado para gerenciar anexos
  const [attachments, setAttachments] = useState<any[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: entities, isLoading: entitiesLoading } = trpc.entities.list.useQuery();

  // Set first entity as default
  if (!selectedEntityId && entities && entities.length > 0) {
    setSelectedEntityId(entities[0].id);
  }

  // Fetch transactions with filters
  const { data: transactions, isLoading: transactionsLoading } = trpc.transactions.listByEntity.useQuery(
    {
      entityId: selectedEntityId!,
      type: activeTab === "all" ? undefined : activeTab === "income" ? "INCOME" : "EXPENSE",
    },
    { enabled: !!selectedEntityId }
  );

  // Fetch categories, bank accounts, and payment methods for the selected entity
  const { data: categories } = trpc.categories.listByEntity.useQuery(
    { entityId: selectedEntityId! },
    { enabled: !!selectedEntityId }
  );

  const { data: bankAccounts } = trpc.bankAccounts.listByEntity.useQuery(
    { entityId: selectedEntityId! },
    { enabled: !!selectedEntityId }
  );

  const { data: paymentMethods } = trpc.paymentMethods.listByEntity.useQuery(
    { entityId: selectedEntityId! },
    { enabled: !!selectedEntityId }
  );

  const createMutation = trpc.transactions.create.useMutation({
    onSuccess: async (data) => {
      // Salvar anexos se houver
      if (attachments.length > 0 && data.id) {
        try {
          for (const attachment of attachments) {
            await utils.client.attachments.create.mutate({
              transactionId: data.id,
              filename: attachment.filename,
              blobUrl: attachment.blobUrl,
              fileSize: attachment.fileSize,
              mimeType: attachment.mimeType,
              type: attachment.type,
            });
          }
        } catch (error) {
          console.error("Erro ao salvar anexos:", error);
          toast.error("Transação criada mas houve erro ao salvar anexos");
        }
      }
      
      utils.transactions.listByEntity.invalidate();
      utils.dashboard.metrics.invalidate();
      setIsCreateOpen(false);
      resetForm();
      toast.success("Transação criada com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar transação");
    },
  });

  const updateMutation = trpc.transactions.update.useMutation({
    onSuccess: () => {
      utils.transactions.listByEntity.invalidate();
      utils.dashboard.metrics.invalidate();
      setIsEditOpen(false);
      setEditingTransaction(null);
      toast.success("Transação atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar transação");
    },
  });

  const deleteMutation = trpc.transactions.delete.useMutation({
    onSuccess: () => {
      utils.transactions.listByEntity.invalidate();
      utils.dashboard.metrics.invalidate();
      setDeleteDialogOpen(false);
      setDeletingTransactionId(null);
      toast.success("Transação excluída com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir transação");
    },
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<number | null>(null);

  const handleDelete = (id: number) => {
    setDeletingTransactionId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deletingTransactionId) {
      deleteMutation.mutate({ id: deletingTransactionId });
    }
  };

  const resetForm = () => {
    setFormData({
      type: "EXPENSE",
      description: "",
      amount: "",
      dueDate: format(new Date(), "yyyy-MM-dd"),
      paymentDate: "",
      status: "PENDING",
      categoryId: "",
      bankAccountId: "",
      paymentMethodId: "",
      notes: "",
      isRecurring: false,
      recurrenceCount: "1",
      recurrenceFrequency: "MONTH" as "DAY" | "WEEK" | "MONTH" | "YEAR",
      attachments: [],
    });
    setAttachments([]);
    setEditingTransaction(null);
  };

  const handleCreate = () => {
    if (!selectedEntityId) return;

    createMutation.mutate({
      entityId: selectedEntityId,
      type: formData.type,
      description: formData.description,
      amount: parseFloat(formData.amount),
      dueDate: new Date(formData.dueDate),
      paymentDate: formData.paymentDate ? new Date(formData.paymentDate) : undefined,
      status: formData.status,
      categoryId: formData.categoryId ? parseInt(formData.categoryId) : undefined,
      bankAccountId: formData.bankAccountId ? parseInt(formData.bankAccountId) : undefined,
      paymentMethodId: formData.paymentMethodId ? parseInt(formData.paymentMethodId) : undefined,
      notes: formData.notes || undefined,
      isRecurring: formData.isRecurring,
      recurrenceCount: formData.isRecurring ? parseInt(formData.recurrenceCount) : undefined,
      recurrenceFrequency: formData.isRecurring ? formData.recurrenceFrequency : undefined,
    });
  };

  const handleEdit = async (transaction: any) => {
    setEditingTransaction(transaction);
    setFormData({
      type: transaction.type,
      description: transaction.description,
      amount: (transaction.amount / 100).toString(),
      dueDate: format(new Date(transaction.dueDate), "yyyy-MM-dd"),
      paymentDate: transaction.paymentDate ? format(new Date(transaction.paymentDate), "yyyy-MM-dd") : "",
      status: transaction.status,
      categoryId: transaction.categoryId?.toString() || "",
      bankAccountId: transaction.bankAccountId?.toString() || "",
      paymentMethodId: transaction.paymentMethodId?.toString() || "",
      notes: transaction.notes || "",
      isRecurring: transaction.isRecurring || false,
      recurrenceCount: "1",
      recurrenceFrequency: "MONTH" as "DAY" | "WEEK" | "MONTH" | "YEAR",
      attachments: [],
    });
    
    // Carregar anexos da transação
    try {
      const transactionAttachments = await utils.client.attachments.listByTransaction.query({
        transactionId: transaction.id,
      });
      setAttachments(transactionAttachments || []);
    } catch (error) {
      console.error("Erro ao carregar anexos:", error);
      setAttachments([]);
    }
    
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editingTransaction) return;

    updateMutation.mutate({
      id: editingTransaction.id,
      type: formData.type,
      description: formData.description,
      amount: parseFloat(formData.amount),
      dueDate: new Date(formData.dueDate),
      paymentDate: formData.paymentDate ? new Date(formData.paymentDate) : undefined,
      status: formData.status,
      categoryId: formData.categoryId ? parseInt(formData.categoryId) : undefined,
      bankAccountId: formData.bankAccountId ? parseInt(formData.bankAccountId) : undefined,
      paymentMethodId: formData.paymentMethodId ? parseInt(formData.paymentMethodId) : undefined,
      notes: formData.notes || undefined,
    });
  };

  // Apply filters to transactions
  const filteredTransactions = transactions?.filter((t) => {
    // Search filter
    if (searchTerm && !t.description.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Category filter
    if (filterCategoryId && t.categoryId?.toString() !== filterCategoryId) {
      return false;
    }

    // Period filter
    const transactionDate = new Date(t.dueDate);
    if (filterPeriod === "month") {
      const monthStart = startOfMonth(new Date(filterYear, filterMonth - 1));
      const monthEnd = endOfMonth(new Date(filterYear, filterMonth - 1));
      if (transactionDate < monthStart || transactionDate > monthEnd) {
        return false;
      }
    } else if (filterPeriod === "year") {
      const yearStart = startOfYear(new Date(filterYear, 0));
      const yearEnd = endOfYear(new Date(filterYear, 0));
      if (transactionDate < yearStart || transactionDate > yearEnd) {
        return false;
      }
    } else if (filterPeriod === "custom" && filterStartDate && filterEndDate) {
      const start = new Date(filterStartDate);
      const end = new Date(filterEndDate);
      if (transactionDate < start || transactionDate > end) {
        return false;
      }
    }

    return true;
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      PENDING: "secondary",
      PAID: "default",
      OVERDUE: "destructive",
    };
    return <Badge variant={variants[status] || "default"}>{status === "PENDING" ? "Pendente" : status === "PAID" ? "Pago" : "Vencido"}</Badge>;
  };

  const getCategoryBadge = (categoryId: number | null) => {
    if (!categoryId || !categories) return null;
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return null;
    return (
      <Badge style={{ backgroundColor: category.color || "#6B7280", color: "#fff" }} className="font-normal">
        {category.name}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Transações</h1>
          <p className="text-muted-foreground">Gerencie receitas e despesas</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Transação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Transação</DialogTitle>
              <DialogDescription>Cadastre uma nova receita ou despesa</DialogDescription>
            </DialogHeader>
            <TransactionForm
              formData={formData}
              setFormData={setFormData}
              entities={entities || []}
              categories={categories || []}
              bankAccounts={bankAccounts || []}
              paymentMethods={paymentMethods || []}
              selectedEntityId={selectedEntityId}
              setSelectedEntityId={setSelectedEntityId}
              attachments={attachments}
              setAttachments={setAttachments}
              editingTransaction={undefined}
              utils={utils}
              setPreviewAttachment={setPreviewAttachment}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar Transação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Transação</DialogTitle>
            <DialogDescription>Atualize os dados da transação</DialogDescription>
          </DialogHeader>
          <TransactionForm
            formData={formData}
            setFormData={setFormData}
            entities={entities || []}
            categories={categories || []}
            bankAccounts={bankAccounts || []}
            paymentMethods={paymentMethods || []}
            selectedEntityId={selectedEntityId}
            setSelectedEntityId={setSelectedEntityId}
            attachments={attachments}
            setAttachments={setAttachments}
            editingTransaction={editingTransaction}
            isEdit
            utils={utils}
            setPreviewAttachment={setPreviewAttachment}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>Filtre as transações por período e categoria</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Entity selector */}
            <div className="space-y-2">
              <Label>Entidade</Label>
              <Select value={selectedEntityId?.toString() || ""} onValueChange={(v) => setSelectedEntityId(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {entities?.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id.toString()}>
                      {entity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Period filter */}
            <div className="space-y-2">
              <Label>Período</Label>
              <Select value={filterPeriod} onValueChange={(v: any) => setFilterPeriod(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="month">Mês</SelectItem>
                  <SelectItem value="year">Ano</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Month/Year selector */}
            {filterPeriod === "month" && (
              <>
                <div className="space-y-2">
                  <Label>Mês</Label>
                  <Select value={filterMonth.toString()} onValueChange={(v) => setFilterMonth(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          {format(new Date(2024, i), "MMMM", { locale: ptBR })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ano</Label>
                  <Input type="number" value={filterYear} onChange={(e) => setFilterYear(parseInt(e.target.value))} />
                </div>
              </>
            )}

            {filterPeriod === "year" && (
              <div className="space-y-2">
                <Label>Ano</Label>
                <Input type="number" value={filterYear} onChange={(e) => setFilterYear(parseInt(e.target.value))} />
              </div>
            )}

            {filterPeriod === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>Data Início</Label>
                  <Input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data Fim</Label>
                  <Input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
                </div>
              </>
            )}

            {/* Category filter */}
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Descrição..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="income">Receitas</TabsTrigger>
          <TabsTrigger value="expense">Despesas</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          {transactionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredTransactions && filteredTransactions.length > 0 ? (
            <div className="space-y-3">
              {filteredTransactions.map((transaction) => (
                <Card key={transaction.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`p-3 rounded-full ${transaction.type === "INCOME" ? "bg-green-100" : "bg-red-100"}`}>
                          {transaction.type === "INCOME" ? (
                            <ArrowUpRight className="h-5 w-5 text-green-600" />
                          ) : (
                            <ArrowDownRight className="h-5 w-5 text-red-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{transaction.description}</h3>
                            {getCategoryBadge(transaction.categoryId)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Vencimento: {format(new Date(transaction.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                            {transaction.paymentDate && ` • Pago em: ${format(new Date(transaction.paymentDate), "dd/MM/yyyy", { locale: ptBR })}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {getStatusBadge(transaction.status)}
                        <div className="text-right">
                          <p className={`text-lg font-bold ${transaction.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>
                            {transaction.type === "INCOME" ? "+" : "-"}R$ {(transaction.amount / 100).toFixed(2)}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(transaction)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(transaction.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">Nenhuma transação encontrada</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewAttachment} onOpenChange={() => setPreviewAttachment(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewAttachment?.filename}</DialogTitle>
            <DialogDescription>
              {previewAttachment?.mimeType} • {previewAttachment?.fileSize ? `${(previewAttachment.fileSize / 1024).toFixed(1)} KB` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg">
            {previewAttachment?.mimeType === 'application/pdf' ? (
              <iframe
                src={previewAttachment.blobUrl}
                className="w-full h-[600px] border-0"
                title="Preview PDF"
              />
            ) : previewAttachment?.mimeType?.startsWith('image/') ? (
              <img
                src={previewAttachment.blobUrl}
                alt={previewAttachment.filename}
                className="max-w-full max-h-[600px] object-contain"
              />
            ) : (
              <p className="text-gray-500">Preview não disponível para este tipo de arquivo</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewAttachment(null)}>
              Fechar
            </Button>
            <Button asChild>
              <a href={previewAttachment?.blobUrl} download={previewAttachment?.filename}>
                Baixar
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Transaction Form Component
function TransactionForm({
  formData,
  setFormData,
  entities,
  categories,
  bankAccounts,
  paymentMethods,
  selectedEntityId,
  setSelectedEntityId,
  attachments,
  setAttachments,
  isEdit = false,
  editingTransaction,
  utils,
  setPreviewAttachment,
}: {
  formData: any;
  setFormData: (data: any) => void;
  entities: any[];
  categories: any[];
  bankAccounts: any[];
  paymentMethods: any[];
  selectedEntityId: number | null;
  setSelectedEntityId: (id: number) => void;
  attachments: any[];
  setAttachments: (attachments: any[]) => void;
  isEdit?: boolean;
  editingTransaction?: any;
  utils: any;
  setPreviewAttachment: (attachment: any) => void;
}) {
  const incomeCategories = categories.filter((c) => c.type === "INCOME");
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const relevantCategories = formData.type === "INCOME" ? incomeCategories : expenseCategories;

  return (
    <div className="space-y-4">
      {!isEdit && (
        <div className="space-y-2">
          <Label htmlFor="entity">Entidade</Label>
          <Select value={selectedEntityId?.toString() || ""} onValueChange={(v) => setSelectedEntityId(parseInt(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma entidade" />
            </SelectTrigger>
            <SelectContent>
              {entities.map((entity) => (
                <SelectItem key={entity.id} value={entity.id.toString()}>
                  {entity.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="type">Tipo</Label>
        <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v, categoryId: "" })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INCOME">Receita</SelectItem>
            <SelectItem value="EXPENSE">Despesa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="description">Descrição</Label>
          <Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Ex: Aluguel" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Valor (R$)</Label>
          <Input id="amount" type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dueDate">Data de Vencimento</Label>
          <Input id="dueDate" type="date" value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="paymentDate">Data de Pagamento</Label>
          <Input id="paymentDate" type="date" value={formData.paymentDate} onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select value={formData.status} onValueChange={(v: any) => setFormData({ ...formData, status: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">Pendente</SelectItem>
            <SelectItem value="PAID">Pago</SelectItem>
            <SelectItem value="OVERDUE">Vencido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Categoria</Label>
        <Select value={formData.categoryId} onValueChange={(v) => setFormData({ ...formData, categoryId: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma categoria" />
          </SelectTrigger>
          <SelectContent>
            {relevantCategories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id.toString()}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || "#6B7280" }} />
                  {cat.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bankAccount">Conta Corrente</Label>
        <Select value={formData.bankAccountId} onValueChange={(v) => setFormData({ ...formData, bankAccountId: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma conta" />
          </SelectTrigger>
          <SelectContent>
            {bankAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id.toString()}>
                {account.name} {account.bank && `- ${account.bank}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="paymentMethod">Meio de Pagamento</Label>
        <Select value={formData.paymentMethodId} onValueChange={(v) => setFormData({ ...formData, paymentMethodId: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um meio" />
          </SelectTrigger>
          <SelectContent>
            {paymentMethods?.filter(m => m.transactionType === formData.type).map((method) => (
              <SelectItem key={method.id} value={method.id.toString()}>
                {method.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Observações</Label>
        <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Notas adicionais..." rows={3} />
      </div>

      <div className="space-y-2">
        <Label>Documentos</Label>
        <AttachmentUploader
          transactionId={editingTransaction?.id}
          attachments={attachments}
          onUpload={async (file, type) => {
            console.log('[DEBUG] onUpload called with file:', file.name, 'type:', type);
            try {
              // Upload file to Supabase Storage
              const blobUrl = await uploadFile(file);
              
              // If editing a transaction, save to database
              if (editingTransaction?.id) {
                await utils.client.attachments.create.mutate({
                  transactionId: editingTransaction.id,
                  filename: file.name,
                  blobUrl,
                  fileSize: file.size,
                  mimeType: file.type,
                  type,
                });
                // Refresh attachments list
                const updatedAttachments = await utils.client.attachments.listByTransaction.query({
                  transactionId: editingTransaction.id,
                });
                setAttachments(updatedAttachments);
                toast.success("Arquivo enviado com sucesso!");
              } else {
                // If creating a new transaction, store temporarily
                const newAttachment = {
                  id: Date.now(), // temporary ID
                  filename: file.name,
                  blobUrl,
                  fileSize: file.size,
                  mimeType: file.type,
                  type,
                  createdAt: new Date().toISOString(),
                };
                setAttachments([...attachments, newAttachment]);
                toast.success("Arquivo adicionado! Será salvo ao criar a transação.");
              }
            } catch (error) {
              console.error("[DEBUG] Erro completo ao fazer upload:", error);
              console.error("[DEBUG] Error message:", error instanceof Error ? error.message : String(error));
              console.error("[DEBUG] Error stack:", error instanceof Error ? error.stack : 'No stack');
              toast.error("Erro ao fazer upload do arquivo: " + (error instanceof Error ? error.message : String(error)));
            }
          }}
          onDelete={async (id) => {
            try {
              const attachment = attachments.find(a => a.id === id);
              if (!attachment) return;
              
              // Check if it's a temporary attachment
              const isTemporary = id > 1000000000000;
              
              // If it's a saved attachment (not temporary), delete from database and storage
              if (!isTemporary && editingTransaction?.id) {
                await utils.client.attachments.delete.mutate({ id });
                await deleteFile(attachment.blobUrl);
              } else {
                // If it's a temporary attachment, just delete from storage
                await deleteFile(attachment.blobUrl);
              }
              
              setAttachments(attachments.filter(a => a.id !== id));
              toast.success("Anexo removido");
            } catch (error) {
              console.error("Erro ao deletar anexo:", error);
              toast.error("Erro ao deletar anexo");
            }
          }}
          onUpdateType={async (id, type) => {
            try {
              // Check if it's a temporary attachment (created with Date.now())
              const isTemporary = id > 1000000000000;
              
              // If it's a saved attachment (not temporary), update in database
              if (!isTemporary && editingTransaction?.id) {
                await utils.client.attachments.updateType.mutate({ id, type });
              }
              
              // Always update local state
              setAttachments(attachments.map(a => a.id === id ? { ...a, type } : a));
              toast.success("Tipo atualizado");
            } catch (error) {
              console.error("Erro ao atualizar tipo:", error);
              toast.error("Erro ao atualizar tipo");
            }
          }}
          onPreview={(attachment) => {
            setPreviewAttachment(attachment);
          }}
        />
      </div>

      {!isEdit && (
        <div className="flex items-center space-x-2">
          <Checkbox id="recurring" checked={formData.isRecurring} onCheckedChange={(checked) => setFormData({ ...formData, isRecurring: checked as boolean })} />
          <Label htmlFor="recurring" className="cursor-pointer">
            Despesa recorrente
          </Label>
        </div>
      )}

      {formData.isRecurring && !isEdit && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="recurrenceCount">Repetir por</Label>
              <Input 
                id="recurrenceCount" 
                type="number" 
                min="1" 
                value={formData.recurrenceCount} 
                onChange={(e) => setFormData({ ...formData, recurrenceCount: e.target.value })} 
              />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="recurrenceFrequency">Frequência</Label>
              <Select
                value={formData.recurrenceFrequency}
                onValueChange={(value: "DAY" | "WEEK" | "MONTH" | "YEAR") => setFormData({ ...formData, recurrenceFrequency: value })}
              >
                <SelectTrigger id="recurrenceFrequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAY">Dia(s)</SelectItem>
                  <SelectItem value="WEEK">Semana(s)</SelectItem>
                  <SelectItem value="MONTH">Mês(es)</SelectItem>
                  <SelectItem value="YEAR">Ano(s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
