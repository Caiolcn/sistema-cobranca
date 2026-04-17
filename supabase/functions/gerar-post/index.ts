// Edge Function: Gerador de Post IA
// Recebe tipo/tom/prompt e retorna título + legenda + hashtags via Gemini 2.0 Flash
// Controla limite mensal (Pro: 6, Premium: 25)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LIMITES: Record<string, number> = {
  pro: 6,
  premium: 25,
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // Autenticar usuario
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Verificar plano
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('plano, plano_pago, trial_ativo, nome_empresa')
      .eq('id', user.id)
      .single()

    if (!usuario || !['pro', 'premium'].includes(usuario.plano) || (!usuario.plano_pago && !usuario.trial_ativo)) {
      return new Response(JSON.stringify({ error: 'Disponível a partir do plano Pro' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Verificar limite mensal
    const { data: contagem } = await supabase.rpc('contar_posts_mes', { p_user_id: user.id })
    const limite = LIMITES[usuario.plano] || 6
    const usados = contagem || 0

    if (usados >= limite) {
      return new Response(JSON.stringify({
        error: `Você atingiu o limite de ${limite} posts este mês.${usuario.plano === 'pro' ? ' Faça upgrade pro Premium pra ter 25/mês.' : ''}`,
        limite,
        usados
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Parse request
    const body = await req.json()
    const { tipo, tom, prompt: userPrompt } = body

    if (!tipo || !userPrompt) {
      return new Response(JSON.stringify({ error: 'Tipo e prompt são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const nomeEmpresa = usuario.nome_empresa || 'nossa empresa'

    // Parse template pra ajustar o prompt
    const template = body.template || 'classico'

    // Chamar OpenAI GPT-4o-mini
    const systemPrompt = `Você é um social media especialista em negócios fitness e academias. Responda SEMPRE em JSON válido.`

    let jsonSchema = ''
    if (template === 'lista') {
      jsonSchema = `{
  "titulo": "Título principal (máximo 4 palavras, primeira letra maiúscula)",
  "subtitulo": "Complemento do título (máximo 6 palavras, ex: '4 motivos para investir')",
  "items": ["Item 1 curto", "Item 2 curto", "Item 3 curto", "Item 4 curto"],
  "legenda": "Legenda completa para o Instagram (máximo 300 caracteres, 2-4 emojis, CTA no final)",
  "hashtags": "10 a 15 hashtags separadas por espaço"
}`
    } else if (template === 'personal') {
      jsonSchema = `{
  "titulo": "Pergunta ou frase impactante (máximo 8 palavras)",
  "destaque": "1-2 palavras do título que devem ficar em destaque (cor diferente)",
  "cta": "Texto curto do botão de ação (ex: 'Contrate agora', 'Saiba mais', 'Agende sua aula')",
  "descricao_cta": "Frase curta de apoio ao CTA (máximo 15 palavras)",
  "legenda": "Legenda completa para o Instagram (máximo 300 caracteres, 2-4 emojis, CTA no final)",
  "hashtags": "10 a 15 hashtags separadas por espaço"
}`
    } else {
      jsonSchema = `{
  "titulo": "Texto curto e impactante para sobrepor na imagem (máximo 8 palavras, CAIXA ALTA)",
  "legenda": "Legenda completa para o Instagram (máximo 300 caracteres, 2-4 emojis, CTA no final)",
  "hashtags": "10 a 15 hashtags separadas por espaço"
}`
    }

    const userMessage = `Gere conteúdo para um post de Instagram para "${nomeEmpresa}".

Tipo do post: ${tipo}
Tom: ${tom || 'informal'}
O que o cliente quer comunicar: "${userPrompt}"

Retorne JSON:
${jsonSchema}`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.9,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      })
    })

    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text()
      console.error('Erro OpenAI:', errBody)
      if (openaiResponse.status === 429) {
        throw new Error('A IA está ocupada no momento. Aguarde alguns segundos e tente novamente.')
      }
      throw new Error(`Erro na IA (${openaiResponse.status}): ${errBody.substring(0, 200)}`)
    }

    const openaiData = await openaiResponse.json()
    const textResponse = openaiData.choices?.[0]?.message?.content || ''

    console.log('OpenAI response:', textResponse.substring(0, 500))

    let parsed
    try {
      parsed = JSON.parse(textResponse)
    } catch {
      console.error('Erro parse OpenAI response:', textResponse)
      throw new Error('Não foi possível processar a resposta da IA. Tente novamente.')
    }

    const { titulo, legenda, hashtags, subtitulo, items, cta, destaque, descricao_cta } = parsed

    if (!titulo || !legenda) {
      throw new Error('Resposta incompleta da IA')
    }

    // Salvar no histórico
    await supabase.from('posts_gerados').insert({
      user_id: user.id,
      tipo,
      tom: tom || 'informal',
      prompt: userPrompt,
      titulo,
      legenda,
      hashtags: hashtags || '',
      template
    })

    return new Response(
      JSON.stringify({
        titulo,
        subtitulo: subtitulo || '',
        destaque: destaque || '',
        items: items || [],
        cta: cta || '',
        descricao_cta: descricao_cta || '',
        legenda,
        hashtags,
        uso: { usado: usados + 1, limite }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('Erro gerar-post:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
