import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { Plus, Pencil, Trash2, CreditCard, Tag, X, Landmark, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("payments");
  const [, navigate] = useLocation();

  const { data: entities, isLoading: entitiesLoading } = trpc.entities.list.useQuery(undefined, { refetchInterval: 60_000 });

  // Set first entity as default
  if (!selectedEntityId && entities && entities.length > 0) {
    setSelectedEntityId(entities[0].id);
  }

  // Calcular role do usuário na entidade selecionada
  const selectedEntity = entities?.find((e) => e.id === selectedEntityId);
  const myRole = (selectedEntity as any)?.sharedRole ?? "OWNER";
  const canWrite = myRole === "OWNER" || myRole === "ADMIN" || myRole === "EDITOR";
  const canDeleteSettings = myRole === "OWNER" || myRole === "ADMIN";

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground">Gerencie meios de pagamento e categorias</p>
        </div>
        <Select value={selectedEntityId?.toString()} onValueChange={(value) => setSelectedEntityId(Number(value))}>
          <SelectTrigger className="w-full sm:w-[200px]">
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

      {/* Card de acesso rápido a Contas Bancárias */}
      <button
        onClick={() => navigate("/bank-accounts")}
        className="w-full flex items-center gap-4 p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Landmark className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-blue-900 dark:text-blue-100">Contas Bancárias</p>
          <p className="text-sm text-blue-600 dark:text-blue-400">Gerencie contas e importe extratos OFX</p>
        </div>
        <ArrowRight className="h-5 w-5 text-blue-400 flex-shrink-0" />
      </button>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="payments">
            <CreditCard className="mr-2 h-4 w-4" />
            Meios de Pagamento
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Tag className="mr-2 h-4 w-4" />
            Categorias
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-6">
          {selectedEntityId && <PaymentMethodsTab entityId={selectedEntityId} canWrite={canWrite} canDelete={canDeleteSettings} />}
        </TabsContent>
        <TabsContent value="categories" className="mt-6">
          {selectedEntityId && <CategoriesTab entityId={selectedEntityId} canWrite={canWrite} canDelete={canDeleteSettings} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ========== PAYMENT METHODS TAB ==========
function PaymentMethodsTab({ entityId, canWrite = true, canDelete = true }: { entityId: number; canWrite?: boolean; canDelete?: boolean }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "PIX" as "CREDIT_CARD" | "DEBIT_CARD" | "PIX" | "CASH" | "BANK_TRANSFER" | "OTHER",
    transactionType: "EXPENSE" as "INCOME" | "EXPENSE",
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

  const updateMutation = trpc.paymentMethods.update.useMutation({
    onSuccess: () => {
      utils.paymentMethods.listByEntity.invalidate();
      setIsEditOpen(false);
      setEditingMethod(null);
      resetForm();
      toast.success("Meio de pagamento atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar meio de pagamento: " + error.message);
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
      transactionType: "EXPENSE",
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
      transactionType: formData.transactionType,
      color: formData.color,
    });
  };

  const handleEdit = (method: any) => {
    setEditingMethod(method);
    setFormData({
      name: method.name,
      type: method.type,
      transactionType: method.transactionType || "EXPENSE",
      color: method.color || "#10B981",
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!formData.name.trim()) {
      toast.error("O nome do meio de pagamento é obrigatório");
      return;
    }

    updateMutation.mutate({
      id: editingMethod.id,
      name: formData.name,
      type: formData.type,
      transactionType: formData.transactionType,
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
        {canWrite && (
        <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Meio de Pagamento
        </Button>
        )}

        <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col">
            <div className="sticky top-0 z-10 border dark:border-gray-700-b bg-white dark:bg-gray-800 px-8 py-4 flex items-center justify-between">
              <SheetTitle className="text-2xl font-bold">Novo Meio de Pagamento</SheetTitle>
              <button onClick={() => setIsCreateOpen(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Cartão Itaú, Pix Bradesco"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transactionType">Usar para *</Label>
                  <Select value={formData.transactionType} onValueChange={(value: any) => setFormData({ ...formData, transactionType: value })}>
                    <SelectTrigger id="transactionType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EXPENSE">Despesas (meios que você paga)</SelectItem>
                      <SelectItem value="INCOME">Receitas (meios que recebe)</SelectItem>
                    </SelectContent>
                  </Select>
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
            </div>
            <div className="sticky bottom-0 z-10 border dark:border-gray-700-t bg-white dark:bg-gray-800 px-8 py-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                {createMutation.isPending ? "Criando..." : "Criar"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
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
                  <div className="flex items-center gap-2">
                    {canWrite && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(method)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    )}
                    {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate({ id: method.id })}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Sheet */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col">
          <div className="sticky top-0 z-10 border dark:border-gray-700-b bg-white dark:bg-gray-800 px-8 py-4 flex items-center justify-between">
            <SheetTitle className="text-2xl font-bold">Editar Meio de Pagamento</SheetTitle>
            <button onClick={() => setIsEditOpen(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome *</Label>
                <Input
                  id="edit-name"
                  placeholder="Ex: Cartão Itaú"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-transactionType">Usar para *</Label>
                <Select value={formData.transactionType} onValueChange={(value: any) => setFormData({ ...formData, transactionType: value })}>
                  <SelectTrigger id="edit-transactionType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXPENSE">Despesas (meios que você paga)</SelectItem>
                    <SelectItem value="INCOME">Receitas (meios que recebe)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-type">Tipo</Label>
                  <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                    <SelectTrigger id="edit-type">
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
                  <Label htmlFor="edit-color">Cor</Label>
                  <Input
                    id="edit-color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 border dark:border-gray-700-t bg-white dark:bg-gray-800 px-8 py-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {updateMutation.isPending ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ========== CATEGORIES TAB ==========
function CategoriesTab({ entityId, canWrite = true, canDelete = true }: { entityId: number; canWrite?: boolean; canDelete?: boolean }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
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

  const updateMutation = trpc.categories.update.useMutation({
    onSuccess: () => {
      utils.categories.listByEntity.invalidate();
      setIsEditOpen(false);
      setEditingCategory(null);
      resetForm();
      toast.success("Categoria atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar categoria: " + error.message);
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

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      type: category.type,
      color: category.color || "#EF4444",
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!formData.name.trim()) {
      toast.error("O nome da categoria é obrigatório");
      return;
    }

    updateMutation.mutate({
      id: editingCategory.id,
      name: formData.name,
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
        {canWrite && (
        <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Categoria
        </Button>
        )}

        <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col">
            <div className="sticky top-0 z-10 border dark:border-gray-700-b bg-white dark:bg-gray-800 px-8 py-4 flex items-center justify-between">
              <SheetTitle className="text-2xl font-bold">Nova Categoria</SheetTitle>
              <button onClick={() => setIsCreateOpen(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="space-y-4">
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
            </div>
            <div className="sticky bottom-0 z-10 border dark:border-gray-700-t bg-white dark:bg-gray-800 px-8 py-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                {createMutation.isPending ? "Criando..." : "Criar Categoria"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
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
                     <div className="flex items-center gap-2">
                      {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(category)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      )}
                      {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate({ id: category.id })}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      )}
                    </div>
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
                    <div className="flex items-center gap-2">
                      {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(category)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      )}
                      {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate({ id: category.id })}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Edit Sheet */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col">
          <div className="sticky top-0 z-10 border dark:border-gray-700-b bg-white dark:bg-gray-800 px-8 py-4 flex items-center justify-between">
            <SheetTitle className="text-2xl font-bold">Editar Categoria</SheetTitle>
            <button onClick={() => setIsEditOpen(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome *</Label>
                <Input
                  id="edit-name"
                  placeholder="Ex: Alimentação"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-color">Cor</Label>
                <Input
                  id="edit-color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo (não editável)</Label>
                <div className="p-2 bg-muted rounded text-sm">
                  {formData.type === "INCOME" ? "Receita" : "Despesa"}
                </div>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 border dark:border-gray-700-t bg-white dark:bg-gray-800 px-8 py-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {updateMutation.isPending ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
