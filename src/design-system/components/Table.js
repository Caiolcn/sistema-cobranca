import React from 'react'
import { Icon } from '@iconify/react'
import Checkbox from './Checkbox'
import './Table.css'

/* ============================================================
   Table — DS Mensalli

   Tabela declarativa: passa columns + data, ela renderiza.
   Suporta selectable (com bulk actions bar), loading skeleton,
   empty state, sticky header, striped, hoverable, clickable rows.

   Props:
     columns       — Array<{
                        key:    string,
                        label:  string ou ReactNode,
                        align?: 'left' | 'right' | 'center',
                        width?: string ou number,
                        render?: (row, index) => ReactNode  // opcional, default row[key]
                      }>
     data          — Array<row> (cada row é objeto)
     rowKey        — string (campo único pra identificar linha — default 'id')
     onRowClick    — função (row, index) → click na linha inteira
     selectable    — boolean — adiciona checkbox column + bulk actions bar
     selectedKeys  — array de keys selecionadas (controlled)
     onSelectionChange — função (keys[]) → quando muda
     bulkActions   — ReactNode (ações que aparecem na bulk bar)
     loading       — boolean
     loadingRows   — number (default 5)
     emptyTitle    — string
     emptyMessage  — string ou ReactNode
     emptyAction   — ReactNode (CTA opcional no empty state)
     emptyIcon     — string iconify (default mdi:tray)
     size          — 'sm' | 'md' (default)
     striped       — zebra (default false)
     hoverable     — hover muda linha (default true)
     stickyHeader  — header sticky no scroll (default false)

   Exemplo:
     <Table
       columns={[
         { key: 'nome', label: 'Cliente' },
         { key: 'valor', label: 'Valor', align: 'right',
           render: r => formatBRL(r.valor) },
         { key: 'status', label: 'Status', render: r =>
           <Badge variant={...}>{r.status}</Badge> },
       ]}
       data={cobrancas}
       rowKey="id"
       onRowClick={(r) => abre(r)}
       selectable
       selectedKeys={selected}
       onSelectionChange={setSelected}
       bulkActions={<Button>Excluir N</Button>}
     />
   ============================================================ */

export default function Table({
  columns = [],
  data = [],
  rowKey = 'id',
  onRowClick,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  bulkActions,
  loading = false,
  loadingRows = 5,
  emptyTitle = 'Nada por aqui',
  emptyMessage = 'Nenhum item encontrado.',
  emptyAction,
  emptyIcon = 'mdi:tray',
  size = 'md',
  striped = false,
  hoverable = true,
  stickyHeader = false,
  className = '',
  style,
}) {
  const tableClasses = [
    'ds-table',
    `ds-table--${size}`,
    striped && 'ds-table--striped',
    hoverable && 'ds-table--hoverable',
    onRowClick && 'ds-table--clickable',
    stickyHeader && 'ds-table--sticky',
  ].filter(Boolean).join(' ')

  const totalRows = data.length
  const selectedCount = selectedKeys.length
  const allSelected = totalRows > 0 && selectedCount === totalRows
  const someSelected = selectedCount > 0 && !allSelected

  function toggleAll() {
    if (allSelected) {
      onSelectionChange?.([])
    } else {
      onSelectionChange?.(data.map(r => r[rowKey]))
    }
  }

  function toggleRow(key) {
    if (selectedKeys.includes(key)) {
      onSelectionChange?.(selectedKeys.filter(k => k !== key))
    } else {
      onSelectionChange?.([...selectedKeys, key])
    }
  }

  function handleRowClick(row, index, e) {
    // Ignora clicks no checkbox ou em botões internos
    if (e.target.closest('[data-no-row-click]')) return
    if (e.target.closest('button')) return
    if (e.target.closest('a')) return
    if (e.target.tagName === 'INPUT') return
    onRowClick?.(row, index)
  }

  return (
    <div className={`ds-table-container ${className}`} style={style}>
      {selectable && selectedCount > 0 && (
        <div className="ds-bulk-actions">
          <span className="ds-bulk-actions__count">
            <Icon icon="mdi:check-circle" width={14} height={14} />
            {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
          </span>
          {bulkActions && (
            <div className="ds-bulk-actions__actions">{bulkActions}</div>
          )}
        </div>
      )}

      <div className="ds-table-scroll">
        <table className={tableClasses}>
          <thead>
            <tr>
              {selectable && (
                <th className="ds-table__checkbox-cell" data-no-row-click>
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                    aria-label="Selecionar todos"
                  />
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  className={col.align ? `ds-table__align-${col.align}` : undefined}
                  style={col.width ? { width: typeof col.width === 'number' ? `${col.width}px` : col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: loadingRows }).map((_, i) => (
                <tr key={`loading-${i}`}>
                  {selectable && (
                    <td className="ds-table__checkbox-cell">
                      <div className="ds-table__skeleton-cell" style={{ width: 16, height: 16, borderRadius: 4 }} />
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key} className={col.align ? `ds-table__align-${col.align}` : undefined}>
                      <div className="ds-table__skeleton-cell" style={{ width: `${60 + Math.random() * 35}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={(selectable ? 1 : 0) + columns.length} style={{ padding: 0, border: 0 }}>
                  <div className="ds-table-empty">
                    <div className="ds-table-empty__icon">
                      <Icon icon={emptyIcon} width={24} height={24} />
                    </div>
                    {emptyTitle && <div className="ds-table-empty__title">{emptyTitle}</div>}
                    {emptyMessage && <div className="ds-table-empty__description">{emptyMessage}</div>}
                    {emptyAction}
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const key = row[rowKey] ?? index
                const isSelected = selectable && selectedKeys.includes(key)
                return (
                  <tr
                    key={key}
                    className={isSelected ? 'ds-table__row--selected' : undefined}
                    onClick={onRowClick ? (e) => handleRowClick(row, index, e) : undefined}
                  >
                    {selectable && (
                      <td className="ds-table__checkbox-cell" data-no-row-click>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleRow(key)}
                          aria-label="Selecionar linha"
                        />
                      </td>
                    )}
                    {columns.map(col => (
                      <td key={col.key} className={col.align ? `ds-table__align-${col.align}` : undefined}>
                        {col.render ? col.render(row, index) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
