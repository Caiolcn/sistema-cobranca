import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router-dom'
import './OnboardingPainel.css'

/* --------------------------------------------------------------------------
   Painel de primeiros passos, dentro da Home (logo abaixo da saudação).

   Substitui o wizard de 4 passos que travava a entrada e o balão azul que
   flutuava no canto. A ordem aqui NÃO é decorativa:

   1. WhatsApp vem primeiro porque é a métrica de ativação do produto — conta
      que conecta converte muito mais do que conta que não conecta. Quando ele
      era só "mais um item" de checklist, a taxa de conexão caía.
   2. Empresa vem logo atrás porque agora toda conta nasce como "Minha Empresa",
      e esse nome entra em ~15 templates ({{nomeEmpresa}}). Se a pessoa conectar
      o WhatsApp e cobrar antes de renomear, o aluno recebe "bem-vindo à Minha
      Empresa".

   Só o primeiro passo pendente fica em destaque — os outros ficam compactos,
   pra não virar uma parede de 4 CTAs concorrendo entre si.
-------------------------------------------------------------------------- */
const STEPS = [
  {
    key: 'whatsapp',
    title: 'Conecte seu WhatsApp',
    description: 'É daqui que saem as cobranças automáticas, do seu próprio número. Leva 1 minuto: é só ler um QR Code.',
    descriptionCurta: 'Cobre pelo seu número',
    icon: 'mdi:whatsapp',
    actionLabel: 'Conectar agora',
    route: '/app/whatsapp'
  },
  {
    key: 'empresa',
    title: 'Dê o nome da sua empresa',
    description: 'Suas mensagens estão saindo como "Minha Empresa". Troque pelo nome real pra o aluno reconhecer quem está cobrando.',
    descriptionCurta: 'Hoje está "Minha Empresa"',
    icon: 'mdi:office-building-outline',
    actionLabel: 'Colocar o nome',
    route: '/app/configuracao?aba=empresa'
  },
  {
    key: 'cliente',
    title: 'Cadastre seu primeiro aluno',
    description: 'Com o aluno e a mensalidade no sistema, a régua de cobrança começa a rodar sozinha.',
    descriptionCurta: 'Pra começar a cobrar',
    icon: 'mdi:account-plus-outline',
    actionLabel: 'Adicionar aluno',
    route: '/app/clientes'
  },
  {
    key: 'pix',
    title: 'Configure sua chave PIX',
    description: 'A chave vai junto da cobrança, então o aluno paga sem precisar te perguntar nada.',
    descriptionCurta: 'Onde você recebe as mensalidades',
    icon: 'mdi:qrcode',
    actionLabel: 'Configurar PIX',
    route: '/app/configuracao?aba=integracoes'
  }
]

// O estado recolhido fica no navegador: sem isso o painel voltava aberto a cada
// reload, e o botão de fechar não valia de nada.
const CHAVE_RECOLHIDO = 'mensalli_onboarding_painel_recolhido'

const lerRecolhido = () => {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDO) === '1'
  } catch {
    return false
  }
}

export default function OnboardingPainel({ completedSteps }) {
  const navigate = useNavigate()
  const [recolhido, setRecolhido] = useState(lerRecolhido)

  const alternarRecolhido = (valor) => {
    setRecolhido(valor)
    try {
      localStorage.setItem(CHAVE_RECOLHIDO, valor ? '1' : '0')
    } catch {
      /* localStorage indisponível — o estado ainda vale para esta sessão */
    }
  }

  const concluidos = STEPS.filter((s) => completedSteps[s.key]).length
  if (concluidos === STEPS.length) return null

  const percentual = Math.round((concluidos / STEPS.length) * 100)
  const destaque = STEPS.find((s) => !completedSteps[s.key])
  const secundarios = STEPS.filter((s) => s.key !== destaque.key)

  return (
    <div className={`onb-painel ${recolhido ? 'recolhido' : ''}`}>
      <div className="onb-painel-topo">
        <div className="onb-painel-titulo-bloco">
          <div className="onb-painel-icone">
            <Icon icon="mdi:rocket-launch-outline" width="20" />
          </div>
          <div>
            <h2 className="onb-painel-titulo">Vamos deixar tudo pronto?</h2>
            <p className="onb-painel-sub">
              Faltam {STEPS.length - concluidos} {STEPS.length - concluidos === 1 ? 'passo' : 'passos'} pra sua cobrança rodar no automático
            </p>
          </div>
        </div>

        <div className="onb-painel-progresso">
          <div className="onb-painel-barra">
            <div className="onb-painel-barra-fill" style={{ width: `${percentual}%` }} />
          </div>
          <span className="onb-painel-contagem">{concluidos}/{STEPS.length}</span>
          <button
            type="button"
            className="onb-painel-toggle"
            onClick={() => alternarRecolhido(!recolhido)}
            aria-label={recolhido ? 'Expandir primeiros passos' : 'Recolher primeiros passos'}
          >
            <Icon icon={recolhido ? 'mdi:chevron-down' : 'mdi:chevron-up'} width="20" />
          </button>
        </div>
      </div>

      {!recolhido && (
        <div className="onb-painel-corpo">
          {/* Passo em foco: o próximo pendente, com o CTA de verdade */}
          <button
            type="button"
            className={`onb-destaque ${destaque.key === 'whatsapp' ? 'zap' : ''}`}
            onClick={() => navigate(destaque.route)}
          >
            <div className="onb-destaque-icone">
              <Icon icon={destaque.icon} width="26" />
            </div>
            <div className="onb-destaque-texto">
              <span className="onb-destaque-titulo">{destaque.title}</span>
              <span className="onb-destaque-desc">{destaque.description}</span>
            </div>
            <span className="onb-destaque-cta">
              {destaque.actionLabel}
              <Icon icon="mdi:arrow-right" width="18" />
            </span>
          </button>

          {/* Os demais ficam compactos: informam o que falta sem disputar o clique */}
          <div className="onb-secundarios">
            {secundarios.map((step) => {
              const feito = completedSteps[step.key]
              return (
                <button
                  type="button"
                  key={step.key}
                  className={`onb-secundario ${feito ? 'feito' : ''}`}
                  onClick={() => navigate(step.route)}
                >
                  <span className={`onb-secundario-check ${feito ? 'feito' : ''}`}>
                    <Icon icon={feito ? 'mdi:check' : step.icon} width="15" />
                  </span>
                  <span className="onb-secundario-texto">
                    <span className="onb-secundario-titulo">{step.title}</span>
                    <span className="onb-secundario-desc">
                      {feito ? 'Tudo certo' : step.descriptionCurta}
                    </span>
                  </span>
                  {!feito && <Icon icon="mdi:chevron-right" width="18" className="onb-secundario-seta" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
