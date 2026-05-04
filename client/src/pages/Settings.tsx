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
import { Plus, Pencil, Trash2, CreditCard, Tag, X, Landmark, ArrowRight, ChevronRight, RotateCcw, EyeOff } from "lucide-react";
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
                      <SelectItem value="EXPENSE">Débitos (meios que você paga)</SelectItem>
                      <SelectItem value="INCOME">Créditos (meios que recebe)</SelectItem>
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
                    <SelectItem value="EXPENSE">Débitos (meios que você paga)</SelectItem>
                    <SelectItem value="INCOME">Créditos (meios que recebe)</SelectItem>
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
// ===== PALETA DE CORES (30 cores profissionais) =====
const COLOR_PALETTE = [
  // Vermelhos pastéis
  "#FECACA", "#FCA5A5", "#F87171",
  // Laranjas pastéis
  "#FED7AA", "#FDBA74", "#FB923C",
  // Âmbares / Amarelos pastéis
  "#FEF08A", "#FDE047", "#FACC15",
  // Verdes pastéis
  "#BBF7D0", "#86EFAC", "#4ADE80",
  // Esmeraldas / Teal pastéis
  "#A7F3D0", "#6EE7B7", "#99F6E4",
  // Cianos / Azuis claros pastéis
  "#A5F3FC", "#67E8F9", "#BAE6FD",
  // Azuis pastéis
  "#BFDBFE", "#93C5FD", "#60A5FA",
  // Índigos / Violetas pastéis
  "#C7D2FE", "#A5B4FC", "#DDD6FE",
  // Roxos / Rosas pastéis
  "#E9D5FF", "#D8B4FE", "#FBCFE8",
  // Neutros pastéis
  "#E2E8F0", "#CBD5E1", "#F1F5F9",
];

// Gera tonalidade mais clara de uma cor hex para subcategorias
function lightenColor(hex: string, amount = 0.35): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

// Gera cor de texto (branco ou preto) com base no fundo
function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.40 ? "#1e293b" : "#ffffff";
}

function CategoriesTab({ entityId, canWrite = true, canDelete = true }: { entityId: number; canWrite?: boolean; canDelete?: boolean }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [showInactive, setShowInactive] = useState(false);
  // creatingSubFor: quando não-null, estamos criando subcategoria para esta categoria pai
  const [creatingSubFor, setCreatingSubFor] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    color: COLOR_PALETTE[0],
    parentId: "" as string,
  });

  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.categories.listByEntity.useQuery({ entityId, includeInactive: showInactive });

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
      toast.success("Categoria desativada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao desativar categoria: " + error.message);
    },
  });

  const reactivateMutation = trpc.categories.reactivate.useMutation({
    onSuccess: () => {
      utils.categories.listByEntity.invalidate();
      toast.success("Categoria reativada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao reativar categoria: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({ name: "", type: "EXPENSE", color: COLOR_PALETTE[0], parentId: "" });
    setCreatingSubFor(null);
  };

  const handleCreate = () => {
    if (!formData.name.trim()) { toast.error("O nome da categoria é obrigatório"); return; }
    // Se for subcategoria, gera cor automaticamente como tonalidade da categoria pai
    const autoColor = creatingSubFor
      ? lightenColor(creatingSubFor.color || COLOR_PALETTE[0], 0.35)
      : formData.color;
    createMutation.mutate({
      entityId,
      name: formData.name,
      type: formData.type,
      color: autoColor,
      parentId: creatingSubFor ? creatingSubFor.id : undefined,
    });
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      type: category.type,
      color: category.color || COLOR_PALETTE[0],
      parentId: "", // Edição não permite mudar categoria pai
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!formData.name.trim()) { toast.error("O nome da categoria é obrigatório"); return; }
    updateMutation.mutate({
      id: editingCategory.id,
      name: formData.name,
      color: formData.color,
    });
  };

  // Categorias pai (sem parentId)
  const incomeParents = categories?.filter((c) => c.type === "INCOME" && !c.parentId) || [];
  const expenseParents = categories?.filter((c) => c.type === "EXPENSE" && !c.parentId) || [];
  // Helper: subcategorias de uma categoria pai
  const getSubcategories = (parentId: number) => categories?.filter((c) => c.parentId === parentId) || [];
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

  // ===== RENDER HELPER: card de categoria pai com subcategorias embutidas =====
  const renderCategoryCard = (category: any) => {
    const subs = getSubcategories(category.id);
    const isInactive = !category.isActive;
    const bgColor = category.color || COLOR_PALETTE[0];
    const textColor = getContrastColor(bgColor);
    return (
      <div key={category.id} className={`rounded-xl overflow-hidden border ${isInactive ? "opacity-40" : "shadow-sm"}`}>
        {/* Cabeçalho da categoria pai — fundo colorido */}
        <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: bgColor }}>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
              <Tag className="h-3.5 w-3.5" style={{ color: textColor }} />
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight" style={{ color: textColor }}>{category.name}</p>
              {subs.length > 0 && (
                <p className="text-xs opacity-70" style={{ color: textColor }}>{subs.length} subcategoria{subs.length > 1 ? "s" : ""}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isInactive ? (
              canDelete && (
                <button title="Reativar" onClick={() => reactivateMutation.mutate({ id: category.id })} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                  <RotateCcw className="h-3.5 w-3.5" style={{ color: textColor }} />
                </button>
              )
            ) : (
              <>
                {canWrite && (
                  <>
                    <button
                      title="Nova subcategoria"
                      onClick={() => { setCreatingSubFor(category); setFormData({ name: "", type: category.type, color: bgColor, parentId: category.id.toString() }); setIsCreateOpen(true); }}
                      className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" style={{ color: textColor }} />
                    </button>
                    <button title="Editar" onClick={() => handleEdit(category)} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                      <Pencil className="h-3.5 w-3.5" style={{ color: textColor }} />
                    </button>
                  </>
                )}
                {canDelete && (
                  <button title="Desativar" onClick={() => deleteMutation.mutate({ id: category.id })} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                    <EyeOff className="h-3.5 w-3.5" style={{ color: textColor }} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {/* Subcategorias — fundo branco/cinza */}
        {subs.length > 0 && (
          <div className="divide-y dark:divide-gray-700 bg-white dark:bg-gray-900">
            {subs.map((sub) => {
              const subColor = sub.color || lightenColor(bgColor, 0.35);
              return (
                <div key={sub.id} className={`flex items-center justify-between px-4 py-2.5 ${!sub.isActive ? "opacity-40" : ""}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: subColor }} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{sub.name}</span>
                    {!sub.isActive && <span className="text-xs text-muted-foreground">(inativa)</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {!sub.isActive ? (
                      canDelete && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Reativar" onClick={() => reactivateMutation.mutate({ id: sub.id })}>
                          <RotateCcw className="h-3 w-3 text-green-600" />
                        </Button>
                      )
                    ) : (
                      <>
                        {canWrite && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(sub)}>
                            <Pencil className="h-3 w-3 text-gray-400" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Desativar" onClick={() => deleteMutation.mutate({ id: sub.id })}>
                            <EyeOff className="h-3 w-3 text-gray-400" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {incomeCategories.length + expenseCategories.length} categoria(s)
          </span>
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors ${
              showInactive
                ? "bg-amber-50 border-amber-400 text-amber-700 dark:bg-amber-900/20 dark:border-amber-500 dark:text-amber-400"
                : "bg-white border-border text-muted-foreground hover:text-foreground hover:border-gray-400 dark:bg-gray-800"
            }`}
          >
            <EyeOff className="h-3 w-3" />
            {showInactive ? "Ocultar inativas" : "Ver inativas"}
          </button>
        </div>
        {canWrite && (
          <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            Nova Categoria
          </Button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Créditos */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Créditos</h3>
            <span className="ml-auto text-xs text-muted-foreground">{incomeParents.length}</span>
          </div>
          {incomeParents.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center">
              <Tag className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma categoria de receita</p>
              {canWrite && (
                <button onClick={() => { resetForm(); setFormData(f => ({ ...f, type: "INCOME" })); setIsCreateOpen(true); }} className="mt-2 text-xs text-blue-600 hover:underline">
                  + Criar primeira categoria
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">{incomeParents.map(renderCategoryCard)}</div>
          )}
        </div>
        {/* Débitos */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Débitos</h3>
            <span className="ml-auto text-xs text-muted-foreground">{expenseParents.length}</span>
          </div>
          {expenseParents.length === 0 ? (
            <div className="rounded-xl border border-dashed py-10 text-center">
              <Tag className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma categoria de despesa</p>
              {canWrite && (
                <button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="mt-2 text-xs text-blue-600 hover:underline">
                  + Criar primeira categoria
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">{expenseParents.map(renderCategoryCard)}</div>
          )}
        </div>
      </div>

      {/* ===== CREATE SHEET ===== */}
      <Sheet open={isCreateOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setIsCreateOpen(open); }}>
        <SheetContent side="right" className="w-full sm:w-[480px] flex flex-col">
          <div className="sticky top-0 z-10 border-b bg-background px-6 py-4 flex items-center justify-between">
            <div>
              <SheetTitle className="text-xl font-bold">
                {creatingSubFor ? "Nova Subcategoria" : "Nova Categoria"}
              </SheetTitle>
              {creatingSubFor && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Subcategoria de <span className="font-medium" style={{ color: creatingSubFor.color }}>{creatingSubFor.name}</span>
                </p>
              )}
            </div>
            <button onClick={() => { resetForm(); setIsCreateOpen(false); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="cat-name">Nome *</Label>
              <Input
                id="cat-name"
                autoFocus
                placeholder={creatingSubFor ? "Ex: Almoço, Supermercado" : "Ex: Alimentação, Salário"}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              />
            </div>
            {/* Tipo — apenas para categorias pai */}
            {!creatingSubFor && (
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["INCOME", "EXPENSE"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFormData({ ...formData, type: t })}
                      className={`py-2.5 rounded-lg border text-sm font-medium transition-all ${
                        formData.type === t
                          ? t === "INCOME"
                            ? "bg-green-50 border-green-500 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                            : "bg-red-50 border-red-500 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                          : "border-border text-muted-foreground hover:border-gray-400"
                      }`}
                    >
                      {t === "INCOME" ? "Crédito" : "Débito"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Cor — apenas para categorias pai; subcategorias herdam automaticamente */}
            {!creatingSubFor && (
              <div className="space-y-2">
                <Label>Cor da categoria</Label>
                <div className="grid grid-cols-6 gap-2">
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-full aspect-square rounded-lg transition-all ${
                        formData.color === color ? "ring-2 ring-offset-2 ring-gray-900 dark:ring-white scale-110" : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                {/* Preview */}
                <div className="mt-3 rounded-lg px-4 py-3 flex items-center gap-3" style={{ backgroundColor: formData.color }}>
                  <Tag className="h-4 w-4 flex-shrink-0" style={{ color: getContrastColor(formData.color) }} />
                  <span className="text-sm font-medium" style={{ color: getContrastColor(formData.color) }}>
                    {formData.name || "Pré-visualização"}
                  </span>
                </div>
              </div>
            )}
            {/* Preview da subcategoria */}
            {creatingSubFor && (
              <div className="rounded-xl overflow-hidden border">
                <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: creatingSubFor.color || COLOR_PALETTE[0] }}>
                  <Tag className="h-3.5 w-3.5" style={{ color: getContrastColor(creatingSubFor.color || COLOR_PALETTE[0]) }} />
                  <span className="text-sm font-semibold" style={{ color: getContrastColor(creatingSubFor.color || COLOR_PALETTE[0]) }}>{creatingSubFor.name}</span>
                </div>
                <div className="px-4 py-2.5 bg-white dark:bg-gray-900 flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lightenColor(creatingSubFor.color || COLOR_PALETTE[0], 0.35) }} />
                  <span className="text-sm text-gray-600 dark:text-gray-400">{formData.name || "Nova subcategoria"}</span>
                </div>
              </div>
            )}
          </div>
          <div className="sticky bottom-0 border-t bg-background px-6 py-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { resetForm(); setIsCreateOpen(false); }}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {createMutation.isPending ? "Criando..." : (creatingSubFor ? "Criar Subcategoria" : "Criar Categoria")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ===== EDIT SHEET ===== */}
      <Sheet open={isEditOpen} onOpenChange={(open) => { if (!open) { setEditingCategory(null); resetForm(); } setIsEditOpen(open); }}>
        <SheetContent side="right" className="w-full sm:w-[480px] flex flex-col">
          <div className="sticky top-0 z-10 border-b bg-background px-6 py-4 flex items-center justify-between">
            <div>
              <SheetTitle className="text-xl font-bold">Editar Categoria</SheetTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {editingCategory?.parentId ? "Subcategoria" : "Categoria principal"} • {formData.type === "INCOME" ? "Crédito" : "Débito"}
              </p>
            </div>
            <button onClick={() => { setEditingCategory(null); resetForm(); setIsEditOpen(false); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="edit-cat-name">Nome *</Label>
              <Input
                id="edit-cat-name"
                autoFocus
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(); }}
              />
            </div>
            {/* Cor — paleta de 30 cores */}
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="grid grid-cols-6 gap-2">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-full aspect-square rounded-lg transition-all ${
                      formData.color === color ? "ring-2 ring-offset-2 ring-gray-900 dark:ring-white scale-110" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              {/* Preview */}
              <div className="mt-3 rounded-lg px-4 py-3 flex items-center gap-3" style={{ backgroundColor: formData.color }}>
                <Tag className="h-4 w-4 flex-shrink-0" style={{ color: getContrastColor(formData.color) }} />
                <span className="text-sm font-medium" style={{ color: getContrastColor(formData.color) }}>{formData.name || "Pré-visualização"}</span>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 border-t bg-background px-6 py-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setEditingCategory(null); resetForm(); setIsEditOpen(false); }}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {updateMutation.isPending ? "Atualizando..." : "Salvar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
