import { trpc } from "@/lib/trpc";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, Plus, Check, Trash2, Edit2, X } from "lucide-react";
import { useLocation } from "wouter";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, isBefore, startOfWeek, endOfWeek, parseISO, addDays, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const PRIORITY_COLORS = {
  LOW: "bg-blue-500",
  MEDIUM: "bg-yellow-500",
  HIGH: "bg-red-500",
};

const PRIORITY_BADGE_COLORS = {
  LOW: "bg-blue-100 text-blue-800 border-blue-200",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-200",
  HIGH: "bg-red-100 text-red-800 border-red-200",
};

const PRIORITY_LABELS = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
};

export default function Agenda() {
  const [, setLocation] = useLocation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null);
  const [taskToDeleteIsRecurring, setTaskToDeleteIsRecurring] = useState(false);
  const [deleteAllRecurring, setDeleteAllRecurring] = useState(false);
  const [updateAllRecurring, setUpdateAllRecurring] = useState(false);
  const [showUpdateAllDialog, setShowUpdateAllDialog] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    dueDate: "",
    dueTime: "",
    endDate: "",
    endTime: "",
    allDay: true,
    priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH",
    entityId: "" as string,
    color: "",
    isRecurring: false,
    recurrenceCount: "1",
    recurrenceFrequency: "MONTH" as "DAY" | "WEEK" | "MONTH" | "YEAR",
  });

  const { data: entities = [] } = trpc.entities.list.useQuery();
  const { data: tasks = [], refetch: refetchTasks } = trpc.tasks.list.useQuery();

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Tarefa criada com sucesso!");
      setIsCreateOpen(false);
      resetForm();
      refetchTasks();
    },
    onError: (error) => {
      toast.error("Erro ao criar tarefa: " + error.message);
    },
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("Tarefa atualizada com sucesso!");
      setIsEditOpen(false);
      setEditingTask(null);
      resetForm();
      refetchTasks();
    },
    onError: (error) => {
      toast.error("Erro ao atualizar tarefa: " + error.message);
    },
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      toast.success("Tarefa excluída com sucesso!");
      setDeleteConfirmOpen(false);
      setTaskToDelete(null);
      refetchTasks();
    },
    onError: (error) => {
      toast.error("Erro ao excluir tarefa: " + error.message);
    },
  });

  const toggleComplete = trpc.tasks.toggleComplete.useMutation({
    onSuccess: () => {
      refetchTasks();
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      dueDate: "",
      dueTime: "",
      endDate: "",
      endTime: "",
      allDay: true,
      priority: "MEDIUM",
      entityId: "",
      color: "",
      isRecurring: false,
      recurrenceCount: "1",
      recurrenceFrequency: "MONTH",
    });
  };

  // Função para converter data para Date object
  const toDate = (dateValue: string | Date): Date => {
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'string') return parseISO(dateValue);
    return new Date(dateValue);
  };

  // Função para converter data ISO para string local (corrige timezone)
  const formatDateToLocal = (dateValue: string | Date) => {
    const date = toDate(dateValue);
    return format(date, "yyyy-MM-dd");
  };

  const handleCreateTask = () => {
    if (!formData.title || !formData.dueDate) {
      toast.error("Preencha o título e a data de início");
      return;
    }

    // Criar data com timezone correto (meio-dia para evitar problemas de timezone)
    const dueDateParts = formData.dueDate.split('-');
    const dueDate = new Date(parseInt(dueDateParts[0]), parseInt(dueDateParts[1]) - 1, parseInt(dueDateParts[2]), 12, 0, 0);
    
    let endDate = undefined;
    if (formData.endDate) {
      const endDateParts = formData.endDate.split('-');
      endDate = new Date(parseInt(endDateParts[0]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[2]), 12, 0, 0);
    }

    createTask.mutate({
      title: formData.title,
      description: formData.description || undefined,
      dueDate: dueDate,
      dueTime: formData.dueTime || undefined,
      endDate: endDate,
      endTime: formData.endTime || undefined,
      allDay: formData.allDay,
      priority: formData.priority,
      entityId: formData.entityId && formData.entityId !== "none" ? parseInt(formData.entityId) : undefined,
      color: formData.color || undefined,
      isRecurring: formData.isRecurring,
      recurrenceCount: formData.isRecurring ? parseInt(formData.recurrenceCount) : undefined,
      recurrenceFrequency: formData.isRecurring ? formData.recurrenceFrequency : undefined,
    });
  };

  const handleUpdateTask = () => {
    if (!editingTask || !formData.title || !formData.dueDate) {
      toast.error("Preencha o título e a data de início");
      return;
    }

    // Se a tarefa é recorrente, mostrar dialog de confirmação
    if (editingTask.isRecurring || editingTask.parentTaskId) {
      setShowUpdateAllDialog(true);
      return;
    }

    // Se não é recorrente, atualizar diretamente
    performUpdate(false);
  };

  const performUpdate = (updateAll: boolean) => {
    if (!editingTask || !formData.title || !formData.dueDate) return;

    // Criar data com timezone correto
    const dueDateParts = formData.dueDate.split('-');
    const dueDate = new Date(parseInt(dueDateParts[0]), parseInt(dueDateParts[1]) - 1, parseInt(dueDateParts[2]), 12, 0, 0);
    
    let endDate = null;
    if (formData.endDate) {
      const endDateParts = formData.endDate.split('-');
      endDate = new Date(parseInt(endDateParts[0]), parseInt(endDateParts[1]) - 1, parseInt(endDateParts[2]), 12, 0, 0);
    }

    updateTask.mutate({
      id: editingTask.id,
      title: formData.title,
      description: formData.description || null,
      dueDate: dueDate,
      dueTime: formData.dueTime || null,
      endDate: endDate,
      endTime: formData.endTime || null,
      allDay: formData.allDay,
      priority: formData.priority,
      entityId: formData.entityId && formData.entityId !== "none" ? parseInt(formData.entityId) : null,
      color: formData.color || null,
      updateAll: updateAll,
    });
    
    setShowUpdateAllDialog(false);
    setUpdateAllRecurring(false);
  };

  const openEditSheet = (task: any) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || "",
      dueDate: formatDateToLocal(task.dueDate),
      dueTime: task.dueTime || "",
      endDate: task.endDate ? formatDateToLocal(task.endDate) : "",
      endTime: task.endTime || "",
      allDay: task.allDay,
      priority: task.priority,
      entityId: task.entityId?.toString() || "",
      color: task.color || "",
    });
    setIsEditOpen(true);
  };

  const openCreateSheet = (date?: Date) => {
    resetForm();
    if (date) {
      setFormData(prev => ({
        ...prev,
        dueDate: format(date, "yyyy-MM-dd"),
      }));
    }
    setIsCreateOpen(true);
  };

  // Gerar dias do calendário
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Processar tarefas para exibição no calendário (incluindo barras contínuas)
  const processedTasks = useMemo(() => {
    const tasksWithDates = tasks.map(task => {
      const startDate = toDate(task.dueDate);
      const endDate = task.endDate ? toDate(task.endDate) : startDate;
      const duration = differenceInDays(endDate, startDate) + 1;
      
      return {
        ...task,
        startDate,
        endDate,
        duration,
      };
    });

    // Ordenar tarefas por data de início e duração (tarefas mais longas primeiro)
    tasksWithDates.sort((a, b) => {
      const startDiff = a.startDate.getTime() - b.startDate.getTime();
      if (startDiff !== 0) return startDiff;
      return b.duration - a.duration; // Tarefas mais longas primeiro
    });

    // Calcular linha (row) para cada tarefa para evitar sobreposição
    const taskRows: Map<number, number> = new Map();
    const occupiedRows: { endDate: Date; row: number }[] = [];

    tasksWithDates.forEach(task => {
      // Encontrar a primeira linha disponível
      let row = 0;
      const taskStartTime = task.startDate.getTime();
      
      // Verificar quais linhas estão ocupadas neste período
      const occupiedRowNumbers = occupiedRows
        .filter(or => or.endDate.getTime() >= taskStartTime)
        .map(or => or.row);
      
      // Encontrar a primeira linha livre
      while (occupiedRowNumbers.includes(row)) {
        row++;
      }
      
      taskRows.set(task.id, row);
      occupiedRows.push({ endDate: task.endDate, row });
    });

    // Adicionar row a cada tarefa
    return tasksWithDates.map(task => ({
      ...task,
      row: taskRows.get(task.id) || 0,
    }));
  }, [tasks]);

  // Verificar se uma tarefa deve aparecer em um dia específico
  const getTasksForDay = (day: Date) => {
    return processedTasks.filter(task => {
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const taskStart = new Date(task.startDate.getFullYear(), task.startDate.getMonth(), task.startDate.getDate());
      const taskEnd = new Date(task.endDate.getFullYear(), task.endDate.getMonth(), task.endDate.getDate());
      
      return dayStart >= taskStart && dayStart <= taskEnd;
    }).sort((a, b) => a.row - b.row); // Ordenar por linha para manter posição consistente
  };

  // Verificar se é o primeiro dia de uma tarefa
  const isTaskStart = (task: any, day: Date) => {
    return isSameDay(task.startDate, day);
  };

  // Verificar se é o último dia de uma tarefa
  const isTaskEnd = (task: any, day: Date) => {
    return isSameDay(task.endDate, day);
  };

  // Calcular quantos dias a tarefa continua a partir deste dia na semana atual
  const getTaskSpanInWeek = (task: any, day: Date) => {
    const dayOfWeek = day.getDay();
    const daysUntilEndOfWeek = 6 - dayOfWeek;
    const daysUntilTaskEnd = differenceInDays(task.endDate, day);
    return Math.min(daysUntilEndOfWeek, daysUntilTaskEnd) + 1;
  };

  // Tarefas do dia selecionado
  const selectedDayTasks = useMemo(() => {
    if (!selectedDate) return [];
    return getTasksForDay(selectedDate);
  }, [selectedDate, processedTasks]);

  const getEntityName = (entityId: number | null) => {
    if (!entityId) return null;
    const entity = entities.find(e => e.id === entityId);
    return entity?.name || null;
  };

  const getEntityColor = (entityId: number | null) => {
    if (!entityId) return "#6B7280";
    const entity = entities.find(e => e.id === entityId);
    return entity?.color || "#6B7280";
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      {/* Header */}
      <div className="mb-4">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="mb-2"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Agenda</h1>
            <p className="text-gray-600 dark:text-gray-400">Gerencie suas tarefas e compromissos</p>
          </div>
          <Button onClick={() => openCreateSheet()}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Calendário - Largura total */}
      <Card className="mb-6">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
                Hoje
              </Button>
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Dias da semana */}
          <div className="grid grid-cols-7 mb-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
              <div key={day} className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Dias do mês */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700">
            {calendarDays.map((day, index) => {
              const dayTasks = getTasksForDay(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isPast = isBefore(day, new Date()) && !isToday(day);

              return (
                <div
                  key={index}
                  onClick={() => setSelectedDate(day)}
                  className={`
                    min-h-[100px] p-1 cursor-pointer transition-colors bg-white dark:bg-gray-800
                    ${!isCurrentMonth ? "bg-gray-50 dark:bg-gray-700" : ""}
                    ${isSelected ? "ring-2 ring-blue-500 ring-inset" : ""}
                    ${isToday(day) ? "bg-blue-50 dark:bg-blue-900/30" : ""}
                    hover:bg-gray-100 dark:hover:bg-gray-700
                  `}
                >
                  <div className={`
                    text-sm font-medium mb-1
                    ${!isCurrentMonth ? "text-gray-400" : ""}
                    ${isPast && isCurrentMonth ? "text-gray-400" : ""}
                    ${isToday(day) ? "text-blue-600 font-bold" : ""}
                  `}>
                    {format(day, "d")}
                  </div>
                  
                  {/* Tarefas do dia */}
                  <div className="overflow-visible relative" style={{ minHeight: `${Math.max(dayTasks.length, 1) * 22 + 4}px` }}>
                    {dayTasks.map((task) => {
                      const isStart = isTaskStart(task, day);
                      const isEnd = isTaskEnd(task, day);
                      const dayOfWeek = day.getDay();
                      
                      // Só renderiza a barra se for o início da tarefa ou início de uma nova semana
                      const shouldRenderBar = isStart || dayOfWeek === 0;
                      
                      // Se não deve renderizar a barra (dia do meio), não renderiza nada
                      if (!shouldRenderBar) {
                        return null;
                      }
                      
                      // Calcular span
                      const span = getTaskSpanInWeek(task, day);
                      
                      return (
                        <div
                          key={task.id}
                          className={`
                            text-xs px-1 py-0.5 truncate text-white h-5 absolute left-0
                            ${PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS]}
                            ${isStart ? "rounded-l" : ""}
                            ${isEnd || (dayOfWeek + span - 1 >= 6) ? "rounded-r" : ""}
                            ${task.status === "COMPLETED" ? "opacity-50 line-through" : ""}
                          `}
                          style={{
                            width: span > 1 ? `calc(${span * 100}% + ${(span - 1) * 1}px)` : "calc(100% - 4px)",
                            top: `${task.row * 22}px`,
                            zIndex: 10,
                          }}
                          title={`${task.title}${task.duration > 1 ? ` (${format(task.startDate, "dd/MM")} - ${format(task.endDate, "dd/MM")})` : ""}`}
                        >
                          {task.title}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Painel de Tarefas do Dia Selecionado - Abaixo do calendário */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {selectedDate ? format(selectedDate, "d 'de' MMMM", { locale: ptBR }) : "Selecione um dia"}
            </CardTitle>
            {selectedDate && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {selectedDayTasks.length} {selectedDayTasks.length === 1 ? "tarefa" : "tarefas"}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {selectedDate && (
            <Button
              variant="outline"
              className="w-full mb-4"
              onClick={() => openCreateSheet(selectedDate)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar tarefa
            </Button>
          )}
          
          {selectedDayTasks.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">Nenhuma tarefa para este dia</p>
          ) : (
            <div className="space-y-3">
              {selectedDayTasks.map((task) => (
                <div
                  key={task.id}
                  className={`p-3 rounded-lg border dark:border-gray-700 ${task.status === "COMPLETED" ? "bg-gray-50 dark:bg-gray-700 opacity-70" : "bg-white dark:bg-gray-800"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      <Checkbox
                        checked={task.status === "COMPLETED"}
                        onCheckedChange={() => toggleComplete.mutate({ id: task.id })}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${task.status === "COMPLETED" ? "line-through text-gray-500" : ""}`}>
                          {task.title}
                        </p>
                        {task.entityId && (
                          <Badge 
                            variant="outline" 
                            className="mt-1 text-xs"
                            style={{ 
                              borderColor: getEntityColor(task.entityId),
                              color: getEntityColor(task.entityId)
                            }}
                          >
                            {getEntityName(task.entityId)}
                          </Badge>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge className={PRIORITY_BADGE_COLORS[task.priority as keyof typeof PRIORITY_BADGE_COLORS]}>
                            {PRIORITY_LABELS[task.priority as keyof typeof PRIORITY_LABELS]}
                          </Badge>
                          {task.endDate && task.endDate !== task.dueDate && (
                            <Badge variant="secondary" className="text-xs">
                              {format(task.startDate, "dd/MM")} - {format(task.endDate, "dd/MM")}
                            </Badge>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{task.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditSheet(task)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => {
                          setTaskToDelete(task.id);
                          setTaskToDeleteIsRecurring(task.isRecurring || !!task.parentTaskId);
                          setDeleteConfirmOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sheet de Criar Tarefa - Estilo igual aos demais */}
      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col p-0">
          {/* Header Fixo */}
          <div className="sticky top-0 z-10 border dark:border-gray-700-b bg-white dark:bg-gray-800 px-6 py-4 flex items-center justify-between">
            <SheetTitle className="text-xl font-bold">Nova Tarefa</SheetTitle>
            <Button variant="ghost" size="icon" onClick={() => setIsCreateOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Conteúdo com scroll */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Título *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Digite o título da tarefa"
                />
              </div>

              <div>
                <Label className="mb-2 block">Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição opcional"
                  rows={3}
                />
              </div>

              <div>
                <Label className="mb-2 block">Entidade (opcional)</Label>
                <Select value={formData.entityId || undefined} onValueChange={(v) => setFormData({ ...formData, entityId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma entidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {entities.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id.toString()}>
                        {entity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Data de Início *</Label>
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Data de Término</Label>
                  <Input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    min={formData.dueDate}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Horário Início</Label>
                  <Input
                    type="time"
                    value={formData.dueTime}
                    onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                    disabled={formData.allDay}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Horário Término</Label>
                  <Input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    disabled={formData.allDay}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allDay"
                  checked={formData.allDay}
                  onCheckedChange={(checked) => setFormData({ ...formData, allDay: !!checked })}
                />
                <label htmlFor="allDay" className="text-sm">Dia inteiro</label>
              </div>

              <div>
                <Label className="mb-2 block">Prioridade</Label>
                <Select value={formData.priority} onValueChange={(v: any) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Baixa</SelectItem>
                    <SelectItem value="MEDIUM">Média</SelectItem>
                    <SelectItem value="HIGH">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="recurring-create"
                  checked={formData.isRecurring}
                  onCheckedChange={(checked) => setFormData({ ...formData, isRecurring: !!checked })}
                />
                <Label htmlFor="recurring-create" className="cursor-pointer">Tarefa recorrente</Label>
              </div>

              {formData.isRecurring && (
                <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="recurrenceCount" className="mb-2 block">Repetir por</Label>
                      <Input
                        id="recurrenceCount"
                        type="number"
                        min="1"
                        value={formData.recurrenceCount}
                        onChange={(e) => setFormData({ ...formData, recurrenceCount: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="recurrenceFrequency" className="mb-2 block">Frequência</Label>
                      <Select
                        value={formData.recurrenceFrequency}
                        onValueChange={(value: "DAY" | "WEEK" | "MONTH" | "YEAR") => setFormData({ ...formData, recurrenceFrequency: value })}
                      >
                        <SelectTrigger id="recurrenceFrequency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DAY">Dia(s)</SelectItem>
                          <SelectItem value="WEEK">Semana(s)</SelectItem>
                          <SelectItem value="MONTH">Mês(es)</SelectItem>
                          <SelectItem value="YEAR">Ano(s)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Footer Fixo */}
          <div className="sticky bottom-0 z-10 border dark:border-gray-700-t bg-white dark:bg-gray-800 px-6 py-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleCreateTask} disabled={createTask.isPending}>
              {createTask.isPending ? "Salvando..." : "Criar Tarefa"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sheet de Editar Tarefa - Estilo igual aos demais */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent side="right" className="w-full sm:w-[600px] flex flex-col p-0">
          {/* Header Fixo */}
          <div className="sticky top-0 z-10 border dark:border-gray-700-b bg-white dark:bg-gray-800 px-6 py-4 flex items-center justify-between">
            <SheetTitle className="text-xl font-bold">Editar Tarefa</SheetTitle>
            <Button variant="ghost" size="icon" onClick={() => setIsEditOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Conteúdo com scroll */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Título *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Digite o título da tarefa"
                />
              </div>

              <div>
                <Label className="mb-2 block">Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição opcional"
                  rows={3}
                />
              </div>

              <div>
                <Label className="mb-2 block">Entidade (opcional)</Label>
                <Select value={formData.entityId || undefined} onValueChange={(v) => setFormData({ ...formData, entityId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma entidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {entities.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id.toString()}>
                        {entity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Data de Início *</Label>
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Data de Término</Label>
                  <Input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    min={formData.dueDate}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Horário Início</Label>
                  <Input
                    type="time"
                    value={formData.dueTime}
                    onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                    disabled={formData.allDay}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Horário Término</Label>
                  <Input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    disabled={formData.allDay}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allDayEdit"
                  checked={formData.allDay}
                  onCheckedChange={(checked) => setFormData({ ...formData, allDay: !!checked })}
                />
                <label htmlFor="allDayEdit" className="text-sm">Dia inteiro</label>
              </div>

              <div>
                <Label className="mb-2 block">Prioridade</Label>
                <Select value={formData.priority} onValueChange={(v: any) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Baixa</SelectItem>
                    <SelectItem value="MEDIUM">Média</SelectItem>
                    <SelectItem value="HIGH">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Footer Fixo */}
          <div className="sticky bottom-0 z-10 border dark:border-gray-700-t bg-white dark:bg-gray-800 px-6 py-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (editingTask) {
                  setTaskToDelete(editingTask.id);
                  setTaskToDeleteIsRecurring(editingTask.isRecurring || !!editingTask.parentTaskId);
                  setDeleteConfirmOpen(true);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button className="flex-1" onClick={handleUpdateTask} disabled={updateTask.isPending}>
              {updateTask.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={(open) => {
        setDeleteConfirmOpen(open);
        if (!open) {
          setDeleteAllRecurring(false);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A tarefa será permanentemente removida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {taskToDeleteIsRecurring && (
            <div className="flex items-center space-x-2 px-6 py-2">
              <Checkbox
                id="deleteAllRecurring"
                checked={deleteAllRecurring}
                onCheckedChange={(checked) => setDeleteAllRecurring(!!checked)}
              />
              <Label htmlFor="deleteAllRecurring" className="cursor-pointer text-sm">
                Excluir todas as tarefas recorrentes relacionadas
              </Label>
            </div>
          )}
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (taskToDelete) {
                  deleteTask.mutate({ id: taskToDelete, deleteAll: deleteAllRecurring });
                  setIsEditOpen(false);
                  setDeleteAllRecurring(false);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Confirmação de Atualização de Recorrentes */}
      <AlertDialog open={showUpdateAllDialog} onOpenChange={(open) => {
        setShowUpdateAllDialog(open);
        if (!open) {
          setUpdateAllRecurring(false);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atualizar tarefa recorrente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta tarefa faz parte de uma série de tarefas recorrentes. Deseja aplicar as alterações para todas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="flex items-center space-x-2 px-6 py-2">
            <Checkbox
              id="updateAllRecurring"
              checked={updateAllRecurring}
              onCheckedChange={(checked) => setUpdateAllRecurring(!!checked)}
            />
            <Label htmlFor="updateAllRecurring" className="cursor-pointer text-sm">
              Aplicar alterações para todas as tarefas recorrentes relacionadas
            </Label>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                performUpdate(updateAllRecurring);
              }}
            >
              Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
