import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function BillingSuccess() {
  const [, navigate] = useLocation();

  useEffect(() => {
    // Redirecionar automaticamente após 5 segundos
    const timer = setTimeout(() => navigate("/"), 5000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-10 text-center">
        <div className="flex justify-center mb-6">
          <CheckCircle2 className="w-16 h-16 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          Assinatura ativada!
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          Bem-vindo ao UnifiquePro Pro! Seu plano foi ativado com sucesso.
          Você será redirecionado automaticamente em alguns segundos.
        </p>
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => navigate("/")}
        >
          Ir para o painel
        </Button>
      </div>
    </div>
  );
}
