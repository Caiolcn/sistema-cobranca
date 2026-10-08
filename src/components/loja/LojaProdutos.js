import { useState } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../../supabaseClient'
import { showToast } from '../../Toast'
import { formatarBRL } from '../../planosMensalli'
import Button from '../../design-system/components/Button'
import Badge from '../../design-system/components/Badge'
import EmptyState from '../../design-system/components/EmptyState'
import { ConfirmDialog } from '../../design-system/components/Modal'
import LojaProdutoModal from './LojaProdutoModal'
import { TIPOS_ITEM, Chave, formatarDataHora, erroDeSchema, MSG_SQL } from './lojaUtil'

// Sub-aba Produtos: lista ordenada por `ordem`, com ativar/desativar,
// reordenar, editar e excluir. Tudo salva na hora (não passa pela barra Salvar).

const botaoIcone = (disabled) => ({ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: disabled ? '#d1d5db' : '#374151', cursor: disabled ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 })

function resumoEstoque(p) {
  if (p.tipo === 'produto') {
    const vars = Array.isArray(p.variacoes) ? p.variacoes.filter(v => v && v.nome) : []
    if (vars.length) {
      const finitas = vars.filter(v => v.estoque != null)
      if (!finitas.length) return `${vars.length} variações`
      const total = finitas.reduce((s, v) => s + Number(v.estoque || 0), 0)
      return `${vars.length} variações · ${total} em estoque`
    }
    if (p.estoque != null) return Number(p.estoque) <= 0 ? 'Esgotado' : `${p.estoque} em estoque`
    return null
  }
  if (p.tipo === 'evento') {
    const partes = []
    if (p.data_evento) partes.push(formatarDataHora(p.data_evento))
    if (p.vagas != null) partes.push(`${p.vagas} vagas`)
    return partes.join(' · ') || null
  }
  if (p.tipo === 'plano') {
    if (p.exigir_turma) return p.qtd_turmas === 0 ? 'Escolhe turmas livremente' : `Escolhe ${p.qtd_turmas || 1} turma${(p.qtd_turmas || 1) > 1 ? 's' : ''}`
    return 'Sem escolha de turma'
  }
  if (p.tipo === 'pacote') {
    const partes = []
    if (p.planos?.numero_aulas) partes.push(`${p.planos.numero_aulas} aulas`)
    if (p.validade_dias) partes.push(`vale ${p.validade_dias} dias`)
    return partes.join(' · ') || null
  }
  return null
}

export default function LojaProdutos({ produtos, setProdutos, planos, modalidades, contratos, userId, podeUpload, onImportarPlanos }) {
  const [modal, setModal] = useState({ aberto: false, produto: null })
  const [excluindo, setExcluindo] = useState(null)      // produto em confirmação
  const [ocupado, setOcupado] = useState(false)

  const atualizarLocal = (row) => setProdutos(prev => {
    const existe = prev.some(p => p.id === row.id)
    const lista = existe ? prev.map(p => (p.id === row.id ? { ...p, ...row } : p)) : [...prev, row]
    return lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
  })

  const tratarErro = (error, prefixo) => {
    if (erroDeSchema(error)) showToast(MSG_SQL, 'error')
    else showToast(`${prefixo}: ${error.message}`, 'error')
  }

  const alternarAtivo = async (p, ativo) => {
    atualizarLocal({ id: p.id, ativo })
    const { error } = await supabase.from('loja_produtos').update({ ativo }).eq('id', p.id)
    if (error) { atualizarLocal({ id: p.id, ativo: !ativo }); tratarErro(error, 'Erro ao atualizar') }
  }

  // Estrela: entra na seção "Destaques" da vitrine (até 6, na ordem da lista)
  const alternarDestaque = async (p) => {
    const destaque = !p.destaque
    if (destaque && produtos.filter(x => x.destaque).length >= 6) { showToast('Você já tem 6 destaques. Tire a estrela de um para marcar outro.', 'warning'); return }
    atualizarLocal({ id: p.id, destaque })
    const { error } = await supabase.from('loja_produtos').update({ destaque }).eq('id', p.id)
    if (error) { atualizarLocal({ id: p.id, destaque: !destaque }); tratarErro(error, 'Erro ao atualizar destaque') }
  }

  const mover = async (i, d) => {
    const j = i + d
    if (j < 0 || j >= produtos.length || ocupado) return
    const novo = [...produtos]
    ;[novo[i], novo[j]] = [novo[j], novo[i]]
    // Renumera tudo: linhas antigas podem ter `ordem` repetida
    const renumerado = novo.map((p, k) => ({ ...p, ordem: k }))
    const mudaram = renumerado.filter(p => p.ordem !== (produtos.find(x => x.id === p.id)?.ordem))
    setProdutos(renumerado)
    setOcupado(true)
    const resultados = await Promise.all(mudaram.map(p => supabase.from('loja_produtos').update({ ordem: p.ordem }).eq('id', p.id)))
    setOcupado(false)
    const falha = resultados.find(r => r.error)
    if (falha) { setProdutos(produtos); tratarErro(falha.error, 'Erro ao reordenar') }
  }

  const confirmarExclusao = async () => {
    const p = excluindo
    if (!p) return
    setOcupado(true)
    try {
      const { count, error: erroCount } = await supabase.from('loja_pedidos').select('id', { count: 'exact', head: true }).eq('produto_id', p.id)
      if (erroCount) throw erroCount
      if ((count || 0) > 0) {
        const { error } = await supabase.from('loja_produtos').update({ ativo: false }).eq('id', p.id)
        if (error) throw error
        atualizarLocal({ id: p.id, ativo: false })
        showToast(`"${p.nome}" tem ${count} pedido${count > 1 ? 's' : ''} ligado${count > 1 ? 's' : ''}, então foi desativado em vez de excluído.`, 'warning')
      } else {
        const { error } = await supabase.from('loja_produtos').delete().eq('id', p.id)
        if (error) throw error
        setProdutos(prev => prev.filter(x => x.id !== p.id))
        showToast('Item excluído', 'success')
      }
      setExcluindo(null)
    } catch (error) {
      tratarErro(error, 'Erro ao excluir')
    } finally {
      setOcupado(false)
    }
  }

  const proximaOrdem = produtos.reduce((m, p) => Math.max(m, p.ordem ?? 0), -1) + 1

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', color: '#6b7280' }}>
          {produtos.length === 0 ? 'Nenhum item ainda.' : `${produtos.filter(p => p.ativo).length} de ${produtos.length} ${produtos.length === 1 ? 'item visível' : 'itens visíveis'} na loja`}
        </div>
        <Button variant="primary" icon="mdi:plus" onClick={() => setModal({ aberto: true, produto: null })}>Novo item</Button>
      </div>

      {produtos.length === 0 ? (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px' }}>
          <EmptyState variant="first-use" icon="mdi:storefront-outline" title="Sua loja está vazia"
            description="Adicione um plano, pacote, produto ou evento. Você também pode importar seus planos de uma vez."
            action={<Button variant="primary" icon="mdi:plus" onClick={() => setModal({ aberto: true, produto: null })}>Novo item</Button>}
            secondary={onImportarPlanos && <Button variant="ghost" icon="mdi:import" onClick={onImportarPlanos}>Importar planos</Button>} />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {produtos.map((p, i) => {
            const t = TIPOS_ITEM[p.tipo] || TIPOS_ITEM.produto
            const extra = resumoEstoque(p)
            const precoPlano = p.planos && p.planos.valor != null ? Number(p.planos.valor) : null
            const precoDesatualizado = precoPlano != null && Math.abs(precoPlano - Number(p.valor)) >= 0.01
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', opacity: p.ativo ? 1 : 0.6 }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, backgroundColor: t.fundo, color: t.cor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.imagem_url ? <img src={p.imagem_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon icon={t.icon} width="24" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                    <Badge customColor={t.fundo} customTextColor={t.cor} size="xs">{t.label}</Badge>
                    {!p.ativo && <Badge variant="default" size="xs">Oculto</Badge>}
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#6b7280', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: '#374151' }}>{formatarBRL(p.valor)}</span>
                    {extra && <span>· {extra}</span>}
                    {precoDesatualizado && (
                      <span style={{ color: '#b45309' }} title="O preço do plano mudou. Abra o item e salve para atualizar.">· plano agora custa {formatarBRL(precoPlano)}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button type="button" onClick={() => alternarDestaque(p)} disabled={ocupado}
                    aria-label={p.destaque ? 'Tirar dos destaques' : 'Marcar como destaque'} title={p.destaque ? 'Em destaque na loja' : 'Marcar como destaque'}
                    style={{ ...botaoIcone(false), color: p.destaque ? '#f59e0b' : '#9ca3af', ...(p.destaque ? { borderColor: '#fde68a', backgroundColor: '#fffbeb' } : {}) }}>
                    <Icon icon={p.destaque ? 'mdi:star' : 'mdi:star-outline'} width="17" />
                  </button>
                  <Chave ligado={!!p.ativo} onChange={(v) => alternarAtivo(p, v)} />
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0 || ocupado} aria-label="Subir" style={botaoIcone(i === 0)}><Icon icon="mdi:arrow-up" width="16" /></button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === produtos.length - 1 || ocupado} aria-label="Descer" style={botaoIcone(i === produtos.length - 1)}><Icon icon="mdi:arrow-down" width="16" /></button>
                  <button type="button" onClick={() => setModal({ aberto: true, produto: p })} aria-label="Editar" style={botaoIcone(false)}><Icon icon="mdi:pencil-outline" width="16" /></button>
                  <button type="button" onClick={() => setExcluindo(p)} aria-label="Excluir" style={{ ...botaoIcone(false), color: '#ef4444', borderColor: '#fecaca' }}><Icon icon="mdi:trash-can-outline" width="16" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <LojaProdutoModal
        isOpen={modal.aberto}
        onClose={() => setModal({ aberto: false, produto: null })}
        produto={modal.produto}
        planos={planos}
        modalidades={modalidades}
        contratos={contratos}
        userId={userId}
        proximaOrdem={proximaOrdem}
        podeUpload={podeUpload}
        onSalvo={atualizarLocal}
      />

      <ConfirmDialog
        isOpen={!!excluindo}
        onClose={() => !ocupado && setExcluindo(null)}
        onConfirm={confirmarExclusao}
        loading={ocupado}
        title={`Excluir "${excluindo?.nome || ''}"?`}
        description="Se já houver pedidos deste item, ele será apenas desativado para manter o histórico."
        confirmLabel="Excluir"
      />
    </div>
  )
}
