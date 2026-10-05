import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import { showToast } from '../Toast'
import { useUser } from '../contexts/UserContext'
import useWindowSize from '../hooks/useWindowSize'
import { useUserPlan } from '../hooks/useUserPlan'
import { BioView } from '../pages/BioAcademia'
import {
  FONTES_BIO, todosOsTemas, resolverBio, carregarFontesBio, youtubeId, tipoDaMidia, bioPublicada, TEMA_PADRAO, FONTE_PADRAO
} from '../data/bioTemas'
import { validarSlug, slugificar } from '../utils/slugs'

// Editor do link na bio (Marketing › Bio). Salva em usuarios.bio_config (jsonb).
// O preview ao lado usa o mesmo BioView da página pública: clicou, mudou.

const MAX_MIDIAS = 8
const MAX_LINKS = 5
const MAX_FOTO = 3 * 1024 * 1024
const MAX_VIDEO = 30 * 1024 * 1024
const VERDE = '#16a34a'

const titulo = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }
const dica = { fontSize: '12px', color: '#6b7280', margin: '0 0 10px' }
const campo = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', backgroundColor: '#fff' }

function Bloco({ icone, nome, children }) {
  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '18px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <Icon icon={icone} width="20" style={{ color: '#344848' }} />
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1f2937' }}>{nome}</h3>
      </div>
      {children}
    </div>
  )
}

function Chave({ ligado, onChange, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '8px 0', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
      <span>{children}</span>
      <span onClick={(e) => { e.preventDefault(); onChange(!ligado) }}
        style={{ width: '40px', height: '22px', borderRadius: '999px', backgroundColor: ligado ? VERDE : '#d1d5db', position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}>
        <span style={{ position: 'absolute', top: '2px', left: ligado ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
      </span>
    </label>
  )
}

export default function BioEditor({ onIrParaAgendamento }) {
  const { userId } = useUser()
  const navigate = useNavigate()
  const { isLocked, loading: planoCarregando } = useUserPlan()
  const { width } = useWindowSize()
  const mobile = width < 980

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [enviandoCapa, setEnviandoCapa] = useState(false)
  const [linha, setLinha] = useState(null)         // linha de usuarios (para montar a empresa)
  const [bio, setBio] = useState({ tema: TEMA_PADRAO, fonte: FONTE_PADRAO })
  const [salvo, setSalvo] = useState('')           // JSON do que está salvo, para detectar mudanças
  const [youtubeCampo, setYoutubeCampo] = useState('')
  const [previewAberto, setPreviewAberto] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [slugCampo, setSlugCampo] = useState('')       // endereço digitado (landing_slug)

  useEffect(() => { carregarFontesBio(FONTES_BIO.map(f => f.id)) }, [])

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    ;(async () => {
      const { data, error } = await supabase.from('usuarios').select('*').eq('id', userId).single()
      if (cancelado) return
      if (error) {
        showToast('Erro ao carregar a bio: ' + error.message, 'error')
      } else {
        setLinha(data)
        setSlugCampo(data.landing_slug || '')
        const inicial = data.bio_config && typeof data.bio_config === 'object' ? data.bio_config : {}
        setBio(inicial)
        setSalvo(JSON.stringify(inicial))
      }
      setLoading(false)
    })()
    return () => { cancelado = true }
  }, [userId])

  // O link de agendamento é exclusivo do Premium (a edge landing-dados aplica a mesma regra)
  const premium = !isLocked('premium')

  // Mesmo formato que a edge function landing-dados devolve
  const empresa = useMemo(() => {
    if (!linha) return null
    return {
      nome_empresa: linha.nome_empresa || 'Sua Academia',
      logo_url: linha.logo_url,
      foto_capa_url: linha.landing_foto_capa_url,
      descricao: linha.landing_descricao,
      hero_subtitulo: linha.landing_hero_subtitulo,
      cor_primaria: linha.landing_cor_primaria || '#344848',
      telefone: linha.telefone,
      instagram_url: linha.instagram_url,
      facebook_url: linha.facebook_url,
      tiktok_url: linha.tiktok_url,
      youtube_url: linha.landing_youtube_url,
      site: linha.site,
      endereco_completo: [linha.endereco, linha.numero, linha.bairro, linha.cidade, linha.estado].filter(Boolean).join(', '),
      agendamento_slug: linha.agendamento_slug,
      agendamento_ativo: !!linha.agendamento_ativo && premium,
      galeria: Array.isArray(linha.landing_galeria) ? linha.landing_galeria : []
    }
  }, [linha, premium])

  if (planoCarregando) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Carregando...</div>
  }

  // A página pública só abre para Pro e Premium (edge landing-dados): no Starter o link ficaria morto.
  if (isLocked('pro')) {
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '60px 40px', textAlign: 'center', border: '1px solid #e5e7eb', maxWidth: '500px', margin: '40px auto' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#fff3e0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
          <Icon icon="mdi:lock" width="32" style={{ color: '#ff9800' }} />
        </div>
        <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: 600, color: '#1a1a1a' }}>Seu link na bio</h2>
        <p style={{ margin: '0 0 24px', fontSize: '15px', color: '#666', lineHeight: 1.6 }}>
          Uma página para a bio do Instagram com botão de agendar, WhatsApp, redes e fotos ou vídeos.
          Disponível a partir do plano <strong>Pro</strong>.
        </p>
        <button onClick={() => navigate('/app/configuracao?aba=assinatura')}
          style={{ padding: '12px 32px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>
          Fazer upgrade
        </button>
      </div>
    )
  }

  if (loading || !empresa) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Carregando...</div>
  }

  const cfg = resolverBio(empresa, bio)
  const temas = todosOsTemas(empresa.cor_primaria)
  // Endereço público da academia (usuarios.landing_slug). A bio abre em /<endereço> (e também em /<endereço>/bio).
  const slugSalvo = linha.landing_slug || ''
  const slugLimpo = slugCampo.trim().toLowerCase()
  const slugMudou = slugLimpo !== slugSalvo
  const avisoSlug = slugMudou && slugLimpo ? validarSlug(slugLimpo) : null
  // Bio no ar: interruptor próprio, independente de o site estar publicado
  const noAr = bioPublicada(bio, linha.landing_ativo)
  const alterado = JSON.stringify(bio) !== salvo || slugMudou
  const linkBio = slugSalvo ? `${window.location.origin}/${slugSalvo}` : ''

  const atualizar = (patch) => setBio(prev => ({ ...prev, ...patch }))
  const setRede = (chave, valor) => setBio(prev => ({ ...prev, redes: { ...(prev.redes || {}), [chave]: valor } }))
  const setMostrar = (chave, valor) => setBio(prev => ({ ...prev, mostrar: { ...(prev.mostrar || {}), [chave]: valor } }))

  // Ao mexer na mídia, "congela" a lista atual (inclui as fotos herdadas do site)
  const midias = cfg.midias.map(m => ({ tipo: m.tipo || tipoDaMidia(m.url), url: m.url }))
  const setMidias = (lista) => atualizar({ midias: lista })

  const mover = (i, d) => {
    const j = i + d
    if (j < 0 || j >= midias.length) return
    const novo = [...midias]
    ;[novo[i], novo[j]] = [novo[j], novo[i]]
    setMidias(novo)
  }

  const enviarArquivo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const video = file.type.startsWith('video/')
    if (!video && !file.type.startsWith('image/')) { showToast('Escolha uma foto ou um vídeo', 'warning'); return }
    if (!video && file.size > MAX_FOTO) { showToast('Foto: máximo 3MB', 'warning'); return }
    if (video && file.size > MAX_VIDEO) { showToast('Vídeo: máximo 30MB. Para vídeos maiores, cole o link do YouTube.', 'warning'); return }
    if (midias.length >= MAX_MIDIAS) { showToast(`Máximo de ${MAX_MIDIAS} itens`, 'warning'); return }
    setEnviando(true)
    try {
      const ext = (file.name.split('.').pop() || (video ? 'mp4' : 'jpg')).toLowerCase()
      const nome = `${userId}/bio-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('logos').upload(nome, file, { upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('logos').getPublicUrl(nome)
      setMidias([...midias, { tipo: video ? 'video' : 'foto', url: data.publicUrl }])
    } catch (err) {
      showToast('Erro ao enviar: ' + err.message, 'error')
    } finally {
      setEnviando(false)
    }
  }

  const enviarCapa = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { showToast('Escolha uma imagem', 'warning'); return }
    if (file.size > MAX_FOTO) { showToast('Capa: máximo 3MB', 'warning'); return }
    setEnviandoCapa(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const nome = `${userId}/bio-capa-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('logos').upload(nome, file, { upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('logos').getPublicUrl(nome)
      atualizar({ capa: data.publicUrl })
    } catch (err) {
      showToast('Erro ao enviar a capa: ' + err.message, 'error')
    } finally {
      setEnviandoCapa(false)
    }
  }

  const adicionarYoutube = () => {
    const url = youtubeCampo.trim()
    if (!youtubeId(url)) { showToast('Cole um link válido do YouTube', 'warning'); return }
    if (midias.length >= MAX_MIDIAS) { showToast(`Máximo de ${MAX_MIDIAS} itens`, 'warning'); return }
    setMidias([...midias, { tipo: 'youtube', url }])
    setYoutubeCampo('')
  }

  const links = Array.isArray(bio.links) ? bio.links : []
  const setLink = (i, patch) => atualizar({ links: links.map((l, k) => (k === i ? { ...l, ...patch } : l)) })

  const salvar = async () => {
    setSalvando(true)
    try {
      const limpo = {
        ...bio,
        links: links.filter(l => (l.titulo || '').trim() && (l.url || '').trim())
      }
      if (slugMudou && slugLimpo) {
        const v = validarSlug(slugLimpo)
        if (!v.ok) { showToast(v.erro, 'warning'); return }
      }
      if (noAr && !slugLimpo) { showToast('Defina o endereço antes de colocar a bio no ar', 'warning'); return }
      const atualizacao = { bio_config: limpo }
      if (slugMudou) atualizacao.landing_slug = slugLimpo || null
      const { error } = await supabase.from('usuarios').update(atualizacao).eq('id', userId)
      if (error) {
        if (error.code === '23505' || /landing_slug/.test(error.message)) {
          showToast('Esse endereço já está em uso por outra conta. Escolha outro.', 'warning')
          return
        }
        if (error.code === '42703' || error.code === 'PGRST204' || /bio_config/.test(error.message)) {
          showToast('A coluna bio_config ainda não existe no banco. Rode o SQL sql-criar-bio-config.sql.', 'error')
        } else {
          throw error
        }
        return
      }
      setBio(limpo)
      setSalvo(JSON.stringify(limpo))
      if (slugMudou) setLinha(prev => ({ ...prev, landing_slug: slugLimpo || null }))
      showToast(noAr ? 'Bio salva e no ar!' : 'Bio salva!', 'success')
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(linkBio)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      window.prompt('Copie o link:', linkBio)
    }
  }

  const preview = (
    <div style={{ width: '100%', maxWidth: '340px', margin: '0 auto' }}>
      <div style={{ borderRadius: '38px', padding: '10px', backgroundColor: '#111827', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ borderRadius: '29px', overflow: 'hidden', height: mobile ? '560px' : 'min(640px, calc(100vh - 150px))', overflowY: 'auto', scrollbarWidth: 'none', backgroundColor: '#000' }}>
          <BioView empresa={empresa} bio={bio} preview />
        </div>
      </div>
    </div>
  )

  const formulario = (
    <div style={{ flex: 1, minWidth: 0, maxWidth: '640px' }}>

      {/* Endereço e publicação da bio */}
      <div style={{ backgroundColor: noAr && slugSalvo ? '#f0fdf4' : '#fffbeb', border: `1px solid ${noAr && slugSalvo ? '#bbf7d0' : '#fde68a'}`, borderRadius: '14px', padding: '14px 16px', marginBottom: '14px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: noAr && slugSalvo ? '#166534' : '#92400e', marginBottom: '8px' }}>Endereço da sua bio</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', color: '#475569' }}>{window.location.host}/</span>
          <input value={slugCampo} maxLength={40} placeholder="nome-da-sua-academia"
            onChange={(e) => setSlugCampo(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            style={{ ...campo, width: 'auto', flex: '1 1 160px', minWidth: '140px', fontWeight: 700, backgroundColor: '#fff' }} />
          {!slugCampo && !slugSalvo && slugificar(empresa.nome_empresa).length >= 3 && (
            <button type="button" onClick={() => setSlugCampo(slugificar(empresa.nome_empresa))}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
              Sugerir
            </button>
          )}
        </div>
        {avisoSlug && !avisoSlug.ok && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#b91c1c' }}>{avisoSlug.erro}</div>
        )}
        {slugSalvo && slugMudou && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>
            Atenção: trocar o endereço faz os links que você já divulgou pararem de funcionar.
          </div>
        )}

        <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.07)', margin: '12px 0 4px' }} />
        <Chave ligado={noAr} onChange={(v) => atualizar({ publicada: v })}>
          <strong>Bio no ar</strong> <span style={{ color: '#6b7280' }}>(qualquer pessoa com o link consegue abrir)</span>
        </Chave>

        {slugSalvo && noAr && !slugMudou && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: '13px', color: '#14532d', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkBio}</div>
            <button type="button" onClick={copiarLink}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #86efac', backgroundColor: '#fff', color: '#166534', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
              <Icon icon={copiado ? 'mdi:check' : 'mdi:content-copy'} width="16" /> {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <a href={linkBio} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #86efac', backgroundColor: '#fff', color: '#166534', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>
              <Icon icon="mdi:open-in-new" width="16" /> Abrir
            </a>
          </div>
        )}
        {slugSalvo && !noAr && (
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>
            Fora do ar: o link ainda não abre. Ligue <strong>Bio no ar</strong> e salve.
          </div>
        )}
        {!slugSalvo && (
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
            Escolha um endereço, ligue <strong>Bio no ar</strong> e clique em <strong>Salvar bio</strong>.
          </div>
        )}
      </div>

      {/* Visual */}
      <Bloco icone="mdi:palette-outline" nome="Visual">
        <span style={titulo}>Foto de capa</span>
        <p style={dica}>A faixa no topo da página, atrás do logo. Foto horizontal, até 3MB.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '22px' }}>
          <label style={{
            width: '168px', height: '70px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, cursor: enviandoCapa ? 'wait' : 'pointer',
            border: cfg.capa ? '1px solid #e5e7eb' : '2px dashed #cbd5e1', backgroundColor: '#f9fafb',
            display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: enviandoCapa ? 0.6 : 1
          }}>
            {cfg.capa
              ? <img src={cfg.capa} alt="Capa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Icon icon={enviandoCapa ? 'eos-icons:loading' : 'mdi:image-plus-outline'} width="26" style={{ color: '#9ca3af' }} />}
            <input type="file" accept="image/*" onChange={enviarCapa} disabled={enviandoCapa} style={{ display: 'none' }} />
          </label>
          <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>
            {cfg.capa ? 'Clique na imagem para trocar' : 'Clique para adicionar a capa'}
            {cfg.capa && (
              <div>
                <button type="button" onClick={() => atualizar({ capa: '' })}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: '12px', textDecoration: 'underline' }}>remover capa</button>
              </div>
            )}
            {'capa' in bio && empresa.foto_capa_url && bio.capa !== empresa.foto_capa_url && (
              <div>
                <button type="button" onClick={() => atualizar({ capa: empresa.foto_capa_url })}
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: '12px', textDecoration: 'underline' }}>usar a capa do site</button>
              </div>
            )}
          </div>
        </div>

        <span style={titulo}>Cores</span>
        <p style={dica}>Escolha uma combinação. O fundo, o botão e o texto já combinam entre si.</p>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '22px' }}>
          {temas.map(t => {
            const ativo = (bio.tema || TEMA_PADRAO) === t.id
            return (
              <button key={t.id} type="button" onClick={() => atualizar({ tema: t.id })} title={t.nome} aria-label={t.nome}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'center' }}>
                <span style={{
                  display: 'block', width: '46px', height: '46px', borderRadius: '50%', position: 'relative',
                  background: `linear-gradient(135deg, ${t.fundo[0]} 0%, ${t.fundo[1]} 100%)`,
                  boxShadow: ativo ? `0 0 0 3px #fff, 0 0 0 5px #111827` : '0 1px 4px rgba(0,0,0,0.25)',
                  transition: 'box-shadow 0.15s'
                }}>
                  <span style={{ position: 'absolute', right: '-2px', bottom: '-2px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: t.destaque, border: '2px solid #fff' }} />
                </span>
                <span style={{ display: 'block', marginTop: '8px', fontSize: '11px', fontWeight: ativo ? 700 : 500, color: ativo ? '#111827' : '#6b7280' }}>{t.nome}</span>
              </button>
            )
          })}
        </div>

        <span style={titulo}>Fonte</span>
        <p style={dica}>Vale para a página toda: nome, frase e botões.</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '22px' }}>
          {FONTES_BIO.map(f => {
            const ativo = (bio.fonte || FONTE_PADRAO) === f.id
            return (
              <button key={f.id} type="button" onClick={() => atualizar({ fonte: f.id })}
                style={{
                  padding: '9px 14px', borderRadius: '10px', cursor: 'pointer', fontFamily: f.stack, fontSize: '16px',
                  border: ativo ? '2px solid #111827' : '1px solid #d1d5db', backgroundColor: ativo ? '#111827' : '#fff', color: ativo ? '#fff' : '#374151'
                }}>
                {f.label}
              </button>
            )
          })}
        </div>

        <span style={titulo}>Frase da bio</span>
        <textarea value={cfg.frase} maxLength={140} rows={2} onChange={(e) => atualizar({ frase: e.target.value })}
          placeholder="Ex.: Aulas de muay thai para todos os níveis"
          style={{ ...campo, resize: 'vertical' }} />
        <div style={{ textAlign: 'right', fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{cfg.frase.length}/140</div>
      </Bloco>

      {/* Botões */}
      <Bloco icone="mdi:gesture-tap-button" nome="Botões">
        {!premium ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 14px', margin: '2px 0 8px', borderRadius: '12px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa' }}>
            <Icon icon="mdi:lock" width="20" style={{ color: '#ea580c', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: '190px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: '#7c2d12' }}>
                Agendar aula
                <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.04em', color: '#fff', backgroundColor: '#ea580c', borderRadius: '5px', padding: '2px 6px' }}>PREMIUM</span>
              </div>
              <div style={{ fontSize: '12px', color: '#9a3412', lineHeight: 1.45, marginTop: '2px' }}>
                O aluno marca a aula experimental direto da sua bio e já cai na sua agenda. Exclusivo do plano Premium.
              </div>
            </div>
            <button type="button" onClick={() => navigate('/app/configuracao?aba=assinatura')}
              style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', backgroundColor: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              Conhecer o Premium
            </button>
          </div>
        ) : empresa.agendamento_ativo && empresa.agendamento_slug ? (
          <Chave ligado={cfg.mostrar.agendar} onChange={(v) => setMostrar('agendar', v)}>Agendar aula</Chave>
        ) : (
          <div style={{ padding: '10px 12px', margin: '2px 0 8px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
            Para mostrar o botão <strong>Agendar aula</strong> na bio, ative o <strong>Agendamento online</strong>.
            {onIrParaAgendamento && <> <button type="button" onClick={onIrParaAgendamento} style={{ background: 'none', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontWeight: 700 }}>Ativar agora</button></>}
          </div>
        )}
        <Chave ligado={cfg.mostrar.whatsapp} onChange={(v) => setMostrar('whatsapp', v)}>
          WhatsApp {empresa.telefone ? '' : <em style={{ color: '#9ca3af' }}>(cadastre o telefone em Dados da Empresa)</em>}
        </Chave>
        <Chave ligado={cfg.mostrar.mapa} onChange={(v) => setMostrar('mapa', v)}>
          Como chegar {empresa.endereco_completo ? '' : <em style={{ color: '#9ca3af' }}>(cadastre o endereço em Dados da Empresa)</em>}
        </Chave>

        <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '12px 0 16px' }} />
        <span style={titulo}>Redes e links</span>
        <p style={dica}>Deixe em branco para esconder o botão.</p>
        <div style={{ display: 'grid', gap: '10px' }}>
          {[
            ['instagram', 'mdi:instagram', 'Instagram', 'instagram.com/suaacademia'],
            ['tiktok', 'ic:baseline-tiktok', 'TikTok', 'tiktok.com/@suaacademia'],
            ['facebook', 'mdi:facebook', 'Facebook', 'facebook.com/suaacademia'],
            ['youtube', 'mdi:youtube', 'YouTube', 'youtube.com/@seucanal'],
            ['site', 'mdi:web', 'Site', 'www.seusite.com.br']
          ].map(([chave, icone, nome, ph]) => (
            <div key={chave} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon icon={icone} width="22" style={{ color: '#374151', flexShrink: 0 }} />
              <input value={cfg.redes[chave]} onChange={(e) => setRede(chave, e.target.value)} placeholder={`${nome}: ${ph}`} style={campo} />
            </div>
          ))}
        </div>

        <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '16px 0' }} />
        <span style={titulo}>Links extras</span>
        <p style={dica}>Ex.: "Grupo do WhatsApp", "Loja", "Tabela de preços". Até {MAX_LINKS}.</p>
        {links.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
            <input value={l.titulo || ''} onChange={(e) => setLink(i, { titulo: e.target.value })} placeholder="Título" maxLength={30} style={{ ...campo, flex: '0 0 36%' }} />
            <input value={l.url || ''} onChange={(e) => setLink(i, { url: e.target.value })} placeholder="https://..." style={campo} />
            <button type="button" onClick={() => atualizar({ links: links.filter((_, k) => k !== i) })} aria-label="Remover link"
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
              <Icon icon="mdi:close" width="20" />
            </button>
          </div>
        ))}
        {links.length < MAX_LINKS && (
          <button type="button" onClick={() => atualizar({ links: [...links, { titulo: '', url: '' }] })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: '1px dashed #9ca3af', backgroundColor: '#fff', color: '#374151', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Icon icon="mdi:plus" width="16" /> Adicionar link
          </button>
        )}
      </Bloco>

      {/* Fotos e vídeos */}
      <Bloco icone="mdi:image-multiple-outline" nome="Fotos e vídeos">
        <p style={dica}>Aparecem num carrossel no fim da página, na ordem abaixo. Até {MAX_MIDIAS} itens. Foto até 3MB, vídeo até 30MB.</p>
        {midias.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            {midias.map((m, i) => {
              const yt = m.tipo === 'youtube' ? youtubeId(m.url) : null
              return (
                <div key={m.url + i} style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: '10px', overflow: 'hidden', backgroundColor: '#111827', border: '1px solid #e5e7eb' }}>
                  {m.tipo === 'foto' && <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {m.tipo === 'video' && <video src={m.url} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {yt && <img src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {m.tipo !== 'foto' && (
                    <span style={{ position: 'absolute', left: '6px', top: '6px', backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: '6px', padding: '2px 6px', fontSize: '10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Icon icon={m.tipo === 'youtube' ? 'mdi:youtube' : 'mdi:play'} width="12" /> {m.tipo === 'youtube' ? 'YouTube' : 'Vídeo'}
                    </span>
                  )}
                  <button type="button" onClick={() => setMidias(midias.filter((_, k) => k !== i))} aria-label="Remover"
                    style={{ position: 'absolute', right: '4px', top: '4px', width: '24px', height: '24px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon icon="mdi:close" width="14" />
                  </button>
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'space-between', padding: '4px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))' }}>
                    <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Mover para trás"
                      style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer', opacity: i === 0 ? 0.3 : 1, padding: 0 }}><Icon icon="mdi:chevron-left" width="22" /></button>
                    <button type="button" disabled={i === midias.length - 1} onClick={() => mover(i, 1)} aria-label="Mover para frente"
                      style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer', opacity: i === midias.length - 1 ? 0.3 : 1, padding: 0 }}><Icon icon="mdi:chevron-right" width="22" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '8px', backgroundColor: '#111827', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.6 : 1 }}>
            <Icon icon={enviando ? 'eos-icons:loading' : 'mdi:upload'} width="16" /> {enviando ? 'Enviando...' : 'Foto ou vídeo'}
            <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={enviarArquivo} disabled={enviando} style={{ display: 'none' }} />
          </label>
          <div style={{ display: 'flex', gap: '6px', flex: 1, minWidth: '220px' }}>
            <input value={youtubeCampo} onChange={(e) => setYoutubeCampo(e.target.value)} placeholder="Ou cole um link do YouTube" style={campo}
              onKeyDown={(e) => { if (e.key === 'Enter') adicionarYoutube() }} />
            <button type="button" onClick={adicionarYoutube}
              style={{ padding: '0 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Adicionar</button>
          </div>
        </div>
      </Bloco>

      {/* Salvar */}
      <div style={{ position: 'sticky', bottom: 0, padding: '12px 0', background: 'linear-gradient(transparent, #f9fafb 30%)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button type="button" onClick={salvar} disabled={salvando || !alterado}
          style={{ padding: '12px 28px', borderRadius: '10px', border: 'none', backgroundColor: alterado ? VERDE : '#d1d5db', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: alterado && !salvando ? 'pointer' : 'default' }}>
          {salvando ? 'Salvando...' : 'Salvar bio'}
        </button>
        {alterado && <span style={{ fontSize: '12px', color: '#b45309' }}>Alterações não salvas</span>}
      </div>
    </div>
  )

  if (mobile) {
    return (
      <div>
        {formulario}
        <button type="button" onClick={() => setPreviewAberto(v => !v)}
          style={{ width: '100%', margin: '4px 0 14px', padding: '12px', borderRadius: '10px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
          {previewAberto ? 'Esconder prévia' : 'Ver como fica'}
        </button>
        {previewAberto && preview}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
      {formulario}
      <div style={{ position: 'sticky', top: '16px', flexShrink: 0, width: '340px' }}>{preview}</div>
    </div>
  )
}
