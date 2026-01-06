import React, { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from './supabaseClient'

function AddInstallmentsModal({ isOpen, onClose, clientes, onSave, onClienteAdicionado }) {
  const [selectedClient, setSelectedClient] = useState('')
  const [totalValue, setTotalValue] = useState('')
  const [installmentsCount, setInstallmentsCount] = useState(1)
  const [isRecurring, setIsRecurring] = useState(false)
  const [firstDueDate, setFirstDueDate] = useState('')
  const [preview, setPreview] = useState([])
  const [mostrarModalNovoCliente, setMostrarModalNovoCliente] = useState(false)
  const [novoClienteNome, setNovoClienteNome] = useState('')
  const [novoClienteTelefone, setNovoClienteTelefone] = useState('')
  const [erroNome, setErroNome] = useState('')
  const [erroTelefone, setErroTelefone] = useState('')

  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setSelectedClient('')
      setTotalValue('')
      setInstallmentsCount(1)
      setIsRecurring(false)
      setFirstDueDate('')
      setPreview([])
    }
  }, [isOpen])

  useEffect(() => {
    generatePreview()
  }, [totalValue, installmentsCount, firstDueDate, isRecurring])

  const generatePreview = () => {
    if (!totalValue || !firstDueDate) {
      setPreview([])
      return
    }

    const total = parseFloat(totalValue.replace(',', '.'))
    if (isNaN(total) || total <= 0) {
      setPreview([])
      return
    }

    const newPreview = []
    // Corrigir timezone: adicionar T00:00:00 para interpretar como horário local
    const [year, month, day] = firstDueDate.split('-').map(Number)

    if (isRecurring) {
      // Mensalidade mode - show next 3 months as preview
      const valuePerMonth = total
      for (let i = 0; i < 3; i++) {
        // Criar nova data adicionando meses corretamente
        let newYear = year
        let newMonth = month + i

        // Ajustar ano se mês ultrapassar 12
        while (newMonth > 12) {
          newMonth -= 12
          newYear += 1
        }

        const formattedMonth = String(newMonth).padStart(2, '0')
        const formattedDay = String(day).padStart(2, '0')

        newPreview.push({
          numero: i + 1,
          valor: valuePerMonth,
          vencimento: `${newYear}-${formattedMonth}-${formattedDay}`
        })
      }
    } else {
      // Parcelas mode - divide total by number of installments
      const valuePerInstallment = total / installmentsCount
      for (let i = 0; i < installmentsCount; i++) {
        // Criar nova data adicionando meses corretamente
        let newYear = year
        let newMonth = month + i

        // Ajustar ano se mês ultrapassar 12
        while (newMonth > 12) {
          newMonth -= 12
          newYear += 1
        }

        const formattedMonth = String(newMonth).padStart(2, '0')
        const formattedDay = String(day).padStart(2, '0')

        newPreview.push({
          numero: i + 1,
          valor: valuePerInstallment,
          vencimento: `${newYear}-${formattedMonth}-${formattedDay}`
        })
      }
    }

    setPreview(newPreview)
  }

  const handleCreate = () => {
    // Validation
    if (!selectedClient) {
      alert('Por favor, selecione um cliente')
      return
    }

    if (!totalValue || parseFloat(totalValue.replace(',', '.')) <= 0) {
      alert('Por favor, insira um valor válido')
      return
    }

    if (!firstDueDate) {
      alert('Por favor, selecione a data de vencimento')
      return
    }

    // Validar se a data é maior ou igual a hoje
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const dataSelecionada = new Date(firstDueDate + 'T00:00:00')

    if (dataSelecionada < hoje) {
      alert('A data de vencimento deve ser igual ou posterior à data atual')
      return
    }

    if (!isRecurring && installmentsCount < 1) {
      alert('O número de parcelas deve ser no mínimo 1')
      return
    }

    // Prepare data to save
    let parcelasParaSalvar

    if (isRecurring) {
      // Para mensalidade: criar APENAS a primeira parcela com dados de recorrência
      const firstDueDateObj = new Date(firstDueDate + 'T00:00:00')
      parcelasParaSalvar = [{
        numero: 1,
        valor: parseFloat(totalValue.replace(',', '.')),
        vencimento: firstDueDate,
        recorrencia: {
          isRecurring: true,
          recurrenceType: 'monthly',
          startDate: firstDueDate,
          dayOfMonth: firstDueDateObj.getDate()
        }
      }]
    } else {
      // Para parcelas: criar todas as parcelas normalmente
      parcelasParaSalvar = preview
    }

    const dataToSave = {
      devedor_id: selectedClient,
      valor_total: parseFloat(totalValue.replace(',', '.')),
      numero_parcelas: isRecurring ? null : installmentsCount,
      primeira_data_vencimento: firstDueDate,
      is_mensalidade: isRecurring,
      parcelas: parcelasParaSalvar
    }

    onSave(dataToSave)
    onClose()
  }

  const aplicarMascaraTelefone = (valor) => {
    // Remove tudo que não é número
    const apenasNumeros = valor.replace(/\D/g, '')

    // Aplica a máscara (XX) XXXXX-XXXX
    if (apenasNumeros.length <= 2) {
      return apenasNumeros
    } else if (apenasNumeros.length <= 7) {
      return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2)}`
    } else if (apenasNumeros.length <= 11) {
      return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7, 11)}`
    } else {
      return `(${apenasNumeros.slice(0, 2)}) ${apenasNumeros.slice(2, 7)}-${apenasNumeros.slice(7, 11)}`
    }
  }

  const handleAdicionarCliente = async () => {
    // Limpar erros anteriores
    setErroNome('')
    setErroTelefone('')

    // Validação
    if (!novoClienteNome.trim()) {
      setErroNome('Por favor, insira o nome do cliente')
      return
    }

    if (!novoClienteTelefone.trim()) {
      setErroTelefone('Por favor, insira o telefone do cliente')
      return
    }

    // Validar telefone (deve ter 10-11 dígitos)
    const apenasNumeros = novoClienteTelefone.replace(/\D/g, '')
    if (apenasNumeros.length < 10 || apenasNumeros.length > 11) {
      setErroTelefone('Por favor, insira um telefone válido com DDD')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Verificar se já existe cliente com mesmo telefone
      const { data: clienteExistente } = await supabase
        .from('devedores')
        .select('id, nome')
        .eq('user_id', user.id)
        .eq('telefone', novoClienteTelefone.trim())
        .single()

      if (clienteExistente) {
        setErroTelefone(`Já existe um cliente cadastrado com este telefone: ${clienteExistente.nome}`)
        return
      }

      const { data, error } = await supabase
        .from('devedores')
        .insert([{
          user_id: user.id,
          nome: novoClienteNome.trim(),
          telefone: novoClienteTelefone.trim(),
          valor_devido: 0,
          data_vencimento: new Date().toISOString().split('T')[0],
          status: 'pendente'
        }])
        .select()

      if (error) throw error

      // Selecionar o cliente recém-criado
      setSelectedClient(data[0].id)

      // Limpar campos e erros
      setNovoClienteNome('')
      setNovoClienteTelefone('')
      setErroNome('')
      setErroTelefone('')
      setMostrarModalNovoCliente(false)

      // Notificar componente pai para recarregar lista de clientes
      if (onClienteAdicionado) {
        onClienteAdicionado()
      }

      alert('Cliente adicionado com sucesso!')
    } catch (error) {
      console.error('Erro ao adicionar cliente:', error)
      setErroTelefone('Erro ao adicionar cliente: ' + error.message)
    }
  }

  const formatCurrency = (value) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('pt-BR')
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #e8e8e8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#344848', margin: 0 }}>
            Adicionar {isRecurring ? 'Mensalidade' : 'Parcelas'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Icon icon="mdi:close" width="24" height="24" style={{ color: '#666' }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          {/* Toggle Parcelas/Mensalidade */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              display: 'inline-flex',
              backgroundColor: '#f5f5f5',
              borderRadius: '6px',
              padding: '4px'
            }}>
              <button
                onClick={() => setIsRecurring(false)}
                style={{
                  padding: '8px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: !isRecurring ? '#344848' : 'transparent',
                  color: !isRecurring ? 'white' : '#666',
                  transition: 'all 0.2s'
                }}
              >
                Parcelas
              </button>
              <button
                onClick={() => setIsRecurring(true)}
                style={{
                  padding: '8px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: isRecurring ? '#344848' : 'transparent',
                  color: isRecurring ? 'white' : '#666',
                  transition: 'all 0.2s'
                }}
              >
                Mensalidade
              </button>
            </div>
          </div>

          {/* Client Selection */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#344848', fontWeight: '500' }}>
              Cliente *
            </label>
            <select
              value={selectedClient}
              onChange={(e) => {
                if (e.target.value === '__adicionar_novo__') {
                  setMostrarModalNovoCliente(true)
                } else {
                  setSelectedClient(e.target.value)
                }
              }}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: 'white',
                color: '#344848'
              }}
            >
              <option value="">Selecione um cliente</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nome}
                </option>
              ))}
              <option value="__adicionar_novo__" style={{ color: '#007bff', fontWeight: '500' }}>
                + Adicionar Novo Cliente
              </option>
            </select>
          </div>

          {/* Value Input */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#344848', fontWeight: '500' }}>
              {isRecurring ? 'Valor Mensal *' : 'Valor Total *'}
            </label>
            <input
              type="text"
              value={totalValue}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9,]/g, '')
                setTotalValue(value)
              }}
              placeholder="0,00"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            />
          </div>

          {/* Installments Count (only for Parcelas mode) */}
          {!isRecurring && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#344848', fontWeight: '500' }}>
                Número de Parcelas *
              </label>
              <input
                type="number"
                value={installmentsCount}
                onChange={(e) => setInstallmentsCount(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '14px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>
          )}

          {/* First Due Date */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#344848', fontWeight: '500' }}>
              {isRecurring ? 'Data de Início *' : 'Primeira Data de Vencimento *'}
            </label>
            <input
              type="date"
              value={firstDueDate}
              onChange={(e) => setFirstDueDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            />
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div style={{
              backgroundColor: '#f9f9f9',
              borderRadius: '6px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#344848', marginBottom: '12px' }}>
                {isRecurring ? 'Prévia (próximos 3 meses)' : 'Prévia das Parcelas'}
              </h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {preview.map((item) => (
                  <div
                    key={item.numero}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: '1px solid #e8e8e8',
                      fontSize: '13px'
                    }}
                  >
                    <span style={{ color: '#666' }}>
                      {isRecurring ? `Mês ${item.numero}` : `Parcela ${item.numero}/${installmentsCount}`}
                    </span>
                    <span style={{ color: '#344848', fontWeight: '500' }}>
                      Venc. {formatDate(item.vencimento)} — R$ {formatCurrency(item.valor)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Texto explicativo para mensalidade */}
              {isRecurring && (
                <p style={{
                  fontSize: '12px',
                  color: '#888',
                  marginTop: '12px',
                  lineHeight: '1.5'
                }}>
                  Essa mensalidade será renovada automaticamente todos os meses até ser cancelada.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #e8e8e8',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            style={{
              padding: '10px 20px',
              backgroundColor: '#344848',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Criar
          </button>
        </div>
      </div>

      {/* Modal Adicionar Novo Cliente */}
      {mostrarModalNovoCliente && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '450px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #e8e8e8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#344848', margin: 0 }}>
                Adicionar Novo Cliente
              </h3>
              <button
                onClick={() => {
                  setMostrarModalNovoCliente(false)
                  setNovoClienteNome('')
                  setNovoClienteTelefone('')
                  setErroNome('')
                  setErroTelefone('')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Icon icon="mdi:close" width="24" height="24" style={{ color: '#666' }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              {/* Nome */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#344848', fontWeight: '500' }}>
                  Nome do Cliente *
                </label>
                <input
                  type="text"
                  value={novoClienteNome}
                  onChange={(e) => {
                    setNovoClienteNome(e.target.value)
                    if (erroNome) setErroNome('')
                  }}
                  placeholder="Digite o nome completo"
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '14px',
                    border: erroNome ? '2px solid #f44336' : '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: erroNome ? '#ffebee' : 'white'
                  }}
                />
                {erroNome && (
                  <span style={{
                    display: 'block',
                    color: '#f44336',
                    fontSize: '12px',
                    marginTop: '4px'
                  }}>
                    {erroNome}
                  </span>
                )}
              </div>

              {/* Telefone */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#344848', fontWeight: '500' }}>
                  Telefone *
                </label>
                <input
                  type="tel"
                  value={novoClienteTelefone}
                  onChange={(e) => {
                    setNovoClienteTelefone(aplicarMascaraTelefone(e.target.value))
                    if (erroTelefone) setErroTelefone('')
                  }}
                  placeholder="(00) 00000-0000"
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '14px',
                    border: erroTelefone ? '2px solid #f44336' : '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: erroTelefone ? '#ffebee' : 'white'
                  }}
                />
                {erroTelefone && (
                  <span style={{
                    display: 'block',
                    color: '#f44336',
                    fontSize: '12px',
                    marginTop: '4px'
                  }}>
                    {erroTelefone}
                  </span>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid #e8e8e8',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                onClick={() => {
                  setMostrarModalNovoCliente(false)
                  setNovoClienteNome('')
                  setNovoClienteTelefone('')
                  setErroNome('')
                  setErroTelefone('')
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAdicionarCliente}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#344848',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AddInstallmentsModal
