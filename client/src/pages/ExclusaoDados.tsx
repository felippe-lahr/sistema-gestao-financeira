import { LegalLayout, LegalSection } from "@/components/LegalLayout";
import { COMPANY } from "@/lib/legal";

const email = COMPANY.email;
const mailto = `mailto:${email}?subject=${encodeURIComponent("Exclusão de dados")}`;

export default function ExclusaoDados() {
  return (
    <LegalLayout title="Exclusão de Dados">
      <p>
        Esta página explica como solicitar a exclusão de dados pessoais tratados pelo{" "}
        {COMPANY.product}, operado por {COMPANY.legalName} ({COMPANY.tradeName}), CNPJ {COMPANY.cnpj},
        em conformidade com a Lei Geral de Proteção de Dados (LGPD).
      </p>

      <LegalSection title="Quem pode solicitar">
        <p>Usuários titulares de uma conta no {COMPANY.product} podem solicitar a exclusão dos seus dados pessoais.</p>
      </LegalSection>

      <LegalSection title="Como solicitar">
        <p>
          Envie um e-mail para{" "}
          <a className="text-[#1a67c2] hover:underline" href={mailto}>{email}</a>{" "}
          com o assunto "Exclusão de dados", informando:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Seu nome completo;</li>
          <li>O e-mail associado à sua conta;</li>
          <li>Telefone associado, se houver.</li>
        </ul>
        <p>Para sua segurança, podemos solicitar informações adicionais para confirmar sua identidade antes de processar o pedido.</p>
      </LegalSection>

      <LegalSection title="O que é excluído">
        <p>
          Mediante confirmação, eliminamos os dados pessoais associados à sua conta, incluindo
          cadastro, transações, contas, cartões, anexos e informações de uso, ressalvadas as
          hipóteses em que a manutenção é exigida por lei (por exemplo, obrigações fiscais e de
          segurança).
        </p>
      </LegalSection>

      <LegalSection title="Prazo">
        <p>
          Processamos as solicitações no menor tempo possível, normalmente em até 30 dias, e
          confirmamos a conclusão pelo mesmo e-mail de contato.
        </p>
      </LegalSection>

      <LegalSection title="Contato">
        <p>
          {COMPANY.legalName} — CNPJ {COMPANY.cnpj}. Dúvidas sobre exclusão de dados ou privacidade:{" "}
          <a className="text-[#1a67c2] hover:underline" href={`mailto:${email}`}>{email}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
