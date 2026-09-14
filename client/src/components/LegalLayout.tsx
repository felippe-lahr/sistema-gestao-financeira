import { ReactNode } from "react";
import { COMPANY } from "@/lib/legal";
import { LegalFooter } from "./LegalFooter";

/**
 * Layout comum das páginas legais (Termos, Privacidade, Exclusão de Dados).
 * Página pública, sem autenticação — visual institucional profissional.
 */
export function LegalLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-gray-950 text-gray-800 dark:text-gray-200 flex flex-col">
      {/* Header da marca */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-[#1a67c2] to-[#1558a8] shadow-sm">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center" aria-label="UnifiquePro">
            <img src="/logo-unifique-pro-white.png" alt="UnifiquePro" className="h-7 w-auto" />
          </a>
          <a
            href="/"
            className="text-sm font-medium text-white/90 hover:text-white transition-colors inline-flex items-center gap-1.5"
          >
            <span aria-hidden>←</span> Voltar ao app
          </a>
        </div>
      </header>

      {/* Conteúdo em cartão */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-5 py-8 sm:py-10">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 px-6 sm:px-10 py-8 sm:py-10">
          <div className="mb-8 pb-6 border-b border-gray-100 dark:border-gray-800">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{title}</h1>
            {subtitle && <p className="mt-2 text-gray-500 dark:text-gray-400">{subtitle}</p>}
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#1a67c2] bg-[#1a67c2]/10 rounded-full px-3 py-1">
              Última atualização: {COMPANY.updatedAt}
            </p>
          </div>
          <div className="text-[15px] leading-7 text-gray-700 dark:text-gray-300 space-y-5">{children}</div>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}

/** Seção padronizada com título e conteúdo. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="scroll-mt-20">
      <h2 className="text-[17px] font-semibold text-gray-900 dark:text-white mb-2.5">{title}</h2>
      <div className="space-y-3 [&_ul]:space-y-1.5 [&_a]:font-medium">{children}</div>
    </section>
  );
}
