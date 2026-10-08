// Edge Function: Loja - Escolher turma (pós-pagamento de plano)
// POST { token, aula_ids: [uuid] }
// Só para pedido em `turma_pendente`. Chama loja_vincular_turmas (atômica, com
// trava de linha nas aulas) e avisa o aluno do horário escolhido.
// Acesso PÚBLICO (validação pelo token do pedido).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, erro, enviarWhatsAppConta } from '../_shared/loja.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MENSAGENS: Record<string, string> = {
  lotado: 'Essa turma acabou de lotar. Escolha outro horário.',
  turma_invalida: 'Horário inválido. Atualize a página e tente de novo.',
  quantidade_invalida: 'Escolha a quantidade certa de horários.',
  nenhuma_turma: 'Escolha pelo menos um horário.',
  pedido_sem_turma_pendente: 'Este pedido não está aguardando escolha de turma.',
  pedido_nao_encontrado: 'Pedido não encontrado.',
  sem_aluno: 'Cadastro do aluno não encontrado.',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return erro('metodo', 'Método não permitido', 405)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { token, aula_ids } = await req.json().catch(() => ({}))
    if (!token) return erro('dados', 'Pedido inválido', 400)
    const ids: string[] = Array.isArray(aula_ids) ? aula_ids.filter((x: unknown) => typeof x === 'string' && UUID.test(x)) : []
    if (!ids.length) return erro('nenhuma_turma', MENSAGENS.nenhuma_turma, 400)

    const { data: pedido } = await supabase.from('loja_pedidos').select('id, status, user_id, devedor_id, item_nome').eq('token', String(token)).maybeSingle()
    if (!pedido) return erro('nao_encontrado', 'Pedido não encontrado', 404)
    if (pedido.status !== 'turma_pendente') return erro('pedido_sem_turma_pendente', MENSAGENS.pedido_sem_turma_pendente, 409, { status: pedido.status })

    const { data: resultado, error } = await supabase.rpc('loja_vincular_turmas', { p_pedido_id: pedido.id, p_aula_ids: ids })
    if (error) {
      console.error('Erro loja_vincular_turmas:', error)
      return erro('interno', 'Não foi possível vincular a turma', 500)
    }
    if (!resultado?.ok) {
      const code = resultado?.code || 'turma_invalida'
      return erro(code, MENSAGENS[code] || 'Não foi possível escolher esse horário', code === 'lotado' ? 409 : 400, { aula_id: resultado?.aula_id || null })
    }

    // Aviso ao aluno com os horários (best-effort)
    try {
      const [{ data: aulas }, { data: devedor }, { data: empresa }] = await Promise.all([
        supabase.from('aulas').select('dia_semana, horario, descricao, modalidades(nome)').in('id', ids).order('dia_semana').order('horario'),
        supabase.from('devedores').select('id, nome, telefone, responsavel_nome, responsavel_telefone, comunicacoes_ativas, bloquear_mensagens').eq('id', pedido.devedor_id).maybeSingle(),
        supabase.from('usuarios').select('nome_empresa').eq('id', pedido.user_id).maybeSingle(),
      ])
      if (devedor && devedor.comunicacoes_ativas !== false && devedor.bloquear_mensagens !== true) {
        const linhas = (aulas || []).map((a: any) => `• ${DIAS[a.dia_semana]} às ${String(a.horario || '').slice(0, 5)}${a.modalidades?.nome ? ` — ${a.modalidades.nome}` : (a.descricao ? ` — ${a.descricao}` : '')}`)
        const primeiro = ((devedor.responsavel_nome || devedor.nome || '').trim().split(' ')[0]) || 'Cliente'
        const mensagem = `Olá, ${primeiro}! 🗓️\n\nSeu horário na *${empresa?.nome_empresa || ''}* está confirmado:\n\n${linhas.join('\n')}\n\nAté a aula! 💪`
        await enviarWhatsAppConta(supabase, {
          userId: pedido.user_id, devedorId: devedor.id, tipo: 'loja_turma',
          telefone: devedor.responsavel_telefone || devedor.telefone, mensagem,
        })
      }
    } catch (e) {
      console.error('⚠️ Aviso de turma falhou:', e)
    }

    return json({ sucesso: true, status: 'concluido', aula_ids: ids })
  } catch (err) {
    console.error('Erro loja-escolher-turma:', err)
    return erro('interno', 'Erro interno do servidor', 500)
  }
})
