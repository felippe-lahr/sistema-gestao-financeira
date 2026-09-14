import { useEffect, useState } from "react";

const STORAGE_KEY = "up_cookie_consent_v1";

/**
 * Aviso de cookies (LGPD). Informa o uso de cookies necessários + métricas de
 * uso e registra o ciente do usuário no localStorage.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      /* localStorage indisponível — não bloqueia a app */
    }
  }, []);

  const accept = () => {
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[60] p-3 sm:p-4">
      <div className="mx-auto max-w-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-300 flex-1">
          Usamos cookies necessários ao funcionamento e métricas de uso para melhorar a experiência.
          Saiba mais na nossa{" "}
          <a href="/privacidade" className="text-[#1a67c2] hover:underline">Política de Privacidade</a>.
        </p>
        <button
          onClick={accept}
          className="shrink-0 bg-[#1a67c2] hover:bg-[#1558a8] text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
