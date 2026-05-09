import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowUpRight, ArrowDownRight, Filter, Search, Edit2, Calendar, Trash2, Paperclip, Download, FileArchive, X, Tag, Tags, CheckCircle2, Building2, Landmark, CreditCard, ChevronDown, ChevronRight, FileUp, Eye, Trash } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CategorySelect } from "@/components/CategorySelect";
import { QuickCategoryList } from "@/components/QuickCategoryList";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { AttachmentUploader } from "@/components/AttachmentUploader";
import { uploadFile, deleteFile } from "@/lib/storage";
import { CurrencyInput, parseCurrency, formatCurrencyValue } from "@/components/CurrencyInput";
import { DatePicker } from "@/components/ui/date-picker";

export default function Transactions() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "income" | "expense">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  
  // Filter states — initialize with current month by default for performance
  const [filterPeriod, setFilterPeriod] = useState<"all" | "month" | "year" | "custom">("month");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterBankAccountId, setFilterBankAccountId] = useState<string>("");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  
  // Estados para edição inline do nome da transação
  const [editingDescriptionId, setEditingDescriptionId] = useState<number | null>(null);
  const [editingDescriptionValue, setEditingDescriptionValue] = useState("");
  const [savingDescriptionId, setSavingDescriptionId] = useState<number | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // Estados para categorização rápida inline
  const [quickCategoryTx, setQuickCategoryTx] = useState<any>(null);
  const [quickCategoryDrawerOpen, setQuickCategoryDrawerOpen] = useState(false);
  const [quickCategoryValue, setQuickCategoryValue] = useState<string>("");
  const [quickCategorySaving, setQuickCategorySaving] = useState(false);
  
  // Estados para categorização em lote
  const [isBulkCategoryOpen, setIsBulkCategoryOpen] = useState(false);
  const [bulkCategoryAssignments, setBulkCategoryAssignments] = useState<Record<number, string>>({});
  const [bulkCategorySaving, setBulkCategorySaving] = useState(false);
  
  // Estado para agrupamento de cartões de crédito (expandir/colapsar)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  
  // Estado para anexos da fatura do cartão
  const [invoiceAttachSheet, setInvoiceAttachSheet] = useState<{ open: boolean; cardId: number | null; cardName: string; month: number; year: number; invoiceId: number | null }>({
    open: false, cardId: null, cardName: "", month: new Date().getMonth() + 1, year: new Date().getFullYear(), invoiceId: null
  });
  const [invoiceAttachments, setInvoiceAttachments] = useState<any[]>([]);
  const [invoiceAttachUploading, setInvoiceAttachUploading] = useState(false);
  const [invoiceAttachPreview, setInvoiceAttachPreview] = useState<any | null>(null);
  const invoiceAttachFileRef = useRef<HTMLInputElement>(null);

  // Estado para pagamento de fatura de cartão
  const [payInvoiceSheet, setPayInvoiceSheet] = useState<{ open: boolean; cardName: string; cardId: number | null; total: number; pendingCount: number; invoiceTotal: number | null }>({ open: false, cardName: "", cardId: null, total: 0, pendingCount: 0, invoiceTotal: null });
  const [payInvoiceBankAccountId, setPayInvoiceBankAccountId] = useState<string>("");
  
  // Resetar mês e ano para o atual ao abrir a página
  useEffect(() => {
    setFilterPeriod("month");
    setFilterYear(new Date().getFullYear());
    setFilterMonth(new Date().getMonth() + 1);
  }, []);
  
  // Calcular quantos filtros estao ativos
  const activeFiltersCount = [
    filterPeriod !== "all",
    filterCategoryId !== "" && filterCategoryId !== "all",
    filterStatus !== "" && filterStatus !== "all",
    filterBankAccountId !== "" && filterBankAccountId !== "all",
    filterStartDate !== "" || filterEndDate !== ""
  ].filter(Boolean).length;

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
    creditCardId: "",
    purchaseDate: "",
    installments: "1",
    notes: "",
    isRecurring: false,
    recurrenceCount: "1",
    recurrenceFrequency: "MONTH" as "DAY" | "WEEK" | "MONTH" | "YEAR",
    attachments: [] as number[],
    addToAgenda: false,
  });

  // Estado para gerenciar anexos
  const [attachments, setAttachments] = useState<any[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<any>(null);
  
  // Estados para exportação de anexos
  const [isExportAttachmentsOpen, setIsExportAttachmentsOpen] = useState(false);
  const [exportAttachmentsTypes, setExportAttachmentsTypes] = useState<string[]>([]);
  const [exportAttachmentsStartDate, setExportAttachmentsStartDate] = useState("");
  const [exportAttachmentsEndDate, setExportAttachmentsEndDate] = useState("");
  const [exportingAttachments, setExportingAttachments] = useState(false);

  const utils = trpc.useUtils();
  const { data: entities, isLoading: entitiesLoading } = trpc.entities.list.useQuery(undefined, { refetchInterval: 60_000 });

  // Set first entity as default
  if (!selectedEntityId && entities && entities.length > 0) {
    setSelectedEntityId(entities[0].id);
  }

  // Calcular role do usuário na entidade selecionada
  const selectedEntity = entities?.find((e) => e.id === selectedEntityId);
  const myRole = (selectedEntity as any)?.sharedRole ?? "OWNER"; // null sharedRole = é dono
  const canWrite = myRole === "OWNER" || myRole === "ADMIN" || myRole === "EDITOR";
  const canDelete = myRole === "OWNER" || myRole === "ADMIN";

  // Compute filter dates BEFORE queries so they can be passed as query params for performance
  const getFilterDates = () => {
    if (filterPeriod === "month") {
      return {
        startDate: startOfMonth(new Date(filterYear, filterMonth - 1)),
        endDate: endOfMonth(new Date(filterYear, filterMonth - 1)),
      };
    } else if (filterPeriod === "year") {
      return {
        startDate: startOfYear(new Date(filterYear, 0)),
        endDate: endOfYear(new Date(filterYear, 0)),
      };
    } else if (filterPeriod === "custom" && filterStartDate && filterEndDate) {
      return {
        startDate: new Date(filterStartDate + "T00:00:00"),
        endDate: new Date(filterEndDate + "T23:59:59"),
      };
    }
    return { startDate: undefined, endDate: undefined };
  };
  const { startDate, endDate } = getFilterDates();

  const { data: transactions, isLoading: transactionsLoading } = trpc.transactions.listByEntity.useQuery(
    {
      entityId: selectedEntityId!,
      type: activeTab === "all" ? undefined : activeTab === "income" ? "INCOME" : "EXPENSE",
      startDate,
      endDate,
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
  const { data: creditCards } = trpc.creditCards.listByEntity.useQuery(
    { entityId: selectedEntityId! },
    { enabled: !!selectedEntityId }
  );
  // Buscar anexos da fatura quando o sheet estiver aberto
  const { data: invoiceAttachData, refetch: refetchInvoiceAttach } = trpc.invoiceAttachments.listByInvoice.useQuery(
    { creditCardId: invoiceAttachSheet.cardId!, month: invoiceAttachSheet.month, year: invoiceAttachSheet.year },
    { enabled: invoiceAttachSheet.open && !!invoiceAttachSheet.cardId }
  );
  const deleteInvoiceAttachMutation = trpc.invoiceAttachments.delete.useMutation({
    onSuccess: () => { refetchInvoiceAttach(); toast.success("Anexo removido"); },
    onError: () => toast.error("Erro ao remover anexo"),
  });
  const updateInvoiceAttachTypeMutation = trpc.invoiceAttachments.updateType.useMutation({
    onSuccess: () => refetchInvoiceAttach(),
    onError: () => toast.error("Erro ao atualizar tipo"),
  });

  // Buscar invoiceTotals salvos (valor real da fatura do PDF/CSV) para exibir no card do cartão
  const { data: invoiceTotals } = trpc.creditCards.getInvoiceTotals.useQuery(
    { entityId: selectedEntityId! },
    { enabled: !!selectedEntityId }
  );
  
  // Fetch transaction summary
  const { data: summary, isLoading: summaryLoading } = trpc.transactions.summary.useQuery(
    {
      entityId: selectedEntityId!,
      startDate,
      endDate,
      status: filterStatus && filterStatus !== "all" ? (filterStatus as "PENDING" | "PAID" | "OVERDUE") : undefined,
      categoryId: filterCategoryId && filterCategoryId !== "all" ? parseInt(filterCategoryId) : undefined,
    },
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
      
      // Criar tarefa na agenda se solicitado
      if (formData.addToAgenda && selectedEntityId) {
        try {
          const taskTitle = formData.type === "EXPENSE" 
            ? `Pagamento: ${formData.description}` 
            : `Recebimento: ${formData.description}`;
          
          // Se for recorrente, criar uma tarefa para cada parcela
          if (formData.isRecurring && data.transactions && data.transactions.length > 0) {
            for (const transaction of data.transactions) {
              await utils.client.tasks.create.mutate({
                entityId: selectedEntityId,
                transactionId: transaction.id,
                title: taskTitle,
                description: `Valor: R$ ${(transaction.amount / 100).toFixed(2).replace('.', ',')}`,
                dueDate: new Date(transaction.dueDate),
                endDate: new Date(transaction.dueDate),
                dueTime: "09:00",
                endTime: "10:00",
                allDay: true,
                priority: "MEDIUM",
                status: "PENDING",
              });
            }
          } else {
            // Criar apenas uma tarefa para transação única
            await utils.client.tasks.create.mutate({
              entityId: selectedEntityId,
              transactionId: data.id,
              title: taskTitle,
              description: `Valor: R$ ${(parseCurrency(formData.amount) / 100).toFixed(2).replace('.', ',')}`,
              dueDate: new Date(formData.dueDate + "T12:00:00"),
              endDate: new Date(formData.dueDate + "T12:00:00"),
              dueTime: "09:00",
              endTime: "10:00",
              allDay: true,
              priority: "MEDIUM",
              status: "PENDING",
            });
          }
          toast.success("Tarefa adicionada na agenda!");
        } catch (error) {
          console.error("Erro ao criar tarefa na agenda:", error);
          toast.error("Transação criada mas houve erro ao adicionar na agenda");
        }
      }
      
      utils.transactions.listByEntity.invalidate();
      utils.transactions.summary.invalidate();
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
    onSuccess: async () => {
      // Criar tarefa na agenda se solicitado durante edição
      if (formData.addToAgenda && selectedEntityId && editingTransaction) {
        try {
          // Verificar se a transação faz parte de uma recorrência
          const parentId = editingTransaction.parentTransactionId;
          
          if (parentId) {
            // Buscar todas as transações relacionadas (mesma recorrência)
            const allTransactions = transactions?.filter(t => t.parentTransactionId === parentId) || [];
            
            if (allTransactions.length > 1) {
              // Criar tarefa para cada transação da recorrência
              for (const t of allTransactions) {
                const taskTitle = t.type === "EXPENSE" 
                  ? `Pagamento: ${t.description}` 
                  : `Recebimento: ${t.description}`;
                
                await utils.client.tasks.create.mutate({
                  entityId: selectedEntityId,
                  transactionId: t.id,
                  title: taskTitle,
                  description: `Valor: R$ ${(t.amount / 100).toFixed(2).replace('.', ',')}`,
                  dueDate: new Date(t.dueDate),
                  endDate: new Date(t.dueDate),
                  dueTime: "09:00",
                  endTime: "10:00",
                  allDay: true,
                  priority: "MEDIUM",
                  status: "PENDING",
                });
              }
              toast.success(`${allTransactions.length} tarefas adicionadas na agenda!`);
            } else {
              // Apenas uma transação, criar tarefa única
              const taskTitle = formData.type === "EXPENSE" 
                ? `Pagamento: ${formData.description}` 
                : `Recebimento: ${formData.description}`;
              
              await utils.client.tasks.create.mutate({
                entityId: selectedEntityId,
                transactionId: editingTransaction.id,
                title: taskTitle,
                description: `Valor: R$ ${(parseCurrency(formData.amount) / 100).toFixed(2).replace('.', ',')}`,
                dueDate: new Date(formData.dueDate + "T12:00:00"),
                endDate: new Date(formData.dueDate + "T12:00:00"),
                dueTime: "09:00",
                endTime: "10:00",
                allDay: true,
                priority: "MEDIUM",
                status: "PENDING",
              });
              toast.success("Tarefa adicionada na agenda!");
            }
          } else {
            // Transação sem recorrência, criar tarefa única
            const taskTitle = formData.type === "EXPENSE" 
              ? `Pagamento: ${formData.description}` 
              : `Recebimento: ${formData.description}`;
            
            await utils.client.tasks.create.mutate({
              entityId: selectedEntityId,
              transactionId: editingTransaction.id,
              title: taskTitle,
              description: `Valor: R$ ${(parseCurrency(formData.amount) / 100).toFixed(2).replace('.', ',')}`,
              dueDate: new Date(formData.dueDate + "T12:00:00"),
              endDate: new Date(formData.dueDate + "T12:00:00"),
              dueTime: "09:00",
              endTime: "10:00",
              allDay: true,
              priority: "MEDIUM",
              status: "PENDING",
            });
            toast.success("Tarefa adicionada na agenda!");
          }
        } catch (error) {
          console.error("Erro ao criar tarefa na agenda:", error);
          toast.error("Transação atualizada mas houve erro ao adicionar na agenda");
        }
      }
      
      utils.transactions.listByEntity.invalidate();
      utils.transactions.summary.invalidate();
      utils.dashboard.metrics.invalidate();
      setIsEditOpen(false);
      setEditingTransaction(null);
      toast.success("Transação atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar transação");
    },
  });

  const exportAttachmentsMutation = trpc.exports.exportAttachmentsZip.useMutation();

  const deleteRecurringMutation = trpc.transactions.deleteRecurring.useMutation({
    onSuccess: () => {
      utils.transactions.listByEntity.invalidate();
      utils.transactions.summary.invalidate();
      utils.dashboard.metrics.invalidate();
      setDeleteDialogOpen(false);
      setDeletingTransactionId(null);
      setIsRecurringTransaction(false);
      toast.success("Transacao(oes) excluida(s) com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir transacao");
    },
  });

  const deleteMutation = trpc.transactions.delete.useMutation({
    onSuccess: () => {
      utils.transactions.listByEntity.invalidate();
      utils.transactions.summary.invalidate();
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
  const [deleteMode, setDeleteMode] = useState<'single' | 'all'>('single');
  const [isRecurringTransaction, setIsRecurringTransaction] = useState(false);

  const handleDelete = (id: number) => {
    const transaction = transactions?.find(t => t.id === id);
    const hasRecurringPattern = transaction?.description.includes('(') && transaction?.description.includes('/');
    setIsRecurringTransaction(!!hasRecurringPattern);
    setDeleteMode('single');
    setDeletingTransactionId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deletingTransactionId) {
      if (isRecurringTransaction) {
        deleteRecurringMutation.mutate({ id: deletingTransactionId, deleteMode });
      } else {
        deleteMutation.mutate({ id: deletingTransactionId });
      }
    }
  };

  const handleExportAttachments = async () => {
    if (!selectedEntityId) return;
    
    setExportingAttachments(true);
    try {
      const result = await exportAttachmentsMutation.mutateAsync({
        entityId: selectedEntityId,
        types: exportAttachmentsTypes.length > 0 ? exportAttachmentsTypes : undefined,
        startDate: exportAttachmentsStartDate || undefined,
        endDate: exportAttachmentsEndDate || undefined,
      });
      
      // Download do arquivo
      const blob = new Blob([Uint8Array.from(atob(result.data), c => c.charCodeAt(0))], {
        type: 'application/zip',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setIsExportAttachmentsOpen(false);
      toast.success('Anexos exportados com sucesso!');
    } catch (error: any) {
      console.error('Erro ao exportar anexos:', error);
      toast.error(error.message || 'Erro ao exportar anexos. Tente novamente.');
    } finally {
      setExportingAttachments(false);
    }
  };
  
  const toggleAttachmentType = (type: string) => {
    setExportAttachmentsTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
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
      creditCardId: "",
      purchaseDate: "",
      installments: "1",
      notes: "",
      isRecurring: false,
      recurrenceCount: "1",
      recurrenceFrequency: "MONTH" as "DAY" | "WEEK" | "MONTH" | "YEAR",
      attachments: [],
      addToAgenda: false,
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
      amount: parseCurrency(formData.amount),
      dueDate: new Date(formData.dueDate + "T12:00:00"),
      paymentDate: formData.paymentDate ? new Date(formData.paymentDate + "T12:00:00") : undefined,
      status: formData.status,
      categoryId: formData.categoryId ? parseInt(formData.categoryId) : undefined,
      bankAccountId: formData.creditCardId ? undefined : (formData.bankAccountId ? parseInt(formData.bankAccountId) : undefined),
      paymentMethodId: formData.paymentMethodId ? parseInt(formData.paymentMethodId) : undefined,
      creditCardId: formData.creditCardId ? parseInt(formData.creditCardId) : undefined,
      purchaseDate: formData.purchaseDate ? new Date(formData.purchaseDate + "T12:00:00") : undefined,
      installments: formData.creditCardId && parseInt(formData.installments) > 1 ? parseInt(formData.installments) : undefined,
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
      amount: formatCurrencyValue(transaction.amount / 100),
      dueDate: format(new Date(transaction.dueDate), "yyyy-MM-dd"),
      paymentDate: transaction.paymentDate ? format(new Date(transaction.paymentDate), "yyyy-MM-dd") : "",
      status: transaction.status,
      categoryId: transaction.categoryId?.toString() || "",
      bankAccountId: transaction.bankAccountId?.toString() || "",
      paymentMethodId: transaction.paymentMethodId?.toString() || "",
      creditCardId: transaction.creditCardId?.toString() || "",
      purchaseDate: "",
      installments: "1",
      notes: transaction.notes || "",
      isRecurring: transaction.isRecurring || false,
      recurrenceCount: "1",
      recurrenceFrequency: "MONTH" as "DAY" | "WEEK" | "MONTH" | "YEAR",
      attachments: [],
      addToAgenda: false,
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
      amount: parseCurrency(formData.amount),
      dueDate: new Date(formData.dueDate + "T12:00:00"),
      paymentDate: formData.paymentDate ? new Date(formData.paymentDate + "T12:00:00") : undefined,
      status: formData.status,
      categoryId: formData.categoryId ? parseInt(formData.categoryId) : undefined,
      bankAccountId: formData.creditCardId ? undefined : (formData.bankAccountId ? parseInt(formData.bankAccountId) : undefined),
      paymentMethodId: formData.paymentMethodId ? parseInt(formData.paymentMethodId) : undefined,
      creditCardId: formData.creditCardId ? parseInt(formData.creditCardId) : undefined,
      purchaseDate: formData.purchaseDate ? new Date(formData.purchaseDate + "T12:00:00") : undefined,
      installments: formData.creditCardId && parseInt(formData.installments) > 1 ? parseInt(formData.installments) : undefined,
      notes: formData.notes || undefined,
      isRecurring: formData.isRecurring,
      recurrenceCount: formData.isRecurring ? parseInt(formData.recurrenceCount) : undefined,
      recurrenceFrequency: formData.isRecurring ? formData.recurrenceFrequency : undefined,
    });
  };
  // Categorizaação rápida inline via Popover — recebe transação e categoryId diretamente
  const handleSaveQuickCategory = async (transaction: any, categoryId: number) => {
    try {
      // Não enviar amount: o banco já armazena em centavos e o servidor multiplicaria por 100 novamente
      await utils.client.transactions.update.mutate({
        id: transaction.id,
        categoryId: categoryId,
      });
      utils.transactions.listByEntity.invalidate();
      utils.transactions.summary.invalidate();
      utils.dashboard.metrics.invalidate();
      toast.success("Categoria atualizada!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar categoria");
    }
  };

  // Função para salvar a descrição editada inline
  const handleSaveInlineDescription = async (transactionId: number) => {
    const newDescription = editingDescriptionValue.trim();
    if (!newDescription) {
      setEditingDescriptionId(null);
      return;
    }
    setSavingDescriptionId(transactionId);
    try {
      await utils.client.transactions.update.mutate({
        id: transactionId,
        description: newDescription,
      });
      utils.transactions.listByEntity.invalidate();
      utils.transactions.summary.invalidate();
      toast.success("Descrição atualizada!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar descrição");
    } finally {
      setSavingDescriptionId(null);
      setEditingDescriptionId(null);
    }
  };

  // handleOpenBulkCategory e handleSaveBulkCategory usam uncategorizedTransactions
  // que é definido após filteredTransactions — ver abaixo
  const handleOpenBulkCategory = () => {
    const initial: Record<number, string> = {};
    uncategorizedTransactions.forEach((t) => { initial[t.id] = ""; });
    setBulkCategoryAssignments(initial);
    setIsBulkCategoryOpen(true);
  };

  const handleSaveBulkCategory = async () => {
    const toUpdate = Object.entries(bulkCategoryAssignments).filter(([, v]) => v !== "");
    if (toUpdate.length === 0) {
      toast.info("Nenhuma categoria selecionada.");
      return;
    }
    setBulkCategorySaving(true);
    let successCount = 0;
    try {
      for (const [idStr, categoryIdStr] of toUpdate) {
        const tx = uncategorizedTransactions.find((t) => t.id === parseInt(idStr));
        if (!tx) continue;
        // Não enviar amount: o banco já armazena em centavos e o servidor multiplicaria por 100 novamente
        await utils.client.transactions.update.mutate({
          id: tx.id,
          categoryId: parseInt(categoryIdStr),
        });
        successCount++;
      }
      utils.transactions.listByEntity.invalidate();
      utils.transactions.summary.invalidate();
      utils.dashboard.metrics.invalidate();
      setIsBulkCategoryOpen(false);
      setBulkCategoryAssignments({});
      toast.success(`${successCount} transações categorizadas com sucesso!`);
    } catch (error: any) {
      toast.error(error.message || "Erro ao categorizar transações");
    } finally {
      setBulkCategorySaving(false);
    }
  };

  // Apply filters to transactions
  const filteredTransactions = transactions?.filter((t) => {
    // Search filter
    if (searchTerm && !t.description.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Category filter — inclui subcategorias quando filtra pela categoria pai
    if (filterCategoryId && filterCategoryId !== "all") {
      const filterId = parseInt(filterCategoryId);
      const txCatId = t.categoryId;
      if (!txCatId) return false;
      // Verifica se a transação é da categoria selecionada OU de uma subcategoria dela
      const txCategory = categories?.find((c) => c.id === txCatId);
      const isDirectMatch = txCatId === filterId;
      const isSubcategoryMatch = (txCategory as any)?.parentId === filterId;
      if (!isDirectMatch && !isSubcategoryMatch) return false;
    }

    // Status filter
    if (filterStatus && filterStatus !== "all" && t.status !== filterStatus) {
      return false;
    }
    // Bank account filter
    if (filterBankAccountId && filterBankAccountId !== "all" && t.bankAccountId?.toString() !== filterBankAccountId) {
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

  // Transações sem categoria (calculado após filtro)
  const uncategorizedTransactions = filteredTransactions?.filter((t) => !t.categoryId) || [];

  // Agrupar transações de cartão de crédito por nome do cartão
  const { cardGroups, nonCardTransactions } = (() => {
    if (!filteredTransactions) return { cardGroups: [] as any[], nonCardTransactions: [] as any[] };
    const groups = new Map<string, { cardName: string; cardColor: string; transactions: any[]; total: number; cardId?: number }>();
    const nonCard: any[] = [];
    for (const t of filteredTransactions) {
      if (t.creditCardName) {
        const key = t.creditCardName;
        if (!groups.has(key)) {
          // Buscar cardId pelo nome do cartão
          const matchedCard = creditCards?.find((c: any) => c.name === t.creditCardName);
          groups.set(key, { cardName: t.creditCardName, cardColor: t.creditCardColor || '#7C3AED', transactions: [], total: 0, cardId: matchedCard?.id });
        }
        const g = groups.get(key)!;
        g.transactions.push(t);
        // Débitos (EXPENSE) somam, créditos (INCOME: estornos, pagamentos antecipados) subtraem
        g.total += t.type === 'INCOME' ? -t.amount : t.amount;
      } else {
        nonCard.push(t);
      }
    }
    // Enriquecer grupos com invoiceTotal salvo (valor real da fatura do PDF/CSV)
    const invoiceTotalsMap = new Map<string, number>();
    if (invoiceTotals) {
      for (const inv of invoiceTotals) {
        invoiceTotalsMap.set(`${inv.creditCardId}-${inv.year}-${inv.month}`, inv.invoiceTotal ?? 0);
      }
    }
    const enrichedGroups = Array.from(groups.values()).map((g) => {
      if (g.cardId && startDate && endDate) {
        // Determinar mês/ano do filtro atual
        const filterMonth = startDate.getMonth() + 1;
        const filterYear = startDate.getFullYear();
        const savedTotal = invoiceTotalsMap.get(`${g.cardId}-${filterYear}-${filterMonth}`);
        return { ...g, invoiceTotal: savedTotal ?? null };
      }
      return { ...g, invoiceTotal: null };
    });
    return { cardGroups: enrichedGroups, nonCardTransactions: nonCard };
  })();

  function toggleCardExpand(cardName: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardName)) next.delete(cardName);
      else next.add(cardName);
      return next;
    });
  }

  // Mutation para pagar fatura do cartão
  const payInvoiceMutation = trpc.creditCards.payInvoice.useMutation({
    onSuccess: (data) => {
      toast.success(`Fatura paga com sucesso! ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(data.totalAmount / 100)} debitados da conta.`);
      setPayInvoiceSheet({ open: false, cardName: "", cardId: null, total: 0, pendingCount: 0, invoiceTotal: null });
      setPayInvoiceBankAccountId("");
      utils.transactions.listByEntity.invalidate();
      utils.transactions.summary.invalidate();
      utils.dashboard.metrics.invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao pagar fatura"),
  });

  function openPayInvoiceSheet(group: any) {
    // Find the cardId by matching card name from the creditCards list
    const matchedCard = creditCards?.find((c: any) => c.name === group.cardName);
    const cardId = matchedCard?.id;
    if (!cardId) {
      toast.error("Não foi possível identificar o cartão. Verifique se o cartão está cadastrado.");
      return;
    }
    const pendingTxs = group.transactions.filter((t: any) => t.status === "PENDING" || t.status === "OVERDUE");
    if (pendingTxs.length === 0) {
      toast.info("Todas as transações desta fatura já estão pagas");
      return;
    }
    // Débitos (EXPENSE) somam, créditos (INCOME) subtraem
    const pendingTotal = pendingTxs.reduce((sum: number, t: any) => sum + (t.type === 'INCOME' ? -t.amount : t.amount), 0);
    setPayInvoiceSheet({ open: true, cardName: group.cardName, cardId: Number(cardId), total: pendingTotal, pendingCount: pendingTxs.length, invoiceTotal: group.invoiceTotal ?? null });
    if (bankAccounts && bankAccounts.length > 0) {
      setPayInvoiceBankAccountId(String(bankAccounts[0].id));
    }
  }

  function handlePayInvoice() {
    if (!payInvoiceSheet.cardId || !payInvoiceBankAccountId) return;
    payInvoiceMutation.mutate({
      cardId: payInvoiceSheet.cardId,
      month: filterMonth,
      year: filterYear,
      bankAccountId: Number(payInvoiceBankAccountId),
    });
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      PENDING: "secondary",
      PAID: "default",
      OVERDUE: "destructive",
    };
    return <Badge variant={variants[status] || "default"}>{status === "PENDING" ? "Pendente" : status === "PAID" ? "Pago" : "Vencido"}</Badge>;
  };

  const getCategoryBadge = (categoryId: number | null, categoryName?: string | null, categoryColor?: string | null) => {
    if (!categoryId) return null;
    // Prioriza os dados que já vêm na transação via JOIN (categoryName, categoryColor)
    const name = categoryName || categories?.find((c) => c.id === categoryId)?.name;
    const color = categoryColor || categories?.find((c) => c.id === categoryId)?.color || "#6B7280";
    if (!name) return null;
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div 
          className="w-3 h-3 rounded-full flex-shrink-0" 
          style={{ background: `linear-gradient(135deg, ${color}dd, ${color}88)` }}
        />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{name}</span>
      </span>
    );
  };

  // Badge de categoria com hierarquia (pai > subcategoria)
  const getCategoryHierarchyBadge = (transaction: any) => {
    const categoryId = transaction.categoryId;
    if (!categoryId) return null;
    const catName = transaction.categoryName || categories?.find((c: any) => c.id === categoryId)?.name;
    const catColor = transaction.categoryColor || categories?.find((c: any) => c.id === categoryId)?.color || "#6B7280";
    const parentName = transaction.parentCategoryName;
    const parentColor = transaction.parentCategoryColor || catColor;
    if (!catName) return null;
    
    if (parentName) {
      // É uma subcategoria: mostrar pai > filho com visual moderno
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-1">
            <div 
              className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
              style={{ background: `linear-gradient(135deg, ${parentColor}dd, ${parentColor}88)` }}
            />
            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{parentName}</span>
          </div>
          <div className="w-px h-3 bg-gray-300 dark:bg-gray-600" />
          <div className="flex items-center gap-1">
            <div 
              className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
              style={{ background: `linear-gradient(135deg, ${catColor}dd, ${catColor}88)` }}
            />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{catName}</span>
          </div>
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div 
          className="w-3 h-3 rounded-full flex-shrink-0" 
          style={{ background: `linear-gradient(135deg, ${catColor}dd, ${catColor}88)` }}
        />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{catName}</span>
      </span>
    );
  };

  // Badge de cartão de crédito
  const getCreditCardBadge = (transaction: any) => {
    const cardName = transaction.creditCardName;
    const cardColor = transaction.creditCardColor;
    if (!cardName) return null;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
        style={{ backgroundColor: cardColor || '#6366f1' }}
      >
        <CreditCard className="h-3 w-3" />
        {cardName}
      </span>
    );
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Transações</h1>
          <p className="text-muted-foreground">Gerencie créditos e débitos</p>
        </div>
        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          <Button variant="outline" className="w-full md:w-auto" onClick={() => setIsExportAttachmentsOpen(true)}>
            <FileArchive className="h-4 w-4 mr-2" />
            Exportar Anexos
          </Button>

          <Sheet open={isExportAttachmentsOpen} onOpenChange={setIsExportAttachmentsOpen}>
            <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col">
              {/* Header Fixo */}
              <div className="sticky top-0 z-10 border dark:border-gray-700-b bg-white dark:bg-gray-800 px-8 py-4 flex items-center justify-between">
                <SheetTitle className="text-2xl font-bold">Exportar Anexos</SheetTitle>
                <button onClick={() => setIsExportAttachmentsOpen(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Conteúdo Scrollável */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Selecione os tipos de anexos e período para exportar em um arquivo ZIP
                </p>
                
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="font-semibold">Tipos de Anexos</Label>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="nota_fiscal"
                          checked={exportAttachmentsTypes.includes("NOTA_FISCAL")}
                          onCheckedChange={() => toggleAttachmentType("NOTA_FISCAL")}
                        />
                        <label htmlFor="nota_fiscal" className="text-sm cursor-pointer">
                          Notas Fiscais
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="documentos"
                          checked={exportAttachmentsTypes.includes("DOCUMENTOS")}
                          onCheckedChange={() => toggleAttachmentType("DOCUMENTOS")}
                        />
                        <label htmlFor="documentos" className="text-sm cursor-pointer">
                          Documentos
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="boleto"
                          checked={exportAttachmentsTypes.includes("BOLETO")}
                          onCheckedChange={() => toggleAttachmentType("BOLETO")}
                        />
                        <label htmlFor="boleto" className="text-sm cursor-pointer">
                          Boletos
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="comprovante"
                          checked={exportAttachmentsTypes.includes("COMPROVANTE_PAGAMENTO")}
                          onCheckedChange={() => toggleAttachmentType("COMPROVANTE_PAGAMENTO")}
                        />
                        <label htmlFor="comprovante" className="text-sm cursor-pointer">
                          Comprovantes de Pagamento
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Deixe vazio para exportar todos os tipos
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="export_start_date">Data Inicial</Label>
                      <DatePicker
                        id="export_start_date"
                        value={exportAttachmentsStartDate}
                        onChange={(v) => setExportAttachmentsStartDate(v)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="export_end_date">Data Final</Label>
                      <DatePicker
                        id="export_end_date"
                        value={exportAttachmentsEndDate}
                        onChange={(v) => setExportAttachmentsEndDate(v)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Deixe vazio para exportar de todos os períodos
                  </p>
                </div>
              </div>

              {/* Footer Fixo */}
              <div className="sticky bottom-0 z-10 border dark:border-gray-700-t bg-white dark:bg-gray-800 px-8 py-4 flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsExportAttachmentsOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleExportAttachments} disabled={exportingAttachments} className="bg-blue-600 hover:bg-blue-700">
                  {exportingAttachments ? (
                    <>
                      <Download className="h-4 w-4 mr-2 animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Exportar ZIP
                    </>
                  )}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          
          {canWrite && (
          <Button className="w-full md:w-auto" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Transação
          </Button>
          )}

          <Sheet open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) resetForm();
          }}>
            <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col">
              {/* Header Fixo */}
              <div className="sticky top-0 z-10 border dark:border-gray-700-b bg-white dark:bg-gray-800 px-8 py-4 flex items-center justify-between">
                <SheetTitle className="text-2xl font-bold">Nova Transação</SheetTitle>
                <button onClick={() => setIsCreateOpen(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Conteúdo Scrollável */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <TransactionForm
                  formData={formData}
                  setFormData={setFormData}
                  entities={entities || []}
                  categories={categories || []}
                  bankAccounts={bankAccounts || []}
                  paymentMethods={paymentMethods || []}
                  creditCards={creditCards || []}
                  selectedEntityId={selectedEntityId}
                  setSelectedEntityId={setSelectedEntityId}
                  attachments={attachments}
                  setAttachments={setAttachments}
                  editingTransaction={undefined}
                  utils={utils}
                  setPreviewAttachment={setPreviewAttachment}
                />
              </div>

              {/* Footer Fixo */}
              <div className="sticky bottom-0 z-10 border dark:border-gray-700-t bg-white dark:bg-gray-800 px-8 py-4 flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                  {createMutation.isPending ? "Criando..." : "Criar Transação"}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Edit Sheet */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col">
          {/* Header Fixo */}
          <div className="sticky top-0 z-10 border dark:border-gray-700-b bg-white dark:bg-gray-800 px-8 py-4 flex items-center justify-between">
            <SheetTitle className="text-2xl font-bold">Editar Transação</SheetTitle>
            <button onClick={() => setIsEditOpen(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Conteúdo Scrollável */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <TransactionForm
              formData={formData}
              setFormData={setFormData}
              entities={entities || []}
              categories={categories || []}
              bankAccounts={bankAccounts || []}
              paymentMethods={paymentMethods || []}
              creditCards={creditCards || []}
              selectedEntityId={selectedEntityId}
              setSelectedEntityId={setSelectedEntityId}
              attachments={attachments}
              setAttachments={setAttachments}
              editingTransaction={editingTransaction}
              isEdit
              utils={utils}
              setPreviewAttachment={setPreviewAttachment}
            />
          </div>

          {/* Footer Fixo */}
          <div className="sticky bottom-0 z-10 border dark:border-gray-700-t bg-white dark:bg-gray-800 px-8 py-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Pay Invoice Sheet */}
      <Sheet open={payInvoiceSheet.open} onOpenChange={(open) => { if (!open) { setPayInvoiceSheet({ open: false, cardName: "", cardId: null, total: 0, pendingCount: 0, invoiceTotal: null }); setPayInvoiceBankAccountId(""); } }}>
        <SheetContent side="right" className="w-full sm:w-[420px] flex flex-col">
          <SheetHeader>
            <SheetTitle className="text-xl font-bold">Pagar Fatura</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm text-muted-foreground">Cartão</p>
              <p className="font-semibold text-lg">{payInvoiceSheet.cardName}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Transações pendentes</p>
                <p className="font-semibold text-lg">{payInvoiceSheet.pendingCount}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Valor total</p>
                <p className="font-semibold text-lg text-red-600">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(payInvoiceSheet.invoiceTotal ?? payInvoiceSheet.total) / 100)}
                </p>
                {payInvoiceSheet.invoiceTotal != null && Math.abs(payInvoiceSheet.invoiceTotal - payInvoiceSheet.total) >= 10 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Soma das transações: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(payInvoiceSheet.total) / 100)}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Conta bancária para débito</label>
              <Select value={payInvoiceBankAccountId} onValueChange={setPayInvoiceBankAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts?.map((acc: any) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}{acc.bank ? ` (${acc.bank})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!payInvoiceBankAccountId || payInvoiceMutation.isPending}
              onClick={handlePayInvoice}
            >
              {payInvoiceMutation.isPending ? 'Processando...' : 'Confirmar Pagamento'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Invoice Attachments Sheet */}
      <Sheet open={invoiceAttachSheet.open} onOpenChange={(open) => { if (!open) setInvoiceAttachSheet(s => ({ ...s, open: false })); }}>
        <SheetContent side="right" className="w-full sm:w-[520px] flex flex-col">
          <SheetHeader>
            <SheetTitle className="text-xl font-bold flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Anexos da Fatura
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {invoiceAttachSheet.cardName} — {String(invoiceAttachSheet.month).padStart(2, '0')}/{invoiceAttachSheet.year}
            </p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Área de Upload — drag-and-drop */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                invoiceAttachUploading ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
              }`}
              onClick={() => !invoiceAttachUploading && invoiceAttachFileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={async (e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files);
                if (!files.length) return;
                const invoiceId = invoiceAttachData?.invoiceId;
                if (!invoiceId) { toast.error("Erro ao identificar a fatura"); return; }
                setInvoiceAttachUploading(true);
                for (const file of files) {
                  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
                  if (!allowed.includes(file.type)) { toast.error(`Tipo não suportado: ${file.name}`); continue; }
                  if (file.size > 10 * 1024 * 1024) { toast.error(`Arquivo muito grande: ${file.name}`); continue; }
                  try {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('invoiceId', String(invoiceId));
                    formData.append('type', 'DOCUMENTOS');
                    const res = await fetch('/api/invoice-attachments/upload', { method: 'POST', body: formData, credentials: 'include' });
                    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erro no upload'); }
                  } catch (err: any) { toast.error(`Erro ao enviar ${file.name}: ${err.message}`); }
                }
                await refetchInvoiceAttach();
                setInvoiceAttachUploading(false);
              }}
            >
              <FileUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-base font-medium">
                {invoiceAttachUploading ? 'Enviando...' : 'Arraste arquivos aqui ou clique para selecionar'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">PDF, JPEG, PNG • Máximo 10MB por arquivo</p>
            </div>
            <input
              ref={invoiceAttachFileRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;
                const invoiceId = invoiceAttachData?.invoiceId;
                if (!invoiceId) { toast.error("Erro ao identificar a fatura"); return; }
                setInvoiceAttachUploading(true);
                for (const file of files) {
                  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
                  if (!allowed.includes(file.type)) { toast.error(`Tipo não suportado: ${file.name}`); continue; }
                  if (file.size > 10 * 1024 * 1024) { toast.error(`Arquivo muito grande: ${file.name}`); continue; }
                  try {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('invoiceId', String(invoiceId));
                    formData.append('type', 'DOCUMENTOS');
                    const res = await fetch('/api/invoice-attachments/upload', { method: 'POST', body: formData, credentials: 'include' });
                    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Erro no upload'); }
                  } catch (err: any) { toast.error(`Erro ao enviar ${file.name}: ${err.message}`); }
                }
                await refetchInvoiceAttach();
                setInvoiceAttachUploading(false);
                if (invoiceAttachFileRef.current) invoiceAttachFileRef.current.value = '';
              }}
            />
            {/* Lista de anexos */}
            {!invoiceAttachData ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : invoiceAttachData.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum anexo ainda.</p>
            ) : (
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-muted-foreground">Documentos Anexados ({invoiceAttachData.attachments.length})</h3>
                {invoiceAttachData.attachments.map((att: any) => (
                  <div key={att.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="p-2 rounded-full bg-primary/10 flex-shrink-0 mt-0.5">
                      {att.mimeType === 'application/pdf'
                        ? <FileArchive className="h-4 w-4 text-red-500" />
                        : <Paperclip className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-sm font-medium truncate">{att.filename}</p>
                      <p className="text-xs text-muted-foreground">{(att.fileSize / 1024).toFixed(0)} KB</p>
                      {/* Seleção de tipo */}
                      <select
                        value={att.type}
                        onChange={(e) => updateInvoiceAttachTypeMutation.mutate({ id: att.id, type: e.target.value as any })}
                        className="text-xs border rounded px-2 py-1 w-full max-w-[200px] bg-background"
                      >
                        <option value="NOTA_FISCAL">Nota Fiscal</option>
                        <option value="DOCUMENTOS">Documentos</option>
                        <option value="BOLETO">Boleto</option>
                        <option value="COMPROVANTE_PAGAMENTO">Comprovante de Pagamento</option>
                      </select>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Visualizar"
                        onClick={() => window.open(`/api/invoice-attachments/${att.id}/preview`, '_blank', 'noopener,noreferrer')}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Baixar"
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = `/api/invoice-attachments/${att.id}/download`;
                          a.download = att.filename;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        title="Remover"
                        onClick={() => { if (confirm('Remover este anexo?')) deleteInvoiceAttachMutation.mutate({ id: att.id }); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Filtros */}
      {/* Mobile: Drawer de Filtros */}
      <div className="flex gap-2 items-center flex-wrap md:hidden">
        <Drawer open={isFilterDrawerOpen} onOpenChange={setIsFilterDrawerOpen}>
          <Button
            variant="outline"
            onClick={() => setIsFilterDrawerOpen(true)}
            className="relative"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge className="ml-2 bg-blue-50 dark:bg-blue-900/200 text-white">{activeFiltersCount}</Badge>
            )}
          </Button>

          <DrawerContent>
            <DrawerHeader>
              <div className="flex items-center justify-between">
                <DrawerTitle>Filtros</DrawerTitle>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon">
                    <X className="h-4 w-4" />
                  </Button>
                </DrawerClose>
              </div>
            </DrawerHeader>

            <div className="space-y-4 p-4 overflow-y-auto max-h-[60vh]">
              {/* Entidade */}
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

              {/* Período */}
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

              {/* Mês/Ano */}
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
                    <Label>Data Inicial</Label>
                    <DatePicker value={filterStartDate} onChange={(v) => setFilterStartDate(v)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Final</Label>
                    <DatePicker value={filterEndDate} onChange={(v) => setFilterEndDate(v)} />
                  </div>
                </>
              )}

              {/* Categoria */}
              <div className="space-y-2">
                <Label>Categoria</Label>
                <CategorySelect
                  categories={categories || []}
                  value={filterCategoryId}
                  onValueChange={setFilterCategoryId}
                  placeholder="Todas"
                  includeAll
                />
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="PENDING">Pendente</SelectItem>
                    <SelectItem value="PAID">Pago</SelectItem>
                    <SelectItem value="OVERDUE">Vencido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Conta Bancária */}
              <div className="space-y-2">
                <Label>Conta Bancária</Label>
                <Select value={filterBankAccountId} onValueChange={setFilterBankAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as contas</SelectItem>
                    {bankAccounts?.map((account) => (
                      <SelectItem key={account.id} value={account.id.toString()}>
                        <div className="flex items-center gap-2">
                          <Landmark className="h-3.5 w-3.5" />
                          {account.name}{account.bank ? ` (${account.bank})` : ""}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DrawerFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setFilterPeriod("all");
                  setFilterCategoryId("");
                  setFilterStatus("");
                  setFilterBankAccountId("");
                  setFilterStartDate("");
                  setFilterEndDate("");
                  setSearchTerm("");
                  setIsFilterDrawerOpen(false);
                }}
              >
                Limpar Filtros
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        {/* Buscar */}
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar descrição..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
          </div>
        </div>
      </div>

      {/* Desktop: Filtros em seção com destaque */}
      <div className="hidden md:block bg-muted rounded-lg p-4">
        <div className="flex gap-3 items-center flex-wrap">
        {/* Entidade */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Entidade:</span>
          <Select value={selectedEntityId?.toString() || ""} onValueChange={(v) => setSelectedEntityId(parseInt(v))}>
            <SelectTrigger className="w-[200px] bg-white dark:bg-gray-800">
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

        {/* Período */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Período:</span>
          <Select value={filterPeriod} onValueChange={(v: any) => setFilterPeriod(v)}>
            <SelectTrigger className="w-[140px] bg-white dark:bg-gray-800">
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

        {/* Mês/Ano */}
        {filterPeriod === "month" && (
          <>
            <Select value={filterMonth.toString()} onValueChange={(v) => setFilterMonth(parseInt(v))}>
              <SelectTrigger className="w-[120px] bg-white dark:bg-gray-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    {format(new Date(2024, i), "MMM", { locale: ptBR })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" value={filterYear} onChange={(e) => setFilterYear(parseInt(e.target.value))} className="w-[100px]" />
          </>
        )}

        {filterPeriod === "year" && (
          <Input type="number" value={filterYear} onChange={(e) => setFilterYear(parseInt(e.target.value))} className="w-[100px]" />
        )}

        {filterPeriod === "custom" && (
          <>
            <DatePicker value={filterStartDate} onChange={(v) => setFilterStartDate(v)} className="w-[160px]" />
            <DatePicker value={filterEndDate} onChange={(v) => setFilterEndDate(v)} className="w-[160px]" />
          </>
        )}

        {/* Categoria */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Categoria:</span>
          <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
            <SelectTrigger className="w-[180px] bg-white dark:bg-gray-800">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories?.filter((c) => !(c as any).parentId).map((parent) => {
                const subs = categories?.filter((c) => (c as any).parentId === parent.id) || [];
                return (
                  <>
                    <SelectItem key={parent.id} value={parent.id.toString()}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: parent.color || "#6B7280" }} />
                        <span className="font-medium">{parent.name}</span>
                        {subs.length > 0 && <span className="text-xs text-muted-foreground">(+ sub)</span>}
                      </div>
                    </SelectItem>
                    {subs.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id.toString()}>
                        <div className="flex items-center gap-2 pl-3">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sub.color || parent.color || "#6B7280" }} />
                          <span className="text-muted-foreground">{sub.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[130px] bg-white dark:bg-gray-800">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="PENDING">Pendente</SelectItem>
              <SelectItem value="PAID">Pago</SelectItem>
              <SelectItem value="OVERDUE">Vencido</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Conta Bancária */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Conta:</span>
          <Select value={filterBankAccountId} onValueChange={setFilterBankAccountId}>
            <SelectTrigger className="w-[160px] bg-white dark:bg-gray-800">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {bankAccounts?.map((account) => (
                <SelectItem key={account.id} value={account.id.toString()}>
                  {account.name}{account.bank ? ` (${account.bank})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Buscar */}
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar descrição..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
          </div>
        </div>

        {/* Botão Limpar */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelectedEntityId(null);
            setFilterPeriod("all");
            setFilterMonth(new Date().getMonth() + 1);
            setFilterYear(new Date().getFullYear());
            setFilterStartDate("");
            setFilterEndDate("");
            setFilterCategoryId("all");
            setFilterStatus("all");
            setFilterBankAccountId("all");
            setSearchTerm("");
          }}
        >
          Limpar
        </Button>
        </div>
      </div>

      {/* Transaction Summary */}
      {!summaryLoading && summary && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 rounded-lg p-4 md:p-6 mb-4">
          {activeTab === "all" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Créditos</span>
                  <ArrowUpRight className="h-4 w-4 text-green-600" />
                </div>
                <p className="text-2xl font-bold text-green-600">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.totalIncome / 100)}
                </p>
                {summary.incomeBreakdown && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col xxl:flex-row xxl:divide-x xxl:divide-gray-300 dark:xxl:divide-gray-600 gap-2 xxl:gap-0 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex xxl:flex-1 xxl:pr-3">
                        <span>Pago:</span>
                        <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.incomeBreakdown.paid / 100)}</span>
                      </div>
                      <div className="flex xxl:flex-1 xxl:px-3">
                        <span>Pendente:</span>
                        <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.incomeBreakdown.pending / 100)}</span>
                      </div>
                      <div className="flex xxl:flex-1 xxl:pl-3">
                        <span>Vencido:</span>
                        <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.incomeBreakdown.overdue / 100)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Débitos</span>
                  <ArrowDownRight className="h-4 w-4 text-red-600" />
                </div>
                <p className="text-2xl font-bold text-red-600">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.totalExpenses / 100)}
                </p>
                {summary.expensesBreakdown && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col xxl:flex-row xxl:divide-x xxl:divide-gray-300 dark:xxl:divide-gray-600 gap-2 xxl:gap-0 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex xxl:flex-1 xxl:pr-3">
                        <span>Pago:</span>
                        <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.expensesBreakdown.paid / 100)}</span>
                      </div>
                      <div className="flex xxl:flex-1 xxl:px-3">
                        <span>Pendente:</span>
                        <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.expensesBreakdown.pending / 100)}</span>
                      </div>
                      <div className="flex xxl:flex-1 xxl:pl-3">
                        <span>Vencido:</span>
                        <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.expensesBreakdown.overdue / 100)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Saldo</span>
                  <div className={`h-2 w-2 rounded-full ${summary.balance >= 0 ? 'bg-green-600' : 'bg-red-600'}`} />
                </div>
                <p className={`text-2xl font-bold ${summary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.balance / 100)}
                </p>
              </div>
            </div>
          ) : activeTab === "income" ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total de Créditos</span>
                <ArrowUpRight className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-green-600">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.totalIncome / 100)}
              </p>
              {summary.incomeBreakdown && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col xxl:flex-row xxl:divide-x xxl:divide-gray-300 dark:xxl:divide-gray-600 gap-2 xxl:gap-0 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex xxl:flex-1 xxl:pr-4">
                      <span>Pago:</span>
                      <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.incomeBreakdown.paid / 100)}</span>
                    </div>
                    <div className="flex xxl:flex-1 xxl:px-4">
                      <span>Pendente:</span>
                      <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.incomeBreakdown.pending / 100)}</span>
                    </div>
                    <div className="flex xxl:flex-1 xxl:pl-4">
                      <span>Vencido:</span>
                      <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.incomeBreakdown.overdue / 100)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total de Débitos</span>
                <ArrowDownRight className="h-5 w-5 text-red-600" />
              </div>
              <p className="text-3xl font-bold text-red-600">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.totalExpenses / 100)}
              </p>
              {summary.expensesBreakdown && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col xxl:flex-row xxl:divide-x xxl:divide-gray-300 dark:xxl:divide-gray-600 gap-2 xxl:gap-0 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex xxl:flex-1 xxl:pr-4">
                      <span>Pago:</span>
                      <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.expensesBreakdown.paid / 100)}</span>
                    </div>
                    <div className="flex xxl:flex-1 xxl:px-4">
                      <span>Pendente:</span>
                      <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.expensesBreakdown.pending / 100)}</span>
                    </div>
                    <div className="flex xxl:flex-1 xxl:pl-4">
                      <span>Vencido:</span>
                      <span className="font-medium ml-1">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.expensesBreakdown.overdue / 100)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Banner de categorização em lote */}
      {!transactionsLoading && uncategorizedTransactions.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <span className="font-semibold">{uncategorizedTransactions.length}</span> transação{uncategorizedTransactions.length > 1 ? "ões" : ""} sem categoria
            </p>
          </div>
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40 flex-shrink-0"
              onClick={handleOpenBulkCategory}
            >
              <Tags className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Categorizar todas</span>
              <span className="sm:hidden">Categorizar</span>
            </Button>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="income">Créditos</TabsTrigger>
          <TabsTrigger value="expense">Débitos</TabsTrigger>
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
              {/* Grupos de cartão de crédito */}
              {cardGroups.map((group) => (
                <Card key={`card-group-${group.cardName}`} className="overflow-hidden border-l-4" style={{ borderLeftColor: group.cardColor }}>
                  <CardContent className="p-0">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleCardExpand(group.cardName)}
                    >
                      <div className="flex items-center gap-3">
                        {expandedCards.has(group.cardName) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="p-2 rounded-full" style={{ backgroundColor: group.cardColor + '20' }}>
                          <CreditCard className="h-5 w-5" style={{ color: group.cardColor }} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm">{group.cardName}</h3>
                          <p className="text-xs text-muted-foreground">
                            {group.transactions.length} transaç{group.transactions.length === 1 ? 'ão' : 'ões'}
                            {group.transactions[0]?.dueDate && (
                              <> · <span className="font-medium">Vence: {format(new Date(group.transactions[0].dueDate), "dd/MM/yyyy", { locale: ptBR })}</span></>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const pendingCount = group.transactions.filter((t: any) => t.status === "PENDING" || t.status === "OVERDUE").length;
                          const allPaid = pendingCount === 0;
                          return (
                            <>
                              {allPaid ? (
                                <Badge variant="default" className="text-xs">Pago</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">{pendingCount} pendente{pendingCount > 1 ? 's' : ''}</Badge>
                              )}
                            </>
                          );
                        })()}
                        <div className="flex flex-col items-end">
                          <p className="text-base font-bold text-red-600">
                            -{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((group.invoiceTotal != null ? group.invoiceTotal : group.total) / 100)}
                          </p>
                          {group.invoiceTotal != null && Math.abs(group.invoiceTotal - group.total) >= 10 && (
                            <p className="text-xs text-muted-foreground">
                              ({new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(group.total / 100)} calculado)
                            </p>
                          )}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hidden md:flex text-muted-foreground hover:text-foreground"
                            title="Anexos da fatura"
                            onClick={(e) => {
                              e.stopPropagation();
                              const matchedCard = creditCards?.find((c: any) => c.name === group.cardName);
                              if (matchedCard) {
                                setInvoiceAttachSheet({ open: true, cardId: Number(matchedCard.id), cardName: group.cardName, month: filterMonth, year: filterYear, invoiceId: null });
                              }
                            }}
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                          </Button>
                        {canWrite && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="ml-2 text-xs h-7 hidden md:flex"
                            disabled={!group.transactions.some((t: any) => t.status === "PENDING" || t.status === "OVERDUE")}
                            onClick={(e) => { e.stopPropagation(); openPayInvoiceSheet(group); }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Pagar Fatura
                          </Button>
                        )}
                      </div>
                    </div>
                    {expandedCards.has(group.cardName) && (
                      <div className="border-t divide-y">
                        {/* Mobile: botões de ação */}
                        <div className="md:hidden p-3 bg-muted/30 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              const matchedCard = creditCards?.find((c: any) => c.name === group.cardName);
                              if (matchedCard) {
                                setInvoiceAttachSheet({ open: true, cardId: Number(matchedCard.id), cardName: group.cardName, month: filterMonth, year: filterYear, invoiceId: null });
                              }
                            }}
                          >
                            <Paperclip className="h-3.5 w-3.5 mr-1" />
                            Anexos
                          </Button>
                          {canWrite && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs"
                              disabled={!group.transactions.some((t: any) => t.status === "PENDING" || t.status === "OVERDUE")}
                              onClick={(e) => { e.stopPropagation(); openPayInvoiceSheet(group); }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              {group.transactions.some((t: any) => t.status === "PENDING" || t.status === "OVERDUE")
                                ? `Pagar Fatura (${group.transactions.filter((t: any) => t.status === "PENDING" || t.status === "OVERDUE").length} pendentes)`
                                : "Fatura Paga"}
                            </Button>
                          )}
                        </div>
                        {group.transactions.map((transaction: any) => (
                          <div key={transaction.id} className="p-3 pl-12 hover:bg-muted/30 transition-colors">
                            {/* Desktop */}
                            <div className="hidden md:flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-medium text-sm">{transaction.description}</h4>
                                    {transaction.attachmentCount > 0 && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                                    {getCategoryHierarchyBadge(transaction)}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {transaction.purchaseDate
                                      ? <><span className="font-medium">Compra:</span> {format(new Date(transaction.purchaseDate), "dd/MM/yyyy", { locale: ptBR })}</>
                                      : <><span className="font-medium">Vence:</span> {format(new Date(transaction.dueDate), "dd/MM/yyyy", { locale: ptBR })}</>}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {getStatusBadge(transaction.status)}
                                <p className="text-sm font-semibold text-red-600 min-w-[100px] text-right">
                                  -{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(transaction.amount / 100)}
                                </p>
                                {canWrite && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleEdit(transaction); }}>
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDelete(transaction.id); }}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            {/* Mobile */}
                            <div className="md:hidden space-y-1">
                              <div className="flex items-center justify-between">
                                <h4 className="font-medium text-sm truncate flex-1">{transaction.description}</h4>
                                <p className="text-sm font-semibold text-red-600">
                                  -{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(transaction.amount / 100)}
                                </p>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {getCategoryHierarchyBadge(transaction)}
                                  {getStatusBadge(transaction.status)}
                                </div>
                                <div className="flex items-center gap-1">
                                  <p className="text-xs text-muted-foreground">
                                    {transaction.purchaseDate
                                      ? <><span className="font-medium">Compra:</span> {format(new Date(transaction.purchaseDate), "dd/MM/yyyy", { locale: ptBR })}</>
                                      : <><span className="font-medium">Vence:</span> {format(new Date(transaction.dueDate), "dd/MM/yyyy", { locale: ptBR })}</>}
                                  </p>
                                  {canWrite && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleEdit(transaction); }}>
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDelete(transaction.id); }}>
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {/* Transações normais (sem cartão de crédito) */}
              {nonCardTransactions.map((transaction) => (
                <Card key={transaction.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    {/* Desktop Layout */}
                    <div className="hidden md:flex items-center justify-between">
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
                            {/* Edição inline da descrição - clique para editar */}
                            {editingDescriptionId === transaction.id && canWrite ? (
                              <input
                                ref={inlineInputRef}
                                type="text"
                                value={editingDescriptionValue}
                                onChange={(e) => setEditingDescriptionValue(e.target.value)}
                                onBlur={() => handleSaveInlineDescription(transaction.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); handleSaveInlineDescription(transaction.id); }
                                  if (e.key === 'Escape') { setEditingDescriptionId(null); }
                                }}
                                disabled={savingDescriptionId === transaction.id}
                                className="font-semibold text-sm bg-transparent border-b-2 border-primary outline-none min-w-[120px] max-w-[300px] px-0 py-0.5"
                                autoFocus
                              />
                            ) : (
                              <h3
                                className={`font-semibold ${canWrite ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                                title={canWrite ? 'Clique para editar o nome' : undefined}
                                onClick={() => {
                                  if (!canWrite) return;
                                  setEditingDescriptionId(transaction.id);
                                  setEditingDescriptionValue(transaction.description);
                                  setTimeout(() => inlineInputRef.current?.focus(), 50);
                                }}
                              >{transaction.description}</h3>
                            )}
                            {transaction.attachmentCount > 0 && (
                              <Paperclip className="h-4 w-4 text-muted-foreground" />
                            )}
                            {getCategoryHierarchyBadge(transaction)}
                            {getCreditCardBadge(transaction)}
                            {!transaction.categoryId && canWrite && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 transition-colors">
                                    <Tag className="h-3 w-3" />
                                    Sem categoria
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-1" align="start">
                                  <p className="text-xs text-muted-foreground px-2 py-1.5 font-medium">Selecionar categoria</p>
                                  <QuickCategoryList
                                    categories={categories || []}
                                    filterType={transaction.type}
                                    onSelect={(catId) => handleSaveQuickCategory(transaction, catId)}
                                  />
                                </PopoverContent>
                              </Popover>
                            )}
                            {(transaction as any).importOrigin === "OFX" && (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                                OFX
                              </span>
                            )}
                            {(transaction as any).bankAccountName && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <Landmark className="h-3 w-3" />
                                {(transaction as any).bankInstitution || (transaction as any).bankAccountName}
                              </span>
                            )}
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
                            {transaction.type === "INCOME" ? "+" : "-"}{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(transaction.amount / 100)}
                          </p>
                        </div>
                        {canWrite && (
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(transaction)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        )}
                        {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(transaction.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        )}
                      </div>
                    </div>

                    {/* Mobile Layout */}
                    <div className="md:hidden space-y-3">
                      {/* Row 1: Icon + Title + Edit Icon */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`p-2 rounded-full flex-shrink-0 ${transaction.type === "INCOME" ? "bg-green-100" : "bg-red-100"}`}>
                            {transaction.type === "INCOME" ? (
                              <ArrowUpRight className="h-4 w-4 text-green-600" />
                            ) : (
                              <ArrowDownRight className="h-4 w-4 text-red-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {/* Edição inline mobile */}
                              {editingDescriptionId === transaction.id && canWrite ? (
                                <input
                                  type="text"
                                  value={editingDescriptionValue}
                                  onChange={(e) => setEditingDescriptionValue(e.target.value)}
                                  onBlur={() => handleSaveInlineDescription(transaction.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); handleSaveInlineDescription(transaction.id); }
                                    if (e.key === 'Escape') { setEditingDescriptionId(null); }
                                  }}
                                  disabled={savingDescriptionId === transaction.id}
                                  className="font-semibold text-base bg-transparent border-b-2 border-primary outline-none min-w-[100px] w-full px-0 py-0.5"
                                  autoFocus
                                />
                              ) : (
                                <h3
                                  className={`font-semibold text-base ${canWrite ? 'cursor-pointer active:text-primary' : ''}`}
                                  onClick={() => {
                                    if (!canWrite) return;
                                    setEditingDescriptionId(transaction.id);
                                    setEditingDescriptionValue(transaction.description);
                                  }}
                                >{transaction.description}</h3>
                              )}
                              {transaction.attachmentCount > 0 && (
                                <Paperclip className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </div>
                        {canWrite && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => handleEdit(transaction)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        )}
                      </div>

                      {/* Row 2: Category Badge + OFX Badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {getCategoryHierarchyBadge(transaction)}
                        {getCreditCardBadge(transaction)}
                        {!transaction.categoryId && canWrite && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 active:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 transition-colors">
                                <Tag className="h-3 w-3" />
                                Sem categoria
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-1" align="start" side="top">
                              <p className="text-xs text-muted-foreground px-2 py-1.5 font-medium">Selecionar categoria</p>
                              <QuickCategoryList
                                categories={categories || []}
                                filterType={transaction.type}
                                onSelect={(catId) => handleSaveQuickCategory(transaction, catId)}
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                        {(transaction as any).importOrigin === "OFX" && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                            OFX
                          </span>
                        )}
                        {(transaction as any).bankAccountName && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Landmark className="h-3 w-3" />
                            {(transaction as any).bankInstitution || (transaction as any).bankAccountName}
                          </span>
                        )}
                      </div>

                      {/* Row 3: Dates */}
                      <p className="text-xs text-muted-foreground">
                        Vencimento: {format(new Date(transaction.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                        {transaction.paymentDate && ` • Pago em: ${format(new Date(transaction.paymentDate), "dd/MM/yyyy", { locale: ptBR })}`}
                      </p>

                      {/* Row 4: Status + Amount + Delete */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(transaction.status)}
                        </div>
                        <p className={`text-base font-bold ${transaction.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>
                          {transaction.type === "INCOME" ? "+" : "-"}{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(transaction.amount / 100)}
                        </p>
                        {canDelete && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => handleDelete(transaction.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        )}
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

      {/* Drawer de Categorização Rápida Inline - removido, substituído por Popover inline nos cards */}

      {/* Drawer de Categorização em Lote */}
      <Sheet open={isBulkCategoryOpen} onOpenChange={(open) => { if (!open) { setIsBulkCategoryOpen(false); setBulkCategoryAssignments({}); } }}>
        <SheetContent side="right" className="w-full sm:w-[520px] flex flex-col p-0">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-lg font-bold">
                <Tags className="h-5 w-5 text-amber-600" />
                Categorizar em Lote
              </SheetTitle>
              <Button variant="ghost" size="icon" onClick={() => { setIsBulkCategoryOpen(false); setBulkCategoryAssignments({}); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {uncategorizedTransactions.length} transação{uncategorizedTransactions.length > 1 ? "ões" : ""} sem categoria. Atribua categorias e clique em Salvar.
            </p>
          </div>
          {/* Lista de transações */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {uncategorizedTransactions.map((tx) => (
              <div key={tx.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`p-1.5 rounded-full flex-shrink-0 ${tx.type === 'INCOME' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {tx.type === 'INCOME'
                      ? <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />
                      : <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.amount / 100)}
                      {' • '}{format(new Date(tx.dueDate), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <div className="w-full sm:w-52 flex-shrink-0">
                  <CategorySelect
                    categories={categories || []}
                    value={bulkCategoryAssignments[tx.id] || ""}
                    onValueChange={(v) => setBulkCategoryAssignments(prev => ({ ...prev, [tx.id]: v }))}
                    filterType={tx.type}
                    placeholder="Selecionar categoria..."
                    triggerClassName="h-9 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
          {/* Footer fixo */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t dark:border-gray-700 px-6 py-4 space-y-2">
            <Button
              onClick={handleSaveBulkCategory}
              disabled={bulkCategorySaving || Object.values(bulkCategoryAssignments).every(v => v === '')}
              className="bg-blue-600 hover:bg-blue-700 w-full"
            >
              {bulkCategorySaving ? "Salvando..." : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Salvar {Object.values(bulkCategoryAssignments).filter(v => v !== '').length > 0
                    ? `(${Object.values(bulkCategoryAssignments).filter(v => v !== '').length} selecionadas)`
                    : 'Categorias'
                  }
                </>
              )}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => { setIsBulkCategoryOpen(false); setBulkCategoryAssignments({}); }}>
              Cancelar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {isRecurringTransaction && (
            <div className="space-y-3 py-4">
              <p className="text-sm font-medium">Esta é uma transação recorrente. Como deseja proceder?</p>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteMode"
                    value="single"
                    checked={deleteMode === 'single'}
                    onChange={() => setDeleteMode('single')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Excluir apenas esta transação</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteMode"
                    value="all"
                    checked={deleteMode === 'all'}
                    onChange={() => setDeleteMode('all')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Excluir todas as transações desta recorrência</span>
                </label>
              </div>
            </div>
          )}
          
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
          <div className="flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            {previewAttachment?.mimeType === 'application/pdf' ? (
              <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <div className="w-24 h-24 bg-red-100 rounded-lg flex items-center justify-center">
                  <svg className="w-12 h-12 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M10.92,12.31C10.68,11.54 10.15,9.08 11.55,9.04C12.95,9 12.03,12.16 12.03,12.16C12.42,13.65 14.05,14.72 14.05,14.72C14.55,14.57 17.4,14.24 17,15.72C16.57,17.2 13.5,15.81 13.5,15.81C11.55,15.95 10.09,16.47 10.09,16.47C8.96,18.58 7.64,19.5 7.1,18.61C6.43,17.5 9.23,16.07 9.23,16.07C10.68,13.72 10.9,12.35 10.92,12.31Z" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{previewAttachment.filename}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Tamanho: {(previewAttachment.fileSize / 1024).toFixed(1)} KB</p>
                <button
                  onClick={() => window.open(
                    previewAttachment.id && previewAttachment.id < 1_000_000_000_000
                      ? `/api/attachments/${previewAttachment.id}/preview`
                      : previewAttachment.blobUrl,
                    'PDFViewer', 'width=900,height=700,scrollbars=yes,resizable=yes'
                  )}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Abrir PDF em nova janela
                </button>
              </div>
            ) : previewAttachment?.mimeType?.startsWith('image/') ? (
              <img
                src={
                  previewAttachment.id && previewAttachment.id < 1_000_000_000_000
                    ? `/api/attachments/${previewAttachment.id}/preview`
                    : previewAttachment.blobUrl
                }
                alt={previewAttachment.filename}
                className="max-w-full max-h-[600px] object-contain"
              />
            ) : (
              <p className="text-gray-500 dark:text-gray-400">Preview não disponível para este tipo de arquivo</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewAttachment(null)}>
              Fechar
            </Button>
            <Button onClick={() => {
              if (!previewAttachment) return;
              if (previewAttachment.id && previewAttachment.id < 1_000_000_000_000) {
                window.open(`/api/attachments/${previewAttachment.id}/download`, '_blank');
              } else {
                window.open(previewAttachment.blobUrl, '_blank');
              }
            }}>
              Baixar
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
  creditCards,
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
  creditCards: any[];
  selectedEntityId: number | null;
  setSelectedEntityId: (id: number) => void;
  attachments: any[];
  setAttachments: (attachments: any[]) => void;
  isEdit?: boolean;
  editingTransaction?: any;
  utils: any;
  setPreviewAttachment: (attachment: any) => void;
}) {
  const incomeCategories = categories.filter((c) => c.type === "INCOME" && (c as any).isActive !== false);
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE" && (c as any).isActive !== false);
  const relevantCategories = formData.type === "INCOME" ? incomeCategories : expenseCategories;
  // Hierarquia: categorias pai (sem parentId) e subcategorias
  const parentCategories = relevantCategories.filter((c) => !(c as any).parentId);
  const getSubcategories = (parentId: number) => relevantCategories.filter((c) => (c as any).parentId === parentId);
  // Categoria pai selecionada (para mostrar subcategorias)
  const selectedCategory = relevantCategories.find((c) => c.id.toString() === formData.categoryId);
  const selectedParentId = selectedCategory ? ((selectedCategory as any).parentId || selectedCategory.id) : null;
  const selectedParentCategory = selectedParentId ? relevantCategories.find((c) => c.id === selectedParentId) : null;

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
            <SelectItem value="INCOME">Crédito</SelectItem>
            <SelectItem value="EXPENSE">Débito</SelectItem>
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
          <CurrencyInput id="amount" value={formData.amount} onChange={(value) => setFormData({ ...formData, amount: value })} placeholder="0,00" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dueDate">Data de Vencimento</Label>
          <DatePicker id="dueDate" value={formData.dueDate} onChange={(v) => setFormData({ ...formData, dueDate: v })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="paymentDate">Data de Pagamento</Label>
          <DatePicker id="paymentDate" value={formData.paymentDate} onChange={(v) => setFormData({ ...formData, paymentDate: v })} />
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
        <CategorySelect
          categories={relevantCategories}
          value={formData.categoryId || ""}
          onValueChange={(v) => setFormData({ ...formData, categoryId: v })}
          placeholder="Selecione uma categoria"
        />
      </div>

      {/* Helper: calcula data de vencimento com base no cartão e data da compra */}
      {/* (definido inline para ter acesso a creditCards e formData) */}

      {/* Cartão de Crédito (apenas para débitos) */}
      {formData.type === "EXPENSE" && creditCards.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label>Lançar no Cartão de Crédito</Label>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, creditCardId: formData.creditCardId ? "" : creditCards[0].id.toString(), bankAccountId: "", installments: "1", purchaseDate: "" })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                formData.creditCardId ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                formData.creditCardId ? "translate-x-4" : "translate-x-1"
              }`} />
            </button>
          </div>

          {formData.creditCardId ? (
            <div className="space-y-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              {/* Seletor do cartão */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cartão</Label>
                <Select value={formData.creditCardId} onValueChange={(v) => {
                  const card = creditCards.find((c) => c.id.toString() === v);
                  let newDueDate = formData.dueDate;
                  if (card) {
                    const purchaseDateStr = formData.purchaseDate || format(new Date(), "yyyy-MM-dd");
                    const purchase = new Date(purchaseDateStr + "T12:00:00");
                    const closingDay = card.closingDay || 1;
                    const dueDay = card.dueDay || 10;
                    // REGRA CORRETA de fatura:
                    // O vencimento é sempre no mês seguinte ao da compra.
                    // Ex: fechamento=2, vencimento=9, compra=09/05 → vence 09/06 (não 09/07)
                    // Ex: fechamento=2, vencimento=9, compra=01/05 → vence 09/06
                    // Ex: fechamento=2, vencimento=9, compra=03/06 → vence 09/07
                    let dueMonth = purchase.getMonth() + 1;
                    let dueYear = purchase.getFullYear();
                    if (dueMonth > 11) { dueMonth = dueMonth - 12; dueYear += 1; }
                    const dueDate = new Date(dueYear, dueMonth, dueDay);
                    newDueDate = format(dueDate, "yyyy-MM-dd");
                  }
                  setFormData({ ...formData, creditCardId: v, bankAccountId: "", dueDate: newDueDate });
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cartão" />
                  </SelectTrigger>
                  <SelectContent>
                    {creditCards.map((card) => (
                      <SelectItem key={card.id} value={card.id.toString()}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: card.color || "#7C3AED" }} />
                          {card.name} {card.lastFourDigits && `•••• ${card.lastFourDigits}`}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Data da Compra e Parcelas lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data da Compra</Label>
                  <DatePicker
                    value={formData.purchaseDate}
                    onChange={(newPurchaseDate) => {
                      const card = creditCards?.find((c) => c.id.toString() === formData.creditCardId);
                      let newDueDate = formData.dueDate;
                      if (card && newPurchaseDate) {
                        const purchase = new Date(newPurchaseDate + "T12:00:00");
                        const closingDay = card.closingDay || 1;
                        const dueDay = card.dueDay || 10;
                        // REGRA CORRETA de fatura:
                        // O vencimento é sempre no mês seguinte ao da compra.
                        // Ex: fechamento=2, vencimento=9, compra=09/05 → vence 09/06 (não 09/07)
                        let dueMonth = purchase.getMonth() + 1;
                        let dueYear = purchase.getFullYear();
                        if (dueMonth > 11) { dueMonth = dueMonth - 12; dueYear += 1; }
                        const dueDate = new Date(dueYear, dueMonth, dueDay);
                        newDueDate = format(dueDate, "yyyy-MM-dd");
                      }
                      setFormData({ ...formData, purchaseDate: newPurchaseDate, dueDate: newDueDate });
                    }}
                    placeholder="dd/mm/aaaa"
                  />
                  <p className="text-xs text-muted-foreground">Quando a compra foi feita</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Parcelas</Label>
                  <Select value={formData.installments} onValueChange={(v) => setFormData({ ...formData, installments: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 48 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={n.toString()}>
                          {n === 1 ? "À vista" : `${n}x`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {parseInt(formData.installments) > 1 && (
                    <p className="text-xs text-muted-foreground">
                      {parseInt(formData.installments)}x de R$ {(parseCurrency(formData.amount) / parseInt(formData.installments)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              </div>

              {/* Info sobre a Data de Vencimento */}
              <div className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300">
                <span>ℹ️</span>
                <span>
                  A <strong>Data de Vencimento</strong> acima é quando a fatura vence (impacto no caixa).
                  {parseInt(formData.installments) > 1 && ` As ${formData.installments} parcelas terão vencimentos mensais a partir dessa data.`}
                </span>
              </div>
            </div>
          ) : (
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
          )}
        </div>
      )}
      {/* Conta Corrente (quando não há cartões ou é receita) */}
      {(formData.type === "INCOME" || creditCards.length === 0) && (
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
      )}

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

      <div className="flex items-center space-x-2">
        <Checkbox id="recurring" checked={formData.isRecurring} onCheckedChange={(checked) => setFormData({ ...formData, isRecurring: checked as boolean })} />
        <Label htmlFor="recurring" className="cursor-pointer">
          Transação recorrente
        </Label>
      </div>
      
      <div className="flex items-center space-x-2">
        <Checkbox id="addToAgenda" checked={formData.addToAgenda} onCheckedChange={(checked) => setFormData({ ...formData, addToAgenda: checked as boolean })} />
        <Label htmlFor="addToAgenda" className="cursor-pointer">
          Adicionar na agenda
        </Label>
      </div>

      {formData.isRecurring && (
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
