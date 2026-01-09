"use client";

import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ChevronLeft, ChevronRight, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, differenceInDays, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { RentalAttachmentUploader } from "@/components/RentalAttachmentUploader";

type RentalAttachment = {
  id: number;
  filename: string;
  blobUrl: string;
  fileSize: number;
  mimeType: string;
  type: "NOTA_FISCAL" | "DOCUMENTOS" | "BOLETO" | "COMPROVANTE_PAGAMENTO";
  createdAt: string;
};

export default function Rentals() {
  const params = useParams<{ entityId: string }>();
  const entityId = params?.entityId || "";
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRental, setEditingRental] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [openPopoverId, setOpenPopoverId] = useState(null);
  const [rentalAttachments, setRentalAttachments] = useState<RentalAttachment[]>([]);

  const [formData, setFormData] = useState({
    startDate: "",
    endDate: "",
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
    rentalId: null as number | null,
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
      startDate: "",
      endDate: "",
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
      rentalId: null,
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
      rentalId: rental.id,
    });
    // Load attachments for this rental
    if (rental.id) {
      // TODO: Fetch attachments from API
      setRentalAttachments([]);
    }
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

  // Função para calcular quantos dias a reserva ocupa
  const getRentalDaySpan = (rental, week) => {
    // Usar strings ISO para evitar problemas de timezone
    const startStr = rental.startDate.split('T')[0]; // YYYY-MM-DD
    const endStr = rental.endDate.split('T')[0]; // YYYY-MM-DD

    let startDayIndex = -1;
    let endDayIndex = -1;

    week.forEach((day, idx) => {
      const dayStr = format(day, 'yyyy-MM-dd');

      if (dayStr === startStr) {
        startDayIndex = idx;
      }
      if (dayStr === endStr) {
        endDayIndex = idx;
      }
    });

    if (startDayIndex === -1) {
      return 0; // Reserva não começa nesta semana
    }

    // Se a reserva termina nesta semana, calcular até o fim
    // Caso contrário, calcular até o fim da semana
    const endIdx = endDayIndex !== -1 ? endDayIndex : 6;
    return endIdx - startDayIndex + 1;
  }

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
        <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="bg-blue-600 hover:bg-blue-700">
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
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Cabeçalho com dias da semana */}
              <div className="grid grid-cols-7 gap-1">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => (
                  <div key={day} className="text-center font-semibold text-sm p-2 border rounded bg-muted">
                    {day}
                  </div>
                ))}
              </div>

              {/* Grid do calendário */}
              {weeks.map((week, weekIndex) => {
                // Obter reservas únicas que intersectam com esta semana
                const rentalsInWeek = [];
                const seenIds = new Set();
                
                rentals.forEach((rental) => {
                  if (seenIds.has(rental.id)) return;
                  
                  const start = new Date(rental.startDate);
                  start.setHours(0, 0, 0, 0);
                  const end = new Date(rental.endDate);
                  end.setHours(0, 0, 0, 0);
                  
                  // Verificar se a reserva intersecta com esta semana
                  const weekStart = new Date(week[0]);
                  weekStart.setHours(0, 0, 0, 0);
                  const weekEnd = new Date(week[6]);
                  weekEnd.setHours(0, 0, 0, 0);
                  
                  // A reserva intersecta se: start <= weekEnd E end > weekStart
                  const intersectsWeek = start <= weekEnd && end > weekStart;
                  
                  if (intersectsWeek) {
                    rentalsInWeek.push(rental);
                    seenIds.add(rental.id);
                  }
                });
                
                return (
                  <div key={weekIndex} className="relative">
                    {/* Células do calendário */}
                    <div className="grid grid-cols-7 gap-1">
                      {week.map((day, dayIndex) => {
                        const isCurrentMonth = isSameMonth(day, currentMonth);
                        
                        // Verificar se a data já passou
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const dayNormalized = new Date(day);
                        dayNormalized.setHours(0, 0, 0, 0);
                        const isPastDate = dayNormalized < today;

                        return (
                          <div
                            key={day.toISOString()}
                            className={`min-h-32 border rounded p-2 relative ${
                              isPastDate
                                ? "bg-gray-100 text-gray-400"
                                : isCurrentMonth
                                ? "bg-background"
                                : "bg-muted/30"
                            }`}
                          >
                            {/* Número do dia */}
                            <div className="text-sm font-semibold">{format(day, "d")}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Barras de reservas sobrepostas */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                      <div className="grid grid-cols-7 gap-1 h-full">
                        {rentals.map((rental, rentalIndex) => {
                          // Usar strings ISO para evitar problemas de timezone
                          const startStr = rental.startDate.split('T')[0]; // YYYY-MM-DD
                          const endStr = rental.endDate.split('T')[0]; // YYYY-MM-DD

                          // Verificar se a reserva intersecta com esta semana
                          let intersectsWeek = false;
                          const weekStartStr = format(week[0], 'yyyy-MM-dd');
                          const weekEndStr = format(week[6], 'yyyy-MM-dd');

                          // Verificar intersecção
                          if (!(endStr < weekStartStr || startStr > weekEndStr)) {
                            intersectsWeek = true;
                          }

                          if (!intersectsWeek) {
                            return null; // Reserva não intersecta com esta semana
                          }

                          // Calcular o índice de início e fim dentro desta semana
                          let segmentStart = 0;
                          let segmentEnd = 6;
                          let isSegmentStart = false;
                          let isSegmentEnd = false;

                          // Encontrar o índice de início
                          week.forEach((day, idx) => {
                            const dayStr = format(day, 'yyyy-MM-dd');
                            if (dayStr === startStr) {
                              segmentStart = idx;
                              isSegmentStart = true;
                            }
                          });

                          // Encontrar o índice de fim (endDate é inclusivo - último dia da estadia)
                          week.forEach((day, idx) => {
                            const dayStr = format(day, 'yyyy-MM-dd');
                            if (dayStr === endStr) {
                              // endStr é o dia de checkout (inclusivo) - a barra vai até este dia
                              segmentEnd = idx;
                              isSegmentEnd = true;
                            }
                          });

                          // Se a reserva começou antes desta semana
                          if (!isSegmentStart && startStr < weekStartStr) {
                            segmentStart = 0;
                          }

                          // Se a reserva termina depois desta semana
                          if (!isSegmentEnd && endStr > weekEndStr) {
                            segmentEnd = 6;
                          }

                          // Calcular span e posição
                          const daySpan = segmentEnd - segmentStart + 1;
                          const cellWidth = 100 / 7;
                          // gap-1 do Tailwind = 0.25rem ≈ 4px
                          // Em um container de ~1000px, isso é ~0.4% por gap
                          // Usamos 0.2% para ser mais conservador
                          const gapPercentage = 0.2;
                          let left = segmentStart * (cellWidth + gapPercentage);
                          let width = daySpan * cellWidth + (daySpan - 1) * gapPercentage;

                          // Aplicar divisão horizontal 50%/50% no check-in e checkout
                          const gapBetweenBars = 0.25;
                          
                          if (isSegmentStart && isSegmentEnd) {
                            // Reserva que começa E termina nesta semana
                            if (daySpan === 1) {
                              // Um único dia: ocupa 100%
                            } else {
                              // Mais de um dia: 50% no primeiro, 100% nos intermediários, 50% no último
                              const firstDayWidth = (cellWidth + gapPercentage) / 2 - gapBetweenBars / 2;
                              const lastDayWidth = (cellWidth + gapPercentage) / 2 - gapBetweenBars / 2;
                              const middleDaysWidth = (daySpan - 2) * cellWidth + (daySpan - 3) * gapPercentage;
                              left = segmentStart * (cellWidth + gapPercentage) + (cellWidth + gapPercentage) / 2 + gapBetweenBars / 2;
                              width = firstDayWidth + middleDaysWidth + lastDayWidth;
                            }
                          } else if (isSegmentStart && !isSegmentEnd) {
                            // Reserva que começa nesta semana mas não termina: 50% à direita no primeiro dia
                            const firstDayWidth = (cellWidth + gapPercentage) / 2 - gapBetweenBars / 2;
                            const restWidth = (daySpan - 1) * cellWidth + (daySpan - 2) * gapPercentage;
                            left = segmentStart * (cellWidth + gapPercentage) + (cellWidth + gapPercentage) / 2 + gapBetweenBars / 2;
                            width = firstDayWidth + restWidth;
                          } else if (!isSegmentStart && isSegmentEnd) {
                            // Reserva que termina nesta semana mas não começa: 50% à esquerda no último dia
                            width = (daySpan - 1) * cellWidth + (daySpan - 2) * gapPercentage + (cellWidth + gapPercentage) / 2 - gapBetweenBars / 2;
                          }

                          // Bordas arredondadas apenas nas extremidades
                          let borderRadius = "0px";
                          if (isSegmentStart && isSegmentEnd) {
                            borderRadius = "6px"; // Ambas as extremidades
                          } else if (isSegmentStart) {
                            borderRadius = "6px 0px 0px 6px"; // Apenas início
                          } else if (isSegmentEnd) {
                            borderRadius = "0px 6px 6px 0px"; // Apenas fim
                          }

                          const totalFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rental.totalAmount || 0);
                          const dailyFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rental.dailyRate || 0);
                          const extraFeeFormatted = rental.extraFeeAmount ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rental.extraFeeAmount) : 'N/A';

                          return (
                            <Popover key={`${rental.id}-bar-${weekIndex}-${rentalIndex}`} open={openPopoverId === rental.id} onOpenChange={(open) => setOpenPopoverId(open ? rental.id : null)}>
                              <PopoverTrigger asChild>
                                <button
                                  onClick={() => handleEdit(rental)}
                                  onMouseEnter={() => setOpenPopoverId(rental.id)}
                                  onMouseLeave={() => setOpenPopoverId(null)}
                                  className={`absolute text-sm md:text-base font-semibold text-white px-2 py-1 truncate cursor-pointer transition-all pointer-events-auto top-1/2 transform -translate-y-1/2 hover:opacity-80 ${getSourceColor(rental.source)}`}
                                  style={{
                                    left: `${left}%`,
                                    width: `${width}%`,
                                    borderRadius: borderRadius,
                                  }}
                                >
                                  {rental.guestName || getSourceLabel(rental.source)} - {totalFormatted}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="top" align="center" className="w-80 p-4 bg-white rounded-lg shadow-lg border border-gray-200 z-[9999]" onMouseEnter={() => setOpenPopoverId(rental.id)} onMouseLeave={() => setOpenPopoverId(null)}>
                                <div className="space-y-3">
                                  <div className="border-b pb-2">
                                    <h3 className="font-bold text-lg text-gray-900">{rental.guestName || 'Sem hóspede'}</h3>
                                    <p className="text-sm text-gray-600">{getSourceLabel(rental.source)}</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <p className="text-gray-600 font-medium">Entrada</p>
                                      <p className="text-gray-900">{new Date(rental.startDate).toLocaleDateString('pt-BR')}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-600 font-medium">Saída</p>
                                      <p className="text-gray-900">{new Date(rental.endDate).toLocaleDateString('pt-BR')}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-600 font-medium">Hóspedes</p>
                                      <p className="text-gray-900">{rental.numberOfGuests || 1}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-600 font-medium">Diária</p>
                                      <p className="text-gray-900">{dailyFormatted}</p>
                                    </div>
                                  </div>
                                  <div className="border-t pt-2">
                                    <div className="flex justify-between items-center">
                                      <span className="font-medium text-gray-900">Total</span>
                                      <span className="font-bold text-lg text-green-600">{totalFormatted}</span>
                                    </div>
                                    {rental.extraFeeAmount > 0 && (
                                      <div className="flex justify-between items-center text-sm mt-2 border-t pt-2">
                                        <span className="text-gray-600">{rental.extraFeeType === 'IMPOSTO' ? 'Imposto' : rental.extraFeeType === 'TAXA_PET' ? 'Taxa Pet' : rental.extraFeeType === 'LIMPEZA' ? 'Limpeza' : rental.extraFeeType || 'Taxa Extra'}</span>
                                        <span className="text-gray-900 font-medium">{extraFeeFormatted}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
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

      {/* Dialog de Criar Reserva */}
      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col p-0">
          {/* Header Fixo */}
          <div className="sticky top-0 z-10 border-b bg-white px-6 py-4 flex items-center justify-between">
            <SheetTitle className="text-2xl font-bold">Nova Reserva</SheetTitle>
            <button onClick={() => setIsCreateOpen(false)} className="text-gray-500 hover:text-gray-700">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Conteúdo Scrollável */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Data de Início *</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  min={format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Data de Fim *</Label>
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
              <div className="space-y-2">
                <Label className="font-semibold">Nome do Hóspede</Label>
                <Input
                  value={formData.guestName}
                  onChange={(e) => setFormData({ ...formData, guestName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Número de Hóspedes</Label>
                <Select value={formData.numberOfGuests.toString()} onValueChange={(value) => setFormData({ ...formData, numberOfGuests: parseInt(value) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 8 }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} hóspede{num > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Email</Label>
                <Input
                  type="email"
                  value={formData.guestEmail}
                  onChange={(e) => setFormData({ ...formData, guestEmail: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Telefone</Label>
                <Input
                  value={formData.guestPhone}
                  onChange={(e) => setFormData({ ...formData, guestPhone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Diária (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.dailyRate ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.dailyRate) : ''}
                  onChange={(e) => {
                    const numericValue = e.target.value.replace(/[^0-9]/g, '');
                    const floatValue = numericValue ? parseFloat(numericValue) / 100 : 0;
                    setFormData({ ...formData, dailyRate: floatValue });
                  }}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Total (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.totalAmount ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.totalAmount) : ''}
                  onChange={(e) => {
                    const numericValue = e.target.value.replace(/[^0-9]/g, '');
                    const floatValue = numericValue ? parseFloat(numericValue) / 100 : 0;
                    setFormData({ ...formData, totalAmount: floatValue });
                  }}
                  placeholder="R$ 0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Tipo de Taxa Extra</Label>
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
              <div className="space-y-2">
                <Label className="font-semibold">Valor da Taxa Extra (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.extraFeeAmount ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.extraFeeAmount) : ''}
                  onChange={(e) => {
                    const numericValue = e.target.value.replace(/[^0-9]/g, '');
                    const floatValue = numericValue ? parseFloat(numericValue) / 100 : 0;
                    setFormData({ ...formData, extraFeeAmount: floatValue });
                  }}
                  placeholder="R$ 0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Horário Check-in</Label>
                <Input
                  type="time"
                  value={formData.checkInTime}
                  onChange={(e) => setFormData({ ...formData, checkInTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Horário Check-out</Label>
                <Input
                  type="time"
                  value={formData.checkOutTime}
                  onChange={(e) => setFormData({ ...formData, checkOutTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="font-semibold">Data de Competência</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, competencyDate: "CHECK_IN" })}
                  className={`px-4 py-2 rounded-l-md border transition-colors ${
                    formData.competencyDate === "CHECK_IN"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Check-in
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, competencyDate: "CHECK_OUT" })}
                  className={`px-4 py-2 rounded-r-md border-t border-b border-r transition-colors ${
                    formData.competencyDate === "CHECK_OUT"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Check-out
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Documentos</Label>
              <RentalAttachmentUploader
                rentalId={undefined}
                attachments={rentalAttachments}
                onUpload={async (file, type) => {
                  // TODO: Implement upload
                  console.log("Upload:", file, type);
                }}
                onDelete={async (id) => {
                  // TODO: Implement delete
                  console.log("Delete:", id);
                }}
                onUpdateType={async (id, type) => {
                  // TODO: Implement update type
                  console.log("Update type:", id, type);
                }}
                onPreview={(attachment) => {
                  window.open(attachment.blobUrl, "_blank");
                }}
              />
            </div>
          </div>

          {/* Footer Fixo */}
          <div className="sticky bottom-0 z-10 border-t bg-white px-6 py-4 flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700">
              Criar Reserva
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sheet de Editar Reserva */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col p-0">
          {/* Header Fixo */}
          <div className="sticky top-0 z-10 border-b bg-white px-6 py-4 flex items-center justify-between">
            <SheetTitle className="text-2xl font-bold">Editar Reserva</SheetTitle>
            <button onClick={() => setIsEditOpen(false)} className="text-gray-500 hover:text-gray-700">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Conteúdo Scrollável */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Data de Início *</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  min={format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Data de Fim *</Label>
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
              <div className="space-y-2">
                <Label className="font-semibold">Nome do Hóspede</Label>
                <Input
                  value={formData.guestName}
                  onChange={(e) => setFormData({ ...formData, guestName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Número de Hóspedes</Label>
                <Select value={formData.numberOfGuests.toString()} onValueChange={(value) => setFormData({ ...formData, numberOfGuests: parseInt(value) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 8 }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} hóspede{num > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Email</Label>
                <Input
                  type="email"
                  value={formData.guestEmail}
                  onChange={(e) => setFormData({ ...formData, guestEmail: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Telefone</Label>
                <Input
                  value={formData.guestPhone}
                  onChange={(e) => setFormData({ ...formData, guestPhone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Diária (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.dailyRate ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.dailyRate) : ''}
                  onChange={(e) => {
                    const numericValue = e.target.value.replace(/[^0-9]/g, '');
                    const floatValue = numericValue ? parseFloat(numericValue) / 100 : 0;
                    setFormData({ ...formData, dailyRate: floatValue });
                  }}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Total (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.totalAmount ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.totalAmount) : ''}
                  onChange={(e) => {
                    const numericValue = e.target.value.replace(/[^0-9]/g, '');
                    const floatValue = numericValue ? parseFloat(numericValue) / 100 : 0;
                    setFormData({ ...formData, totalAmount: floatValue });
                  }}
                  placeholder="R$ 0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Tipo de Taxa Extra</Label>
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
              <div className="space-y-2">
                <Label className="font-semibold">Valor da Taxa Extra (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.extraFeeAmount ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.extraFeeAmount) : ''}
                  onChange={(e) => {
                    const numericValue = e.target.value.replace(/[^0-9]/g, '');
                    const floatValue = numericValue ? parseFloat(numericValue) / 100 : 0;
                    setFormData({ ...formData, extraFeeAmount: floatValue });
                  }}
                  placeholder="R$ 0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Horário Check-in</Label>
                <Input
                  type="time"
                  value={formData.checkInTime}
                  onChange={(e) => setFormData({ ...formData, checkInTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Horário Check-out</Label>
                <Input
                  type="time"
                  value={formData.checkOutTime}
                  onChange={(e) => setFormData({ ...formData, checkOutTime: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Data de Competência</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFormData({ ...formData, competencyDate: "CHECK_IN" })}
                  className={`px-4 py-2 rounded font-medium transition-colors ${
                    formData.competencyDate === "CHECK_IN"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Check-in
                </button>
                <button
                  onClick={() => setFormData({ ...formData, competencyDate: "CHECK_OUT" })}
                  className={`px-4 py-2 rounded font-medium transition-colors ${
                    formData.competencyDate === "CHECK_OUT"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Check-out
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Documentos</Label>
              <RentalAttachmentUploader
                rentalId={undefined}
                attachments={rentalAttachments}
                onUpload={async (file, type) => {
                  // TODO: Implement upload
                  console.log("Upload:", file, type);
                }}
                onDelete={async (id) => {
                  // TODO: Implement delete
                  console.log("Delete:", id);
                }}
                onUpdateType={async (id, type) => {
                  // TODO: Implement update type
                  console.log("Update type:", id, type);
                }}
                onPreview={(attachment) => {
                  window.open(attachment.blobUrl, "_blank");
                }}
              />
            </div>
          </div>

          {/* Footer Fixo */}
          <div className="sticky bottom-0 z-10 border-t bg-white px-6 py-4 flex gap-2 justify-end">
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
        </SheetContent>
      </Sheet>
    </div>
  );
}
