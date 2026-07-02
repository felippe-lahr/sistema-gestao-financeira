import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Verifica se o erro é um erro de DOM transiente (removeChild/insertBefore)
 * causado por bibliotecas de terceiros (driver.js, Radix Portals, etc.)
 * que manipulam o DOM fora do controle do React.
 */
function isTransientDOMError(error: Error): boolean {
  const msg = error?.message || "";
  return (
    msg.includes("removeChild") ||
    msg.includes("insertBefore") ||
    msg.includes("appendChild") ||
    msg.includes("not a child of this node") ||
    msg.includes("não é filho deste nó")
  );
}

/**
 * Detecta falha ao carregar um chunk JS lazy-loaded. Acontece quando um
 * novo deploy gera assets com hashes diferentes e o navegador ainda tem o
 * index.html antigo em cache apontando para arquivos que já não existem.
 */
function isChunkLoadError(error: Error): boolean {
  const msg = error?.message || "";
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    /Loading chunk \d+ failed/.test(msg)
  );
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Se for um erro de DOM transiente, tentar se recuperar automaticamente
    if (isTransientDOMError(error)) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidMount() {
    // Se a app montou sem erro de chunk, limpa o flag para que um futuro
    // deploy possa novamente recarregar automaticamente.
    if (!this.state.hasError) {
      sessionStorage.removeItem("chunk-reload-attempt");
    }
  }

  componentDidCatch(error: Error) {
    // Chunk desatualizado após novo deploy: recarregar 1x para pegar o
    // index.html novo. Guarda em sessionStorage para evitar loop infinito.
    if (isChunkLoadError(error)) {
      const RELOAD_FLAG = "chunk-reload-attempt";
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
        return;
      }
    }

    // Se for erro de DOM transiente, limpar resíduos do driver.js e forçar re-render
    if (isTransientDOMError(error)) {
      // Remover overlays do driver.js que possam ter ficado no DOM
      try {
        document.querySelectorAll(".driver-popover, .driver-overlay, .driver-active-element").forEach((el) => {
          el.remove();
        });
        document.querySelectorAll("[class*='driver']").forEach((el) => {
          el.remove();
        });
      } catch {
        // Ignorar erros de limpeza
      }
      // Forçar re-render limpo
      this.setState({ hasError: false, error: null });
      return;
    }
    // Para outros erros, logar no console
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">Ocorreu um erro inesperado.</h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
