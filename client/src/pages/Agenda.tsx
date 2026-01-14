"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, Flag, Check, Trash2, Edit2 } from "lucide-react";
import { useLocation } from "wouter";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, isBefore, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const PRIORITY_COLORS = {
  LOW: "bg-blue-100 text-blue-800 border-blue-200",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-200",
  HIGH: "bg-red-100 text-red-800 border-red-200",
};

const PRIORITY_LABELS = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
};

const STATUS_LABELS = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em Andamento",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export default function Agenda() {
  const [, setLocation] = useLocation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null);

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
  });

  const { data: entities = [] } = trpc.entities.list.useQuery();
  const { data: tasks = [], refetch: refetchTasks } = trpc.tasks.list.useQuery();
  const utils = trpc.useUtils();

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

  const completeTask = trpc.tasks.complete.useMutation({
    onSuccess: () => {
      toast.success("Tarefa concluída!");
      refetchTasks();
    },
    onError: (error) => {
      toast.error("Erro ao concluir tarefa: " + error.message);
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
    });
  };

  const handleCreateTask = () => {
    if (!formData.title || !formData.dueDate) {
      toast.error("Preencha o título e a data");
      return;
    }

    createTask.mutate({
      title: formData.title,
      description: formData.description || undefined,
      dueDate: new Date(formData.dueDate),
      dueTime: formData.dueTime || undefined,
      endDate: formData.endDate ? new Date(formData.endDate) : undefined,
      endTime: formData.endTime || undefined,
      allDay: formData.allDay,
      priority: formData.priority,
      entityId: formData.entityId ? parseInt(formData.entityId) : undefined,
      color: formData.color || undefined,
    });
  };

  const handleUpdateTask = () => {
    if (!editingTask || !formData.title || !formData.dueDate) {
      toast.error("Preencha o título e a data");
      return;
    }

    updateTask.mutate({
      id: editingTask.id,
      title: formData.title,
      description: formData.description || null,
      dueDate: new Date(formData.dueDate),
      dueTime: formData.dueTime || null,
      endDate: formData.endDate ? new Date(formData.endDate) : null,
      endTime: formData.endTime || null,
      allDay: formData.allDay,
      priority: formData.priority,
      entityId: formData.entityId ? parseInt(formData.entityId) : null,
      color: formData.color || null,
    });
  };

  const openEditSheet = (task: any) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || "",
      dueDate: format(new Date(task.dueDate), "yyyy-MM-dd"),
      dueTime: task.dueTime || "",
      endDate: task.endDate ? format(new Date(task.endDate), "yyyy-MM-dd") : "",
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

  // Agrupar tarefas por data
  const tasksByDate = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    tasks.forEach((task) => {
      const dateKey = format(new Date(task.dueDate), "yyyy-MM-dd");
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(task);
    });
    return grouped;
  }, [tasks]);

  // Tarefas do dia selecionado
  const selectedDayTasks = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    return tasksByDate[dateKey] || [];
  }, [selectedDate, tasksByDate]);

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
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
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
            <h1 className="text-3xl font-bold text-gray-900">Agenda</h1>
            <p className="text-gray-600">Gerencie suas tarefas e compromissos</p>
          </div>
          <Button onClick={() => openCreateSheet()}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Tarefa
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendário */}
        <Card className="lg:col-span-2">
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
                <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Dias do mês */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const dayTasks = tasksByDate[dateKey] || [];
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isPast = isBefore(day, new Date()) && !isToday(day);

                return (
                  <div
                    key={dateKey}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      min-h-[80px] p-1 border rounded-lg cursor-pointer transition-colors
                      ${isCurrentMonth ? "bg-white" : "bg-gray-50"}
                      ${isSelected ? "ring-2 ring-blue-500 border-blue-500" : "border-gray-200"}
                      ${isPast && isCurrentMonth ? "opacity-60" : ""}
                      hover:border-blue-300
                    `}
                  >
                    <div className={`
                      text-sm font-medium mb-1
                      ${isToday(day) ? "bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center" : ""}
                      ${!isCurrentMonth ? "text-gray-400" : "text-gray-900"}
                    `}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map((task) => (
                        <div
                          key={task.id}
                          className={`
                            text-xs px-1 py-0.5 rounded truncate
                            ${task.status === "COMPLETED" ? "bg-green-100 text-green-800 line-through" : ""}
                            ${task.status !== "COMPLETED" && task.priority === "HIGH" ? "bg-red-100 text-red-800" : ""}
                            ${task.status !== "COMPLETED" && task.priority === "MEDIUM" ? "bg-yellow-100 text-yellow-800" : ""}
                            ${task.status !== "COMPLETED" && task.priority === "LOW" ? "bg-blue-100 text-blue-800" : ""}
                          `}
                          style={task.color ? { backgroundColor: task.color + "20", color: task.color } : {}}
                        >
                          {task.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-xs text-gray-500 px-1">
                          +{dayTasks.length - 3} mais
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tarefas do dia selecionado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedDate ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR }) : "Selecione um dia"}
            </CardTitle>
            <CardDescription>
              {selectedDayTasks.length} tarefa{selectedDayTasks.length !== 1 ? "s" : ""}
            </CardDescription>
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

            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {selectedDayTasks.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  {selectedDate ? "Nenhuma tarefa para este dia" : "Selecione um dia no calendário"}
                </p>
              ) : (
                selectedDayTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`
                      p-3 rounded-lg border
                      ${task.status === "COMPLETED" ? "bg-gray-50 border-gray-200" : "bg-white border-gray-200"}
                    `}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Checkbox
                            checked={task.status === "COMPLETED"}
                            onCheckedChange={() => {
                              if (task.status !== "COMPLETED") {
                                completeTask.mutate({ id: task.id });
                              }
                            }}
                          />
                          <span className={`font-medium text-sm ${task.status === "COMPLETED" ? "line-through text-gray-500" : ""}`}>
                            {task.title}
                          </span>
                        </div>
                        
                        {task.entityId && (
                          <Badge 
                            variant="outline" 
                            className="text-xs mb-1"
                            style={{ borderColor: getEntityColor(task.entityId), color: getEntityColor(task.entityId) }}
                          >
                            {getEntityName(task.entityId)}
                          </Badge>
                        )}

                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {task.dueTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {task.dueTime}
                            </span>
                          )}
                          <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS]}`}>
                            {PRIORITY_LABELS[task.priority as keyof typeof PRIORITY_LABELS]}
                          </Badge>
                        </div>

                        {task.description && (
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{task.description}</p>
                        )}
                      </div>

                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSheet(task)}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-red-600 hover:text-red-700"
                          onClick={() => {
                            setTaskToDelete(task.id);
                            setDeleteConfirmOpen(true);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sheet de Criar Tarefa */}
      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nova Tarefa</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>Título *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Digite o título da tarefa"
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição opcional"
                rows={3}
              />
            </div>

            <div>
              <Label>Entidade (opcional)</Label>
              <Select value={formData.entityId} onValueChange={(v) => setFormData({ ...formData, entityId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma entidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhuma</SelectItem>
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
                <Label>Data *</Label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={formData.dueTime}
                  onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
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
              <Label>Prioridade</Label>
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

            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleCreateTask} disabled={createTask.isPending}>
                {createTask.isPending ? "Salvando..." : "Criar Tarefa"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sheet de Editar Tarefa */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Editar Tarefa</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>Título *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Digite o título da tarefa"
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição opcional"
                rows={3}
              />
            </div>

            <div>
              <Label>Entidade (opcional)</Label>
              <Select value={formData.entityId} onValueChange={(v) => setFormData({ ...formData, entityId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma entidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhuma</SelectItem>
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
                <Label>Data *</Label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={formData.dueTime}
                  onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
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
              <Label>Prioridade</Label>
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

            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setIsEditOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleUpdateTask} disabled={updateTask.isPending}>
                {updateTask.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta tarefa? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => taskToDelete && deleteTask.mutate({ id: taskToDelete })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
