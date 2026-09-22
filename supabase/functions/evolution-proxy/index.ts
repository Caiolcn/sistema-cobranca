// Edge Function: Evolution Proxy
//
// POR QUE ESTA FUNCAO EXISTE
// A chave da Evolution e GLOBAL (uma so para o servidor inteiro, nao uma por
// conta). Ate 08/09/2026 o frontend lia essa chave direto da tabela `config` e
// falava com a Evolution do navegador, o que entregava a chave mestra para todo
// cliente logado - com ela da para ler conversas, enviar mensagens e derrubar a
// sessao de QUALQUER outra escola. Esta funcao passa a ser o unico ponto que
// conhece a chave; o navegador so pede operacoes por nome.
//
// REGRAS DE SEGURANCA
// 1. Exige JWT valido.
// 2. A instancia NAO vem do cliente: e resolvida no servidor a partir do
//    user_id (tabela mensallizap). Aceitar `instance` do corpo transformaria
//    este proxy num IDOR - qualquer um operaria a instancia alheia.
// 3. Passar `instance` explicitamente so e permitido para admin (painel
//    /admin precisa operar a master e inspecionar outras contas).
// 4. So passam as operacoes da allowlist. Nao existe repasse de URL crua.
// 5. A chave e lida com service_role, entao continua funcionando depois de a
//    policy de leitura da tabela `config` ser restringida.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ---------------------------------------------------------------------------
// Allowlist. `instancia: true` = o nome da instancia entra no path.
// `admin: true` = so admin pode chamar, mesmo na propria instancia.
// Verbos conferidos contra a Evolution 2.3.7 em uso (restart e POST; PUT da 404).
// ---------------------------------------------------------------------------
// `instanciaNaQuery` = a instancia nao entra no path, e sim como ?instanceName=.
// Usado pelo fetchInstances: filtrado na propria instancia ele e a checagem de
// estado que o fluxo de conexao faz o tempo todo (whatsappConexao.js:299,583);
// SEM filtro ele lista o servidor inteiro, e ai vira operacao de admin.
type Op = {
  metodo: 'GET' | 'POST' | 'DELETE'
  caminho: string
  instancia: boolean
  admin?: boolean
  instanciaNaQuery?: boolean
  // `instanciaNoCorpo` = a instancia nao vai no path, vai no campo instanceName
  // do corpo, SOBRESCREVENDO o que o cliente mandou. Sem isso o create aceitaria
  // um nome arbitrario e daria para poluir o servidor com instancias alheias.
  instanciaNoCorpo?: boolean
}

const OPS: Record<string, Op> = {
  // Estado e ciclo de vida da conexao
  connectionState: { metodo: 'GET', caminho: '/instance/connectionState', instancia: true },
  connect: { metodo: 'GET', caminho: '/instance/connect', instancia: true },
  restart: { metodo: 'POST', caminho: '/instance/restart', instancia: true },
  logout: { metodo: 'DELETE', caminho: '/instance/logout', instancia: true },
  create: { metodo: 'POST', caminho: '/instance/create', instancia: true, instanciaNoCorpo: true },
  fetchProfile: { metodo: 'POST', caminho: '/instance/fetchProfile', instancia: true },
  webhookSet: { metodo: 'POST', caminho: '/webhook/set', instancia: true },

  // Envio
  sendText: { metodo: 'POST', caminho: '/message/sendText', instancia: true },
  sendMedia: { metodo: 'POST', caminho: '/message/sendMedia', instancia: true },

  // Consulta de contato
  whatsappNumbers: { metodo: 'POST', caminho: '/chat/whatsappNumbers', instancia: true },
  fetchProfilePictureUrl: { metodo: 'POST', caminho: '/chat/fetchProfilePictureUrl', instancia: true },

  // Listagem: sempre restrita a propria instancia via ?instanceName=, exceto
  // para admin, que pode listar o servidor inteiro (painel de saude).
  fetchInstances: { metodo: 'GET', caminho: '/instance/fetchInstances', instancia: true, instanciaNaQuery: true },

  // Destrutiva: so admin.
  delete: { metodo: 'DELETE', caminho: '/instance/delete', instancia: true, admin: true },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Nao autenticado' }, 401)

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return json({ error: 'Token invalido' }, 401)

    const body = await req.json().catch(() => ({}))
    const { op, params = {}, instance: instanceSolicitada } = body as {
      op?: string; params?: Record<string, unknown>; instance?: string
    }

    const definicao = op ? OPS[op] : undefined
    if (!definicao) return json({ error: `Operacao nao permitida: ${op ?? '(vazio)'}` }, 400)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Papel do chamador. Lido do banco com service_role - nunca do corpo.
    const { data: perfil } = await supabase
      .from('usuarios').select('role').eq('id', user.id).maybeSingle()
    const ehAdmin = perfil?.role === 'admin'

    if (definicao.admin && !ehAdmin) {
      return json({ error: 'Operacao restrita a administrador' }, 403)
    }

    // ---- Resolucao da instancia -------------------------------------------
    // Regra central: cliente comum opera SO a propria instancia, e o nome dela
    // vem do banco. Se o corpo trouxer `instance`, e ignorado - a menos que
    // quem chama seja admin, caso em que o valor pedido e respeitado.
    let instancia: string | null = null
    if (definicao.instancia) {
      if (ehAdmin && definicao.instanciaNaQuery && !instanceSolicitada) {
        // Admin sem filtro: lista o servidor inteiro (painel de saude).
        instancia = null
      } else if (instanceSolicitada && ehAdmin) {
        instancia = instanceSolicitada
      } else {
        const { data: mz } = await supabase
          .from('mensallizap').select('instance_name').eq('user_id', user.id).maybeSingle()
        instancia = mz?.instance_name || `instance_${user.id.substring(0, 8)}`

        if (instanceSolicitada && instanceSolicitada !== instancia) {
          return json({
            error: 'Voce so pode operar a propria instancia',
            instancia_usada: instancia,
          }, 403)
        }
      }
    }

    // ---- Credenciais (service_role: imune a policy de config) --------------
    const { data: cfg } = await supabase
      .from('config').select('chave, valor').in('chave', ['evolution_api_key', 'evolution_api_url'])
    const mapa = Object.fromEntries((cfg || []).map((c) => [c.chave, c.valor]))
    const apiKey = mapa.evolution_api_key
    const apiUrl = (mapa.evolution_api_url || '').replace(/\/+$/, '')
    if (!apiKey || !apiUrl) return json({ error: 'Evolution nao configurada' }, 500)

    // ---- Repasse -----------------------------------------------------------
    let url = `${apiUrl}${definicao.caminho}`
    if (instancia && !definicao.instanciaNoCorpo) {
      url += definicao.instanciaNaQuery
        ? `?instanceName=${encodeURIComponent(instancia)}`
        : `/${encodeURIComponent(instancia)}`
    }

    // O nome da instancia sempre vence o que veio do cliente.
    const corpo = definicao.instanciaNoCorpo && instancia
      ? { ...params, instanceName: instancia }
      : params

    const temCorpo = definicao.metodo === 'POST'

    const resposta = await fetch(url, {
      method: definicao.metodo,
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      ...(temCorpo ? { body: JSON.stringify(corpo) } : {}),
    })

    const texto = await resposta.text()
    let dados: unknown
    try { dados = JSON.parse(texto) } catch { dados = { raw: texto } }

    // O status da Evolution e devolvido como campo, nao como status HTTP: o
    // front distingue "instancia caiu" (500 da Evolution) de "sua chamada esta
    // errada" (4xx do proxy) sem confundir os dois.
    return json({ ok: resposta.ok, status: resposta.status, data: dados, instancia })
  } catch (erro) {
    console.error('evolution-proxy:', erro)
    return json({ error: String((erro as Error)?.message ?? erro) }, 500)
  }
})
