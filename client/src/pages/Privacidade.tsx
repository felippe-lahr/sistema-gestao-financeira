import { LegalLayout, LegalSection } from "@/components/LegalLayout";
import { COMPANY } from "@/lib/legal";

const email = COMPANY.email;

export default function Privacidade() {
  return (
    <LegalLayout title="Política de Privacidade">
      <p>
        Esta Política de Privacidade descreve como o {COMPANY.product}, plataforma de gestão
        financeira operada por {COMPANY.legalName} ({COMPANY.tradeName}), inscrita no CNPJ sob o
        nº {COMPANY.cnpj} ("nós"), coleta, utiliza, armazena e protege dados pessoais, em
        conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados — LGPD).
      </p>

      <LegalSection title="1. Quem é o controlador">
        <p>
          O controlador dos dados tratados na plataforma é {COMPANY.legalName}. Para assuntos de
          privacidade, entre em contato pelo e-mail <a className="text-[#1a67c2] hover:underline" href={`mailto:${email}`}>{email}</a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Dados que coletamos">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Cadastro e conta:</strong> nome, e-mail, senha (armazenada de forma cifrada/hash) e, quando informado, telefone.</li>
          <li><strong>Autenticação:</strong> ao entrar com o Google, recebemos dados básicos de perfil (nome e e-mail). Se você conectar o Google Calendar, tratamos o token de acesso apenas para sincronizar seus compromissos da Agenda.</li>
          <li><strong>Dados financeiros inseridos por você:</strong> entidades, receitas, despesas, contas, cartões, categorias, investimentos e agenda — cadastrados manualmente ou importados por você. <strong>Não acessamos suas contas bancárias nem coletamos senhas de banco:</strong> a importação de extratos (OFX) e faturas (PDF/imagem) ocorre apenas a partir de arquivos que você mesmo envia.</li>
          <li><strong>Documentos/anexos:</strong> comprovantes, notas e faturas que você anexa às transações.</li>
          <li><strong>Assistente por WhatsApp (opcional):</strong> se você conectar o bot, tratamos seu número e as mensagens (texto, áudio, imagem) enviadas para lançar transações e agendamentos.</li>
          <li><strong>Pagamento:</strong> assinaturas são processadas por parceiro de pagamento. <strong>Não armazenamos dados do seu cartão</strong> — eles são inseridos diretamente no ambiente seguro do processador.</li>
          <li><strong>Uso e técnicos:</strong> registros de acesso, cookies estritamente necessários e métricas agregadas de uso.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Como usamos os dados">
        <ul className="list-disc pl-5 space-y-1">
          <li>Prestar e operar a plataforma de gestão financeira.</li>
          <li>Processar assinaturas, pagamentos e enviar comunicações transacionais.</li>
          <li>Oferecer funcionalidades como importação de extratos/faturas com auxílio de inteligência artificial, transcrição de mensagens de voz e sincronização com o Google Calendar.</li>
          <li>Garantir segurança, prevenir fraudes e cumprir obrigações legais.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Bases legais">
        <p>
          Tratamos dados com fundamento na execução de contrato, no cumprimento de obrigação legal,
          no legítimo interesse e no consentimento, conforme aplicável.
        </p>
      </LegalSection>

      <LegalSection title="5. Compartilhamento com terceiros">
        <p>Compartilhamos dados apenas com prestadores necessários à operação, incluindo:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Google</strong> — login (OAuth) e integração opcional com o Google Calendar.</li>
          <li><strong>Amazon Web Services (S3)</strong> — armazenamento de documentos e anexos.</li>
          <li><strong>Provedor de hospedagem em nuvem</strong> — infraestrutura de aplicação e banco de dados.</li>
          <li><strong>Processador de pagamentos</strong> — cobrança e gestão de assinaturas.</li>
          <li><strong>Provedores de inteligência artificial</strong> — leitura de faturas/extratos e transcrição de áudio, quando o recurso é utilizado.</li>
          <li><strong>WhatsApp Business Platform (Meta)</strong> — quando você usa o assistente por WhatsApp.</li>
          <li><strong>Provedor de e-mail transacional</strong> — envio de e-mails (verificação, recuperação de senha).</li>
        </ul>
        <p><strong>Não vendemos dados pessoais.</strong></p>
      </LegalSection>

      <LegalSection title="6. Armazenamento e segurança">
        <p>
          Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo tráfego
          cifrado (HTTPS/HSTS), segregação de dados por usuário e por entidade, cifragem de
          credenciais sensíveis e controles de acesso. Nenhum método é 100% infalível, mas
          trabalhamos continuamente para mitigar riscos.
        </p>
      </LegalSection>

      <LegalSection title="7. Retenção">
        <p>
          Mantemos os dados pelo tempo necessário à prestação do serviço e ao cumprimento de
          obrigações legais. Após o encerramento da conta, os dados podem ser eliminados ou
          anonimizados, ressalvadas as hipóteses de guarda legal (por exemplo, obrigações fiscais).
        </p>
      </LegalSection>

      <LegalSection title="8. Direitos do titular">
        <p>
          Nos termos da LGPD, você pode solicitar confirmação de tratamento, acesso, correção,
          anonimização, portabilidade, eliminação e informações sobre compartilhamento. Para
          exercer seus direitos, contate <a className="text-[#1a67c2] hover:underline" href={`mailto:${email}`}>{email}</a>.
          A exclusão de dados também pode ser solicitada pela página <a className="text-[#1a67c2] hover:underline" href="/exclusao-de-dados">Exclusão de Dados</a>.
        </p>
      </LegalSection>

      <LegalSection title="9. Cookies">
        <p>
          Utilizamos cookies estritamente necessários para autenticação e funcionamento da
          plataforma, além de métricas agregadas de uso para melhorar o serviço.
        </p>
      </LegalSection>

      <LegalSection title="10. Transferência internacional">
        <p>
          Alguns prestadores podem processar dados fora do Brasil. Nesses casos, adotamos
          salvaguardas adequadas conforme a LGPD.
        </p>
      </LegalSection>

      <LegalSection title="11. Alterações">
        <p>
          Podemos atualizar esta Política periodicamente. A data da última atualização é indicada
          no topo desta página.
        </p>
      </LegalSection>

      <LegalSection title="12. Contato">
        <p>
          Dúvidas sobre privacidade: <a className="text-[#1a67c2] hover:underline" href={`mailto:${email}`}>{email}</a> — {COMPANY.legalName}, CNPJ {COMPANY.cnpj}.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
