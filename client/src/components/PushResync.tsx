import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Mantém a inscrição de notificações push deste aparelho em dia com o servidor.
 *
 * - Inscrição existe no aparelho → reenvia ao servidor (upsert). Cobre o caso de
 *   o servidor tê-la descartado ou de outro usuário ter entrado no aparelho.
 * - Permissão concedida mas sem inscrição (app removido e adicionado de novo na
 *   Tela de Início, dados do Safari limpos) → aviso com "Reativar", porque o
 *   iPhone exige um toque para criar a inscrição.
 */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const DISMISS_KEY = "pushResyncDismissedAt";

export function PushResync() {
  const ran = useRef(false);
  const utils = trpc.useUtils();
  const subscribe = trpc.notifications.subscribe.useMutation();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          const json = existing.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
          await subscribe.mutateAsync({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent });
          return;
        }
        if (Notification.permission !== "granted") return;

        // Avisa no máximo 1x por dia se o usuário dispensar
        const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (Date.now() - dismissed < 24 * 60 * 60 * 1000) return;

        toast("Notificações pausadas neste aparelho", {
          description: "A inscrição foi perdida (app reinstalado ou dados limpos). Toque em Reativar.",
          duration: 20000,
          action: {
            label: "Reativar",
            onClick: async () => {
              try {
                const { publicKey } = await utils.notifications.vapidPublicKey.fetch();
                if (!publicKey) throw new Error("sem chave");
                const sub = await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(publicKey),
                });
                const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
                await subscribe.mutateAsync({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent });
                toast.success("Notificações reativadas neste aparelho");
              } catch {
                toast.error("Não foi possível reativar. Use Menu → Notificações → Ativar notificações.");
              }
            },
          },
          onDismiss: () => {
            try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
          },
        });
      } catch (err) {
        console.warn("[Push] Falha ao sincronizar inscrição:", err);
      }
    })();
  }, []);

  return null;
}
