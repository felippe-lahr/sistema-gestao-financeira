import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RefreshCw, Edit, Trash2, Plus, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { CurrencyInput, parseCurrency, formatCurrency as formatCurrencyValue } from "@/components/CurrencyInput";

export default function TreasurySelix() {
  const params = useParams<{ entityId: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const entityId = params.entityId ? parseInt(params.entityId) : null;

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [formData, setFormData] = useState({
    quantity: "",
    initialPrice: "",
    currentPrice: "",
  });

  // Queries
  const { data: entity } = trpc.entities.getById.useQuery(
    { id: Number(entityId) },
    { enabled: !!entityId }
  );

  const { data: treasurySelic, isLoading } = trpc.treasurySelic.getByEntity.useQuery(
    { entityId: Number(entityId) },
    { enabled: !!entityId }
  );

  // Mutations
  const createOrUpdateMutation = trpc.treasurySelic.createOrUpdate.useMutation({
    onSuccess: () => {
      utils.treasurySelic.getByEntity.invalidate();
      setIsEditOpen(false);
      resetForm();
      toast.success("Tesouro Selic atualizado!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });

  const deleteMutation = trpc.treasurySelic.delete.useMutation({
    onSuccess: () => {
      utils.treasurySelic.getByEntity.invalidate();
      setIsDeleteOpen(false);
      toast.success("Tesouro Selic removido!");
    },
    onError: (error) => {
      toast.error("Erro ao remover: " + error.message);
    },
  });

  const fetchPriceMutation = trpc.treasurySelic.fetchLatestPrice.useMutation({
    onSuccess: (data) => {
      utils.treasurySelic.getByEntity.invalidate();
      toast.success(`Preço atualizado: R$ ${(data.currentPrice / 100).toFixed(2)}`);
      setIsRefreshing(false);
    },
    onError: (error) => {
      toast.error("Erro ao buscar preço: " + error.message);
      setIsRefreshing(false);
    },
  });

  const resetForm = () => {
    setFormData({
      quantity: "",
      initialPrice: "",
      currentPrice: "",
    });
  };

  const handleEdit = () => {
    if (!treasurySelic) return;
    setFormData({
      quantity: treasurySelic.quantity,
      initialPrice: String(treasurySelic.initialPrice),
      currentPrice: String(treasurySelic.currentPrice),
    });
    setIsEditOpen(true);
  };

  const handleSave = async () => {
    if (!entityId) return;
    
    const initialPrice = parseCurrency(formData.initialPrice);
    const currentPrice = parseCurrency(formData.currentPrice);

    if (!formData.quantity || initialPrice <= 0 || currentPrice <= 0) {
      toast.error("Preencha todos os campos corretamente");
      return;
    }

    await createOrUpdateMutation.mutateAsync({
      entityId,
      quantity: formData.quantity,
      initialPrice,
      currentPrice,
    });
  };

  const handleRefresh = async () => {
    if (!entityId) return;
    setIsRefreshing(true);
    await fetchPriceMutation.mutateAsync({ entityId });
  };

  const handleDelete = async () => {
    if (!entityId) return;
    await deleteMutation.mutateAsync({ entityId });
  };

  if (!entityId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Entidade não encontrada</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const profitLoss = treasurySelic
    ? (treasurySelic.currentPrice - treasurySelic.initialPrice) * parseFloat(treasurySelic.quantity)
    : 0;
  const profitLossPercent = treasurySelic && treasurySelic.initialPrice > 0
    ? ((treasurySelic.currentPrice - treasurySelic.initialPrice) / treasurySelic.initialPrice) * 100
    : 0;

  const initialValue = treasurySelic
    ? treasurySelic.initialPrice * parseFloat(treasurySelic.quantity)
    : 0;
  const currentValue = treasurySelic
    ? treasurySelic.currentPrice * parseFloat(treasurySelic.quantity)
    : 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tesouro Selic</h1>
          <p className="text-muted-foreground mt-1">Gerenciar investimento em Tesouro Selic</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation(`/entities/${entityId}`)}
          className="w-full sm:w-auto"
        >
          ← Voltar
        </Button>
      </div>

      {treasurySelic ? (
        <>
          {/* Main Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tesouro Selic - Seu Investimento</CardTitle>
                  <CardDescription>
                    Quantidade: {treasurySelic.quantity} títulos
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    {isRefreshing ? "Atualizando..." : "Atualizar Preço"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEdit}
                  >
                    <Edit className="w-4 h-4" />
                    Editar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsDeleteOpen(true)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Remover
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Prices */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Preço Unitário Inicial</p>
                    <p className="text-2xl font-bold">
                      R$ {(treasurySelic.initialPrice / 100).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Preço Unitário Atual</p>
                    <p className="text-2xl font-bold">
                      R$ {(treasurySelic.currentPrice / 100).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-muted">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Variação Unitária</p>
                    <p className={`text-2xl font-bold ${treasurySelic.currentPrice >= treasurySelic.initialPrice ? "text-green-600" : "text-red-600"}`}>
                      R$ {((treasurySelic.currentPrice - treasurySelic.initialPrice) / 100).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Values */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-blue-50 dark:bg-blue-950">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Valor Inicial Total</p>
                    <p className="text-2xl font-bold">
                      R$ {(initialValue / 100).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-blue-50 dark:bg-blue-950">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Valor Atual Total</p>
                    <p className="text-2xl font-bold">
                      R$ {(currentValue / 100).toFixed(2)}
                    </p>
                  </CardContent>
                </Card>

                <Card className={profitLoss >= 0 ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Lucro/Prejuízo</p>
                    <p className={`text-2xl font-bold flex items-center gap-2 ${profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {profitLoss >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      R$ {(profitLoss / 100).toFixed(2)}
                    </p>
                    <p className="text-sm mt-2">
                      {profitLossPercent >= 0 ? "+" : ""}{profitLossPercent.toFixed(2)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Last Updated */}
              <div className="text-sm text-muted-foreground">
                Última atualização: {new Date(treasurySelic.lastUpdated).toLocaleString("pt-BR")}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">Nenhum investimento em Tesouro Selic cadastrado</p>
              <Button onClick={handleEdit}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Tesouro Selic
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {treasurySelic ? "Editar Tesouro Selic" : "Adicionar Tesouro Selic"}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados do seu investimento em Tesouro Selic
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="quantity">Quantidade de Títulos</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                placeholder="Ex: 2.86"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="initialPrice">Preço Unitário Inicial</Label>
              <CurrencyInput
                value={formData.initialPrice}
                onChange={(value) => setFormData({ ...formData, initialPrice: value })}
                placeholder="R$ 0,00"
              />
            </div>

            <div>
              <Label htmlFor="currentPrice">Preço Unitário Atual</Label>
              <CurrencyInput
                value={formData.currentPrice}
                onChange={(value) => setFormData({ ...formData, currentPrice: value })}
                placeholder="R$ 0,00"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={createOrUpdateMutation.isPending}
            >
              {createOrUpdateMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Tesouro Selic?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este investimento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
