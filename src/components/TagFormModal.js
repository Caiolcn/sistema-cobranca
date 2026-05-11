import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { CORES_TAG, corTextoContrastante } from '../utils/tagColors'

export default function TagFormModal({ show, tag, onClose, onSave }) {
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES_TAG[0])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (show) {
      setNome(tag?.nome || '')
      setCor(tag?.cor || CORES_TAG[0])
      setSalvando(false)
    }
  }, [show, tag])

  if (!show) return null

  const handleSalvar = async () => {
    if (!nome.trim()) return
    setSalvando(true)
    try {
      await onSave({ nome: nome.trim(), cor })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 11000,
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
          maxWidth: '400px',
          padding: '20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1a1a1a' }}>
            {tag?.id ? 'Editar Tag' : 'Adicionar Tag'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <Icon icon="mdi:close" width="22" style={{ color: '#666' }} />
          </button>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#333' }}>
            Descrição <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSalvar() }}
            placeholder="Ex: Turma A"
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#333' }}>
            Cor
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {CORES_TAG.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: c,
                  border: cor === c ? '3px solid #1a1a1a' : '2px solid #e5e7eb',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'transform 0.1s',
                  transform: cor === c ? 'scale(1.1)' : 'scale(1)'
                }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#666' }}>Pré-visualização:</span>
            <span style={{
              padding: '4px 10px',
              borderRadius: '12px',
              backgroundColor: cor,
              color: corTextoContrastante(cor),
              fontSize: '12px',
              fontWeight: '500'
            }}>
              {nome.trim() || 'Tag'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 18px',
              backgroundColor: 'white',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={!nome.trim() || salvando}
            style={{
              padding: '10px 20px',
              backgroundColor: nome.trim() && !salvando ? '#344848' : '#ddd',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: nome.trim() && !salvando ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: '600'
            }}
          >
            {salvando ? 'Salvando...' : (tag?.id ? 'Salvar' : 'Adicionar')}
          </button>
        </div>
      </div>
    </div>
  )
}
