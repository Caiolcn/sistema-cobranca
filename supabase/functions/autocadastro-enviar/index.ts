// Edge Function: Autocadastro - Enviar ficha
// O aluno preenche a ficha pelo link /cadastro/:slug e entra como devedor
// PENDENTE (experimental = true, origem = 'autocadastro', sem plano e sem
// mensalidade). O professor aprova na tela de Alunos, escolhendo plano e
// vencimento. Ate la nenhuma automacao de cobranca alcanca esse registro.
// Acesso PUBLICO (sem autenticacao).
//
// Anti-spam: campo isca "website" (so robo preenche) + teto de cadastros
// por escola por hora.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const LIMITE_POR_HORA = 30

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

// Texto opcional: corta espaco e tamanho; vazio vira null
const texto = (v: unknown, max = 200) => {
  const s = String(v ?? '').trim().slice(0, max)
  return s || null
}

function dataNascimentoValida(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(v + 'T12:00:00Z')
  // "2010-02-31" vira 03/03 sem erro no JS; a volta pro texto denuncia
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false
  return d.getFullYear() >= 1900 && d <= new Date()
}

// Idade completa em anos hoje (data ja validada, AAAA-MM-DD)
function idadeEmAnos(v: string): number {
  const [a, m, d] = v.split('-').map(Number)
  const hoje = new Date()
  let anos = hoje.getFullYear() - a
  const mes = hoje.getMonth() + 1
  if (mes < m || (mes === m && hoje.getDate() < d)) anos--
  return anos
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const body = await req.json()
    const { slug, website } = body

    // Isca preenchida: finge sucesso e nao grava nada
    if (website) return json({ sucesso: true }, 201)

    const nome = texto(body.nome, 120)
    const dataNascimento = String(body.data_nascimento || '')
    const cpf = soDigitos(body.cpf)

    if (!slug) return json({ error: 'Link invalido' }, 400)
    if (!nome || nome.length < 2) return json({ error: 'Digite o nome completo' }, 400)
    if (!dataNascimentoValida(dataNascimento)) return json({ error: 'Data de nascimento invalida' }, 400)

    // Menor de idade sai da data, nao de um campo que a pagina manda:
    // assim ninguem cadastra menor sem responsavel
    const menor = idadeEmAnos(dataNascimento) < 18
    const telefone = soDigitos(body.telefone)
    const responsavelNome = menor ? texto(body.responsavel_nome, 120) : null
    const responsavelTelefone = menor ? soDigitos(body.responsavel_telefone) : ''

    if (menor) {
      if (!responsavelNome) return json({ error: 'Digite o nome do responsavel' }, 400)
      if (responsavelTelefone.length < 10) return json({ error: 'Telefone do responsavel invalido' }, 400)
    } else if (telefone.length < 10) {
      return json({ error: 'Telefone invalido' }, 400)
    }
    if (cpf && cpf.length !== 11) return json({ error: 'CPF invalido' }, 400)

    // 1. Escola pelo slug
    const { data: empresa } = await supabase
      .from('usuarios')
      .select('id, nome_empresa, telefone, autocadastro_ativo')
      .eq('agendamento_slug', slug)
      .maybeSingle()

    if (!empresa || !empresa.autocadastro_ativo) {
      return json({ error: 'Link de cadastro desativado' }, 404)
    }

    // 2. Teto por hora (protege a fila do professor contra enxurrada)
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('devedores')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', empresa.id)
      .eq('origem', 'autocadastro')
      .gte('created_at', umaHoraAtras)

    if ((count || 0) >= LIMITE_POR_HORA) {
      return json({ error: 'Muitos cadastros agora. Tente de novo em alguns minutos.' }, 429)
    }

    // 3. Telefone principal: o do responsavel quando o aluno e menor
    //    (mesma regra do cadastro manual na tela de Alunos)
    const telefonePrincipal = menor ? responsavelTelefone : telefone

    const { data: existentes } = await supabase
      .from('devedores')
      .select('id, nome, telefone, experimental')
      .eq('user_id', empresa.id)
      .or('lixo.is.null,lixo.eq.false')

    const mesmoTelefone = (existentes || []).filter(d => soDigitos(d.telefone) === telefonePrincipal)
    const nomeNorm = nome.toLowerCase()

    // Mesmo aluno enviando de novo (duplo clique, reenvio): responde ok sem duplicar
    if (mesmoTelefone.some(d => d.nome?.trim().toLowerCase() === nomeNorm)) {
      return json({ sucesso: true, ja_cadastrado: true }, 200)
    }

    // Telefone proprio ja em uso por outro aluno. Com responsavel pode repetir
    // (irmaos com o mesmo pai/mae), igual ao cadastro manual.
    if (!menor && mesmoTelefone.length > 0) {
      return json({ error: 'Ja existe um cadastro com esse telefone. Fale com a escola.' }, 409)
    }

    // 4. Cria o aluno pendente
    const { data: novoAluno, error: insertError } = await supabase
      .from('devedores')
      .insert({
        user_id: empresa.id,
        nome,
        telefone: telefonePrincipal,
        data_nascimento: dataNascimento,
        email: texto(body.email, 120),
        cpf: cpf || null,
        responsavel_nome: responsavelNome,
        responsavel_telefone: menor ? responsavelTelefone : null,
        cep: texto(soDigitos(body.cep), 8),
        endereco: texto(body.endereco),
        numero: texto(body.numero, 20),
        complemento: texto(body.complemento, 100),
        bairro: texto(body.bairro, 100),
        cidade: texto(body.cidade, 100),
        estado: texto(body.estado, 2),
        valor_devido: 0,
        data_vencimento: new Date().toISOString().split('T')[0],
        status: 'pendente',
        assinatura_ativa: false,
        origem: 'autocadastro',
        experimental: true,
        portal_token: crypto.randomUUID().replace(/-/g, ''),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Erro ao criar cadastro:', insertError)
      return json({ error: 'Erro ao enviar cadastro' }, 500)
    }

    // 5. Avisa o professor no WhatsApp (falha aqui nao desfaz o cadastro)
    try {
      const { data: conexao } = await supabase
        .from('mensallizap')
        .select('instance_name')
        .eq('user_id', empresa.id)
        .eq('conectado', true)
        .maybeSingle()

      const telAdmin = soDigitos(empresa.telefone)
      if (conexao && telAdmin) {
        const { data: configs } = await supabase
          .from('config')
          .select('chave, valor')
          .in('chave', ['evolution_api_key', 'evolution_api_url'])

        const configMap: Record<string, string> = {}
        configs?.forEach((c: { chave: string; valor: string }) => { configMap[c.chave] = c.valor })

        const apiUrl = configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'
        const apiKey = configMap.evolution_api_key

        if (apiKey) {
          const contato = menor
            ? `Responsavel: ${responsavelNome} (${responsavelTelefone})`
            : `Telefone: ${telefone}`
          const msg = `📝 *Novo cadastro pelo link*\n\n` +
            `Aluno: ${nome}\n` +
            `${contato}\n\n` +
            `Abra a tela de Alunos para aprovar e escolher o plano.`

          await fetch(`${apiUrl}/message/sendText/${conexao.instance_name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ number: `55${telAdmin}`, text: msg }),
          })
        }
      }
    } catch (notifErr) {
      console.error('Erro ao notificar professor:', notifErr)
    }

    return json({ sucesso: true, aluno_id: novoAluno.id }, 201)
  } catch (err) {
    console.error('Erro autocadastro-enviar:', err)
    return json({ error: 'Erro interno do servidor' }, 500)
  }
})
