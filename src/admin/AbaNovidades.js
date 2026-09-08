import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { showSuccess, showError } from '../Toast'
import Modal from '../design-system/components/Modal'
import Button from '../design-system/components/Button'
import Input from '../design-system/components/Input'
import Select from '../design-system/components/Select'
import Switch from '../design-system/components/Switch'
import Table from '../design-system/components/Table'
import Tabs from '../design-system/components/Tabs'
import Badge from '../design-system/components/Badge'

/* --------------------------------------------------------------------------
   /admin > Atualizações — onde o changelog é publicado.

   "Atualizações" e não "Novidades" porque o feed carrega os três tipos da
   coluna `tag`: Novidade, Melhoria e Correção. Novidade é UM dos tipos, não o
   nome do conjunto.

   A razão de existir desta tela: enquanto publicar novidade exigia editar um
   array em src/components/NotificacoesDropdown.js e fazer deploy, o changelog
   ficou três meses sem uma linha. O gargalo nunca foi técnico, era de atrito.

   A coluna que interessa na lista é CLIQUES, não vistos: "850 pessoas viram"
   não diz nada sobre descoberta de feature. Quem clicou foi parar na tela.
-------------------------------------------------------------------------- */

const TAGS = [
  { value: 'Novidade', label: 'Novidade' },
  { value: 'Melhoria', label: 'Melhoria' },
  { value: 'Correção', label: 'Correção' },
]

const PUBLICOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'pagantes', label: 'Só contas pagantes' },
  { value: 'trial', label: 'Só quem está no teste' },
]

// Rotas que fazem sentido como destino da atualização — evita erro de digitação
// virar CTA quebrado. `onCreate` do Select deixa digitar uma fora da lista.
const ROTAS = [
  { value: '/app/home', label: 'Home' },
  { value: '/app/financeiro', label: 'Financeiro' },
  { value: '/app/clientes', label: 'Alunos' },
  { value: '/app/horarios', label: 'Agenda' },
  { value: '/app/whatsapp', label: 'WhatsApp' },
  { value: '/app/crm', label: 'CRM' },
  { value: '/app/relatorios', label: 'Relatórios' },
  { value: '/app/marketing', label: 'Marketing' },
  { value: '/app/configuracao', label: 'Configurações' },
  { value: '/app/configuracao?aba=integracoes', label: 'Configurações › Integrações (inclui multa e juros)' },
  { value: '/app/configuracao?aba=colaboradores', label: 'Configurações › Colaboradores' },
  { value: '/app/configuracao?aba=assinatura', label: 'Configurações › Minha Assinatura' },
  { value: '/app/marketing?aba=agendamento', label: 'Marketing › Agendamento Online' },
]

const VAZIA = {
  tag: 'Novidade',
  titulo: '',
  resumo: '',
  descricao: '',
  icone: '',
  imagem_url: '',
  cta_label: '',
  cta_rota: '',
  publico: 'todos',
  destaque: false,
  ativo: true,
  publicado_em: '',
}

// <input type="date"> fala 'YYYY-MM-DD'; o banco guarda timestamptz.
const paraInputDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '')
const doInputDate = (dia) => (dia ? new Date(`${dia}T12:00:00`).toISOString() : new Date().toISOString())

// Dias inteiros até a publicação (0 ou negativo = já saiu). Comparo pelo DIA,
// não pelo instante: senão algo marcado pra amanhã de manhã aparece como "hoje"
// só porque faltam menos de 24h.
const diasAte = (iso) => {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(iso); alvo.setHours(0, 0, 0, 0)
  return Math.round((alvo - hoje) / 86400000)
}

const fmtData = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Em que estado a atualização está AGORA. É o que o filtro usa e o que decide
// os selos da linha — a data sozinha não diz, porque uma atualização com data
// passada mas `ativo = false` não está no ar.
function situacao(linha) {
  if (!linha.ativo) return 'oculta'
  return new Date(linha.publicado_em) > new Date() ? 'agendada' : 'no_ar'
}

const FILTROS = [
  { value: 'todas', label: 'Todas' },
  { value: 'agendadas', label: 'Agendadas' },
  { value: 'no_ar', label: 'No ar' },
  { value: 'ocultas', label: 'Ocultas' },
]

export default function AbaNovidades() {
  const [linhas, setLinhas] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)      // null = modal fechado
  const [salvando, setSalvando] = useState(false)

  const [filtro, setFiltro] = useState('todas')
  // 'desc' = mais recente primeiro (bom pra ver o que já saiu),
  // 'asc'  = próxima primeiro (bom pra ver a fila).
  const [ordem, setOrdem] = useState('desc')

  const carregar = useCallback(async () => {
    setLoading(true)
    // A lista vem da tabela (pra editar) e as contagens da view (pra medir).
    const [{ data: novidades, error }, { data: metricas }] = await Promise.all([
      supabase.from('novidades').select('*').order('publicado_em', { ascending: false }),
      supabase.from('vw_novidades_metricas').select('id, vistos, cliques, taxa_clique'),
    ])

    if (error) {
      showError('Não consegui carregar as atualizações')
      setLoading(false)
      return
    }

    const porId = new Map((metricas || []).map((m) => [m.id, m]))
    setLinhas((novidades || []).map((n) => ({ ...n, ...(porId.get(n.id) || {}) })))
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Contagem por situação: vai no chip do filtro, pra dar a régua da fila sem
  // precisar entrar em cada aba.
  const contagens = useMemo(() => {
    const c = { todas: linhas.length, agendadas: 0, no_ar: 0, ocultas: 0 }
    linhas.forEach((l) => {
      const s = situacao(l)
      c[s === 'no_ar' ? 'no_ar' : s === 'agendada' ? 'agendadas' : 'ocultas'] += 1
    })
    return c
  }, [linhas])

  const visiveis = useMemo(() => {
    const alvo = { agendadas: 'agendada', no_ar: 'no_ar', ocultas: 'oculta' }[filtro]
    const lista = alvo ? linhas.filter((l) => situacao(l) === alvo) : [...linhas]
    return lista.sort((a, b) => {
      const d = new Date(a.publicado_em) - new Date(b.publicado_em)
      return ordem === 'asc' ? d : -d
    })
  }, [linhas, filtro, ordem])

  // Trocar pra "Agendadas" já vira a ordem: numa fila, o que interessa é a
  // PRÓXIMA, não a mais distante. Nos outros filtros o padrão é a mais recente.
  const trocarFiltro = (novo) => {
    setFiltro(novo)
    setOrdem(novo === 'agendadas' ? 'asc' : 'desc')
  }

  const abrirNova = () => setForm({ ...VAZIA, publicado_em: paraInputDate(new Date().toISOString()) })
  const abrirEdicao = (linha) => setForm({
    ...VAZIA,
    ...linha,
    descricao: linha.descricao || '',
    icone: linha.icone || '',
    imagem_url: linha.imagem_url || '',
    cta_label: linha.cta_label || '',
    cta_rota: linha.cta_rota || '',
    publicado_em: paraInputDate(linha.publicado_em),
  })

  const alterar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))

  const salvar = async () => {
    if (!form.titulo.trim() || !form.resumo.trim()) {
      showError('Título e resumo são obrigatórios')
      return
    }

    setSalvando(true)
    const payload = {
      tag: form.tag,
      titulo: form.titulo.trim(),
      resumo: form.resumo.trim(),
      descricao: form.descricao.trim() || null,
      icone: form.icone.trim() || null,
      imagem_url: form.imagem_url.trim() || null,
      cta_label: form.cta_label.trim() || null,
      cta_rota: form.cta_rota.trim() || null,
      publico: form.publico,
      destaque: form.destaque,
      ativo: form.ativo,
      publicado_em: doInputDate(form.publicado_em),
      updated_at: new Date().toISOString(),
    }

    const { error } = form.id
      ? await supabase.from('novidades').update(payload).eq('id', form.id)
      : await supabase.from('novidades').insert(payload)

    setSalvando(false)
    if (error) {
      showError(`Não salvou: ${error.message}`)
      return
    }
    showSuccess(form.id ? 'Atualização salva' : 'Atualização publicada')
    setForm(null)
    carregar()
  }

  const alternarAtivo = async (linha) => {
    const { error } = await supabase
      .from('novidades')
      .update({ ativo: !linha.ativo, updated_at: new Date().toISOString() })
      .eq('id', linha.id)
    if (error) return showError('Não consegui mudar o status')
    setLinhas((atual) => atual.map((n) => (n.id === linha.id ? { ...n, ativo: !n.ativo } : n)))
  }

  const excluir = async (linha) => {
    if (!window.confirm(`Excluir "${linha.titulo}"? As leituras e cliques registrados vão junto.`)) return
    const { error } = await supabase.from('novidades').delete().eq('id', linha.id)
    if (error) return showError('Não consegui excluir')
    showSuccess('Atualização excluída')
    carregar()
  }

  const colunas = [
    {
      key: 'titulo',
      label: 'Atualização',
      render: (r) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <strong style={{ fontSize: '14px', color: r.ativo ? '#1f2937' : '#9ca3af' }}>{r.titulo}</strong>
            {r.destaque && <Badge variant="primary" size="xs" icon="mdi:star">primeira do modal</Badge>}
            {!r.ativo && <Badge variant="default" size="xs">oculta</Badge>}
            {new Date(r.publicado_em) > new Date() && (
              <Badge variant="info" size="xs" icon="mdi:clock-outline">agendada</Badge>
            )}
            {/* O modal só desenha o container de mídia quando existe print — sem
                ele a novidade vira texto puro. Sinalizado aqui pra não passar batido. */}
            {!r.imagem_url && (
              <Badge variant="warning" size="xs" icon="mdi:image-off-outline">sem print</Badge>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>{r.resumo}</div>
        </div>
      ),
    },
    { key: 'tag', label: 'Tipo', width: 110, render: (r) => <Badge size="xs">{r.tag}</Badge> },
    {
      key: 'publicado_em',
      label: 'Publicada',
      width: 130,
      // A data crua não responde "quando isso sai?" — a linha de baixo traz o
      // "em 8 dias" pra não ter que contar no calendário.
      render: (r) => {
        const dias = diasAte(r.publicado_em)
        return (
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: '13px', color: '#374151' }}>{fmtData(r.publicado_em)}</div>
            {dias > 0 && (
              <div style={{ fontSize: '11px', color: '#8867A1', fontWeight: 600 }}>
                {dias === 1 ? 'amanhã' : `em ${dias} dias`}
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'publico',
      label: 'Público',
      width: 110,
      render: (r) => (
        <span style={{ fontSize: '13px', color: '#6b7280' }}>
          {PUBLICOS.find((p) => p.value === r.publico)?.label || r.publico}
        </span>
      ),
    },
    {
      key: 'cliques',
      label: 'Cliques',
      align: 'right',
      width: 130,
      // O número que decide se a novidade funcionou. Sem CTA não há o que medir.
      render: (r) => (
        r.cta_rota
          ? (
            <div style={{ lineHeight: 1.25 }}>
              <strong style={{ fontSize: '14px' }}>{r.cliques || 0}</strong>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                de {r.vistos || 0} que viram{r.vistos > 0 ? ` · ${r.taxa_clique}%` : ''}
              </div>
            </div>
          )
          : <span style={{ fontSize: '12px', color: '#d1d5db' }}>sem CTA</span>
      ),
    },
    {
      key: 'acoes',
      label: '',
      align: 'right',
      width: 130,
      render: (r) => (
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" icon="mdi:pencil-outline" iconOnly
            aria-label="Editar" onClick={() => abrirEdicao(r)} />
          <Button variant="ghost" size="sm" iconOnly
            icon={r.ativo ? 'mdi:eye-off-outline' : 'mdi:eye-outline'}
            aria-label={r.ativo ? 'Ocultar' : 'Mostrar'} onClick={() => alternarAtivo(r)} />
          <Button variant="ghost" size="sm" icon="mdi:trash-can-outline" iconOnly
            aria-label="Excluir" onClick={() => excluir(r)} />
        </div>
      ),
    },
  ]

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: '16px', marginBottom: '16px', flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>
            Atualizações do produto
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280', maxWidth: '620px' }}>
            Aparece na barra da Home de todas as contas e no sino do topo. Marque
            <strong> abre modal</strong> só na entrega grande — pop-up toda semana vira reflexo de fechar.
          </p>
        </div>
        <Button variant="primary" icon="mdi:plus" onClick={abrirNova}>
          Nova atualização
        </Button>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', marginBottom: '12px', flexWrap: 'wrap',
      }}>
        <Tabs
          variant="pills"
          size="sm"
          value={filtro}
          onChange={trocarFiltro}
          items={FILTROS.map((f) => ({ ...f, count: contagens[f.value] }))}
        />
        <Button
          variant="gray"
          size="sm"
          icon={ordem === 'asc' ? 'mdi:sort-calendar-ascending' : 'mdi:sort-calendar-descending'}
          onClick={() => setOrdem((o) => (o === 'asc' ? 'desc' : 'asc'))}
        >
          {ordem === 'asc' ? 'Próxima primeiro' : 'Mais recente primeiro'}
        </Button>
      </div>

      <Table
        columns={colunas}
        data={visiveis}
        loading={loading}
        emptyIcon="mdi:bullhorn-outline"
        emptyTitle="Nenhuma atualização publicada"
        emptyMessage="Publique a primeira e ela aparece na Home de todo mundo."
        emptyAction={<Button variant="primary" icon="mdi:plus" onClick={abrirNova}>Nova atualização</Button>}
      />

      <Modal
        isOpen={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Editar atualização' : 'Nova atualização'}
        subtitle="Escreva pensando em quem só usa a cobrança e nunca abriu o resto."
        size="lg"
      >
        {form && (
          <>
            <Modal.Body>
              <div style={{ display: 'grid', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <Select label="Tipo" options={TAGS} value={form.tag}
                    onChange={(v) => alterar('tag', v)} />
                  <Select label="Público" options={PUBLICOS} value={form.publico}
                    onChange={(v) => alterar('publico', v)} />
                  <Input label="Publicada em" type="date" value={form.publicado_em}
                    onChange={(e) => alterar('publicado_em', e.target.value)}
                    helper="Data futura = agendada" />
                </div>

                <Input label="Título" required value={form.titulo} maxLength={70} showCounter
                  placeholder="Botão &quot;Pular mês&quot; na mensalidade"
                  onChange={(e) => alterar('titulo', e.target.value)} />

                <Input label="Resumo" required value={form.resumo} maxLength={120} showCounter
                  placeholder="Uma linha: o que a pessoa ganha com isso"
                  helper="É o que aparece na barra da Home e no sino"
                  onChange={(e) => alterar('resumo', e.target.value)} />

                <div>
                  <label style={{
                    display: 'block', marginBottom: '6px', fontSize: '13px',
                    fontWeight: 600, color: '#374151',
                  }}>
                    Texto completo
                  </label>
                  <textarea
                    value={form.descricao}
                    onChange={(e) => alterar('descricao', e.target.value)}
                    rows={4}
                    placeholder="O parágrafo do modal: o que mudou, onde fica e por que importa."
                    style={{
                      width: '100%', padding: '10px 12px', fontSize: '14px',
                      fontFamily: 'inherit', color: '#1f2937', border: '1px solid #d1d5db',
                      borderRadius: '8px', resize: 'vertical', boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Select label="Leva para" options={ROTAS} value={form.cta_rota} clearable searchable
                    placeholder="Nenhuma (só informativa)"
                    onCreate={(texto) => alterar('cta_rota', texto)}
                    createLabel="Usar esta rota"
                    onChange={(v) => alterar('cta_rota', v || '')} />
                  <Input label="Texto do botão" value={form.cta_label}
                    placeholder="Abrir financeiro"
                    onChange={(e) => alterar('cta_label', e.target.value)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Input label="Ícone (Iconify)" value={form.icone}
                    placeholder="mdi:calendar-remove-outline"
                    helper="Usado quando não há print"
                    onChange={(e) => alterar('icone', e.target.value)} />
                  <Input label="Print da feature (URL)" value={form.imagem_url}
                    placeholder="https://..."
                    onChange={(e) => alterar('imagem_url', e.target.value)} />
                </div>

                <div style={{
                  display: 'grid', gap: '10px', padding: '12px 14px',
                  background: '#f9fafb', borderRadius: '10px',
                }}>
                  {/* O modal não depende mais desta chave: publicar já abre o
                      aviso pra quem não fechou desde a última leva. O que ela
                      faz agora é ordenar — a marcada encabeça o carrossel. */}
                  <Switch
                    checked={form.destaque}
                    onChange={(e) => alterar('destaque', e.target.checked)}
                    label="Encabeçar o modal"
                    description="O modal abre sozinho a cada publicação. Ligue aqui pra esta ser o primeiro slide da leva."
                  />
                  <Switch
                    checked={form.ativo}
                    onChange={(e) => alterar('ativo', e.target.checked)}
                    label="Visível para os clientes"
                    description="Desligado, some da Home e do sino sem perder as métricas."
                  />
                </div>
              </div>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
              <Button variant="primary" loading={salvando} onClick={salvar}>
                {form.id ? 'Salvar' : 'Publicar'}
              </Button>
            </Modal.Footer>
          </>
        )}
      </Modal>
    </div>
  )
}
