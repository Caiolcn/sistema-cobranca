import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import StatCard from '../../design-system/components/StatCard'
import Table from '../../design-system/components/Table'
import EmptyState from '../../design-system/components/EmptyState'
import { COLUNAS, formatarDataCurta } from './utils'

// Os cinco números do playbook (docs/playbook-leads-campanha.html, "Termômetro").
// Se a conversão cair, é um destes que quebrou — medir só o total não diz onde
// consertar. As mesmas views respondem por SQL, para análise fora da tela.

const minutos = (m) => {
  if (m === null || m === undefined) return '—'
  const n = Number(m)
  if (n < 60) return `${Math.round(n)} min`
  const h = n / 60
  if (h < 24) return `${h.toFixed(1)} h`
  return `${(h / 24).toFixed(1)} d`
}

const pct = (parte, total) => (!total ? '—' : `${Math.round((parte / total) * 100)}%`)

const rotuloStatus = (id) => COLUNAS.find(c => c.id === id)?.titulo || id

export default function AbaMetricas({ inbox }) {
  const { leads } = inbox
  const [funil, setFunil] = useState([])
  const [semanas, setSemanas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const [f, s] = await Promise.all([
          supabase.from('vw_mensalli_funil').select('*'),
          supabase.from('vw_mensalli_funil_semana').select('*').limit(12)
        ])
        if (!vivo) return
        if (f.error) throw f.error
        if (s.error) throw s.error
        setFunil(f.data || [])
        setSemanas(s.data || [])
        setErro(null)
      } catch (e) {
        if (vivo) setErro(e.message || 'Não consegui ler as métricas')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [])

  const totais = useMemo(() => {
    const leadsTotal = funil.reduce((s, r) => s + Number(r.leads || 0), 0)
    const nuncaRespondidos = funil.reduce((s, r) => s + Number(r.nunca_respondidos || 0), 0)
    const pagantes = Number(funil.find(r => r.status === 'pagante')?.leads || 0)
    const contas = Number(funil.find(r => r.status === 'criou_conta')?.leads || 0)
    return { leadsTotal, nuncaRespondidos, pagantes, contas }
  }, [funil])

  const esperandoAgora = leads.filter(l => l.esperando_resposta).length
  const toquesHoje = leads.filter(l => l.toque_vencido).length
  const semanaAtual = semanas[0]

  if (erro) {
    return (
      <EmptyState
        variant="requires-setup"
        icon="mdi:database-alert-outline"
        title="As views de métrica ainda não existem"
        description={`Rode sql-inbox-leads-metricas.sql no banco para criar vw_mensalli_funil, vw_mensalli_funil_semana e vw_mensalli_lead_metricas. Detalhe do erro: ${erro}`}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '1000px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
        <StatCard
          label="Esperando você agora"
          value={esperandoAgora}
          icon="mdi:message-alert-outline"
          accent={esperandoAgora > 0 ? 'danger' : 'success'}
          tinted={esperandoAgora > 0}
          hint="a bola está com você"
        />
        <StatCard
          label="Mediana da 1ª resposta"
          value={minutos(semanaAtual?.mediana_min_resposta)}
          icon="mdi:timer-outline"
          accent="info"
          hint="nesta semana · meta: 5 min"
        />
        <StatCard
          label="Leads respondidos"
          value={pct(totais.leadsTotal - totais.nuncaRespondidos, totais.leadsTotal)}
          icon="mdi:reply-outline"
          accent="primary"
          hint={`${totais.nuncaRespondidos} nunca receberam resposta`}
        />
        <StatCard
          label="Lead → pagante"
          value={pct(totais.pagantes, totais.leadsTotal)}
          icon="mdi:cash-check"
          accent="success"
          hint={`${totais.pagantes} pagantes de ${totais.leadsTotal} leads`}
        />
        <StatCard
          label="Toques de follow-up hoje"
          value={toquesHoje}
          icon="mdi:calendar-clock"
          accent={toquesHoje > 0 ? 'warning' : 'neutral'}
          hint="fila do playbook"
        />
      </div>

      <div>
        <h2 style={{ fontSize: '15px', margin: '0 0 4px', color: '#0f172a' }}>Por etapa do funil</h2>
        <p style={{ fontSize: '12.5px', color: '#64748b', margin: '0 0 10px' }}>
          A mediana ignora a conversa esquecida por três dias, que sozinha estragaria a média.
        </p>
        <Table
          size="sm"
          loading={carregando}
          data={funil}
          rowKey="status"
          emptyTitle="Sem dados ainda"
          columns={[
            { key: 'status', label: 'Etapa', render: (r) => rotuloStatus(r.status) },
            { key: 'leads', label: 'Leads', align: 'right' },
            { key: 'esperando_resposta', label: 'Esperando', align: 'right' },
            { key: 'nunca_respondidos', label: 'Sem resposta', align: 'right' },
            { key: 'parados_7d_mais', label: 'Parados 7d+', align: 'right' },
            { key: 'mediana_min_resposta', label: 'Mediana 1ª resp.', align: 'right', render: (r) => minutos(r.mediana_min_resposta) },
            { key: 'media_alunos', label: 'Média alunos', align: 'right', render: (r) => r.media_alunos ?? '—' }
          ]}
        />
      </div>

      <div>
        <h2 style={{ fontSize: '15px', margin: '0 0 4px', color: '#0f172a' }}>Semana a semana</h2>
        <p style={{ fontSize: '12.5px', color: '#64748b', margin: '0 0 10px' }}>
          Coorte pela semana em que a pessoa falou a primeira vez — é a leitura que mostra se o
          atendimento melhorou, e não só se entrou mais gente.
        </p>
        <Table
          size="sm"
          loading={carregando}
          data={semanas}
          rowKey="semana"
          emptyTitle="Sem histórico ainda"
          columns={[
            { key: 'semana', label: 'Semana', render: (r) => formatarDataCurta(r.semana) },
            { key: 'chegaram', label: 'Chegaram', align: 'right' },
            { key: 'respondidos', label: 'Respondidos', align: 'right' },
            { key: 'criaram_conta', label: 'Criaram conta', align: 'right' },
            { key: 'viraram_pagante', label: 'Pagantes', align: 'right' },
            { key: 'pct_pagante', label: '% pagante', align: 'right', render: (r) => (r.pct_pagante === null ? '—' : `${r.pct_pagante}%`) },
            { key: 'mediana_min_resposta', label: 'Mediana 1ª resp.', align: 'right', render: (r) => minutos(r.mediana_min_resposta) }
          ]}
        />
      </div>

      <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
        A mediana de 27 dias entre o primeiro contato e o primeiro pagamento é o número que evita o
        erro mais caro: não marque ninguém como perdido por demora antes disso — só por ter chegado
        ao fim de uma fila de silêncio.
      </p>
    </div>
  )
}
