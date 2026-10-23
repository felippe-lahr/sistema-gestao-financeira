import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Bell, BellOff, Calendar, Home as HomeIcon, Loader2, Send, TrendingDown, TrendingUp, Smartphone } from "lucide-react";
import {
  DAILY_SUMMARY_HOUR,
  type NotificationPreferences,
  type NotificationTypePrefs,
} from "@shared/notifications";

type PushState = "unsupported" | "ios-browser" | "denied" | "off" | "on";

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export default function Notifications() {
  const utils = trpc.useUtils();
  const { data: entities } = trpc.entities.list.useQuery();
  const { data: savedPrefs, isLoading } = trpc.notifications.getPreferences.useQuery();
  const { data: vapid } = trpc.notifications.vapidPublicKey.useQuery();
  const subscribeMutation = trpc.notifications.subscribe.useMutation();
  const unsubscribeMutation = trpc.notifications.unsubscribe.useMutation();
  const testMutation = trpc.notifications.sendTest.useMutation();
  const updateMutation = trpc.notifications.updatePreferences.useMutation({
    onSuccess: (data) => utils.notifications.getPreferences.setData(undefined, data),
    onError: () => toast.error("Não foi possível salvar. Tente novamente."),
  });

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [pushState, setPushState] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (savedPrefs) setPrefs(savedPrefs);
  }, [savedPrefs]);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone só oferece push no app instalado na Tela de Início.
        setPushState(isIOS() && !isStandalone() ? "ios-browser" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setPushState("denied");
      setPushState((await currentSubscription()) ? "on" : "off");
    })();
  }, []);

  const save = (next: NotificationPreferences) => {
    setPrefs(next);
    updateMutation.mutate(next);
  };

  const enablePush = async () => {
    if (!vapid?.publicKey) return toast.error("Servidor de notificações indisponível no momento.");
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
        }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await subscribeMutation.mutateAsync({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent });
      setPushState("on");
      await testMutation.mutateAsync();
      toast.success("Notificações ativadas neste aparelho");
    } catch (err) {
      console.error("[Push] Falha ao ativar:", err);
      toast.error("Não foi possível ativar as notificações neste aparelho.");
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await unsubscribeMutation.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setPushState("off");
      toast.success("Notificações desativadas neste aparelho");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    const { delivered } = await testMutation.mutateAsync();
    if (delivered > 0) toast.success("Notificação de teste enviada");
    else toast.error("Nenhum aparelho recebeu. Desative e ative as notificações novamente.");
  };

  if (isLoading || !prefs) {
    return (
      <div className="container py-4 md:py-8 max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const allEntities = (entities ?? []).map((e: any) => ({
    id: e.id as number,
    name: e.name as string,
    rental: !!e.temporaryRentalEnabled,
  }));
  const rentalEntities = allEntities.filter((e) => e.rental);

  return (
    <div className="container py-4 md:py-8 max-w-2xl space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Notificações</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Escolha quais avisos receber no celular e de quais entidades.
        </p>
      </div>

      {/* Este aparelho */}
      <Card className="gap-4 p-4 md:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E8F0FB] text-[#1a67c2]">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Este aparelho</p>
            <p className="text-sm text-muted-foreground">
              {pushState === "on" && "Notificações ativadas."}
              {pushState === "off" && "Notificações desativadas neste aparelho."}
              {pushState === "denied" &&
                "As notificações foram bloqueadas. Libere nos ajustes do aparelho (Ajustes → Notificações → UnifiquePro) e volte aqui."}
              {pushState === "ios-browser" &&
                "No iPhone, as notificações funcionam pelo app instalado: abra o UnifiquePro pela Tela de Início."}
              {pushState === "unsupported" && "Este navegador não suporta notificações push."}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {pushState === "off" && (
            <Button className="h-11 md:h-9" onClick={enablePush} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
              Ativar notificações
            </Button>
          )}
          {pushState === "on" && (
            <>
              <Button variant="outline" className="h-11 md:h-9" onClick={sendTest} disabled={testMutation.isPending}>
                {testMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Enviar teste
              </Button>
              <Button variant="ghost" className="h-11 md:h-9 text-muted-foreground" onClick={disablePush} disabled={busy}>
                <BellOff className="mr-2 h-4 w-4" />
                Desativar neste aparelho
              </Button>
            </>
          )}
        </div>
      </Card>

      {/* Agenda */}
      <PrefSection
        icon={<Calendar className="h-5 w-5" />}
        color="#1a67c2"
        title="Compromissos da agenda"
        description="Lembrete antes de cada compromisso com horário e a agenda do dia às 7h."
        prefs={prefs.agenda}
        entities={allEntities}
        onChange={(agenda) => save({ ...prefs, agenda: { ...prefs.agenda, ...agenda } })}
        extraEntities={
          <EntityCheck
            label="Pessoais (sem entidade)"
            checked={prefs.agenda.includePersonal}
            onChange={(v) => save({ ...prefs, agenda: { ...prefs.agenda, includePersonal: v } })}
          />
        }
      >
        <OptionRow label="Avisar">
          <Select
            value={String(prefs.agenda.leadMinutes)}
            onValueChange={(v) => save({ ...prefs, agenda: { ...prefs.agenda, leadMinutes: Number(v) } })}
          >
            <SelectTrigger className="h-11 md:h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Na hora</SelectItem>
              <SelectItem value="15">15 min antes</SelectItem>
              <SelectItem value="30">30 min antes</SelectItem>
              <SelectItem value="60">1 hora antes</SelectItem>
              <SelectItem value="120">2 horas antes</SelectItem>
              <SelectItem value="1440">1 dia antes</SelectItem>
            </SelectContent>
          </Select>
        </OptionRow>
      </PrefSection>

      {/* Contas a pagar */}
      <PrefSection
        icon={<TrendingDown className="h-5 w-5" />}
        color="#c0392b"
        title="Vencimentos (contas a pagar)"
        description={`Resumo às ${DAILY_SUMMARY_HOUR}h com as contas que vencem.`}
        prefs={prefs.expenses}
        entities={allEntities}
        onChange={(expenses) => save({ ...prefs, expenses: { ...prefs.expenses, ...expenses } })}
      >
        <LeadDaysRow value={prefs.expenses.leadDays} onChange={(leadDays) => save({ ...prefs, expenses: { ...prefs.expenses, leadDays } })} />
      </PrefSection>

      {/* Contas a receber */}
      <PrefSection
        icon={<TrendingUp className="h-5 w-5" />}
        color="#1a6b45"
        title="Recebimentos (contas a receber)"
        description={`Resumo às ${DAILY_SUMMARY_HOUR}h com os recebimentos previstos.`}
        prefs={prefs.income}
        entities={allEntities}
        onChange={(income) => save({ ...prefs, income: { ...prefs.income, ...income } })}
      >
        <LeadDaysRow value={prefs.income.leadDays} onChange={(leadDays) => save({ ...prefs, income: { ...prefs.income, leadDays } })} />
      </PrefSection>

      {/* Reservas */}
      {rentalEntities.length > 0 && (
        <PrefSection
          icon={<HomeIcon className="h-5 w-5" />}
          color="#8A6A00"
          title="Reservas"
          description={`Nova reserva na hora; check-ins e check-outs no resumo das ${DAILY_SUMMARY_HOUR}h.`}
          prefs={prefs.rentals}
          entities={rentalEntities}
          onChange={(rentals) => save({ ...prefs, rentals: { ...prefs.rentals, ...rentals } })}
        />
      )}

      {/* Valores */}
      <Card className="p-4 md:p-6">
        <label className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">Mostrar valores nas notificações</p>
            <p className="text-sm text-muted-foreground">Os valores em R$ aparecem também na tela bloqueada.</p>
          </div>
          <Switch checked={prefs.showValues} onCheckedChange={(v) => save({ ...prefs, showValues: v })} />
        </label>
      </Card>
    </div>
  );
}

function PrefSection({
  icon,
  color,
  title,
  description,
  prefs,
  entities,
  onChange,
  extraEntities,
  children,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  description: string;
  prefs: NotificationTypePrefs;
  entities: { id: number; name: string }[];
  onChange: (p: Partial<NotificationTypePrefs>) => void;
  extraEntities?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const all = prefs.entityIds === null;
  const selected = new Set(prefs.entityIds ?? entities.map((e) => e.id));

  const toggleEntity = (id: number, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    // Todas marcadas = "todas" (inclui entidades criadas no futuro).
    onChange({ entityIds: entities.every((e) => next.has(e.id)) ? null : Array.from(next) });
  };

  return (
    <Card className="gap-0 p-0 overflow-hidden">
      <label className="flex items-center gap-3 p-4 md:px-6 cursor-pointer">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${color}14`, color }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch checked={prefs.enabled} onCheckedChange={(v) => onChange({ enabled: v })} />
      </label>

      {prefs.enabled && (
        <div className="border-t border-[#ECECEF] dark:border-[#2C2C3C] px-4 pb-3 pt-2 md:px-6">
          {children}
          <p className="pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entidades</p>
          <EntityCheck
            label="Todas as entidades"
            checked={all}
            onChange={(v) => onChange({ entityIds: v ? null : [] })}
          />
          {entities.map((e) => (
            <EntityCheck key={e.id} label={e.name} checked={selected.has(e.id)} onChange={(v) => toggleEntity(e.id, v)} />
          ))}
          {extraEntities}
        </div>
      )}
    </Card>
  );
}

function EntityCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="h-5 w-5" />
      <span className="text-[15px]">{label}</span>
    </label>
  );
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-1">
      <span className="text-[15px]">{label}</span>
      {children}
    </div>
  );
}

function LeadDaysRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <OptionRow label="Avisar">
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-11 md:h-9 w-[170px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="0">No dia</SelectItem>
          <SelectItem value="1">No dia e 1 dia antes</SelectItem>
          <SelectItem value="3">No dia e 3 dias antes</SelectItem>
          <SelectItem value="7">No dia e 7 dias antes</SelectItem>
        </SelectContent>
      </Select>
    </OptionRow>
  );
}
