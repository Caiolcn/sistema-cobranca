// Edge Function: Landing Page Publica - Dados da Academia
// Retorna dados da empresa + planos + aulas + depoimentos por slug
// Acesso PUBLICO (sem autenticacao)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function mascararNome(nome: string | null): string {
  if (!nome) return 'Aluno(a)'
  const partes = String(nome).trim().split(/\s+/)
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[partes.length - 1][0]}.`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')

    if (!slug || slug.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Slug invalido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Buscar empresa pelo slug
    const { data: empresa, error: empresaError } = await supabase
      .from('usuarios')
      .select(`
        id, nome_empresa, logo_url, telefone, site,
        endereco, numero, complemento, bairro, cidade, estado, cep,
        plano, plano_pago, trial_ativo,
        landing_ativo, landing_slug, landing_descricao,
        landing_cor_primaria, landing_foto_capa_url,
        landing_hero_titulo, landing_hero_subtitulo, landing_cta_texto,
        landing_cta_final_titulo, landing_cta_final_subtitulo,
        landing_galeria, landing_faq, landing_depoimentos_manuais,
        landing_ordem_secoes,
        instagram_url, facebook_url, tiktok_url,
        landing_rodape_texto,
        landing_mostrar_depoimentos, landing_mostrar_planos, landing_mostrar_horarios,
        landing_mostrar_galeria, landing_mostrar_faq,
        landing_mostrar_cta_whatsapp, landing_mostrar_cta_agendar, landing_mostrar_cta_final,
        landing_cta_final_mostrar_botao,
        agendamento_slug, agendamento_ativo
      `)
      .eq('landing_slug', slug)
      .maybeSingle()

    if (empresaError || !empresa) {
      return new Response(
        JSON.stringify({ error: 'Pagina nao encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!empresa.landing_ativo) {
      return new Response(
        JSON.stringify({ error: 'Pagina desativada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Gate de plano: so Pro/Premium podem manter landing publica
    const planoOk = ['pro', 'premium'].includes(empresa.plano)
      && (empresa.plano_pago === true || empresa.trial_ativo === true)
    if (!planoOk) {
      return new Response(
        JSON.stringify({ error: 'Pagina indisponivel' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Planos (so se mostrar_planos)
    let planos: any[] = []
    if (empresa.landing_mostrar_planos) {
      const { data } = await supabase
        .from('planos')
        .select('nome, valor, ciclo, descricao')
        .eq('user_id', empresa.id)
        .eq('ativo', true)
        .order('valor', { ascending: true })
      planos = data || []
    }

    // 3. Aulas (so se mostrar_horarios)
    let aulas: any[] = []
    if (empresa.landing_mostrar_horarios) {
      const { data } = await supabase
        .from('aulas')
        .select('dia_semana, horario, descricao')
        .eq('user_id', empresa.id)
        .eq('ativo', true)
        .order('dia_semana', { ascending: true })
        .order('horario', { ascending: true })
      aulas = data || []
    }

    // 4. Depoimentos: mistura manuais (do dono) + NPS automaticos (>=9)
    let depoimentos: any[] = []
    if (empresa.landing_mostrar_depoimentos) {
      const manuais = Array.isArray(empresa.landing_depoimentos_manuais)
        ? empresa.landing_depoimentos_manuais
            .filter((d: any) => d && d.comentario && String(d.comentario).trim().length >= 5)
            .map((d: any) => ({
              nota: d.nota || 10,
              comentario: String(d.comentario).trim(),
              nome: String(d.nome || 'Aluno(a)').trim(),
            }))
        : []

      const { data: nps } = await supabase
        .from('nps_respostas')
        .select('nota, comentario, respondido_em, devedor_id')
        .eq('user_id', empresa.id)
        .gte('nota', 9)
        .not('comentario', 'is', null)
        .order('respondido_em', { ascending: false })
        .limit(12)

      const npsComComentario = (nps || []).filter((n: any) =>
        n.comentario && String(n.comentario).trim().length >= 10
      )

      const idsDev = [...new Set(npsComComentario.map((n: any) => n.devedor_id).filter(Boolean))]
      let nomesPorId: Record<string, string> = {}
      if (idsDev.length > 0) {
        const { data: devs } = await supabase
          .from('devedores')
          .select('id, nome')
          .in('id', idsDev)
        for (const d of devs || []) nomesPorId[d.id] = d.nome
      }

      const automaticos = npsComComentario.map((n: any) => ({
        nota: n.nota,
        comentario: n.comentario,
        nome: mascararNome(nomesPorId[n.devedor_id] || null),
      }))

      depoimentos = [...manuais, ...automaticos].slice(0, 8)
    }

    // 5. Endereco completo pra mapa
    const partes = [
      empresa.endereco,
      empresa.numero,
      empresa.bairro,
      empresa.cidade,
      empresa.estado,
    ].filter(Boolean)
    const endereco_completo = partes.join(', ')

    return new Response(
      JSON.stringify({
        empresa: {
          nome_empresa: empresa.nome_empresa,
          logo_url: empresa.logo_url,
          foto_capa_url: empresa.landing_foto_capa_url,
          descricao: empresa.landing_descricao,
          cor_primaria: empresa.landing_cor_primaria || '#344848',
          telefone: empresa.telefone,
          instagram_url: empresa.instagram_url,
          facebook_url: empresa.facebook_url,
          tiktok_url: empresa.tiktok_url,
          rodape_texto: empresa.landing_rodape_texto,
          site: empresa.site,
          endereco_completo,
          cidade: empresa.cidade,
          estado: empresa.estado,
          agendamento_slug: empresa.agendamento_slug,
          agendamento_ativo: empresa.agendamento_ativo,
          hero_titulo: empresa.landing_hero_titulo,
          hero_subtitulo: empresa.landing_hero_subtitulo,
          cta_texto: empresa.landing_cta_texto,
          cta_final_titulo: empresa.landing_cta_final_titulo,
          cta_final_subtitulo: empresa.landing_cta_final_subtitulo,
          galeria: Array.isArray(empresa.landing_galeria) ? empresa.landing_galeria : [],
          faq: Array.isArray(empresa.landing_faq) ? empresa.landing_faq : [],
          ordem_secoes: Array.isArray(empresa.landing_ordem_secoes) && empresa.landing_ordem_secoes.length > 0
            ? empresa.landing_ordem_secoes
            : ['sobre','planos','galeria','horarios','depoimentos','faq','mapa'],
          mostrar_depoimentos: empresa.landing_mostrar_depoimentos,
          mostrar_planos: empresa.landing_mostrar_planos,
          mostrar_horarios: empresa.landing_mostrar_horarios,
          mostrar_galeria: empresa.landing_mostrar_galeria !== false,
          mostrar_faq: empresa.landing_mostrar_faq !== false,
          mostrar_cta_whatsapp: empresa.landing_mostrar_cta_whatsapp !== false,
          mostrar_cta_agendar: empresa.landing_mostrar_cta_agendar !== false,
          mostrar_cta_final: empresa.landing_mostrar_cta_final !== false,
          cta_final_mostrar_botao: empresa.landing_cta_final_mostrar_botao !== false,
        },
        planos,
        aulas,
        depoimentos,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Erro landing-dados:', err)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
