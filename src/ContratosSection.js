import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import whatsappService from './services/whatsappService'
import { useUserPlan } from './hooks/useUserPlan'

function formatarValor(valor) {
  if (valor == null) return ''
  const n = typeof valor === 'string' ? parseFloat(valor) : valor
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0)
}

function formatarData(iso) {
  if (!iso) return ''
  const [ano, mes, dia] = iso.split('T')[0].split('-')
  return `${dia}/${mes}/${ano}`
}

function substituirVariaveis(conteudo, devedor, nomeEmpresa) {
  return conteudo
    .replaceAll('{{nomeCliente}}', devedor?.nome || '')
    .replaceAll('{{cpfCliente}}', devedor?.cpf || '')
    .replaceAll('{{telefoneCliente}}', devedor?.telefone || '')
    .replaceAll('{{emailCliente}}', devedor?.email || '')
    .replaceAll('{{dataNascimento}}', formatarData(devedor?.data_nascimento))
    .replaceAll('{{nomeResponsavel}}', devedor?.responsavel_nome || '')
    .replaceAll('{{telefoneResponsavel}}', devedor?.responsavel_telefone || '')
    .replaceAll('{{nomePlano}}', devedor?.planos?.nome || devedor?.plano_nome || '')
    .replaceAll('{{valorPlano}}', formatarValor(devedor?.planos?.valor || devedor?.plano_valor))
    .replaceAll('{{nomeEmpresa}}', nomeEmpresa || '')
    .replaceAll('{{dataAtual}}', new Date().toLocaleDateString('pt-BR'))
}

export default function ContratosSection({ clienteId, devedor, userId, nomeEmpresa }) {
  const { isLocked } = useUserPlan()
  const locked = isLocked('pro')

  const [contratos, setContratos] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  const [mostrarModal, setMostrarModal] = useState(false)
  const [templateSelecionado, setTemplateSelecionado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mostrarContratos, setMostrarContratos] = useState(true)

  const carregar = useCallback(async () => {
    if (!clienteId || !userId) return
    setLoading(true)
    const [contratosRes, templatesRes] = await Promise.all([
      supabase
        .from('contratos_enviados')
        .select('*')
        .eq('devedor_id', clienteId)
        .order('created_at', { ascending: false }),
      supabase
        .from('contratos_templates')
        .select('id, titulo, conteudo')
        .eq('user_id', userId)
        .eq('ativo', true)
        .order('titulo')
    ])
    setContratos(contratosRes.data || [])
    setTemplates(templatesRes.data || [])
    setLoading(false)
  }, [clienteId, userId])

  useEffect(() => { carregar() }, [carregar])

  const enviarContrato = async () => {
    if (!templateSelecionado) {
      showToast('Selecione um template', 'warning')
      return
    }
    const template = templates.find(t => t.id === templateSelecionado)
    if (!template) return

    setEnviando(true)
    try {
      const { data: tokenData, error: errToken } = await supabase.rpc('gerar_token_contrato')
      if (errToken) throw new Error('Erro ao gerar token: ' + errToken.message)

      const token = tokenData
      const conteudoInterpolado = substituirVariaveis(template.conteudo, devedor, nomeEmpresa)

      const { error: errInsert } = await supabase.from('contratos_enviados').insert({
        user_id: userId,
        devedor_id: clienteId,
        template_id: template.id,
        titulo: template.titulo,
        conteudo: conteudoInterpolado,
        link_token: token,
        status: 'enviado'
      })
      if (errInsert) throw new Error('Erro ao registrar contrato: ' + errInsert.message)

      const link = `${window.location.origin}/contrato/${token}`
      const telefone = devedor?.responsavel_telefone || devedor?.telefone
      const primeiroNome = (devedor?.nome || '').split(' ')[0] || 'Aluno'
      const mensagem = `Olá, ${primeiroNome}! 👋\n\n*${nomeEmpresa}* te enviou um contrato pra assinatura.\n\n📄 ${template.titulo}\n\nAbra o link abaixo, leia com atenção e assine:\n${link}\n\nQualquer dúvida, estamos à disposição.`

      const resultado = await whatsappService.enviarMensagem(telefone, mensagem)
      if (resultado.sucesso) {
        showToast('Contrato enviado pelo WhatsApp!', 'success')
      } else {
        showToast('Contrato registrado, mas WhatsApp falhou: ' + (resultado.erro || 'desconhecido'), 'warning')
      }

      setMostrarModal(false)
      setTemplateSelecionado('')
      await carregar()
    } catch (err) {
      showToast(err.message || 'Erro ao enviar contrato', 'error')
    } finally {
      setEnviando(false)
    }
  }

  const copiarLink = (token) => {
    const link = `${window.location.origin}/contrato/${token}`
    navigator.clipboard.writeText(link)
    showToast('Link copiado!', 'success')
  }

  const reenviarWhatsApp = async (contrato) => {
    const link = `${window.location.origin}/contrato/${contrato.link_token}`
    const telefone = devedor?.responsavel_telefone || devedor?.telefone
    const primeiroNome = (devedor?.nome || '').split(' ')[0] || 'Aluno'
    const mensagem = `Olá, ${primeiroNome}! 👋\n\nLembrete do contrato pendente de assinatura:\n\n📄 ${contrato.titulo}\n\n${link}`
    const resultado = await whatsappService.enviarMensagem(telefone, mensagem)
    if (resultado.sucesso) showToast('Lembrete enviado!', 'success')
    else showToast('Erro: ' + (resultado.erro || 'falha no envio'), 'warning')
  }

  if (locked) return null

  return (
    <div style={{
      backgroundColor: '#f8f9fa',
      borderRadius: '10px',
      padding: '16px',
      border: '1px solid #e9ecef',
      marginBottom: '16px'
    }}>
      <div
        onClick={() => setMostrarContratos(!mostrarContratos)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          gap: '8px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="mdi:file-document-outline" width="20" style={{ color: '#344848' }} />
          <span style={{ fontSize: '15px', fontWeight: '600', color: '#344848' }}>
            Contratos
          </span>
          {contratos.length > 0 && (
            <span style={{
              fontSize: '12px',
              fontWeight: '600',
              backgroundColor: '#e0e7ff',
              color: '#4f46e5',
              padding: '2px 8px',
              borderRadius: '10px'
            }}>
              {contratos.length} {contratos.length === 1 ? 'contrato' : 'contratos'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (templates.length === 0) {
                showToast('Crie um template em Configuração → Contratos primeiro', 'warning')
                return
              }
              setMostrarModal(true)
            }}
            style={{
              padding: '6px 12px', backgroundColor: '#4f46e5', color: 'white',
              border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
            }}
          >
            <Icon icon="mdi:plus" width="14" /> Enviar contrato
          </button>
          <Icon icon={mostrarContratos ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="20" color="#888" />
        </div>
      </div>

      {mostrarContratos && (
        <div style={{ marginTop: '16px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#999', padding: '12px', fontSize: '13px' }}>Carregando...</p>
          ) : contratos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: '#9ca3af' }}>
              <Icon icon="mdi:file-document-outline" width="32" style={{ opacity: 0.5 }} />
              <p style={{ margin: '8px 0 0', fontSize: '13px' }}>Nenhum contrato enviado ainda</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {contratos.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb', borderRadius: '8px'
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '6px',
                backgroundColor: c.status === 'assinado' ? '#dcfce7' : '#fef3c7',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Icon
                  icon={c.status === 'assinado' ? 'mdi:file-check' : 'mdi:file-clock-outline'}
                  width="18"
                  style={{ color: c.status === 'assinado' ? '#16a34a' : '#b45309' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {c.titulo}
                  <span style={{
                    fontSize: '10px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px',
                    color: c.status === 'assinado' ? '#166534' : '#92400e',
                    backgroundColor: c.status === 'assinado' ? '#bbf7d0' : '#fde68a'
                  }}>
                    {c.status === 'assinado' ? 'ASSINADO' : 'PENDENTE'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                  Enviado em {formatarData(c.created_at)}
                  {c.status === 'assinado' && ` · Assinado por ${c.assinatura_nome} em ${formatarData(c.assinado_em)}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button
                  onClick={() => window.open(`/contrato/${c.link_token}`, '_blank')}
                  title="Ver contrato"
                  style={{ padding: '6px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }}
                >
                  <Icon icon="mdi:eye-outline" width="14" style={{ color: '#4b5563' }} />
                </button>
                <button
                  onClick={() => copiarLink(c.link_token)}
                  title="Copiar link"
                  style={{ padding: '6px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }}
                >
                  <Icon icon="mdi:link-variant" width="14" style={{ color: '#4b5563' }} />
                </button>
                {c.status === 'enviado' && (
                  <button
                    onClick={() => reenviarWhatsApp(c)}
                    title="Reenviar por WhatsApp"
                    style={{ padding: '6px', backgroundColor: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    <Icon icon="mdi:whatsapp" width="14" style={{ color: '#16a34a' }} />
                  </button>
                )}
              </div>
            </div>
          ))}
            </div>
          )}
        </div>
      )}

      {mostrarModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '100%', maxWidth: '460px', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700' }}>Enviar contrato</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                Será enviado ao WhatsApp de {devedor?.nome?.split(' ')[0] || 'aluno'} com o link pra assinar.
              </p>
            </div>
            <div style={{ padding: '18px 20px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
                Template
              </label>
              <select
                value={templateSelecionado}
                onChange={(e) => setTemplateSelecionado(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', backgroundColor: 'white' }}
              >
                <option value="">Selecione um template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.titulo}</option>
                ))}
              </select>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setMostrarModal(false)}
                disabled={enviando}
                style={{ padding: '10px 16px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: enviando ? 'not-allowed' : 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={enviarContrato}
                disabled={enviando || !templateSelecionado}
                style={{ padding: '10px 20px', backgroundColor: (enviando || !templateSelecionado) ? '#9ca3af' : '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: (enviando || !templateSelecionado) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {enviando ? <><Icon icon="eos-icons:loading" width="16" /> Enviando...</> : <><Icon icon="mdi:whatsapp" width="16" /> Enviar</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
