import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import Plyr from 'plyr'
import 'plyr/dist/plyr.css'
import './Ajuda.css'

// Videos da central de ajuda. videoUrl: null = placeholder "Em breve"
// Aceita link do YouTube (watch?v=, youtu.be/, shorts/) ou URL direta de arquivo .mp4/.webm.

function getYoutubeVideoId(url) {
  if (!url) return null
  const match = url.match(
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  )
  return match ? match[1] : null
}

const PLYR_CONTROLS = [
  'play-large',
  'play',
  'progress',
  'current-time',
  'duration',
  'mute',
  'volume',
  'settings',
  'fullscreen',
]

function VideoPlayer({ videoUrl }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!videoUrl || !containerRef.current) return

    const container = containerRef.current
    container.innerHTML = ''

    const ytId = getYoutubeVideoId(videoUrl)
    let mediaEl

    if (ytId) {
      mediaEl = document.createElement('div')
      mediaEl.setAttribute('data-plyr-provider', 'youtube')
      mediaEl.setAttribute('data-plyr-embed-id', ytId)
    } else {
      mediaEl = document.createElement('video')
      mediaEl.setAttribute('playsinline', '')
      mediaEl.setAttribute('controls', '')
      const source = document.createElement('source')
      source.src = videoUrl
      source.type = 'video/mp4'
      mediaEl.appendChild(source)
    }

    container.appendChild(mediaEl)

    const player = new Plyr(mediaEl, {
      controls: PLYR_CONTROLS,
      settings: ['quality', 'speed'],
      ratio: '16:9',
      autoplay: true,
      quality: {
        default: 1080,
        options: [2160, 1440, 1080, 720, 480, 360, 240],
      },
      youtube: {
        noCookie: true,
        rel: 0,
        showinfo: 0,
        iv_load_policy: 3,
        modestbranding: 1,
      },
    })

    player.on('ready', () => {
      try {
        player.quality = 1080
      } catch (e) {
        // YouTube pode ignorar, sem problemas
      }
      const playPromise = player.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Browser bloqueou autoplay com som, tenta mudo
          player.muted = true
          player.play()
        })
      }
    })

    return () => {
      player.destroy()
    }
  }, [videoUrl])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', maxWidth: '100%' }}
    />
  )
}

const CATEGORIAS = [
  {
    titulo: 'GESTÃO',
    videos: [
      {
        id: 'dashboard',
        titulo: 'Dashboard',
        descricao: 'Visão geral do sistema com métricas, recebimentos e resumo do dia',
        icon: 'material-symbols-light:home-outline-rounded',
        cor: '#3b82f6',
        bg: '#eff6ff',
        videoUrl: null
      },
      {
        id: 'alunos',
        titulo: 'Alunos',
        descricao: 'Cadastrar, editar e gerenciar alunos e mensalidades',
        icon: 'fluent:people-24-regular',
        cor: '#8b5cf6',
        bg: '#f5f3ff',
        videoUrl: 'https://zvlnkkmcytjtridiojxx.supabase.co/storage/v1/object/public/CentralDeAjuda/Cadastro%20-%20edit.mp4'
      },
      {
        id: 'radar',
        titulo: 'Radar de Evasão',
        descricao: 'Identificar alunos em risco de cancelamento antes que saiam',
        icon: 'mdi:shield-alert-outline',
        cor: '#dc2626',
        bg: '#fef2f2',
        videoUrl: null
      },
      {
        id: 'horarios',
        titulo: 'Grade de Horários',
        descricao: 'Organizar turmas, vincular alunos e controlar presença',
        icon: 'fluent:calendar-20-regular',
        cor: '#ec4899',
        bg: '#fdf2f8',
        videoUrl: null
      },
      {
        id: 'financeiro',
        titulo: 'Financeiro',
        descricao: 'Acompanhar mensalidades, cobranças avulsas e recebimentos',
        icon: 'fluent:money-20-regular',
        cor: '#059669',
        bg: '#ecfdf5',
        videoUrl: 'https://zvlnkkmcytjtridiojxx.supabase.co/storage/v1/object/public/CentralDeAjuda/Financeiro%20-%20edit.mp4'
      },
      {
        id: 'despesas',
        titulo: 'Despesas',
        descricao: 'Cadastrar categorias, despesas recorrentes e controle de gastos',
        icon: 'mdi:wallet-outline',
        cor: '#ef4444',
        bg: '#fef2f2',
        videoUrl: 'https://zvlnkkmcytjtridiojxx.supabase.co/storage/v1/object/public/CentralDeAjuda/Despesas%20-%20edit.mp4'
      },
      {
        id: 'relatorios',
        titulo: 'Relatórios',
        descricao: 'Analisar faturamento, inadimplência e desempenho do mês',
        icon: 'fluent:chart-multiple-20-regular',
        cor: '#f59e0b',
        bg: '#fffbeb',
        videoUrl: 'https://zvlnkkmcytjtridiojxx.supabase.co/storage/v1/object/public/CentralDeAjuda/Relatorios%20-%20edit.mp4'
      }
    ]
  },
  {
    titulo: 'COMUNICAÇÃO',
    videos: [
      {
        id: 'whatsapp',
        titulo: 'Conectar WhatsApp',
        descricao: 'Como conectar seu WhatsApp via QR Code ou código de pareamento',
        icon: 'mdi:whatsapp',
        cor: '#10b981',
        bg: '#ecfdf5',
        videoUrl: 'https://zvlnkkmcytjtridiojxx.supabase.co/storage/v1/object/public/CentralDeAjuda/ConectaWhatsapp%20-%20Edit.mp4'
      },
      {
        id: 'templates',
        titulo: 'Templates de Mensagens',
        descricao: 'Personalizar mensagens automáticas de cobrança e lembretes',
        icon: 'fluent:chat-20-regular',
        cor: '#0ea5e9',
        bg: '#eff6ff',
        videoUrl: 'https://zvlnkkmcytjtridiojxx.supabase.co/storage/v1/object/public/CentralDeAjuda/TemplatesMensagem%20-%20edit.mp4'
      },
      {
        id: 'bot',
        titulo: 'Bot & CRM de Leads',
        descricao: 'Atendimento automático via WhatsApp e captura de leads',
        icon: 'fluent:bot-20-regular',
        cor: '#8b5cf6',
        bg: '#f5f3ff',
        videoUrl: null
      },
      {
        id: 'avisos',
        titulo: 'Avisos em Massa',
        descricao: 'Enviar comunicados para grupos de alunos de uma só vez',
        icon: 'fluent:megaphone-20-regular',
        cor: '#f59e0b',
        bg: '#fffbeb',
        videoUrl: null
      }
    ]
  },
  {
    titulo: 'CONFIGURAÇÕES',
    videos: [
      {
        id: 'empresa',
        titulo: 'Dados da Empresa',
        descricao: 'Configurar nome, logo, endereço e chave PIX',
        icon: 'fluent:building-20-regular',
        cor: '#6366f1',
        bg: '#eef2ff',
        videoUrl: null
      },
      {
        id: 'planos',
        titulo: 'Planos e Preços',
        descricao: 'Criar planos mensais, trimestrais, semestrais e por aulas',
        icon: 'fluent:tag-20-regular',
        cor: '#10b981',
        bg: '#ecfdf5',
        videoUrl: null
      },
      {
        id: 'automacoes',
        titulo: 'Automações',
        descricao: 'Configurar lembretes automáticos de cobrança e aulas',
        icon: 'fluent:flash-20-regular',
        cor: '#f59e0b',
        bg: '#fffbeb',
        videoUrl: null
      },
      {
        id: 'agendamento',
        titulo: 'Agendamento Online',
        descricao: 'Link público para alunos marcarem aulas sozinhos',
        icon: 'fluent:calendar-checkmark-20-regular',
        cor: '#0891b2',
        bg: '#ecfeff',
        videoUrl: null
      },
      {
        id: 'anamnese',
        titulo: 'Anamnese',
        descricao: 'Personalizar perguntas de anamnese para os alunos',
        icon: 'fluent:clipboard-text-ltr-20-regular',
        cor: '#7c3aed',
        bg: '#f5f3ff',
        videoUrl: null
      },
      {
        id: 'site',
        titulo: 'Site',
        descricao: 'Criar o site público da sua empresa para captar alunos',
        icon: 'fluent:globe-20-regular',
        cor: '#ec4899',
        bg: '#fdf2f8',
        videoUrl: null
      }
    ]
  }
]

export default function Ajuda() {
  const [videoAberto, setVideoAberto] = useState(null)

  const abrirWhatsApp = () => {
    window.open('https://wa.me/5562981618862?text=Olá! Preciso de ajuda com o Mensalli', '_blank')
  }

  return (
    <div style={{ padding: '24px', flex: 1, width: '100%', backgroundColor: '#ffffff', minHeight: '100vh', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>Central de Ajuda</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666' }}>
            Assista aos tutoriais para aprender a usar cada módulo do sistema
          </p>
        </div>
        <button
          onClick={abrirWhatsApp}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          <Icon icon="mdi:whatsapp" width="18" height="18" />
          Falar com Suporte
        </button>
      </div>

      {/* Categorias */}
      {CATEGORIAS.map((categoria) => (
        <div key={categoria.titulo} style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#9ca3af', letterSpacing: '1px', marginBottom: '12px' }}>
            {categoria.titulo}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px'
          }}>
            {categoria.videos.map((video) => (
              <div
                key={video.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '20px',
                  backgroundColor: 'white',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    backgroundColor: video.bg,
                    color: video.cor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Icon icon={video.icon} width="24" height="24" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#111', marginBottom: '4px' }}>
                      {video.titulo}
                    </div>
                    <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.4' }}>
                      {video.descricao}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setVideoAberto(video)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    backgroundColor: 'white',
                    color: '#111',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    marginTop: 'auto'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <Icon icon="fluent:play-20-regular" width="16" height="16" />
                  Assistir
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Modal de Video */}
      {videoAberto && (
        <div
          onClick={() => setVideoAberto(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '840px',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px'
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {videoAberto.titulo}
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                  {videoAberto.descricao}
                </div>
              </div>
              <button
                onClick={() => setVideoAberto(null)}
                style={{
                  width: '36px',
                  height: '36px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  color: '#6b7280'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Icon icon="mdi:close" width="22" height="22" />
              </button>
            </div>
            <div style={{
              flex: 1,
              backgroundColor: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              aspectRatio: '16 / 9',
              minHeight: '300px'
            }}>
              {videoAberto.videoUrl ? (
                <VideoPlayer videoUrl={videoAberto.videoUrl} />
              ) : (
                <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>
                  <Icon icon="fluent:video-clip-20-regular" width="48" height="48" />
                  <div style={{ fontSize: '15px', fontWeight: '600', marginTop: '12px', color: '#d1d5db' }}>
                    Vídeo em breve
                  </div>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>
                    Esse tutorial ainda está sendo gravado
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
