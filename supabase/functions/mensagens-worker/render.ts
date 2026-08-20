// Montagem da mensagem da régua — separado do index.ts para poder ser testado
// sem subir a função nem tocar em produção (ver render.test.ts).
//
// O texto aqui tem que sair IDÊNTICO ao dos nós "Criar Msg *" do n8n
// (n8n-workflows/cobrancas-3em1.json). Divergência aqui muda o que o aluno lê.

const PORTAL_BASE = 'https://www.mensalli.com.br/portal/'

/** Textos usados quando a conta está conectada mas sem template salvo.
 *  Cópia fiel dos nós "Criar Msg *" do n8n — trocar aqui muda o que o aluno lê. */
export const FALLBACK: Record<string, string> = {
  'd-3': 'Olá, {{nomeCliente}}!\n\nSua mensalidade vence em 3 dias.\n\n💰 Valor: {{valorMensalidade}}\n📆 Vencimento: {{dataVencimento}}\n\n🔑 Chave Pix: {{chavePix}}\n\nEvite juros e multas, pague em dia!\n\n_{{nomeEmpresa}}_',
  'd0': 'Olá, {{nomeCliente}}!\n\nHoje é o dia do vencimento da sua mensalidade.\n\n💰 Valor: {{valorMensalidade}}\n💳 Pix para pagamento: {{chavePix}}\n\nQualquer dúvida, estamos à disposição!\n\n_{{nomeEmpresa}}_',
  'd+3': 'Olá, {{nomeCliente}}, como vai?\n\nNotamos que o pagamento da sua mensalidade (vencida em {{dataVencimento}}) ainda não consta em nosso sistema.\n\n💰 Valor: {{valorMensalidade}}\n🔑 Chave Pix: {{chavePix}}\n\n_{{nomeEmpresa}}_',
}

/** Coluna de controle por janela.
 *  ATENÇÃO: d+3 marca `enviado_3dias_depois`, NÃO `enviado_vencimento`. O campo
 *  `flag_campo` do n8n diz 'enviado_vencimento' e é resquício — quem manda é o
 *  nó "Marcar Atraso1", que faz PATCH em enviado_3dias_depois. Marcar a coluna
 *  errada já cobrou aluno duas vezes. */
export const COLUNA_FLAG: Record<string, string> = {
  'd-3': 'enviado_3dias',
  'd0': 'enviado_no_dia',
  'd+3': 'enviado_3dias_depois',
}

export interface Alvo {
  fila_id: string
  user_id: string
  devedor_id: string | null
  mensalidade_id: string
  tipo: string
  janela: string
  tentativas: number
  instance_name: string | null
  api_key: string | null
  api_url: string | null
  template: string | null
  telefone: string | null
  nome_cliente: string | null
  nome_aluno_real: string | null
  nome_responsavel: string | null
  nome_empresa: string | null
  chave_pix: string | null
  portal_token: string | null
  metodo_pagamento: string | null
  valor: number | string | null
  valor_multa: number | string | null
  valor_juros: number | string | null
  valor_total: number | string | null
  data_vencimento: string | null
  dias_atraso: number | null
  total_envios: number | null
}

export function dinheiro(v: number | string | null): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0)
  return `R$ ${(n || 0).toFixed(2)}`
}

/** Formata direto da string YYYY-MM-DD.
 *  NÃO usar new Date('YYYY-MM-DD').toLocaleDateString: a data é lida como UTC e
 *  volta um dia em fuso negativo — o aluno receberia o vencimento errado. */
export function dataBR(iso: string | null): string {
  if (!iso) return ''
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export function primeiroNome(nome: string | null): string {
  return (nome || '').trim().split(/\s+/)[0] || ''
}

/** Mesmo mapa de chaves dos nós "Criar Msg *" do n8n. Qualquer divergência aqui
 *  muda o texto que o aluno recebe, então mudanças exigem comparar em dryRun. */
export function montarMensagem(a: Alvo): string {
  const base = (a.template && a.template.trim() !== '') ? a.template : (FALLBACK[a.janela] || '')

  const link = (a.metodo_pagamento === 'asaas_link' && a.portal_token)
    ? PORTAL_BASE + a.portal_token
    : ''

  const vars: Record<string, string> = {
    '{{nomeCliente}}': a.nome_cliente || '',
    '{{nomeAlunoReal}}': primeiroNome(a.nome_aluno_real),
    '{{nomeResponsavel}}': primeiroNome(a.nome_responsavel),
    '{{valorMensalidade}}': dinheiro(a.valor),
    '{{valorParcela}}': dinheiro(a.valor),
    '{{valorMulta}}': a.valor_multa != null ? dinheiro(a.valor_multa) : '',
    '{{valorJuros}}': a.valor_juros != null ? dinheiro(a.valor_juros) : '',
    '{{valorTotal}}': dinheiro(a.valor_total ?? a.valor),
    '{{dataVencimento}}': dataBR(a.data_vencimento),
    '{{diasRestantes}}': a.janela === 'd-3' ? '3' : '0',
    '{{diasAtraso}}': String(a.dias_atraso ?? 0),
    '{{nomeEmpresa}}': a.nome_empresa || 'Equipe',
    '{{chavePix}}': a.chave_pix || '',
    '{{linkPagamento}}': link,
    '{{portalCliente}}': link,
  }

  let msg = base
  for (const [chave, valor] of Object.entries(vars)) {
    msg = msg.split(chave).join(valor)
  }
  return msg
}

export function normalizarTelefone(tel: string | null): string {
  let t = String(tel || '').replace(/\D/g, '')
  if (t && !t.startsWith('55')) t = '55' + t
  return t
}
