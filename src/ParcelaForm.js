import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function ParcelaForm({ devedor, parcela, onClose }) {
  const [numero, setNumero] = useState(1)
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [descricao, setDescricao] = useState('')
  const [status, setStatus] = useState('pendente')
  const [loading, setLoading] = useState(false)

  // Modo de criação múltipla
  const [criarMultiplas, setCriarMultiplas] = useState(false)
  const [quantidadeParcelas, setQuantidadeParcelas] = useState(1)
  const [valorTotal, setValorTotal] = useState('')
  const [primeiroVencimento, setPrimeiroVencimento] = useState('')

  useEffect(() => {
    if (parcela) {
      // Modo edição
      setNumero(parcela.numero_parcela)
      setValor(parcela.valor)
      setVencimento(parcela.data_vencimento)
      setDescricao(parcela.descricao || '')
      setStatus(parcela.status)
      setCriarMultiplas(false)
    } else {
      // Modo criação - buscar próximo número de parcela
      buscarProximoNumero()
    }
  }, [parcela, devedor])

  const buscarProximoNumero = async () => {
    const { data } = await supabase
      .from('parcelas')
      .select('numero_parcela')
      .eq('devedor_id', devedor.id)
      .order('numero_parcela', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      setNumero(data[0].numero_parcela + 1)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (parcela) {
      // Atualizar parcela existente
      const { error } = await supabase
        .from('parcelas')
        .update({
          numero_parcela: parseInt(numero),
          valor: parseFloat(valor),
          data_vencimento: vencimento,
          descricao: descricao || null,
          status: status
        })
        .eq('id', parcela.id)

      if (error) {
        alert('Erro ao atualizar: ' + error.message)
      } else {
        onClose()
      }
    } else if (criarMultiplas) {
      // Criar múltiplas parcelas
      await criarParcelasEmLote(user.id)
    } else if (parseInt(numero) > 1 && !parcela) {
      // Se número for maior que 1, criar múltiplas parcelas automaticamente
      await criarParcelasSimples(user.id, parseInt(numero))
    } else {
      // Criar parcela única
      const { error } = await supabase
        .from('parcelas')
        .insert([{
          devedor_id: devedor.id,
          user_id: user.id,
          numero_parcela: 1,
          valor: parseFloat(valor),
          data_vencimento: vencimento,
          descricao: descricao || null,
          status: status
        }])

      if (error) {
        alert('Erro ao criar: ' + error.message)
      } else {
        onClose()
      }
    }

    setLoading(false)
  }

  const criarParcelasSimples = async (userId, quantidade) => {
    const parcelas = []
    const dataInicial = new Date(vencimento)
    const valorParcela = parseFloat(valor)

    for (let i = 0; i < quantidade; i++) {
      // Calcular data: primeira parcela na data escolhida, depois +30 dias para cada
      const dataVenc = new Date(dataInicial)
      dataVenc.setDate(dataInicial.getDate() + (i * 30))

      parcelas.push({
        devedor_id: devedor.id,
        user_id: userId,
        numero_parcela: i + 1,
        valor: valorParcela,
        data_vencimento: dataVenc.toISOString().split('T')[0],
        descricao: descricao || null,
        status: 'pendente'
      })
    }

    const { error } = await supabase
      .from('parcelas')
      .insert(parcelas)

    if (error) {
      alert('Erro ao criar parcelas: ' + error.message)
    } else {
      alert(`${quantidade} parcela(s) criada(s) com sucesso!`)
      onClose()
    }
  }

  const criarParcelasEmLote = async (userId) => {
    const qtd = parseInt(quantidadeParcelas)
    const valorParcela = parseFloat(valorTotal) / qtd

    const parcelas = []
    const dataInicial = new Date(primeiroVencimento)

    for (let i = 0; i < qtd; i++) {
      // Calcular data: primeira parcela na data escolhida, depois +30 dias para cada
      const dataVenc = new Date(dataInicial)
      dataVenc.setDate(dataInicial.getDate() + (i * 30))

      parcelas.push({
        devedor_id: devedor.id,
        user_id: userId,
        numero_parcela: numero + i,
        valor: valorParcela,
        data_vencimento: dataVenc.toISOString().split('T')[0],
        descricao: descricao || null,
        status: 'pendente'
      })
    }

    const { error } = await supabase
      .from('parcelas')
      .insert(parcelas)

    if (error) {
      alert('Erro ao criar parcelas: ' + error.message)
    } else {
      alert(`${qtd} parcela(s) criada(s) com sucesso!`)
      onClose()
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '10px',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <h2>{parcela ? 'Editar Parcela' : 'Adicionar Parcela(s)'}</h2>

        {!parcela && (
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={criarMultiplas}
                onChange={(e) => setCriarMultiplas(e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              <strong>Criar múltiplas parcelas (parcelamento)</strong>
            </label>
            <p style={{ fontSize: '12px', color: '#666', marginTop: '5px', marginLeft: '24px' }}>
              Marque para dividir um valor em várias parcelas mensais
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {criarMultiplas ? (
            // Modo: Criar múltiplas parcelas
            <>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Valor Total
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 1500.00"
                  value={valorTotal}
                  onChange={(e) => setValorTotal(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Quantidade de Parcelas
                </label>
                <input
                  type="number"
                  min="1"
                  max="36"
                  placeholder="Ex: 12"
                  value={quantidadeParcelas}
                  onChange={(e) => setQuantidadeParcelas(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
                {quantidadeParcelas && valorTotal && (
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                    {quantidadeParcelas}x de R$ {(parseFloat(valorTotal) / parseInt(quantidadeParcelas)).toFixed(2)}
                  </p>
                )}
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Data do Primeiro Vencimento
                </label>
                <input
                  type="date"
                  value={primeiroVencimento}
                  onChange={(e) => setPrimeiroVencimento(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  As próximas parcelas serão criadas a cada 30 dias
                </p>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Número da Primeira Parcela
                </label>
                <input
                  type="number"
                  min="1"
                  value={numero}
                  onChange={(e) => setNumero(parseInt(e.target.value))}
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Descrição (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Mensalidade, Produto X"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
            </>
          ) : (
            // Modo: Criar/editar parcela única
            <>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Quantidade de Parcelas
                </label>
                <input
                  type="number"
                  min="1"
                  value={numero}
                  onChange={(e) => setNumero(parseInt(e.target.value))}
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  {parseInt(numero) > 1
                    ? `Serão criadas ${numero} parcelas de R$ ${parseFloat(valor || 0).toFixed(2)} cada, com intervalo de 30 dias`
                    : 'Digite 1 para parcela única ou mais para criar múltiplas parcelas'}
                </p>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Valor
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Data de Vencimento
                </label>
                <input
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Descrição (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Mensalidade, Produto X"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="pendente">Pendente</option>
                  <option value="pago">Pago</option>
                  <option value="atrasado">Atrasado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {loading ? 'Salvando...' : parcela ? 'Atualizar' : criarMultiplas ? 'Criar Parcelas' : 'Criar Parcela'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#ccc',
                color: '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
