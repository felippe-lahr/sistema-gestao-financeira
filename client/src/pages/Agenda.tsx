import { trpc } from "@/lib/trpc";

import { useState, useMemo, useEffect, useRef } from "react";
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
import { ChevronLeft, ChevronRight, Plus, Check, Trash2, Edit2, X, Calendar, RefreshCw, CheckCircle2, MoreVertical, CalendarDays, ListChecks } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/useMobile";
import { useLocation } from "wouter";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, isBefore, startOfWeek, endOfWeek, parseISO, addDays, subDays, differenceInDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors, pointerWithin, type DragEndEvent, type DragStartEvent, type DragOverEvent } from "@dnd-kit/core";

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

// Mesmas cores de PRIORITY_COLORS, em hex (para bordas/realces inline)
const PRIORITY_HEX: Record<string, string> = {
  LOW: "#3B82F6",
  MEDIUM: "#EAB308",
  HIGH: "#EF4444",
};

type AgendaView = "day" | "week" | "month";
const VIEW_STORAGE_KEY = "agenda-view";

/** Linha de tarefa da visão Dia / lista do dia: horário, cor, título e meta. */
function DayTaskRow({
  task,
  entityName,
  entityColor,
  onOpen,
  onToggle,
}: {
  task: any;
  entityName: string | null;
  entityColor: string;
  onOpen: (t: any) => void;
  onToggle: (t: any) => void;
}) {
  const done = task.status === "COMPLETED";
  const cp = getChecklistProgress(task);
  const accent = task.color || PRIORITY_HEX[task.priority] || "#9CA3AF";
  const multiDay = task.duration > 1;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(task); }}
      className={`flex items-stretch gap-3 rounded-2xl border border-[#ECECEF] dark:border-[#2C2C3C] bg-white dark:bg-[#1C1C24] px-3 py-3 transition-colors active:bg-[#F6F6F8] dark:active:bg-[#252532] cursor-pointer ${done ? "opacity-60" : ""}`}
    >
      <div className="w-[52px] shrink-0 pt-0.5 text-right">
        {task.allDay || !task.dueTime ? (
          <span className="whitespace-nowrap text-[12px] font-medium leading-5 text-[#8A8A92]">Dia todo</span>
        ) : (
          <>
            <span className="block text-[15px] font-semibold tabular-nums leading-5 text-[#16161A] dark:text-gray-100">{task.dueTime}</span>
            {task.endTime && <span className="block text-[12px] tabular-nums text-[#8A8A92]">{task.endTime}</span>}
          </>
        )}
      </div>
      <div className="w-1 shrink-0 rounded-full" style={{ background: accent }} />
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] font-semibold leading-5 text-[#16161A] dark:text-gray-100 ${done ? "line-through" : ""}`}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#6B6B75] dark:text-gray-400">
          {entityName && (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entityColor }} />
              <span className="truncate">{entityName}</span>
            </span>
          )}
          {cp && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3.5 w-3.5" />{cp.done}/{cp.total}
            </span>
          )}
          {multiDay && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {format(task.startDate, "dd/MM")} – {format(task.endDate, "dd/MM")}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
        onClick={(e) => { e.stopPropagation(); onToggle(task); }}
        className="-my-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full"
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${done ? "border-[#1a6b45] bg-[#1a6b45] text-white" : "border-[#C9C9CF] dark:border-[#4A4A58]"}`}
        >
          {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
      </button>
    </div>
  );
}

// Progresso do checklist de uma tarefa (ou null se não houver itens)
function getChecklistProgress(task: any): { done: number; total: number } | null {
  try {
    const cl = task?.checklist ? JSON.parse(task.checklist) : [];
    if (Array.isArray(cl) && cl.length > 0) {
      return { done: cl.filter((i: any) => i.done).length, total: cl.length };
    }
  } catch { /* ignore */ }
  return null;
}

// Barra de tarefa (contínua, pode ocupar vários dias) na visão semanal
function TaskBar({ item, onOpen }: { item: any; onOpen: (t: any) => void }) {
  const task = item.task;
  const cp = getChecklistProgress(task);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { taskId: task.id },
  });
  const done = task.status === "COMPLETED";
  const bg = task.color || undefined;
  const priorityClass = (PRIORITY_COLORS as any)[task.priority] || "bg-gray-400";
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(task)}
      style={{
        gridColumn: `${item.startCol + 1} / span ${item.span}`,
        gridRow: item.row + 1,
        ...(bg ? { backgroundColor: bg } : {}),
      }}
      title={task.title}
      className={`pointer-events-auto self-start text-left rounded-md px-2 py-1 text-xs font-medium truncate text-white touch-none cursor-grab active:cursor-grabbing ${bg ? "" : priorityClass} ${isDragging ? "opacity-40" : ""} ${done ? "opacity-60 line-through" : ""} ${item.clipLeft ? "rounded-l-none" : ""} ${item.clipRight ? "rounded-r-none" : ""}`}
    >
      {cp ? `☑ ${cp.done}/${cp.total} ` : ""}{task.title}{!task.allDay && task.dueTime ? ` · ${task.dueTime}` : ""}
    </button>
  );
}

// Coluna de um dia (área de soltar) na visão semanal
function WeekDropColumn({ day, barsHeight, onCreate }: { day: Date; barsHeight: number; onCreate: (d: Date) => void }) {
  const dayKey = format(day, "yyyy-MM-dd");
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayKey}`, data: { day: dayKey } });
  const today = isToday(day);
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border min-h-[340px] transition-colors ${isOver ? "bg-blue-50 dark:bg-blue-900/20 border-blue-400" : today ? "bg-blue-50/40 dark:bg-blue-900/10 border-transparent" : "bg-gray-50/50 dark:bg-gray-800/30 border-transparent"}`}
      style={{ paddingTop: barsHeight }}
    >
      <button
        onClick={() => onCreate(day)}
        className="w-full text-[11px] text-gray-400 hover:text-blue-600 py-1 transition-colors"
      >
        + Adicionar
      </button>
    </div>
  );
}

// Mantém o draggable da tarefa arrastada montado mesmo quando ela sai da
// semana visível (ao navegar durante o arraste). Sem isso, o dnd-kit cancela
// o arraste quando o elemento de origem desmonta, e o drop não é aplicado.
function KeepAliveDraggable({ taskId }: { taskId: number }) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `task-${taskId}`, data: { taskId } });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-hidden
      style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none", overflow: "hidden" }}
    />
  );
}

// Zona lateral: ao arrastar sobre ela, navega para a semana anterior/próxima
function EdgeDropZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center w-7 flex-shrink-0 rounded-md border border-dashed transition-colors ${isOver ? "bg-blue-100 dark:bg-blue-900/40 border-blue-400 text-blue-600" : "border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600"}`}
    >
      {children}
    </div>
  );
}

export default function Agenda() {
  const [, setLocation] = useLocation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const isMobile = useIsMobile();
  // Visão Dia é o padrão no celular; a escolha do usuário fica lembrada.
  const [viewMode, setViewModeState] = useState<AgendaView>(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY) as AgendaView | null;
      if (saved === "day" || saved === "week" || saved === "month") return saved;
    } catch {}
    return typeof window !== "undefined" && window.innerWidth < 768 ? "day" : "month";
  });
  const setViewMode = (v: AgendaView) => {
    setViewModeState(v);
    try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch {}
  };
  const swipeStartX = useRef<number | null>(null);
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date());
  const [activeDragTask, setActiveDragTask] = useState<any>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [checklistItems, setChecklistItems] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [newChecklistText, setNewChecklistText] = useState("");
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

  const { data: entities = [] } = trpc.entities.list.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: tasks = [], refetch: refetchTasks } = trpc.tasks.list.useQuery();
  const { data: currentUser, refetch: refetchUser } = trpc.auth.me.useQuery();
  const syncGoogleCalendar = trpc.tasks.syncGoogleCalendar.useMutation({
    onSuccess: (result) => {
      toast.success(`Google Agenda sincronizado! ${result.synced} tarefa(s) enviada(s).`);
    },
    onError: (error) => {
      toast.error("Erro ao sincronizar: " + error.message);
    },
  });

  const getGoogleCalendarAuthUrl = trpc.tasks.getGoogleCalendarAuthUrl.useMutation({
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (error) => {
      toast.error("Erro ao iniciar conexão com Google Agenda: " + error.message);
    },
  });

  const disconnectGoogleCalendar = trpc.tasks.disconnectGoogleCalendar.useMutation({
    onSuccess: () => {
      toast.success("Google Agenda desconectado.");
      refetchUser();
    },
    onError: (error) => {
      toast.error("Erro ao desconectar Google Agenda: " + error.message);
    },
  });

  const calendarConnected = !!(currentUser as any)?.googleCalendarRefreshToken;

  // Detectar retorno do OAuth do Google Calendar via query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("calendar_connected");
    const calError = params.get("calendar_error");
    if (connected === "true") {
      toast.success("Google Agenda conectado com sucesso!");
      refetchUser();
      // Limpar query params da URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (calError) {
      const messages: Record<string, string> = {
        cancelled: "Conexão cancelada.",
        no_refresh_token: "Token não recebido. Tente desconectar o app no Google e reconectar.",
        auth_failed: "Falha na autenticação com o Google.",
        invalid_state: "Estado inválido. Tente novamente.",
      };
      toast.error(messages[calError] || "Erro ao conectar Google Agenda.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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

  // Reagendamento por arrastar (visão semanal) — update otimista + sync Google Calendar
  const utils = trpc.useUtils();
  const rescheduleTask = trpc.tasks.update.useMutation({
    onMutate: async (vars: any) => {
      await utils.tasks.list.cancel();
      const previous = utils.tasks.list.getData();
      utils.tasks.list.setData(undefined, (old: any) =>
        (old || []).map((t: any) =>
          t.id === vars.id ? { ...t, dueDate: vars.dueDate, ...(vars.endDate !== undefined ? { endDate: vars.endDate } : {}) } : t
        )
      );
      return { previous };
    },
    onError: (err: any, _vars, ctx: any) => {
      if (ctx?.previous) utils.tasks.list.setData(undefined, ctx.previous);
      toast.error("Erro ao reagendar: " + err.message);
    },
    onSuccess: () => { toast.success("Tarefa reagendada."); },
    onSettled: () => { utils.tasks.list.invalidate(); },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const lastWeekNavRef = useRef(0);
  const hoverDayRef = useRef<string | null>(null); // último dia sob o cursor (fallback do drop)
  const handleDragStart = (e: DragStartEvent) => {
    const taskId = (e.active.data.current as any)?.taskId;
    const t = tasks.find((x: any) => x.id === taskId);
    setActiveDragTask(t || null);
    hoverDayRef.current = null;
  };

  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id;
    // Zonas laterais: navega para a semana anterior/próxima (debounced)
    if (overId === "week-prev" || overId === "week-next") {
      const now = Date.now();
      if (now - lastWeekNavRef.current < 650) return;
      lastWeekNavRef.current = now;
      setWeekAnchor((prev) => (overId === "week-prev" ? subDays(prev, 7) : addDays(prev, 7)));
      return;
    }
    // Sobre uma coluna de dia: guarda como alvo de drop (fallback)
    const day = (e.over?.data.current as any)?.day;
    if (day) hoverDayRef.current = day;
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragTask(null);
    const taskId = (e.active.data.current as any)?.taskId;
    // Preferir o alvo do evento; se vazio (ex.: origem desmontou ao trocar de
    // semana), usar a última coluna sob o cursor.
    const overDay = (e.over?.data.current as any)?.day as string | undefined;
    const dayKey = overDay || hoverDayRef.current || undefined;
    hoverDayRef.current = null;
    if (!taskId || !dayKey) return;
    const task = tasks.find((x: any) => x.id === taskId);
    if (!task) return;
    const [y, m, d] = dayKey.split("-").map(Number);
    const oldStart = toDate(task.dueDate);
    // mesma data-alvo ao meio-dia (padrão do app p/ evitar timezone); horário fica em dueTime
    const newDue = new Date(y, m - 1, d, 12, 0, 0);
    const oldStartDay = new Date(oldStart.getFullYear(), oldStart.getMonth(), oldStart.getDate());
    if (oldStartDay.getTime() === new Date(y, m - 1, d).getTime()) return; // mesmo dia, nada a fazer
    const vars: any = { id: taskId, dueDate: newDue };
    // Deslocar endDate pelo mesmo número de dias
    if (task.endDate) {
      const delta = differenceInDays(new Date(y, m - 1, d), oldStartDay);
      vars.endDate = addDays(toDate(task.endDate), delta);
    }
    rescheduleTask.mutate(vars);
  };

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

  // Marcar/reabrir a tarefa em edição direto pelo drawer
  const handleToggleCompleteEditing = () => {
    if (!editingTask) return;
    toggleComplete.mutate({ id: editingTask.id });
    setEditingTask({ ...editingTask, status: editingTask.status === "COMPLETED" ? "PENDING" : "COMPLETED" });
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
    // Carregar checklist (JSON string → array)
    let cl: any[] = [];
    try { cl = task.checklist ? JSON.parse(task.checklist) : []; } catch { cl = []; }
    setChecklistItems(Array.isArray(cl) ? cl : []);
    setNewChecklistText("");
    setIsEditOpen(true);
  };

  // Persiste o checklist e deixa o servidor derivar o status (100% conclui;
  // desmarcar reabre). Atualiza o status local para o botão refletir.
  const persistChecklist = async (items: { id: string; text: string; done: boolean }[]) => {
    if (!editingTask) return;
    setChecklistItems(items);
    try {
      await utils.client.tasks.update.mutate({ id: editingTask.id, checklist: items } as any);
      refetchTasks();
      if (items.length > 0) {
        const allDone = items.every((i) => i.done);
        setEditingTask({ ...editingTask, status: allDone ? "COMPLETED" : "PENDING" });
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar checklist");
    }
  };
  const addChecklistItem = () => {
    const text = newChecklistText.trim();
    if (!text) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    persistChecklist([...checklistItems, { id, text, done: false }]);
    setNewChecklistText("");
  };
  const toggleChecklistItem = (id: string) => {
    persistChecklist(checklistItems.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  };
  const deleteChecklistItem = (id: string) => {
    persistChecklist(checklistItems.filter((i) => i.id !== id));
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

  // Dias da semana atual (segunda a domingo) para a visão semanal
  const weekDays = useMemo(() => {
    const start = startOfWeek(weekAnchor, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: addDays(start, 6) });
  }, [weekAnchor]);

  // Layout das barras da semana: tarefas que intersectam a semana viram barras
  // contínuas (start→end) — definido após processedTasks (abaixo).

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

  // Layout das barras da semana: tarefas que intersectam a semana viram barras
  // contínuas (start→end), com coluna, span e linha (row) para não sobrepor.
  const weekLayout = useMemo(() => {
    const weekStart = startOfDay(weekDays[0]);
    const weekEnd = startOfDay(weekDays[6]);
    const items = processedTasks
      .filter((t) => startOfDay(t.endDate) >= weekStart && startOfDay(t.startDate) <= weekEnd)
      .map((t) => {
        const s = startOfDay(t.startDate);
        const e = startOfDay(t.endDate);
        const startCol = Math.max(0, differenceInDays(s, weekStart));
        const endCol = Math.min(6, differenceInDays(e, weekStart));
        return {
          task: t,
          startCol,
          endCol,
          span: endCol - startCol + 1,
          clipLeft: s < weekStart,
          clipRight: e > weekEnd,
          row: 0,
        };
      });
    // Alocar linhas (greedy) para evitar sobreposição
    items.sort((a, b) => a.startCol - b.startCol || b.span - a.span);
    const rowsLastCol: number[] = [];
    for (const it of items) {
      let row = 0;
      while (rowsLastCol[row] !== undefined && rowsLastCol[row] >= it.startCol) row++;
      rowsLastCol[row] = it.endCol;
      it.row = row;
    }
    return { items, maxRow: rowsLastCol.length };
  }, [processedTasks, weekDays]);

  // Linhas COMPACTAS por semana para a visão mensal — evita que a linha global
  // (esparsa) faça a barra vazar da célula e sobrepor outra tarefa.
  // Chave: `${weekIdx}-${taskId}` → row. Barras multi-dia ficam na mesma linha
  // dentro da semana (continuidade preservada).
  const monthWeekRows = useMemo(() => {
    const map = new Map<string, number>();
    const weeks = Math.ceil(calendarDays.length / 7);
    for (let w = 0; w < weeks; w++) {
      const weekStart = startOfDay(calendarDays[w * 7]);
      const weekEnd = startOfDay(calendarDays[w * 7 + 6]);
      const items = processedTasks
        .filter((t) => startOfDay(t.endDate) >= weekStart && startOfDay(t.startDate) <= weekEnd)
        .map((t) => ({
          id: t.id,
          startCol: Math.max(0, differenceInDays(startOfDay(t.startDate), weekStart)),
          endCol: Math.min(6, differenceInDays(startOfDay(t.endDate), weekStart)),
        }))
        .sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol));
      const rowsLastCol: number[] = [];
      for (const it of items) {
        let row = 0;
        while (rowsLastCol[row] !== undefined && rowsLastCol[row] >= it.startCol) row++;
        rowsLastCol[row] = it.endCol;
        map.set(`${w}-${it.id}`, row);
      }
    }
    return map;
  }, [processedTasks, calendarDays]);

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

  // ── Visão Dia ──
  const dayViewDate = selectedDate ?? new Date();
  const stripDays = useMemo(() => {
    const start = startOfWeek(dayViewDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end: addDays(start, 6) });
  }, [dayViewDate.toDateString()]);
  // Dia inteiro primeiro, depois por horário; concluídas ao final
  const dayViewTasks = useMemo(() => {
    return [...getTasksForDay(dayViewDate)].sort((a, b) => {
      const doneDiff = Number(a.status === "COMPLETED") - Number(b.status === "COMPLETED");
      if (doneDiff !== 0) return doneDiff;
      const ta = a.allDay || !a.dueTime ? "" : a.dueTime;
      const tb = b.allDay || !b.dueTime ? "" : b.dueTime;
      return ta.localeCompare(tb);
    });
  }, [dayViewDate.toDateString(), processedTasks]);

  const navigate = (dir: 1 | -1) => {
    if (viewMode === "month") setCurrentMonth(dir > 0 ? addMonths(currentMonth, 1) : subMonths(currentMonth, 1));
    else if (viewMode === "week") setWeekAnchor(addDays(weekAnchor, 7 * dir));
    else setSelectedDate(addDays(dayViewDate, dir));
  };
  const goToday = () => {
    const now = new Date();
    setCurrentMonth(now);
    setWeekAnchor(now);
    setSelectedDate(now);
  };

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-4 pb-28 md:p-6">
      {/* Header */}
      <div className="mb-4">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="mb-2 hidden md:inline-flex"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">Agenda</h1>
            <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">Gerencie suas tarefas e compromissos</p>
          </div>
          {/* Mobile: Google Agenda num menu "⋯"; "Nova tarefa" vira botão flutuante */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 md:hidden" aria-label="Mais opções">
                {syncGoogleCalendar.isPending ? <RefreshCw className="h-5 w-5 animate-spin" /> : <MoreVertical className="h-5 w-5" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {calendarConnected ? (
                <>
                  <DropdownMenuItem onClick={() => syncGoogleCalendar.mutate()} disabled={syncGoogleCalendar.isPending}>
                    <img src="/google-calendar-logo.png" alt="" className="h-4 w-4 mr-2" />Sincronizar Google Agenda
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => disconnectGoogleCalendar.mutate()}>
                    <X className="h-4 w-4 mr-2" />Desconectar Google Agenda
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={() => getGoogleCalendarAuthUrl.mutate()}>
                  <img src="/google-calendar-logo.png" alt="" className="h-4 w-4 mr-2" />Conectar Google Agenda
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="hidden md:flex flex-wrap justify-end gap-2">
            {calendarConnected ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => syncGoogleCalendar.mutate()}
                  disabled={syncGoogleCalendar.isPending}
                  className="border-green-500 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-950"
                >
                  {syncGoogleCalendar.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <img src="/google-calendar-logo.png" alt="Google Agenda" className="h-4 w-4 mr-2" />
                  )}
                  Google Agenda
                </Button>
                <Button
                  variant="outline"
                  onClick={() => disconnectGoogleCalendar.mutate()}
                  disabled={disconnectGoogleCalendar.isPending}
                  className="border-red-400 text-red-600 hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-950"
                >
                  {disconnectGoogleCalendar.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <X className="h-4 w-4 mr-2" />
                  )}
                  Desconectar
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => getGoogleCalendarAuthUrl.mutate()}
                disabled={getGoogleCalendarAuthUrl.isPending}
              >
                {getGoogleCalendarAuthUrl.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <img src="/google-calendar-logo.png" alt="Google Agenda" className="h-4 w-4 mr-2" />
                )}
                Conectar Google Agenda
              </Button>
            )}
            <Button onClick={() => openCreateSheet(viewMode === "day" ? dayViewDate : undefined)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Tarefa
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile: botão flutuante de nova tarefa */}
      <button
        type="button"
        onClick={() => openCreateSheet(viewMode !== "month" ? dayViewDate : selectedDate ?? undefined)}
        aria-label="Nova tarefa"
        className="md:hidden fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_8px_24px_rgba(22,97,181,0.45)] active:scale-95 transition-transform"
        style={{ background: "#1661B5", bottom: "calc(20px + env(safe-area-inset-bottom))" }}
      >
        <Plus className="h-7 w-7" />
      </button>

      {/* Calendário - Largura total */}
      <Card className="mb-6 gap-3 p-3 md:gap-6 md:py-5 md:px-[22px]">
        <CardHeader className="px-0 pb-0 md:pb-4">
          <div className="flex flex-col gap-3 lg:flex-row-reverse lg:items-center lg:justify-between">
            {/* Toggle de visão — linha inteira no celular */}
            <div className="grid grid-cols-3 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 lg:w-[270px]">
              {([["day", "Dia"], ["week", "Semana"], ["month", "Mês"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className={`h-9 md:h-8 text-sm font-medium rounded-lg transition-colors ${viewMode === v ? "bg-white dark:bg-gray-700 text-[#1661B5] dark:text-white shadow-sm" : "text-gray-600 dark:text-gray-300"}`}
                >{label}</button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 lg:justify-start lg:gap-4">
              <CardTitle className="min-w-0 truncate text-lg md:text-xl first-letter:uppercase">
                {viewMode === "month"
                  ? format(currentMonth, "MMMM yyyy", { locale: ptBR })
                  : viewMode === "week"
                    ? `${format(weekDays[0], "dd/MM")} – ${format(weekDays[6], "dd/MM/yyyy")}`
                    : format(dayViewDate, isMobile ? "EEEE, d MMM" : "EEEE, d 'de' MMMM", { locale: ptBR })}
              </CardTitle>
              {/* Navegação (view-aware) */}
              <div className="flex shrink-0 items-center gap-1.5 lg:order-first">
                <Button variant="outline" size="icon" className="h-10 w-10 md:h-9 md:w-9" aria-label="Anterior" onClick={() => navigate(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="h-10 md:h-9 px-3" onClick={goToday}>
                  Hoje
                </Button>
                <Button variant="outline" size="icon" className="h-10 w-10 md:h-9 md:w-9" aria-label="Próximo" onClick={() => navigate(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {viewMode === "day" ? (
            /* ===== Visão diária ===== */
            <div
              onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (swipeStartX.current === null) return;
                const dx = e.changedTouches[0].clientX - swipeStartX.current;
                swipeStartX.current = null;
                if (Math.abs(dx) > 70) navigate(dx < 0 ? 1 : -1);
              }}
            >
              {/* Faixa da semana: toque escolhe o dia; ponto = tem tarefa */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {stripDays.map((day) => {
                  const selected = isSameDay(day, dayViewDate);
                  const today = isToday(day);
                  const count = getTasksForDay(day).filter((t) => t.status !== "COMPLETED").length;
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`flex flex-col items-center gap-0.5 rounded-2xl py-2 transition-colors ${selected ? "bg-[#1661B5] text-white shadow-[0_4px_12px_rgba(22,97,181,0.35)]" : today ? "bg-[#E8F0FB] text-[#1661B5] dark:bg-blue-900/30 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"}`}
                    >
                      <span className={`text-[11px] font-medium uppercase ${selected ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>
                        {format(day, "EEEEEE", { locale: ptBR })}
                      </span>
                      <span className="text-[17px] font-semibold tabular-nums leading-6">{format(day, "d")}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${count > 0 ? (selected ? "bg-white" : "bg-[#1661B5]") : "bg-transparent"}`} />
                    </button>
                  );
                })}
              </div>

              {dayViewTasks.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0FB] text-[#1661B5] dark:bg-blue-900/30">
                    <Calendar className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Dia livre</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma tarefa para {isToday(dayViewDate) ? "hoje" : "este dia"}.</p>
                  </div>
                  <Button variant="outline" className="h-11 md:h-9" onClick={() => openCreateSheet(dayViewDate)}>
                    <Plus className="h-4 w-4 mr-2" />Adicionar tarefa
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {(() => {
                      const pending = dayViewTasks.filter((t) => t.status !== "COMPLETED").length;
                      const done = dayViewTasks.length - pending;
                      return `${pending} ${pending === 1 ? "pendente" : "pendentes"} · ${done} ${done === 1 ? "concluída" : "concluídas"}`;
                    })()}
                  </p>
                  {dayViewTasks.map((task) => (
                    <DayTaskRow
                      key={task.id}
                      task={task}
                      entityName={getEntityName(task.entityId)}
                      entityColor={getEntityColor(task.entityId)}
                      onOpen={openEditSheet}
                      onToggle={(t) => toggleComplete.mutate({ id: t.id })}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => openCreateSheet(dayViewDate)}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#C9C9CF] dark:border-[#3A3A48] text-sm font-medium text-gray-500 dark:text-gray-400 active:bg-[#F6F6F8]"
                  >
                    <Plus className="h-4 w-4" />Adicionar tarefa
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === "week" ? (
            /* ===== Visão semanal com drag-and-drop ===== */
            <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
              <p className="text-xs text-muted-foreground mb-2">Arraste uma tarefa para outro dia para reagendá-la. Arraste até as bordas ‹ › para mudar de semana{currentUser?.googleCalendarRefreshToken ? " · sincroniza com o Google Calendar" : ""}.</p>
              <div className="overflow-x-auto">
                <div className="flex items-stretch gap-1.5 min-w-[900px] lg:min-w-0">
                  {/* Zona: semana anterior */}
                  <EdgeDropZone id="week-prev"><ChevronLeft className="h-4 w-4" /></EdgeDropZone>

                  <div className="flex-1 min-w-0">
                    {/* Cabeçalhos dos dias (clicáveis: selecionam o dia p/ o painel abaixo) */}
                    <div className="grid grid-cols-7 gap-1.5 mb-1">
                      {weekDays.map((day) => {
                        const today = isToday(day);
                        const selected = selectedDate && isSameDay(day, selectedDate);
                        return (
                          <button
                            key={day.toISOString()}
                            onClick={() => setSelectedDate(day)}
                            className={`text-center py-1.5 rounded-md transition-colors cursor-pointer ${selected ? "ring-2 ring-blue-500 ring-inset" : ""} ${today ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                          >
                            <div className="text-[11px] uppercase text-gray-500 dark:text-gray-400 capitalize">{format(day, "EEE", { locale: ptBR })}</div>
                            <div className={`text-sm font-semibold ${today ? "text-blue-600 dark:text-blue-400" : "text-gray-800 dark:text-gray-200"}`}>{format(day, "dd/MM")}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Colunas (drop) + overlay de barras contínuas */}
                    <div className="relative">
                      <div className="grid grid-cols-7 gap-1.5">
                        {weekDays.map((day) => (
                          <WeekDropColumn
                            key={day.toISOString()}
                            day={day}
                            barsHeight={weekLayout.maxRow * 32 + 8}
                            onCreate={openCreateSheet}
                          />
                        ))}
                      </div>
                      {/* Overlay das barras */}
                      <div
                        className="grid grid-cols-7 gap-1.5 absolute top-0 left-0 right-0 pt-1 pointer-events-none"
                        style={{ gridAutoRows: "26px" }}
                      >
                        {weekLayout.items.map((item) => (
                          <TaskBar key={item.task.id} item={item} onOpen={openEditSheet} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Zona: próxima semana */}
                  <EdgeDropZone id="week-next"><ChevronRight className="h-4 w-4" /></EdgeDropZone>
                </div>
              </div>
              {/* Mantém o item arrastado registrado ao navegar entre semanas */}
              {activeDragTask && !weekLayout.items.some((it) => it.task.id === activeDragTask.id) && (
                <KeepAliveDraggable taskId={activeDragTask.id} />
              )}
              <DragOverlay>
                {activeDragTask ? (
                  <div className="rounded-md bg-[#1a67c2] text-white px-2 py-1 shadow-lg">
                    <span className="text-xs font-medium">{activeDragTask.title}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
          <>
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
              const weekIdx = Math.floor(index / 7);
              const rowOf = (t: any) => monthWeekRows.get(`${weekIdx}-${t.id}`) ?? 0;
              const maxRow = dayTasks.length ? Math.max(...dayTasks.map(rowOf)) : 0;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isPast = isBefore(day, new Date()) && !isToday(day);

              return (
                <div
                  key={index}
                  onClick={() => setSelectedDate(day)}
                  className={`
                    min-h-[56px] md:min-h-[100px] p-1 cursor-pointer transition-colors bg-white dark:bg-gray-800
                    ${!isCurrentMonth ? "bg-gray-50 dark:bg-gray-700" : ""}
                    ${isSelected ? "ring-2 ring-blue-500 ring-inset" : ""}
                    ${isToday(day) ? "bg-blue-50 dark:bg-blue-900/30" : ""}
                    hover:bg-gray-100 dark:hover:bg-gray-700
                  `}
                >
                  <div className={`
                    text-center md:text-left text-sm font-medium mb-1
                    ${!isCurrentMonth ? "text-gray-400" : ""}
                    ${isPast && isCurrentMonth ? "text-gray-400" : ""}
                    ${isToday(day) ? "text-blue-600 font-bold" : ""}
                  `}>
                    {format(day, "d")}
                  </div>

                  {/* Mobile: pontos (até 3) em vez das barras de texto */}
                  <div className="flex flex-wrap justify-center gap-0.5 md:hidden">
                    {dayTasks.slice(0, 3).map((t) => (
                      <span
                        key={t.id}
                        className={`h-1.5 w-1.5 rounded-full ${t.status === "COMPLETED" ? "opacity-40" : ""}`}
                        style={{ background: t.color || PRIORITY_HEX[t.priority] || "#9CA3AF" }}
                      />
                    ))}
                    {dayTasks.length > 3 && <span className="text-[9px] leading-none text-gray-500">+{dayTasks.length - 3}</span>}
                  </div>

                  {/* Tarefas do dia */}
                  <div className="overflow-visible relative hidden md:block" style={{ minHeight: `${(maxRow + 1) * 22 + 4}px` }}>
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
                            top: `${rowOf(task) * 22}px`,
                            zIndex: 10,
                          }}
                          title={`${task.title}${task.duration > 1 ? ` (${format(task.startDate, "dd/MM")} - ${format(task.endDate, "dd/MM")})` : ""}`}
                        >
                          {(() => { const cp = getChecklistProgress(task); return cp ? `☑${cp.done}/${cp.total} ` : ""; })()}{task.title}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          </>
          )}
        </CardContent>
      </Card>

      {/* Painel de Tarefas do Dia Selecionado - Abaixo do calendário (a visão Dia já é a lista) */}
      {viewMode !== "day" && (
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
            <div className="space-y-2">
              {selectedDayTasks.map((task) => (
                <DayTaskRow
                  key={task.id}
                  task={task}
                  entityName={getEntityName(task.entityId)}
                  entityColor={getEntityColor(task.entityId)}
                  onOpen={openEditSheet}
                  onToggle={(t) => toggleComplete.mutate({ id: t.id })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

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
                  <DatePicker
                    value={formData.dueDate}
                    onChange={(v) => setFormData({ ...formData, dueDate: v })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Data de Término</Label>
                  <DatePicker
                    value={formData.endDate}
                    onChange={(v) => setFormData({ ...formData, endDate: v })}
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
                  {/* Preview / aviso da recorrência */}
                  {(() => {
                    const n = parseInt(formData.recurrenceCount) || 0;
                    if (n < 2) {
                      return (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          ⚠️ Com <strong>Repetir por = {n}</strong>, nenhuma repetição será criada. Informe <strong>2 ou mais</strong> (é a quantidade total de vezes).
                        </p>
                      );
                    }
                    const freqLabel: Record<string, string> = { DAY: "diárias", WEEK: "semanais", MONTH: "mensais", YEAR: "anuais" };
                    let previewText = `Serão criadas ${n} tarefas ${freqLabel[formData.recurrenceFrequency]}`;
                    if (formData.dueDate) {
                      const [y, m, d] = formData.dueDate.split("-").map(Number);
                      const start = new Date(y, m - 1, d, 12, 0, 0);
                      const last = new Date(start);
                      const k = n - 1;
                      if (formData.recurrenceFrequency === "DAY") last.setDate(last.getDate() + k);
                      else if (formData.recurrenceFrequency === "WEEK") last.setDate(last.getDate() + k * 7);
                      else if (formData.recurrenceFrequency === "MONTH") last.setMonth(last.getMonth() + k);
                      else last.setFullYear(last.getFullYear() + k);
                      previewText += `, de ${format(start, "dd/MM/yyyy")} a ${format(last, "dd/MM/yyyy")}`;
                    }
                    return <p className="text-xs text-muted-foreground">{previewText}.</p>;
                  })()}
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
                  <DatePicker
                    value={formData.dueDate}
                    onChange={(v) => setFormData({ ...formData, dueDate: v })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Data de Término</Label>
                  <DatePicker
                    value={formData.endDate}
                    onChange={(v) => setFormData({ ...formData, endDate: v })}
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

              {/* Checklist de ações — 100% conclui a tarefa automaticamente */}
              <div>
                <Label className="mb-2 block">Checklist de ações</Label>
                {checklistItems.length > 0 && (() => {
                  const done = checklistItems.filter((i) => i.done).length;
                  const pct = Math.round((done / checklistItems.length) * 100);
                  return (
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{done}/{checklistItems.length} concluídos</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                <div className="space-y-1.5">
                  {checklistItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <Checkbox checked={item.done} onCheckedChange={() => toggleChecklistItem(item.id)} />
                      <span className={`flex-1 text-sm ${item.done ? "line-through text-gray-400" : ""}`}>{item.text}</span>
                      <button
                        type="button"
                        onClick={() => deleteChecklistItem(item.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={newChecklistText}
                    onChange={(e) => setNewChecklistText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
                    placeholder="Adicionar item..."
                    className="h-9"
                  />
                  <Button type="button" variant="outline" className="h-9" onClick={addChecklistItem}>Adicionar</Button>
                </div>
                {checklistItems.length > 0 && checklistItems.every((i) => i.done) && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">✅ Todos os itens concluídos — tarefa marcada como concluída.</p>
                )}
              </div>
            </div>
          </div>

          {/* Ação de concluir / reabrir */}
          {editingTask && (
            <div className="px-6 pb-1">
              <Button
                variant="outline"
                className={`w-full ${editingTask.status === "COMPLETED" ? "" : "border-green-500 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"}`}
                onClick={handleToggleCompleteEditing}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {editingTask.status === "COMPLETED" ? "Reabrir tarefa" : "Marcar como concluída"}
              </Button>
            </div>
          )}

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
