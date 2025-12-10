import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Entities() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#2563EB",
  });

  const utils = trpc.useUtils();
  const { data: entities, isLoading } = trpc.entities.list.useQuery();

  const createMutation = trpc.entities.create.useMutation({
    onSuccess: () => {
      utils.entities.list.invalidate();
      setIsCreateOpen(false);
      resetForm();
      toast.success("Entidade criada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar entidade: " + error.message);
    },
  });

  const updateMutation = trpc.entities.update.useMutation({
    onSuccess: () => {
      utils.entities.list.invalidate();
      setIsEditOpen(false);
      setSelectedEntity(null);
      resetForm();
      toast.success("Entidade atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar entidade: " + error.message);
    },
  });

  const deleteMutation = trpc.entities.delete.useMutation({
    onSuccess: () => {
      utils.entities.list.invalidate();
      setIsDeleteOpen(false);
      setSelectedEntity(null);
      toast.success("Entidade excluída com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir entidade: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      color: "#2563EB",
    });
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast.error("O nome da entidade é obrigatório");
      return;
    }
    createMutation.mutate(formData);
  };

  const handleEdit = (entity: any) => {
    setSelectedEntity(entity);
    setFormData({
      name: entity.name,
      description: entity.description || "",
      color: entity.color || "#2563EB",
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!formData.name.trim()) {
      toast.error("O nome da entidade é obrigatório");
      return;
    }
    updateMutation.mutate({
      id: selectedEntity.id,
      ...formData,
    });
  };

  const handleDelete = (entity: any) => {
    setSelectedEntity(entity);
    setIsDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (selectedEntity) {
      deleteMutation.mutate({ id: selectedEntity.id });
    }
  };

  const colorOptions = [
    { value: "#2563EB", label: "Azul" },
    { value: "#10B981", label: "Verde" },
    { value: "#F59E0B", label: "Amarelo" },
    { value: "#EF4444", label: "Vermelho" },
    { value: "#8B5CF6", label: "Roxo" },
    { value: "#EC4899", label: "Rosa" },
    { value: "#6B7280", label: "Cinza" },
  ];

  if (isLoading) {
    return (
      <div className="container py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gerenciar Entidades</h1>
          <p className="text-muted-foreground">
            Crie e gerencie seus módulos financeiros personalizados
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Entidade
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Entidade</DialogTitle>
              <DialogDescription>
                Crie um novo módulo financeiro personalizado (ex: Fazenda 1, Empresa ABC)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Fazenda 1"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descrição opcional da entidade"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex gap-2 flex-wrap">
                  {colorOptions.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      className={`w-10 h-10 rounded-full border-2 transition-all ${
                        formData.color === color.value ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setFormData({ ...formData, color: color.value })}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar Entidade"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Entities Grid */}
      {!entities || entities.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma entidade cadastrada</CardTitle>
            <CardDescription>
              Comece criando sua primeira entidade financeira para organizar suas finanças.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {entities.map((entity) => (
            <Card key={entity.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: entity.color || "#2563EB" }}
                    >
                      <Building2 className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{entity.name}</CardTitle>
                      <CardDescription className="text-xs">
                        Criado em {format(new Date(entity.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {entity.description && (
                  <p className="text-sm text-muted-foreground mb-4">{entity.description}</p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(entity)}>
                    <Edit className="mr-2 h-3 w-3" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(entity)}
                  >
                    <Trash2 className="mr-2 h-3 w-3" />
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Entidade</DialogTitle>
            <DialogDescription>Atualize as informações da entidade</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                placeholder="Ex: Fazenda 1"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                placeholder="Descrição opcional da entidade"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {colorOptions.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={`w-10 h-10 rounded-full border-2 transition-all ${
                      formData.color === color.value ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setFormData({ ...formData, color: color.value })}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
          </div>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso irá excluir permanentemente a entidade "
              {selectedEntity?.name}" e todas as transações associadas a ela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
