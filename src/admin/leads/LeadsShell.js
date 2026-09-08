import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useUser } from '../../contexts/UserContext'
import useWindowSize from '../../hooks/useWindowSize'
import { supabase } from '../../supabaseClient'
import Tabs from '../../design-system/components/Tabs'
import Button from '../../design-system/components/Button'
import EmptyState from '../../design-system/components/EmptyState'
import { useInbox } from './useInbox'
import AbaCaixa from './AbaCaixa'
import AbaHoje from './AbaHoje'
import AbaFunil from './AbaFunil'
import AbaMetricas from './AbaMetricas'

/* ============================================================
   Leads de campanha — shell

   Era um kanban em modo leitura com um link "abrir no WhatsApp". Virou caixa
   de entrada: dá pra responder aqui, com os atalhos do playbook, e o funil
   continua existindo como visão de planejamento.

   Metade das conversas desta caixa é de cliente pagante pedindo suporte, não
   de lead novo — por isso o painel lateral mostra a conta vinculada.
   ============================================================ */

const ABAS = [
  { value: 'caixa',    label: 'Caixa',    icon: 'mdi:inbox-arrow-down-outline' },
  { value: 'hoje',     label: 'Hoje',     icon: 'mdi:calendar-clock' },
  { value: 'funil',    label: 'Funil',    icon: 'mdi:view-column-outline' },
  { value: 'metricas', label: 'Métricas', icon: 'mdi:chart-line' },
]

export default function LeadsShell() {
  const { isAdmin, loading: userLoading } = useUser()
  const navigate = useNavigate()
  const { isMobile, isSmallScreen } = useWindowSize()
  const [params, setParams] = useSearchParams()

  const aba = ABAS.some(a => a.value === params.get('aba')) ? params.get('aba') : 'caixa'
  const [selecionadoId, setSelecionadoId] = useState(null)
  const [respostas, setRespostas] = useState([])

  const inbox = useInbox(isAdmin)

  useEffect(() => {
    if (!userLoading && !isAdmin) navigate('/app/home')
  }, [isAdmin, userLoading, navigate])

  // Respostas rápidas: carregam uma vez e ficam. São dezenas de linhas.
  useEffect(() => {
    if (!isAdmin) return
    let vivo = true
    supabase
      .from('mensalli_respostas_rapidas')
      .select('*')
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .then(({ data, error }) => {
        if (!vivo) return
        // Sem a tabela (migration não rodada) a caixa continua funcionando —
        // só fica sem os atalhos.
        if (error) { console.warn('[leads] respostas rápidas indisponíveis:', error.message); return }
        setRespostas(data || [])
      })
    return () => { vivo = false }
  }, [isAdmin])

  const irPara = useCallback((v) => {
    const p = new URLSearchParams(params)
    p.set('aba', v)
    setParams(p)
  }, [params, setParams])

  const abrirConversa = useCallback((leadId) => {
    setSelecionadoId(leadId)
    irPara('caixa')
  }, [irPara])

  if (userLoading || !isAdmin) return null

  const esperando = inbox.leads.filter(l => l.esperando_resposta).length
  const toquesHoje = inbox.leads.filter(l => l.toque_vencido).length

  // A view antiga não tem as colunas calculadas. Sem esse aviso, a caixa abre
  // vazia (o filtro padrão é "esperando você") e parece bug, não migration.
  const faltaMigration = inbox.leads.length > 0 && inbox.leads[0].esperando_resposta === undefined

  return (
    // O container do <Outlet> no Dashboard é flex com align-items:flex-start,
    // então um filho sem width/alignSelf encolhe até o conteúdo e fica boiando
    // no meio. Aqui a caixa ocupa a tela inteira: largura cheia, altura esticada
    // e o scroll acontece dentro da conversa, não na página.
    <div style={{
      width: '100%', alignSelf: 'stretch', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', minHeight: 0,
      padding: isMobile ? '12px' : '18px 22px'
    }}>
      <button
        onClick={() => navigate('/app/admin')}
        style={{ background: 'transparent', border: 'none', color: '#667eea', cursor: 'pointer', fontSize: '13px', padding: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        <Icon icon="mdi:arrow-left" width="16" /> Voltar ao /admin
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
            Leads de campanha
          </h1>
          <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {inbox.loading ? 'Carregando conversas…' : (
              <>
                <span>{inbox.leads.length} conversas</span>
                {esperando > 0 && (
                  <span style={{ color: '#b91c1c', fontWeight: 600 }}>· {esperando} esperando você</span>
                )}
                <span
                  title={inbox.tempoReal
                    ? 'Mensagens novas aparecem sozinhas'
                    : 'Sem tempo real: atualizando a cada 15 segundos'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: inbox.tempoReal ? '#16a34a' : '#94a3b8' }}
                >
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: inbox.tempoReal ? '#16a34a' : '#cbd5e1' }} />
                  {inbox.tempoReal ? 'ao vivo' : 'atualizando a cada 15s'}
                </span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={inbox.alternarSom}
            title={inbox.somLigado ? 'Som de mensagem nova ligado' : 'Som desligado'}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '36px', height: '36px', cursor: 'pointer',
              backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
              color: inbox.somLigado ? '#334155' : '#cbd5e1'
            }}
          >
            <Icon icon={inbox.somLigado ? 'mdi:volume-high' : 'mdi:volume-off'} width="18" />
          </button>
          <Button variant="outline" icon="mdi:refresh" loading={inbox.loading}
            onClick={() => inbox.recarregar({ sync: true })}>
            Atualizar
          </Button>
        </div>
      </div>

      {faltaMigration && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '9px',
          backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px',
          padding: '11px 13px', marginBottom: '14px', fontSize: '12.5px', color: '#92400e'
        }}>
          <Icon icon="mdi:database-alert-outline" width="18" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong>Falta rodar a migration.</strong> A caixa está lendo a view antiga, sem as colunas
            de espera, não lidas e follow-up. Rode <code>sql-inbox-leads.sql</code> (e depois
            <code> sql-inbox-leads-metricas.sql</code>) no banco para a tela funcionar inteira.
          </div>
        </div>
      )}

      <div style={{ marginBottom: '16px', overflowX: 'auto', paddingBottom: '2px' }}>
        <Tabs
          variant="segmented"
          size={isSmallScreen ? 'sm' : 'md'}
          value={aba}
          onChange={irPara}
          items={ABAS.map(a => (
            a.value === 'hoje' && toquesHoje > 0 ? { ...a, label: `Hoje (${toquesHoje})` } : a
          ))}
        />
      </div>

      {/* A Caixa gerencia o próprio scroll (lista e conversa rolam por dentro);
          as outras abas rolam normalmente dentro deste bloco. */}
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        overflowY: aba === 'caixa' ? 'hidden' : 'auto'
      }}>
        {inbox.erro ? (
          <EmptyState
            variant="error"
            title="Não consegui carregar a caixa"
            description={inbox.erro}
            action={<Button variant="primary" icon="mdi:refresh" onClick={() => inbox.recarregar({ sync: true })}>Tentar de novo</Button>}
          />
        ) : (
          <>
            {aba === 'caixa' && (
              <AbaCaixa
                inbox={inbox}
                respostas={respostas}
                isMobile={isMobile}
                selecionadoId={selecionadoId}
                onSelecionarId={setSelecionadoId}
              />
            )}
            {aba === 'hoje' && (
              <AbaHoje inbox={inbox} respostas={respostas} onAbrirConversa={abrirConversa} />
            )}
            {aba === 'funil' && (
              <AbaFunil inbox={inbox} onAbrirConversa={abrirConversa} />
            )}
            {aba === 'metricas' && (
              <AbaMetricas inbox={inbox} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
