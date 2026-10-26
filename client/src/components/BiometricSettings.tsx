import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Fingerprint } from "lucide-react";
import {
  BIOMETRIC_DELAY_OPTIONS,
  biometricLabel,
  getBiometricConfig,
  isBiometricAvailable,
  setBiometricConfig,
  useEnableBiometric,
} from "./BiometricLock";

/** Card do Perfil: ativar/desativar o desbloqueio com Face ID / digital neste aparelho. */
export function BiometricSettings() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [config, setConfig] = useState(getBiometricConfig);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const enableBiometric = useEnableBiometric(user?.id);
  const removeMutation = trpc.biometric.remove.useMutation();

  useEffect(() => { isBiometricAvailable().then(setAvailable); }, []);

  if (!available) return null;

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        await enableBiometric();
        toast.success(`Desbloqueio com ${biometricLabel()} ativado neste aparelho`);
      } else if (config) {
        await removeMutation.mutateAsync({ credentialId: config.credentialId }).catch(() => {});
        setBiometricConfig(null);
        toast.success(`Desbloqueio com ${biometricLabel()} desativado neste aparelho`);
      }
      setConfig(getBiometricConfig());
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") toast.error("Não foi possível alterar agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const changeDelay = (value: string) => {
    if (!config) return;
    const next = { ...config, delayMinutes: Number(value) };
    setBiometricConfig(next);
    setConfig(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-5 w-5" />
          Desbloqueio com {biometricLabel()}
        </CardTitle>
        <CardDescription>
          Pede {biometricLabel()} ao voltar para o app neste aparelho. Ideal junto com "Manter conectado neste aparelho".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">Ativado neste aparelho</span>
          <Switch checked={!!config} disabled={busy} onCheckedChange={toggle} />
        </label>
        {config && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Bloquear</span>
            <Select value={String(config.delayMinutes)} onValueChange={changeDelay}>
              <SelectTrigger className="h-11 md:h-9 w-[210px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BIOMETRIC_DELAY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
