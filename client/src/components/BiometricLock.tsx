import { useCallback, useEffect, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Fingerprint, Loader2, ScanFace } from "lucide-react";

/**
 * Bloqueio do app com Face ID / digital (WebAuthn, verificado no servidor).
 *
 * Configuração por aparelho (localStorage): qual credencial usar e após
 * quanto tempo fora do app ele bloqueia. O instante da última atividade é
 * gravado quando o app vai para segundo plano.
 */
const CONFIG_KEY = "biometricLock";
const LAST_ACTIVE_KEY = "biometricLastActiveAt";
const OFFER_DISMISSED_KEY = "biometricOfferDismissed";

export type BiometricConfig = { credentialId: string; delayMinutes: number; userId?: number };

export const BIOMETRIC_DELAY_OPTIONS = [
  { value: 0, label: "Sempre ao voltar ao app" },
  { value: 5, label: "Após 5 minutos fora" },
  { value: 15, label: "Após 15 minutos fora" },
  { value: 60, label: "Após 1 hora fora" },
  { value: 240, label: "Após 4 horas fora" },
];
const DEFAULT_DELAY_MINUTES = 15;

export function getBiometricConfig(): BiometricConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as BiometricConfig) : null;
  } catch {
    return null;
  }
}

export function setBiometricConfig(config: BiometricConfig | null) {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {}
}

function markActive() {
  try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch {}
}

function shouldLock(config: BiometricConfig | null): boolean {
  if (!config) return false;
  try {
    const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
    return Date.now() - last >= config.delayMinutes * 60 * 1000;
  } catch {
    return false;
  }
}

/** Face ID / Touch ID / digital disponível neste aparelho? */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    return (
      typeof window !== "undefined" &&
      !!window.PublicKeyCredential &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

const isApple = () => /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent);
export const biometricLabel = () => (isApple() ? "Face ID" : "biometria");

/** Registra a biometria do aparelho e ativa o bloqueio. */
export function useEnableBiometric(userId?: number) {
  const optionsMutation = trpc.biometric.registrationOptions.useMutation();
  const registerMutation = trpc.biometric.register.useMutation();
  return useCallback(async (delayMinutes = DEFAULT_DELAY_MINUTES) => {
    const optionsJSON = await optionsMutation.mutateAsync();
    const response = await startRegistration({ optionsJSON });
    const { credentialId } = await registerMutation.mutateAsync({ response, deviceName: navigator.userAgent.slice(0, 255) });
    setBiometricConfig({ credentialId, delayMinutes, userId });
    markActive();
  }, [optionsMutation, registerMutation, userId]);
}

export function BiometricLock({ userId, userName, onSignOut }: { userId: number; userName?: string | null; onSignOut: () => void }) {
  // Configuração de outro usuário (troca de conta no mesmo aparelho) é descartada
  const [locked, setLocked] = useState(() => {
    const config = getBiometricConfig();
    if (config && config.userId !== undefined && config.userId !== userId) {
      setBiometricConfig(null);
      return false;
    }
    return shouldLock(config);
  });
  const [busy, setBusy] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const optionsMutation = trpc.biometric.unlockOptions.useMutation();
  const unlockMutation = trpc.biometric.unlock.useMutation();
  const enableBiometric = useEnableBiometric(userId);

  // Bloqueia ao voltar para o app depois do tempo configurado
  useEffect(() => {
    if (!locked) markActive();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (!locked) markActive();
      } else if (shouldLock(getBiometricConfig())) {
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
    };
  }, [locked]);

  // Convite único após entrar com "Manter conectado" num aparelho compatível
  useEffect(() => {
    (async () => {
      try {
        if (getBiometricConfig()) return;
        if (localStorage.getItem(OFFER_DISMISSED_KEY)) return;
        if (JSON.parse(localStorage.getItem("rememberMe") || "false") !== true) return;
        if (await isBiometricAvailable()) setOfferOpen(true);
      } catch {}
    })();
  }, []);

  const unlock = async () => {
    const config = getBiometricConfig();
    if (!config) return setLocked(false);
    setBusy(true);
    try {
      const { options } = await optionsMutation.mutateAsync({ credentialId: config.credentialId });
      if (!options) {
        // Credencial removida no servidor: desliga o bloqueio neste aparelho
        setBiometricConfig(null);
        setLocked(false);
        return;
      }
      const response = await startAuthentication({ optionsJSON: options });
      const { verified } = await unlockMutation.mutateAsync({ response });
      if (verified) {
        markActive();
        setLocked(false);
      } else {
        toast.error("Não foi possível confirmar. Tente novamente.");
      }
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") toast.error("Não foi possível usar a biometria agora.");
    } finally {
      setBusy(false);
    }
  };

  const acceptOffer = async () => {
    setOfferOpen(false);
    try {
      await enableBiometric();
      toast.success(`Desbloqueio com ${biometricLabel()} ativado neste aparelho`);
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") toast.error("Não foi possível ativar agora. Você pode ativar depois no Perfil.");
    }
  };

  const dismissOffer = () => {
    setOfferOpen(false);
    try { localStorage.setItem(OFFER_DISMISSED_KEY, "1"); } catch {}
  };

  const Icon = isApple() ? ScanFace : Fingerprint;

  return (
    <>
      {locked && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-between px-6 text-white"
          style={{
            background: "linear-gradient(180deg, #1661B5 0%, #0F4C91 100%)",
            paddingTop: "calc(64px + env(safe-area-inset-top))",
            paddingBottom: "calc(40px + env(safe-area-inset-bottom))",
          }}
        >
          <img src="/logo-unifique-pro-white.png" alt="UnifiquePro" className="h-9 w-auto" />
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15">
              <Icon className="h-10 w-10" />
            </div>
            <div>
              <p className="text-xl font-semibold">{userName ? `Olá, ${userName.split(" ")[0]}` : "App bloqueado"}</p>
              <p className="mt-1 text-sm text-white/80">Use {biometricLabel()} para desbloquear</p>
            </div>
            <Button
              onClick={unlock}
              disabled={busy}
              className="h-12 w-64 rounded-xl bg-white text-[#1661B5] text-base font-semibold hover:bg-white/90"
            >
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Icon className="mr-2 h-5 w-5" />}
              Desbloquear
            </Button>
          </div>
          <button
            type="button"
            onClick={() => { setBiometricConfig(null); setLocked(false); onSignOut(); }}
            className="text-sm text-white/80 underline-offset-4 hover:underline"
          >
            Sair e entrar com outra conta
          </button>
        </div>
      )}

      <Dialog open={offerOpen} onOpenChange={(open) => { if (!open) dismissOffer(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0FB] text-[#1661B5]">
              <Icon className="h-7 w-7" />
            </div>
            <DialogTitle className="text-center">Proteger o app com {biometricLabel()}?</DialogTitle>
            <DialogDescription className="text-center">
              Você continua conectado, mas o UnifiquePro pede {biometricLabel()} ao voltar para o app depois de 15 minutos
              fora. Dá para mudar isso depois no Perfil.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="h-11 w-full" onClick={acceptOffer}>Ativar {biometricLabel()}</Button>
            <Button variant="ghost" className="h-11 w-full" onClick={dismissOffer}>Agora não</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
