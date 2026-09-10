import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useUser } from '../contexts/UserContext'
import useWindowSize from '../hooks/useWindowSize'
import Tabs from '../design-system/components/Tabs'
import Button from '../design-system/components/Button'
import EmptyState from '../design-system/components/EmptyState'
import useAdminContas from './useAdminContas'
import AbaVisaoGeral from './AbaVisaoGeral'
import AbaContas from './AbaContas'
import AbaFinanceiro from './AbaFinanceiro'
import AbaRetencao from './AbaRetencao'
import AbaNovidades from './AbaNovidades'
import AbaProspeccao from './AbaProspeccao'
import CentralMensagens from '../CentralMensagens'
import ModalEditarConta from './ModalEditarConta'
import ModalDisparo from './ModalDisparo'

/* ============================================================
   CRM Mensalli — shell do /admin

   Substitui o scroll único de 2155 linhas com oito seções empilhadas.
   A aba fica na URL (?aba=), então um KPI da Visão Geral consegue linkar
   direto para a lista filtrada e o admin consegue voltar pelo histórico.
   ============================================================ */

// Mesmo segmented control do Financeiro ("Mensalidades / Vendas / Despesas"),
// agora vindo do DS em vez de copiado à mão. Sem `count`: o chip de contagem só
// tem estilo na variante pills, e a aba Contas já mostra "N de M contas" dentro.
const ABAS = [
  { value: 'visao', label: 'Visão Geral', icon: 'mdi:view-dashboard-outline' },
  { value: 'contas', label: 'Contas', icon: 'mdi:account-group-outline' },
  { value: 'financeiro', label: 'Financeiro', icon: 'mdi:hand-coin-outline' },
  { value: 'retencao', label: 'Retenção', icon: 'mdi:account-heart-outline' },
  // A Central já era admin-only e já cruzava todas as contas — só morava dentro
  // de /app/whatsapp, que é tela de cliente. Aqui ela fica ao lado dos outros
  // painéis cross-conta. O componente é o mesmo dos dois lugares.
  { value: 'mensagens', label: 'Mensagens', icon: 'mdi:message-alert-outline' },
  // Changelog do produto. Fica aqui e não em Marketing porque o público é o
  // mesmo do resto do /admin: todas as contas de uma vez.
  { value: 'novidades', label: 'Atualizações', icon: 'mdi:bullhorn-outline' },
  // Prospecção porta a porta no trajeto casa-trabalho. Mora aqui e não em
  // Marketing porque é ferramenta interna de aquisição, não algo que o cliente
  // da escola vê — e o /admin já é a área restrita a admin.
  { value: 'prospeccao', label: 'Prospecção', icon: 'mdi:map-search-outline' },
]

export default function AdminShell() {
  const { isAdmin, loading: userLoading, userId, chavePix } = useUser()
  const navigate = useNavigate()
  const { isSmallScreen } = useWindowSize()
  const [params, setParams] = useSearchParams()

  const aba = ABAS.some(a => a.value === params.get('aba')) ? params.get('aba') : 'visao'

  // Filtros que a Visão Geral empurra para a aba Contas. Ficam na URL para o
  // "voltar" do navegador funcionar e para o link ser compartilhável.
  //   ciclo  — um dos 7 estados do ciclo de vida
  //   origem — origem do pagamento (mercadopago / manual / nenhum)
  //   foco   — recorte que não é nem ciclo nem origem (ex: pagante sem data)
  const filtrosURL = {
    ciclo: params.get('ciclo') || 'todos',
    origem: params.get('origem') || 'todos',
    foco: params.get('foco') || null,
  }

  const dados = useAdminContas(isAdmin)

  // Modal de edição de conta e modal de disparo, compartilhados entre as abas
  const [contaEditando, setContaEditando] = useState(null)
  const [disparo, setDisparo] = useState(null) // { grupo, lista }

  // A Central de Mensagens tem carga própria. Sem este token, o "Atualizar" do
  // cabeçalho não faria nada na aba dela e pareceria botão quebrado.
  const [tokenAtualizar, setTokenAtualizar] = useState(0)
  const atualizarTudo = () => {
    setTokenAtualizar(t => t + 1)
    return dados.recarregar()
  }

  useEffect(() => {
    if (!userLoading && !isAdmin) navigate('/app/home')
  }, [isAdmin, userLoading, navigate])

  // Monta a URL da aba com os filtros. Só entra na query o que difere do
  // padrão — assim trocar de aba não arrasta filtro de outra tela junto.
  const paramsDe = (novaAba, filtros = {}) => {
    const proximo = { aba: novaAba }
    if (filtros.ciclo && filtros.ciclo !== 'todos') proximo.ciclo = filtros.ciclo
    if (filtros.origem && filtros.origem !== 'todos') proximo.origem = filtros.origem
    if (filtros.foco) proximo.foco = filtros.foco
    return proximo
  }

  const irPara = (novaAba, filtros) => setParams(paramsDe(novaAba, filtros))

  if (userLoading) return null
  if (!isAdmin) return null

  const padding = isSmallScreen ? '16px' : '24px 30px'

  return (
    <div style={{ flex: 1, padding, backgroundColor: '#fff', minHeight: '100vh' }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#344848' }}>CRM Mensalli</h2>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {dados.carregando
              ? 'Carregando contas…'
              : `${dados.contas.length} contas · ${dados.kpis.pagantes} pagando hoje`}
          </div>
        </div>
        <Button
          variant="outline"
          icon="mdi:refresh"
          onClick={atualizarTudo}
          loading={dados.carregando}
        >
          Atualizar
        </Button>
      </div>

      {/* overflow-x: as abas com ícone não cabem em tela estreita, e o
          segmented não quebra linha — rola dentro do próprio container. */}
      <div style={{ marginBottom: 20, overflowX: 'auto', paddingBottom: 2 }}>
        <Tabs
          variant="segmented"
          size={isSmallScreen ? 'sm' : 'md'}
          value={aba}
          onChange={(v) => irPara(v)}
          items={ABAS}
        />
      </div>

      {/* A Central tem fonte de dados própria (vw_central_mensagens), então uma
          falha ao carregar as contas não pode escondê-la — era assim que um erro
          numa view derrubava a tela inteira. */}
      {dados.erro && aba !== 'mensagens' && aba !== 'novidades' ? (
        <EmptyState
          variant="error"
          title="Não foi possível carregar o CRM"
          description={dados.erro}
          action={<Button variant="primary" icon="mdi:refresh" onClick={atualizarTudo}>Tentar de novo</Button>}
        />
      ) : (
        <>
          {aba === 'visao' && (
            <AbaVisaoGeral dados={dados} irPara={irPara} isSmallScreen={isSmallScreen} />
          )}
          {aba === 'contas' && (
            <AbaContas
              dados={dados}
              filtrosURL={filtrosURL}
              // replace: mexer num filtro não empilha entrada no histórico —
              // senão "voltar" percorreria cada clique de chip.
              onFiltrosChange={(filtros) => setParams(paramsDe('contas', filtros), { replace: true })}
              onEditar={setContaEditando}
              isSmallScreen={isSmallScreen}
            />
          )}
          {aba === 'financeiro' && (
            <AbaFinanceiro dados={dados} isSmallScreen={isSmallScreen} />
          )}
          {aba === 'retencao' && (
            <AbaRetencao
              dados={dados}
              onDisparar={setDisparo}
              isSmallScreen={isSmallScreen}
            />
          )}
          {aba === 'mensagens' && (
            <CentralMensagens
              // Já estamos dentro do guard de admin do shell.
              isAdmin
              // O CTA "reconectar" é sobre a conta DONA da mensagem, não sobre
              // a nossa. Dentro de /app/whatsapp ele levava para a conexão do
              // próprio admin, que não resolve nada; daqui vai para o painel
              // que mostra a conexão de todas as contas.
              irParaConexao={() => navigate('/app/admin/whatsapp-saude')}
              recarregarToken={tokenAtualizar}
            />
          )}
          {aba === 'novidades' && <AbaNovidades />}

          {aba === 'prospeccao' && <AbaProspeccao />}
        </>
      )}

      {/* Atalhos para os painéis irmãos — saíram do cabeçalho, onde disputavam
          espaço com o título, e viraram destinos explícitos no rodapé. */}
      <AtalhosAdmin isSmallScreen={isSmallScreen} />

      <ModalEditarConta
        conta={contaEditando}
        onClose={() => setContaEditando(null)}
        onSalvo={dados.recarregar}
        planos={dados.planos}
      />

      <ModalDisparo
        disparo={disparo}
        onClose={() => setDisparo(null)}
        onConcluido={dados.recarregar}
        userId={userId}
        chavePix={chavePix}
        precoDoPlano={dados.precoDoPlano}
        nomeDoPlano={dados.nomeDoPlano}
        isSmallScreen={isSmallScreen}
      />
    </div>
  )
}

/* ---------- Atalhos para as rotas irmãs ---------- */

const PAINEIS = [
  { rota: '/app/admin/leads', label: 'Leads', descricao: 'Funil de quem chamou no WhatsApp', icon: 'mdi:account-multiple-plus' },
  { rota: '/app/admin/cobranca-saas', label: 'Cobrança SaaS', descricao: 'Disparo automático para pagantes', icon: 'mdi:cash-clock' },
  { rota: '/app/admin/whatsapp-saude', label: 'Saúde do WhatsApp', descricao: 'Conexões das contas', icon: 'mdi:heart-pulse' },
  { rota: '/app/admin/whatsapp-master', label: 'WhatsApp Master', descricao: 'Instância do Mensalli', icon: 'mdi:whatsapp' },
  { rota: '/app/admin/erros-mensagens', label: 'Erros de mensagem', descricao: 'Falhas de envio por conta', icon: 'mdi:message-alert' },
  { rota: '/app/admin/cron', label: 'Cron', descricao: 'Jobs agendados do banco', icon: 'mdi:clock-outline' },
]

function AtalhosAdmin({ isSmallScreen }) {
  const navigate = useNavigate()
  return (
    <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--color-border-subtle)' }}>
      <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 12 }}>
        Outros painéis
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isSmallScreen ? 'minmax(0, 1fr)' : 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 10,
      }}>
        {PAINEIS.map(p => (
          <button
            key={p.rota}
            type="button"
            onClick={() => navigate(p.rota)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
              padding: '12px 14px', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border-subtle)',
              backgroundColor: 'var(--color-bg-surface)',
              cursor: 'pointer', width: '100%',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--neutral-50)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-surface)' }}
          >
            <Icon icon={p.icon} width={20} height={20} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {p.label}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                {p.descricao}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
