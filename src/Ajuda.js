import { Icon } from '@iconify/react'
import './Ajuda.css'

const FAQ_ITEMS = [
  {
    pergunta: 'Como funciona a cobrança automática?',
    resposta: 'O Mensalli envia lembretes automáticos via WhatsApp em até 3 momentos: 3 dias antes do vencimento, no dia do vencimento e 3 dias após. Cada automação pode ser ativada ou desativada individualmente em Configurações. As mensagens são enviadas apenas para alunos com mensalidades pendentes.'
  },
  {
    pergunta: 'Como conectar meu WhatsApp?',
    resposta: 'Acesse o menu WhatsApp na barra lateral e escolha entre duas formas: escanear o QR Code com seu celular ou usar o código de pareamento (ideal para conectar pelo próprio celular). Vá em WhatsApp → Dispositivos conectados → Conectar dispositivo. A conexão é feita em segundos e seu WhatsApp continua funcionando normalmente.'
  },
  {
    pergunta: 'Posso personalizar as mensagens?',
    resposta: 'Sim! Você pode personalizar todos os templates de mensagens em Configurações → Templates de Mensagens. Cada template suporta variáveis dinâmicas como nome do aluno, data de vencimento, valor e chave PIX. O número de templates editáveis depende do seu plano.'
  },
  {
    pergunta: 'Como meus alunos pagam?',
    resposta: 'Seus alunos recebem um link de pagamento via WhatsApp com a opção de pagar por PIX (QR Code ou copia e cola). Basta configurar sua chave PIX em Configurações → Dados da Empresa. O pagamento é rápido e seguro.'
  },
  {
    pergunta: 'Posso importar meus alunos de uma planilha?',
    resposta: 'Sim! Na página de Alunos, clique em "Importar CSV". O sistema aceita arquivos .csv com campos como nome, telefone, CPF, plano e data de vencimento. Há um modelo disponível para download. O sistema detecta automaticamente as colunas e valida os dados antes de importar.'
  },
  {
    pergunta: 'Como funciona a grade de horários?',
    resposta: 'A grade de horários permite organizar os horários das suas turmas e vincular alunos a cada horário. Você pode filtrar por dia da semana, buscar por aluno e o sistema envia lembretes automáticos 1 hora antes de cada aula via WhatsApp.'
  },
  {
    pergunta: 'Posso controlar minhas despesas?',
    resposta: 'Sim! O módulo de Despesas permite cadastrar gastos com categorias personalizadas, definir recorrência (mensal, semanal, etc.) e acompanhar o que está pendente ou pago. Você também pode exportar relatórios em CSV e PDF.'
  },
  {
    pergunta: 'Meus dados estão seguros?',
    resposta: 'Sim! Utilizamos criptografia de ponta a ponta, autenticação segura e armazenamento em nuvem com backup automático. Seus dados e os dados dos seus alunos estão protegidos com os mais altos padrões de segurança.'
  }
]

export default function Ajuda() {
  const abrirWhatsApp = () => {
    window.open('https://wa.me/5562981618862?text=Olá! Preciso de ajuda com o Mensalli', '_blank')
  }

  return (
    <div className="ajuda-container">
      {/* Header com botão de suporte */}
      <div className="ajuda-header">
        <div>
          <h1>Central de Ajuda</h1>
          <p>Estamos aqui para ajudar você a aproveitar ao máximo o Mensalli</p>
        </div>
        <button className="ajuda-whatsapp-btn" onClick={abrirWhatsApp}>
          <Icon icon="mdi:whatsapp" width="18" />
          Falar com Suporte
        </button>
      </div>

      {/* FAQ */}
      <h2 className="ajuda-faq-title">Perguntas Frequentes</h2>
      <div className="ajuda-faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i} className="ajuda-faq-item">
            <div className="ajuda-faq-question">
              <div className="ajuda-faq-question-icon">
                <Icon icon="mdi:help-circle-outline" width="18" />
              </div>
              <span>{item.pergunta}</span>
            </div>
            <div className="ajuda-faq-answer">{item.resposta}</div>
          </div>
        ))}
      </div>

      {/* Card final */}
      <div className="ajuda-bottom-card">
        <h3>Não encontrou o que procurava?</h3>
        <p>Entre em contato conosco e teremos prazer em ajudar!</p>
        <button className="ajuda-bottom-btn" onClick={abrirWhatsApp}>
          <Icon icon="mdi:whatsapp" width="18" />
          Falar com Suporte
        </button>
      </div>
      <div style={{ height: '60px' }} />
    </div>
  )
}
