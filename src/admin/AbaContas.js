import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import Table from '../design-system/components/Table'
import Badge from '../design-system/components/Badge'
import Button from '../design-system/components/Button'
import Select from '../design-system/components/Select'
import SearchInput from '../design-system/components/SearchInput'
import Tabs from '../design-system/components/Tabs'
import Modal from '../design-system/components/Modal'
import { showSuccess } from '../Toast'
import {
  infoCiclo, ORDEM_CICLOS, ORIGENS_PAGAMENTO,
  formatarData, formatarDataHora, textoVencimento, formatarBRL,
  nomeDaConta, telefoneDaConta,
} from './ciclo'

/* ============================================================
   Aba Contas

   A tabela que antes era 200 linhas de <table> à mão. Agora declara colunas e
   deixa o Table do DS cuidar de loading, empty, sticky header e seleção.

   Mudança de conteúdo, não só de forma: o badge mostra os SETE estados do
   ciclo de vida. Antes eram quatro (Pago / Sem trial / Trial Nd / Expirado) e
   churn não aparecia em lugar nenhum — ex-pagante e trial expirado dividiam o
   rótulo "Expirado".
   ============================================================ */

const TOM_VENCIMENTO = {
  neutro: 'var(--color-text-secondary)',
  alerta: 'var(--warning-700)',
  critico: 'var(--danger-700)',
}

// Recortes que não são nem ciclo nem origem, mas que a Visão Geral precisa
// conseguir abrir. Cada um vira um chip removível acima da tabela.
const FOCOS = {
  sem_vencimento: {
    label: 'Contas pagas sem data de vencimento',
    dica: 'O gate bloqueia por falta de data e o cliente perde acesso em silêncio',
    predicado: c => c.plano_pago && !c.plano_vencimento,
  },
}

export default function AbaContas({ dados, filtrosURL, onFiltrosChange, onEditar, isSmallScreen }) {
  const { contas, carregando, precoDoPlano, nomeDoPlano } = dados

  // Os filtros vivem na URL (o shell é dono deles). O estado local existe só
  // para busca e ordenação, que não valem uma entrada de histórico.
  const filtroCiclo = filtrosURL?.ciclo || 'todos'
  const filtroOrigem = filtrosURL?.origem || 'todos'
  const foco = filtrosURL?.foco && FOCOS[filtrosURL.foco] ? filtrosURL.foco : null

  const [filtroPlano, setFiltroPlano] = useState('todos')
  const [filtroWhatsapp, setFiltroWhatsapp] = useState('todos')
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState('nome')
  const [detalhe, setDetalhe] = useState(null)

  const trocarFiltro = (mudanca) => {
    onFiltrosChange?.({ ciclo: filtroCiclo, origem: filtroOrigem, foco, ...mudanca })
  }
  const trocarCiclo = (valor) => trocarFiltro({ ciclo: valor })

  // Contagem das pílulas respeita os OUTROS filtros ativos (foco, origem,
  // plano, WhatsApp, busca) — só não filtra por ciclo, que é o que elas
  // escolhem. Com o total global, chegar de um card da Visão Geral mostrava
  // "Todos 107" acima de uma tabela com 10 linhas.
  const baseDasPilulas = useMemo(() => {
    let r = contas
    if (foco) r = r.filter(FOCOS[foco].predicado)
    if (filtroOrigem !== 'todos') r = r.filter(c => c.origem_pagamento === filtroOrigem)
    if (filtroPlano !== 'todos') r = r.filter(c => c.plano === filtroPlano)
    if (filtroWhatsapp === 'conectado') r = r.filter(c => c.whatsapp_conectado === true)
    if (filtroWhatsapp === 'desconectado') r = r.filter(c => c.whatsapp_conectado !== true)
    const termo = busca.trim().toLowerCase()
    if (termo) {
      r = r.filter(c =>
        c.nome_empresa?.toLowerCase().includes(termo)
        || c.nome_completo?.toLowerCase().includes(termo)
        || c.email?.toLowerCase().includes(termo)
        || c.telefone?.includes(termo)
      )
    }
    return r
  }, [contas, foco, filtroOrigem, filtroPlano, filtroWhatsapp, busca])

  const abasCiclo = useMemo(() => {
    const porCicloVisivel = {}
    baseDasPilulas.forEach(c => {
      porCicloVisivel[c.ciclo] = (porCicloVisivel[c.ciclo] || 0) + 1
    })
    return [
      { value: 'todos', label: 'Todos', count: baseDasPilulas.length },
      ...ORDEM_CICLOS
        // Mantém a pílula do ciclo selecionado mesmo com zero, senão ela some
        // debaixo do dedo e o filtro fica ativo sem nada indicando isso.
        .filter(c => porCicloVisivel[c] > 0 || c === filtroCiclo)
        .map(c => ({ value: c, label: infoCiclo(c).label, count: porCicloVisivel[c] || 0 })),
    ]
  }, [baseDasPilulas, filtroCiclo])

  const opcoesPlano = useMemo(() => {
    const vistos = [...new Set(contas.map(c => c.plano).filter(Boolean))]
    return [
      { value: 'todos', label: 'Todos os planos' },
      ...vistos.map(p => ({ value: p, label: nomeDoPlano(p) })),
    ]
  }, [contas, nomeDoPlano])

  const filtradas = useMemo(() => {
    // baseDasPilulas já tem todos os filtros menos o de ciclo
    const r = filtroCiclo === 'todos'
      ? baseDasPilulas
      : baseDasPilulas.filter(c => c.ciclo === filtroCiclo)

    return [...r].sort((a, b) => {
      switch (ordenacao) {
        case 'vencimento_asc':
        case 'vencimento_desc': {
          const dir = ordenacao === 'vencimento_desc' ? -1 : 1
          // Sem data vai sempre para o fim, independente da direção — é
          // ausência de informação, não uma data muito antiga nem muito futura.
          if (!a.data_limite && !b.data_limite) return 0
          if (!a.data_limite) return 1
          if (!b.data_limite) return -1
          return (new Date(a.data_limite) - new Date(b.data_limite)) * dir
        }
        case 'mensagens':
          return (b.mensagens_mes || 0) - (a.mensagens_mes || 0)
        case 'cadastro':
          return new Date(b.data_cadastro || b.created_at || 0) - new Date(a.data_cadastro || a.created_at || 0)
        case 'valor':
          return Number(b.total_pago || 0) - Number(a.total_pago || 0)
        default:
          return nomeDaConta(a).localeCompare(nomeDaConta(b), 'pt-BR')
      }
    })
  }, [baseDasPilulas, filtroCiclo, ordenacao])

  const copiar = (texto, rotulo) => {
    if (!texto) return
    navigator.clipboard?.writeText(texto).then(() => showSuccess(`${rotulo} copiado`)).catch(() => {})
  }

  const colunas = useMemo(() => [
    {
      key: 'conta',
      label: 'Conta',
      render: (c) => (
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontWeight: 600, color: 'var(--color-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {nomeDaConta(c)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{c.email}</div>
        </div>
      ),
    },
    {
      key: 'ciclo',
      label: 'Status',
      width: 150,
      render: (c) => {
        const info = infoCiclo(c.ciclo)
        return (
          <span title={info.descricao}>
            <Badge variant={info.badge} icon={info.icon}>{info.label}</Badge>
          </span>
        )
      },
    },
    {
      key: 'plano',
      label: 'Plano',
      width: 120,
      render: (c) => (
        <div>
          <div style={{ fontSize: 13 }}>{nomeDoPlano(c.plano)}</div>
          {c.plano_pago && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {formatarBRL(precoDoPlano(c.plano))}/mês
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'data_limite',
      label: 'Vencimento',
      width: 170,
      render: (c) => {
        if (!c.data_limite) {
          return (
            <span
              style={{ fontSize: 12, color: c.plano_pago ? 'var(--danger-700)' : 'var(--color-text-muted)' }}
              title={c.plano_pago
                ? 'Pagante sem data de vencimento: o gate bloqueia por falta de data'
                : 'Sem data registrada'}
            >
              {c.plano_pago ? 'sem data ⚠' : '—'}
            </span>
          )
        }
        const { texto, tom } = textoVencimento(c.data_limite)
        return (
          <div>
            <div style={{ fontSize: 13 }}>{formatarData(c.data_limite)}</div>
            <div style={{ fontSize: 11, color: TOM_VENCIMENTO[tom] }}>{texto}</div>
          </div>
        )
      },
    },
    {
      key: 'whatsapp_conectado',
      label: 'WhatsApp',
      width: 130,
      render: (c) => (
        <div>
          <Badge variant={c.whatsapp_conectado ? 'success' : 'default'} dot size="xs">
            {c.whatsapp_conectado ? 'Conectado' : 'Desconectado'}
          </Badge>
          {c.whatsapp_ultima_conexao && (
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 3 }}>
              {formatarData(c.whatsapp_ultima_conexao)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'mensagens_mes',
      label: 'Mensagens/mês',
      align: 'right',
      width: 130,
      render: (c) => {
        const usadas = c.mensagens_mes || 0
        const limite = c.limite_mensal || 0
        const pct = limite > 0 ? Math.min((usadas / limite) * 100, 100) : 0
        const cor = pct > 90 ? 'var(--danger-500)' : pct > 70 ? 'var(--warning-500)' : 'var(--success-500)'
        return (
          <div style={{ minWidth: 90 }}>
            <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              {usadas.toLocaleString('pt-BR')}
              {limite > 0 && <span style={{ color: 'var(--color-text-muted)' }}> / {limite.toLocaleString('pt-BR')}</span>}
            </div>
            {limite > 0 && (
              <div style={{ height: 4, borderRadius: 999, backgroundColor: 'var(--neutral-200)', marginTop: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: cor }} />
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'acoes',
      label: '',
      align: 'right',
      width: 92,
      render: (c) => (
        <div data-no-row-click style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <Button
            size="xs"
            variant="ghost"
            iconOnly
            icon="mdi:pencil"
            aria-label="Editar conta"
            title="Editar plano e vencimento"
            onClick={() => onEditar(c)}
          />
          <Button
            size="xs"
            variant="ghost"
            iconOnly
            icon="mdi:information-outline"
            aria-label="Ver detalhes"
            title="Histórico de pagamentos"
            onClick={() => setDetalhe(c)}
          />
        </div>
      ),
    },
  ], [nomeDoPlano, precoDoPlano, onEditar])

  const temFiltroAtivo = !!foco || filtroCiclo !== 'todos' || filtroPlano !== 'todos'
    || filtroOrigem !== 'todos' || filtroWhatsapp !== 'todos' || busca.trim() !== ''

  const limparTudo = () => {
    setFiltroPlano('todos'); setFiltroWhatsapp('todos'); setBusca('')
    onFiltrosChange?.({ ciclo: 'todos', origem: 'todos', foco: null })
  }

  return (
    <div>
      <div style={{ marginBottom: 12, overflowX: 'auto' }}>
        <Tabs variant="pills" value={filtroCiclo} onChange={trocarCiclo} items={abasCiclo} size="sm" />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isSmallScreen
          ? '1fr'
          : 'minmax(160px,1fr) minmax(170px,1fr) minmax(160px,1fr) minmax(180px,1.3fr)',
        gap: 10,
        marginBottom: 14,
      }}>
        <Select options={opcoesPlano} value={filtroPlano} onChange={setFiltroPlano} />
        <Select
          value={filtroOrigem}
          onChange={(v) => trocarFiltro({ origem: v })}
          options={[
            { value: 'todos', label: 'Toda origem de pagamento' },
            { value: 'mercadopago', label: 'Mercado Pago' },
            { value: 'manual', label: 'Venda na mão (revisar)' },
            { value: 'nenhum', label: 'Nunca pagou' },
          ]}
        />
        <Select
          value={ordenacao}
          onChange={setOrdenacao}
          icon="mdi:sort"
          options={[
            { value: 'nome', label: 'Nome (A–Z)' },
            { value: 'vencimento_asc', label: 'Vencimento (mais próximo)' },
            { value: 'vencimento_desc', label: 'Vencimento (mais distante)' },
            { value: 'mensagens', label: 'Mais mensagens no mês' },
            { value: 'cadastro', label: 'Cadastro mais recente' },
            { value: 'valor', label: 'Maior valor pago' },
          ]}
        />
        <SearchInput
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por empresa, nome, e-mail ou telefone…"
        />
      </div>

      {/* Filtro de WhatsApp fica fora do grid: é binário e cabe em chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { v: 'todos', l: 'WhatsApp: todos' },
          { v: 'conectado', l: 'Só conectados' },
          { v: 'desconectado', l: 'Só desconectados' },
        ].map(o => (
          <Button
            key={o.v}
            size="xs"
            variant={filtroWhatsapp === o.v ? 'primary' : 'outline'}
            onClick={() => setFiltroWhatsapp(o.v)}
          >
            {o.l}
          </Button>
        ))}
      </div>

      {/* Chip do foco: um recorte que não cabe nos selects acima e que veio de
          um card da Visão Geral. Precisa ficar visível e removível, senão a
          tabela mostra menos contas do que os filtros à vista explicam. */}
      {foco && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12,
          padding: '6px 8px 6px 12px', borderRadius: 999,
          backgroundColor: 'var(--info-50)', border: '1px solid var(--info-500)',
          fontSize: 12, color: 'var(--color-text-primary)',
        }} title={FOCOS[foco].dica}>
          <Icon icon="mdi:filter-variant" width={14} height={14} style={{ color: 'var(--info-700)' }} />
          {FOCOS[foco].label}
          <Button
            size="xs"
            variant="ghost"
            iconOnly
            icon="mdi:close"
            aria-label="Remover este filtro"
            onClick={() => trocarFiltro({ foco: null })}
          />
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
        {carregando ? 'Carregando…' : `${filtradas.length} de ${contas.length} contas`}
      </div>

      <Table
        columns={colunas}
        data={filtradas}
        rowKey="id"
        size="sm"
        stickyHeader
        loading={carregando}
        onRowClick={(c) => setDetalhe(c)}
        emptyIcon={temFiltroAtivo ? 'mdi:filter-remove-outline' : 'mdi:account-group-outline'}
        emptyTitle={temFiltroAtivo ? 'Nenhuma conta com esses filtros' : 'Nenhuma conta cadastrada'}
        emptyMessage={temFiltroAtivo
          ? 'Afrouxe os filtros ou limpe a busca para ver mais contas.'
          : 'Assim que alguém se cadastrar, a conta aparece aqui.'}
        emptyAction={temFiltroAtivo ? (
          <Button variant="outline" icon="mdi:filter-off" onClick={limparTudo}>
            Limpar filtros
          </Button>
        ) : undefined}
      />

      <DetalheConta
        conta={detalhe}
        onClose={() => setDetalhe(null)}
        onEditar={onEditar}
        copiar={copiar}
        nomeDoPlano={nomeDoPlano}
        precoDoPlano={precoDoPlano}
      />
    </div>
  )
}

/* ---------- Drawer de detalhe ---------- */

function Campo({ rotulo, children, dica }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 3 }} title={dica}>
        {rotulo}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}

function DetalheConta({ conta, onClose, onEditar, copiar, nomeDoPlano, precoDoPlano }) {
  if (!conta) return null
  const info = infoCiclo(conta.ciclo)
  const origem = ORIGENS_PAGAMENTO[conta.origem_pagamento] || ORIGENS_PAGAMENTO.nenhum
  const telefone = telefoneDaConta(conta)

  return (
    <Modal
      isOpen={!!conta}
      onClose={onClose}
      position="aside"
      size="md"
      title={nomeDaConta(conta)}
      subtitle={conta.email}
    >
      <Modal.Body>
        <div style={{ marginBottom: 18 }}>
          <span title={info.descricao}>
            <Badge variant={info.badge} icon={info.icon}>{info.label}</Badge>
          </span>
        </div>

        <Campo rotulo="Plano">
          {nomeDoPlano(conta.plano)} · {formatarBRL(precoDoPlano(conta.plano))}/mês
        </Campo>

        <Campo
          rotulo="Vencimento"
          dica="Vem do trilho certo: quem já foi pagante é lido pelo plano_vencimento, não pelo trial_fim"
        >
          {conta.data_limite
            ? `${formatarData(conta.data_limite)} — ${textoVencimento(conta.data_limite).texto}`
            : (conta.plano_pago ? 'Sem data (dado quebrado — o gate bloqueia)' : '—')}
        </Campo>

        <Campo rotulo="Telefone">
          {telefone ? (
            <button
              type="button"
              onClick={() => copiar(telefone, 'Telefone')}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: 'var(--color-text-primary)', fontSize: 13, textDecoration: 'underline',
                textDecorationStyle: 'dotted',
              }}
              title="Copiar"
            >
              {telefone}
            </button>
          ) : <span style={{ color: 'var(--color-text-muted)' }}>não cadastrado</span>}
        </Campo>

        <div style={{ height: 1, backgroundColor: 'var(--color-border-subtle)', margin: '18px 0' }} />

        <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 12 }}>
          Histórico de pagamento
        </div>

        <Campo rotulo="Origem" dica={origem.descricao}>
          {origem.label}
          {conta.origem_pagamento === 'manual' && (
            <div style={{ fontSize: 11, color: 'var(--warning-700)', marginTop: 3 }}>
              Data de conversão inferida no backfill — vale conferir.
            </div>
          )}
        </Campo>

        <Campo rotulo="Virou pagante em">
          {conta.virou_pagante_em ? formatarData(conta.virou_pagante_em) : 'nunca pagou'}
        </Campo>

        {conta.total_pagamentos > 0 && (
          <>
            <Campo rotulo="Pagamentos no gateway">
              {conta.total_pagamentos} · total de {formatarBRL(conta.total_pago)}
            </Campo>
            <Campo rotulo="Último pagamento">{formatarDataHora(conta.ultimo_pagamento)}</Campo>
          </>
        )}

        {conta.assinatura_status && (
          <Campo rotulo="Assinatura recorrente">
            {conta.assinatura_status}
            {conta.proxima_cobranca && ` · próxima em ${formatarData(conta.proxima_cobranca)}`}
          </Campo>
        )}

        {conta.cancelado_em && (
          <Campo rotulo="Cancelado em">
            {formatarData(conta.cancelado_em)}
            {conta.cancelado_motivo && ` · ${conta.cancelado_motivo}`}
          </Campo>
        )}

        <div style={{ height: 1, backgroundColor: 'var(--color-border-subtle)', margin: '18px 0' }} />

        <Campo rotulo="Cadastro">{formatarDataHora(conta.data_cadastro || conta.created_at)}</Campo>
        <Campo rotulo="Mensagens no mês">
          {(conta.mensagens_mes || 0).toLocaleString('pt-BR')}
          {conta.limite_mensal ? ` de ${conta.limite_mensal.toLocaleString('pt-BR')}` : ''}
        </Campo>
        <Campo rotulo="Acesso ao sistema" dica="Mesmo veredito de usuario_pode_enviar() no banco">
          {conta.tem_acesso ? 'liberado' : 'bloqueado'}
        </Campo>
        <Campo rotulo="ID da conta">
          <button
            type="button"
            onClick={() => copiar(conta.id, 'ID')}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--color-text-secondary)',
            }}
            title="Copiar ID completo"
          >
            {conta.id} <Icon icon="mdi:content-copy" width={11} height={11} />
          </button>
        </Campo>
      </Modal.Body>

      <Modal.Footer align="between">
        <Button variant="outline" onClick={onClose}>Fechar</Button>
        <Button variant="primary" icon="mdi:pencil" onClick={() => { onEditar(conta); onClose() }}>
          Editar conta
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
