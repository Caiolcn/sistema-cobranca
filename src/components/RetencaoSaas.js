import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useUser } from '../contexts/UserContext'
import { Icon } from '@iconify/react'

// Cores e ícones por bucket
const BUCKETS = {
  retencao_d: { label: 'Onboarding', icon: 'mdi:account-plus', cor: '#3b82f6', bg: '#eff6ff' },
  retencao_a: { label: 'Trial acabando', icon: 'mdi:clock-alert', cor: '#f59e0b', bg: '#fffbeb' },
  retencao_b: { label: 'Trial expirado', icon: 'mdi:account-alert', cor: '#ef4444', bg: '#fef2f2' },
  retencao_e: { label: 'Vence em breve', icon: 'mdi:calendar-clock', cor: '#f97316', bg: '#fff7ed' },
  retencao_c1: { label: 'Ex-pagante', icon: 'mdi:account-reactivate', cor: '#7c3aed', bg: '#f5f3ff' },
  retencao_c2: { label: 'Trial antigo', icon: 'mdi:history', cor: '#6b7280', bg: '#f3f4f6' }
}

export default function RetencaoSaas() {
  const { userId, isAdmin } = useUser()
  const [candidatos, setCandidatos] = useState([])
  const [templates, setTemplates] = useState({})
  const [loading, setLoading] = useState(true)
  const [bucketFiltro, setBucketFiltro] = useState('todos')
  const [templatesModal, setTemplatesModal] = useState(false)
  const [templatesEditando, setTemplatesEditando] = useState({})
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [candResult, tmplResult] = await Promise.all([
        supabase
          .from('vw_mensalli_retencao_saas')
          .select('*')
          .order('data_cadastro', { ascending: false }),
        supabase
          .from('templates_admin')
          .select('*')
          .in('tipo', ['retencao_a', 'retencao_b', 'retencao_d', 'retencao_c1', 'retencao_c2', 'retencao_e'])
      ])

      setCandidatos(candResult.data || [])

      const tmplMap = {}
      ;(tmplResult.data || []).forEach(t => { tmplMap[t.tipo] = t })
      setTemplates(tmplMap)
    } catch (err) {
      console.error('Erro ao carregar retenção SaaS:', err)
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => { carregar() }, [carregar])

  // Substitui variáveis no template
  const montarMensagem = (tipo, candidato) => {
    const tmpl = templates[tipo]
    if (!tmpl) return ''
    const primeiroNome = (candidato.nome_completo || 'Cliente').split(' ')[0]
    return tmpl.mensagem
      .replace(/\{\{nome\}\}/g, primeiroNome)
      .replace(/\{\{nomeCompleto\}\}/g, candidato.nome_completo || 'Cliente')
      .replace(/\{\{email\}\}/g, candidato.email || '')
  }

  // Abre WhatsApp com mensagem pré-pronta
  const abrirWhatsApp = (candidato) => {
    const telefone = String(candidato.telefone || '').replace(/\D/g, '')
    const telComDDI = telefone.startsWith('55') ? telefone : `55${telefone}`
    const msg = montarMensagem(candidato.bucket, candidato)
    const url = `https://wa.me/${telComDDI}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank', 'noopener')
  }

  // Marca envio como feito (grava log + atualiza flag)
  const marcarEnviado = async (candidato) => {
    try {
      const mensagem = montarMensagem(candidato.bucket, candidato)

      // 1. Grava log
      await supabase
        .from('retencao_saas_envios')
        .insert({
          usuario_id: candidato.usuario_id,
          tipo: candidato.bucket,
          mensagem,
          canal: 'whatsapp',
          status: 'enviado',
          enviado_por: userId
        })

      // 2. Atualiza flag no usuário
      const colunaFlag = {
        retencao_a: 'retencao_a_enviado_em',
        retencao_b: 'retencao_b_enviado_em',
        retencao_d: 'retencao_d_enviado_em',
        retencao_c1: 'retencao_c1_enviado_em',
        retencao_c2: 'retencao_c2_enviado_em',
        retencao_e: 'retencao_e_enviado_em'
      }[candidato.bucket]

      if (colunaFlag) {
        await supabase
          .from('usuarios')
          .update({ [colunaFlag]: new Date().toISOString() })
          .eq('id', candidato.usuario_id)
      }

      // 3. Recarrega lista
      await carregar()
    } catch (err) {
      alert('Erro ao marcar como enviado: ' + err.message)
    }
  }

  // Abrir modal de edição de templates
  const abrirTemplates = () => {
    setTemplatesEditando({
      retencao_d: templates.retencao_d?.mensagem || '',
      retencao_a: templates.retencao_a?.mensagem || '',
      retencao_b: templates.retencao_b?.mensagem || '',
      retencao_e: templates.retencao_e?.mensagem || '',
      retencao_c1: templates.retencao_c1?.mensagem || '',
      retencao_c2: templates.retencao_c2?.mensagem || ''
    })
    setTemplatesModal(true)
  }

  const salvarTemplates = async () => {
    setSalvando(true)
    try {
      for (const tipo of Object.keys(templatesEditando)) {
        await supabase
          .from('templates_admin')
          .update({
            mensagem: templatesEditando[tipo],
            updated_at: new Date().toISOString()
          })
          .eq('tipo', tipo)
      }
      await carregar()
      setTemplatesModal(false)
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  // ============================================================
  // Render
  // ============================================================
  if (!isAdmin) return null

  const candidatosFiltrados = (bucketFiltro === 'todos'
    ? [...candidatos]
    : candidatos.filter(c => c.bucket === bucketFiltro)
  ).sort((a, b) => {
    // No bucket "Vence em breve", ordena pelos que vencem antes
    if (a.bucket === 'retencao_e' && b.bucket === 'retencao_e') {
      return (a.dias_para_plano_vencer ?? 999) - (b.dias_para_plano_vencer ?? 999)
    }
    return 0
  })

  const contadores = {
    todos: candidatos.length,
    retencao_d: candidatos.filter(c => c.bucket === 'retencao_d').length,
    retencao_a: candidatos.filter(c => c.bucket === 'retencao_a').length,
    retencao_b: candidatos.filter(c => c.bucket === 'retencao_b').length,
    retencao_e: candidatos.filter(c => c.bucket === 'retencao_e').length,
    retencao_c1: candidatos.filter(c => c.bucket === 'retencao_c1').length,
    retencao_c2: candidatos.filter(c => c.bucket === 'retencao_c2').length
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="mdi:account-reactivate" width="22" style={{ color: '#7c3aed' }} />
            Retenção SaaS
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666' }}>
            Clientes do Mensalli que precisam de um toque de retenção
          </p>
        </div>
        <button
          onClick={abrirTemplates}
          style={{
            padding: '8px 14px',
            backgroundColor: 'white',
            color: '#7c3aed',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Icon icon="mdi:pencil-outline" width="16" /> Editar mensagens
        </button>
      </div>

      {/* Filtros */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {[
          { id: 'todos', label: 'Todos', cor: '#6b7280', bg: '#f3f4f6' },
          { id: 'retencao_d', label: 'Onboarding', cor: '#3b82f6', bg: '#eff6ff' },
          { id: 'retencao_a', label: 'Trial acabando', cor: '#f59e0b', bg: '#fffbeb' },
          { id: 'retencao_b', label: 'Trial expirado', cor: '#ef4444', bg: '#fef2f2' },
          { id: 'retencao_e', label: 'Vence em breve', cor: '#f97316', bg: '#fff7ed' },
          { id: 'retencao_c1', label: 'Ex-pagante', cor: '#7c3aed', bg: '#f5f3ff' },
          { id: 'retencao_c2', label: 'Trial antigo', cor: '#6b7280', bg: '#f3f4f6' }
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setBucketFiltro(f.id)}
            style={{
              padding: '8px 14px',
              backgroundColor: bucketFiltro === f.id ? f.cor : f.bg,
              color: bucketFiltro === f.id ? 'white' : f.cor,
              border: `1px solid ${bucketFiltro === f.id ? f.cor : 'transparent'}`,
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {f.label}
            <span style={{
              backgroundColor: bucketFiltro === f.id ? 'rgba(255,255,255,0.25)' : 'white',
              padding: '1px 7px',
              borderRadius: '10px',
              fontSize: '11px',
              fontWeight: '700'
            }}>
              {contadores[f.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
      ) : candidatosFiltrados.length === 0 ? (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
          <Icon icon="mdi:account-check" width="40" style={{ color: '#d1d5db' }} />
          <p style={{ margin: '12px 0 4px', fontSize: '14px', color: '#666' }}>Nenhum cliente precisando de toque agora 🎉</p>
          <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>
            A lista é atualizada conforme clientes novos entram nos critérios
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {candidatosFiltrados.map(c => {
            const bucketInfo = BUCKETS[c.bucket] || { label: c.bucket, icon: 'mdi:account', cor: '#6b7280', bg: '#f3f4f6' }
            const msgPreview = montarMensagem(c.bucket, c).slice(0, 140)
            const dataCad = new Date(c.data_cadastro).toLocaleDateString('pt-BR')

            return (
              <div
                key={`${c.usuario_id}_${c.bucket}`}
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}
              >
                {/* Badge do bucket */}
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  backgroundColor: bucketInfo.bg,
                  color: bucketInfo.cor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Icon icon={bucketInfo.icon} width="22" />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>
                      {c.nome_completo || 'Sem nome'}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '600',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: bucketInfo.bg,
                      color: bucketInfo.cor
                    }}>
                      {bucketInfo.label.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                    📧 {c.email} · 📱 {c.telefone} · 📅 cadastro {dataCad}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', lineHeight: '1.4' }}>
                    "{msgPreview}{msgPreview.length >= 140 ? '...' : ''}"
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                  <button
                    onClick={() => abrirWhatsApp(c)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#25d366',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    title="Abre o WhatsApp com a mensagem já pronta"
                  >
                    <Icon icon="mdi:whatsapp" width="14" /> Abrir WhatsApp
                  </button>
                  <button
                    onClick={() => marcarEnviado(c)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'white',
                      color: '#7c3aed',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    title="Marca como enviado e tira da lista"
                  >
                    <Icon icon="mdi:check" width="14" /> Marcar enviado
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de edição de templates */}
      {templatesModal && (
        <div
          onClick={() => setTemplatesModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '720px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 48px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Editar mensagens</h3>
              <button onClick={() => setTemplatesModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Icon icon="mdi:close" width="22" style={{ color: '#666' }} />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
                Use <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{'{{nome}}'}</code>, <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{'{{email}}'}</code> como variáveis.
              </p>

              {[
                { tipo: 'retencao_d', label: '👋 Onboarding - Não logou há 1 dia' },
                { tipo: 'retencao_a', label: '⏰ Trial acabando (1 dia antes)' },
                { tipo: 'retencao_b', label: '💛 Trial expirou ontem' },
                { tipo: 'retencao_e', label: '📅 Vence em breve (3 dias antes do plano vencer)' },
                { tipo: 'retencao_c1', label: '💜 Reativação - Ex-pagante sumido (7-90 dias)' },
                { tipo: 'retencao_c2', label: '🕰️ Reativação - Trial antigo, nunca pagou (7-90 dias)' }
              ].map(({ tipo, label }) => (
                <div key={tipo} style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#344848', marginBottom: '6px' }}>
                    {label}
                  </label>
                  <textarea
                    value={templatesEditando[tipo] || ''}
                    onChange={(e) => setTemplatesEditando({ ...templatesEditando, [tipo]: e.target.value })}
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: '#fafafa' }}>
              <button onClick={() => setTemplatesModal(false)} style={{ padding: '10px 18px', backgroundColor: 'white', color: '#666', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={salvarTemplates} disabled={salvando} style={{ padding: '10px 24px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.6 : 1 }}>
                {salvando ? 'Salvando...' : 'Salvar mensagens'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
