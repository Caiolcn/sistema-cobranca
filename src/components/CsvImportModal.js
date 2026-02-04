import { useState, useRef, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import { showToast } from '../Toast'
import { parseCSV, detectColumnMapping, validateRow } from '../utils/csvParser'

const FIELD_OPTIONS = [
  { value: '', label: 'Ignorar' },
  { value: 'nome', label: 'Nome' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'cpf', label: 'CPF' },
  { value: 'plano', label: 'Plano' }
]

export default function CsvImportModal({
  isOpen,
  onClose,
  onImportComplete,
  userId,
  existingClients = [],
  planos = [],
  limiteClientes = 50,
  clientesAtivos = 0
}) {
  const [step, setStep] = useState(1)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [columnMapping, setColumnMapping] = useState({})
  const [validationResults, setValidationResults] = useState({ valid: [], invalid: [] })
  const [importResults, setImportResults] = useState({ imported: 0, skipped: 0 })
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)

  // Set de telefones existentes para checagem de duplicatas
  const existingPhones = useMemo(() => {
    const set = new Set()
    existingClients.forEach(c => {
      if (c.telefone) set.add(c.telefone.replace(/\D/g, ''))
    })
    return set
  }, [existingClients])

  const baixarPlanilhaExemplo = () => {
    const linhas = [
      'Nome;Telefone;CPF;Plano',
      'Maria Silva;(11) 99876-5432;529.982.247-25;Mensal',
      'João Santos;(21) 98765-4321;361.440.190-04;Trimestral',
      'Ana Oliveira;(62) 91234-5678;;Mensal',
      'Carlos Souza;11987654321;;'
    ]
    const conteudo = '\uFEFF' + linhas.join('\r\n')
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'modelo-importacao-clientes.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const resetState = () => {
    setStep(1)
    setFileName('')
    setHeaders([])
    setRows([])
    setColumnMapping({})
    setValidationResults({ valid: [], invalid: [] })
    setImportResults({ imported: 0, skipped: 0 })
    setImporting(false)
    setImportProgress(0)
    setDragActive(false)
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const processFile = (file) => {
    if (!file) return

    const validTypes = ['text/csv', 'text/plain', 'application/vnd.ms-excel']
    const validExtensions = ['.csv', '.txt']
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      showToast('Formato não suportado. Use arquivos .csv ou .txt', 'error')
      return
    }

    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const { headers: h, rows: r } = parseCSV(text)

      if (h.length === 0 || r.length === 0) {
        showToast('Arquivo vazio ou formato inválido', 'error')
        return
      }

      setHeaders(h)
      setRows(r)

      // Auto-detectar mapeamento
      const autoMapping = detectColumnMapping(h)
      setColumnMapping(autoMapping)
      setStep(2)
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    processFile(file)
  }

  const handleFileInput = (e) => {
    const file = e.target.files[0]
    processFile(file)
  }

  const handleMappingChange = (field, columnIndex) => {
    setColumnMapping(prev => {
      const newMapping = { ...prev }
      // Remove mapeamento anterior desta coluna
      Object.keys(newMapping).forEach(key => {
        if (newMapping[key] === columnIndex) delete newMapping[key]
      })
      // Adiciona novo mapeamento
      if (field) newMapping[field] = columnIndex
      return newMapping
    })
  }

  const runValidation = () => {
    const phonesSeen = new Set()
    const valid = []
    const invalid = []

    rows.forEach((row, index) => {
      const result = validateRow(row, columnMapping, existingPhones, planos)

      // Checar duplicata interna no CSV
      if (result.data.telefone && phonesSeen.has(result.data.telefone)) {
        result.valid = false
        result.errors.push('Telefone duplicado no arquivo')
      }

      if (result.data.telefone) {
        phonesSeen.add(result.data.telefone)
      }

      if (result.valid) {
        valid.push({ rowIndex: index + 2, ...result })
      } else {
        invalid.push({ rowIndex: index + 2, ...result })
      }
    })

    setValidationResults({ valid, invalid })
    setStep(3)
  }

  const runImport = async () => {
    setImporting(true)
    setImportProgress(0)

    const availableSlots = limiteClientes - clientesAtivos
    const toImport = validationResults.valid.slice(0, availableSlots)
    let imported = 0
    const batchSize = 50

    for (let i = 0; i < toImport.length; i += batchSize) {
      const batch = toImport.slice(i, i + batchSize).map(item => ({
        user_id: userId,
        nome: item.data.nome,
        telefone: item.data.telefone,
        cpf: item.data.cpf || null,
        plano_id: item.data.plano_id || null,
        assinatura_ativa: false,
        valor_devido: 0,
        data_vencimento: new Date().toISOString().split('T')[0],
        status: 'pendente',
        portal_token: crypto.randomUUID().replace(/-/g, '')
      }))

      const { data, error } = await supabase
        .from('devedores')
        .insert(batch)
        .select('id')

      if (!error && data) {
        imported += data.length
      }

      setImportProgress(Math.round(((i + batchSize) / toImport.length) * 100))
    }

    const skipped = validationResults.valid.length - imported + validationResults.invalid.length
    setImportResults({ imported, skipped })
    setImporting(false)
    setImportProgress(100)
    setStep(4)
  }

  if (!isOpen) return null

  const mappingReverse = {}
  Object.entries(columnMapping).forEach(([field, colIdx]) => {
    mappingReverse[colIdx] = field
  })

  const hasRequiredMapping = columnMapping.nome !== undefined && columnMapping.telefone !== undefined
  const availableSlots = limiteClientes - clientesAtivos
  const wouldExceedLimit = validationResults.valid.length > availableSlots

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px'
      }}
      onClick={handleClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '16px', padding: '28px',
          maxWidth: '600px', width: '95%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          animation: 'modalSlideIn 0.25s ease-out'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingBottom: '16px', borderBottom: '1px solid #e5e7eb', marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Icon icon="ph:upload-simple-bold" width="20" style={{ color: 'white' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                Importar Clientes
              </h3>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                {step === 1 && 'Upload do arquivo'}
                {step === 2 && 'Mapear colunas'}
                {step === 3 && 'Validar dados'}
                {step === 4 && 'Resultado'}
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: '#f3f4f6', border: 'none', cursor: 'pointer', padding: '8px',
              borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <Icon icon="mdi:close" width="20" style={{ color: '#6b7280' }} />
          </button>
        </div>

        {/* Progress Steps */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
          {[1, 2, 3, 4].map(s => (
            <div key={s} style={{
              flex: 1, height: '4px', borderRadius: '2px',
              backgroundColor: s <= step ? '#3b82f6' : '#e5e7eb',
              transition: 'background-color 0.3s'
            }} />
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

          {/* STEP 1: Upload */}
          {step === 1 && (
            <div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragActive ? '#3b82f6' : '#d1d5db'}`,
                  borderRadius: '12px',
                  padding: '48px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: dragActive ? '#eff6ff' : '#f9fafb',
                  transition: 'all 0.2s'
                }}
              >
                <Icon icon="ph:file-csv" width="48" style={{ color: '#6b7280', marginBottom: '12px' }} />
                <p style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: '500', color: '#374151' }}>
                  Arraste seu arquivo CSV aqui
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>
                  ou clique para selecionar (.csv, .txt)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                />
              </div>

              <div style={{
                marginTop: '20px', padding: '14px', backgroundColor: '#f0fdf4',
                borderRadius: '10px', border: '1px solid #bbf7d0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#166534' }}>
                    Formato esperado do CSV:
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); baixarPlanilhaExemplo() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 12px', fontSize: '12px', fontWeight: '600',
                      color: '#166534', backgroundColor: '#dcfce7',
                      border: '1px solid #86efac', borderRadius: '6px',
                      cursor: 'pointer', transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.target.style.backgroundColor = '#bbf7d0' }}
                    onMouseLeave={e => { e.target.style.backgroundColor = '#dcfce7' }}
                  >
                    <Icon icon="ph:download-simple-bold" width="14" />
                    Baixar modelo
                  </button>
                </div>
                <code style={{ fontSize: '12px', color: '#15803d', lineHeight: '1.6' }}>
                  Nome;Telefone;CPF;Plano<br />
                  João Silva;(62) 99999-9999;123.456.789-00;Mensal
                </code>
              </div>
            </div>
          )}

          {/* STEP 2: Preview + Column Mapping */}
          {step === 2 && (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>
                <strong>{rows.length}</strong> linhas encontradas em <strong>{fileName}</strong>. Mapeie as colunas:
              </p>

              {/* Mapping Dropdowns */}
              <div style={{
                display: 'grid', gridTemplateColumns: `repeat(${headers.length}, 1fr)`, gap: '8px',
                marginBottom: '16px'
              }}>
                {headers.map((header, colIdx) => (
                  <div key={colIdx}>
                    <div style={{
                      fontSize: '12px', fontWeight: '600', color: '#374151',
                      marginBottom: '4px', padding: '0 4px'
                    }}>
                      {header}
                    </div>
                    <select
                      value={mappingReverse[colIdx] || ''}
                      onChange={(e) => handleMappingChange(e.target.value, colIdx)}
                      style={{
                        width: '100%', padding: '8px 6px', border: '1px solid #d1d5db',
                        borderRadius: '6px', fontSize: '12px', backgroundColor: 'white',
                        color: mappingReverse[colIdx] ? '#1d4ed8' : '#6b7280',
                        fontWeight: mappingReverse[colIdx] ? '600' : '400'
                      }}
                    >
                      {FIELD_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview Table */}
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '8px 12px', backgroundColor: '#f9fafb', textAlign: 'left', color: '#6b7280', fontWeight: '500', borderBottom: '1px solid #e5e7eb' }}>#</th>
                      {headers.map((h, i) => (
                        <th key={i} style={{
                          padding: '8px 12px', backgroundColor: '#f9fafb', textAlign: 'left',
                          borderBottom: '1px solid #e5e7eb', fontWeight: '500',
                          color: mappingReverse[i] ? '#1d4ed8' : '#6b7280'
                        }}>
                          {mappingReverse[i] ? `${h} → ${FIELD_OPTIONS.find(o => o.value === mappingReverse[i])?.label}` : h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, rIdx) => (
                      <tr key={rIdx}>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', color: '#9ca3af' }}>{rIdx + 2}</td>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', color: '#374151' }}>
                            {cell || <span style={{ color: '#d1d5db' }}>-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 5 && (
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
                  ...e mais {rows.length - 5} linhas
                </p>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => { setStep(1); setRows([]); setHeaders([]) }} style={btnSecondary}>
                  Voltar
                </button>
                <button
                  onClick={runValidation}
                  disabled={!hasRequiredMapping}
                  style={{
                    ...btnPrimary,
                    opacity: hasRequiredMapping ? 1 : 0.5,
                    cursor: hasRequiredMapping ? 'pointer' : 'not-allowed'
                  }}
                >
                  Validar Dados
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Validation Results */}
          {step === 3 && (
            <div>
              {/* Summary Cards */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <div style={{
                  flex: 1, padding: '16px', borderRadius: '10px',
                  backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', textAlign: 'center'
                }}>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>
                    {validationResults.valid.length}
                  </div>
                  <div style={{ fontSize: '13px', color: '#166534' }}>Prontos</div>
                </div>
                <div style={{
                  flex: 1, padding: '16px', borderRadius: '10px',
                  backgroundColor: validationResults.invalid.length > 0 ? '#fef2f2' : '#f9fafb',
                  border: `1px solid ${validationResults.invalid.length > 0 ? '#fecaca' : '#e5e7eb'}`,
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: validationResults.invalid.length > 0 ? '#dc2626' : '#6b7280' }}>
                    {validationResults.invalid.length}
                  </div>
                  <div style={{ fontSize: '13px', color: validationResults.invalid.length > 0 ? '#991b1b' : '#6b7280' }}>Com erros</div>
                </div>
              </div>

              {/* Limit Warning */}
              {wouldExceedLimit && (
                <div style={{
                  padding: '12px 16px', marginBottom: '16px', borderRadius: '8px',
                  backgroundColor: '#fffbeb', border: '1px solid #fde68a',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <Icon icon="mdi:alert-outline" width="20" style={{ color: '#d97706', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: '#92400e' }}>
                    Seu plano permite {limiteClientes} clientes. Você tem {clientesAtivos} ativos.
                    Apenas <strong>{availableSlots}</strong> de {validationResults.valid.length} serão importados.
                  </span>
                </div>
              )}

              {/* Error Details */}
              {validationResults.invalid.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                    Erros encontrados:
                  </p>
                  <div style={{
                    maxHeight: '200px', overflowY: 'auto', borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    {validationResults.invalid.map((item, i) => (
                      <div key={i} style={{
                        padding: '10px 14px', borderBottom: '1px solid #f3f4f6',
                        display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '12px'
                      }}>
                        <span style={{
                          background: '#fee2e2', color: '#dc2626', padding: '2px 6px',
                          borderRadius: '4px', fontWeight: '600', fontSize: '11px', flexShrink: 0
                        }}>
                          Linha {item.rowIndex}
                        </span>
                        <span style={{ color: '#6b7280' }}>
                          {item.data.nome || '(sem nome)'} — {item.errors.join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setStep(2)} style={btnSecondary}>Voltar</button>
                <button
                  onClick={runImport}
                  disabled={validationResults.valid.length === 0}
                  style={{
                    ...btnPrimary,
                    opacity: validationResults.valid.length > 0 ? 1 : 0.5,
                    cursor: validationResults.valid.length > 0 ? 'pointer' : 'not-allowed'
                  }}
                >
                  <Icon icon="ph:download-simple-bold" width="16" />
                  Importar {Math.min(validationResults.valid.length, availableSlots)} clientes
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Results */}
          {step === 4 && !importing && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px'
              }}>
                <Icon icon="mdi:check-bold" width="32" style={{ color: 'white' }} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '700', color: '#1f2937' }}>
                Importação Concluída
              </h3>
              <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#6b7280' }}>
                <strong style={{ color: '#16a34a' }}>{importResults.imported}</strong> clientes importados
                {importResults.skipped > 0 && (
                  <span> · <strong style={{ color: '#d97706' }}>{importResults.skipped}</strong> não importados</span>
                )}
              </p>
              <button
                onClick={() => {
                  onImportComplete(importResults.imported)
                  handleClose()
                }}
                style={{ ...btnPrimary, margin: '0 auto' }}
              >
                Concluir
              </button>
            </div>
          )}

          {/* Importing Progress */}
          {importing && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Icon icon="mdi:loading" width="40" style={{ color: '#3b82f6', animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
              <p style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '500', color: '#374151' }}>
                Importando clientes...
              </p>
              <div style={{
                width: '100%', height: '8px', backgroundColor: '#e5e7eb',
                borderRadius: '4px', overflow: 'hidden'
              }}>
                <div style={{
                  width: `${importProgress}%`, height: '100%',
                  background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                  borderRadius: '4px', transition: 'width 0.3s'
                }} />
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#9ca3af' }}>
                {importProgress}%
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const btnPrimary = {
  padding: '10px 24px',
  border: 'none',
  borderRadius: '8px',
  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '600',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
}

const btnSecondary = {
  padding: '10px 24px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  backgroundColor: '#fff',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500',
  color: '#374151'
}
