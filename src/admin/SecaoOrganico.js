import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import { useUser } from '../contexts/UserContext'
import useWindowSize from '../hooks/useWindowSize'

/* ============================================================
   Orgânico — /admin/organico

   Calendário da semana do Instagram (feed + stories), com o criativo, a
   legenda e as dicas para copiar, status postado, aprovação para publicação
   automática do feed e as métricas que vêm da Meta.

   Dados: organico_* (RLS: só admin). Criativos no bucket privado "organico"
   (link assinado de 1h). O conteúdo chega pelo script
   ferramentas/organico/enviar-semana.js -> edge function organico-importar.
   Métricas: edge function organico-coletar (cron de hora em hora + diário).
   Publicação: edge function organico-publicar (cron a cada 5 min), só com o
   interruptor da marca ligado e o post aprovado.
   Referências: perfis de outros (organico_ref_*), lidos pela edge function
   organico-referencias (business_discovery) — imagens em referencias/ no bucket.
   ============================================================ */

const VERDE = '#4CAF50'
const BUCKET = 'organico'
const DIAS_CURTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const TIPO_ROTULO = { reel: 'Reel', carrossel: 'Carrossel', foto: 'Foto', story: 'Story' }
const TIPO_ICONE = { reel: 'mdi:movie-open-outline', carrossel: 'mdi:view-carousel-outline', foto: 'mdi:image-outline', story: 'mdi:cellphone' }

// ---------- datas (sempre em BRT, UTC-3 fixo) ----------
const hojeBRT = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
const somarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const segundaDe = (iso) => {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay()
  return somarDias(iso, -((dow + 6) % 7))
}
const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const horaCurta = (h) => (h ? String(h).slice(0, 5) : '')
const dataHora = (ts) => {
  if (!ts) return ''
  const d = new Date(new Date(ts).getTime() - 3 * 3600 * 1000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}
const num = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR'))

const legendaCompleta = (p) => [p.legenda, p.hashtags].filter((x) => x && String(x).trim()).join('\n\n').trim()

// Mesmas regras da edge function organico-publicar.
function problemasPublicacao(p, arquivos) {
  const out = []
  const legenda = legendaCompleta(p)
  const midia = (arquivos || []).filter((a) => a.tipo !== 'capa')
  if (!p.planejado_para) out.push('Sem horário planejado.')
  if (!legenda) out.push('Sem legenda.')
  if (legenda.length > 2200) out.push('Legenda acima de 2.200 caracteres.')
  if ((legenda.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) out.push('Mais de 30 hashtags.')
  if (/SE FOR O /i.test(legenda)) out.push('A legenda tem duas versões ("SE FOR O ..."). Deixe só a que vai sair.')
  if (p.tipo === 'reel' && !(midia.length === 1 && midia[0].tipo === 'video')) out.push('Reel precisa de exatamente 1 vídeo.')
  if (p.tipo === 'foto' && !(midia.length === 1 && midia[0].tipo === 'imagem')) out.push('Foto precisa de exatamente 1 imagem.')
  if (p.tipo === 'carrossel' && (midia.length < 2 || midia.length > 10)) out.push('Carrossel precisa de 2 a 10 mídias.')
  if (p.tipo !== 'reel' && midia.some((a) => a.tipo === 'imagem' && !/\.jpe?g$/i.test(a.caminho))) {
    out.push('Imagem do feed precisa ser JPEG (reenvie a semana pelo script, ele converte).')
  }
  return out
}

function statusDo(p, publicacaoAtiva) {
  if (p.publicado_em || p.postado_em) return { rotulo: 'Postado', cor: '#15803d', fundo: '#dcfce7', icone: 'mdi:check-circle' }
  if (p.publicacao_erro) return { rotulo: 'Erro', cor: '#b91c1c', fundo: '#fee2e2', icone: 'mdi:alert-circle' }
  if (p.publicando_em) return { rotulo: 'Publicando', cor: '#1d4ed8', fundo: '#dbeafe', icone: 'mdi:progress-upload' }
  if (p.aprovado_em) {
    return publicacaoAtiva
      ? { rotulo: 'Aprovado · sai sozinho', cor: '#166534', fundo: '#ecfdf5', icone: 'mdi:clock-check-outline' }
      : { rotulo: 'Aprovado', cor: '#166534', fundo: '#ecfdf5', icone: 'mdi:thumb-up-outline' }
  }
  return { rotulo: 'Pendente', cor: '#6b7280', fundo: '#f3f4f6', icone: 'mdi:circle-outline' }
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = texto
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

// ---------- peças de tela ----------
const cartao = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }

function Botao({ children, onClick, icone, tipo = 'neutro', disabled, title, pequeno }) {
  const cores = {
    primario: { background: VERDE, color: 'white', border: `1px solid ${VERDE}` },
    neutro: { background: 'white', color: '#374151', border: '1px solid #d1d5db' },
    perigo: { background: 'white', color: '#b91c1c', border: '1px solid #fca5a5' },
  }[tipo]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...cores,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: pequeno ? '4px 10px' : '8px 14px',
        borderRadius: 8, fontSize: pequeno ? 12 : 13, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      {icone && <Icon icon={icone} width={pequeno ? 14 : 16} />}
      {children}
    </button>
  )
}

function BlocoCopiar({ rotulo, texto, destaque }) {
  const [ok, setOk] = useState(false)
  if (!texto) return null
  return (
    <div style={{ border: `1px solid ${destaque ? VERDE : '#e5e7eb'}`, borderRadius: 10, padding: 12, marginBottom: 10, background: destaque ? '#f0fdf4' : 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 }}>{rotulo}</span>
        <Botao pequeno icone={ok ? 'mdi:check' : 'mdi:content-copy'} tipo={ok ? 'primario' : 'neutro'}
          onClick={async () => { if (await copiar(texto)) { setOk(true); setTimeout(() => setOk(false), 1500) } }}>
          {ok ? 'Copiado' : 'Copiar'}
        </Botao>
      </div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: '#1f2937', lineHeight: 1.45, wordBreak: 'break-word' }}>{texto}</div>
    </div>
  )
}

function Chip({ status }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: status.cor, background: status.fundo, padding: '2px 8px', borderRadius: 999 }}>
      <Icon icon={status.icone} width={12} /> {status.rotulo}
    </span>
  )
}

function Miniatura({ arquivo, url, altura = 120 }) {
  if (!arquivo) {
    return <div style={{ height: altura, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>sem arquivo</div>
  }
  if (arquivo.tipo === 'video') {
    return (
      <div style={{ position: 'relative', height: altura, borderRadius: 8, overflow: 'hidden', background: '#111827' }}>
        {url && <video src={`${url}#t=0.5`} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        <Icon icon="mdi:play-circle" width={34} color="white" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', opacity: 0.9 }} />
      </div>
    )
  }
  return <div style={{ height: altura, borderRadius: 8, background: `#f3f4f6 center/cover no-repeat url("${url || ''}")` }} />
}

function Visualizador({ arquivos, urls }) {
  const midia = arquivos.filter((a) => a.tipo !== 'capa')
  const [i, setI] = useState(0)
  useEffect(() => { setI(0) }, [arquivos])
  if (!midia.length) return <Miniatura arquivo={null} altura={260} />
  const a = midia[Math.min(i, midia.length - 1)]
  const url = urls[a.caminho]
  return (
    <div>
      <div style={{ background: '#111827', borderRadius: 10, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 260, maxHeight: 520 }}>
        {a.tipo === 'video'
          ? <video key={a.caminho} src={url} controls playsInline style={{ maxWidth: '100%', maxHeight: 520 }} />
          : <img src={url} alt={a.nome_original || ''} style={{ maxWidth: '100%', maxHeight: 520, objectFit: 'contain' }} />}
      </div>
      {midia.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8 }}>
          <Botao pequeno icone="mdi:chevron-left" disabled={i === 0} onClick={() => setI(i - 1)} />
          <span style={{ fontSize: 13, color: '#6b7280' }}>{i + 1} de {midia.length}</span>
          <Botao pequeno icone="mdi:chevron-right" disabled={i >= midia.length - 1} onClick={() => setI(i + 1)} />
        </div>
      )}
    </div>
  )
}

// ---------- detalhe de um post ----------
function Detalhe({ post, arquivos, urls, midia, temFase3, publicacaoAtiva, onFechar, onMudou, isMobile }) {
  const { user } = useUser()
  const [edicao, setEdicao] = useState(null)
  const [link, setLink] = useState(post.permalink || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const feed = post.tipo !== 'story'
  const problemas = feed ? problemasPublicacao(post, arquivos) : []
  const status = statusDo(post, publicacaoAtiva)
  const travado = !!(post.publicando_em || post.publicado_em)

  useEffect(() => { setLink(post.permalink || ''); setEdicao(null); setErro('') }, [post.id, post.permalink])

  const atualizar = async (campos) => {
    setSalvando(true)
    setErro('')
    const { error } = await supabase.from('organico_posts').update(campos).eq('id', post.id)
    setSalvando(false)
    if (error) { setErro(error.message); return false }
    onMudou()
    return true
  }

  const baixar = async (a) => {
    const nome = (a.nome_original || a.caminho).split('/').pop()
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.caminho, 600, { download: nome })
    if (error || !data?.signedUrl) { setErro(error?.message || 'Não gerou o link de download.'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const salvarEdicao = async () => {
    const hora = edicao.hora ? edicao.hora.slice(0, 5) : null
    const campos = {
      data_planejada: edicao.data,
      hora_planejada: hora,
      planejado_para: hora ? new Date(`${edicao.data}T${hora}:00-03:00`).toISOString() : null,
    }
    if (feed) { campos.legenda = edicao.legenda || null; campos.hashtags = edicao.hashtags || null }
    // Mudou conteúdo de post aprovado: a aprovação cai (igual ao importador).
    if (temFase3 && post.aprovado_em) { campos.aprovado_em = null; campos.aprovado_por = null }
    if (await atualizar(campos)) setEdicao(null)
  }

  const tentarDeNovo = async () => {
    if (post.publicar_chamado_em && !window.confirm('O pedido de publicação chegou a ser feito. Confira no Instagram se o post NÃO saiu antes de tentar de novo, senão ele sai duas vezes. Tentar de novo?')) return
    await atualizar({
      publicando_em: null, publicar_chamado_em: null, ig_container_id: null, ig_filhos: null,
      publicacao_erro: null, publicacao_erro_em: null,
    })
  }

  const s = post.story || {}
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.55)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: isMobile ? 'stretch' : 'flex-start', padding: isMobile ? 0 : '32px 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...cartao, width: '100%', maxWidth: 980, padding: isMobile ? 16 : 24, borderRadius: isMobile ? 0 : 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: VERDE }}>
                <Icon icon={TIPO_ICONE[post.tipo]} width={16} /> {TIPO_ROTULO[post.tipo]}
              </span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                {DIAS_CURTO[(new Date(`${post.data_planejada}T12:00:00Z`).getUTCDay() + 6) % 7]} {dataCurta(post.data_planejada)}{post.hora_planejada ? ` · ${horaCurta(post.hora_planejada)}` : ' · sem horário'}
              </span>
              <Chip status={status} />
            </div>
            <h2 style={{ margin: 0, fontSize: 18, color: '#111827' }}>{post.titulo || TIPO_ROTULO[post.tipo]}</h2>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}>
            <Icon icon="mdi:close" width={24} color="#6b7280" />
          </button>
        </div>

        {erro && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{erro}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 360px) minmax(0, 1fr)', gap: 20 }}>
          {/* Coluna do criativo */}
          <div>
            <Visualizador arquivos={arquivos} urls={urls} />
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {arquivos.map((a) => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, color: '#4b5563' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.tipo === 'capa' ? 'Capa · ' : ''}{(a.nome_original || a.caminho).split('/').pop()}
                  </span>
                  <Botao pequeno icone="mdi:download" onClick={() => baixar(a)}>Baixar</Botao>
                </div>
              ))}
            </div>

            {midia && (
              <div style={{ ...cartao, padding: 12, marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Números no Instagram</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12 }}>
                  {[['Views', midia.views], ['Alcance', midia.alcance], ['Curtidas', midia.curtidas], ['Coment.', midia.comentarios], ['Salvos', midia.salvamentos], ['Compart.', midia.compartilhamentos]].map(([r, v]) => (
                    <div key={r}><div style={{ color: '#6b7280' }}>{r}</div><div style={{ fontWeight: 700, fontSize: 16 }}>{num(v)}</div></div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                  Atualizado {dataHora(midia.metricas_em)}{midia.permalink && <> · <a href={midia.permalink} target="_blank" rel="noreferrer">abrir no Instagram</a></>}
                </div>
              </div>
            )}
          </div>

          {/* Coluna do texto */}
          <div>
            {feed && temFase3 && (
              <div style={{ ...cartao, padding: 12, marginBottom: 12, borderColor: post.publicacao_erro ? '#fca5a5' : '#e5e7eb' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Publicação automática</div>
                {post.publicacao_erro && (
                  <div style={{ background: '#fee2e2', color: '#991b1b', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 8 }}>
                    {post.publicacao_erro}
                    <div style={{ fontSize: 11, marginTop: 4 }}>{dataHora(post.publicacao_erro_em)}</div>
                  </div>
                )}
                {!post.publicacao_erro && problemas.length > 0 && !post.postado_em && (
                  <ul style={{ margin: '0 0 8px 18px', padding: 0, fontSize: 13, color: '#92400e' }}>
                    {problemas.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                )}
                {post.publicado_em && <div style={{ fontSize: 13, color: '#166534', marginBottom: 6 }}>Publicado sozinho em {dataHora(post.publicado_em)}.</div>}
                {post.publicando_em && !post.publicado_em && !post.publicacao_erro && <div style={{ fontSize: 13, color: '#1d4ed8', marginBottom: 6 }}>Enviando para o Instagram desde {dataHora(post.publicando_em)}...</div>}
                {post.aprovado_em && !post.publicado_em && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                    Aprovado em {dataHora(post.aprovado_em)}. {publicacaoAtiva ? `Sai sozinho em ${dataCurta(post.data_planejada)} às ${horaCurta(post.hora_planejada)}.` : 'O interruptor de publicação automática está desligado: não vai sair sozinho.'}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!post.aprovado_em && !post.postado_em && (
                    <Botao tipo="primario" icone="mdi:thumb-up-outline" disabled={salvando || problemas.length > 0}
                      title={problemas.length ? 'Resolva os pontos acima antes de aprovar' : ''}
                      onClick={() => atualizar({ aprovado_em: new Date().toISOString(), aprovado_por: user?.id || null })}>
                      Aprovar para publicar
                    </Botao>
                  )}
                  {post.aprovado_em && !travado && (
                    <Botao icone="mdi:undo" disabled={salvando} onClick={() => atualizar({ aprovado_em: null, aprovado_por: null })}>Tirar aprovação</Botao>
                  )}
                  {post.publicacao_erro && !post.publicado_em && (
                    <Botao icone="mdi:refresh" disabled={salvando} onClick={tentarDeNovo}>Tentar de novo</Botao>
                  )}
                </div>
              </div>
            )}

            {feed ? (
              <>
                <BlocoCopiar rotulo="Legenda completa (com hashtags)" texto={legendaCompleta(post)} destaque />
                <BlocoCopiar rotulo="Só a legenda" texto={post.legenda} />
                <BlocoCopiar rotulo="Hashtags" texto={post.hashtags} />
                <BlocoCopiar rotulo="Texto alternativo (Configurações avançadas)" texto={post.texto_alt} />
                <BlocoCopiar rotulo="Dica para postar" texto={post.dica} />
              </>
            ) : (
              <>
                {s.rotulo && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>{s.rotulo}</div>}
                <BlocoCopiar rotulo="Figurinha" texto={s.figurinha} />
                <BlocoCopiar rotulo="Texto da figurinha" texto={s.texto_figurinha} destaque />
                <BlocoCopiar rotulo="Opções ou botão" texto={s.opcoes} />
                <BlocoCopiar rotulo="DM para quem responder" texto={s.dm} />
                <BlocoCopiar rotulo="Depois" texto={s.depois} />
              </>
            )}

            {/* Status manual */}
            <div style={{ ...cartao, padding: 12, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Postado?</div>
              {post.postado_em ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#166534' }}>
                    Postado em {dataHora(post.postado_em)} ({post.postado_por === 'manual' ? 'marcado por você' : post.postado_por === 'auto-publicacao' ? 'publicação automática' : 'reconhecido no Instagram'})
                  </span>
                  {!post.publicado_em && (
                    <Botao pequeno icone="mdi:undo" disabled={salvando} onClick={() => atualizar({ postado_em: null, postado_por: null })}>Desmarcar</Botao>
                  )}
                </div>
              ) : (
                <Botao tipo="primario" icone="mdi:check" disabled={salvando || !!post.publicando_em}
                  onClick={() => atualizar({ postado_em: new Date().toISOString(), postado_por: 'manual' })}>
                  Marcar como postado
                </Botao>
              )}
              {feed && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Cole o link do post no Instagram (opcional)"
                    style={{ flex: 1, minWidth: 200, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
                  <Botao pequeno icone="mdi:link-variant" disabled={salvando || link === (post.permalink || '')}
                    onClick={() => atualizar({ permalink: link.trim() || null })}>Salvar link</Botao>
                </div>
              )}
              {feed && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Com o link, a coleta liga este post aos números do Instagram. Sem link, ela tenta achar pela data e pela legenda.</div>}
            </div>

            {/* Edição rápida */}
            {!travado && (
              <div style={{ marginTop: 12 }}>
                {!edicao ? (
                  <Botao icone="mdi:pencil-outline" onClick={() => setEdicao({
                    data: post.data_planejada, hora: horaCurta(post.hora_planejada), legenda: post.legenda || '', hashtags: post.hashtags || '',
                  })}>Editar data, hora{feed ? ' e legenda' : ''}</Botao>
                ) : (
                  <div style={{ ...cartao, padding: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <input type="date" value={edicao.data} onChange={(e) => setEdicao({ ...edicao, data: e.target.value })} style={{ padding: 8, border: '1px solid #d1d5db', borderRadius: 8 }} />
                      <input type="time" value={edicao.hora} onChange={(e) => setEdicao({ ...edicao, hora: e.target.value })} style={{ padding: 8, border: '1px solid #d1d5db', borderRadius: 8 }} />
                    </div>
                    {feed && (
                      <>
                        <textarea value={edicao.legenda} onChange={(e) => setEdicao({ ...edicao, legenda: e.target.value })} rows={8}
                          style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', marginBottom: 8 }} />
                        <input value={edicao.hashtags} onChange={(e) => setEdicao({ ...edicao, hashtags: e.target.value })} placeholder="#hashtags"
                          style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, marginBottom: 8 }} />
                      </>
                    )}
                    {temFase3 && post.aprovado_em && <div style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>Salvar tira a aprovação: você aprova de novo depois.</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Botao tipo="primario" icone="mdi:content-save-outline" disabled={salvando || !edicao.data} onClick={salvarEdicao}>Salvar</Botao>
                      <Botao onClick={() => setEdicao(null)}>Cancelar</Botao>
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Se você reenviar a semana pelo script, o que estiver no Word volta a valer.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- calendário ----------
function Calendario({ semana, posts, arquivosPorPost, urls, midiaPorPost, publicacaoAtiva, onAbrir, isMobile }) {
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(semana, i))
  const hoje = hojeBRT()
  const ordenar = (a, b) => (horaCurta(a.hora_planejada) || '99').localeCompare(horaCurta(b.hora_planejada) || '99') || a.ordem - b.ordem
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, minmax(0, 1fr))', gap: 10 }}>
      {dias.map((d, i) => {
        const doDia = posts.filter((p) => p.data_planejada === d)
        const feed = doDia.filter((p) => p.tipo !== 'story').sort(ordenar)
        const stories = doDia.filter((p) => p.tipo === 'story').sort((a, b) => a.ordem - b.ordem)
        return (
          <div key={d} style={{ ...cartao, padding: 10, minHeight: isMobile ? 0 : 220, borderColor: d === hoje ? VERDE : '#e5e7eb', borderWidth: d === hoje ? 2 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong style={{ fontSize: 13, color: d === hoje ? VERDE : '#111827' }}>{DIAS_CURTO[i]}</strong>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{dataCurta(d)}</span>
            </div>
            {!doDia.length && <div style={{ fontSize: 12, color: '#9ca3af' }}>Nada planejado</div>}
            {feed.map((p) => {
              const arqs = (arquivosPorPost[p.id] || []).filter((a) => a.tipo !== 'capa')
              const m = midiaPorPost[p.id]
              return (
                <button key={p.id} type="button" onClick={() => onAbrir(p.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 8, marginBottom: 8, cursor: 'pointer' }}>
                  <Miniatura arquivo={arqs[0]} url={arqs[0] && urls[arqs[0].caminho]} altura={isMobile ? 160 : 110} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: VERDE, marginTop: 6 }}>
                    <Icon icon={TIPO_ICONE[p.tipo]} width={14} /> {TIPO_ROTULO[p.tipo]}{p.hora_planejada ? ` · ${horaCurta(p.hora_planejada)}` : ''}
                    {arqs.length > 1 && <span style={{ color: '#6b7280', fontWeight: 500 }}>· {arqs.length} itens</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#111827', margin: '2px 0 6px', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.titulo}</div>
                  <Chip status={statusDo(p, publicacaoAtiva)} />
                  {m && m.views !== null && m.views !== undefined && (
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{num(m.views)} views · {num(m.alcance)} alcance</div>
                  )}
                </button>
              )
            })}
            {stories.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>STORIES</div>
                {stories.map((p) => {
                  const st = statusDo(p, false)
                  return (
                    <button key={p.id} type="button" onClick={() => onAbrir(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 8px', marginBottom: 4, cursor: 'pointer', fontSize: 12 }}>
                      <Icon icon={st.icone} width={14} color={st.cor} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151' }}>
                        {p.hora_planejada ? `${horaCurta(p.hora_planejada)} ` : ''}{(p.story && p.story.figurinha) || p.titulo}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------- métricas ----------
function Metricas({ marca, postsPorId, onConfirmarSugestao, fase2 }) {
  const [carregando, setCarregando] = useState(true)
  const [midias, setMidias] = useState([])
  const [conta, setConta] = useState([])
  const [incluirStories, setIncluirStories] = useState(false)
  const [ordem, setOrdem] = useState('publicado_em')

  const carregar = useCallback(async () => {
    if (!marca || !fase2) { setCarregando(false); return }
    setCarregando(true)
    const desde = new Date(Date.now() - 30 * 86400000).toISOString()
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from('organico_ig_midias').select('*').eq('marca_id', marca.id).gte('publicado_em', desde).order('publicado_em', { ascending: false }),
      supabase.from('organico_conta_diaria').select('*').eq('marca_id', marca.id).gte('data', somarDias(hojeBRT(), -40)).order('data'),
    ])
    setMidias(m || [])
    setConta(c || [])
    setCarregando(false)
  }, [marca, fase2])

  useEffect(() => { carregar() }, [carregar])

  if (!fase2) return <div style={{ ...cartao, padding: 20, color: '#6b7280' }}>Rode o sql-organico-fase2-metricas.sql e faça o deploy do organico-coletar para ver as métricas.</div>
  if (carregando) return <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Carregando métricas...</div>

  const hoje = hojeBRT()
  const soma = (campo, ini, fim) => conta.filter((r) => r.data >= ini && r.data <= fim).reduce((s, r) => s + (Number(r[campo]) || 0), 0)
  const ontem = somarDias(hoje, -1)
  const ini7 = somarDias(hoje, -7)
  const iniAnt = somarDias(hoje, -14)
  const fimAnt = somarDias(hoje, -8)
  const seguidores = [...conta].reverse().find((r) => r.seguidores !== null && r.seguidores !== undefined)
  const variacao = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}% vs 7 dias antes` : 'sem base anterior')

  const cards = [
    { rotulo: 'Seguidores', valor: seguidores ? num(seguidores.seguidores) : '—', sub: `+${num(soma('novos_seguidores', ini7, ontem))} nos últimos 7 dias` },
    { rotulo: 'Alcance (7 dias)', valor: num(soma('alcance', ini7, ontem)), sub: variacao(soma('alcance', ini7, ontem), soma('alcance', iniAnt, fimAnt)) },
    { rotulo: 'Views (7 dias)', valor: num(soma('views', ini7, ontem)), sub: variacao(soma('views', ini7, ontem), soma('views', iniAnt, fimAnt)) },
    { rotulo: 'Interações (7 dias)', valor: num(soma('interacoes', ini7, ontem)), sub: variacao(soma('interacoes', ini7, ontem), soma('interacoes', iniAnt, fimAnt)) },
  ]

  const lista = midias
    .filter((m) => incluirStories || m.media_product_type !== 'STORY')
    .sort((a, b) => (ordem === 'publicado_em'
      ? String(b.publicado_em).localeCompare(String(a.publicado_em))
      : (Number(b[ordem]) || 0) - (Number(a[ordem]) || 0)))

  const colunas = [['views', 'Views'], ['alcance', 'Alcance'], ['curtidas', 'Curt.'], ['comentarios', 'Com.'], ['salvamentos', 'Salv.'], ['compartilhamentos', 'Comp.']]
  const tipoMidia = (m) => (m.media_product_type === 'STORY' ? 'Story' : m.media_product_type === 'REELS' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : 'Foto')

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {cards.map((c) => (
          <div key={c.rotulo} style={{ ...cartao, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{c.rotulo}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: '4px 0' }}>{c.valor}</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ ...cartao, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <strong style={{ fontSize: 15 }}>Publicações dos últimos 30 dias</strong>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={incluirStories} onChange={(e) => setIncluirStories(e.target.checked)} /> incluir stories
            </label>
            <select value={ordem} onChange={(e) => setOrdem(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 8 }}>
              <option value="publicado_em">Mais recentes</option>
              {colunas.map(([c, r]) => <option key={c} value={c}>Mais {r.toLowerCase()}</option>)}
            </select>
          </div>
        </div>
        {!lista.length ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Nenhuma publicação coletada ainda. Clique em "Atualizar métricas".</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#6b7280', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>Quando</th>
                  <th style={{ padding: '8px 6px' }}>Tipo</th>
                  <th style={{ padding: '8px 6px', minWidth: 220 }}>Post</th>
                  {colunas.map(([c, r]) => <th key={c} style={{ padding: '8px 6px', textAlign: 'right' }}>{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => {
                  const planejado = m.post_id && postsPorId[m.post_id]
                  const sugestao = !m.post_id && m.sugestao_post_id && postsPorId[m.sugestao_post_id]
                  return (
                    <tr key={m.ig_media_id} style={{ borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }}>
                      <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{dataHora(m.publicado_em)}</td>
                      <td style={{ padding: '8px 6px' }}>{tipoMidia(m)}</td>
                      <td style={{ padding: '8px 6px' }}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>
                          {planejado ? planejado.titulo : (m.legenda || '(sem legenda)').slice(0, 70)}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>
                          {planejado ? 'planejado' : 'não planejado'}
                          {m.permalink && <> · <a href={m.permalink} target="_blank" rel="noreferrer">ver</a></>}
                          {m.metricas_erro && <span style={{ color: '#b91c1c' }}> · {m.metricas_erro.slice(0, 80)}</span>}
                        </div>
                        {sugestao && (
                          <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: '#92400e' }}>
                            É o "{sugestao.titulo}"?
                            <Botao pequeno tipo="primario" icone="mdi:link-variant" onClick={async () => { await onConfirmarSugestao(m, sugestao); carregar() }}>Sim, ligar</Botao>
                          </div>
                        )}
                      </td>
                      {colunas.map(([c]) => <td key={c} style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(m[c])}</td>)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- histórico ----------
function Historico({ marca, fase2, onIrSemana }) {
  const [linhas, setLinhas] = useState(null)
  useEffect(() => {
    if (!marca) return
    ;(async () => {
      const { data: ps } = await supabase.from('organico_posts')
        .select('id, semana_inicio, semana_nome, tipo, postado_em').eq('marca_id', marca.id).order('semana_inicio', { ascending: false })
      let porPost = {}
      if (fase2) {
        const { data: ms } = await supabase.from('organico_ig_midias').select('post_id, views, alcance, interacoes').eq('marca_id', marca.id).not('post_id', 'is', null)
        porPost = Object.fromEntries((ms || []).map((m) => [m.post_id, m]))
      }
      const grupos = {}
      for (const p of ps || []) {
        const g = grupos[p.semana_inicio] || (grupos[p.semana_inicio] = { semana: p.semana_inicio, nome: p.semana_nome, feed: 0, stories: 0, postados: 0, views: 0, alcance: 0, interacoes: 0 })
        if (p.tipo === 'story') g.stories++
        else g.feed++
        if (p.postado_em) g.postados++
        const m = porPost[p.id]
        if (m) { g.views += m.views || 0; g.alcance += m.alcance || 0; g.interacoes += m.interacoes || 0 }
      }
      setLinhas(Object.values(grupos))
    })()
  }, [marca, fase2])

  if (!linhas) return <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Carregando...</div>
  if (!linhas.length) return <div style={{ ...cartao, padding: 20, color: '#6b7280' }}>Nenhuma semana enviada ainda.</div>
  return (
    <div style={{ ...cartao, padding: 16, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: '#6b7280', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '8px 6px' }}>Semana</th>
            <th style={{ padding: '8px 6px', textAlign: 'right' }}>Feed</th>
            <th style={{ padding: '8px 6px', textAlign: 'right' }}>Stories</th>
            <th style={{ padding: '8px 6px', textAlign: 'right' }}>Postados</th>
            {fase2 && <th style={{ padding: '8px 6px', textAlign: 'right' }}>Views</th>}
            {fase2 && <th style={{ padding: '8px 6px', textAlign: 'right' }}>Alcance</th>}
            {fase2 && <th style={{ padding: '8px 6px', textAlign: 'right' }}>Interações</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((g) => (
            <tr key={g.semana} onClick={() => onIrSemana(g.semana)} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
              <td style={{ padding: '8px 6px', fontWeight: 600, color: '#111827' }}>{g.nome || `Semana de ${dataCurta(g.semana)}`}</td>
              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{g.feed}</td>
              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{g.stories}</td>
              <td style={{ padding: '8px 6px', textAlign: 'right' }}>{g.postados} de {g.feed + g.stories}</td>
              {fase2 && <td style={{ padding: '8px 6px', textAlign: 'right' }}>{num(g.views)}</td>}
              {fase2 && <td style={{ padding: '8px 6px', textAlign: 'right' }}>{num(g.alcance)}</td>}
              {fase2 && <td style={{ padding: '8px 6px', textAlign: 'right' }}>{num(g.interacoes)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- referências ----------
const interacoesRef = (p) => (p.curtidas || 0) + (p.comentarios || 0)
const tipoRef = (p) => (p.media_product_type === 'REELS' || p.media_type === 'VIDEO' ? 'Reel' : p.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : 'Foto')

function DetalheReferencia({ post, perfil, urls, onFechar, isMobile }) {
  const imgs = post.imagens || []
  const [i, setI] = useState(0)
  const atual = imgs[Math.min(i, imgs.length - 1)]
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.55)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: isMobile ? 'stretch' : 'flex-start', padding: isMobile ? 0 : '32px 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...cartao, width: '100%', maxWidth: 900, padding: isMobile ? 16 : 24, borderRadius: isMobile ? 0 : 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: VERDE, marginBottom: 4 }}>{tipoRef(post)} · @{perfil?.username} · {dataHora(post.publicado_em)}</div>
            <div style={{ fontSize: 13, color: '#4b5563' }}>
              {num(post.curtidas)} curtidas · {num(post.comentarios)} comentários{post.engajamento !== null && post.engajamento !== undefined ? ` · ${Number(post.engajamento).toLocaleString('pt-BR')}% de engajamento` : ''}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}>
            <Icon icon="mdi:close" width={24} color="#6b7280" />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 380px) minmax(0, 1fr)', gap: 20 }}>
          <div>
            <div style={{ background: '#111827', borderRadius: 10, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 260, maxHeight: 520 }}>
              {atual && urls[atual.caminho]
                ? <img src={urls[atual.caminho]} alt="" style={{ maxWidth: '100%', maxHeight: 520, objectFit: 'contain' }} />
                : <span style={{ color: '#9ca3af', fontSize: 13 }}>Sem imagem guardada</span>}
            </div>
            {imgs.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8 }}>
                <Botao pequeno icone="mdi:chevron-left" disabled={i === 0} onClick={() => setI(i - 1)} />
                <span style={{ fontSize: 13, color: '#6b7280' }}>{i + 1} de {imgs.length}</span>
                <Botao pequeno icone="mdi:chevron-right" disabled={i >= imgs.length - 1} onClick={() => setI(i + 1)} />
              </div>
            )}
            {tipoRef(post) === 'Reel' && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Reel: guardamos só a capa. O vídeo fica no link do Instagram.</div>}
            {post.permalink && (
              <div style={{ marginTop: 10 }}>
                <a href={post.permalink} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>Abrir no Instagram</a>
              </div>
            )}
          </div>
          <div>
            <BlocoCopiar rotulo="Legenda" texto={post.legenda || '(sem legenda)'} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Referencias({ marca, isMobile }) {
  const [perfis, setPerfis] = useState(null)
  const [posts, setPosts] = useState([])
  const [urls, setUrls] = useState({})
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [novo, setNovo] = useState('')
  const [ocupado, setOcupado] = useState(null) // 'adicionar' | perfil_id
  const [filtro, setFiltro] = useState('todos')
  const [ordem, setOrdem] = useState('interacoes')
  const [soDestaques, setSoDestaques] = useState(true)
  const [aberto, setAberto] = useState(null)

  const carregar = useCallback(async () => {
    if (!marca) return
    setErro('')
    const { data: ps, error } = await supabase.from('organico_ref_perfis').select('*').eq('marca_id', marca.id).order('username')
    if (error) { setErro(`Não consegui ler as referências (${error.message}). O sql-organico-fase4-referencias.sql já foi rodado?`); setPerfis([]); return }
    const ids = (ps || []).map((p) => p.id)
    let lista = []
    if (ids.length) {
      const { data } = await supabase.from('organico_ref_posts').select('*').in('perfil_id', ids)
      lista = data || []
    }
    const caminhos = [...new Set(lista.flatMap((p) => (p.imagens || []).map((i) => i.caminho)))]
    let mapa = {}
    for (let k = 0; k < caminhos.length; k += 100) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(caminhos.slice(k, k + 100), 3600)
      for (const u of data || []) if (u.signedUrl) mapa[u.path] = u.signedUrl
    }
    setPerfis(ps || [])
    setPosts(lista)
    setUrls(mapa)
  }, [marca])

  useEffect(() => { carregar() }, [carregar])

  const chamar = async (body, chave) => {
    setOcupado(chave)
    setAviso('')
    const { data, error } = await supabase.functions.invoke('organico-referencias', { body: { marca: marca?.slug, ...body } })
    setOcupado(null)
    let msg = data?.erro
    if (error && !msg) {
      try { msg = (await error.context?.json())?.erro } catch { /* sem corpo */ }
      msg = msg || error.message
    }
    return { data, msg }
  }

  const adicionar = async () => {
    if (!novo.trim()) return
    const { data, msg } = await chamar({ acao: 'adicionar', username: novo }, 'adicionar')
    if (msg) setAviso(`Erro: ${msg}`)
    else if (data?.ok === false) setAviso(`Erro em @${data.username}: ${data.erro}`)
    else { setAviso(`@${data.username}: ${data.posts_lidos} posts lidos, ${data.imagens_copiadas} imagens guardadas.`); setNovo('') }
    carregar()
  }

  const atualizar = async (p) => {
    const { data, msg } = await chamar({ acao: 'coletar', perfil_id: p.id }, p.id)
    if (msg || data?.ok === false) setAviso(`Erro em @${p.username}: ${msg || data.erro}`)
    else setAviso(`@${p.username} atualizado: ${data.posts_lidos} posts lidos, ${data.imagens_copiadas} imagens novas.`)
    carregar()
  }

  const remover = async (p) => {
    if (!window.confirm(`Remover @${p.username} das referências? Apaga os posts e as imagens guardadas.`)) return
    const { msg } = await chamar({ acao: 'remover', perfil_id: p.id }, p.id)
    if (msg) setAviso(`Erro: ${msg}`)
    if (filtro === p.id) setFiltro('todos')
    carregar()
  }

  if (!perfis) return <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Carregando referências...</div>

  const perfisPorId = Object.fromEntries(perfis.map((p) => [p.id, p]))
  const lista = posts
    .filter((p) => filtro === 'todos' || p.perfil_id === filtro)
    .filter((p) => !soDestaques || p.destaque)
    .sort((a, b) => (ordem === 'recentes'
      ? String(b.publicado_em).localeCompare(String(a.publicado_em))
      : ordem === 'engajamento'
        ? (Number(b.engajamento) || 0) - (Number(a.engajamento) || 0)
        : interacoesRef(b) - interacoesRef(a)))
  const postAberto = aberto && posts.find((p) => p.ig_media_id === aberto)

  return (
    <div>
      {erro && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{erro}</div>}
      {aviso && <div style={{ background: aviso.startsWith('Erro') ? '#fee2e2' : '#f0fdf4', color: aviso.startsWith('Erro') ? '#991b1b' : '#166534', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{aviso}</div>}

      <div style={{ ...cartao, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Adicionar perfil de referência</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }}
            placeholder="@perfil ou link do Instagram"
            style={{ flex: 1, minWidth: 220, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          <Botao tipo="primario" icone="mdi:plus" disabled={!!ocupado || !novo.trim()} onClick={adicionar}>
            {ocupado === 'adicionar' ? 'Lendo o perfil...' : 'Adicionar'}
          </Botao>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
          Só perfil comercial ou de criador. Lemos os 50 posts mais recentes e guardamos as imagens dos 10 com mais curtidas e comentários. Para ler de novo, clique em "Atualizar" no perfil.
        </div>
      </div>

      {perfis.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginBottom: 14 }}>
          {perfis.map((p) => (
            <div key={p.id} style={{ ...cartao, padding: 12, borderColor: filtro === p.id ? VERDE : '#e5e7eb', borderWidth: filtro === p.id ? 2 : 1 }}>
              <button type="button" onClick={() => setFiltro(filtro === p.id ? 'todos' : p.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                {p.foto_url
                  ? <img src={p.foto_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                  : <Icon icon="mdi:account-circle" width={40} color="#d1d5db" />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.username}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{p.seguidores !== null && p.seguidores !== undefined ? `${num(p.seguidores)} seguidores` : (p.nome || '')}</div>
                </div>
              </button>
              <div style={{ fontSize: 11, color: p.coleta_erro ? '#b91c1c' : '#9ca3af', margin: '8px 0' }}>
                {p.coleta_erro ? p.coleta_erro : p.coletado_em ? `Atualizado ${dataHora(p.coletado_em)}` : 'Ainda não coletado'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Botao pequeno icone="mdi:refresh" disabled={!!ocupado} onClick={() => atualizar(p)}>{ocupado === p.id ? 'Lendo...' : 'Atualizar'}</Botao>
                <Botao pequeno tipo="perigo" icone="mdi:delete-outline" disabled={!!ocupado} onClick={() => remover(p)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...cartao, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <strong style={{ fontSize: 15 }}>{filtro === 'todos' ? 'Melhores posts de todos os perfis' : `Posts de @${perfisPorId[filtro]?.username || ''}`}</strong>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={soDestaques} onChange={(e) => setSoDestaques(e.target.checked)} /> só os 10 melhores de cada perfil
            </label>
            <select value={ordem} onChange={(e) => setOrdem(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 8 }}>
              <option value="interacoes">Mais curtidas + comentários</option>
              <option value="engajamento">Maior engajamento (% dos seguidores)</option>
              <option value="recentes">Mais recentes</option>
            </select>
          </div>
        </div>
        {!lista.length ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>
            {perfis.length ? 'Nenhum post para mostrar com esse filtro.' : 'Adicione o primeiro perfil acima.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 180}px, 1fr))`, gap: 12 }}>
            {lista.map((p) => {
              const capa = (p.imagens || [])[0]
              const url = capa && urls[capa.caminho]
              return (
                <button key={p.ig_media_id} type="button" onClick={() => setAberto(p.ig_media_id)}
                  style={{ display: 'block', textAlign: 'left', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 8, cursor: 'pointer' }}>
                  <div style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 8, background: url ? `#f3f4f6 center/cover no-repeat url("${url}")` : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>
                    {!url && 'sem imagem'}
                    <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, fontWeight: 700, color: 'white', background: 'rgba(17,24,39,0.7)', padding: '2px 6px', borderRadius: 999 }}>
                      {tipoRef(p)}{(p.imagens || []).length > 1 ? ` · ${p.imagens.length}` : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginTop: 6 }}>
                    <Icon icon="mdi:heart-outline" width={13} style={{ verticalAlign: -2 }} /> {num(p.curtidas)} <Icon icon="mdi:comment-outline" width={13} style={{ verticalAlign: -2, marginLeft: 6 }} /> {num(p.comentarios)}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    @{perfisPorId[p.perfil_id]?.username} · {dataHora(p.publicado_em).slice(0, 5)}{p.engajamento !== null && p.engajamento !== undefined ? ` · ${Number(p.engajamento).toLocaleString('pt-BR')}%` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: '#374151', marginTop: 4, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.legenda || ''}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {postAberto && (
        <DetalheReferencia post={postAberto} perfil={perfisPorId[postAberto.perfil_id]} urls={urls} isMobile={isMobile} onFechar={() => setAberto(null)} />
      )}
    </div>
  )
}

// ---------- página ----------
export default function SecaoOrganico() {
  const { width } = useWindowSize()
  const isMobile = width < 900
  const [marcas, setMarcas] = useState([])
  const [marcaId, setMarcaId] = useState(null)
  const [semana, setSemana] = useState(() => segundaDe(hojeBRT()))
  const [aba, setAba] = useState('calendario')
  const [posts, setPosts] = useState([])
  const [arquivos, setArquivos] = useState([])
  const [urls, setUrls] = useState({})
  const [midias, setMidias] = useState([])
  const [execucoes, setExecucoes] = useState({})
  const [fase2, setFase2] = useState(true)
  const [aberto, setAberto] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [coletando, setColetando] = useState(false)
  const [aviso, setAviso] = useState('')

  const marca = marcas.find((m) => m.id === marcaId) || null
  const temFase3 = !!marca && 'publicacao_ativa' in marca
  const publicacaoAtiva = !!marca?.publicacao_ativa

  const carregarMarcas = useCallback(async () => {
    const { data, error } = await supabase.from('organico_marcas').select('*').eq('ativo', true).order('criado_em')
    if (error) { setErro(`Não consegui ler as marcas (${error.message}). O sql-organico-fase1-conteudo.sql já foi rodado?`); setCarregando(false); return }
    setMarcas(data || [])
    setMarcaId((atual) => atual || data?.[0]?.id || null)
    if (!data?.length) setCarregando(false)
  }, [])

  const carregarSemana = useCallback(async () => {
    if (!marcaId) return
    setCarregando(true)
    setErro('')
    const fim = somarDias(semana, 6)
    const { data: ps, error } = await supabase.from('organico_posts').select('*')
      .eq('marca_id', marcaId).gte('data_planejada', semana).lte('data_planejada', fim)
    if (error) { setErro(error.message); setCarregando(false); return }
    const ids = (ps || []).map((p) => p.id)
    let arqs = []
    if (ids.length) {
      const { data } = await supabase.from('organico_arquivos').select('*').in('post_id', ids).order('ordem')
      arqs = data || []
    }
    const caminhos = [...new Set(arqs.map((a) => a.caminho))]
    let mapa = {}
    if (caminhos.length) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(caminhos, 3600)
      mapa = Object.fromEntries((data || []).filter((u) => u.signedUrl).map((u) => [u.path, u.signedUrl]))
    }
    let ms = []
    if (ids.length) {
      const { data, error: eM } = await supabase.from('organico_ig_midias').select('*').in('post_id', ids)
      if (eM) setFase2(false)
      else ms = data || []
    }
    const ex = {}
    const { data: exs } = await supabase.from('organico_execucoes').select('tipo, iniciado_em, ok, erro')
      .eq('marca_id', marcaId).order('iniciado_em', { ascending: false }).limit(30)
    for (const e of exs || []) if (!ex[e.tipo]) ex[e.tipo] = e
    setPosts(ps || [])
    setArquivos(arqs)
    setUrls(mapa)
    setMidias(ms)
    setExecucoes(ex)
    setCarregando(false)
  }, [marcaId, semana])

  useEffect(() => { carregarMarcas() }, [carregarMarcas])
  useEffect(() => { carregarSemana() }, [carregarSemana])

  const arquivosPorPost = useMemo(() => {
    const out = {}
    for (const a of arquivos) (out[a.post_id] = out[a.post_id] || []).push(a)
    return out
  }, [arquivos])
  const midiaPorPost = useMemo(() => Object.fromEntries(midias.map((m) => [m.post_id, m])), [midias])
  const postsPorId = useMemo(() => Object.fromEntries(posts.map((p) => [p.id, p])), [posts])
  const postAberto = posts.find((p) => p.id === aberto) || null

  // Para a aba de métricas, o título do post planejado pode ser de outra semana.
  const [todosPosts, setTodosPosts] = useState({})
  useEffect(() => {
    if (aba !== 'metricas' || !marcaId) return
    supabase.from('organico_posts').select('id, titulo, tipo, data_planejada, postado_em, postado_por')
      .eq('marca_id', marcaId).gte('data_planejada', somarDias(hojeBRT(), -40))
      .then(({ data }) => setTodosPosts(Object.fromEntries((data || []).map((p) => [p.id, p]))))
  }, [aba, marcaId])

  const coletarAgora = async () => {
    setColetando(true)
    setAviso('')
    const { data, error } = await supabase.functions.invoke('organico-coletar', { body: { modo: 'dia', marca: marca?.slug } })
    setColetando(false)
    const r = data?.resultado?.[marca?.slug]
    if (error || r?.erro) setAviso(`Erro na coleta: ${r?.erro || error?.message}`)
    else setAviso(`Coleta feita: ${r?.midias_lidas ?? 0} publicações lidas, ${r?.ligacoes?.auto ?? 0} ligadas automaticamente.`)
    carregarSemana()
  }

  const alternarPublicacao = async () => {
    const ligar = !publicacaoAtiva
    const msg = ligar
      ? 'Ligar a publicação automática? Os posts de feed APROVADOS vão sair sozinhos no Instagram na data e hora planejadas.'
      : 'Desligar a publicação automática? Nada mais sai sozinho até você ligar de novo.'
    if (!window.confirm(msg)) return
    const { error } = await supabase.from('organico_marcas').update({ publicacao_ativa: ligar }).eq('id', marcaId)
    if (error) { setAviso(error.message); return }
    carregarMarcas()
  }

  const confirmarSugestao = async (midia, post) => {
    await supabase.from('organico_ig_midias').update({ post_id: post.id, sugestao_post_id: null }).eq('ig_media_id', midia.ig_media_id)
    await supabase.from('organico_posts').update({
      ig_media_id: midia.ig_media_id,
      permalink: midia.permalink,
      postado_em: post.postado_em || midia.publicado_em,
      postado_por: post.postado_por || 'manual',
    }).eq('id', post.id)
    carregarSemana()
  }

  const ultColeta = execucoes.coleta_hora && execucoes.coleta_dia
    ? (execucoes.coleta_hora.iniciado_em > execucoes.coleta_dia.iniciado_em ? execucoes.coleta_hora : execucoes.coleta_dia)
    : execucoes.coleta_hora || execucoes.coleta_dia
  const ultPublicacao = execucoes.publicacao

  const feedSemana = posts.filter((p) => p.tipo !== 'story')
  const storiesSemana = posts.filter((p) => p.tipo === 'story')
  const postados = posts.filter((p) => p.postado_em).length

  const abaBtn = (id, rotulo, icone) => (
    <button key={id} type="button" onClick={() => setAba(id)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: aba === id ? `2px solid ${VERDE}` : '1px solid #d1d5db', background: aba === id ? '#f0fdf4' : 'white', color: aba === id ? '#166534' : '#4b5563',
      }}>
      <Icon icon={icone} width={16} /> {rotulo}
    </button>
  )

  return (
    <div className="adm-pagina">
      <div className="adm-cabecalho">
        <div>
          <h1 className="adm-titulo">Orgânico</h1>
          <div className="adm-subtitulo">O que sai no Instagram em cada dia, pronto para copiar, e os números de cada post</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {marcas.length > 1 && (
            <select value={marcaId || ''} onChange={(e) => setMarcaId(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
              {marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          )}
          {fase2 && <Botao icone="mdi:refresh" disabled={coletando || !marca} onClick={coletarAgora}>{coletando ? 'Atualizando...' : 'Atualizar métricas'}</Botao>}
          {temFase3 && (
            <Botao tipo={publicacaoAtiva ? 'primario' : 'neutro'} icone={publicacaoAtiva ? 'mdi:toggle-switch' : 'mdi:toggle-switch-off-outline'} onClick={alternarPublicacao}
              title="Interruptor geral: só publica sozinho o que você aprovar">
              Publicação automática: {publicacaoAtiva ? 'LIGADA' : 'desligada'}
            </Botao>
          )}
        </div>
      </div>

      {erro && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{erro}</div>}
      {aviso && <div style={{ background: aviso.startsWith('Erro') ? '#fee2e2' : '#f0fdf4', color: aviso.startsWith('Erro') ? '#991b1b' : '#166534', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{aviso}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {abaBtn('calendario', 'Calendário', 'mdi:calendar-week')}
          {abaBtn('metricas', 'Métricas', 'mdi:chart-line')}
          {abaBtn('historico', 'Histórico', 'mdi:history')}
          {abaBtn('referencias', 'Referências', 'mdi:image-search-outline')}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {ultColeta && (
            <span style={{ color: ultColeta.ok ? '#6b7280' : '#b91c1c' }} title={ultColeta.erro || ''}>
              <Icon icon={ultColeta.ok ? 'mdi:check-circle-outline' : 'mdi:alert-circle-outline'} width={13} style={{ verticalAlign: -2 }} /> Última coleta {dataHora(ultColeta.iniciado_em)}{!ultColeta.ok && `: ${String(ultColeta.erro || '').slice(0, 90)}`}
            </span>
          )}
          {ultPublicacao && !ultPublicacao.ok && (
            <span style={{ color: '#b91c1c' }}>Publicação com erro em {dataHora(ultPublicacao.iniciado_em)}: {String(ultPublicacao.erro || '').slice(0, 90)}</span>
          )}
        </div>
      </div>

      {aba === 'calendario' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Botao pequeno icone="mdi:chevron-left" onClick={() => setSemana(somarDias(semana, -7))} />
              <strong style={{ fontSize: 15, color: '#111827' }}>{dataCurta(semana)} a {dataCurta(somarDias(semana, 6))}</strong>
              <Botao pequeno icone="mdi:chevron-right" onClick={() => setSemana(somarDias(semana, 7))} />
              {semana !== segundaDe(hojeBRT()) && <Botao pequeno onClick={() => setSemana(segundaDe(hojeBRT()))}>Esta semana</Botao>}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {feedSemana.length} no feed · {storiesSemana.length} stories · {postados} postados
            </div>
          </div>
          {carregando ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando a semana...</div>
          ) : !marca ? (
            <div style={{ ...cartao, padding: 20, color: '#6b7280' }}>Nenhuma marca cadastrada.</div>
          ) : !posts.length ? (
            <div style={{ ...cartao, padding: 24, color: '#6b7280', fontSize: 14 }}>
              Nada planejado nesta semana. Para enviar, rode no computador:
              <pre style={{ background: '#f3f4f6', padding: 10, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', marginTop: 8 }}>node ferramentas/organico/enviar-semana.js "C:\Users\cttca\Documents\Mensalli\Conteudo\Semana ..."</pre>
            </div>
          ) : (
            <Calendario semana={semana} posts={posts} arquivosPorPost={arquivosPorPost} urls={urls} midiaPorPost={midiaPorPost}
              publicacaoAtiva={publicacaoAtiva} onAbrir={setAberto} isMobile={isMobile} />
          )}
        </>
      )}

      {aba === 'metricas' && (
        <Metricas marca={marca} fase2={fase2} postsPorId={{ ...todosPosts, ...postsPorId }} onConfirmarSugestao={confirmarSugestao} />
      )}

      {aba === 'historico' && (
        <Historico marca={marca} fase2={fase2} onIrSemana={(s) => { setSemana(s); setAba('calendario') }} />
      )}

      {aba === 'referencias' && <Referencias marca={marca} isMobile={isMobile} />}

      {postAberto && (
        <Detalhe post={postAberto} arquivos={arquivosPorPost[postAberto.id] || []} urls={urls} midia={midiaPorPost[postAberto.id]}
          temFase3={temFase3} publicacaoAtiva={publicacaoAtiva} isMobile={isMobile}
          onFechar={() => setAberto(null)} onMudou={carregarSemana} />
      )}
    </div>
  )
}
