import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowUpRight, ArrowDownRight, Filter, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Transactions() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "income" | "expense">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    description: "",
    amount: "",
    dueDate: format(new Date(), "yyyy-MM-dd"),
    paymentDate: "",
    status: "PENDING" as "PENDING" | "PAID" | "OVERDUE",
    categoryId: "",
    notes: "",
    isRecurring: false,
  });

  const utils = trpc.useUtils();
  const { data: entities, isLoading: entitiesLoading } = trpc.entities.list.useQuery();

  // Set first entity as default
  if (!selectedEntityId && entities && entities.length > 0) {
    setSelectedEntityId(entities[0].id);
  }

  const { data: transactions, isLoading: transactionsLoading } = trpc.transactions.listByEntity.useQuery(
    {
      entityId: selectedEntityId!,
      type: activeTab === "all" ? undefined : activeTab === "income" ? "INCOME" : "EXPENSE",
    },
    { enabled: !!selectedEntityId }
  );

  const { data: categories } = trpc.categories.listByEntity.useQuery(
    { entityId: selectedEntityId! },
    { enabled: !!selectedEntityId }
  );

  const createMutation = trpc.transactions.create.useMutation({
    onSuccess: () => {
      utils.transactions.listByEntity.invalidate();
      utils.dashboard.metrics.invalidate();
      utils.dashboard.recentTransactions.invalidate();
      setIsCreateOpen(false);
      resetForm();
      toast.success("Transação criada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar transação: " + error.message);
    },
  });

  const updateStatusMutation = trpc.transactions.update.useMutation({
    onSuccess: () => {
      utils.transactions.listByEntity.invalidate();
      utils.dashboard.metrics.invalidate();
      toast.success("Status atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar status: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      type: "EXPENSE",
      description: "",
      amount: "",
      dueDate: format(new Date(), "yyyy-MM-dd"),
      paymentDate: "",
      status: "PENDING",
      categoryId: "",
      notes: "",
      isRecurring: false,
    });
  };

  const handleCreate = () => {
    if (!formData.description.trim()) {
      toast.error("A descrição é obrigatória");
      return;
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error("O valor deve ser maior que zero");
      return;
    }
    if (!selectedEntityId) {
      toast.error("Selecione uma entidade");
      return;
    }

    createMutation.mutate({
      entityId: selectedEntityId,
      type: formData.type,
      description: formData.description,
      amount: parseFloat(formData.amount),
      dueDate: new Date(formData.dueDate),
      paymentDate: formData.paymentDate ? new Date(formData.paymentDate) : undefined,
      status: formData.status,
      categoryId: formData.categoryId ? parseInt(formData.categoryId) : undefined,
      notes: formData.notes || undefined,
      isRecurring: formData.isRecurring,
    });
  };

  const handleStatusChange = (transactionId: number, newStatus: "PENDING" | "PAID" | "OVERDUE") => {
    updateStatusMutation.mutate({
      id: transactionId,
      status: newStatus,
      paymentDate: newStatus === "PAID" ? new Date() : undefined,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "PAID":
        return "status-paid";
      case "PENDING":
        return "status-pending";
      case "OVERDUE":
        return "status-overdue";
      default:
        return "";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "PAID":
        return "Pago";
      case "PENDING":
        return "Pendente";
      case "OVERDUE":
        return "Vencido";
      default:
        return status;
    }
  };

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    if (!searchTerm) return transactions;

    return transactions.filter((t) =>
      t.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [transactions, searchTerm]);

  const stats = useMemo(() => {
    if (!transactions) return { total: 0, income: 0, expense: 0 };

    return transactions.reduce(
      (acc, t) => {
        if (t.status === "PAID") {
          if (t.type === "INCOME") {
            acc.income += t.amount;
          } else {
            acc.expense += t.amount;
          }
        }
        return acc;
      },
      { total: 0, income: 0, expense: 0 }
    );
  }, [transactions]);

  if (entitiesLoading) {
    return (
      <div className="container py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!entities || entities.length === 0) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma entidade cadastrada</CardTitle>
            <CardDescription>
              Você precisa criar uma entidade antes de gerenciar transações.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transações</h1>
          <p className="text-muted-foreground">Gerencie suas receitas e despesas</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedEntityId?.toString()} onValueChange={(value) => setSelectedEntityId(Number(value))}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Entidade" />
            </SelectTrigger>
            <SelectContent>
              {entities.map((entity) => (
                <SelectItem key={entity.id} value={entity.id.toString()}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: entity.color || "#2563EB" }}
                    />
                    {entity.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Transação
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nova Transação</DialogTitle>
                <DialogDescription>Adicione uma nova receita ou despesa</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Tipo *</Label>
                    <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                      <SelectTrigger id="type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INCOME">Receita</SelectItem>
                        <SelectItem value="EXPENSE">Despesa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Valor *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição *</Label>
                  <Input
                    id="description"
                    placeholder="Ex: Pagamento de fornecedor"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Data de Vencimento *</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentDate">Data de Pagamento</Label>
                    <Input
                      id="paymentDate"
                      type="date"
                      value={formData.paymentDate}
                      onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger id="status">
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
                    <Select value={formData.categoryId} onValueChange={(value) => setFormData({ ...formData, categoryId: value })}>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Selecione..." />
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    placeholder="Observações adicionais..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
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
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total de Receitas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold currency income">{formatCurrency(stats.income)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total de Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold currency expense">{formatCurrency(stats.expense)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Saldo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold currency ${stats.income - stats.expense >= 0 ? "income" : "expense"}`}>
              {formatCurrency(stats.income - stats.expense)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Transações</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  className="pl-8 w-[200px]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)}>
            <TabsList>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="income">Receitas</TabsTrigger>
              <TabsTrigger value="expense">Despesas</TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className="mt-6">
              {transactionsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : !filteredTransactions || filteredTransactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">Nenhuma transação encontrada</p>
              ) : (
                <div className="space-y-3">
                  {filteredTransactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div
                          className={`p-3 rounded-full ${
                            transaction.type === "INCOME"
                              ? "bg-green-100 dark:bg-green-900/20"
                              : "bg-red-100 dark:bg-red-900/20"
                          }`}
                        >
                          {transaction.type === "INCOME" ? (
                            <ArrowUpRight className="h-5 w-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <ArrowDownRight className="h-5 w-5 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{transaction.description}</p>
                          <p className="text-sm text-muted-foreground">
                            Vencimento: {format(new Date(transaction.dueDate), "dd/MM/yyyy")}
                            {transaction.paymentDate &&
                              ` • Pago em: ${format(new Date(transaction.paymentDate), "dd/MM/yyyy")}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p
                            className={`text-lg font-bold currency ${
                              transaction.type === "INCOME" ? "income" : "expense"
                            }`}
                          >
                            {transaction.type === "INCOME" ? "+" : "-"}
                            {formatCurrency(Math.abs(transaction.amount))}
                          </p>
                        </div>
                        <Select
                          value={transaction.status}
                          onValueChange={(value: any) => handleStatusChange(transaction.id, value)}
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PENDING">Pendente</SelectItem>
                            <SelectItem value="PAID">Pago</SelectItem>
                            <SelectItem value="OVERDUE">Vencido</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
