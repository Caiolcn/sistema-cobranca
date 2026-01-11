import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import AddInstallmentsModal from './AddInstallmentsModal'
import { showToast } from './Toast'

export default function Financeiro({ onAbrirPerfil, onSair }) {
  const [parcelas, setParcelas] = useState([])
  const [parcelasFiltradas, setParcelasFiltradas] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState([])
  const [filtroVencimento, setFiltroVencimento] = useState(null)
  const [mostrarModalAdicionar, setMostrarModalAdicionar] = useState(false)
  const [clientes, setClientes] = useState([])

  // Cards de resumo
  const [totalEmAtraso, setTotalEmAtraso] = useState(0)
  const [totalEmAberto, setTotalEmAberto] = useState(0)
  const [totalRecebido, setTotalRecebido] = useState(0)

  useEffect(() => {
    carregarParcelas()
    carregarClientes()
  }, [])

  useEffect(() => {
    aplicarFiltros()
  }, [parcelas, filtroStatus, filtroVencimento])

  const carregarParcelas = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from('parcelas')
        .select(`
          *,
          devedor:devedores(nome)
        `)
        .eq('user_id', user.id)
        .order('data_vencimento', { ascending: true })

      if (error) throw error

      const parcelasComStatus = data.map(p => ({
        ...p,
        statusCalculado: calcularStatus(p)
      }))

      setParcelas(parcelasComStatus)
      calcularTotais(parcelasComStatus)
    } catch (error) {
      console.error('Erro ao carregar parcelas:', error)
      showToast('Erro ao carregar parcelas: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const carregarClientes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from('devedores')
        .select('id, nome')
        .eq('user_id', user.id)
        .order('nome', { ascending: true })

      if (error) throw error

      setClientes(data || [])
    } catch (error) {
      console.error('Erro ao carregar clientes:', error)
    }
  }

  const salvarParcelas = async (dataToSave) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Criar parcelas no banco de dados
      const parcelasParaInserir = dataToSave.parcelas.map(parcela => {
        const parcelaBase = {
          user_id: user.id,
          devedor_id: dataToSave.devedor_id,
          valor: parcela.valor,
          data_vencimento: parcela.vencimento,
          status: 'pendente',
          numero_parcela: parcela.numero,
          total_parcelas: dataToSave.is_mensalidade ? null : dataToSave.numero_parcelas,
          is_mensalidade: dataToSave.is_mensalidade
        }

        // Adicionar dados de recorrência se for mensalidade
        if (dataToSave.is_mensalidade && parcela.recorrencia) {
          parcelaBase.recorrencia = parcela.recorrencia
        }

        return parcelaBase
      })

      const { error } = await supabase
        .from('parcelas')
        .insert(parcelasParaInserir)

      if (error) throw error

      showToast(dataToSave.is_mensalidade
        ? 'Mensalidade criada com sucesso!'
        : 'Parcelas criadas com sucesso!', 'success')
      carregarParcelas()
    } catch (error) {
      console.error('Erro ao salvar parcelas:', error)
      showToast('Erro ao salvar parcelas: ' + error.message, 'error')
    }
  }

  const calcularStatus = (parcela) => {
    if (parcela.status === 'pago') return 'pago'

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const vencimento = new Date(parcela.data_vencimento)
    vencimento.setHours(0, 0, 0, 0)

    if (vencimento < hoje) return 'atrasado'
    return 'aberto'
  }

  const calcularTotais = (lista) => {
    let emAtraso = 0
    let emAberto = 0
    let recebido = 0

    lista.forEach(p => {
      const status = p.statusCalculado || calcularStatus(p)
      const valor = parseFloat(p.valor) || 0

      if (status === 'atrasado') emAtraso += valor
      else if (status === 'aberto') emAberto += valor
      else if (status === 'pago') recebido += valor
    })

    setTotalEmAtraso(emAtraso)
    setTotalEmAberto(emAberto)
    setTotalRecebido(recebido)
  }

  const aplicarFiltros = () => {
    let resultado = [...parcelas]

    // Filtro por status (checkboxes ou card clicado)
    if (filtroStatus.length > 0) {
      resultado = resultado.filter(p => filtroStatus.includes(p.statusCalculado))
    }

    // Filtro por vencimento
    if (filtroVencimento) {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)

      resultado = resultado.filter(p => {
        const venc = new Date(p.data_vencimento)
        venc.setHours(0, 0, 0, 0)
        const diffDias = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24))

        if (filtroVencimento === 'hoje') return diffDias === 0
        if (filtroVencimento === '7dias') return diffDias >= 0 && diffDias <= 7
        if (filtroVencimento === '30dias') return diffDias >= 0 && diffDias <= 30
        return true
      })
    }

    // Ordenar: atrasado > aberto > pago
    resultado.sort((a, b) => {
      const prioridade = { atrasado: 1, aberto: 2, pago: 3 }
      if (prioridade[a.statusCalculado] !== prioridade[b.statusCalculado]) {
        return prioridade[a.statusCalculado] - prioridade[b.statusCalculado]
      }
      return new Date(a.data_vencimento) - new Date(b.data_vencimento)
    })

    setParcelasFiltradas(resultado)
  }

  const alterarStatusPagamento = async (parcela, novoPago) => {
    const confirmar = window.confirm(
      novoPago
        ? `Confirmar pagamento de R$ ${parseFloat(parcela.valor).toFixed(2)}?`
        : 'Desfazer o pagamento desta parcela?'
    )

    if (!confirmar) return

    try {
      const { error } = await supabase
        .from('parcelas')
        .update({ status: novoPago ? 'pago' : 'pendente' })
        .eq('id', parcela.id)

      if (error) throw error

      // Atualizar localmente
      const novasParcelas = parcelas.map(p => {
        if (p.id === parcela.id) {
          const atualizada = { ...p, status: novoPago ? 'pago' : 'pendente' }
          atualizada.statusCalculado = calcularStatus(atualizada)
          return atualizada
        }
        return p
      })

      setParcelas(novasParcelas)
      calcularTotais(novasParcelas)
      showToast(novoPago ? 'Pagamento confirmado!' : 'Pagamento desfeito!', 'success')
    } catch (error) {
      showToast('Erro ao atualizar: ' + error.message, 'error')
    }
  }

  const getStatusBadge = (status) => {
    const configs = {
      pago: { bg: '#4CAF50', text: 'Pago' },
      aberto: { bg: '#2196F3', text: 'Em aberto' },
      atrasado: { bg: '#f44336', text: 'Em atraso' }
    }

    const config = configs[status] || configs.aberto

    return (
      <span style={{
        backgroundColor: config.bg,
        color: 'white',
        padding: '3px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 'bold'
      }}>
        {config.text}
      </span>
    )
  }

  const limparFiltros = () => {
    setFiltroStatus([])
    setFiltroVencimento(null)
    setMostrarFiltros(false)
  }

  const toggleFiltroStatus = (status) => {
    if (filtroStatus.includes(status)) {
      setFiltroStatus(filtroStatus.filter(s => s !== status))
    } else {
      setFiltroStatus([...filtroStatus, status])
    }
  }

  const temFiltrosAtivos = filtroStatus.length > 0 || filtroVencimento !== null

  // Fechar popover ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mostrarFiltros && !event.target.closest('.popover-filtros') && !event.target.closest('.btn-filtrar')) {
        setMostrarFiltros(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mostrarFiltros])

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Carregando...</p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, padding: '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header - tudo em uma linha */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Título */}
          <div style={{ minWidth: '150px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>
              Mensalidades
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
              {parcelasFiltradas.length} de {parcelas.length} mensalidade(s)
            </p>
          </div>

          {/* Indicadores */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0',
            flex: 1,
            marginLeft: '40px'
          }}>
            {/* Card Em Atraso */}
            <div style={{
              padding: '8px 25px 8px 0',
              borderRight: '1px solid #e8e8e8',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px'
            }}>
              <p style={{ fontSize: '14px', color: '#999', margin: '0' }}>Em Atraso</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon icon="solar:danger-triangle-linear" width="16" height="16" style={{ color: '#f44336' }} />
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#344848' }}>
                    R$ {totalEmAtraso.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <button
                  onClick={() => toggleFiltroStatus('atrasado')}
                  style={{
                    background: 'none',
                    color: '#8867A1',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textDecoration: 'none',
                    padding: 0,
                    fontWeight: '700'
                  }}
                >
                  Ver
                </button>
              </div>
            </div>

            {/* Card Em Aberto */}
            <div style={{
              padding: '8px 25px',
              borderRight: '1px solid #e8e8e8',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px'
            }}>
              <p style={{ fontSize: '14px', color: '#999', margin: '0' }}>Em Aberto</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon icon="tabler:clock" width="16" height="16" style={{ color: '#2196F3' }} />
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#344848' }}>
                    R$ {totalEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <button
                  onClick={() => toggleFiltroStatus('aberto')}
                  style={{
                    background: 'none',
                    color: '#8867A1',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textDecoration: 'none',
                    padding: 0,
                    fontWeight: '700'
                  }}
                >
                  Ver
                </button>
              </div>
            </div>

            {/* Card Recebido */}
            <div style={{
              padding: '8px 25px',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px'
            }}>
              <p style={{ fontSize: '14px', color: '#999', margin: '0' }}>Recebido</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon icon="fluent-emoji-high-contrast:money-bag" width="16" height="16" style={{ color: '#4CAF50' }} />
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#344848' }}>
                    R$ {totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <button
                  onClick={() => toggleFiltroStatus('pago')}
                  style={{
                    background: 'none',
                    color: '#8867A1',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textDecoration: 'none',
                    padding: 0,
                    fontWeight: '700'
                  }}
                >
                  Ver
                </button>
              </div>
            </div>
          </div>

          {/* Botões */}
          <div style={{ display: 'flex', gap: '8px', position: 'relative', marginLeft: '40px' }}>
            <button
              className="btn-filtrar"
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
              style={{
                padding: '10px 20px',
                backgroundColor: temFiltrosAtivos ? '#344848' : 'white',
                color: temFiltrosAtivos ? 'white' : '#333',
                border: temFiltrosAtivos ? 'none' : '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                position: 'relative',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!temFiltrosAtivos) e.currentTarget.style.backgroundColor = '#f5f5f5'
              }}
              onMouseLeave={(e) => {
                if (!temFiltrosAtivos) e.currentTarget.style.backgroundColor = 'white'
              }}
            >
              <Icon icon="mdi:filter-outline" width="18" height="18" />
              Filtrar
              {temFiltrosAtivos && (
                <span style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  border: '2px solid white'
                }}>
                  {filtroStatus.length + (filtroVencimento ? 1 : 0)}
                </span>
              )}
            </button>
            <button
              onClick={() => setMostrarModalAdicionar(true)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#222'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#333'}
            >
              <Icon icon="mdi:plus" width="18" height="18" />
              Adicionar
            </button>

            {/* Popover de filtros */}
            {mostrarFiltros && (
              <div
                className="popover-filtros"
                style={{
                  position: 'absolute',
                  top: '50px',
                  right: '0',
                  width: '300px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: '1px solid #e0e0e0',
                  zIndex: 1000,
                  overflow: 'hidden'
                }}
              >
                {/* Conteúdo do popover */}
                <div style={{ padding: '20px' }}>
                  {/* Seção Status */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px', fontSize: '14px', color: '#333' }}>
                      Status
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {['pago', 'aberto', 'atrasado'].map(status => (
                        <label key={status} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={filtroStatus.includes(status)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFiltroStatus([...filtroStatus, status])
                              } else {
                                setFiltroStatus(filtroStatus.filter(s => s !== status))
                              }
                            }}
                            style={{
                              width: '16px',
                              height: '16px',
                              cursor: 'pointer',
                              accentColor: '#2196F3'
                            }}
                          />
                          <span style={{ fontSize: '14px', color: '#555' }}>
                            {status === 'pago' && 'Pago'}
                            {status === 'aberto' && 'Em aberto'}
                            {status === 'atrasado' && 'Em atraso'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Seção Vencimento */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '14px', color: '#333' }}>
                      Vencimento
                    </label>
                    <select
                      value={filtroVencimento || ''}
                      onChange={(e) => setFiltroVencimento(e.target.value || null)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #ddd',
                        fontSize: '14px',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      <option value="">Todos</option>
                      <option value="hoje">Hoje</option>
                      <option value="7dias">Próximos 7 dias</option>
                      <option value="30dias">Próximos 30 dias</option>
                    </select>
                  </div>
                </div>

                {/* Rodapé com botão Limpar filtros */}
                <div style={{
                  borderTop: '1px solid #e0e0e0',
                  padding: '12px 20px',
                  backgroundColor: '#f9f9f9'
                }}>
                  <button
                    onClick={limparFiltros}
                    disabled={!temFiltrosAtivos}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: temFiltrosAtivos ? '#344848' : '#e0e0e0',
                      color: temFiltrosAtivos ? 'white' : '#999',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: temFiltrosAtivos ? 'pointer' : 'not-allowed',
                      fontSize: '14px',
                      fontWeight: '600',
                      transition: 'all 0.2s'
                    }}
                  >
                    Limpar filtros
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabela de Parcelas */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        {parcelasFiltradas.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Icon icon="mdi:receipt-text-outline" width="64" height="64" style={{ color: '#ccc', marginBottom: '16px' }} />
            <p style={{ color: '#999', fontSize: '16px', margin: '0' }}>
              Nenhuma mensalidade encontrada
            </p>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '8px 0 0 0' }}>
              Clique em "Adicionar" para criar mensalidades
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e0e0e0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Cliente
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Vencimento
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Valor
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Tipo
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Pagou
                  </th>
                </tr>
              </thead>
              <tbody>
                {parcelasFiltradas.map(parcela => (
                  <tr
                    key={parcela.id}
                    style={{ borderBottom: '1px solid #f0f0f0', transition: 'background-color 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    <td style={{ padding: '16px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
                      {parcela.devedor?.nome || 'N/A'}
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>
                      {new Date(parcela.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '16px', fontSize: '16px', fontWeight: '700', color: '#333', textAlign: 'right' }}>
                      R$ {parseFloat(parcela.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '16px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                      {parcela.is_mensalidade ? 'Mensalidade' : `${parcela.numero_parcela}/${parcela.total_parcelas}`}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      {getStatusBadge(parcela.statusCalculado)}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '22px' }}>
                        <input
                          type="checkbox"
                          checked={parcela.status === 'pago'}
                          onChange={(e) => alterarStatusPagamento(parcela, e.target.checked)}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: parcela.status === 'pago' ? '#4CAF50' : '#ccc',
                          transition: '0.3s',
                          borderRadius: '22px'
                        }}>
                          <span style={{
                            position: 'absolute',
                            content: '',
                            height: '16px',
                            width: '16px',
                            left: parcela.status === 'pago' ? '25px' : '3px',
                            bottom: '3px',
                            backgroundColor: 'white',
                            transition: '0.3s',
                            borderRadius: '50%'
                          }} />
                        </span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Adicionar Parcelas/Mensalidade */}
      <AddInstallmentsModal
        isOpen={mostrarModalAdicionar}
        onClose={() => setMostrarModalAdicionar(false)}
        clientes={clientes}
        onSave={salvarParcelas}
        onClienteAdicionado={carregarClientes}
      />
    </div>
  )
}
