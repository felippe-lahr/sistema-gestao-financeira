import { COMPANY } from "@/lib/legal";

/**
 * Rodapé institucional com identificação da empresa e links legais.
 * Usado nas telas públicas (login, cadastro) e nas páginas legais —
 * transparência exigida pelas diretrizes do Google e pela LGPD.
 */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`w-full text-center text-xs text-gray-500 dark:text-gray-400 py-6 px-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mb-2">
        <a href="/termos" className="hover:underline hover:text-gray-700 dark:hover:text-gray-200">Termos de Uso</a>
        <span aria-hidden>·</span>
        <a href="/privacidade" className="hover:underline hover:text-gray-700 dark:hover:text-gray-200">Política de Privacidade</a>
        <span aria-hidden>·</span>
        <a href="/exclusao-de-dados" className="hover:underline hover:text-gray-700 dark:hover:text-gray-200">Exclusão de Dados</a>
        <span aria-hidden>·</span>
        <a href={`mailto:${COMPANY.email}`} className="hover:underline hover:text-gray-700 dark:hover:text-gray-200">Contato</a>
      </div>
      <p>
        © {new Date().getFullYear()} {COMPANY.product} — {COMPANY.legalName} · CNPJ {COMPANY.cnpj}
      </p>
    </footer>
  );
}
