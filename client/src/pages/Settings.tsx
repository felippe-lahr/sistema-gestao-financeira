import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, CreditCard, Building2, Tag } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("accounts");

  const { data: entities, isLoading: entitiesLoading } = trpc.entities.list.useQuery();

  // Set first entity as default
  if (!selectedEntityId && entities && entities.length > 0) {
    setSelectedEntityId(entities[0].id);
  }

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
              Você precisa criar uma entidade antes de configurar contas e meios de pagamento.
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
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground">Gerencie contas, meios de pagamento e categorias</p>
        </div>
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
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="accounts">
            <Building2 className="mr-2 h-4 w-4" />
            Contas Correntes
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="mr-2 h-4 w-4" />
            Meios de Pagamento
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Tag className="mr-2 h-4 w-4" />
            Categorias
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-6">
          {selectedEntityId && <BankAccountsTab entityId={selectedEntityId} />}
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          {selectedEntityId && <PaymentMethodsTab entityId={selectedEntityId} />}
        </TabsContent>

        <TabsContent value="categories" className="mt-6">
          {selectedEntityId && <CategoriesTab entityId={selectedEntityId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ========== BANK ACCOUNTS TAB ==========
function BankAccountsTab({ entityId }: { entityId: number }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    bank: "",
    accountNumber: "",
    balance: "",
    color: "#2563EB",
  });

  const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.bankAccounts.listByEntity.useQuery({ entityId });

  const createMutation = trpc.bankAccounts.create.useMutation({
    onSuccess: () => {
      utils.bankAccounts.listByEntity.invalidate();
      setIsCreateOpen(false);
      resetForm();
      toast.success("Conta criada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar conta: " + error.message);
    },
  });

  const deleteMutation = trpc.bankAccounts.delete.useMutation({
    onSuccess: () => {
      utils.bankAccounts.listByEntity.invalidate();
      toast.success("Conta excluída com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir conta: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      bank: "",
      accountNumber: "",
      balance: "",
      color: "#2563EB",
    });
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast.error("O nome da conta é obrigatório");
      return;
    }

    createMutation.mutate({
      entityId,
      name: formData.name,
      bank: formData.bank || undefined,
      accountNumber: formData.accountNumber || undefined,
      balance: formData.balance ? parseFloat(formData.balance) : undefined,
      color: formData.color,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {accounts?.length || 0} conta(s) cadastrada(s)
        </p>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Conta Corrente</DialogTitle>
              <DialogDescription>Adicione uma nova conta bancária</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Conta *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Conta Corrente Principal"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bank">Banco</Label>
                  <Input
                    id="bank"
                    placeholder="Ex: Banco do Brasil"
                    value={formData.bank}
                    onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Número da Conta</Label>
                  <Input
                    id="accountNumber"
                    placeholder="Ex: 12345-6"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="balance">Saldo Inicial</Label>
                  <Input
                    id="balance"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={formData.balance}
                    onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Cor</Label>
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar Conta"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!accounts || accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma conta cadastrada
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: account.color || "#2563EB" }}
                    >
                      <Building2 className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{account.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {account.bank && `${account.bank} • `}
                        {account.accountNumber || "Sem número"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Saldo</p>
                      <p className="text-lg font-bold">{formatCurrency(account.balance)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate({ id: account.id })}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== PAYMENT METHODS TAB ==========
function PaymentMethodsTab({ entityId }: { entityId: number }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "PIX" as "CREDIT_CARD" | "DEBIT_CARD" | "PIX" | "CASH" | "BANK_TRANSFER" | "OTHER",
    color: "#10B981",
  });

  const utils = trpc.useUtils();
  const { data: methods, isLoading } = trpc.paymentMethods.listByEntity.useQuery({ entityId });

  const createMutation = trpc.paymentMethods.create.useMutation({
    onSuccess: () => {
      utils.paymentMethods.listByEntity.invalidate();
      setIsCreateOpen(false);
      resetForm();
      toast.success("Meio de pagamento criado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar meio de pagamento: " + error.message);
    },
  });

  const deleteMutation = trpc.paymentMethods.delete.useMutation({
    onSuccess: () => {
      utils.paymentMethods.listByEntity.invalidate();
      toast.success("Meio de pagamento excluído com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir meio de pagamento: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      type: "PIX",
      color: "#10B981",
    });
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast.error("O nome do meio de pagamento é obrigatório");
      return;
    }

    createMutation.mutate({
      entityId,
      name: formData.name,
      type: formData.type,
      color: formData.color,
    });
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      CREDIT_CARD: "Cartão de Crédito",
      DEBIT_CARD: "Cartão de Débito",
      PIX: "PIX",
      CASH: "Dinheiro",
      BANK_TRANSFER: "Transferência Bancária",
      OTHER: "Outro",
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {methods?.length || 0} meio(s) de pagamento cadastrado(s)
        </p>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Meio de Pagamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Meio de Pagamento</DialogTitle>
              <DialogDescription>Adicione um novo meio de pagamento</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Cartão Itaú, Pix Bradesco"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Tipo *</Label>
                  <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                      <SelectItem value="DEBIT_CARD">Cartão de Débito</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="CASH">Dinheiro</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Transferência Bancária</SelectItem>
                      <SelectItem value="OTHER">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Cor</Label>
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!methods || methods.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum meio de pagamento cadastrado
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {methods.map((method) => (
            <Card key={method.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: method.color || "#10B981" }}
                    >
                      <CreditCard className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{method.name}</h3>
                      <p className="text-sm text-muted-foreground">{getTypeLabel(method.type)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate({ id: method.id })}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== CATEGORIES TAB ==========
function CategoriesTab({ entityId }: { entityId: number }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    color: "#EF4444",
  });

  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.categories.listByEntity.useQuery({ entityId });

  const createMutation = trpc.categories.create.useMutation({
    onSuccess: () => {
      utils.categories.listByEntity.invalidate();
      setIsCreateOpen(false);
      resetForm();
      toast.success("Categoria criada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar categoria: " + error.message);
    },
  });

  const deleteMutation = trpc.categories.delete.useMutation({
    onSuccess: () => {
      utils.categories.listByEntity.invalidate();
      toast.success("Categoria excluída com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir categoria: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      type: "EXPENSE",
      color: "#EF4444",
    });
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast.error("O nome da categoria é obrigatório");
      return;
    }

    createMutation.mutate({
      entityId,
      name: formData.name,
      type: formData.type,
      color: formData.color,
    });
  };

  const incomeCategories = categories?.filter((c) => c.type === "INCOME") || [];
  const expenseCategories = categories?.filter((c) => c.type === "EXPENSE") || [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {categories?.length || 0} categoria(s) cadastrada(s)
        </p>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Categoria
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Categoria</DialogTitle>
              <DialogDescription>Adicione uma nova categoria de receita ou despesa</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Alimentação, Salário"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
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
                  <Label htmlFor="color">Cor</Label>
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar Categoria"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Receitas */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">Receitas</h3>
          {incomeCategories.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma categoria de receita
              </CardContent>
            </Card>
          ) : (
            incomeCategories.map((category) => (
              <Card key={category.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full"
                        style={{ backgroundColor: category.color || "#10B981" }}
                      />
                      <span className="font-medium">{category.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate({ id: category.id })}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Despesas */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">Despesas</h3>
          {expenseCategories.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma categoria de despesa
              </CardContent>
            </Card>
          ) : (
            expenseCategories.map((category) => (
              <Card key={category.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full"
                        style={{ backgroundColor: category.color || "#EF4444" }}
                      />
                      <span className="font-medium">{category.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate({ id: category.id })}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
