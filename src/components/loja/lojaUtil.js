import { Icon } from '@iconify/react'
import { supabase } from '../../supabaseClient'

// Helpers e constantes compartilhados pelo lado do gestor da Loja (Mensalli
// Vendas): LojaEditor e seus pedaços em components/loja/*.
// O formato "público" de produto/empresa é o mesmo das edges loja-dados e
// _shared/loja.ts — se mudar lá, mude produtoParaPublico() aqui.

export const VERDE = '#16a34a'
export const PRECO_ADDON = 'R$ 69,90/mês'

// Mesmos estilos do BioEditor (copiados de propósito: o editor da loja é o
// "irmão" do editor da bio e precisa parecer igual)
export const titulo = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }
export const dica = { fontSize: '12px', color: '#6b7280', margin: '0 0 10px' }
export const campo = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', backgroundColor: '#fff' }

export function Bloco({ icone, nome, acao, children }) {
  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '18px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <Icon icon={icone} width="20" style={{ color: '#344848' }} />
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1f2937', flex: 1 }}>{nome}</h3>
        {acao}
      </div>
      {children}
    </div>
  )
}

export function Chave({ ligado, onChange, disabled, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '8px 0', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '14px', color: disabled ? '#9ca3af' : '#374151' }}>
      <span>{children}</span>
      <span onClick={(e) => { e.preventDefault(); if (!disabled) onChange(!ligado) }}
        style={{ width: '40px', height: '22px', borderRadius: '999px', backgroundColor: ligado ? VERDE : '#d1d5db', opacity: disabled ? 0.5 : 1, position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}>
        <span style={{ position: 'absolute', top: '2px', left: ligado ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
      </span>
    </label>
  )
}

// Mesma lista de CobrancasAvulsas.js (copiada para não criar dependência circular)
export const CATEGORIAS_PADRAO = [
  { value: 'uniforme', label: 'Uniforme', icon: 'mdi:tshirt-crew-outline' },
  { value: 'suplemento', label: 'Suplemento', icon: 'mdi:pill' },
  { value: 'aula_extra', label: 'Aula Extra', icon: 'mdi:school-outline' },
  { value: 'material', label: 'Material', icon: 'mdi:package-variant' },
  { value: 'taxa', label: 'Taxa', icon: 'mdi:receipt-text-outline' },
  { value: 'evento', label: 'Evento', icon: 'mdi:calendar-star' },
  { value: 'outros', label: 'Outros', icon: 'mdi:dots-horizontal-circle-outline' }
]

export const TIPOS_ITEM = {
  plano: { label: 'Plano', icon: 'mdi:calendar-sync-outline', cor: '#2563eb', fundo: '#dbeafe', descricao: 'Mensalidade recorrente. O aluno vira cliente ativo e já escolhe a turma.' },
  pacote: { label: 'Pacote', icon: 'mdi:ticket-confirmation-outline', cor: '#7c3aed', fundo: '#ede9fe', descricao: 'Pacote de aulas avulsas com número fechado de aulas.' },
  produto: { label: 'Produto', icon: 'mdi:tshirt-crew-outline', cor: '#ea580c', fundo: '#ffedd5', descricao: 'Uniforme, suplemento, material. Com variações e estoque.' },
  evento: { label: 'Evento', icon: 'mdi:calendar-star', cor: '#16a34a', fundo: '#dcfce7', descricao: 'Campeonato, workshop, aulão. Com data, local e vagas.' }
}

// Status do pedido -> rótulo e cor do Badge
export const STATUS_PEDIDO = {
  aguardando_pagamento: { label: 'Aguardando pagamento', variant: 'warning' },
  pago: { label: 'Pago', variant: 'success' },
  turma_pendente: { label: 'Turma pendente', variant: 'info' },
  aguardando_retirada: { label: 'Aguardando retirada', custom: { bg: '#ede9fe', texto: '#6d28d9' } },
  concluido: { label: 'Concluído', variant: 'success' },
  retirado: { label: 'Retirado', variant: 'success' },
  expirado: { label: 'Expirado', variant: 'default' },
  cancelado: { label: 'Cancelado', variant: 'default' },
  estornado: { label: 'Estornado', variant: 'danger' }
}

// Status que contam como venda feita (para o "vendido no mês")
export const STATUS_VENDIDO = ['pago', 'turma_pendente', 'aguardando_retirada', 'concluido', 'retirado']

export const METODO_LABEL = { pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto' }

// ---------- loja_config ----------

export const CFG_PADRAO = {
  titulo: '',
  frase: '',
  suporte_whatsapp: '',
  boas_vindas: '',
  retirada: { ativa: false, endereco: '', horario: '' },
  // estilo: 'claro' (loja clara com a cor da marca, padrão) | 'bio' (igual ao link na bio) | 'tema' (tema/fonte próprios)
  aparencia: { estilo: 'claro', herdar_bio: false, tema: 'marca', fonte: 'inter' },
  mostrar_experimental: true,
  // Seções da página: liga/desliga + o pouco de conteúdo que não existe em outro lugar.
  // Galeria, FAQ, depoimentos manuais e chamada final caem no que a academia já
  // preencheu no site/bio quando os campos daqui estão vazios.
  secoes: {
    como_funciona: true, passos: ['', '', ''],
    resultados: true,
    depoimentos: true, depoimentos_manuais: [],
    horarios: true,
    faq: true, faq_itens: [],
    sobre: true,
    chamada_final: true, chamada_titulo: '', chamada_texto: ''
  }
}

// Garante todas as chaves (o jsonb salvo pode estar parcial ou nulo)
export function normalizarCfg(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  return {
    ...CFG_PADRAO,
    ...c,
    retirada: { ...CFG_PADRAO.retirada, ...(c.retirada || {}) },
    aparencia: { ...CFG_PADRAO.aparencia, ...(c.aparencia || {}) },
    mostrar_experimental: c.mostrar_experimental !== false,
    secoes: {
      ...CFG_PADRAO.secoes,
      ...(c.secoes || {}),
      passos: [0, 1, 2].map(i => (c.secoes?.passos?.[i] ?? '')),
      depoimentos_manuais: Array.isArray(c.secoes?.depoimentos_manuais) ? c.secoes.depoimentos_manuais.slice(0, 3) : [],
      faq_itens: Array.isArray(c.secoes?.faq_itens) ? c.secoes.faq_itens.slice(0, 6) : []
    }
  }
}

// ---------- formato público (mesmo de produtoPublico() em loja-dados) ----------

export function produtoParaPublico(p) {
  const vars = Array.isArray(p.variacoes)
    ? p.variacoes.filter(v => v && v.nome).map(v => ({ nome: String(v.nome), esgotado: v.estoque != null && Number(v.estoque) <= 0 }))
    : []
  const esgotadoSemVar = p.tipo === 'produto' && !vars.length && p.estoque != null && Number(p.estoque) <= 0
  const esgotadoComVar = p.tipo === 'produto' && vars.length > 0 && vars.every(v => v.esgotado)
  // No preview não chamamos loja_vagas_evento: mostramos as vagas cadastradas
  const vagas_restantes = p.tipo === 'evento' && p.vagas != null ? Number(p.vagas) : null
  return {
    id: p.id,
    tipo: p.tipo,
    nome: p.nome,
    descricao: p.descricao,
    valor: Number(p.valor) || 0,
    imagem_url: p.imagem_url,
    variacoes: vars,
    esgotado: esgotadoSemVar || esgotadoComVar,
    exigir_turma: !!p.exigir_turma,
    qtd_turmas: p.qtd_turmas ?? 1,
    data_evento: p.data_evento,
    local_evento: p.local_evento,
    validade_dias: p.validade_dias,
    campos_extras: Array.isArray(p.campos_extras) ? p.campos_extras : [],
    retirada_presencial: !!p.retirada_presencial,
    destaque: !!p.destaque,
    plano: p.planos ? {
      ciclo_cobranca: p.planos.ciclo_cobranca || 'mensal',
      tipo: p.planos.tipo || 'recorrente',
      numero_aulas: p.planos.numero_aulas
    } : null,
    vagas_restantes,
    lotado: vagas_restantes != null && vagas_restantes <= 0
  }
}

// Mesmo filtro da vitrine pública: só ativos e eventos ainda não passados
export function produtosVisiveis(produtos) {
  const agora = Date.now()
  return (produtos || [])
    .filter(p => p.ativo)
    .filter(p => !(p.tipo === 'evento' && p.data_evento && new Date(p.data_evento).getTime() < agora))
    .map(produtoParaPublico)
}

// Select de loja_produtos com o join que o formato público precisa
export const SELECT_PRODUTO = '*, planos(nome, valor, ciclo_cobranca, tipo, numero_aulas)'

// ---------- texto / formatação ----------

export function slugDoRotulo(rotulo) {
  return String(rotulo || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'campo'
}

export function formatarDataHora(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function formatarData(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}

export const linkLoja = (slug) => (slug ? `${window.location.origin}/loja/${slug}` : '')
export const linkPedido = (slug, token) => (slug && token ? `${window.location.origin}/loja/${slug}/pedido/${token}` : '')

export function textoGrupoLoja(nomeEmpresa, link) {
  return `🛒 *Loja${nomeEmpresa ? ` da ${nomeEmpresa}` : ''}*\n\n` +
    'Escolha seu plano, pacote ou produto, faça o cadastro e pague na hora pelo Pix ou cartão. Tudo online, sem fila:\n' +
    link
}

export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = texto; document.body.appendChild(ta)
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
  }
}

// ---------- erros ----------

export const MSG_SQL = 'As tabelas da loja ainda não existem no banco. Rode o SQL sql-criar-loja.sql no Supabase.'

// Coluna/tabela que não existe: o SQL da loja ainda não rodou
export function erroDeSchema(error) {
  if (!error) return false
  const codigos = ['42703', '42P01', 'PGRST204', 'PGRST205']
  return codigos.includes(error.code) || /loja_(ativa|config|produtos|pedidos)|assinaturas_addons/.test(error.message || '')
}

// ---------- escrita em usuarios ----------

// Liga o card da loja na bio sem perder o resto do bio_config (relê antes de
// gravar: o gestor pode ter mexido na bio em outra aba).
export async function colocarNaBio(userId) {
  const { data, error: erroLeitura } = await supabase.from('usuarios').select('bio_config').eq('id', userId).single()
  if (erroLeitura) throw erroLeitura
  const atual = data?.bio_config && typeof data.bio_config === 'object' ? data.bio_config : {}
  const novo = { ...atual, mostrar: { ...(atual.mostrar || {}), loja: true } }
  const { error } = await supabase.from('usuarios').update({ bio_config: novo }).eq('id', userId)
  if (error) throw error
  return novo
}

export const lojaNaBio = (bioConfig) => !!(bioConfig && bioConfig.mostrar && bioConfig.mostrar.loja)
