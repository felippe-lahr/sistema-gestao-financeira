import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, ChevronLeft, ChevronRight, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RentalFormData {
  startDate: string;
  endDate: string;
  source: "AIRBNB" | "DIRECT" | "BLOCKED";
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  numberOfGuests?: number;
  dailyRate?: number;
  totalAmount?: number;
  extraFeeType?: string;
  extraFeeAmount?: number;
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
  specialRequests?: string;
  competencyDate?: "CHECK_IN" | "CHECK_OUT";
}

export default function Rentals() {
  const [location] = useLocation();
  const entityId = parseInt(location.split("/").pop() || "0");
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedRental, setSelectedRental] = useState<any>(null);
  const [formData, setFormData] = useState<RentalFormData>({
    startDate: "",
    endDate: "",
    source: "DIRECT",
    numberOfGuests: 1,
    checkInTime: "14:00",
    checkOutTime: "11:00",
    competencyDate: "CHECK_IN",
  });

  const utils = trpc.useUtils();
  const { data: rentals, isLoading } = trpc.rentals.list.useQuery({ entityId });
  const { data: rentalConfig } = trpc.rentals.getConfig.useQuery({ entityId });

  const createMutation = trpc.rentals.create.useMutation({
    onSuccess: () => {
      utils.rentals.list.invalidate();
      setIsCreateOpen(false);
      setFormData({
        startDate: "",
        endDate: "",
        source: "DIRECT",
        checkInTime: rentalConfig?.defaultCheckInTime || "14:00",
        checkOutTime: rentalConfig?.defaultCheckOutTime || "11:00",
      });
      toast.success("Reserva criada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar reserva: " + error.message);
    },
  });

  const updateMutation = trpc.rentals.update.useMutation({
    onSuccess: () => {
      utils.rentals.list.invalidate();
      setIsEditOpen(false);
      setSelectedRental(null);
      toast.success("Reserva atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar reserva: " + error.message);
    },
  });

  const deleteMutation = trpc.rentals.delete.useMutation({
    onSuccess: () => {
      utils.rentals.list.invalidate();
      setIsDeleteOpen(false);
      setSelectedRental(null);
      toast.success("Reserva excluída com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir reserva: " + error.message);
    },
  });

  const handleCreate = () => {
    if (!formData.startDate || !formData.endDate) {
      toast.error("Datas de início e fim são obrigatórias");
      return;
    }
    createMutation.mutate({
      entityId,
      ...formData,
      dailyRate: formData.dailyRate ? Math.round(formData.dailyRate * 100) : undefined,
      totalAmount: formData.totalAmount ? Math.round(formData.totalAmount * 100) : undefined,
    });
  };

  const handleUpdate = () => {
    if (!formData.startDate || !formData.endDate) {
      toast.error("Datas de início e fim são obrigatórias");
      return;
    }
    updateMutation.mutate({
      id: selectedRental.id,
      ...formData,
      dailyRate: formData.dailyRate ? Math.round(formData.dailyRate * 100) : undefined,
      totalAmount: formData.totalAmount ? Math.round(formData.totalAmount * 100) : undefined,
    });
  };

  const handleEdit = (rental: any) => {
    setSelectedRental(rental);
    setFormData({
      startDate: format(new Date(rental.startDate), "yyyy-MM-dd"),
      endDate: format(new Date(rental.endDate), "yyyy-MM-dd"),
      source: rental.source,
      guestName: rental.guestName || "",
      guestEmail: rental.guestEmail || "",
      guestPhone: rental.guestPhone || "",
      dailyRate: rental.dailyRate ? rental.dailyRate / 100 : undefined,
      totalAmount: rental.totalAmount ? rental.totalAmount / 100 : undefined,
      checkInTime: rental.checkInTime || "14:00",
      checkOutTime: rental.checkOutTime || "11:00",
      notes: rental.notes || "",
      specialRequests: rental.specialRequests || "",
    });
    setIsEditOpen(true);
  };

  // Obter dias do mês para o calendário
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Agrupar reservas por dia
  const rentalsByDay = (day: Date) => {
    return (rentals || []).filter((rental) => {
      const rentalStart = new Date(rental.startDate);
      const rentalEnd = new Date(rental.endDate);
      return day >= rentalStart && day <= rentalEnd;
    });
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case "AIRBNB":
        return "bg-red-400 text-white border-red-500";
      case "DIRECT":
        return "bg-blue-300 text-white border-blue-400";
      case "BLOCKED":
        return "bg-gray-400 text-white border-gray-500";
      default:
        return "bg-gray-400 text-white border-gray-500";
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "AIRBNB":
        return "Airbnb";
      case "DIRECT":
        return "Direto";
      case "BLOCKED":
        return "Bloqueado";
      default:
        return source;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reservas</h1>
          <p className="text-muted-foreground mt-2">Gerencie suas reservas e bloqueios de temporada</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="mr-2 h-4 w-4" />
          Nova Reserva
        </Button>
      </div>

      {/* Calendário */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{format(currentMonth, "MMMM yyyy", { locale: ptBR })}</CardTitle>
              <CardDescription>Visualize suas reservas mês a mês</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {/* Dias da semana */}
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => (
                <div key={day} className="text-center font-semibold text-sm p-2">
                  {day}
                </div>
              ))}
              
              {/* Dias do mês */}
              {daysInMonth.map((day) => {
                const dayRentals = rentalsByDay(day);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-24 p-2 border rounded-lg ${
                      isCurrentMonth ? "bg-background" : "bg-muted/50"
                    }`}
                  >
                    <div className="text-sm font-semibold mb-1">{format(day, "d")}</div>
                    <div className="space-y-1">
                      {dayRentals.slice(0, 2).map((rental) => (
                        <div
                          key={rental.id}
                          className={`text-xs p-1 rounded border cursor-pointer hover:shadow-md transition-shadow ${getSourceColor(
                            rental.source
                          )}`}
                          onClick={() => handleEdit(rental)}
                        >
                          {rental.guestName || getSourceLabel(rental.source)}
                        </div>
                      ))}
                      {dayRentals.length > 2 && (
                        <div className="text-xs text-muted-foreground">+{dayRentals.length - 2} mais</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova Reserva</DialogTitle>
            <DialogDescription>Crie uma nova reserva ou bloqueio de período</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Data de Início *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Data de Fim *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">Tipo de Reserva *</Label>
              <Select value={formData.source} onValueChange={(value: any) => setFormData({ ...formData, source: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIRECT">Reserva Direta</SelectItem>
                  <SelectItem value="AIRBNB">Airbnb</SelectItem>
                  <SelectItem value="BLOCKED">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.source !== "BLOCKED" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="guestName">Nome do Hóspede</Label>
                    <Input
                      id="guestName"
                      value={formData.guestName || ""}
                      onChange={(e) => setFormData({ ...formData, guestName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guestEmail">Email</Label>
                    <Input
                      id="guestEmail"
                      type="email"
                      value={formData.guestEmail || ""}
                      onChange={(e) => setFormData({ ...formData, guestEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dailyRate">Diária (R$)</Label>
                    <Input
                      id="dailyRate"
                      type="number"
                      step="0.01"
                      value={formData.dailyRate || ""}
                      onChange={(e) => setFormData({ ...formData, dailyRate: parseFloat(e.target.value) || undefined })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="totalAmount">Total (R$)</Label>
                    <Input
                      id="totalAmount"
                      type="number"
                      step="0.01"
                      value={formData.totalAmount || ""}
                      onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) || undefined })}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkInTime">Horário Check-in</Label>
                <Input
                  id="checkInTime"
                  type="time"
                  value={formData.checkInTime}
                  onChange={(e) => setFormData({ ...formData, checkInTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkOutTime">Horário Check-out</Label>
                <Input
                  id="checkOutTime"
                  type="time"
                  value={formData.checkOutTime}
                  onChange={(e) => setFormData({ ...formData, checkOutTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={formData.notes || ""}
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
              {createMutation.isPending ? "Criando..." : "Criar Reserva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Reserva</DialogTitle>
            <DialogDescription>Atualize as informações da reserva</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-startDate">Data de Início *</Label>
                <Input
                  id="edit-startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-endDate">Data de Fim *</Label>
                <Input
                  id="edit-endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-source">Tipo de Reserva *</Label>
              <Select value={formData.source} onValueChange={(value: any) => setFormData({ ...formData, source: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIRECT">Reserva Direta</SelectItem>
                  <SelectItem value="AIRBNB">Airbnb</SelectItem>
                  <SelectItem value="BLOCKED">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.source !== "BLOCKED" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-guestName">Nome do Hóspede</Label>
                    <Input
                      id="edit-guestName"
                      value={formData.guestName || ""}
                      onChange={(e) => setFormData({ ...formData, guestName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-guestEmail">Email</Label>
                    <Input
                      id="edit-guestEmail"
                      type="email"
                      value={formData.guestEmail || ""}
                      onChange={(e) => setFormData({ ...formData, guestEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-dailyRate">Diária (R$)</Label>
                    <Input
                      id="edit-dailyRate"
                      type="number"
                      step="0.01"
                      value={formData.dailyRate || ""}
                      onChange={(e) => setFormData({ ...formData, dailyRate: parseFloat(e.target.value) || undefined })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-totalAmount">Total (R$)</Label>
                    <Input
                      id="edit-totalAmount"
                      type="number"
                      step="0.01"
                      value={formData.totalAmount || ""}
                      onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) || undefined })}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-checkInTime">Horário Check-in</Label>
                <Input
                  id="edit-checkInTime"
                  type="time"
                  value={formData.checkInTime}
                  onChange={(e) => setFormData({ ...formData, checkInTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-checkOutTime">Horário Check-out</Label>
                <Input
                  id="edit-checkOutTime"
                  type="time"
                  value={formData.checkOutTime}
                  onChange={(e) => setFormData({ ...formData, checkOutTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notas</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => setIsDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
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
              Esta ação não pode ser desfeita. A reserva será permanentemente excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedRental) {
                  deleteMutation.mutate({ id: selectedRental.id });
                }
              }}
              disabled={deleteMutation.isPending}
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
