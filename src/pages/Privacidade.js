import { Link } from 'react-router-dom'

// Política de Privacidade (LGPD) — página pública.
// URL: /privacidade  → https://www.mensalli.com.br/privacidade
// Usada também como URL de política de privacidade do app Meta.
//
// ⚠️ Revisar antes de considerar como documento legal definitivo:
//   - Razão social + CNPJ do controlador (placeholders abaixo)
//   - E-mail de contato do encarregado (DPO)

const ATUALIZADO_EM = '7 de julho de 2026'
const EMAIL_CONTATO = 'privacidade@mensalli.com.br'
const WHATSAPP = 'https://wa.me/5562981618862'

const wrap = {
  maxWidth: 820,
  margin: '0 auto',
  padding: '48px 20px 96px',
  color: '#1f2937',
  lineHeight: 1.7,
  fontSize: 16,
}
const h1 = { fontSize: 32, fontWeight: 800, color: '#111827', margin: '0 0 8px' }
const h2 = { fontSize: 22, fontWeight: 700, color: '#111827', margin: '40px 0 12px' }
const p = { margin: '0 0 14px' }
const li = { margin: '0 0 8px' }
const small = { color: '#6b7280', fontSize: 14 }

export default function Privacidade() {
  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div style={wrap}>
        <Link to="/" style={{ ...small, textDecoration: 'none', color: '#6d4f87', fontWeight: 600 }}>
          ← Voltar para o início
        </Link>

        <h1 style={{ ...h1, marginTop: 24 }}>Política de Privacidade</h1>
        <p style={small}>Última atualização: {ATUALIZADO_EM}</p>

        <p style={{ ...p, marginTop: 24 }}>
          Esta Política de Privacidade descreve como o <strong>Mensalli</strong> ("nós", "plataforma")
          coleta, usa, armazena e protege dados pessoais, em conformidade com a Lei nº 13.709/2018
          (Lei Geral de Proteção de Dados — LGPD). Ao criar uma conta ou utilizar nossos serviços,
          você concorda com as práticas aqui descritas.
        </p>
        <p style={p}>
          <strong>Controlador dos dados:</strong> Mensalli — [Razão Social], inscrita no CNPJ sob o
          nº [CNPJ]. Contato do encarregado (DPO): <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
        </p>

        <h2 style={h2}>1. Quem usa o Mensalli</h2>
        <p style={p}>
          O Mensalli é uma plataforma de gestão e cobrança de mensalidades voltada a profissionais e
          negócios (academias, estúdios, escolas, professores). Tratamos dados em dois papéis:
        </p>
        <ul>
          <li style={li}>
            <strong>Como controladores</strong> dos dados de cadastro do titular da conta (o gestor
            que assina o Mensalli).
          </li>
          <li style={li}>
            <strong>Como operadores</strong> dos dados que o gestor cadastra sobre seus próprios
            alunos/clientes finais, tratando-os apenas conforme as instruções do gestor, que é o
            controlador dessas informações.
          </li>
        </ul>

        <h2 style={h2}>2. Dados que coletamos</h2>
        <p style={p}><strong>Do titular da conta (gestor):</strong></p>
        <ul>
          <li style={li}>Nome, e-mail, telefone/WhatsApp e senha (armazenada de forma criptografada);</li>
          <li style={li}>Dados da empresa (nome, chave PIX) e informações de plano/assinatura;</li>
          <li style={li}>Dados de uso da plataforma, logs de acesso e endereço IP.</li>
        </ul>
        <p style={p}><strong>Dos alunos/clientes finais</strong> (inseridos pelo gestor):</p>
        <ul>
          <li style={li}>Nome, telefone/WhatsApp, dados de responsável, valores e vencimentos de mensalidades;</li>
          <li style={li}>Histórico de cobranças, pagamentos e comunicações enviadas.</li>
        </ul>
        <p style={p}>
          Não coletamos intencionalmente dados sensíveis. Dados de pagamento (cartão) são processados
          diretamente pelos provedores de pagamento e não ficam armazenados em nossos servidores.
        </p>

        <h2 style={h2}>3. Como usamos os dados</h2>
        <ul>
          <li style={li}>Operar a plataforma: gestão de alunos, mensalidades e cobranças;</li>
          <li style={li}>Enviar lembretes e cobranças automáticas por WhatsApp em nome do gestor;</li>
          <li style={li}>Processar pagamentos e emitir links/recibos;</li>
          <li style={li}>Dar suporte, enviar comunicações de serviço e melhorar o produto;</li>
          <li style={li}>Cumprir obrigações legais e prevenir fraudes.</li>
        </ul>

        <h2 style={h2}>4. Base legal</h2>
        <p style={p}>
          Tratamos dados com fundamento na execução do contrato (art. 7º, V da LGPD), no cumprimento
          de obrigação legal (art. 7º, II), no legítimo interesse (art. 7º, IX) e, quando aplicável,
          no consentimento do titular (art. 7º, I).
        </p>

        <h2 style={h2}>5. Compartilhamento com terceiros</h2>
        <p style={p}>
          Compartilhamos dados apenas com prestadores necessários à operação, que atuam como operadores
          sob obrigações de segurança e confidencialidade:
        </p>
        <ul>
          <li style={li}><strong>Supabase</strong> — banco de dados e infraestrutura;</li>
          <li style={li}><strong>Vercel</strong> — hospedagem da aplicação;</li>
          <li style={li}><strong>Asaas</strong> e <strong>Mercado Pago</strong> — processamento de pagamentos (PIX, boleto, cartão);</li>
          <li style={li}><strong>Meta (WhatsApp)</strong> e provedores de API de mensagens — envio de comunicações;</li>
          <li style={li}><strong>Meta Ads / Pixel</strong> — medição de campanhas publicitárias (ver seção 6).</li>
        </ul>
        <p style={p}>Não vendemos dados pessoais a terceiros.</p>

        <h2 style={h2}>6. Cookies e pixel de rastreamento</h2>
        <p style={p}>
          Utilizamos cookies essenciais para o funcionamento da plataforma e o <strong>Meta Pixel</strong>
          {' '}em nossas páginas públicas para medir a eficácia de campanhas e melhorar anúncios. Você pode
          gerenciar cookies nas configurações do seu navegador.
        </p>

        <h2 style={h2}>7. Armazenamento e segurança</h2>
        <p style={p}>
          Adotamos medidas técnicas e organizacionais para proteger os dados, incluindo criptografia em
          trânsito, controle de acesso e isolamento de dados por conta. Ainda assim, nenhum sistema é
          totalmente imune a incidentes; em caso de violação relevante, comunicaremos os titulares e a
          ANPD conforme a LGPD.
        </p>

        <h2 style={h2}>8. Retenção</h2>
        <p style={p}>
          Mantemos os dados pelo tempo necessário às finalidades descritas e ao cumprimento de obrigações
          legais. Encerrada a conta, os dados podem ser eliminados ou anonimizados, ressalvadas as hipóteses
          de guarda obrigatória previstas em lei.
        </p>

        <h2 style={h2}>9. Direitos do titular</h2>
        <p style={p}>Nos termos do art. 18 da LGPD, você pode solicitar:</p>
        <ul>
          <li style={li}>Confirmação da existência de tratamento e acesso aos dados;</li>
          <li style={li}>Correção de dados incompletos, inexatos ou desatualizados;</li>
          <li style={li}>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
          <li style={li}>Portabilidade e informação sobre compartilhamentos;</li>
          <li style={li}>Revogação do consentimento e eliminação dos dados tratados com base nele.</li>
        </ul>
        <p style={p}>
          Titulares de dados de alunos/clientes finais devem, em regra, dirigir suas solicitações ao gestor
          (controlador) que cadastrou tais dados; podemos auxiliar no atendimento como operadores.
        </p>

        <h2 style={h2}>10. Transferência internacional</h2>
        <p style={p}>
          Alguns de nossos prestadores podem processar dados fora do Brasil. Nesses casos, adotamos
          salvaguardas adequadas conforme a LGPD para garantir nível de proteção compatível.
        </p>

        <h2 style={h2}>11. Alterações desta política</h2>
        <p style={p}>
          Podemos atualizar esta Política periodicamente. A versão vigente estará sempre disponível nesta
          página, com a data da última atualização no topo.
        </p>

        <h2 style={h2}>12. Contato</h2>
        <p style={p}>
          Dúvidas ou solicitações sobre privacidade e dados pessoais:
        </p>
        <ul>
          <li style={li}>E-mail: <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a></li>
          <li style={li}>WhatsApp: <a href={WHATSAPP} target="_blank" rel="noreferrer">+55 62 98161-8862</a></li>
        </ul>

        <p style={{ ...small, marginTop: 40 }}>Mensalli — todos os direitos reservados.</p>
      </div>
    </div>
  )
}
