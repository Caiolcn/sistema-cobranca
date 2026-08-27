import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { CICLOS_PAGANTES, diasAte } from './ciclo'

/* ============================================================
   Carga do /admin

   Uma query na `vw_admin_contas` no lugar das oito paralelas que o Admin.js
   fazia (usuarios, mensallizap, controle_planos, whatsapp_connections,
   pagamentos, assinaturas, logs_mensagens, engajamento) — e com o `ciclo` já
   calculado pelo banco, em vez de reinventado no front.

   Sobraram três queries auxiliares:
     - pagamentos e assinaturas, para a aba Financeiro (série histórica);
     - vw_mensalli_engajamento, que NÃO pode entrar na view: a função
       mensalli_engajamento() tem um guard `RAISE 'apenas admin'` e derrubaria
       a view inteira para qualquer chamador não-admin;
     - planos_sistema, para o preço sair de UM lugar (estava cravado em 4).
   ============================================================ */

// Fallback só para o caso de planos_sistema vir vazio — o preço de verdade
// mora na tabela, e é ela que o modal de edição e os lembretes leem.
const PRECOS_FALLBACK = { starter: 49.90, pro: 99.90, premium: 149.90 }
const NOMES_FALLBACK = { starter: 'Starter', pro: 'Pro', premium: 'Premium' }

export default function useAdminContas(ativo) {
  const [contas, setContas] = useState([])
  const [pagamentos, setPagamentos] = useState([])
  const [assinaturas, setAssinaturas] = useState([])
  const [planos, setPlanos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [contasRes, pagamentosRes, assinaturasRes, engajamentoRes, planosRes] = await Promise.all([
        supabase.from('vw_admin_contas').select('*').order('nome_empresa', { ascending: true, nullsFirst: false }),
        supabase
          .from('pagamentos_mercadopago')
          .select('id, user_id, valor, status, data_pagamento, data_aprovacao, payment_type_id, created_at')
          .eq('status', 'approved'),
        supabase
          .from('assinaturas_mercadopago')
          .select('id, user_id, plano, status, valor, data_inicio, proxima_cobranca, created_at'),
        supabase.from('vw_mensalli_engajamento').select('usuario_id, score, temperatura, motivos'),
        supabase.from('planos_sistema').select('id, nome, preco, limite_mensal, nivel, ativo'),
      ])

      if (contasRes.error) throw contasRes.error

      // O engajamento é enfeite (ordena a lista de disparo por chance de
      // converter). Se falhar, a tela continua de pé sem ele.
      const engMap = {}
      ;(engajamentoRes.data || []).forEach(e => { engMap[e.usuario_id] = e })

      setContas((contasRes.data || []).map(c => ({
        ...c,
        score: engMap[c.id]?.score ?? 0,
        temperatura: engMap[c.id]?.temperatura || 'frio',
        motivos: engMap[c.id]?.motivos || [],
      })))
      setPagamentos(pagamentosRes.data || [])
      setAssinaturas(assinaturasRes.data || [])
      setPlanos(planosRes.data || [])
    } catch (e) {
      console.error('Erro ao carregar o CRM:', e)
      setErro(e.message || 'Falha ao carregar os dados.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (ativo) carregar()
  }, [ativo, carregar])

  // Preço e nome do plano a partir de planos_sistema. Estavam cravados em
  // quatro lugares do Admin.js, e divergir entre eles significava cobrar um
  // valor na mensagem de lembrete e mostrar outro no painel.
  const catalogoPlanos = useMemo(() => {
    const precos = { ...PRECOS_FALLBACK }
    const nomes = { ...NOMES_FALLBACK }
    planos.forEach(p => {
      if (p.preco != null) precos[p.id] = Number(p.preco)
      if (p.nome) nomes[p.id] = p.nome
    })
    return { precos, nomes }
  }, [planos])

  const precoDoPlano = useCallback(
    (plano) => catalogoPlanos.precos[plano] ?? catalogoPlanos.precos.starter,
    [catalogoPlanos]
  )
  const nomeDoPlano = useCallback(
    (plano) => catalogoPlanos.nomes[plano] || catalogoPlanos.nomes.starter,
    [catalogoPlanos]
  )

  /* ---------- Derivações compartilhadas entre as abas ---------- */

  const porCiclo = useMemo(() => {
    const mapa = {}
    contas.forEach(c => {
      const k = c.ciclo || 'desconhecido'
      ;(mapa[k] = mapa[k] || []).push(c)
    })
    return mapa
  }, [contas])

  const contagem = useCallback((...ciclos) =>
    ciclos.reduce((soma, c) => soma + (porCiclo[c]?.length || 0), 0)
  , [porCiclo])

  const kpis = useMemo(() => {
    const total = contas.length
    const pagantes = contagem(...CICLOS_PAGANTES)
    const whatsappConectado = contas.filter(c => c.whatsapp_conectado === true).length
    const mensagensMes = contas.reduce((s, c) => s + (c.mensagens_mes || 0), 0)

    // Conversão de trial: dos trials que já TERMINARAM, quantos viraram pagante.
    // O denominador exclui quem ainda está testando — senão a taxa cai sozinha
    // toda vez que entra cadastro novo, sem nada ter piorado.
    const jaPagaramAlgumDia = contas.filter(c => !!c.virou_pagante_em).length
    const trialsTerminados = jaPagaramAlgumDia + contagem('trial_expirado')
    const taxaConversao = trialsTerminados > 0 ? (jaPagaramAlgumDia / trialsTerminados) * 100 : 0

    // Contas cuja conversão foi inferida no backfill (venda na mão, sem
    // registro no gateway): valem uma conferência humana.
    const precisamRevisao = contas.filter(c => c.origem_pagamento === 'manual').length

    // Pagante sem data de vencimento é dado quebrado — o gate trata como
    // bloqueio (fail-closed), então a conta perde acesso em silêncio.
    const pagantesSemVencimento = contas.filter(c => c.plano_pago && !c.plano_vencimento).length

    return {
      total,
      pagantes,
      trial: contagem('trial'),
      trialExpirado: contagem('trial_expirado'),
      inadimplentes: contagem('inadimplente'),
      churn: contagem('churn', 'cancelado'),
      vencendo: contagem('vencendo'),
      whatsappConectado,
      mensagensMes,
      jaPagaramAlgumDia,
      trialsTerminados,
      taxaConversao,
      precisamRevisao,
      pagantesSemVencimento,
      semAcesso: contas.filter(c => c.tem_acesso === false).length,
    }
  }, [contas, contagem])

  // Buckets de lembrete de vencimento. Todos os três saem do MESMO predicado
  // agora: antes o bucket "vencido" era o único que não exigia plano_pago, e
  // por isso pescava conta já cancelada que ninguém queria cobrar de novo.
  const bucketsVencimento = useMemo(() => {
    const noTrilhoPagante = contas.filter(c =>
      c.plano_pago && c.plano_vencimento && !c.cancelado_em
    )
    const dias = (c) => diasAte(c.plano_vencimento)
    return {
      venc_d3: noTrilhoPagante.filter(c => { const d = dias(c); return d >= 1 && d <= 3 }),
      venc_hoje: noTrilhoPagante.filter(c => dias(c) === 0),
      venc_vencido: noTrilhoPagante.filter(c => { const d = dias(c); return d <= -1 && d >= -3 }),
    }
  }, [contas])

  const listasRecuperacao = useMemo(() => ({
    // Nunca pagou e o teste acabou
    trial: porCiclo.trial_expirado || [],
    // Já pagou e hoje não paga — inclui cancelamento explícito e inadimplência,
    // que é o mesmo público de reativação
    churn: [
      ...(porCiclo.churn || []),
      ...(porCiclo.cancelado || []),
      ...(porCiclo.inadimplente || []),
    ],
  }), [porCiclo])

  return {
    contas, pagamentos, assinaturas, planos,
    carregando, erro, recarregar: carregar,
    kpis, porCiclo, contagem, bucketsVencimento, listasRecuperacao,
    precoDoPlano, nomeDoPlano,
  }
}
