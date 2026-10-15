import { useState, useEffect, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from './supabaseClient'
import Button from './design-system/components/Button'
import Badge from './design-system/components/Badge'
import StatCard from './design-system/components/StatCard'
import Table from './design-system/components/Table'
import Tabs from './design-system/components/Tabs'
import Select from './design-system/components/Select'
import SearchInput from './design-system/components/SearchInput'
import EmptyState from './design-system/components/EmptyState'
import Modal from './design-system/components/Modal'

/* ============================================================
   Assinaturas — quem pagou o Mensalli, direto do Mercado Pago

   O extrato do MP só diz "Liberação de dinheiro", sem o nome. E o nosso banco
   só conhece o que chegou por webhook (o cartão recorrente nunca chegou).
   Esta tela pergunta ao MP pela edge function `admin-mercadopago` e cruza cada
   pagamento com a conta: dá pra bater a liberação pelo valor líquido e pela
   data, e lançar na conta o que foi pago mas o sistema não viu.
   ============================================================ */

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
const dataHora = (iso) => iso
  ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—'

const NOME_PLANO = { starter: 'Starter', pro: 'Pro', premium: 'Premium' }

const STATUS_PAGAMENTO = {
  approved: { label: 'Aprovado', variant: 'success' },
  pending: { label: 'Pendente', variant: 'warning' },
  in_process: { label: 'Em análise', variant: 'warning' },
  rejected: { label: 'Recusado', variant: 'danger' },
  cancelled: { label: 'Cancelado', variant: 'default' },
  refunded: { label: 'Devolvido', variant: 'danger' },
  charged_back: { label: 'Chargeback', variant: 'danger' },
}

const STATUS_ASSINATURA = {
  authorized: { label: 'Ativa', variant: 'success' },
  pending: { label: 'Não concluída', variant: 'default' },
  paused: { label: 'Pausada', variant: 'warning' },
  cancelled: { label: 'Cancelada', variant: 'danger' },
}

const COMO_IDENTIFICOU = {
  vinculo: 'pela assinatura vinculada',
  referencia: 'pelo checkout',
  assinatura: 'pela assinatura',
  pagador: 'pelo pagador da assinatura',
  email: 'pelo email',
}

const FILTROS = [
  { value: 'aprovados', label: 'Aprovados' },
  { value: 'nao_lancados', label: 'Pagos e não lançados' },
  { value: 'cartao', label: 'Só cartão' },
  { value: 'pix', label: 'Só Pix' },
  { value: 'sem_conta', label: 'Sem conta identificada' },
  { value: 'todos', label: 'Todos (inclui cancelados)' },
]

const PERIODOS = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '60', label: 'Últimos 60 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '180', label: 'Últimos 180 dias' },
]

const precisaLancar = (p) => p.status === 'approved' && !p.lancado

async function chamar(body) {
  const { data: res, error } = await supabase.functions.invoke('admin-mercadopago', { body })
  if (error) {
    let msg = error.message
    try { msg = (await error.context.json()).error || msg } catch { /* sem corpo */ }
    throw new Error(msg)
  }
  if (res?.error) throw new Error(res.error)
  return res
}

function FormaPagamento({ p }) {
  if (p.tipo === 'credit_card' || p.tipo === 'debit_card') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon icon="mdi:credit-card-outline" />
          {p.tipo === 'debit_card' ? 'Débito' : 'Cartão'}{p.cartao_final ? ` •••• ${p.cartao_final}` : ''}
        </div>
        {p.recorrente && <Badge variant="info" size="sm">recorrente</Badge>}
      </div>
    )
  }
  if (p.metodo === 'pix') {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon icon="mdi:qrcode" />Pix</div>
  }
  return <span>{p.metodo || p.tipo || '—'}</span>
}

export default function AdminAssinaturas() {
  const [periodo, setPeriodo] = useState('60')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [dados, setDados] = useState(null)
  const [aba, setAba] = useState('recebimentos')
  const [filtro, setFiltro] = useState('aprovados')
  const [busca, setBusca] = useState('')
  const [lancando, setLancando] = useState(null) // pagamento aberto no modal
  const [vinculando, setVinculando] = useState(null) // assinatura aberta no modal

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setDados(await chamar({ acao: 'listar', dias: Number(periodo) }))
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [periodo])

  useEffect(() => { carregar() }, [carregar])

  const pagamentos = useMemo(() => dados?.pagamentos || [], [dados])
  const assinaturas = useMemo(() => dados?.assinaturas || [], [dados])

  const kpis = useMemo(() => {
    const aprovados = pagamentos.filter(p => p.status === 'approved')
    return {
      bruto: aprovados.reduce((s, p) => s + p.valor, 0),
      taxas: aprovados.reduce((s, p) => s + p.taxa, 0),
      liquido: aprovados.reduce((s, p) => s + p.liquido, 0),
      naoLancados: pagamentos.filter(precisaLancar).length,
      cartaoAtivas: assinaturas.filter(a => a.status === 'authorized').length,
    }
  }, [pagamentos, assinaturas])

  const termo = busca.trim().toLowerCase()
  const casaBusca = (...campos) => !termo || campos.some(c => String(c ?? '').toLowerCase().includes(termo))

  const pagamentosVisiveis = useMemo(() => pagamentos.filter(p => {
    if (filtro === 'aprovados' && p.status !== 'approved') return false
    if (filtro === 'nao_lancados' && !precisaLancar(p)) return false
    if (filtro === 'cartao' && !(p.tipo === 'credit_card' || p.tipo === 'debit_card')) return false
    if (filtro === 'pix' && p.metodo !== 'pix') return false
    if (filtro === 'sem_conta' && p.conta) return false
    return casaBusca(p.conta?.nome, p.conta?.email, p.pagador_nome, p.pagador_email, p.titular_cartao,
      p.id, p.cartao_final, brl(p.valor), brl(p.liquido))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pagamentos, filtro, termo])

  const assinaturasVisiveis = useMemo(() => assinaturas
    .filter(a => a.status !== 'pending' || filtro === 'todos')
    .filter(a => casaBusca(a.conta?.nome, a.conta?.email, a.pagador_email, a.id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [assinaturas, filtro, termo])

  const colunasPagamentos = [
    { key: 'data', label: 'Pago em', width: 110, render: p => dataHora(p.data_aprovacao || p.data) },
    {
      key: 'cliente', label: 'Cliente', render: p => (
        <div style={{ minWidth: 0 }}>
          {p.conta ? (
            <>
              <div style={{ fontWeight: 600 }}>{p.conta.nome}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>
                {p.conta.email} · {COMO_IDENTIFICOU[p.identificado_por] || ''}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, color: 'var(--warning-700, #b45309)' }}>
                <Icon icon="mdi:help-circle-outline" style={{ verticalAlign: -2 }} /> Conta não identificada
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>
                {[p.pagador_nome || p.titular_cartao, p.pagador_email].filter(Boolean).join(' · ') || 'sem dados do pagador'}
              </div>
            </>
          )}
        </div>
      ),
    },
    { key: 'forma', label: 'Forma', render: p => <FormaPagamento p={p} /> },
    {
      key: 'valor', label: 'Valor', align: 'right', render: p => (
        <div>
          <div style={{ fontWeight: 600 }}>{brl(p.valor)}</div>
          {p.status === 'approved' && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>
              taxa {brl(p.taxa)} · recebe {brl(p.liquido)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'liberacao', label: 'Liberação', render: p => p.status === 'approved' ? (
        <div>
          <div>{data(p.liberacao)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>
            {p.liberacao_status === 'released' ? 'liberado' : 'a liberar'}
          </div>
        </div>
      ) : '—',
    },
    {
      key: 'sistema', label: 'No Mensalli', render: p => {
        if (p.status !== 'approved') {
          const s = STATUS_PAGAMENTO[p.status] || { label: p.status, variant: 'default' }
          return <Badge variant={s.variant}>{s.label}</Badge>
        }
        if (p.lancado) {
          return (
            <div>
              <Badge variant="success" icon="mdi:check">Lançado</Badge>
              {p.conta?.plano_vencimento && (
                <div style={{ fontSize: 12, marginTop: 2 }}>vence {data(p.conta.plano_vencimento)}</div>
              )}
            </div>
          )
        }
        return (
          <div>
            <Button size="sm" variant="primary" icon="mdi:check-circle-outline" onClick={() => setLancando(p)}>
              Lançar
            </Button>
            {p.conta?.plano_vencimento && (
              <div style={{ fontSize: 12, marginTop: 2 }}>vence {data(p.conta.plano_vencimento)}</div>
            )}
          </div>
        )
      },
    },
  ]

  const colunasAssinaturas = [
    {
      key: 'cliente', label: 'Cliente', render: a => a.conta ? (
        <div>
          <div style={{ fontWeight: 600 }}>{a.conta.nome}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>{a.conta.email}</div>
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 600 }}>Conta não identificada</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>{a.pagador_email || a.id}</div>
        </div>
      ),
    },
    { key: 'plano', label: 'Plano', render: a => `${NOME_PLANO[a.plano] || a.plano} · ${brl(a.valor)}` },
    {
      key: 'status', label: 'No Mercado Pago', render: a => {
        const s = STATUS_ASSINATURA[a.status] || { label: a.status, variant: 'default' }
        return <Badge variant={s.variant}>{s.label}</Badge>
      },
    },
    {
      key: 'cobrancas', label: 'Última cobrança', render: a => a.ultima_cobranca
        ? <div><div>{data(a.ultima_cobranca)}</div><div style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>{a.cobrancas_ok || 0} cobrança(s)</div></div>
        : '—',
    },
    { key: 'proxima', label: 'Próxima', render: a => a.status === 'authorized' ? data(a.proxima_cobranca) : '—' },
    {
      key: 'venc', label: 'Vence no Mensalli', render: a => {
        if (!a.conta) return '—'
        const venc = a.conta.plano_vencimento ? new Date(a.conta.plano_vencimento) : null
        // Assinatura ativa no MP mas vencida aqui = o webhook não renovou
        const atrasado = a.status === 'authorized' && (!venc || venc < new Date())
        return (
          <span style={{ color: atrasado ? 'var(--danger-600, #dc2626)' : undefined, fontWeight: atrasado ? 600 : undefined }}>
            {venc ? data(a.conta.plano_vencimento) : 'sem data'}{atrasado ? ' · renovar' : ''}
          </span>
        )
      },
    },
    {
      key: 'acoes', label: '', align: 'right', render: a => (
        <Button size="sm" variant={a.conta ? 'outline' : 'primary'} icon="mdi:link-variant" onClick={() => setVinculando(a)}>
          {a.conta ? 'Trocar conta' : 'Vincular'}
        </Button>
      ),
    },
  ]

  return (
    <div className="adm-pagina">
      <div className="adm-cabecalho">
        <div>
          <h1 className="adm-titulo">Assinaturas</h1>
          <div className="adm-subtitulo">
            Direto do Mercado Pago: quem pagou, quanto caiu e quando libera
            {dados?.gerado_em ? ` · consultado às ${dataHora(dados.gerado_em).split(' ').pop()}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 180 }}>
            <Select options={PERIODOS} value={periodo} onChange={setPeriodo} />
          </div>
          <Button variant="outline" icon="mdi:refresh" onClick={carregar} loading={carregando}>Atualizar</Button>
        </div>
      </div>

      {erro ? (
        <EmptyState
          variant="error"
          title="Não foi possível consultar o Mercado Pago"
          description={erro}
          action={<Button variant="primary" icon="mdi:refresh" onClick={carregar}>Tentar de novo</Button>}
        />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
            <StatCard label="Recebido (bruto)" value={brl(kpis.bruto)} icon="mdi:cash-multiple" loading={carregando} />
            <StatCard label="Taxas do Mercado Pago" value={brl(kpis.taxas)} icon="mdi:percent-outline" accent="danger" loading={carregando} />
            <StatCard label="Líquido na conta" value={brl(kpis.liquido)} icon="mdi:bank-outline" accent="success" loading={carregando} />
            <StatCard
              label="Pagos e não lançados"
              value={kpis.naoLancados}
              icon="mdi:alert-circle-outline"
              accent={kpis.naoLancados ? 'warning' : 'neutral'}
              loading={carregando}
              onClick={() => { setAba('recebimentos'); setFiltro('nao_lancados') }}
              hint="O MP recebeu, o sistema não renovou"
            />
            <StatCard
              label="Cartão recorrente ativo"
              value={kpis.cartaoAtivas}
              icon="mdi:credit-card-sync-outline"
              accent="info"
              loading={carregando}
              onClick={() => setAba('assinaturas')}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <Tabs
              items={[
                { value: 'recebimentos', label: 'Recebimentos', icon: 'mdi:cash-check', count: pagamentosVisiveis.length },
                { value: 'assinaturas', label: 'Assinaturas no cartão', icon: 'mdi:credit-card-outline', count: assinaturasVisiveis.length },
              ]}
              value={aba}
              onChange={setAba}
              variant="pills"
            />
            <div style={{ flex: '1 1 220px' }}>
              <SearchInput
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Nome, email, valor, final do cartão, nº da operação"
              />
            </div>
            {aba === 'recebimentos' && (
              <div style={{ minWidth: 220 }}>
                <Select options={FILTROS} value={filtro} onChange={setFiltro} />
              </div>
            )}
          </div>

          {aba === 'recebimentos' ? (
            <Table
              columns={colunasPagamentos}
              data={pagamentosVisiveis}
              rowKey="id"
              loading={carregando}
              emptyTitle="Nenhum pagamento nesse filtro"
              emptyMessage="Troque o filtro ou aumente o período."
              emptyIcon="mdi:cash-remove"
            />
          ) : (
            <Table
              columns={colunasAssinaturas}
              data={assinaturasVisiveis}
              rowKey="id"
              loading={carregando}
              emptyTitle="Nenhuma assinatura de cartão"
              emptyMessage="Tentativas que a pessoa não concluiu ficam escondidas. Use o filtro “Todos” na aba Recebimentos para ver."
              emptyIcon="mdi:credit-card-off-outline"
            />
          )}
        </>
      )}

      <ModalLancar
        pagamento={lancando}
        contas={dados?.contas || []}
        onClose={() => setLancando(null)}
        onLancado={() => { setLancando(null); carregar() }}
      />

      <ModalVincular
        assinatura={vinculando}
        contas={dados?.contas || []}
        onClose={() => setVinculando(null)}
        onVinculado={() => { setVinculando(null); carregar() }}
      />
    </div>
  )
}

/* ---------- Vincular assinatura de cartão a uma conta ---------- */
// Para quem assinou logado na conta errada (ex.: conta de teste "Minha
// Empresa" em vez da conta real). Daqui pra frente toda cobrança dessa
// assinatura cai na conta escolhida.

function ModalVincular({ assinatura, contas, onClose, onVinculado }) {
  const [contaId, setContaId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (!assinatura) return
    setContaId(assinatura.conta?.id || '')
    setErro(null)
  }, [assinatura])

  if (!assinatura) return null

  const opcoes = contas.map(c => ({ value: c.id, label: `${c.nome}${c.email ? ` — ${c.email}` : ''}` }))
  const mudou = contaId && contaId !== assinatura.conta?.id

  const confirmar = async () => {
    setSalvando(true)
    setErro(null)
    try {
      const res = await chamar({ acao: 'vincular', preapproval_id: assinatura.id, user_id: contaId })
      if (!res?.mp_atualizado) {
        alert('Vinculado no Mensalli. O Mercado Pago não aceitou atualizar a referência, mas o sistema já usa o vínculo novo.')
      }
      onVinculado()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="De quem é esta assinatura?" subtitle={`Assinatura ${assinatura.id}`} size="md">
      <Modal.Body>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            <strong>{NOME_PLANO[assinatura.plano] || assinatura.plano} · {brl(assinatura.valor)}</strong> por mês
            {' · '}{(STATUS_ASSINATURA[assinatura.status] || { label: assinatura.status }).label}
            <br />
            Pagador no Mercado Pago: {assinatura.pagador_email || 'sem email'}
            <br />
            Hoje vinculada a: <strong>{assinatura.conta ? `${assinatura.conta.nome} (${assinatura.conta.email})` : 'nenhuma conta'}</strong>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Conta certa</div>
            <Select options={opcoes} value={contaId} onChange={setContaId} searchable placeholder="Escolha a conta" />
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>
            As cobranças dessa assinatura passam a renovar a conta escolhida. Isto não renova nada agora:
            se já tem cobrança paga, use <strong>Lançar</strong> na aba Recebimentos.
          </div>

          {erro && <div style={{ color: 'var(--danger-600, #dc2626)', fontSize: 14 }}>{erro}</div>}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon="mdi:link-variant" onClick={confirmar} loading={salvando} disabled={!mudou}>
          Vincular
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

/* ---------- Lançar pagamento na conta (+30 dias) ---------- */

function ModalLancar({ pagamento, contas, onClose, onLancado }) {
  const [contaId, setContaId] = useState('')
  const [plano, setPlano] = useState('pro')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (!pagamento) return
    setContaId(pagamento.conta?.id || '')
    setPlano(pagamento.plano_sugerido || 'pro')
    setErro(null)
  }, [pagamento])

  if (!pagamento) return null

  const opcoes = contas.map(c => ({ value: c.id, label: `${c.nome}${c.email ? ` — ${c.email}` : ''}` }))
  const conta = pagamento.conta?.id === contaId ? pagamento.conta : null

  // Mesma regra da edge function: +30 dias a partir do maior entre o
  // vencimento atual e a data do pagamento. Prévia só quando a conta é a
  // identificada (é a única de que temos o vencimento aqui).
  let previa = null
  if (conta) {
    const pago = new Date(pagamento.data_aprovacao || pagamento.data)
    const venc = conta.plano_vencimento ? new Date(conta.plano_vencimento) : null
    const base = venc && venc > pago ? venc : pago
    previa = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }

  const confirmar = async () => {
    setSalvando(true)
    setErro(null)
    try {
      await chamar({ acao: 'lancar', payment_id: pagamento.id, user_id: contaId, plano })
      onLancado()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Lançar pagamento na conta" subtitle={`Operação ${pagamento.id} no Mercado Pago`} size="md">
      <Modal.Body>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            <strong>{brl(pagamento.valor)}</strong> em {dataHora(pagamento.data_aprovacao || pagamento.data)}
            {' · '}<FormaInline p={pagamento} />
            <br />
            Pagador: {[pagamento.pagador_nome || pagamento.titular_cartao, pagamento.pagador_email].filter(Boolean).join(' · ') || 'sem dados'}
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Conta do Mensalli</div>
            <Select options={opcoes} value={contaId} onChange={setContaId} searchable placeholder="Escolha a conta que pagou" />
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Plano</div>
            <Select
              options={[
                { value: 'starter', label: 'Starter' },
                { value: 'pro', label: 'Pro' },
                { value: 'premium', label: 'Premium' },
              ]}
              value={plano}
              onChange={setPlano}
            />
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>
            Renova 30 dias a partir do vencimento atual (ou da data do pagamento, se já estava vencida).
            {previa && <> Novo vencimento: <strong>{data(previa)}</strong>.</>}
            {pagamento.preapproval_id && <> A assinatura de cartão também fica vinculada a essa conta, para os próximos meses.</>}
          </div>

          {erro && <div style={{ color: 'var(--danger-600, #dc2626)', fontSize: 14 }}>{erro}</div>}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon="mdi:check" onClick={confirmar} loading={salvando} disabled={!contaId}>
          Lançar e renovar
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function FormaInline({ p }) {
  if (p.metodo === 'pix') return 'Pix'
  if (p.tipo === 'credit_card') return `Cartão${p.cartao_final ? ` •••• ${p.cartao_final}` : ''}`
  return p.metodo || p.tipo || ''
}
