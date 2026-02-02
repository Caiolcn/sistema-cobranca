import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { QRCodeSVG } from 'qrcode.react'
import { gerarPixCopiaCola, gerarTxId } from '../services/pixService'
import { baixarRecibo } from '../utils/pdfGenerator'

const FUNCTIONS_URL = 'https://zvlnkkmcytjtridiojxx.supabase.co/functions/v1'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2bG5ra21jeXRqdHJpZGlvanh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5OTMxMDQsImV4cCI6MjA4MTU2OTEwNH0.LkZZaIGVmqkdh0tFfNIVgQKzwCntuoFcRasqdahUzzA'

export default function PortalCliente() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [dados, setDados] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [pixData, setPixData] = useState(null)
  const [pixCopied, setPixCopied] = useState(false)
  const [pagandoId, setPagandoId] = useState(null)
  const [mostrarPagos, setMostrarPagos] = useState(false)

  useEffect(() => {
    if (token) carregarDados()
  }, [token])

  const carregarDados = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${FUNCTIONS_URL}/portal-dados?token=${token}`, {
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`
        }
      })
      const json = await res.json()

      if (!res.ok || json.error) {
        setErro(json.error || 'Erro ao carregar portal')
        setLoading(false)
        return
      }

      setDados(json)
      setLoading(false)
    } catch (error) {
      console.error('Erro:', error)
      setErro('Erro ao carregar dados. Tente novamente.')
      setLoading(false)
    }
  }

  const handlePagar = async (mensalidade) => {
    if (expandedId === mensalidade.id) {
      setExpandedId(null)
      setPixData(null)
      setPixCopied(false)
      return
    }

    if (dados.asaas_configurado && dados.metodo_pagamento === 'asaas_link') {
      setPagandoId(mensalidade.id)
      setExpandedId(mensalidade.id)
      setPixData(null)
      try {
        const res = await fetch(`${FUNCTIONS_URL}/portal-pagar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`
          },
          body: JSON.stringify({ token, mensalidade_id: mensalidade.id })
        })
        const json = await res.json()

        if (json.success) {
          if (json.pix_copia_cola) {
            setPixData({
              pixCode: json.pix_copia_cola,
              qrImage: json.pix_qr_code || null,
              invoiceUrl: json.invoice_url
            })
          } else if (json.invoice_url) {
            setPixData({ invoiceUrl: json.invoice_url })
            window.open(json.invoice_url, '_blank')
          }
          await carregarDados()
        } else {
          alert(json.error || 'Erro ao gerar pagamento')
          setExpandedId(null)
        }
      } catch (error) {
        alert('Erro ao processar pagamento')
        setExpandedId(null)
      } finally {
        setPagandoId(null)
      }
      return
    }

    if (!dados.empresa.chave_pix) {
      alert('Chave PIX nao configurada. Entre em contato com o estabelecimento.')
      return
    }

    const pixCode = gerarPixCopiaCola({
      chavePix: dados.empresa.chave_pix,
      valor: parseFloat(mensalidade.valor),
      nomeRecebedor: dados.empresa.nome || 'Empresa',
      cidadeRecebedor: 'SAO PAULO',
      txid: gerarTxId(mensalidade.id)
    })

    setExpandedId(mensalidade.id)
    setPixData({ pixCode })
    setPixCopied(false)
  }

  const copiarPix = async () => {
    if (!pixData?.pixCode) return
    try {
      await navigator.clipboard.writeText(pixData.pixCode)
      setPixCopied(true)
      setTimeout(() => setPixCopied(false), 3000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = pixData.pixCode
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setPixCopied(true)
      setTimeout(() => setPixCopied(false), 3000)
    }
  }

  const handleBaixarRecibo = async (mensalidade) => {
    try {
      await baixarRecibo({
        nomeEmpresa: dados.empresa.nome,
        nomeCliente: dados.devedor.nome,
        valor: mensalidade.valor,
        dataVencimento: mensalidade.data_vencimento,
        dataPagamento: mensalidade.updated_at,
        formaPagamento: mensalidade.forma_pagamento || 'PIX',
        chavePix: dados.empresa.chave_pix
      })
    } catch (error) {
      console.error('Erro ao gerar recibo:', error)
      alert('Erro ao gerar recibo. Tente novamente.')
    }
  }

  const formatarValor = (valor) => {
    return parseFloat(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatarData = (data) => {
    if (!data) return '-'
    const d = new Date(data + 'T00:00:00')
    return d.toLocaleDateString('pt-BR')
  }

  const getStatusInfo = (mensalidade) => {
    if (mensalidade.status === 'pago') return { label: 'Pago', color: '#16a34a', bg: '#f0fdf4', icon: 'mdi:check-circle' }
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const venc = new Date(mensalidade.data_vencimento + 'T00:00:00')
    const diffDias = Math.floor((hoje - venc) / (1000 * 60 * 60 * 24))
    if (venc < hoje) return { label: 'Atrasado', color: '#dc2626', bg: '#fef2f2', icon: 'mdi:alert-circle', diasAtraso: diffDias }
    if (venc.getTime() === hoje.getTime()) return { label: 'Vence hoje', color: '#f59e0b', bg: '#fffbeb', icon: 'mdi:clock-alert' }
    return { label: 'Em aberto', color: '#3b82f6', bg: '#eff6ff', icon: 'mdi:clock-outline' }
  }

  // Loading
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid #e5e7eb', borderTopColor: '#16a34a',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px'
          }} />
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>Carregando portal...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }

  // Erro
  if (erro) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', background: '#fef2f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
          }}>
            <Icon icon="mdi:link-off" width="36" style={{ color: '#dc2626' }} />
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#1f2937' }}>Link invalido</h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 15, lineHeight: 1.5 }}>{erro}</p>
        </div>
      </div>
    )
  }

  const pendentes = dados.mensalidades.filter(m => m.status !== 'pago')
  const pagas = dados.mensalidades.filter(m => m.status === 'pago')
  const totalPendente = pendentes.reduce((sum, m) => sum + parseFloat(m.valor), 0)
  const temAtrasadas = pendentes.some(m => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    return new Date(m.data_vencimento + 'T00:00:00') < hoje
  })
  const inicialEmpresa = (dados.empresa.nome || 'E').charAt(0).toUpperCase()
  const temInfoEmpresa = dados.empresa.cnpj || dados.empresa.endereco || dados.empresa.telefone

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes expandIn { from { max-height: 0; opacity: 0 } to { max-height: 700px; opacity: 1 } }
      `}</style>

      {/* Barra verde de acento */}
      <div style={{ height: 4, background: 'linear-gradient(90deg, #16a34a 0%, #15803d 100%)' }} />

      {/* Header da empresa */}
      <div style={{
        background: '#ffffff',
        padding: '28px 24px 24px',
        textAlign: 'center',
        borderBottom: '1px solid #e2e8f0'
      }}>
        {/* Logo ou inicial */}
        {dados.empresa.logo_url ? (
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: '#ffffff', overflow: 'hidden',
            border: '2px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
          }}>
            <img
              src={dados.empresa.logo_url}
              alt={dados.empresa.nome}
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }}
            />
          </div>
        ) : (
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: '#f0fdf4', border: '2px solid #dcfce7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28, fontWeight: 800, color: '#16a34a'
          }}>
            {inicialEmpresa}
          </div>
        )}

        <h1 style={{
          fontSize: 20, fontWeight: 700, color: '#0f172a',
          margin: '0 0 12px', letterSpacing: '-0.3px', wordBreak: 'break-word'
        }}>
          {dados.empresa.nome}
        </h1>

        {/* Info da empresa (CNPJ, endereco, telefone) */}
        {temInfoEmpresa && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
            {dados.empresa.cnpj && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                <Icon icon="mdi:card-account-details-outline" width="14" style={{ color: '#94a3b8', flexShrink: 0 }} />
                {dados.empresa.cnpj}
              </div>
            )}
            {dados.empresa.endereco && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                <Icon icon="mdi:map-marker-outline" width="14" style={{ color: '#94a3b8', flexShrink: 0 }} />
                <span>{dados.empresa.endereco}</span>
              </div>
            )}
            {dados.empresa.telefone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                <Icon icon="mdi:phone-outline" width="14" style={{ color: '#94a3b8', flexShrink: 0 }} />
                {dados.empresa.telefone}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 24px' }}>

        {/* Card de saudacao + resumo financeiro */}
        <div style={{
          background: '#ffffff', borderRadius: 16, padding: 24,
          margin: '20px 0 0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: 15, color: '#334155', margin: '0 0 4px' }}>
            Ola, <span style={{ fontWeight: 700 }}>{dados.devedor.nome.split(' ')[0]}</span>!
          </div>

          {dados.devedor.plano_nome && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: '#f0fdf4', color: '#16a34a',
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600
            }}>
              <Icon icon="mdi:star" width="13" />
              {dados.devedor.plano_nome}
            </span>
          )}

          <hr style={{ height: 1, background: '#f1f5f9', border: 'none', margin: '16px 0' }} />

          {pendentes.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{
                  fontSize: 11, color: '#64748b', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4
                }}>
                  Total pendente
                </div>
                <div style={{
                  fontSize: 32, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.1,
                  color: temAtrasadas ? '#dc2626' : '#0f172a'
                }}>
                  {formatarValor(totalPendente)}
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                  {pendentes.length} {pendentes.length === 1 ? 'mensalidade pendente' : 'mensalidades pendentes'}
                </div>
              </div>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: temAtrasadas ? '#fef2f2' : '#f0fdf4',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Icon
                  icon={temAtrasadas ? 'mdi:alert-circle-outline' : 'mdi:receipt-text-clock-outline'}
                  width="28"
                  style={{ color: temAtrasadas ? '#dc2626' : '#16a34a' }}
                />
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <Icon icon="mdi:check-decagram" width="40" style={{ color: '#16a34a', marginBottom: 8 }} />
              <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>Tudo em dia!</div>
              <div style={{ fontSize: 13, color: '#16a34a', marginTop: 2 }}>Nenhuma mensalidade pendente</div>
            </div>
          )}
        </div>

        {/* Pagamentos pendentes */}
        {pendentes.length > 0 && (
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: '#94a3b8',
              textTransform: 'uppercase', letterSpacing: '1px',
              margin: '28px 0 12px', padding: 0
            }}>
              Pagamentos pendentes
            </div>

            {pendentes.map(m => {
              const info = getStatusInfo(m)
              const isExpanded = expandedId === m.id
              return (
                <div key={m.id} style={{
                  background: '#ffffff', borderRadius: 14,
                  marginBottom: 12, border: isExpanded ? '1px solid #d1d5db' : '1px solid #e2e8f0',
                  boxShadow: isExpanded ? '0 4px 20px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
                        {formatarValor(m.valor)}
                      </div>
                      <span style={{
                        padding: '5px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        color: info.color, backgroundColor: info.bg,
                        display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap'
                      }}>
                        <Icon icon={info.icon} width="14" />
                        {info.label}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Icon icon="mdi:calendar-outline" width="14" />
                      Vencimento: {formatarData(m.data_vencimento)}
                    </div>

                    {info.diasAtraso > 0 && (
                      <div style={{
                        fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 4,
                        display: 'flex', alignItems: 'center', gap: 4
                      }}>
                        <Icon icon="mdi:clock-alert-outline" width="14" />
                        {info.diasAtraso} {info.diasAtraso === 1 ? 'dia' : 'dias'} de atraso
                      </div>
                    )}

                    <button
                      onClick={() => handlePagar(m)}
                      disabled={pagandoId === m.id}
                      style={{
                        width: '100%', padding: '14px 16px', borderRadius: 12, marginTop: 16,
                        border: isExpanded ? '1px solid #e2e8f0' : 'none',
                        cursor: pagandoId === m.id ? 'wait' : 'pointer',
                        background: isExpanded
                          ? '#f8fafc'
                          : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                        color: isExpanded ? '#64748b' : '#ffffff',
                        fontSize: 15, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        opacity: pagandoId === m.id ? 0.7 : 1,
                        transition: 'all 0.2s ease',
                        boxShadow: isExpanded ? 'none' : '0 2px 8px rgba(22, 163, 74, 0.3)'
                      }}
                    >
                      {pagandoId === m.id ? (
                        <>
                          <div style={{
                            width: 18, height: 18, borderRadius: '50%',
                            border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white',
                            animation: 'spin 0.8s linear infinite'
                          }} />
                          Gerando pagamento...
                        </>
                      ) : isExpanded ? (
                        <>
                          <Icon icon="mdi:chevron-up" width="18" />
                          Fechar
                        </>
                      ) : (
                        <>
                          <Icon icon="mdi:qrcode" width="18" />
                          Pagar agora
                        </>
                      )}
                    </button>

                    {/* Texto de confianca abaixo do botao */}
                    {!isExpanded && (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 4, marginTop: 10, fontSize: 11, color: '#94a3b8'
                      }}>
                        <Icon icon="mdi:shield-lock-outline" width="12" />
                        Pagamento seguro via PIX
                      </div>
                    )}
                  </div>

                  {/* PIX Inline expandido */}
                  {isExpanded && pixData && pixData.pixCode && (
                    <div style={{
                      borderTop: '1px solid #e2e8f0',
                      padding: '24px 20px',
                      background: '#fafffe',
                      animation: 'expandIn 0.3s ease-out',
                      textAlign: 'center'
                    }}>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: '#f0fdf4', border: '1px solid #dcfce7',
                        padding: '8px 16px', borderRadius: 24,
                        fontSize: 13, fontWeight: 600, color: '#16a34a', marginBottom: 20
                      }}>
                        <Icon icon="mdi:shield-check-outline" width="16" />
                        Pagamento seguro via PIX
                      </div>

                      <div style={{
                        background: '#ffffff', borderRadius: 16, padding: 24,
                        display: 'inline-block', border: '2px solid #e2e8f0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                      }}>
                        {pixData.qrImage ? (
                          <img
                            src={`data:image/png;base64,${pixData.qrImage}`}
                            alt="QR Code PIX"
                            style={{ width: 200, height: 200 }}
                          />
                        ) : (
                          <QRCodeSVG value={pixData.pixCode} size={200} />
                        )}
                      </div>

                      <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 16, marginBottom: 4 }}>
                        {formatarValor(m.valor)}
                      </div>
                      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                        Escaneie o QR Code ou copie o codigo abaixo
                      </div>

                      {/* Instrucoes */}
                      <div style={{
                        background: '#ffffff', borderRadius: 12, padding: '16px 18px',
                        marginBottom: 16, border: '1px solid #e2e8f0', textAlign: 'left'
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                          Como pagar:
                        </div>
                        {[
                          { num: '1', text: 'Abra o app do seu banco' },
                          { num: '2', text: 'Escolha Pagar com PIX' },
                          { num: '3', text: 'Escaneie o QR Code ou cole o codigo' }
                        ].map(step => (
                          <div key={step.num} style={{
                            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8
                          }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: '50%',
                              background: '#16a34a', color: '#ffffff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 700, flexShrink: 0
                            }}>
                              {step.num}
                            </div>
                            <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{step.text}</span>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={copiarPix}
                        style={{
                          width: '100%', padding: '15px 16px', borderRadius: 12,
                          border: 'none', cursor: 'pointer',
                          background: pixCopied
                            ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                            : '#0f172a',
                          color: '#ffffff', fontSize: 15, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <Icon icon={pixCopied ? 'mdi:check-circle' : 'mdi:content-copy'} width="18" />
                        {pixCopied ? 'Codigo copiado!' : 'Copiar codigo PIX'}
                      </button>
                    </div>
                  )}

                  {/* Asaas fallback */}
                  {isExpanded && pixData && !pixData.pixCode && pixData.invoiceUrl && (
                    <div style={{
                      borderTop: '1px solid #e2e8f0',
                      padding: '24px 20px',
                      background: '#fafffe',
                      textAlign: 'center',
                      animation: 'expandIn 0.3s ease-out'
                    }}>
                      <Icon icon="mdi:open-in-new" width="32" style={{ color: '#3b82f6', marginBottom: 10 }} />
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                        Pagamento aberto em nova aba
                      </div>
                      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                        Conclua o pagamento na pagina que foi aberta
                      </div>
                      <button
                        onClick={() => window.open(pixData.invoiceUrl, '_blank')}
                        style={{
                          padding: '12px 24px', borderRadius: 10,
                          border: '1px solid #e2e8f0', cursor: 'pointer',
                          background: '#ffffff', color: '#334155', fontSize: 14, fontWeight: 600,
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                        }}
                      >
                        <Icon icon="mdi:open-in-new" width="16" />
                        Abrir pagamento novamente
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Historico de pagos */}
        {pagas.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setMostrarPagos(!mostrarPagos)}
              style={{
                width: '100%', padding: '14px 16px',
                background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'all 0.2s ease'
              }}
            >
              <span style={{
                fontSize: 13, fontWeight: 600, color: '#334155',
                display: 'flex', alignItems: 'center', gap: 8
              }}>
                <Icon icon="mdi:receipt-text-check-outline" width="18" style={{ color: '#16a34a' }} />
                Historico
                <span style={{
                  background: '#f0fdf4', color: '#16a34a',
                  padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700
                }}>
                  {pagas.length}
                </span>
              </span>
              <Icon
                icon={mostrarPagos ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                width="20" style={{ color: '#94a3b8' }}
              />
            </button>

            {mostrarPagos && pagas.map(m => (
              <div key={m.id} style={{
                background: '#ffffff', borderRadius: 10, padding: '14px 16px',
                marginTop: 8, border: '1px solid #e2e8f0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                    {formatarValor(m.valor)}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Icon icon="mdi:calendar-check-outline" width="13" />
                    Vencimento: {formatarData(m.data_vencimento)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    color: '#16a34a', backgroundColor: '#f0fdf4'
                  }}>
                    Pago
                  </span>
                  <button
                    onClick={() => handleBaixarRecibo(m)}
                    title="Baixar recibo"
                    style={{
                      background: '#f1f5f9', border: 'none', cursor: 'pointer',
                      borderRadius: 8, padding: 8, display: 'flex',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                    onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                  >
                    <Icon icon="mdi:download" width="18" style={{ color: '#64748b' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer minimo */}
      <div style={{ textAlign: 'center', padding: '32px 16px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
          <Icon icon="mdi:shield-lock-outline" width="14" style={{ color: '#cbd5e1' }} />
          <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 500 }}>Portal seguro de pagamentos</span>
        </div>
        <div style={{ fontSize: 10, color: '#e2e8f0', marginTop: 4 }}>
          Powered by Mensalli
        </div>
      </div>
    </div>
  )
}
