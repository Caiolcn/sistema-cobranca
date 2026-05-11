import { useState, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { corTextoContrastante } from '../utils/tagColors'

export default function TagInput({
  tags = [],
  onChange,
  tagsDisponiveis = [],
  onCriar,
  onEditar,
  onDeletar
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const containerRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleTag = (nome) => {
    if (tags.includes(nome)) {
      onChange(tags.filter(t => t !== nome))
    } else {
      onChange([...tags, nome])
    }
  }

  const removerTag = (nome) => {
    onChange(tags.filter(t => t !== nome))
  }

  const filtradas = tagsDisponiveis.filter(t =>
    t.nome.toLowerCase().includes(busca.toLowerCase())
  )

  const tagInfo = (nome) => tagsDisponiveis.find(t => t.nome === nome)

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger (campo "input") */}
      <div
        onClick={() => setAberto(!aberto)}
        style={{
          minHeight: '40px',
          padding: '6px 10px',
          border: `1px solid ${aberto ? '#3B82F6' : '#ddd'}`,
          borderRadius: '6px',
          backgroundColor: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '4px',
          boxShadow: aberto ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s'
        }}
      >
        {tags.length === 0 ? (
          <span style={{ color: '#999', fontSize: '14px', flex: 1 }}>Selecione tags...</span>
        ) : (
          tags.map(nome => {
            const info = tagInfo(nome)
            const cor = info?.cor || '#3B82F6'
            return (
              <span
                key={nome}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  backgroundColor: cor,
                  color: corTextoContrastante(cor),
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                {nome}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removerTag(nome) }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: corTextoContrastante(cor) }}
                  aria-label={`Remover ${nome}`}
                >
                  <Icon icon="mdi:close" width="14" />
                </button>
              </span>
            )
          })
        )}
        <Icon
          icon="mdi:chevron-down"
          width="18"
          style={{ marginLeft: 'auto', color: '#888', transform: aberto ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s' }}
        />
      </div>

      {/* Dropdown */}
      {aberto && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          zIndex: 100,
          overflow: 'hidden'
        }}>
          {/* Busca */}
          <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ position: 'relative' }}>
              <Icon icon="mdi:magnify" width="16" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 32px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Lista */}
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {filtradas.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
                {busca ? 'Nenhuma tag encontrada' : 'Nenhuma tag criada ainda'}
              </div>
            ) : (
              filtradas.map(tag => {
                const selecionada = tags.includes(tag.nome)
                return (
                  <div
                    key={tag.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      gap: '10px',
                      backgroundColor: selecionada ? '#f0f9ff' : 'white'
                    }}
                    onMouseEnter={(e) => { if (!selecionada) e.currentTarget.style.backgroundColor = '#f9fafb' }}
                    onMouseLeave={(e) => { if (!selecionada) e.currentTarget.style.backgroundColor = 'white' }}
                  >
                    <div
                      onClick={() => toggleTag(tag.nome)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}
                    >
                      <input
                        type="checkbox"
                        checked={selecionada}
                        readOnly
                        style={{ accentColor: '#3B82F6', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <span style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: tag.cor,
                        flexShrink: 0
                      }} />
                      <span style={{ fontSize: '13px', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tag.nome}
                      </span>
                    </div>
                    {onEditar && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditar(tag) }}
                        style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', color: '#888' }}
                        title="Editar tag"
                      >
                        <Icon icon="mdi:pencil-outline" width="15" />
                      </button>
                    )}
                    {onDeletar && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDeletar(tag) }}
                        style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', color: '#888' }}
                        title="Excluir tag"
                      >
                        <Icon icon="mdi:trash-can-outline" width="15" />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Footer: adicionar nova */}
          {onCriar && (
            <div
              onClick={() => onCriar(busca.trim())}
              style={{
                padding: '10px',
                borderTop: '1px solid #f0f0f0',
                cursor: 'pointer',
                textAlign: 'center',
                fontSize: '13px',
                color: '#3B82F6',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                backgroundColor: 'white'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              <Icon icon="mdi:plus" width="16" />
              Adicionar nova tag
            </div>
          )}
        </div>
      )}
    </div>
  )
}
