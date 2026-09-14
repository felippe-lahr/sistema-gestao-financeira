import { COMPANY } from "@/lib/legal";

/**
 * Rodapé institucional — duas linhas:
 *  1) links legais;  2) identificação da empresa.
 * Usado nas páginas legais e na tela de login (transparência exigida pelas
 * diretrizes do Google e pela LGPD).
 */
export function LegalFooter({ className = "" }: { className?: string }) {
  const link = "text-gray-500 dark:text-gray-400 hover:text-[#1a67c2] dark:hover:text-[#4d94e0] transition-colors";
  return (
    <footer className={`w-full border-t border-gray-200/70 dark:border-gray-800 py-5 px-4 ${className}`}>
      {/* Linha 1 — links legais */}
      <nav className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] font-medium">
        <a href="/termos" className={link}>Termos de Uso</a>
        <span className="text-gray-300 dark:text-gray-700" aria-hidden>·</span>
        <a href="/privacidade" className={link}>Política de Privacidade</a>
        <span className="text-gray-300 dark:text-gray-700" aria-hidden>·</span>
        <a href="/exclusao-de-dados" className={link}>Exclusão de Dados</a>
        <span className="text-gray-300 dark:text-gray-700" aria-hidden>·</span>
        <a href={`mailto:${COMPANY.email}`} className={link}>Contato</a>
      </nav>

      {/* Linha 2 — identificação da empresa */}
      <p className="mt-2 text-center text-[11px] text-gray-400 dark:text-gray-500">
        © {new Date().getFullYear()} {COMPANY.product} · {COMPANY.legalName} · CNPJ {COMPANY.cnpj}
      </p>
    </footer>
  );
}
