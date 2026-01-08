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
import { Plus, ChevronLeft, ChevronRight, Trash2, Edit, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, differenceInDays } from "date-fns";
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

// Função para formatar valor em moeda brasileira
const formatCurrency = (value: number | string): string => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
};

// Função para remover máscara de moeda
const unmaskCurrency = (value: string): number => {
  const cleaned = value.replace(/\D/g, "");
  return parseInt(cleaned) / 100;
};

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
        numberOfGuests: 1,
        checkInTime: rentalConfig?.defaultCheckInTime || "14:00",
        checkOutTime: rentalConfig?.defaultCheckOutTime || "11:00",
        competencyDate: "CHECK_IN",
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
      extraFeeAmount: formData.extraFeeAmount ? Math.round(formData.extraFeeAmount * 100) : undefined,
      numberOfGuests: formData.numberOfGuests || 1,
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
      extraFeeAmount: formData.extraFeeAmount ? Math.round(formData.extraFeeAmount * 100) : undefined,
      numberOfGuests: formData.numberOfGuests || 1,
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
      numberOfGuests: rental.numberOfGuests || 1,
      dailyRate: rental.dailyRate ? rental.dailyRate / 100 : undefined,
      totalAmount: rental.totalAmount ? rental.totalAmount / 100 : undefined,
      extraFeeType: rental.extraFeeType || "",
      extraFeeAmount: rental.extraFeeAmount ? rental.extraFeeAmount / 100 : undefined,
      checkInTime: rental.checkInTime || "14:00",
      checkOutTime: rental.checkOutTime || "11:00",
      notes: rental.notes || "",
      specialRequests: rental.specialRequests || "",
      competencyDate: rental.competencyDate || "CHECK_IN",
    });
    setIsEditOpen(true);
  };

  // Obter dias do mês para o calendário
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Calcular posição e largura das barras
  const getRentalPosition = (rental: any, day: Date) => {
    const rentalStart = new Date(rental.startDate);
    const rentalEnd = new Date(rental.endDate);
    const monthStart = startOfMonth(currentMonth);
    
    // Determinar o dia de início da barra (checkout do dia anterior)
    let barStart = new Date(rentalStart);
    barStart.setDate(barStart.getDate() - 1);
    
    // Calcular a posição relativa ao mês
    const dayIndex = differenceInDays(day, monthStart);
    const barStartIndex = differenceInDays(barStart, monthStart);
    const barEndIndex = differenceInDays(rentalEnd, monthStart);
    
    // Verificar se a barra aparece neste dia
    if (dayIndex < barStartIndex || dayIndex > barEndIndex) {
      return null;
    }
    
    return {
      startIndex: Math.max(0, barStartIndex),
      endIndex: Math.min(daysInMonth.length - 1, barEndIndex),
      dayIndex,
    };
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case "AIRBNB":
        return "bg-red-500 hover:bg-red-600";
      case "DIRECT":
        return "bg-blue-300 hover:bg-blue-400";
      case "BLOCKED":
        return "bg-gray-400 hover:bg-gray-500";
      default:
        return "bg-gray-400 hover:bg-gray-500";
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

  // Agrupar reservas por linha para evitar sobreposição
  const getRentalsByRow = () => {
    const rows: any[][] = [];
    (rentals || []).forEach((rental) => {
      let placed = false;
      for (let i = 0; i < rows.length; i++) {
        const hasConflict = rows[i].some((r) => {
          const rStart = new Date(r.startDate);
          const rEnd = new Date(r.endDate);
          const rentalStart = new Date(rental.startDate);
          const rentalEnd = new Date(rental.endDate);
          return !(rentalEnd < rStart || rentalStart > rEnd);
        });
        if (!hasConflict) {
          rows[i].push(rental);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([rental]);
      }
    });
    return rows;
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
            <div className="space-y-4">
              {/* Cabeçalho com dias da semana */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => (
                  <div key={day} className="text-center font-semibold text-sm p-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Dias do mês com números */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {daysInMonth.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={`text-sm font-semibold p-2 text-center border rounded ${
                      isSameMonth(day, currentMonth) ? "bg-background" : "bg-muted/50"
                    }`}
                  >
                    {format(day, "d")}
                  </div>
                ))}
              </div>

              {/* Barras de reservas */}
              {getRentalsByRow().map((row, rowIndex) => (
                <div key={rowIndex} className="space-y-1">
                  {row.map((rental) => {
                    const rentalStart = new Date(rental.startDate);
                    const rentalEnd = new Date(rental.endDate);
                    const monthStart = startOfMonth(currentMonth);
                    
                    let barStart = new Date(rentalStart);
                    barStart.setDate(barStart.getDate() - 1);
                    
                    const barStartIndex = Math.max(0, differenceInDays(barStart, monthStart));
                    const barEndIndex = Math.min(daysInMonth.length - 1, differenceInDays(rentalEnd, monthStart));
                    const barWidth = ((barEndIndex - barStartIndex + 1) / daysInMonth.length) * 100;
                    const barLeft = (barStartIndex / daysInMonth.length) * 100;
                    
                    return (
                      <div
                        key={rental.id}
                        className="relative h-8 mb-1"
                        style={{
                          marginLeft: `${barLeft}%`,
                          width: `${barWidth}%`,
                        }}
                      >
                        <button
                          onClick={() => handleEdit(rental)}
                          className={`w-full h-full rounded px-2 text-xs font-semibold text-white truncate cursor-pointer transition-all ${getSourceColor(
                            rental.source
                          )}`}
                          title={rental.guestName || getSourceLabel(rental.source)}
                        >
                          {rental.guestName || getSourceLabel(rental.source)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Reserva</DialogTitle>
            <DialogDescription>Crie uma nova reserva ou bloqueio de período</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
                    <Label htmlFor="numberOfGuests">Número de Hóspedes</Label>
                    <Select value={(formData.numberOfGuests || 1).toString()} onValueChange={(value) => setFormData({ ...formData, numberOfGuests: parseInt(value) })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                          <SelectItem key={num} value={num.toString()}>
                            {num} {num === 1 ? "hóspede" : "hóspedes"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="guestEmail">Email</Label>
                    <Input
                      id="guestEmail"
                      type="email"
                      value={formData.guestEmail || ""}
                      onChange={(e) => setFormData({ ...formData, guestEmail: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guestPhone">Telefone</Label>
                    <Input
                      id="guestPhone"
                      value={formData.guestPhone || ""}
                      onChange={(e) => setFormData({ ...formData, guestPhone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dailyRate">Diária (R$)</Label>
                    <Input
                      id="dailyRate"
                      type="text"
                      inputMode="decimal"
                      value={formData.dailyRate ? formatCurrency(formData.dailyRate).replace("R$", "").trim() : ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        setFormData({ ...formData, dailyRate: value ? parseInt(value) / 100 : undefined });
                      }}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="totalAmount">Total (R$)</Label>
                    <Input
                      id="totalAmount"
                      type="text"
                      inputMode="decimal"
                      value={formData.totalAmount ? formatCurrency(formData.totalAmount).replace("R$", "").trim() : ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        setFormData({ ...formData, totalAmount: value ? parseInt(value) / 100 : undefined });
                      }}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="extraFeeType">Tipo de Taxa Extra</Label>
                    <Select value={formData.extraFeeType || "NONE"} onValueChange={(value) => setFormData({ ...formData, extraFeeType: value === "NONE" ? undefined : value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Nenhuma</SelectItem>
                        <SelectItem value="IMPOSTO">Imposto</SelectItem>
                        <SelectItem value="TAXA_PET">Taxa Pet</SelectItem>
                        <SelectItem value="LIMPEZA">Limpeza</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="extraFeeAmount">Valor da Taxa (R$)</Label>
                    <Input
                      id="extraFeeAmount"
                      type="text"
                      inputMode="decimal"
                      value={formData.extraFeeAmount ? formatCurrency(formData.extraFeeAmount).replace("R$", "").trim() : ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        setFormData({ ...formData, extraFeeAmount: value ? parseInt(value) / 100 : undefined });
                      }}
                      placeholder="0,00"
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

            {formData.source !== "BLOCKED" && (
              <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                <div>
                  <Label className="mb-0">Data de Competência</Label>
                  <p className="text-xs text-muted-foreground mt-1">Quando o valor será contabilizado</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formData.competencyDate === "CHECK_IN" ? "Check-in" : "Check-out"}</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, competencyDate: formData.competencyDate === "CHECK_IN" ? "CHECK_OUT" : "CHECK_IN" })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.competencyDate === "CHECK_OUT" ? "bg-blue-600" : "bg-gray-300"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.competencyDate === "CHECK_OUT" ? "translate-x-6" : "translate-x-1"}`}
                    />
                  </button>
                </div>
              </div>
            )}

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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Reserva</DialogTitle>
            <DialogDescription>Atualize as informações da reserva</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
                    <Label htmlFor="numberOfGuests">Número de Hóspedes</Label>
                    <Select value={(formData.numberOfGuests || 1).toString()} onValueChange={(value) => setFormData({ ...formData, numberOfGuests: parseInt(value) })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                          <SelectItem key={num} value={num.toString()}>
                            {num} {num === 1 ? "hóspede" : "hóspedes"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="guestEmail">Email</Label>
                    <Input
                      id="guestEmail"
                      type="email"
                      value={formData.guestEmail || ""}
                      onChange={(e) => setFormData({ ...formData, guestEmail: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guestPhone">Telefone</Label>
                    <Input
                      id="guestPhone"
                      value={formData.guestPhone || ""}
                      onChange={(e) => setFormData({ ...formData, guestPhone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dailyRate">Diária (R$)</Label>
                    <Input
                      id="dailyRate"
                      type="text"
                      inputMode="decimal"
                      value={formData.dailyRate ? formatCurrency(formData.dailyRate).replace("R$", "").trim() : ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        setFormData({ ...formData, dailyRate: value ? parseInt(value) / 100 : undefined });
                      }}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="totalAmount">Total (R$)</Label>
                    <Input
                      id="totalAmount"
                      type="text"
                      inputMode="decimal"
                      value={formData.totalAmount ? formatCurrency(formData.totalAmount).replace("R$", "").trim() : ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        setFormData({ ...formData, totalAmount: value ? parseInt(value) / 100 : undefined });
                      }}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="extraFeeType">Tipo de Taxa Extra</Label>
                    <Select value={formData.extraFeeType || "NONE"} onValueChange={(value) => setFormData({ ...formData, extraFeeType: value === "NONE" ? undefined : value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Nenhuma</SelectItem>
                        <SelectItem value="IMPOSTO">Imposto</SelectItem>
                        <SelectItem value="TAXA_PET">Taxa Pet</SelectItem>
                        <SelectItem value="LIMPEZA">Limpeza</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="extraFeeAmount">Valor da Taxa (R$)</Label>
                    <Input
                      id="extraFeeAmount"
                      type="text"
                      inputMode="decimal"
                      value={formData.extraFeeAmount ? formatCurrency(formData.extraFeeAmount).replace("R$", "").trim() : ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        setFormData({ ...formData, extraFeeAmount: value ? parseInt(value) / 100 : undefined });
                      }}
                      placeholder="0,00"
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

            {formData.source !== "BLOCKED" && (
              <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                <div>
                  <Label className="mb-0">Data de Competência</Label>
                  <p className="text-xs text-muted-foreground mt-1">Quando o valor será contabilizado</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formData.competencyDate === "CHECK_IN" ? "Check-in" : "Check-out"}</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, competencyDate: formData.competencyDate === "CHECK_IN" ? "CHECK_OUT" : "CHECK_IN" })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.competencyDate === "CHECK_OUT" ? "bg-blue-600" : "bg-gray-300"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.competencyDate === "CHECK_OUT" ? "translate-x-6" : "translate-x-1"}`}
                    />
                  </button>
                </div>
              </div>
            )}

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
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => setIsDeleteOpen(true)} className="mr-auto">
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Atualizando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Reserva</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta reserva? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate({ id: selectedRental.id })}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
