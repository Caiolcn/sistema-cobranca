// Prova que o worker monta a mensagem igual aos nós "Criar Msg *" do n8n.
//
// Roda sem banco e sem rede:
//   deno test supabase/functions/mensagens-worker/render.test.ts
//
// O caso do vencimento é o que mais importa: `new Date('2026-08-20')` é lido
// como UTC e volta um dia em fuso negativo. Se isso vazar, o aluno recebe a
// cobrança com a data errada — e ninguém percebe, porque a mensagem sai.

import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { montarMensagem, normalizarTelefone, dataBR, dinheiro, type Alvo } from './render.ts'

function alvo(over: Partial<Alvo> = {}): Alvo {
  return {
    fila_id: 'f1', user_id: 'u1', devedor_id: 'd1', mensalidade_id: 'm1',
    tipo: 'due_day', janela: 'd0', tentativas: 0,
    instance_name: 'instance_x', api_key: 'k', api_url: 'http://evo',
    template: null, telefone: '(11) 98765-4321',
    nome_cliente: 'Maria Souza Lima', nome_aluno_real: 'Pedro Souza Lima',
    nome_responsavel: 'Maria Souza Lima', nome_empresa: 'Academia X',
    chave_pix: 'pix@academia.com', portal_token: null, metodo_pagamento: null,
    valor: '120.5', valor_multa: null, valor_juros: null, valor_total: null,
    data_vencimento: '2026-08-20', dias_atraso: null, total_envios: 0,
    ...over,
  }
}

Deno.test('data sai do texto YYYY-MM-DD, sem passar por new Date (não volta um dia)', () => {
  assertEquals(dataBR('2026-08-20'), '20/08/2026')
  assertEquals(dataBR('2026-01-01'), '01/01/2026')
  assertEquals(dataBR(null), '')
})

Deno.test('valor no formato do n8n: R$ com duas casas', () => {
  assertEquals(dinheiro('120.5'), 'R$ 120.50')
  assertEquals(dinheiro(99), 'R$ 99.00')
  assertEquals(dinheiro(null), 'R$ 0.00')
})

Deno.test('nomeAlunoReal e nomeResponsavel usam só o primeiro nome', () => {
  const msg = montarMensagem(alvo({
    template: '{{nomeAlunoReal}}|{{nomeResponsavel}}|{{nomeCliente}}',
  }))
  assertEquals(msg, 'Pedro|Maria|Maria Souza Lima')
})

Deno.test('linkPagamento só existe com asaas_link E portal_token', () => {
  const semMetodo = montarMensagem(alvo({ template: '[{{linkPagamento}}]', portal_token: 'abc' }))
  assertEquals(semMetodo, '[]')

  const semToken = montarMensagem(alvo({ template: '[{{linkPagamento}}]', metodo_pagamento: 'asaas_link' }))
  assertEquals(semToken, '[]')

  const completo = montarMensagem(alvo({
    template: '[{{linkPagamento}}]', metodo_pagamento: 'asaas_link', portal_token: 'abc123',
  }))
  assertEquals(completo, '[https://www.mensalli.com.br/portal/abc123]')
})

Deno.test('template vazio cai no fallback da janela, não manda mensagem em branco', () => {
  for (const janela of ['d-3', 'd0', 'd+3']) {
    const msg = montarMensagem(alvo({ janela, template: '   ' }))
    assertStringIncludes(msg, 'Maria Souza Lima')
    assertStringIncludes(msg, 'R$ 120.50')
    assertStringIncludes(msg, 'Academia X')
  }
})

Deno.test('todas as chaves são substituídas — nenhuma {{...}} sobra no texto', () => {
  const template = [
    '{{nomeCliente}} {{nomeAlunoReal}} {{nomeResponsavel}} {{valorMensalidade}}',
    '{{valorParcela}} {{valorMulta}} {{valorJuros}} {{valorTotal}} {{dataVencimento}}',
    '{{diasRestantes}} {{diasAtraso}} {{nomeEmpresa}} {{chavePix}} {{linkPagamento}} {{portalCliente}}',
  ].join('\n')
  const msg = montarMensagem(alvo({ janela: 'd+3', template, dias_atraso: 3, valor_total: '130.00' }))
  assertEquals(/\{\{[a-zA-Z]+\}\}/.test(msg), false, `sobrou variável: ${msg}`)
})

Deno.test('a mesma chave repetida é trocada em todas as ocorrências', () => {
  const msg = montarMensagem(alvo({ template: '{{nomeCliente}} ... {{nomeCliente}}' }))
  assertEquals(msg, 'Maria Souza Lima ... Maria Souza Lima')
})

Deno.test('telefone vira dígitos com 55 na frente, sem duplicar quando já tem', () => {
  assertEquals(normalizarTelefone('(11) 98765-4321'), '5511987654321')
  assertEquals(normalizarTelefone('5511987654321'), '5511987654321')
  assertEquals(normalizarTelefone(null), '')
})
