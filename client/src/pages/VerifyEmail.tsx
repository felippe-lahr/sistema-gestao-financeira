import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, XCircle, Loader2, Mail } from "lucide-react";

type Status = "loading" | "success" | "error" | "expired";

export default function VerifyEmail() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const verify = async () => {
      // Ler o token da query string: /verificar-email?token=...
      const urlParams = new URLSearchParams(search);
      const token = urlParams.get("token");

      if (!token) {
        setStatus("error");
        setErrorMessage("Token de verificação não encontrado na URL.");
        return;
      }

      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();

        if (response.ok) {
          setStatus("success");
          // Redirecionar para o sistema após 2.5 segundos
          setTimeout(() => {
            window.location.href = "/";
          }, 2500);
        } else if (response.status === 410) {
          setStatus("expired");
        } else {
          const msg: string = data.error || "";
          if (msg.toLowerCase().includes("expir")) {
            setStatus("expired");
          } else {
            setStatus("error");
            setErrorMessage(msg || "Não foi possível verificar o e-mail.");
          }
        }
      } catch {
        setStatus("error");
        setErrorMessage("Erro de conexão. Tente novamente.");
      }
    };

    verify();
  }, [search]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="pt-10 pb-10 text-center space-y-6">
          {/* Logo UnifiquePro */}
          <div className="flex justify-center">
            <img src="/logo-unifique-pro.png" alt="UnifiquePro" style={{ width: '280px' }} className="h-auto object-contain dark:hidden" />
            <img src="/logo-unifique-pro-dark.png" alt="UnifiquePro" style={{ width: '280px' }} className="h-auto object-contain hidden dark:block" />
          </div>

          {/* Loading */}
          {status === "loading" && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <Loader2 className="h-10 w-10 text-blue-600 dark:text-blue-400 animate-spin" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Verificando e-mail...</h2>
                <p className="text-muted-foreground text-sm">
                  Aguarde enquanto ativamos sua conta.
                </p>
              </div>
            </>
          )}

          {/* Sucesso */}
          {status === "success" && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                  <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-green-700 dark:text-green-400">
                  E-mail verificado!
                </h2>
                <p className="text-muted-foreground text-sm">
                  Sua conta foi ativada com sucesso. Redirecionando para o sistema...
                </p>
              </div>
              <div className="flex justify-center">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-green-500 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Token expirado */}
          {status === "expired" && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                  <Mail className="h-10 w-10 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Link expirado</h2>
                <p className="text-muted-foreground text-sm">
                  Este link de verificação expirou. Os links são válidos por 24 horas.
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  onClick={() => navigate("/signup")}
                  className="w-full"
                >
                  Criar nova conta
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="w-full"
                >
                  Voltar para o login
                </Button>
              </div>
            </>
          )}

          {/* Erro genérico */}
          {status === "error" && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                  <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Verificação falhou</h2>
                <p className="text-muted-foreground text-sm">
                  {errorMessage || "Não foi possível verificar o e-mail. O link pode ser inválido."}
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  onClick={() => navigate("/signup")}
                  className="w-full"
                >
                  Criar nova conta
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="w-full"
                >
                  Voltar para o login
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
