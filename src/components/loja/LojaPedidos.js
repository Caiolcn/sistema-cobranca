import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, FUNCTIONS_URL, SUPABASE_ANON_KEY } from '../../supabaseClient'
import { showToast } from '../../Toast'
import { formatarBRL } from '../../planosMensalli'
import Button from '../../design-system/components/Button'
import Badge from '../../design-system/components/Badge'
import Input from '../../design-system/components/Input'
import Select from '../../design-system/components/Select'
import Table from '../../design-system/components/Table'
import Modal, { ConfirmDialog } from '../../design-system/components/Modal'
import { STATUS_PEDIDO, STATUS_VENDIDO, METODO_LABEL, TIPOS_ITEM, formatarDataHora, formatarData, linkPedido, copiar, erroDeSchema, MSG_SQL } from './lojaUtil'

// Sub-aba Pedidos: resumo do mês, tabela com filtro/busca/paginação e um
// painel lateral com os detalhes e as ações operacionais do gestor
// (marcar retirado, cancelar, reprocessar). Criação de pedido é da edge.

const POR_PAGINA = 20
const LIMITE_CARGA = 1000

export function BadgeStatus({ status }) {
  const s = STATUS_PEDIDO[status] || { label: status, variant: 'default' }
  if (s.custom) return <Badge customColor={s.custom.bg} customTextColor={s.custom.texto}>{s.label}</Badge>
  return <Badge variant={s.variant}>{s.label}</Badge>
}

function CardNumero({ rotulo, valor, cor }) {
  return (
    <div style={{ flex: '1 1 140px', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px 14px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{rotulo}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, color: cor || '#111827', marginTop: '4px' }}>{valor}</div>
    </div>
  )
}

function Linha({ rotulo, children }) {
  if (children == null || children === '') return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
      <span style={{ color: '#6b7280', flexShrink: 0 }}>{rotulo}</span>
      <span style={{ color: '#111827', fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{children}</span>
    </div>
  )
}

function csvEscape(v) {
  const s = v == null ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function LojaPedidos({ userId, slug, produtos }) {
  const navigate = useNavigate()
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [sel, setSel] = useState(null)
  const [acao, setAcao] = useState('')           // 'retirado' | 'cancelar' | 'reprocessar'
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)

  const carregar = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('loja_pedidos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(LIMITE_CARGA)
    if (error) {
      showToast(erroDeSchema(error) ? MSG_SQL : 'Erro ao carregar pedidos: ' + error.message, 'error')
    } else {
      setPedidos(data || [])
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { carregar() }, [carregar])

  // Rótulos dos campos extras por produto (para mostrar as respostas com nome bonito)
  const rotulosExtras = useMemo(() => {
    const mapa = {}
    for (const p of produtos || []) {
      if (!Array.isArray(p.campos_extras)) continue
      mapa[p.id] = Object.fromEntries(p.campos_extras.map(c => [c.chave, c.rotulo]))
    }
    return mapa
  }, [produtos])

  const resumo = useMemo(() => {
    const agora = new Date()
    const mes = agora.getMonth(), ano = agora.getFullYear()
    let vendido = 0, aguardandoPag = 0, aguardandoRet = 0, turmaPend = 0
    for (const p of pedidos) {
      if (STATUS_VENDIDO.includes(p.status) && p.pago_em) {
        const d = new Date(p.pago_em)
        if (d.getMonth() === mes && d.getFullYear() === ano) vendido += Number(p.valor) || 0
      }
      if (p.status === 'aguardando_pagamento') aguardandoPag++
      if (p.status === 'aguardando_retirada') aguardandoRet++
      if (p.status === 'turma_pendente') turmaPend++
    }
    return { vendido, aguardandoPag, aguardandoRet, turmaPend }
  }, [pedidos])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const qDigitos = q.replace(/\D/g, '')
    return pedidos.filter(p => {
      if (filtro !== 'todos' && p.status !== filtro) return false
      if (!q) return true
      const nome = (p.nome || '').toLowerCase()
      const tel = (p.telefone || '').replace(/\D/g, '')
      const telResp = (p.responsavel_telefone || '').replace(/\D/g, '')
      return nome.includes(q) || (qDigitos && (tel.includes(qDigitos) || telResp.includes(qDigitos))) || (p.item_nome || '').toLowerCase().includes(q)
    })
  }, [pedidos, filtro, busca])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  useEffect(() => { setPagina(1) }, [filtro, busca])

  const atualizarLocal = (row) => {
    setPedidos(prev => prev.map(p => (p.id === row.id ? { ...p, ...row } : p)))
    setSel(prev => (prev && prev.id === row.id ? { ...prev, ...row } : prev))
  }

  const marcarRetirado = async () => {
    if (!sel) return
    setAcao('retirado')
    const patch = { status: 'retirado', retirado_em: new Date().toISOString() }
    const { error } = await supabase.from('loja_pedidos').update(patch).eq('id', sel.id)
    setAcao('')
    if (error) { showToast('Erro ao marcar retirado: ' + error.message, 'error'); return }
    atualizarLocal({ id: sel.id, ...patch })
    showToast('Pedido marcado como retirado', 'success')
  }

  const cancelarPedido = async () => {
    if (!sel) return
    setAcao('cancelar')
    try {
      const patch = { status: 'cancelado', cancelado_em: new Date().toISOString() }
      if (sel.reservou_estoque && sel.produto_id) {
        const { error: erroEstoque } = await supabase.rpc('loja_devolver_estoque', { p_produto_id: sel.produto_id, p_variacao: sel.variacao || null })
        if (erroEstoque) throw erroEstoque
        patch.reservou_estoque = false
      }
      const { error } = await supabase.from('loja_pedidos').update(patch).eq('id', sel.id)
      if (error) throw error
      atualizarLocal({ id: sel.id, ...patch })
      setConfirmarCancelar(false)
      showToast('Pedido cancelado', 'success')
    } catch (error) {
      showToast('Erro ao cancelar: ' + error.message, 'error')
    } finally {
      setAcao('')
    }
  }

  const reprocessar = async () => {
    if (!sel) return
    setAcao('reprocessar')
    try {
      const r = await fetch(`${FUNCTIONS_URL}/loja-pedido-status?token=${encodeURIComponent(sel.token)}&force=1`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      })
      if (!r.ok) {
        const corpo = await r.json().catch(() => ({}))
        throw new Error(corpo.error || `HTTP ${r.status}`)
      }
      const { data } = await supabase.from('loja_pedidos').select('*').eq('id', sel.id).single()
      if (data) atualizarLocal(data)
      showToast('Pedido reprocessado', 'success')
    } catch (error) {
      showToast('Erro ao reprocessar: ' + error.message, 'error')
    } finally {
      setAcao('')
    }
  }

  const exportarCsv = () => {
    const colunas = ['Data', 'Status', 'Tipo', 'Item', 'Variação', 'Nome', 'Telefone', 'CPF', 'E-mail', 'Responsável', 'Valor', 'Método', 'Pago em', 'Retirado em', 'Link do pedido']
    const linhas = filtrados.map(p => [
      formatarDataHora(p.created_at), STATUS_PEDIDO[p.status]?.label || p.status, TIPOS_ITEM[p.tipo]?.label || p.tipo,
      p.item_nome, p.variacao, p.nome, p.telefone, p.cpf, p.email, p.responsavel_nome,
      String(Number(p.valor) || 0).replace('.', ','), METODO_LABEL[p.metodo] || p.metodo,
      formatarDataHora(p.pago_em), formatarDataHora(p.retirado_em), linkPedido(slug, p.token)
    ])
    const csv = '﻿' + [colunas, ...linhas].map(l => l.map(csvEscape).join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pedidos-loja-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const colunas = [
    { key: 'created_at', label: 'Data', width: 130, render: r => <span style={{ whiteSpace: 'nowrap', fontSize: '13px' }}>{formatarDataHora(r.created_at)}</span> },
    { key: 'nome', label: 'Comprador', render: r => (
      <div>
        <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{r.nome}</div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>{r.telefone}</div>
      </div>
    ) },
    { key: 'item_nome', label: 'Item', render: r => (
      <div>
        <div style={{ fontSize: '13.5px' }}>{r.item_nome}</div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>{[TIPOS_ITEM[r.tipo]?.label, r.variacao].filter(Boolean).join(' · ')}</div>
      </div>
    ) },
    { key: 'valor', label: 'Valor', align: 'right', render: r => <strong>{formatarBRL(r.valor)}</strong> },
    { key: 'metodo', label: 'Método', render: r => METODO_LABEL[r.metodo] || r.metodo || '—' },
    { key: 'status', label: 'Status', render: r => <BadgeStatus status={r.status} /> }
  ]

  const opcoesStatus = [{ value: 'todos', label: 'Todos os status' }, ...Object.entries(STATUS_PEDIDO).map(([v, s]) => ({ value: v, label: s.label }))]
  const respostas = sel && sel.respostas && typeof sel.respostas === 'object' ? Object.entries(sel.respostas) : []
  const rotulos = sel ? (rotulosExtras[sel.produto_id] || {}) : {}

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <CardNumero rotulo="Vendido no mês" valor={formatarBRL(resumo.vendido)} cor="#15803d" />
        <CardNumero rotulo="Aguardando pagamento" valor={resumo.aguardandoPag} cor="#b45309" />
        <CardNumero rotulo="Aguardando retirada" valor={resumo.aguardandoRet} cor="#6d28d9" />
        <CardNumero rotulo="Turma pendente" valor={resumo.turmaPend} cor="#1d4ed8" />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '12px' }}>
        <div style={{ flex: '1 1 200px' }}>
          <Input placeholder="Buscar por nome, telefone ou item" icon="mdi:magnify" value={busca} onChange={(e) => setBusca(e.target.value)} clearable onClear={() => setBusca('')} />
        </div>
        <div style={{ flex: '0 1 220px' }}>
          <Select options={opcoesStatus} value={filtro} onChange={(v) => setFiltro(v || 'todos')} />
        </div>
        <Button variant="outline" icon="mdi:download" onClick={exportarCsv} disabled={!filtrados.length}>CSV</Button>
        <Button variant="ghost" icon="mdi:refresh" iconOnly aria-label="Recarregar" onClick={carregar} />
      </div>

      <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden' }}>
        <Table
          columns={colunas}
          data={visiveis}
          rowKey="id"
          loading={loading}
          onRowClick={(r) => setSel(r)}
          emptyIcon="mdi:cart-outline"
          emptyTitle={pedidos.length ? 'Nenhum pedido com esse filtro' : 'Nenhum pedido ainda'}
          emptyMessage={pedidos.length ? 'Tente outro status ou limpe a busca.' : 'Quando alguém comprar na sua loja, o pedido aparece aqui.'}
        />
      </div>

      {totalPaginas > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '12px', fontSize: '13px', color: '#6b7280' }}>
          <Button variant="outline" size="sm" icon="mdi:chevron-left" iconOnly aria-label="Página anterior" disabled={paginaAtual <= 1} onClick={() => setPagina(p => p - 1)} />
          <span>Página {paginaAtual} de {totalPaginas} · {filtrados.length} pedidos</span>
          <Button variant="outline" size="sm" icon="mdi:chevron-right" iconOnly aria-label="Próxima página" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(p => p + 1)} />
        </div>
      )}

      <Modal isOpen={!!sel} onClose={() => !acao && setSel(null)} position="aside" size="md"
        title={sel ? sel.item_nome : ''} subtitle={sel ? `${TIPOS_ITEM[sel.tipo]?.label || sel.tipo} · ${formatarDataHora(sel.created_at)}` : ''}>
        {sel && (
          <>
            <Modal.Body>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                <BadgeStatus status={sel.status} />
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#111827' }}>{formatarBRL(sel.valor)}</span>
              </div>

              <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '10px 0 4px' }}>Comprador</div>
              <Linha rotulo="Nome">{sel.nome}</Linha>
              <Linha rotulo="Telefone">{sel.telefone}</Linha>
              <Linha rotulo="CPF">{sel.cpf}</Linha>
              <Linha rotulo="E-mail">{sel.email}</Linha>
              <Linha rotulo="Nascimento">{formatarData(sel.data_nascimento)}</Linha>
              {sel.responsavel_nome && (
                <>
                  <Linha rotulo="Responsável">{sel.responsavel_nome}</Linha>
                  <Linha rotulo="Tel. responsável">{sel.responsavel_telefone}</Linha>
                  <Linha rotulo="CPF responsável">{sel.responsavel_cpf}</Linha>
                </>
              )}

              <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '14px 0 4px' }}>Pedido</div>
              <Linha rotulo="Variação">{sel.variacao}</Linha>
              <Linha rotulo="Método">{METODO_LABEL[sel.metodo] || sel.metodo}</Linha>
              <Linha rotulo="Pago em">{formatarDataHora(sel.pago_em)}</Linha>
              <Linha rotulo="Retirado em">{formatarDataHora(sel.retirado_em)}</Linha>
              <Linha rotulo="Cancelado em">{formatarDataHora(sel.cancelado_em)}</Linha>
              <Linha rotulo="Origem">{sel.origem_link}</Linha>
              <Linha rotulo="Turmas escolhidas">{Array.isArray(sel.aula_ids) && sel.aula_ids.length ? `${sel.aula_ids.length}` : null}</Linha>
              <Linha rotulo="Reservou estoque">{sel.reservou_estoque ? 'Sim' : null}</Linha>
              <Linha rotulo="Asaas">{sel.asaas_payment_id}</Linha>
              {sel.invoice_url && <Linha rotulo="Fatura"><a href={sel.invoice_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>abrir</a></Linha>}

              {respostas.length > 0 && (
                <>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '14px 0 4px' }}>Respostas do cadastro</div>
                  {respostas.map(([chave, valor]) => (
                    <Linha key={chave} rotulo={rotulos[chave] || chave}>{Array.isArray(valor) ? valor.join(', ') : String(valor ?? '')}</Linha>
                  ))}
                </>
              )}

              <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '14px 0 6px' }}>Link do pedido</div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: '12px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '8px 10px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  {linkPedido(slug, sel.token)}
                </div>
                <Button variant="outline" size="sm" icon="mdi:content-copy" iconOnly aria-label="Copiar link" onClick={async () => { await copiar(linkPedido(slug, sel.token)); showToast('Link copiado', 'success') }} />
                <Button as="a" href={linkPedido(slug, sel.token)} target="_blank" rel="noopener noreferrer" variant="outline" size="sm" icon="mdi:open-in-new" iconOnly aria-label="Abrir" />
              </div>

              {sel.devedor_id && (
                <div style={{ marginTop: '14px' }}>
                  <Button variant="secondary" icon="mdi:account-outline" fullWidth
                    onClick={() => navigate(`/app/clientes?cliente=${sel.devedor_id}&busca=${encodeURIComponent(sel.nome || '')}`)}>
                    Abrir ficha do aluno
                  </Button>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer align="between">
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {sel.status === 'aguardando_retirada' && (
                  <Button variant="primary" icon="mdi:package-variant-closed-check" loading={acao === 'retirado'} disabled={!!acao} onClick={marcarRetirado}>Marcar retirado</Button>
                )}
                {sel.status === 'aguardando_pagamento' && (
                  <Button variant="danger-outline" icon="mdi:close-circle-outline" disabled={!!acao} onClick={() => setConfirmarCancelar(true)}>Cancelar pedido</Button>
                )}
              </div>
              <Button variant="ghost" icon="mdi:sync" loading={acao === 'reprocessar'} disabled={!!acao} onClick={reprocessar} title="Consulta o Asaas de novo e refaz o que faltou (aluno, mensalidade, contrato).">Reprocessar</Button>
            </Modal.Footer>
          </>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmarCancelar}
        onClose={() => !acao && setConfirmarCancelar(false)}
        onConfirm={cancelarPedido}
        loading={acao === 'cancelar'}
        title="Cancelar este pedido?"
        description="O aluno não vai mais conseguir pagar por esse link. Se havia estoque reservado, ele volta para o item."
        confirmLabel="Cancelar pedido"
        cancelLabel="Voltar"
      />
    </div>
  )
}
