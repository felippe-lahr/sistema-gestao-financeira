import { ReactNode } from "react";
import { COMPANY } from "@/lib/legal";
import { LegalFooter } from "./LegalFooter";

/**
 * Layout comum das páginas legais (Termos, Privacidade, Exclusão de Dados).
 * Página pública, sem autenticação.
 */
export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 flex flex-col">
      <header className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="font-bold text-lg text-[#1a67c2]">{COMPANY.product}</a>
          <a href="/" className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">← Voltar ao app</a>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-1">{title}</h1>
        <p className="text-sm text-gray-500 mb-6">Última atualização: {COMPANY.updatedAt}</p>
        <div className="legal-prose space-y-4 text-[15px] leading-relaxed">{children}</div>
      </main>

      <div className="border-t border-gray-200 dark:border-gray-800">
        <LegalFooter />
      </div>
    </div>
  );
}

/** Título de seção padronizado. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-2">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
