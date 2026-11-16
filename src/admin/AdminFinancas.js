import { useState, useEffect, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import { useUser } from '../contexts/UserContext'
import Button from '../design-system/components/Button'
import Badge from '../design-system/components/Badge'
import Card from '../design-system/components/Card'
import Input from '../design-system/components/Input'
import Select from '../design-system/components/Select'
import StatCard from '../design-system/components/StatCard'
import Table from '../design-system/components/Table'

/* ============================================================
   Finanças pessoais — o que o dono manda pro bot do Telegram

   O bot (edge function telegram-gastos) grava em gastos_pessoais: gastos
   ("45 mercado") e entradas ("recebi 3000 pró-labore", tipo = 'entrada').
   A RLS só deixa o próprio dono ler: é dado pessoal, não da empresa. Aqui dá
   pra ver quanto entrou, quanto saiu e o saldo do mês, corrigir e lançar à mão.
   ============================================================ */

// Mesmas categorias do bot (supabase/functions/telegram-gastos)
const CATEGORIAS = {
  gasto: ['Alimentação', 'Restaurante', 'Transporte', 'Casa', 'Saúde', 'Assinaturas',
    'Lazer', 'Compras', 'Educação', 'Pet', 'Outros'],
  entrada: ['Salário', 'Freela', 'Vendas', 'Rendimentos', 'Outros'],
}
const opcoesCategoria = (tipo) => CATEGORIAS[tipo].map(c => ({ value: c, label: c }))

const OPCOES_TIPO = [
  { value: 'gasto', label: 'Gasto', icon: 'mdi:arrow-up-circle-outline' },
  { value: 'entrada', label: 'Entrada', icon: 'mdi:arrow-down-circle-outline' },
]
const FILTROS = [
  { value: 'todos', label: 'Tudo' },
  { value: 'gasto', label: 'Só gastos' },
  { value: 'entrada', label: 'Só entradas' },
]

const COR_ENTRADA = 'var(--color-success-600, #2e7d32)'
const COR_FALTOU = 'var(--color-danger-600, #dc2626)'

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const isoData = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const dataCurta = (iso) => iso.split('-').reverse().slice(0, 2).join('/')
const textoSec = { fontSize: 12, color: 'var(--color-text-secondary, #6b7280)' }
const ehEntrada = (g) => g.tipo === 'entrada'

function limitesDoMes(ano, mes) {
  const pad = (n) => String(n).padStart(2, '0')
  const ini = (a, m) => `${a}-${pad(m + 1)}-01`
  const anterior = mes === 0 ? [ano - 1, 11] : [ano, mes - 1]
  const seguinte = mes === 11 ? [ano + 1, 0] : [ano, mes + 1]
  return { inicio: ini(ano, mes), inicioAnterior: ini(...anterior), fim: ini(...seguinte) }
}

function lerValor(texto) {
  const t = String(texto).replace(/[^\d.,]/g, '')
  const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null
}

export default function AdminFinancas() {
  const { user } = useUser()
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())
  const [lancamentos, setLancamentos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [filtro, setFiltro] = useState('todos')

  const [novoTipo, setNovoTipo] = useState('gasto')
  const [novoValor, setNovoValor] = useState('')
  const [novaDesc, setNovaDesc] = useState('')
  const [novaCat, setNovaCat] = useState('Outros')
  const [novaData, setNovaData] = useState(isoData(hoje))
  const [salvando, setSalvando] = useState(false)

  const { inicio, inicioAnterior, fim } = limitesDoMes(ano, mes)
  const nomeMes = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const ehMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth()

  const carregar = useCallback(async () => {
    if (!user?.id) return
    setCarregando(true)
    setErro(null)
    // Mês escolhido + o anterior, pra comparar
    const { data, error } = await supabase.from('gastos_pessoais')
      .select('id, tipo, valor, descricao, categoria, data, origem, created_at')
      .eq('user_id', user.id)
      .gte('data', inicioAnterior).lt('data', fim)
      .order('data', { ascending: false }).order('created_at', { ascending: false })
    if (error) setErro(error.message)
    else setLancamentos(data || [])
    setCarregando(false)
  }, [user?.id, inicioAnterior, fim])

  useEffect(() => { carregar() }, [carregar])

  const doMes = useMemo(() => lancamentos.filter(g => g.data >= inicio), [lancamentos, inicio])
  const visiveis = useMemo(
    () => filtro === 'todos' ? doMes : doMes.filter(g => (ehEntrada(g) ? 'entrada' : 'gasto') === filtro),
    [doMes, filtro],
  )

  const kpis = useMemo(() => {
    const soma = (lista) => lista.reduce((s, g) => s + Number(g.valor), 0)
    const gastos = doMes.filter(g => !ehEntrada(g))
    const gastou = soma(gastos)
    const entrou = soma(doMes.filter(ehEntrada))
    const gastouAnterior = soma(lancamentos.filter(g => g.data < inicio && !ehEntrada(g)))
    const dias = ehMesAtual ? new Date().getDate() : new Date(ano, mes + 1, 0).getDate()
    const porCat = {}
    for (const g of gastos) porCat[g.categoria] = (porCat[g.categoria] || 0) + Number(g.valor)
    const categorias = Object.entries(porCat).sort((a, b) => b[1] - a[1])
    return { gastou, entrou, saldo: entrou - gastou, gastouAnterior, mediaDia: gastou / dias, categorias }
  }, [doMes, lancamentos, inicio, ano, mes, ehMesAtual])

  const delta = useMemo(() => {
    if (!kpis.gastouAnterior) return undefined
    const pct = Math.round(((kpis.gastou - kpis.gastouAnterior) / kpis.gastouAnterior) * 100)
    return {
      value: `${pct > 0 ? '+' : ''}${pct}%`,
      direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
      tone: pct > 0 ? 'negative' : pct < 0 ? 'positive' : 'neutral',
      label: ehMesAtual ? 'vs. mês passado inteiro' : 'vs. mês anterior',
    }
  }, [kpis, ehMesAtual])

  const mudarMes = (passo) => {
    const m = mes + passo
    if (m < 0) { setAno(ano - 1); setMes(11) } else if (m > 11) { setAno(ano + 1); setMes(0) } else setMes(m)
  }

  const trocarTipoNovo = (tipo) => {
    setNovoTipo(tipo)
    if (!CATEGORIAS[tipo].includes(novaCat)) setNovaCat('Outros')
  }

  const adicionar = async () => {
    const valor = lerValor(novoValor)
    if (!valor) return alert('Valor inválido')
    setSalvando(true)
    const { error } = await supabase.from('gastos_pessoais').insert({
      user_id: user.id, tipo: novoTipo, valor, descricao: novaDesc.trim() || 'sem descrição',
      categoria: novaCat, data: novaData, origem: 'painel',
    })
    setSalvando(false)
    if (error) return alert('Erro ao salvar: ' + error.message)
    setNovoValor(''); setNovaDesc('')
    carregar()
  }

  const apagar = async (g) => {
    if (!window.confirm(`Apagar ${ehEntrada(g) ? 'entrada' : 'gasto'} de ${brl(g.valor)} · ${g.descricao}?`)) return
    const { error } = await supabase.from('gastos_pessoais').delete().eq('id', g.id)
    if (error) return alert('Erro ao apagar: ' + error.message)
    setLancamentos(lista => lista.filter(x => x.id !== g.id))
  }

  const mudarCategoria = async (g, categoria) => {
    const { error } = await supabase.from('gastos_pessoais').update({ categoria }).eq('id', g.id)
    if (error) return alert('Erro ao mudar categoria: ' + error.message)
    setLancamentos(lista => lista.map(x => x.id === g.id ? { ...x, categoria } : x))
  }

  const colunas = [
    { key: 'data', label: 'Dia', width: 70, render: g => dataCurta(g.data) },
    {
      key: 'descricao', label: 'Descrição', render: g => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {ehEntrada(g) && <Badge variant="success" style={{ marginRight: 6 }}>Entrada</Badge>}
            {g.descricao}
          </div>
          {g.origem === 'painel' && <div style={textoSec}>lançado no painel</div>}
        </div>
      ),
    },
    {
      key: 'categoria', label: 'Categoria', width: 180, render: g => (
        <Select
          options={opcoesCategoria(ehEntrada(g) ? 'entrada' : 'gasto')}
          value={g.categoria}
          onChange={(c) => mudarCategoria(g, c)}
          size="sm"
        />
      ),
    },
    {
      key: 'valor', label: 'Valor', align: 'right', width: 130, render: g => ehEntrada(g)
        ? <strong style={{ color: COR_ENTRADA }}>+ {brl(g.valor)}</strong>
        : <strong>{brl(g.valor)}</strong>,
    },
    {
      key: 'acoes', label: '', align: 'right', width: 56, render: g => (
        <Button variant="ghost" icon="mdi:trash-can-outline" iconOnly aria-label="Apagar" onClick={() => apagar(g)} />
      ),
    },
  ]

  const maiorCategoria = kpis.categorias[0]
  const sobrou = kpis.saldo >= 0

  return (
    <div className="adm-pagina">
      <div className="adm-cabecalho">
        <div>
          <h1 className="adm-titulo">Finanças pessoais</h1>
          <div className="adm-subtitulo">O que você manda pro bot do Telegram · só você vê</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="outline" icon="mdi:chevron-left" iconOnly aria-label="Mês anterior" onClick={() => mudarMes(-1)} />
          <div style={{ minWidth: 150, textAlign: 'center', fontWeight: 600, textTransform: 'capitalize' }}>{nomeMes}</div>
          <Button variant="outline" icon="mdi:chevron-right" iconOnly aria-label="Próximo mês" onClick={() => mudarMes(1)} disabled={ehMesAtual} />
        </div>
      </div>

      {erro && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ color: COR_FALTOU }}>
            <Icon icon="mdi:alert-circle-outline" style={{ verticalAlign: -2 }} /> {erro}
            {/column .*tipo.* does not exist/i.test(erro) && ' — rode o sql-gastos-pessoais-entradas.sql no SQL Editor.'}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Entrou" value={brl(kpis.entrou)} icon="mdi:arrow-down-circle-outline" accent="success" loading={carregando} />
        <StatCard
          label="Gastou" value={brl(kpis.gastou)} icon="mdi:arrow-up-circle-outline" accent="danger"
          loading={carregando} delta={delta} hint={`${brl(kpis.mediaDia)} por dia`}
        />
        <StatCard
          label={sobrou ? 'Sobrou' : 'Faltou'}
          value={brl(Math.abs(kpis.saldo))}
          icon={sobrou ? 'mdi:piggy-bank-outline' : 'mdi:alert-outline'}
          accent={sobrou ? 'success' : 'danger'}
          tinted
          loading={carregando}
          hint={kpis.entrou ? `${Math.round((kpis.gastou / kpis.entrou) * 100)}% do que entrou foi gasto` : 'Nenhuma entrada lançada'}
        />
        <StatCard
          label="Maior categoria"
          value={maiorCategoria ? maiorCategoria[0] : '—'}
          hint={maiorCategoria ? `${brl(maiorCategoria[1])} · ${Math.round((maiorCategoria[1] / kpis.gastou) * 100)}% dos gastos` : undefined}
          icon="mdi:tag-outline" accent="warning" loading={carregando}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Gastos por categoria</div>
          {kpis.categorias.length === 0 ? (
            <div style={textoSec}>Nenhum gasto neste mês.</div>
          ) : kpis.categorias.map(([cat, v]) => {
            const pct = (v / kpis.gastou) * 100
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                  <span>{cat}</span>
                  <span><strong>{brl(v)}</strong> <span style={textoSec}>{Math.round(pct)}%</span></span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-subtle, #f3f4f6)' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: 'var(--color-primary-500, #4CAF50)' }} />
                </div>
              </div>
            )
          })}
        </Card>

        <Card>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Lançar à mão</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              {OPCOES_TIPO.map(o => (
                <Button
                  key={o.value}
                  variant="outline"
                  icon={o.icon}
                  selected={novoTipo === o.value}
                  selectedTone={o.value === 'entrada' ? 'success' : undefined}
                  onClick={() => trocarTipoNovo(o.value)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
            <Input label="Valor" prefix="R$" inputMode="decimal" placeholder="45,90" value={novoValor} onChange={e => setNovoValor(e.target.value)} />
            <Input label="Dia" type="date" value={novaData} onChange={e => setNovaData(e.target.value)} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Input
                label="Descrição"
                placeholder={novoTipo === 'entrada' ? 'pró-labore' : 'mercado'}
                value={novaDesc}
                onChange={e => setNovaDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Select label="Categoria" options={opcoesCategoria(novoTipo)} value={novaCat} onChange={setNovaCat} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" icon="mdi:plus" onClick={adicionar} loading={salvando} disabled={!novoValor}>
              {novoTipo === 'entrada' ? 'Adicionar entrada' : 'Adicionar gasto'}
            </Button>
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{ minWidth: 170 }}>
          <Select options={FILTROS} value={filtro} onChange={setFiltro} />
        </div>
      </div>

      <Table
        columns={colunas}
        data={visiveis}
        rowKey="id"
        loading={carregando}
        emptyIcon="mdi:wallet-outline"
        emptyTitle="Nada lançado neste mês"
        emptyMessage={<>Mande <code>45 mercado</code> ou <code>recebi 3000 pró-labore</code> pro seu bot no Telegram.</>}
      />

      <div style={{ ...textoSec, marginTop: 16 }}>
        <Badge variant="default">Configuração do bot</Badge>{' '}
        Seu GASTOS_USER_ID: <code style={{ userSelect: 'all' }}>{user?.id}</code>
      </div>
    </div>
  )
}
