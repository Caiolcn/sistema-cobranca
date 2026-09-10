// Edge Function: Prospeccao por Rota
//
// POR QUE ESTA FUNCAO EXISTE
// Mapear escolinhas, estudios de pilates e afins que ficam NO CAMINHO de casa
// para o trabalho, para visitar pessoalmente na volta. Duas razoes para ser
// servidor e nao front:
//
// 1. A chave do Google Maps Platform e faturada por chamada. No navegador ela
//    fica exposta e qualquer um poderia queimar a cota da conta. Aqui ela e um
//    secret e o navegador so pede a operacao pelo nome, igual ao evolution-proxy.
// 2. Os TERMOS do Google proibem montar base propria com dados do Places. O
//    unico campo cacheavel por tempo indeterminado e o `id` do lugar. Por isso
//    nada do que volta daqui e gravado: nome, endereco e nota vivem so na tela.
//    O que persiste (tabela prospeccao_visitados) e SO o place_id + o status
//    que o proprio usuario escreveu.
//
// RESTRITA A ADMIN. E ferramenta interna de prospeccao, nao feature de cliente.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')!

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

// Impressao digital da chave em uso: 4 primeiros e 4 ultimos caracteres. Nunca
// a chave inteira - log de edge function nao e lugar de segredo. Serve so para
// responder "a funcao esta mesmo usando a chave que eu troquei?", que foi
// exatamente a duvida que travou o diagnostico do 403.
const digital = (k: string) =>
  !k ? '(vazia)' : `${k.slice(0, 4)}...${k.slice(-4)} (${k.length} chars)`

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

type Ponto = { lat: number; lng: number }

// Decodifica a polyline codificada que a Routes API devolve (algoritmo padrao
// do Google, precisao 5). Precisamos dos pontos crus por dois motivos que a API
// nao entrega de graca: medir o quanto cada lugar desvia da rota e descobrir em
// que ORDEM eles aparecem na direcao da viagem.
function decodificarPolyline(encoded: string): Ponto[] {
  const pontos: Ponto[] = []
  let indice = 0, lat = 0, lng = 0

  while (indice < encoded.length) {
    let resultado = 0, deslocamento = 0, byte = 0
    do {
      byte = encoded.charCodeAt(indice++) - 63
      resultado |= (byte & 0x1f) << deslocamento
      deslocamento += 5
    } while (byte >= 0x20)
    lat += (resultado & 1) ? ~(resultado >> 1) : (resultado >> 1)

    resultado = 0; deslocamento = 0
    do {
      byte = encoded.charCodeAt(indice++) - 63
      resultado |= (byte & 0x1f) << deslocamento
      deslocamento += 5
    } while (byte >= 0x20)
    lng += (resultado & 1) ? ~(resultado >> 1) : (resultado >> 1)

    pontos.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return pontos
}

// Projecao equirretangular. Em distancias de dezenas de km o erro e irrelevante
// e evita trigonometria pesada num loop de milhares de segmentos.
const RAIO_TERRA = 6371000

// Folga aceita antes da origem e depois do destino, em metros. Ver o corte de
// "atras da rota" no op `buscar`.
const FOLGA_PONTA_M = 600
function paraPlano(p: Ponto, latRef: number) {
  const rad = Math.PI / 180
  return {
    x: p.lng * rad * Math.cos(latRef * rad) * RAIO_TERRA,
    y: p.lat * rad * RAIO_TERRA,
  }
}

// Distancia do lugar ate o segmento mais proximo da rota, quantos metros de rota
// ja foram percorridos ate esse ponto, e a MESMA medida sem travar nas pontas.
//
// A terceira conserta o pior defeito da primeira versao. Um lugar ATRAS do ponto
// de partida projeta na primeira vertice, recebe progresso zero e aparece como
// "parada 1" - mandando dirigir para tras antes de comecar a viagem. Travado em
// [0,1] nao ha como distinguir "fica no inicio da rota" de "fica antes dela";
// o valor bruto fica negativo no segundo caso e denuncia.
function medirContraRota(lugar: Ponto, rota: Ponto[], acumulado: number[], latRef: number) {
  const p = paraPlano(lugar, latRef)
  let melhorDist = Infinity
  let melhorProgresso = 0
  let melhorBruto = 0

  for (let i = 0; i < rota.length - 1; i++) {
    const a = paraPlano(rota[i], latRef)
    const b = paraPlano(rota[i + 1], latRef)
    const dx = b.x - a.x, dy = b.y - a.y
    const compr2 = dx * dx + dy * dy
    const compr = Math.sqrt(compr2)

    let tBruto = 0
    if (compr2 > 0) tBruto = ((p.x - a.x) * dx + (p.y - a.y) * dy) / compr2
    const t = Math.max(0, Math.min(1, tBruto))

    const projX = a.x + t * dx, projY = a.y + t * dy
    const dist = Math.hypot(p.x - projX, p.y - projY)

    if (dist < melhorDist) {
      melhorDist = dist
      melhorProgresso = acumulado[i] + t * compr
      melhorBruto = acumulado[i] + tBruto * compr
    }
  }
  return {
    desvio: Math.round(melhorDist),
    progresso: Math.round(melhorProgresso),
    bruto: Math.round(melhorBruto),
  }
}

function distanciasAcumuladas(rota: Ponto[], latRef: number): number[] {
  const acc = [0]
  for (let i = 0; i < rota.length - 1; i++) {
    const a = paraPlano(rota[i], latRef)
    const b = paraPlano(rota[i + 1], latRef)
    acc.push(acc[i] + Math.hypot(b.x - a.x, b.y - a.y))
  }
  return acc
}

// ---------------------------------------------------------------------------
// Google Maps Platform
// ---------------------------------------------------------------------------

// Alternativas de trajeto. E o que sustenta a estrategia de "um caminho
// diferente por dia": cada rota alternativa passa por corredores diferentes e
// portanto por um estoque diferente de portas.
async function calcularRotas(origem: string, destino: string) {
  const resp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': [
        'routes.duration',
        'routes.distanceMeters',
        'routes.description',
        'routes.polyline.encodedPolyline',
      ].join(','),
    },
    body: JSON.stringify({
      origin: { address: origem },
      destination: { address: destino },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: true,
      languageCode: 'pt-BR',
      regionCode: 'BR',
    }),
  })

  const dados = await resp.json()
  if (!resp.ok) {
    // O `message` do Google e curto demais para diagnosticar: "The caller does
    // not have permission" cobre faturamento nao vinculado, chave restrita e
    // projeto errado, que tem correcoes diferentes. O corpo inteiro traz
    // `status` e `details` e separa os tres casos. A digital da chave responde
    // tambem QUAL chave levou o 403, quando ha mais de uma no projeto.
    console.error('[rotas] Google recusou', resp.status, JSON.stringify(dados), 'chave', digital(GOOGLE_MAPS_API_KEY))
    return { ok: false, erro: dados?.error?.message || 'Falha ao calcular a rota' }
  }

  const rotas = (dados.routes || []).map((r: any, i: number) => ({
    indice: i,
    descricao: r.description || `Trajeto ${i + 1}`,
    distancia_km: +((r.distanceMeters || 0) / 1000).toFixed(1),
    minutos: Math.round(parseInt(String(r.duration || '0s').replace('s', ''), 10) / 60),
    polyline: r.polyline?.encodedPolyline || '',
  })).filter((r: any) => r.polyline)

  console.log('[rotas] ok', rotas.length, 'trajetos, chave', digital(GOOGLE_MAPS_API_KEY))
  return { ok: true, rotas }
}

// Busca por termo ao longo da polyline. `searchAlongRouteParameters` e nativo
// do Text Search: o proprio Google ordena por desvio da rota. Um termo por
// chamada porque a API nao aceita lista.
//
// A fieldMask define o SKU faturado. De proposito ela NAO pede telefone nem
// site: esses campos sobem a chamada para a faixa Enterprise, que custa varias
// vezes mais, e nao servem para nada quando o plano e entrar na porta.
const CAMPOS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.primaryTypeDisplayName',
].join(',')

async function buscarTermo(termo: string, polyline: string, origem: Ponto) {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': CAMPOS,
    },
    body: JSON.stringify({
      textQuery: termo,
      searchAlongRouteParameters: { polyline: { encodedPolyline: polyline } },
      // Sem a origem o Google conhece a linha mas nao o SENTIDO da viagem, e
      // mede o desvio de forma simetrica. Com ela o ranking passa a ser o desvio
      // de quem esta indo de A para B, que e a diferenca entre "perto da linha"
      // e "no caminho".
      routingParameters: { origin: { latitude: origem.lat, longitude: origem.lng } },
      languageCode: 'pt-BR',
      regionCode: 'BR',
      maxResultCount: 20,
    }),
  })

  const dados = await resp.json()
  if (!resp.ok) {
    console.error('[places]', termo, resp.status, JSON.stringify(dados))
    return { ok: false, termo, erro: dados?.error?.message || `HTTP ${resp.status}`, lugares: [] }
  }
  return { ok: true, termo, erro: null, lugares: dados.places || [] }
}

// Imagem do trajeto. Existe porque "confie, a rota esta certa" nao e resposta:
// olhando o desenho em cima do mapa da para ver num segundo se o Google escolheu
// o caminho que voce realmente faz ou inventou um contorno.
//
// A imagem e buscada AQUI e volta como data URI em vez de a pagina montar a URL
// do Static Maps: a URL carrega a chave, e chave em `src` de <img> e chave
// publicada no navegador de quem abrir o DevTools.
//
// Sem center/zoom de proposito - o Static Maps enquadra sozinho no path.
async function montarMapa(polyline: string, pinos: { lat: number; lng: number }[]) {
  const params = new URLSearchParams()
  params.set('size', '640x360')
  params.set('scale', '2')
  params.set('maptype', 'roadmap')
  params.set('language', 'pt-BR')
  params.set('key', GOOGLE_MAPS_API_KEY)

  const url = new URL('https://maps.googleapis.com/maps/api/staticmap')
  url.search = params.toString()
  // append manual: o path e os markers repetem a mesma chave, e o encode padrao
  // do URLSearchParams estraga o `|` que o Static Maps usa como separador.
  url.searchParams.append('path', `color:0x2E7D32FF|weight:5|enc:${polyline}`)
  // Labels do Static Maps aceitam um caractere so, entao numeramos ate 9 e o
  // resto vira ponto sem numero - ainda util para ver a dispersao das paradas.
  pinos.slice(0, 9).forEach((p, i) => {
    url.searchParams.append('markers', `color:0x4CAF50|label:${i + 1}|${p.lat},${p.lng}`)
  })
  pinos.slice(9, 30).forEach((p) => {
    url.searchParams.append('markers', `size:tiny|color:0x4CAF50|${p.lat},${p.lng}`)
  })

  const resp = await fetch(url.toString())
  if (!resp.ok) {
    const texto = await resp.text().catch(() => '')
    console.error('[mapa] Static Maps recusou', resp.status, texto.slice(0, 300))
    return { ok: false, erro: `Static Maps respondeu ${resp.status}. ${texto.slice(0, 160)}` }
  }

  const bytes = new Uint8Array(await resp.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return { ok: true, imagem: `data:image/png;base64,${btoa(bin)}` }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!GOOGLE_MAPS_API_KEY) {
      return json({ error: 'GOOGLE_MAPS_API_KEY nao configurada na edge function' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Sem token' }, 401)

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return json({ error: 'Token invalido' }, 401)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Papel lido do banco com service_role, nunca do corpo da requisicao.
    const { data: perfil } = await supabase
      .from('usuarios').select('role').eq('id', user.id).maybeSingle()
    if (perfil?.role !== 'admin') {
      return json({ error: 'Ferramenta restrita a administrador' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const { op } = body as { op?: string }

    // ---- op: rotas --------------------------------------------------------
    if (op === 'rotas') {
      const { origem, destino } = body as { origem?: string; destino?: string }
      if (!origem || !destino) return json({ error: 'Informe origem e destino' }, 400)

      const r = await calcularRotas(String(origem).slice(0, 200), String(destino).slice(0, 200))
      return r.ok ? json({ rotas: r.rotas }) : json({ error: r.erro }, 502)
    }

    // ---- op: buscar -------------------------------------------------------
    if (op === 'buscar') {
      const { polyline, termos, raio_m = 1000 } = body as {
        polyline?: string; termos?: string[]; raio_m?: number
      }
      if (!polyline) return json({ error: 'Rota ausente' }, 400)
      if (!Array.isArray(termos) || termos.length === 0) {
        return json({ error: 'Escolha ao menos um tipo de negocio' }, 400)
      }
      // Teto de custo: cada termo e uma chamada faturada do Places.
      if (termos.length > 15) return json({ error: 'Maximo de 15 tipos por busca' }, 400)

      // A rota e decodificada ANTES das buscas: o primeiro ponto dela e a origem
      // que vai junto no pedido ao Google, para o ranking dele saber o sentido.
      const rota = decodificarPolyline(polyline)
      if (rota.length < 2) return json({ error: 'Rota invalida' }, 400)

      const latRef = rota[Math.floor(rota.length / 2)].lat
      const acumulado = distanciasAcumuladas(rota, latRef)
      const comprimentoTotal = acumulado[acumulado.length - 1] || 0

      const resultados = await Promise.all(
        termos.map((t) => buscarTermo(String(t).slice(0, 80), polyline, rota[0])),
      )

      // Dedupe por place_id: o mesmo estudio aparece em "pilates" e em
      // "fisioterapia". Guardamos os termos que casaram para dar contexto.
      const porId = new Map<string, any>()
      for (const r of resultados) {
        for (const p of r.lugares) {
          if (!p.id || !p.location) continue
          // Muito estudio morto continua listado no Maps. Sem isso voce para o
          // carro na frente de uma porta fechada.
          if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue

          const existente = porId.get(p.id)
          if (existente) {
            if (!existente.termos.includes(r.termo)) existente.termos.push(r.termo)
            continue
          }

          const { desvio, progresso, bruto } = medirContraRota(
            { lat: p.location.latitude, lng: p.location.longitude }, rota, acumulado, latRef,
          )
          if (desvio > raio_m) continue

          // Corta o que esta ATRAS da origem ou DEPOIS do destino. Sem isso um
          // lugar no sentido oposto ao da viagem cai como primeira parada e
          // manda voce dirigir para tras antes de comecar.
          //
          // A folga existe porque bairro e cidade geocodificam no centroide:
          // "Setor Oeste" nao e a porta do seu trabalho e "Neropolis" nao e a da
          // sua casa, entao as pontas da linha sao aproximadas. Sem folga a
          // ferramenta descartaria vizinhos legitimos das duas pontas.
          if (bruto < -FOLGA_PONTA_M) continue
          if (bruto > comprimentoTotal + FOLGA_PONTA_M) continue

          porId.set(p.id, {
            place_id: p.id,
            nome: p.displayName?.text || 'Sem nome',
            endereco: p.formattedAddress || '',
            categoria: p.primaryTypeDisplayName?.text || '',
            nota: p.rating ?? null,
            avaliacoes: p.userRatingCount ?? 0,
            lat: p.location.latitude,
            lng: p.location.longitude,
            desvio_m: desvio,
            progresso_m: progresso,
            maps_url: p.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${p.id}`,
            termos: [r.termo],
          })
        }
      }

      // Ordem de passagem, nao relevancia. A lista tem que ler como roteiro.
      const lugares = [...porId.values()].sort((a, b) => a.progresso_m - b.progresso_m)

      // Place_id e o unico campo que os termos do Google deixam persistir, e e
      // exatamente o que precisamos para nao bater duas vezes na mesma porta.
      const { data: jaVistos } = await supabase
        .from('prospeccao_visitados')
        .select('place_id, status')
        .eq('user_id', user.id)

      const mapaVistos = new Map((jaVistos || []).map((v: any) => [v.place_id, v.status]))
      for (const l of lugares) l.status = mapaVistos.get(l.place_id) || null

      const falhas = resultados.filter((r) => !r.ok).map((r) => ({ termo: r.termo, erro: r.erro }))
      return json({ lugares, falhas })
    }

    // ---- op: mapa ---------------------------------------------------------
    if (op === 'mapa') {
      const { polyline, pinos = [] } = body as {
        polyline?: string; pinos?: { lat: number; lng: number }[]
      }
      if (!polyline) return json({ error: 'Rota ausente' }, 400)

      const r = await montarMapa(polyline, Array.isArray(pinos) ? pinos.slice(0, 30) : [])
      return r.ok ? json({ imagem: r.imagem }) : json({ error: r.erro }, 502)
    }

    return json({ error: `Operacao nao permitida: ${op ?? '(vazio)'}` }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
