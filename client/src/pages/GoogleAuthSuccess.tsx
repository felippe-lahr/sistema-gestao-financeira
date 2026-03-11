import { useEffect } from "react";

/**
 * Página intermediária após login bem-sucedido via Google OAuth.
 * Configura o localStorage e redireciona para o dashboard.
 */
export default function GoogleAuthSuccess() {
  useEffect(() => {
    // Definir valores financeiros como ocultos por padrão (mesmo comportamento do login por senha)
    localStorage.setItem("showFinancialValues", JSON.stringify(false));
    // Google OAuth não tem "lembrar-me" — usar comportamento padrão (sem rememberMe)
    localStorage.setItem("rememberMe", JSON.stringify(false));
    // Redirecionar para o dashboard
    window.location.href = "/";
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Entrando...</p>
      </div>
    </div>
  );
}
