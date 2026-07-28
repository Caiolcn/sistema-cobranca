import { createClient } from '@supabase/supabase-js'
import { modoEspelhoAtivo, ERRO_ESPELHO } from './utils/modoEspelho'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://zvlnkkmcytjtridiojxx.supabase.co'
// Publishable key (sistema novo de API keys do Supabase) — segura no browser, protegida por RLS.
// Substitui a antiga anon key (JWT legado), que será desabilitada no painel.
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sb_publishable_TJup2m7KppLdq_9gSU6cnA_abutiGBE'

const client = createClient(supabaseUrl, supabaseAnonKey)

/* ------------------------------------------------------------------
   Trava do modo espelho

   Quando o admin abre a conta de um cliente pelo link "ver como", a sessão
   é a do cliente de verdade — qualquer escrita cairia na conta dele. Em vez
   de desabilitar botão por botão em 30 telas (e esquecer um), a trava fica
   aqui: no único caminho por onde toda escrita passa.

   Leitura segue liberada — é justamente o que a gente quer enxergar.
------------------------------------------------------------------ */

const METODOS_ESCRITA = ['insert', 'update', 'upsert', 'delete']

/**
 * Stub que imita um PostgrestFilterBuilder: aceita qualquer encadeamento
 * (.eq().select().single()...) e resolve com { data: null, error }, que é o
 * formato que as telas já sabem tratar.
 */
function builderBloqueado() {
  const resultado = { data: null, error: ERRO_ESPELHO, count: null, status: 403, statusText: 'Forbidden' }

  const stub = new Proxy({}, {
    get(_alvo, prop) {
      if (prop === 'then') {
        return (aoResolver, aoRejeitar) => Promise.resolve(resultado).then(aoResolver, aoRejeitar)
      }
      if (prop === 'catch') return () => stub
      if (prop === 'finally') return (fn) => { fn?.(); return stub }
      // Qualquer outro método do builder devolve o próprio stub (encadeável).
      return () => stub
    },
  })

  return stub
}

const fromOriginal = client.from.bind(client)
client.from = (tabela) => {
  const builder = fromOriginal(tabela)
  if (!modoEspelhoAtivo()) return builder

  return new Proxy(builder, {
    get(alvo, prop) {
      if (METODOS_ESCRITA.includes(prop)) return () => builderBloqueado()
      const valor = alvo[prop]
      return typeof valor === 'function' ? valor.bind(alvo) : valor
    },
  })
}

// RPC e edge functions podem escrever sem passar por .from() — barradas inteiras.
// A única exceção é o próprio resgate do link, que roda antes do espelho existir.
const rpcOriginal = client.rpc.bind(client)
client.rpc = (...args) => (modoEspelhoAtivo() ? builderBloqueado() : rpcOriginal(...args))

const invokeOriginal = client.functions.invoke.bind(client.functions)
client.functions.invoke = (nome, opcoes) => {
  if (modoEspelhoAtivo()) return Promise.resolve({ data: null, error: ERRO_ESPELHO })
  return invokeOriginal(nome, opcoes)
}

// Storage: upload/remove/update mexem no bucket do cliente.
const storageFromOriginal = client.storage.from.bind(client.storage)
client.storage.from = (bucket) => {
  const api = storageFromOriginal(bucket)
  if (!modoEspelhoAtivo()) return api

  return new Proxy(api, {
    get(alvo, prop) {
      if (['upload', 'update', 'remove', 'move', 'copy', 'createSignedUploadUrl'].includes(prop)) {
        return () => Promise.resolve({ data: null, error: ERRO_ESPELHO })
      }
      const valor = alvo[prop]
      return typeof valor === 'function' ? valor.bind(alvo) : valor
    },
  })
}

export const supabase = client
export const SUPABASE_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey
export const FUNCTIONS_URL = `${supabaseUrl}/functions/v1`
