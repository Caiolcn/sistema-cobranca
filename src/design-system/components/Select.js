import React, { useState, useRef, useEffect, useId, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import './Select.css'

/* ============================================================
   Select — DS Mensalli

   Trigger visualmente igual ao Input + chevron.
   Dropdown custom (não nativo) com:
     - search (opcional via `searchable`)
     - multi-select com chips (opcional via `multiple`)
     - create inline (opcional via `onCreate`)
     - keyboard nav (↑/↓/Enter/Esc)
     - a11y (aria-listbox, aria-option, aria-expanded)

   Props (estrutura):
     label, helper, error, required

   Props (dados):
     options       — Array<{ value: string, label: string, icon?: string|ReactNode, disabled?: boolean }>
     value         — string (single) ou string[] (multiple)
     onChange(val) — recebe value novo (string ou string[])
     placeholder   — texto quando vazio

   Props (features opcionais):
     searchable           — mostra search no topo do dropdown
     multiple             — múltiplas seleções, mostra chips
     clearable            — botão X pra limpar (single only)
     onCreate(text)       — habilita footer "+ Adicionar"
     createLabel          — label do botão create ("Novo X")
     searchPlaceholder    — placeholder do input de search
     emptyMessage         — quando lista filtrada vazia

   Props (forma):
     size: 'sm' | 'md' | 'lg'
     fullWidth
     icon                 — ícone à esquerda do trigger
     disabled

   Exemplos:
     <Select options={statuses} value={s} onChange={setS} placeholder="Status" />
     <Select options={clientes} value={cli} onChange={setCli} searchable />
     <Select options={tags} value={tags} onChange={setTags} multiple />
     <Select options={cats} value={c} onChange={setC} onCreate={...} createLabel="Nova categoria" />
   ============================================================ */

function renderIcon(icon, size = 18) {
  if (!icon) return null
  if (typeof icon === 'string') return <Icon icon={icon} width={size} height={size} />
  return icon
}

export default function Select({
  // Estrutura
  label,
  helper,
  error,
  required = false,

  // Dados
  options = [],
  value,
  onChange,
  placeholder = 'Selecionar…',

  // Features
  searchable = false,
  multiple = false,
  clearable = false,
  onCreate,
  createLabel = 'Adicionar novo',
  searchPlaceholder = 'Buscar…',
  emptyMessage = 'Nenhum resultado',

  // Forma
  size = 'md',
  fullWidth = true,
  icon,
  disabled = false,

  // Quando true, renderiza o dropdown via portal (document.body) com
  // position:fixed calculado — não afeta a altura do container pai
  // (útil dentro de modais com overflow:auto).
  portal = false,

  id: idProp,
  className = '',
  style,
}) {
  const autoId = useId()
  const id = idProp || `ds-select-${autoId}`

  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const fieldRef = useRef(null)
  const triggerRef = useRef(null)
  const searchInputRef = useRef(null)
  const dropdownRef = useRef(null)

  // Posição do dropdown no modo portal (position: fixed)
  const [portalPos, setPortalPos] = useState({ top: 0, left: 0, width: 0 })

  const recalcPortalPos = () => {
    if (!portal || !fieldRef.current) return
    const rect = fieldRef.current.getBoundingClientRect()
    const margin = 8
    const vw = window.innerWidth
    const width = Math.max(220, rect.width)
    let left = rect.left
    if (left + width > vw - margin) left = vw - width - margin
    if (left < margin) left = margin
    setPortalPos({ top: rect.bottom + 4, left, width })
  }

  useEffect(() => {
    if (!isOpen) return
    recalcPortalPos()
    if (!portal) return
    window.addEventListener('scroll', recalcPortalPos, true)
    window.addEventListener('resize', recalcPortalPos)
    return () => {
      window.removeEventListener('scroll', recalcPortalPos, true)
      window.removeEventListener('resize', recalcPortalPos)
    }
    // eslint-disable-next-line
  }, [isOpen, portal])

  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 20 : 18
  const isMulti = multiple === true
  const selectedValues = isMulti ? (Array.isArray(value) ? value : []) : (value !== undefined && value !== null && value !== '' ? [value] : [])
  const hasValue = selectedValues.length > 0

  // Filtra options por busca
  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery.trim()) return options
    const q = searchQuery.trim().toLowerCase()
    return options.filter(opt => opt.label.toLowerCase().includes(q))
  }, [options, searchable, searchQuery])

  // Click fora fecha
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e) {
      if (fieldRef.current && !fieldRef.current.contains(e.target)
        && !(dropdownRef.current && dropdownRef.current.contains(e.target))) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Foca search quando abre
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      // pequeno delay pra animação de abertura completar
      const timer = setTimeout(() => searchInputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
    if (!isOpen) {
      setSearchQuery('')
      setHighlightedIndex(-1)
    }
  }, [isOpen, searchable])

  // Reseta highlight quando filtra
  useEffect(() => {
    if (filteredOptions.length > 0 && highlightedIndex >= filteredOptions.length) {
      setHighlightedIndex(0)
    }
  }, [filteredOptions.length, highlightedIndex])

  function toggleOpen() {
    if (disabled) return
    setIsOpen(o => !o)
  }

  function handleSelectOption(option) {
    if (option.disabled) return
    if (isMulti) {
      const isAlreadySelected = selectedValues.includes(option.value)
      const newValue = isAlreadySelected
        ? selectedValues.filter(v => v !== option.value)
        : [...selectedValues, option.value]
      onChange?.(newValue)
      // mantém dropdown aberto em multi
    } else {
      onChange?.(option.value)
      setIsOpen(false)
    }
  }

  function handleRemoveChip(valToRemove, e) {
    e.stopPropagation()
    if (disabled) return
    onChange?.(selectedValues.filter(v => v !== valToRemove))
  }

  function handleClear(e) {
    e.stopPropagation()
    if (disabled) return
    onChange?.(isMulti ? [] : '')
  }

  function handleKeyDown(e) {
    if (disabled) return

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        triggerRef.current?.focus()
        break
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(i => {
          const next = i + 1
          if (next >= filteredOptions.length) return 0
          return next
        })
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(i => {
          const prev = i - 1
          if (prev < 0) return filteredOptions.length - 1
          return prev
        })
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelectOption(filteredOptions[highlightedIndex])
        }
        break
      default:
        break
    }
  }

  // Resolve label do valor atual (single)
  const selectedOption = !isMulti
    ? options.find(o => o.value === selectedValues[0])
    : null

  // Multi: lista de options selecionadas pra chips
  const selectedChips = isMulti
    ? selectedValues.map(v => options.find(o => o.value === v)).filter(Boolean)
    : []

  const triggerClasses = [
    'ds-select-trigger',
    `ds-select-trigger--${size}`,
    isOpen && 'ds-select-trigger--open',
    error && 'ds-select-trigger--error',
    icon && 'ds-select-trigger--has-icon',
  ].filter(Boolean).join(' ')

  const messageId = error ? `${id}-error` : (helper ? `${id}-helper` : undefined)

  return (
    <div
      ref={fieldRef}
      className={`ds-select-field ${className}`}
      style={{ width: fullWidth ? '100%' : 'auto', ...style }}
      onKeyDown={handleKeyDown}
    >
      {label && (
        <label htmlFor={id} className="ds-select-label">
          {label}
          {required && <span className="ds-select-label__required" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="ds-select-control">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={triggerClasses}
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-describedby={messageId}
      >
        {icon && (
          <span className="ds-select-icon-left" aria-hidden="true">
            {renderIcon(icon, iconSize)}
          </span>
        )}

        <span className="ds-select-content">
          {isMulti ? (
            selectedChips.length > 0 ? (
              <span className="ds-select-chips">
                {selectedChips.map(opt => (
                  <span key={opt.value} className="ds-select-chip">
                    {opt.label}
                    <button
                      type="button"
                      className="ds-select-chip-remove"
                      onClick={(e) => handleRemoveChip(opt.value, e)}
                      aria-label={`Remover ${opt.label}`}
                      tabIndex={-1}
                    >
                      <Icon icon="mdi:close" width={12} height={12} />
                    </button>
                  </span>
                ))}
              </span>
            ) : (
              <span className="ds-select-placeholder">{placeholder}</span>
            )
          ) : (
            selectedOption ? (
              <span className="ds-select-value-text">
                {selectedOption.icon && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 6 }}>
                    {renderIcon(selectedOption.icon, iconSize)}
                  </span>
                )}
                {selectedOption.label}
              </span>
            ) : (
              <span className="ds-select-placeholder">{placeholder}</span>
            )
          )}
        </span>

        {clearable && hasValue && !isMulti && (
          <button
            type="button"
            className="ds-select-clear"
            onClick={handleClear}
            aria-label="Limpar"
            tabIndex={-1}
          >
            <Icon icon="mdi:close-circle" width={iconSize} height={iconSize} />
          </button>
        )}

        <span className="ds-select-chevron" aria-hidden="true">
          <Icon icon="mdi:chevron-down" width={iconSize} height={iconSize} />
        </span>
      </button>

      {isOpen && (() => {
        const dropdown = (
        <div ref={dropdownRef} className="ds-select-dropdown" role="presentation"
          style={portal ? {
            position: 'fixed', top: portalPos.top, left: portalPos.left,
            width: portalPos.width, zIndex: 10100
          } : undefined}>
          {searchable && (
            <div className="ds-select-search">
              <span className="ds-select-search-icon">
                <Icon icon="mdi:magnify" width={16} height={16} />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                className="ds-select-search-input"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Permite o keyDown do field handler processar arrows/enter/esc
                  // mas evita perder foco do search
                  if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
                    e.stopPropagation()
                    handleKeyDown(e)
                  }
                }}
              />
            </div>
          )}

          {filteredOptions.length > 0 ? (
            <ul className="ds-select-list" role="listbox" aria-multiselectable={isMulti}>
              {filteredOptions.map((opt, idx) => {
                const isSelected = selectedValues.includes(opt.value)
                const isHighlighted = idx === highlightedIndex
                const classes = [
                  'ds-select-option',
                  isSelected && 'ds-select-option--selected',
                  isHighlighted && 'ds-select-option--highlighted',
                  opt.disabled && 'ds-select-option--disabled',
                ].filter(Boolean).join(' ')

                return (
                  <li
                    key={opt.value}
                    className={classes}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    onClick={() => handleSelectOption(opt)}
                  >
                    {opt.icon && (
                      <span className="ds-select-option-icon">
                        {renderIcon(opt.icon, 16)}
                      </span>
                    )}
                    <span className="ds-select-option-label">{opt.label}</span>
                    {isSelected && (
                      <span className="ds-select-option-check" aria-hidden="true">
                        <Icon icon="mdi:check" width={16} height={16} />
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="ds-select-empty">{emptyMessage}</div>
          )}

          {onCreate && (
            <button
              type="button"
              className="ds-select-create"
              onClick={() => {
                onCreate(searchQuery)
                if (!isMulti) setIsOpen(false)
              }}
            >
              <span className="ds-select-create-icon">
                <Icon icon="mdi:plus" width={16} height={16} />
              </span>
              {createLabel}{searchQuery ? `: "${searchQuery}"` : ''}
            </button>
          )}
        </div>
        )
        return portal ? createPortal(dropdown, document.body) : dropdown
      })()}
      </div>{/* /ds-select-control */}

      {(error || helper) && (
        error ? (
          <span id={`${id}-error`} className="ds-select-message ds-select-message--error" role="alert">
            {error}
          </span>
        ) : (
          <span id={`${id}-helper`} className="ds-select-message">{helper}</span>
        )
      )}
    </div>
  )
}
