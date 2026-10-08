import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../../supabaseClient'
import { showToast } from '../../Toast'
import { uploadPublico } from '../../utils/upload'
import { formatarBRL } from '../../planosMensalli'
import Modal from '../../design-system/components/Modal'
import Button from '../../design-system/components/Button'
import Input from '../../design-system/components/Input'
import Select from '../../design-system/components/Select'
import Switch from '../../design-system/components/Switch'
import Checkbox from '../../design-system/components/Checkbox'
import Badge from '../../design-system/components/Badge'
import { CATEGORIAS_PADRAO, TIPOS_ITEM, SELECT_PRODUTO, slugDoRotulo, erroDeSchema, MSG_SQL, titulo, dica, campo } from './lojaUtil'

// Modal de item da loja: escolha do tipo (4 cards) + formulário por tipo.
// Grava direto em loja_produtos e devolve a linha salva (com join de planos)
// para a lista atualizar sem recarregar.

const FORM_VAZIO = {
  tipo: null,
  plano_id: '',
  nome: '',
  descricao: '',
  valor: '',
  imagem_url: '',
  categoria_avulsa: 'outros',
  variacoes: [],
  estoque: '',
  retirada_presencial: false,
  exigir_turma: true,
  qtd_turmas: 1,
  modalidade_id: '',
  contrato_template_id: '',
  validade_dias: '',
  data_evento: '',
  vagas: '',
  local_evento: '',
  campos_extras: []
}

const pad = (n) => String(n).padStart(2, '0')

// ISO (timestamptz) -> valor do <input type="datetime-local"> no fuso do navegador
function isoParaLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function deProduto(p) {
  if (!p) return FORM_VAZIO
  return {
    tipo: p.tipo,
    plano_id: p.plano_id || '',
    nome: p.nome || '',
    descricao: p.descricao || '',
    valor: p.valor != null ? String(Number(p.valor)).replace('.', ',') : '',
    imagem_url: p.imagem_url || '',
    categoria_avulsa: p.categoria_avulsa || 'outros',
    variacoes: Array.isArray(p.variacoes) ? p.variacoes.map(v => ({ nome: v.nome || '', estoque: v.estoque == null ? '' : String(v.estoque) })) : [],
    estoque: p.estoque == null ? '' : String(p.estoque),
    retirada_presencial: !!p.retirada_presencial,
    exigir_turma: p.exigir_turma !== false,
    qtd_turmas: p.qtd_turmas ?? 1,
    modalidade_id: p.modalidade_id || '',
    contrato_template_id: p.contrato_template_id || '',
    validade_dias: p.validade_dias == null ? '' : String(p.validade_dias),
    data_evento: isoParaLocal(p.data_evento),
    vagas: p.vagas == null ? '' : String(p.vagas),
    local_evento: p.local_evento || '',
    campos_extras: Array.isArray(p.campos_extras) ? p.campos_extras.map(c => ({
      rotulo: c.rotulo || '', tipo: c.tipo === 'opcao' ? 'opcao' : 'texto',
      opcoes: Array.isArray(c.opcoes) ? c.opcoes.join(', ') : '', obrigatorio: !!c.obrigatorio
    })) : []
  }
}

const paraNumero = (s) => {
  const n = parseFloat(String(s ?? '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? NaN : n
}
const inteiroOuNulo = (s) => {
  if (s === '' || s == null) return null
  const n = parseInt(s, 10)
  return isNaN(n) ? null : Math.max(0, n)
}

const linhaCampo = { display: 'grid', gap: '12px', marginBottom: '14px' }
const botaoTracejado = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: '1px dashed #9ca3af', backgroundColor: '#fff', color: '#374151', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
const botaoX = { border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', flexShrink: 0 }

export default function LojaProdutoModal({ isOpen, onClose, produto, planos, modalidades, contratos, userId, proximaOrdem, podeUpload, onSalvo }) {
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (isOpen) setForm(deProduto(produto))
  }, [isOpen, produto])

  const set = (patch) => setForm(prev => ({ ...prev, ...patch }))
  const editando = !!produto
  const tipoInfo = form.tipo ? TIPOS_ITEM[form.tipo] : null

  const planosDoTipo = useMemo(() => {
    if (form.tipo === 'plano') return (planos || []).filter(p => (p.tipo || 'recorrente') === 'recorrente')
    if (form.tipo === 'pacote') return (planos || []).filter(p => p.tipo === 'pacote')
    return []
  }, [planos, form.tipo])
  const planoSel = planosDoTipo.find(p => p.id === form.plano_id) || (planos || []).find(p => p.id === form.plano_id) || null
  const herdaPreco = form.tipo === 'plano' || form.tipo === 'pacote'

  const escolherPlano = (id) => {
    const p = (planos || []).find(x => x.id === id)
    const anterior = planoSel
    const patch = { plano_id: id || '' }
    if (p) {
      // Nome e descrição seguem o plano enquanto o gestor não personalizou
      if (!form.nome.trim() || (anterior && form.nome === anterior.nome)) patch.nome = p.nome || ''
      if (!form.descricao.trim() || (anterior && form.descricao === (anterior.descricao || ''))) patch.descricao = p.descricao || ''
    }
    set(patch)
  }

  const enviarFoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEnviando(true)
    try {
      const url = await uploadPublico(userId, file, { prefixo: 'loja', maxMB: 3 })
      set({ imagem_url: url })
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setEnviando(false)
    }
  }

  // ---------- variações ----------
  const setVar = (i, patch) => set({ variacoes: form.variacoes.map((v, k) => (k === i ? { ...v, ...patch } : v)) })
  const temVariacoes = form.variacoes.some(v => v.nome.trim())

  // ---------- campos extras ----------
  const setExtra = (i, patch) => set({ campos_extras: form.campos_extras.map((c, k) => (k === i ? { ...c, ...patch } : c)) })

  const validar = () => {
    if (!form.tipo) return 'Escolha o tipo do item.'
    if (!form.nome.trim()) return 'Dê um nome ao item.'
    // O Asaas não aceita cobrança abaixo de R$ 5,00
    if (herdaPreco) {
      if (!form.plano_id || !planoSel) return form.tipo === 'plano' ? 'Escolha o plano que será vendido.' : 'Escolha o pacote que será vendido.'
      if (Number(planoSel.valor) < 5) return 'Este plano custa menos de R$ 5,00, que é o mínimo do Asaas para pagamento online. Ajuste o valor em Configurações › Planos.'
    } else {
      const v = paraNumero(form.valor)
      if (!(v > 0)) return 'Informe um preço maior que zero.'
      if (v < 5) return 'O preço mínimo para pagamento online é R$ 5,00 (regra do Asaas).'
    }
    if (form.tipo === 'evento') {
      if (!form.data_evento) return 'Informe a data e hora do evento.'
      if (new Date(form.data_evento).getTime() <= Date.now()) return 'A data do evento precisa ser no futuro.'
    }
    for (const c of form.campos_extras) {
      if (!c.rotulo.trim()) return 'Todo campo extra precisa de um rótulo.'
      if (c.tipo === 'opcao' && !c.opcoes.split(',').map(s => s.trim()).filter(Boolean).length) return `Informe as opções do campo "${c.rotulo}".`
    }
    return null
  }

  const salvar = async () => {
    const erro = validar()
    if (erro) { showToast(erro, 'warning'); return }
    setSalvando(true)
    try {
      const t = form.tipo
      const vars = t === 'produto'
        ? form.variacoes.filter(v => v.nome.trim()).map(v => ({ nome: v.nome.trim(), estoque: inteiroOuNulo(v.estoque) }))
        : []
      const extras = form.campos_extras.map(c => ({
        chave: slugDoRotulo(c.rotulo),
        rotulo: c.rotulo.trim(),
        tipo: c.tipo === 'opcao' ? 'opcao' : 'texto',
        opcoes: c.tipo === 'opcao' ? c.opcoes.split(',').map(s => s.trim()).filter(Boolean) : [],
        obrigatorio: !!c.obrigatorio
      }))
      const payload = {
        tipo: t,
        plano_id: herdaPreco ? form.plano_id : null,
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        valor: herdaPreco ? Number(planoSel.valor) || 0 : paraNumero(form.valor),
        imagem_url: form.imagem_url || null,
        // produto usa a categoria escolhida; evento cai em 'evento' em cobrancas_avulsas
        categoria_avulsa: t === 'produto' ? form.categoria_avulsa : t === 'evento' ? 'evento' : null,
        variacoes: vars.length ? vars : null,
        estoque: t === 'produto' && !vars.length ? inteiroOuNulo(form.estoque) : null,
        exigir_turma: t === 'plano' ? !!form.exigir_turma : false,
        qtd_turmas: t === 'plano' ? Number(form.qtd_turmas) || 0 : 1,
        modalidade_id: t === 'plano' && form.modalidade_id ? form.modalidade_id : null,
        data_evento: t === 'evento' ? new Date(form.data_evento).toISOString() : null,
        vagas: t === 'evento' ? inteiroOuNulo(form.vagas) : null,
        local_evento: t === 'evento' ? form.local_evento.trim() || null : null,
        validade_dias: t === 'pacote' ? inteiroOuNulo(form.validade_dias) : null,
        campos_extras: extras.length ? extras : null,
        contrato_template_id: t === 'plano' && form.contrato_template_id ? form.contrato_template_id : null,
        retirada_presencial: t === 'produto' ? !!form.retirada_presencial : false
      }
      const consulta = editando
        ? supabase.from('loja_produtos').update(payload).eq('id', produto.id).select(SELECT_PRODUTO).single()
        : supabase.from('loja_produtos').insert({ ...payload, user_id: userId, ativo: true, ordem: proximaOrdem ?? 0 }).select(SELECT_PRODUTO).single()
      const { data, error } = await consulta
      if (error) {
        if (erroDeSchema(error)) { showToast(MSG_SQL, 'error'); return }
        throw error
      }
      onSalvo(data)
      showToast(editando ? 'Item atualizado' : 'Item adicionado à loja', 'success')
      onClose()
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  // ---------- pedaços do formulário ----------

  const escolhaTipo = (
    <div>
      <p style={{ ...dica, marginBottom: '14px' }}>O que você quer vender?</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
        {Object.entries(TIPOS_ITEM).map(([id, t]) => (
          <button key={id} type="button" onClick={() => set({ tipo: id, exigir_turma: id === 'plano' })}
            style={{ textAlign: 'left', padding: '14px', borderRadius: '12px', border: '1px solid #e5e7eb', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <span style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: t.fundo, color: t.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon icon={t.icon} width="22" />
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '14px', color: '#111827' }}>{t.label}</span>
              <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', lineHeight: 1.45, marginTop: '2px' }}>{t.descricao}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  const foto = (
    <div>
      <span style={titulo}>Foto</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <label style={{
          width: '96px', height: '96px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0,
          cursor: !podeUpload ? 'not-allowed' : enviando ? 'wait' : 'pointer',
          border: form.imagem_url ? '1px solid #e5e7eb' : '2px dashed #cbd5e1', backgroundColor: '#f9fafb',
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: enviando || !podeUpload ? 0.6 : 1
        }}>
          {form.imagem_url
            ? <img src={form.imagem_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Icon icon={enviando ? 'eos-icons:loading' : 'mdi:image-plus-outline'} width="28" style={{ color: '#9ca3af' }} />}
          <input type="file" accept="image/*" onChange={enviarFoto} disabled={enviando || !podeUpload} style={{ display: 'none' }} />
        </label>
        <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>
          {!podeUpload
            ? 'Upload desativado enquanto você visualiza a conta de um cliente.'
            : form.imagem_url ? 'Clique na imagem para trocar.' : 'Quadrada fica melhor. Até 3MB.'}
          {form.imagem_url && (
            <div>
              <button type="button" onClick={() => set({ imagem_url: '' })}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: '12px', textDecoration: 'underline' }}>remover foto</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const descricao = (
    <div>
      <span style={titulo}>Descrição</span>
      <textarea value={form.descricao} rows={3} maxLength={600} onChange={(e) => set({ descricao: e.target.value })}
        placeholder="O que está incluso, para quem é, observações..." style={{ ...campo, resize: 'vertical' }} />
    </div>
  )

  const camposExtras = (
    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
      <span style={titulo}>Campos extras do cadastro</span>
      <p style={dica}>Perguntas a mais na hora da compra. Ex.: "Tamanho da camiseta", "Graduação", "Restrição alimentar".</p>
      {form.campos_extras.map((c, i) => (
        <div key={i} style={{ padding: '10px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
            <input value={c.rotulo} maxLength={60} onChange={(e) => setExtra(i, { rotulo: e.target.value })} placeholder="Rótulo da pergunta" style={campo} />
            <select value={c.tipo} onChange={(e) => setExtra(i, { tipo: e.target.value })} style={{ ...campo, width: 'auto', flex: '0 0 auto' }}>
              <option value="texto">Texto livre</option>
              <option value="opcao">Opções</option>
            </select>
            <button type="button" onClick={() => set({ campos_extras: form.campos_extras.filter((_, k) => k !== i) })} aria-label="Remover campo" style={botaoX}>
              <Icon icon="mdi:close" width="20" />
            </button>
          </div>
          {c.tipo === 'opcao' && (
            <input value={c.opcoes} onChange={(e) => setExtra(i, { opcoes: e.target.value })} placeholder="Opções separadas por vírgula. Ex.: P, M, G, GG" style={{ ...campo, marginBottom: '8px' }} />
          )}
          <Checkbox checked={c.obrigatorio} onChange={(e) => setExtra(i, { obrigatorio: e.target.checked })} label="Obrigatório" />
        </div>
      ))}
      <button type="button" style={botaoTracejado} onClick={() => set({ campos_extras: [...form.campos_extras, { rotulo: '', tipo: 'texto', opcoes: '', obrigatorio: false }] })}>
        <Icon icon="mdi:plus" width="16" /> Adicionar pergunta
      </button>
    </div>
  )

  const formPlanoOuPacote = (
    <>
      <div style={linhaCampo}>
        <Select
          label={form.tipo === 'plano' ? 'Plano vendido' : 'Pacote vendido'}
          placeholder={planosDoTipo.length ? 'Escolha...' : (form.tipo === 'plano' ? 'Nenhum plano recorrente ativo' : 'Nenhum pacote ativo')}
          options={planosDoTipo.map(p => ({
            value: p.id,
            label: form.tipo === 'pacote'
              ? `${p.nome} · ${p.numero_aulas || '?'} aulas · ${formatarBRL(p.valor)}`
              : `${p.nome} · ${formatarBRL(p.valor)}/${p.ciclo_cobranca === 'anual' ? 'ano' : p.ciclo_cobranca === 'semestral' ? 'semestre' : p.ciclo_cobranca === 'trimestral' ? 'trimestre' : 'mês'}`
          }))}
          value={form.plano_id}
          onChange={escolherPlano}
          disabled={!planosDoTipo.length}
          helper={!planosDoTipo.length ? 'Cadastre em Configurações › Planos.' : undefined}
        />
        {planoSel && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', padding: '10px 12px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '13px', color: '#475569' }}>
            <span><strong style={{ color: '#111827' }}>Preço:</strong> {formatarBRL(planoSel.valor)}</span>
            {form.tipo === 'plano' && <span><strong style={{ color: '#111827' }}>Ciclo:</strong> {planoSel.ciclo_cobranca || 'mensal'}</span>}
            {form.tipo === 'pacote' && <span><strong style={{ color: '#111827' }}>Aulas:</strong> {planoSel.numero_aulas || '—'}</span>}
            <span style={{ color: '#94a3b8' }}>Vem do plano; para mudar, edite em Planos.</span>
          </div>
        )}
        <Input label="Nome de exibição na loja" value={form.nome} maxLength={80} onChange={(e) => set({ nome: e.target.value })} placeholder={planoSel?.nome || 'Ex.: Plano Mensal Muay Thai'} />
        {descricao}
        {foto}
      </div>

      {form.tipo === 'plano' && (
        <div style={{ ...linhaCampo, borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
          <Switch checked={form.exigir_turma} onChange={(e) => set({ exigir_turma: e.target.checked })}
            label="Aluno escolhe turma depois de pagar" description="Ele vê os horários com vaga e já entra na turma fixa." labelPosition="left" />
          {form.exigir_turma && (
            <>
              <div>
                <span style={titulo}>Quantas turmas ele escolhe</span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[[1, '1 horário'], [2, '2 horários'], [3, '3 horários'], [0, 'Livre']].map(([n, label]) => {
                    const ativo = Number(form.qtd_turmas) === n
                    return (
                      <button key={n} type="button" onClick={() => set({ qtd_turmas: n })}
                        style={{ padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, border: ativo ? '2px solid #111827' : '1px solid #d1d5db', backgroundColor: ativo ? '#111827' : '#fff', color: ativo ? '#fff' : '#374151' }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <Select label="Modalidade das turmas (opcional)" placeholder="Todas as modalidades" clearable
                options={(modalidades || []).map(m => ({ value: m.id, label: m.nome }))}
                value={form.modalidade_id} onChange={(v) => set({ modalidade_id: v || '' })}
                helper="Filtra os horários que o aluno vê." />
            </>
          )}
          <Select label="Contrato a enviar ao pagar (opcional)" placeholder="Nenhum" clearable
            options={(contratos || []).map(c => ({ value: c.id, label: c.titulo }))}
            value={form.contrato_template_id} onChange={(v) => set({ contrato_template_id: v || '' })}
            helper="O aluno recebe o link do contrato no WhatsApp junto com a confirmação." />
        </div>
      )}

      {form.tipo === 'pacote' && (
        <div style={{ ...linhaCampo, borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
          <Input label="Validade em dias (opcional)" type="number" min="1" value={form.validade_dias} onChange={(e) => set({ validade_dias: e.target.value })} placeholder="Ex.: 90" helper="Só informativo na vitrine." />
        </div>
      )}
    </>
  )

  const formProduto = (
    <>
      <div style={linhaCampo}>
        <Input label="Nome" value={form.nome} maxLength={80} onChange={(e) => set({ nome: e.target.value })} placeholder="Ex.: Camiseta oficial" />
        <Input label="Preço" prefix="R$" inputMode="decimal" value={form.valor} onChange={(e) => set({ valor: e.target.value })} placeholder="0,00" />
        {descricao}
        {foto}
        <Select label="Categoria" options={CATEGORIAS_PADRAO.map(c => ({ value: c.value, label: c.label, icon: c.icon }))}
          value={form.categoria_avulsa} onChange={(v) => set({ categoria_avulsa: v || 'outros' })}
          helper="Vai para a cobrança avulsa quando vender." />
      </div>

      <div style={{ ...linhaCampo, borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
        <div>
          <span style={titulo}>Variações</span>
          <p style={dica}>Tamanho, cor, sabor... Estoque em branco = ilimitado.</p>
          {form.variacoes.map((v, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <input value={v.nome} maxLength={40} onChange={(e) => setVar(i, { nome: e.target.value })} placeholder="Ex.: M" style={campo} />
              <input value={v.estoque} type="number" min="0" onChange={(e) => setVar(i, { estoque: e.target.value })} placeholder="Estoque" style={{ ...campo, flex: '0 0 110px' }} />
              <button type="button" onClick={() => set({ variacoes: form.variacoes.filter((_, k) => k !== i) })} aria-label="Remover variação" style={botaoX}>
                <Icon icon="mdi:close" width="20" />
              </button>
            </div>
          ))}
          <button type="button" style={botaoTracejado} onClick={() => set({ variacoes: [...form.variacoes, { nome: '', estoque: '' }] })}>
            <Icon icon="mdi:plus" width="16" /> Adicionar variação
          </button>
        </div>
        {!temVariacoes && (
          <Input label="Estoque geral (opcional)" type="number" min="0" value={form.estoque} onChange={(e) => set({ estoque: e.target.value })} placeholder="Em branco = ilimitado" />
        )}
        <Switch checked={form.retirada_presencial} onChange={(e) => set({ retirada_presencial: e.target.checked })}
          label="Retirada presencial" description="Depois de pagar, o aluno retira na academia e você marca como retirado." labelPosition="left" />
      </div>
    </>
  )

  const formEvento = (
    <div style={linhaCampo}>
      <Input label="Nome" value={form.nome} maxLength={80} onChange={(e) => set({ nome: e.target.value })} placeholder="Ex.: Aulão de Carnaval" />
      <Input label="Preço" prefix="R$" inputMode="decimal" value={form.valor} onChange={(e) => set({ valor: e.target.value })} placeholder="0,00" />
      {descricao}
      {foto}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <Input label="Data e hora" type="datetime-local" value={form.data_evento} onChange={(e) => set({ data_evento: e.target.value })} />
        <Input label="Vagas (opcional)" type="number" min="1" value={form.vagas} onChange={(e) => set({ vagas: e.target.value })} placeholder="Em branco = ilimitado" />
      </div>
      <Input label="Local" value={form.local_evento} maxLength={120} onChange={(e) => set({ local_evento: e.target.value })} placeholder="Ex.: Na própria academia" />
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={salvando ? undefined : onClose} size="lg"
      title={editando ? 'Editar item' : 'Novo item'}
      subtitle={tipoInfo ? tipoInfo.descricao : 'Escolha o tipo e preencha os dados.'}>
      <Modal.Body>
        {!form.tipo ? escolhaTipo : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Badge customColor={tipoInfo.fundo} customTextColor={tipoInfo.cor} icon={tipoInfo.icon} size="md">{tipoInfo.label}</Badge>
              {!editando && (
                <button type="button" onClick={() => set({ tipo: null })}
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: '12px', textDecoration: 'underline' }}>trocar tipo</button>
              )}
            </div>
            {(form.tipo === 'plano' || form.tipo === 'pacote') && formPlanoOuPacote}
            {form.tipo === 'produto' && formProduto}
            {form.tipo === 'evento' && formEvento}
            {camposExtras}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
        {form.tipo && <Button variant="primary" onClick={salvar} loading={salvando}>{editando ? 'Salvar' : 'Adicionar à loja'}</Button>}
      </Modal.Footer>
    </Modal>
  )
}
