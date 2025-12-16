import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, TrendingUp, TrendingDown, RefreshCw, Edit, Trash2, DollarSign, Wallet, PiggyBank } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CurrencyInput, parseCurrency, formatCurrency as formatCurrencyValue } from "@/components/CurrencyInput";

const investmentTypes = [
  { value: "ACAO", label: "Ação" },
  { value: "FII", label: "Fundo Imobiliário (FII)" },
  { value: "TESOURO_DIRETO", label: "Tesouro Direto" },
  { value: "CDB", label: "CDB" },
  { value: "LCI", label: "LCI" },
  { value: "LCA", label: "LCA" },
  { value: "FUNDO", label: "Fundo de Investimento" },
  { value: "CRIPTO", label: "Criptomoeda" },
  { value: "OUTRO", label: "Outro" },
];

export default function Investments() {
  const params = useParams<{ entityId: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const entityId = params.entityId ? parseInt(params.entityId) : null;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedInvestment, setSelectedInvestment] = useState<any>(null);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    type: "ACAO" as any,
    ticker: "",
    institution: "",
    initialAmount: "",
    quantity: "",
    averagePrice: "",
    purchaseDate: "",
    maturityDate: "",
    notes: "",
  });

  // Queries
  const { data: entity } = trpc.entities.getById.useQuery(
    { id: Number(entityId) },
    { enabled: !!entityId }
  );

  const { data: investments, isLoading } = trpc.investments.listByEntity.useQuery(
    { entityId: Number(entityId) },
    { enabled: !!entityId }
  );

  const { data: summary } = trpc.investments.summary.useQuery(
    { entityId: Number(entityId) },
    { enabled: !!entityId }
  );

  // Mutations
  const createMutation = trpc.investments.create.useMutation({
    onSuccess: () => {
      utils.investments.listByEntity.invalidate();
      utils.investments.summary.invalidate();
      setIsCreateOpen(false);
      resetForm();
      toast.success("Investimento cadastrado!");
    },
    onError: (error) => {
      toast.error("Erro ao cadastrar: " + error.message);
    },
  });

  const updateMutation = trpc.investments.update.useMutation({
    onSuccess: () => {
      utils.investments.listByEntity.invalidate();
      setIsEditOpen(false);
      setSelectedInvestment(null);
      toast.success("Investimento atualizado!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });

  const deleteMutation = trpc.investments.delete.useMutation({
    onSuccess: () => {
      utils.investments.listByEntity.invalidate();
      utils.investments.summary.invalidate();
      setIsDeleteOpen(false);
      setSelectedInvestment(null);
      toast.success("Investimento excluído!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir: " + error.message);
    },
  });

  const updateAllMutation = trpc.investments.updateAll.useMutation({
    onSuccess: (data) => {
      utils.investments.listByEntity.invalidate();
      utils.investments.summary.invalidate();
      setIsUpdatingAll(false);
      toast.success(`Atualizado! ${data.success} sucesso, ${data.failed} falhas`);
    },
    onError: (error) => {
      setIsUpdatingAll(false);
      toast.error("Erro ao atualizar: " + error.message);
    },
  });

  const updatePriceMutation = trpc.investments.updatePrice.useMutation({
    onSuccess: () => {
      utils.investments.listByEntity.invalidate();
      utils.investments.summary.invalidate();
      toast.success("Preço atualizado!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });

  // Handlers
  const resetForm = () => {
    setFormData({
      name: "",
      type: "ACAO",
      ticker: "",
      institution: "",
      initialAmount: "",
      quantity: "",
      averagePrice: "",
      purchaseDate: "",
      maturityDate: "",
      notes: "",
    });
  };

  const handleCreate = () => {
    if (!formData.name || !formData.initialAmount || !formData.purchaseDate) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    createMutation.mutate({
      entityId: Number(entityId),
      name: formData.name,
      type: formData.type,
      ticker: formData.ticker || undefined,
      institution: formData.institution || undefined,
      initialAmount: Math.round(parseCurrency(formData.initialAmount) * 100), // Converter para centavos
      quantity: formData.quantity ? Math.round(parseFloat(formData.quantity) * 1000) : undefined, // Converter para milésimos
      averagePrice: formData.averagePrice ? Math.round(parseCurrency(formData.averagePrice) * 100) : undefined,
      purchaseDate: formData.purchaseDate,
      maturityDate: formData.maturityDate || undefined,
      notes: formData.notes || undefined,
    });
  };

  const handleEdit = (investment: any) => {
    setSelectedInvestment(investment);
    setFormData({
      name: investment.name,
      type: investment.type,
      ticker: investment.ticker || "",
      institution: investment.institution || "",
      initialAmount: formatCurrencyValue(investment.initialAmount / 100),
      quantity: investment.quantity ? (investment.quantity / 1000).toFixed(3) : "",
      averagePrice: investment.averagePrice ? formatCurrencyValue(investment.averagePrice / 100) : "",
      purchaseDate: format(new Date(investment.purchaseDate), "yyyy-MM-dd"),
      maturityDate: investment.maturityDate ? format(new Date(investment.maturityDate), "yyyy-MM-dd") : "",
      notes: investment.notes || "",
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedInvestment) return;

    updateMutation.mutate({
      id: selectedInvestment.id,
      name: formData.name,
      ticker: formData.ticker || undefined,
      institution: formData.institution || undefined,
      notes: formData.notes || undefined,
    });
  };

  const handleDelete = (investment: any) => {
    setSelectedInvestment(investment);
    setIsDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (!selectedInvestment) return;
    deleteMutation.mutate({ id: selectedInvestment.id });
  };

  const handleUpdateAll = () => {
    setIsUpdatingAll(true);
    updateAllMutation.mutate({ entityId: Number(entityId) });
  };

  const handleUpdatePrice = (investmentId: number) => {
    updatePriceMutation.mutate({ id: investmentId });
  };

  // Formatters
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(cents / 100);
  };

  const formatPercent = (centesimals: number) => {
    return (centesimals / 100).toFixed(2) + "%";
  };

  if (!entityId) {
    return <div>Entidade não encontrada</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Investimentos</h1>
          <p className="text-muted-foreground">
            {entity?.name || "Carregando..."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleUpdateAll}
            disabled={isUpdatingAll || !investments || investments.length === 0}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isUpdatingAll ? "animate-spin" : ""}`} />
            Atualizar Tudo
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Investimento
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Investido</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalInvested)}</div>
              <p className="text-xs text-muted-foreground">
                {summary.count} {summary.count === 1 ? "investimento" : "investimentos"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Atual</CardTitle>
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.currentValue)}</div>
              <p className="text-xs text-muted-foreground">
                Patrimônio total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rentabilidade</CardTitle>
              {summary.totalProfitLoss >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(summary.totalProfitLoss)}
              </div>
              <p className={`text-xs ${summary.totalProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                {summary.totalProfitLoss >= 0 ? "+" : ""}{formatPercent(summary.totalProfitLossPercent)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Investments List */}
      <Card>
        <CardHeader>
          <CardTitle>Meus Investimentos</CardTitle>
          <CardDescription>
            Gerencie suas aplicações financeiras
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !investments || investments.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                Nenhum investimento cadastrado
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar Primeiro Investimento
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Nome</th>
                    <th className="text-left p-2">Tipo</th>
                    <th className="text-left p-2">Ticker</th>
                    <th className="text-right p-2">Valor Investido</th>
                    <th className="text-right p-2">Valor Atual</th>
                    <th className="text-right p-2">Lucro/Prejuízo</th>
                    <th className="text-right p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {investments.map((investment) => {
                    const profitLoss = investment.profitLoss || 0;
                    const profitLossPercent = investment.profitLossPercent || 0;
                    const isPositive = profitLoss >= 0;

                    return (
                      <tr key={investment.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-medium">{investment.name}</td>
                        <td className="p-2">
                          <span className="text-xs bg-secondary px-2 py-1 rounded">
                            {investmentTypes.find((t) => t.value === investment.type)?.label}
                          </span>
                        </td>
                        <td className="p-2 text-muted-foreground">{investment.ticker || "-"}</td>
                        <td className="p-2 text-right">{formatCurrency(investment.initialAmount)}</td>
                        <td className="p-2 text-right font-medium">
                          {formatCurrency(investment.currentAmount || investment.initialAmount)}
                        </td>
                        <td className="p-2 text-right">
                          <div className={isPositive ? "text-green-600" : "text-red-600"}>
                            <div className="font-medium">
                              {isPositive ? "+" : ""}{formatCurrency(profitLoss)}
                            </div>
                            <div className="text-xs">
                              {isPositive ? "+" : ""}{formatPercent(profitLossPercent)}
                            </div>
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUpdatePrice(investment.id)}
                              disabled={updatePriceMutation.isPending}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(investment)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(investment)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Investimento</DialogTitle>
            <DialogDescription>
              Cadastre uma nova aplicação financeira
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Petrobras PN, CDB Banco Inter"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Tipo *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {investmentTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ticker">Ticker/Código</Label>
                <Input
                  id="ticker"
                  value={formData.ticker}
                  onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
                  placeholder="Ex: PETR4, BTC"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="institution">Instituição Financeira</Label>
              <Input
                id="institution"
                value={formData.institution}
                onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                placeholder="Ex: Banco Inter, XP Investimentos"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="initialAmount">Valor Investido (R$) *</Label>
                <CurrencyInput
                  id="initialAmount"
                  value={formData.initialAmount}
                  onChange={(value) => setFormData({ ...formData, initialAmount: value })}
                  placeholder="0,00"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="quantity">Quantidade</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.001"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="100"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="averagePrice">Preço Médio (R$)</Label>
                <CurrencyInput
                  id="averagePrice"
                  value={formData.averagePrice}
                  onChange={(value) => setFormData({ ...formData, averagePrice: value })}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="purchaseDate">Data de Compra *</Label>
                <Input
                  id="purchaseDate"
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maturityDate">Data de Vencimento</Label>
                <Input
                  id="maturityDate"
                  type="date"
                  value={formData.maturityDate}
                  onChange={(e) => setFormData({ ...formData, maturityDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Anotações sobre o investimento"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Investimento</DialogTitle>
            <DialogDescription>
              Atualize as informações do investimento
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-ticker">Ticker/Código</Label>
              <Input
                id="edit-ticker"
                value={formData.ticker}
                onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-institution">Instituição</Label>
              <Input
                id="edit-institution"
                value={formData.institution}
                onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Observações</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o investimento "{selectedInvestment?.name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
