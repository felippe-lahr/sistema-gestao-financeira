import { LegalLayout, LegalSection } from "@/components/LegalLayout";
import { COMPANY } from "@/lib/legal";

const email = COMPANY.email;

export default function Termos() {
  return (
    <LegalLayout title="Termos de Uso">
      <p>
        Estes Termos de Uso ("Termos") regem o uso da plataforma {COMPANY.product}, operada por{" "}
        {COMPANY.legalName} ({COMPANY.tradeName}), CNPJ {COMPANY.cnpj}. Ao criar uma conta ou
        utilizar a plataforma, você concorda com estes Termos.
      </p>

      <LegalSection title="1. Descrição do serviço">
        <p>
          O {COMPANY.product} é uma plataforma de gestão financeira pessoal e empresarial:
          lançamento de receitas e despesas, contas bancárias, cartões de crédito e faturas,
          investimentos, agenda de compromissos, importação de extratos (OFX) e faturas
          (PDF/imagem) com auxílio de inteligência artificial e um assistente por WhatsApp. O
          serviço depende de integrações de terceiros (Google, Meta/WhatsApp, provedores de
          inteligência artificial e de pagamento).
        </p>
      </LegalSection>

      <LegalSection title="2. Cadastro e conta">
        <p>
          Você deve fornecer informações verdadeiras e manter suas credenciais em sigilo. Você é
          responsável por toda atividade realizada em sua conta. É necessário ter capacidade legal
          para contratar.
        </p>
      </LegalSection>

      <LegalSection title="3. Planos, pagamento e assinatura">
        <ul className="list-disc pl-5 space-y-1">
          <li>Os planos e valores vigentes são apresentados na plataforma no momento da contratação.</li>
          <li>As assinaturas são cobradas de forma recorrente até o cancelamento.</li>
          <li>Os pagamentos são processados por parceiro especializado; impostos aplicáveis podem incidir.</li>
          <li>O cancelamento pode ser feito pelo próprio painel; o acesso permanece até o fim do período já pago, salvo disposição em contrário.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Direito de arrependimento e reembolso">
        <p>
          Nos termos do art. 49 do Código de Defesa do Consumidor, você pode solicitar o
          cancelamento da contratação em até <strong>7 (sete) dias</strong> a contar da assinatura,
          com reembolso do valor pago no período. Após esse prazo, o cancelamento interrompe as
          cobranças futuras e o acesso permanece até o fim do período já pago.
        </p>
      </LegalSection>

      <LegalSection title="5. Uso aceitável">
        <p>Ao usar a plataforma, você concorda em não:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Utilizar o serviço para fins ilícitos ou em violação à legislação aplicável.</li>
          <li>Inserir dados falsos ou de terceiros sem a devida autorização.</li>
          <li>Comprometer a segurança, integridade ou disponibilidade da plataforma.</li>
          <li>Tentar acessar dados ou contas de outros usuários.</li>
        </ul>
        <p>O descumprimento pode levar à suspensão ou encerramento da conta, sem prejuízo de outras medidas.</p>
      </LegalSection>

      <LegalSection title="6. Natureza informativa — não é aconselhamento">
        <p>
          O {COMPANY.product} é uma <strong>ferramenta de organização e controle financeiro</strong> e{" "}
          <strong>não presta aconselhamento financeiro, contábil, jurídico ou de investimentos</strong>.
          Informações de terceiros (como cotações do Tesouro Direto/SELIC) têm caráter meramente
          informativo. As decisões tomadas com base nos dados são de responsabilidade exclusiva do
          usuário.
        </p>
      </LegalSection>

      <LegalSection title="7. Propriedade intelectual">
        <p>
          A plataforma, marca e conteúdos do {COMPANY.product} pertencem a {COMPANY.legalName}. Estes
          Termos não transferem qualquer direito de propriedade intelectual, exceto a licença de uso
          limitada para utilizar o serviço. Os dados que você insere permanecem seus.
        </p>
      </LegalSection>

      <LegalSection title="8. Disponibilidade">
        <p>
          Empenhamo-nos para manter o serviço disponível, mas ele é fornecido "como está", podendo
          haver interrupções para manutenção, falhas de terceiros ou eventos fora de nosso controle.
          Não garantimos operação ininterrupta.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitação de responsabilidade">
        <p>
          Na máxima extensão permitida em lei, não nos responsabilizamos por danos indiretos, lucros
          cessantes ou perdas decorrentes de indisponibilidade, de decisões de plataformas de
          terceiros ou do uso indevido da plataforma.
        </p>
      </LegalSection>

      <LegalSection title="10. Rescisão">
        <p>
          Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar o acesso em
          caso de violação destes Termos ou das políticas aplicáveis.
        </p>
      </LegalSection>

      <LegalSection title="11. Alterações dos Termos">
        <p>
          Podemos atualizar estes Termos periodicamente. Alterações relevantes serão comunicadas, e o
          uso continuado após a vigência implica concordância.
        </p>
      </LegalSection>

      <LegalSection title="12. Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro do domicílio da
          contratante para dirimir controvérsias, salvo disposição legal em contrário.
        </p>
      </LegalSection>

      <LegalSection title="13. Contato">
        <p>
          {COMPANY.legalName} — CNPJ {COMPANY.cnpj}. Contato:{" "}
          <a className="text-[#1a67c2] hover:underline" href={`mailto:${email}`}>{email}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
