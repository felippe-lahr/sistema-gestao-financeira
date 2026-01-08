"use client";

import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ChevronLeft, ChevronRight, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, differenceInDays, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Rentals() {
  const params = useParams<{ entityId: string }>();
  const entityId = params?.entityId || "";
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRental, setEditingRental] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
    source: "DIRECT",
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    numberOfGuests: 1,
    dailyRate: 0,
    totalAmount: 0,
    extraFeeType: "",
    extraFeeAmount: 0,
    checkInTime: "14:00",
    checkOutTime: "11:00",
    notes: "",
    competencyDate: "CHECK_IN",
  });

  const { data: rentals = [], isLoading: rentalsLoading, refetch } = trpc.rentals.list.useQuery({
    entityId: parseInt(entityId),
    month: currentMonth.getMonth() + 1,
    year: currentMonth.getFullYear(),
  });

  const createMutation = trpc.rentals.create.useMutation({
    onSuccess: () => {
      toast.success("Reserva criada com sucesso!");
      setIsCreateOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar reserva");
    },
  });

  const updateMutation = trpc.rentals.update.useMutation({
    onSuccess: () => {
      toast.success("Reserva atualizada com sucesso!");
      setIsEditOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar reserva");
    },
  });

  const deleteMutation = trpc.rentals.delete.useMutation({
    onSuccess: () => {
      toast.success("Reserva deletada com sucesso!");
      setIsEditOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao deletar reserva");
    },
  });

  const resetForm = () => {
    setFormData({
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: format(new Date(), "yyyy-MM-dd"),
      source: "DIRECT",
      guestName: "",
      guestEmail: "",
      guestPhone: "",
      numberOfGuests: 1,
      dailyRate: 0,
      totalAmount: 0,
      extraFeeType: "",
      extraFeeAmount: 0,
      checkInTime: "14:00",
      checkOutTime: "11:00",
      notes: "",
      competencyDate: "CHECK_IN",
    });
    setEditingRental(null);
  };

  const handleCreate = () => {
    createMutation.mutate({
      entityId: parseInt(entityId),
      ...formData,
    });
  };

  const handleUpdate = () => {
    if (!editingRental) return;
    updateMutation.mutate({
      id: editingRental.id,
      ...formData,
    });
  };

  const handleDelete = () => {
    if (!editingRental) return;
    deleteMutation.mutate({ id: editingRental.id });
  };

  const handleEdit = (rental) => {
    setEditingRental(rental);
    setFormData({
      startDate: rental.startDate,
      endDate: rental.endDate,
      source: rental.source,
      guestName: rental.guestName || "",
      guestEmail: rental.guestEmail || "",
      guestPhone: rental.guestPhone || "",
      numberOfGuests: rental.numberOfGuests || 1,
      dailyRate: rental.dailyRate || 0,
      totalAmount: rental.totalAmount || 0,
      extraFeeType: rental.extraFeeType || "",
      extraFeeAmount: rental.extraFeeAmount || 0,
      checkInTime: rental.checkInTime || "14:00",
      checkOutTime: rental.checkOutTime || "11:00",
      notes: rental.notes || "",
      competencyDate: rental.competencyDate || "CHECK_IN",
    });
    setIsEditOpen(true);
  };

  const getSourceColor = (source) => {
    switch (source) {
      case "AIRBNB":
        return "bg-red-400 hover:bg-red-500";
      case "DIRECT":
        return "bg-blue-300 hover:bg-blue-400";
      case "BLOCKED":
        return "bg-gray-400 hover:bg-gray-500";
      default:
        return "bg-gray-300 hover:bg-gray-400";
    }
  };

  const getSourceLabel = (source) => {
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

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Preencher com dias do mês anterior
  const firstDayOfWeek = monthStart.getDay();
  const daysFromPrevMonth = Array.from({ length: firstDayOfWeek }, (_, i) => {
    const date = new Date(monthStart);
    date.setDate(date.getDate() - (firstDayOfWeek - i));
    return date;
  });

  // Preencher com dias do próximo mês
  const totalDays = daysFromPrevMonth.length + daysInMonth.length;
  const daysFromNextMonth = Array.from({ length: 42 - totalDays }, (_, i) => {
    const date = new Date(monthEnd);
    date.setDate(date.getDate() + i + 1);
    return date;
  });

  const allDays = [...daysFromPrevMonth, ...daysInMonth, ...daysFromNextMonth];
  const weeks = Array.from({ length: 6 }, (_, i) => allDays.slice(i * 7, (i + 1) * 7));

  // Calcular posição da barra no grid
  const getRentalGridPosition = (rental, weekDays) => {
    const start = new Date(rental.startDate);
    const end = new Date(rental.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    let startCol = -1;
    let endCol = -1;

    weekDays.forEach((day, idx) => {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);

      if (dayStart.getTime() === start.getTime()) {
        startCol = idx + 1; // CSS Grid é 1-indexed
      }
      if (dayStart.getTime() === end.getTime()) {
        endCol = idx + 1;
      }
    });

    return { startCol, endCol };
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
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
          {rentalsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cabeçalho com dias da semana */}
              <div className="grid grid-cols-7 gap-1">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => (
                  <div key={day} className="text-center font-semibold text-sm p-2 border rounded bg-muted">
                    {day}
                  </div>
                ))}
              </div>

              {/* Grid do calendário com barras contínuas */}
              {weeks.map((week, weekIndex) => {
                // Obter todas as reservas desta semana
                const weekRentals = rentals.filter((rental) => {
                  const start = new Date(rental.startDate);
                  const end = new Date(rental.endDate);
                  return week.some((day) => day >= start && day <= end);
                });

                // Agrupar reservas por linha (para evitar sobreposição)
                const rentalRows = [];
                weekRentals.forEach((rental) => {
                  let placed = false;
                  for (let row of rentalRows) {
                    // Verificar se não há conflito com outras reservas nesta linha
                    const hasConflict = row.some((r) => {
                      const rStart = new Date(r.startDate);
                      const rEnd = new Date(r.endDate);
                      const rentalStart = new Date(rental.startDate);
                      const rentalEnd = new Date(rental.endDate);
                      return !(rentalEnd < rStart || rentalStart > rEnd);
                    });
                    if (!hasConflict) {
                      row.push(rental);
                      placed = true;
                      break;
                    }
                  }
                  if (!placed) {
                    rentalRows.push([rental]);
                  }
                });

                return (
                  <div key={weekIndex} className="relative">
                    {/* Renderizar barras de reservas */}
                    {rentalRows.map((row, rowIndex) => (
                      <div key={`row-${rowIndex}`} className="grid grid-cols-7 gap-1 mb-1 h-8">
                        {row.map((rental) => {
                          const { startCol, endCol } = getRentalGridPosition(rental, week);
                          if (startCol === -1 || endCol === -1) return null;

                          return (
                            <button
                              key={`${rental.id}-bar`}
                              onClick={() => handleEdit(rental)}
                              className={`text-xs font-semibold text-white rounded px-2 py-1 truncate cursor-pointer transition-all ${getSourceColor(rental.source)}`}
                              style={{
                                gridColumn: `${startCol} / span ${endCol - startCol + 1}`,
                              }}
                              title={rental.guestName || getSourceLabel(rental.source)}
                            >
                              {rental.guestName || getSourceLabel(rental.source)}
                            </button>
                          );
                        })}
                      </div>
                    ))}

                    {/* Células do calendário */}
                    <div className="grid grid-cols-7 gap-1">
                      {week.map((day, dayIndex) => {
                        const isCurrentMonth = isSameMonth(day, currentMonth);

                        return (
                          <div
                            key={day.toISOString()}
                            className={`min-h-24 border rounded p-1 ${isCurrentMonth ? "bg-background" : "bg-muted/30"}`}
                          >
                            <div className="text-xs font-semibold">{format(day, "d")}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Criar Reserva */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Reserva</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data de Início *</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Data de Fim *</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Tipo de Reserva *</Label>
              <Select value={formData.source} onValueChange={(value) => setFormData({ ...formData, source: value })}>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome do Hóspede</Label>
                <Input
                  value={formData.guestName}
                  onChange={(e) => setFormData({ ...formData, guestName: e.target.value })}
                />
              </div>
              <div>
                <Label>Número de Hóspedes</Label>
                <Select value={formData.numberOfGuests.toString()} onValueChange={(value) => setFormData({ ...formData, numberOfGuests: parseInt(value) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} hóspede{num > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.guestEmail}
                  onChange={(e) => setFormData({ ...formData, guestEmail: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={formData.guestPhone}
                  onChange={(e) => setFormData({ ...formData, guestPhone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Diária (R$)</Label>
                <Input
                  type="number"
                  value={formData.dailyRate}
                  onChange={(e) => setFormData({ ...formData, dailyRate: parseFloat(e.target.value) || 0 })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label>Total (R$)</Label>
                <Input
                  type="number"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) || 0 })}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo de Taxa Extra</Label>
                <Select value={formData.extraFeeType} onValueChange={(value) => setFormData({ ...formData, extraFeeType: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Nenhuma</SelectItem>
                    <SelectItem value="IMPOSTO">Imposto</SelectItem>
                    <SelectItem value="TAXA_PET">Taxa Pet</SelectItem>
                    <SelectItem value="LIMPEZA">Limpeza</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor da Taxa Extra (R$)</Label>
                <Input
                  type="number"
                  value={formData.extraFeeAmount}
                  onChange={(e) => setFormData({ ...formData, extraFeeAmount: parseFloat(e.target.value) || 0 })}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Horário Check-in</Label>
                <Input
                  type="time"
                  value={formData.checkInTime}
                  onChange={(e) => setFormData({ ...formData, checkInTime: e.target.value })}
                />
              </div>
              <div>
                <Label>Horário Check-out</Label>
                <Input
                  type="time"
                  value={formData.checkOutTime}
                  onChange={(e) => setFormData({ ...formData, checkOutTime: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Data de Competência</Label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="competency"
                  checked={formData.competencyDate === "CHECK_OUT"}
                  onChange={(e) => setFormData({ ...formData, competencyDate: e.target.checked ? "CHECK_OUT" : "CHECK_IN" })}
                  className="rounded"
                />
                <label htmlFor="competency" className="text-sm">
                  {formData.competencyDate === "CHECK_IN" ? "Check-in" : "Check-out"}
                </label>
              </div>
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700">
                Criar Reserva
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Editar Reserva */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Reserva</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data de Início *</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Data de Fim *</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Tipo de Reserva *</Label>
              <Select value={formData.source} onValueChange={(value) => setFormData({ ...formData, source: value })}>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome do Hóspede</Label>
                <Input
                  value={formData.guestName}
                  onChange={(e) => setFormData({ ...formData, guestName: e.target.value })}
                />
              </div>
              <div>
                <Label>Número de Hóspedes</Label>
                <Select value={formData.numberOfGuests.toString()} onValueChange={(value) => setFormData({ ...formData, numberOfGuests: parseInt(value) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} hóspede{num > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.guestEmail}
                  onChange={(e) => setFormData({ ...formData, guestEmail: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={formData.guestPhone}
                  onChange={(e) => setFormData({ ...formData, guestPhone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Diária (R$)</Label>
                <Input
                  type="number"
                  value={formData.dailyRate}
                  onChange={(e) => setFormData({ ...formData, dailyRate: parseFloat(e.target.value) || 0 })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label>Total (R$)</Label>
                <Input
                  type="number"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: parseFloat(e.target.value) || 0 })}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo de Taxa Extra</Label>
                <Select value={formData.extraFeeType} onValueChange={(value) => setFormData({ ...formData, extraFeeType: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Nenhuma</SelectItem>
                    <SelectItem value="IMPOSTO">Imposto</SelectItem>
                    <SelectItem value="TAXA_PET">Taxa Pet</SelectItem>
                    <SelectItem value="LIMPEZA">Limpeza</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor da Taxa Extra (R$)</Label>
                <Input
                  type="number"
                  value={formData.extraFeeAmount}
                  onChange={(e) => setFormData({ ...formData, extraFeeAmount: parseFloat(e.target.value) || 0 })}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Horário Check-in</Label>
                <Input
                  type="time"
                  value={formData.checkInTime}
                  onChange={(e) => setFormData({ ...formData, checkInTime: e.target.value })}
                />
              </div>
              <div>
                <Label>Horário Check-out</Label>
                <Input
                  type="time"
                  value={formData.checkOutTime}
                  onChange={(e) => setFormData({ ...formData, checkOutTime: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Data de Competência</Label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="competency-edit"
                  checked={formData.competencyDate === "CHECK_OUT"}
                  onChange={(e) => setFormData({ ...formData, competencyDate: e.target.checked ? "CHECK_OUT" : "CHECK_IN" })}
                  className="rounded"
                />
                <label htmlFor="competency-edit" className="text-sm">
                  {formData.competencyDate === "CHECK_IN" ? "Check-in" : "Check-out"}
                </label>
              </div>
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Deletar
              </Button>
              <Button onClick={handleUpdate} className="bg-blue-600 hover:bg-blue-700">
                Salvar Alterações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
