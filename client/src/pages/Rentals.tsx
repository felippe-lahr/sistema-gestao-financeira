import React, { useState, useEffect } from "react";
import { useParams } from "wouter";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { getRentalsByEntityId, createRental, updateRental, deleteRental } from "@/api";

interface Rental {
  id: number;
  entityId: number;
  userId: number;
  startDate: Date;
  endDate: Date;
  source: "AIRBNB" | "DIRECT" | "BLOCKED";
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  dailyRate?: number;
  totalAmount?: number;
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
  specialRequests?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export default function Rentals() {
  const params = useParams<{ entityId: string }>();
  const entityId = parseInt(params?.entityId || "0");

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [rentalsLoading, setRentalsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<Rental | null>(null);
  const [formData, setFormData] = useState({
    startDate: "",
    endDate: "",
    source: "DIRECT",
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    dailyRate: "",
    totalAmount: "",
    checkInTime: "14:00",
    checkOutTime: "11:00",
    notes: "",
  });

  // Carregar reservas
  useEffect(() => {
    const loadRentals = async () => {
      if (!entityId) return;
      setRentalsLoading(true);
      try {
        const data = await getRentalsByEntityId(entityId);
        setRentals(
          data.map((r: any) => ({
            ...r,
            startDate: new Date(r.startDate),
            endDate: new Date(r.endDate),
            createdAt: new Date(r.createdAt),
            updatedAt: new Date(r.updatedAt),
          }))
        );
      } catch (error) {
        console.error("Erro ao carregar reservas:", error);
      } finally {
        setRentalsLoading(false);
      }
    };
    loadRentals();
  }, [entityId]);

  // Resetar formulário
  const resetForm = () => {
    setFormData({
      startDate: "",
      endDate: "",
      source: "DIRECT",
      guestName: "",
      guestEmail: "",
      guestPhone: "",
      dailyRate: "",
      totalAmount: "",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      notes: "",
    });
    setEditingRental(null);
  };

  // Abrir diálogo para editar
  const handleEdit = (rental: Rental) => {
    setEditingRental(rental);
    setFormData({
      startDate: format(rental.startDate, "yyyy-MM-dd"),
      endDate: format(rental.endDate, "yyyy-MM-dd"),
      source: rental.source,
      guestName: rental.guestName || "",
      guestEmail: rental.guestEmail || "",
      guestPhone: rental.guestPhone || "",
      dailyRate: rental.dailyRate?.toString() || "",
      totalAmount: rental.totalAmount?.toString() || "",
      checkInTime: rental.checkInTime || "14:00",
      checkOutTime: rental.checkOutTime || "11:00",
      notes: rental.notes || "",
    });
    setIsDialogOpen(true);
  };

  // Salvar reserva
  const handleSave = async () => {
    if (!formData.startDate || !formData.endDate) {
      alert("Preencha as datas");
      return;
    }

    try {
      if (editingRental) {
        const updated = await updateRental(editingRental.id, {
          startDate: formData.startDate,
          endDate: formData.endDate,
          source: formData.source as "AIRBNB" | "DIRECT" | "BLOCKED",
          guestName: formData.guestName,
          guestEmail: formData.guestEmail,
          guestPhone: formData.guestPhone,
          dailyRate: formData.dailyRate ? parseFloat(formData.dailyRate) : undefined,
          totalAmount: formData.totalAmount ? parseFloat(formData.totalAmount) : undefined,
          checkInTime: formData.checkInTime,
          checkOutTime: formData.checkOutTime,
          notes: formData.notes,
        });
        setRentals(
          rentals.map((r) =>
            r.id === updated.id
              ? {
                  ...updated,
                  startDate: new Date(updated.startDate),
                  endDate: new Date(updated.endDate),
                }
              : r
          )
        );
      } else {
        const created = await createRental({
          entityId,
          userId: 1,
          startDate: formData.startDate,
          endDate: formData.endDate,
          source: formData.source as "AIRBNB" | "DIRECT" | "BLOCKED",
          guestName: formData.guestName,
          guestEmail: formData.guestEmail,
          guestPhone: formData.guestPhone,
          dailyRate: formData.dailyRate ? parseFloat(formData.dailyRate) : undefined,
          totalAmount: formData.totalAmount ? parseFloat(formData.totalAmount) : undefined,
          checkInTime: formData.checkInTime,
          checkOutTime: formData.checkOutTime,
          notes: formData.notes,
        });
        setRentals([
          ...rentals,
          {
            ...created,
            startDate: new Date(created.startDate),
            endDate: new Date(created.endDate),
          },
        ]);
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Erro ao salvar reserva:", error);
      alert("Erro ao salvar reserva");
    }
  };

  // Deletar reserva
  const handleDelete = async () => {
    if (!editingRental) return;
    if (!confirm("Tem certeza que deseja deletar esta reserva?")) return;

    try {
      await deleteRental(editingRental.id);
      setRentals(rentals.filter((r) => r.id !== editingRental.id));
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Erro ao deletar reserva:", error);
      alert("Erro ao deletar reserva");
    }
  };

  // Gerar semanas do mês
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  // Obter cor da fonte
  const getSourceColor = (source: string) => {
    switch (source) {
      case "AIRBNB":
        return "bg-red-400";
      case "DIRECT":
        return "bg-blue-400";
      case "BLOCKED":
        return "bg-gray-400";
      default:
        return "bg-gray-400";
    }
  };

  // Obter label da fonte
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

  // Obter reservas da semana
  const getRentalsInWeek = (week: Date[]) => {
    const weekStart = new Date(week[0]);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(week[6]);
    weekEnd.setHours(23, 59, 59, 999);

    return rentals.filter((rental) => {
      const rStart = new Date(rental.startDate);
      rStart.setHours(0, 0, 0, 0);
      const rEnd = new Date(rental.endDate);
      rEnd.setHours(0, 0, 0, 0);

      return !(rEnd < weekStart || rStart > weekEnd);
    });
  };

  // Calcular dias que a reserva ocupa
  const getRentalDaySpan = (rental: Rental, week: Date[]) => {
    const start = new Date(rental.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(rental.endDate);
    end.setHours(0, 0, 0, 0);

    let startDayIndex = -1;
    let endDayIndex = -1;

    week.forEach((day, idx) => {
      const dayNormalized = new Date(day);
      dayNormalized.setHours(0, 0, 0, 0);

      if (dayNormalized.getTime() === start.getTime()) {
        startDayIndex = idx;
      }
      if (dayNormalized.getTime() === end.getTime()) {
        endDayIndex = idx;
      }
    });

    if (startDayIndex === -1) {
      return 0;
    }

    const endIdx = endDayIndex !== -1 ? endDayIndex : 6;
    return endIdx - startDayIndex + 1;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Reservas</CardTitle>
              <p className="text-sm text-muted-foreground">Gerencie suas reservas e bloqueios de temporada</p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => resetForm()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Reserva
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingRental ? "Editar Reserva" : "Nova Reserva"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Data de Início</Label>
                      <Input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Data de Fim</Label>
                      <Input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Tipo de Reserva</Label>
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

                  {formData.source !== "BLOCKED" && (
                    <>
                      <div>
                        <Label>Nome do Hóspede</Label>
                        <Input
                          value={formData.guestName}
                          onChange={(e) => setFormData({ ...formData, guestName: e.target.value })}
                        />
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
                            step="0.01"
                            value={formData.dailyRate}
                            onChange={(e) => setFormData({ ...formData, dailyRate: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Total (R$)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={formData.totalAmount}
                            onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
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
                        <Label>Notas</Label>
                        <Input
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        />
                      </div>
                    </>
                  )}

                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleSave} className="flex-1">
                      {editingRental ? "Atualizar" : "Criar"} Reserva
                    </Button>
                    {editingRental && (
                      <Button onClick={handleDelete} variant="destructive">
                        Deletar
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Navegação de meses */}
          <div className="flex items-center justify-between mt-4">
            <h3 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy", { locale: ptBR })}</h3>
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
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Cabeçalho com dias da semana */}
              <div className="grid grid-cols-7 gap-1">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => (
                  <div key={day} className="text-center font-semibold text-sm py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Semanas */}
              {weeks.map((week, weekIndex) => {
                const rentalsInWeek = getRentalsInWeek(week);

                return (
                  <div key={weekIndex} className="relative">
                    {/* Células dos dias */}
                    <div className="grid grid-cols-7 gap-1">
                      {week.map((day, dayIndex) => {
                        const isCurrentMonth = format(day, "M") === format(currentMonth, "M");

                        return (
                          <div
                            key={dayIndex}
                            className={`min-h-32 border rounded p-2 relative ${isCurrentMonth ? "bg-background" : "bg-muted/30"}`}
                          >
                            {/* Número do dia */}
                            <div className="text-sm font-semibold">{format(day, "d")}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Barras de reservas sobrepostas */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="grid grid-cols-7 gap-1 h-full">
                        {rentalsInWeek.map((rental, rentalIndex) => {
                          const daySpan = getRentalDaySpan(rental, week);
                          if (daySpan === 0) return null;

                          // Calcular a posição left (em %)
                          const start = new Date(rental.startDate);
                          start.setHours(0, 0, 0, 0);
                          let startDayIndex = 0;
                          week.forEach((day, idx) => {
                            const dayNormalized = new Date(day);
                            dayNormalized.setHours(0, 0, 0, 0);
                            if (dayNormalized.getTime() === start.getTime()) {
                              startDayIndex = idx;
                            }
                          });

                          // Detectar se há outra reserva que começa no dia de checkout desta
                          const rentalEnd = new Date(rental.endDate);
                          rentalEnd.setHours(0, 0, 0, 0);
                          const conflictingRentals = rentalsInWeek.filter((r) => {
                            if (r.id === rental.id) return false;
                            const rStart = new Date(r.startDate);
                            rStart.setHours(0, 0, 0, 0);
                            return rStart.getTime() === rentalEnd.getTime();
                          });

                          // Se há conflito, posicionar lado a lado (50% cada)
                          let topOffset = 0;
                          let heightClass = "h-full";
                          if (conflictingRentals.length > 0) {
                            const shouldBeTop = rental.id < conflictingRentals[0].id;
                            topOffset = shouldBeTop ? 0 : 50;
                            heightClass = "h-1/2";
                          }

                          // Calcular left e width em porcentagem
                          const cellWidth = 100 / 7;
                          const gapPercentage = 0.5;
                          const left = startDayIndex * (cellWidth + gapPercentage);
                          const width = daySpan * cellWidth + (daySpan - 1) * gapPercentage;

                          return (
                            <button
                              key={`${rental.id}-bar-${rentalIndex}`}
                              onClick={() => handleEdit(rental)}
                              className={`absolute text-xs font-semibold text-white rounded px-2 py-1 truncate cursor-pointer transition-all pointer-events-auto ${heightClass} ${getSourceColor(rental.source)}`}
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                top: `${topOffset}%`,
                              }}
                              title={rental.guestName || getSourceLabel(rental.source)}
                            >
                              {rental.guestName || getSourceLabel(rental.source)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
