import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import useWindowSize from './hooks/useWindowSize'

export default function Avisos() {
  const { isMobile } = useWindowSize()
  const [avisos, setAvisos] = useState([])
  const TIPOS = {
    aviso: { label: 'Aviso', cor: '#f59e0b', icon: 'fluent:warning-20-filled', bg: '#fefce8' },
    evento: { label: 'Evento', cor: '#8b5cf6', icon: 'fluent:calendar-star-20-filled', bg: '#f5f3ff' },
    novidade: { label: 'Novidade', cor: '#22c55e', icon: 'fluent:sparkle-20-filled', bg: '#f0fdf4' },
    promocao: { label: 'Promoção', cor: '#ef4444', icon: 'fluent:tag-20-filled', bg: '#fef2f2' },
    geral: { label: 'Geral', cor: '#3b82f6', icon: 'fluent:chat-20-filled', bg: '#eff6ff' }
  }
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [tipo, setTipo] = useState('geral')
  const [fixado, setFixado] = useState(false)
  const [imagemUrl, setImagemUrl] = useState('')
  const [imagemFile, setImagemFile] = useState(null)
  const [imagemPreview, setImagemPreview] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { carregarAvisos() }, [])

  const carregarAvisos = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('avisos')
      .select('*')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .order('fixado', { ascending: false })
      .order('created_at', { ascending: false })
    setAvisos(data || [])
    setLoading(false)
  }

  const abrirModal = (aviso = null) => {
    if (aviso) {
      setEditando(aviso)
      setTitulo(aviso.titulo)
      setConteudo(aviso.conteudo || '')
      setTipo(aviso.tipo || 'geral')
      setFixado(aviso.fixado || false)
      setImagemUrl(aviso.imagem_url || '')
      setImagemPreview(aviso.imagem_url || null)
    } else {
      setEditando(null)
      setTitulo('')
      setConteudo('')
      setTipo('geral')
      setFixado(false)
      setImagemUrl('')
      setImagemPreview(null)
    }
    setImagemFile(null)
    setModalAberto(true)
  }

  const handleImagemChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      mostrarToast('Imagem muito grande (max 5MB)')
      return
    }
    setImagemFile(file)
    setImagemPreview(URL.createObjectURL(file))
  }

  const uploadImagem = async (userId) => {
    if (!imagemFile) return imagemUrl || null
    const ext = imagemFile.name.split('.').pop()
    const path = `${userId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('avisos').upload(path, imagemFile)
    if (error) { console.error(error); return null }
    const { data } = supabase.storage.from('avisos').getPublicUrl(path)
    return data.publicUrl
  }

  const salvar = async () => {
    if (!titulo.trim()) return
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const imgUrl = await uploadImagem(user.id)

    if (editando) {
      await supabase.from('avisos').update({
        titulo: titulo.trim(),
        conteudo: conteudo.trim(),
        tipo,
        fixado,
        imagem_url: imgUrl,
        updated_at: new Date().toISOString()
      }).eq('id', editando.id)
      mostrarToast('Aviso atualizado!')
    } else {
      await supabase.from('avisos').insert({
        user_id: user.id,
        titulo: titulo.trim(),
        conteudo: conteudo.trim(),
        tipo,
        fixado,
        imagem_url: imgUrl
      })
      mostrarToast('Aviso publicado!')
    }

    setSalvando(false)
    setModalAberto(false)
    carregarAvisos()
  }

  const excluir = async (id) => {
    if (!window.confirm('Excluir este aviso?')) return
    await supabase.from('avisos').update({ ativo: false }).eq('id', id)
    mostrarToast('Aviso excluído')
    carregarAvisos()
  }

  const toggleFixar = async (aviso) => {
    await supabase.from('avisos').update({ fixado: !aviso.fixado }).eq('id', aviso.id)
    carregarAvisos()
  }

  const mostrarToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const formatarData = (data) => {
    const d = new Date(data)
    const agora = new Date()
    const diff = Math.floor((agora - d) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Hoje'
    if (diff === 1) return 'Ontem'
    if (diff < 7) return `${diff} dias atrás`
    return d.toLocaleDateString('pt-BR')
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', color: '#1a1a1a' }}>Mural de Avisos</h2>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#888' }}>
            {avisos.length} aviso{avisos.length !== 1 ? 's' : ''} publicado{avisos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => abrirModal()}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', backgroundColor: '#1a1a1a', color: 'white',
            border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          <Icon icon="fluent:add-20-filled" width="18" />
          Novo Aviso
        </button>
      </div>

      {/* Info */}
      <div style={{
        padding: '12px 16px', backgroundColor: '#f0f9ff', borderRadius: '10px',
        marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px',
        fontSize: '13px', color: '#0369a1', border: '1px solid #bae6fd'
      }}>
        <Icon icon="fluent:info-20-regular" width="18" />
        Os avisos publicados aqui aparecem no portal dos seus alunos.
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Carregando...</div>
      ) : avisos.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', backgroundColor: '#fafafa',
          borderRadius: '12px', border: '2px dashed #e0e0e0'
        }}>
          <Icon icon="fluent:megaphone-20-regular" width="48" style={{ color: '#ccc', marginBottom: '12px' }} />
          <p style={{ fontSize: '16px', fontWeight: '600', color: '#666', margin: '0 0 4px' }}>Nenhum aviso publicado</p>
          <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>Crie seu primeiro aviso para os alunos verem no portal</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {avisos.map(aviso => (
            <div key={aviso.id} style={{
              padding: '16px 20px', backgroundColor: 'white', borderRadius: '12px',
              border: aviso.fixado ? '2px solid #f59e0b' : '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              position: 'relative'
            }}>
              {aviso.fixado && (
                <div style={{
                  position: 'absolute', top: '-8px', right: '12px',
                  backgroundColor: '#f59e0b', color: 'white', fontSize: '11px',
                  padding: '2px 8px', borderRadius: '4px', fontWeight: '600'
                }}>
                  Fixado
                </div>
              )}
              {aviso.imagem_url && (
                <img src={aviso.imagem_url} alt="" style={{
                  width: '100%', maxHeight: '200px', objectFit: 'cover',
                  borderRadius: '8px', marginBottom: '12px'
                }} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    {aviso.tipo && TIPOS[aviso.tipo] && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700',
                        backgroundColor: TIPOS[aviso.tipo].bg, color: TIPOS[aviso.tipo].cor
                      }}>
                        <Icon icon={TIPOS[aviso.tipo].icon} width="12" />
                        {TIPOS[aviso.tipo].label}
                      </span>
                    )}
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontSize: '16px', color: '#1a1a1a' }}>{aviso.titulo}</h3>
                  {aviso.conteudo && (
                    <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#555', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                      {aviso.conteudo}
                    </p>
                  )}
                  <span style={{ fontSize: '12px', color: '#999' }}>{formatarData(aviso.created_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginLeft: '12px' }}>
                  <button
                    onClick={() => toggleFixar(aviso)}
                    title={aviso.fixado ? 'Desafixar' : 'Fixar'}
                    style={{
                      width: '32px', height: '32px', border: 'none', borderRadius: '8px',
                      backgroundColor: aviso.fixado ? '#fef3c7' : '#f5f5f5', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: aviso.fixado ? '#d97706' : '#999'
                    }}
                  >
                    <Icon icon="fluent:pin-20-filled" width="16" />
                  </button>
                  <button
                    onClick={() => abrirModal(aviso)}
                    title="Editar"
                    style={{
                      width: '32px', height: '32px', border: 'none', borderRadius: '8px',
                      backgroundColor: '#f5f5f5', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666'
                    }}
                  >
                    <Icon icon="fluent:edit-20-regular" width="16" />
                  </button>
                  <button
                    onClick={() => excluir(aviso.id)}
                    title="Excluir"
                    style={{
                      width: '32px', height: '32px', border: 'none', borderRadius: '8px',
                      backgroundColor: '#fef2f2', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444'
                    }}
                  >
                    <Icon icon="fluent:delete-20-regular" width="16" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar/Editar */}
      {modalAberto && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
        }} onClick={() => setModalAberto(false)}>
          <div style={{
            backgroundColor: 'white', borderRadius: '16px', padding: '24px',
            width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>{editando ? 'Editar Aviso' : 'Novo Aviso'}</h3>
              <button onClick={() => setModalAberto(false)} style={{
                border: 'none', background: 'none', cursor: 'pointer', padding: '4px'
              }}>
                <Icon icon="fluent:dismiss-20-regular" width="22" color="#666" />
              </button>
            </div>

            {/* Tipo do aviso */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>
                Tipo
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {Object.entries(TIPOS).map(([key, t]) => (
                  <button
                    key={key}
                    onClick={() => setTipo(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
                      border: tipo === key ? `2px solid ${t.cor}` : '2px solid transparent',
                      backgroundColor: tipo === key ? t.bg : '#f5f5f5',
                      color: tipo === key ? t.cor : '#888',
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                  >
                    <Icon icon={t.icon} width="16" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>
                Titulo *
              </label>
              <input
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Ex: Aula cancelada amanhã"
                style={{
                  width: '100%', padding: '10px 14px', border: '1px solid #ddd',
                  borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>
                Conteudo (opcional)
              </label>
              <textarea
                value={conteudo}
                onChange={e => setConteudo(e.target.value)}
                placeholder="Descreva o aviso com mais detalhes..."
                rows={4}
                style={{
                  width: '100%', padding: '10px 14px', border: '1px solid #ddd',
                  borderRadius: '8px', fontSize: '16px', resize: 'vertical',
                  fontFamily: 'inherit', boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Upload de imagem */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>
                Imagem (opcional)
              </label>
              {imagemPreview ? (
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <img src={imagemPreview} alt="Preview" style={{
                    width: '100%', maxHeight: '200px', objectFit: 'cover',
                    borderRadius: '8px', border: '1px solid #e5e7eb'
                  }} />
                  <button onClick={() => { setImagemFile(null); setImagemPreview(null); setImagemUrl('') }} style={{
                    position: 'absolute', top: '8px', right: '8px',
                    width: '28px', height: '28px', borderRadius: '50%',
                    backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Icon icon="fluent:dismiss-16-filled" width="14" color="white" />
                  </button>
                </div>
              ) : (
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                  padding: '20px', border: '2px dashed #ddd', borderRadius: '8px',
                  cursor: 'pointer', color: '#999', fontSize: '13px',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#999'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#ddd'}
                >
                  <Icon icon="fluent:image-add-20-regular" width="28" />
                  Clique para adicionar uma imagem
                  <input type="file" accept="image/*" onChange={handleImagemChange} style={{ display: 'none' }} />
                </label>
              )}
            </div>

            <label style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px',
              padding: '10px 14px', backgroundColor: '#fefce8', borderRadius: '8px',
              cursor: 'pointer', border: '1px solid #fde68a'
            }}>
              <input
                type="checkbox"
                checked={fixado}
                onChange={e => setFixado(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
              />
              <div>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#92400e' }}>Fixar no topo</span>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#a16207' }}>Avisos fixados aparecem primeiro no portal</p>
              </div>
            </label>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModalAberto(false)}
                style={{
                  padding: '10px 20px', border: '1px solid #ddd', borderRadius: '8px',
                  backgroundColor: 'white', fontSize: '14px', cursor: 'pointer', color: '#333'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={!titulo.trim() || salvando}
                style={{
                  padding: '10px 24px', border: 'none', borderRadius: '8px',
                  backgroundColor: titulo.trim() ? '#1a1a1a' : '#e5e7eb',
                  color: titulo.trim() ? 'white' : '#999',
                  fontSize: '14px', fontWeight: '600',
                  cursor: titulo.trim() ? 'pointer' : 'default',
                  opacity: salvando ? 0.7 : 1
                }}
              >
                {salvando ? 'Publicando...' : editando ? 'Salvar' : 'Publicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#1a1a1a', color: 'white', padding: '12px 24px',
          borderRadius: '10px', fontSize: '14px', fontWeight: '500', zIndex: 2000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
