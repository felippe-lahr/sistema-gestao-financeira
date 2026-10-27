import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ArrowDown, Loader2 } from "lucide-react";

/**
 * "Puxar para atualizar" no celular: arrastar a tela para baixo estando no
 * topo recarrega os dados (todas as queries tRPC), sem recarregar o app.
 * O app instalado no iPhone não tem esse gesto nativo.
 */
const TRIGGER_PX = 70; // distância (já com resistência) para disparar
const MAX_PX = 110;
const RESISTANCE = 0.5;

/** Não puxa com painel, diálogo, menu ou tela de bloqueio aberto. */
function overlayOpen() {
  return !!document.querySelector('[role="dialog"], [role="menu"], [role="listbox"], [data-state="open"][data-slot="sheet-content"]');
}

export function PullToRefresh() {
  const utils = trpc.useUtils();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const tracking = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const setPullBoth = (v: number) => { pullRef.current = v; setPull(v); };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || window.scrollY > 0 || e.touches.length !== 1 || overlayOpen()) {
        start.current = null;
        return;
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      tracking.current = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dx = e.touches[0].clientX - start.current.x;
      const dy = e.touches[0].clientY - start.current.y;
      if (!tracking.current) {
        // Só gesto vertical para baixo (não conflita com deslizar dias na Agenda
        // nem com as faixas que rolam para o lado)
        if (Math.abs(dy) < 8) return;
        if (dy < 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
          start.current = null;
          return;
        }
        tracking.current = true;
      }
      setPullBoth(Math.min(MAX_PX, Math.max(0, dy * RESISTANCE)));
    };

    const onEnd = async () => {
      if (!start.current) return;
      start.current = null;
      const reached = tracking.current && pullRef.current >= TRIGGER_PX;
      tracking.current = false;
      if (!reached) {
        setPullBoth(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setPullBoth(TRIGGER_PX * 0.8);
      try {
        navigator.vibrate?.(10);
      } catch {}
      try {
        // Invalida e refaz todas as consultas ativas da tela atual
        await Promise.all([utils.invalidate(), new Promise((r) => setTimeout(r, 500))]);
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
        setPullBoth(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [utils]);

  if (pull === 0 && !refreshing) return null;

  const progress = Math.min(1, pull / TRIGGER_PX);
  return (
    <div
      aria-hidden={!refreshing}
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2"
      style={{
        top: `calc(56px + env(safe-area-inset-top) + ${pull - 28}px)`,
        transition: start.current ? "none" : "top 200ms ease",
      }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1661B5] shadow-[0_4px_14px_rgba(0,0,0,0.15)] dark:bg-[#1C1C24] dark:text-blue-300"
        style={{ opacity: refreshing ? 1 : 0.4 + progress * 0.6 }}
      >
        {refreshing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ArrowDown
            className="h-5 w-5 transition-transform"
            style={{ transform: `rotate(${progress >= 1 ? 180 : 0}deg)` }}
          />
        )}
      </div>
      {refreshing && <span className="sr-only">Atualizando…</span>}
    </div>
  );
}
