import React from 'react'
import './Skeleton.css'

/* ============================================================
   Skeleton — DS Mensalli
   Peças: Skeleton (bloco), SkeletonCard, SkeletonListItem,
   SkeletonList, SkeletonTableRow, SkeletonTable, SkeletonDashboard.
   O arquivo antigo src/components/Skeleton.js só reexporta este.
   ============================================================ */

export const Skeleton = React.memo(function Skeleton({ width = '100%', height = '20px', borderRadius, style = {}, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`ds-skeleton ${className}`.trim()}
      style={{ width, height, ...(borderRadius ? { borderRadius } : null), ...style }}
    />
  )
})

export const SkeletonCard = React.memo(function SkeletonCard({ style = {} }) {
  return (
    <div className="ds-skeleton-card" style={style} aria-hidden="true">
      <Skeleton width="60%" height="14px" style={{ marginBottom: 'var(--space-3)' }} />
      <Skeleton width="80%" height="28px" style={{ marginBottom: 'var(--space-2)' }} />
      <Skeleton width="40%" height="12px" />
    </div>
  )
})

export const SkeletonListItem = React.memo(function SkeletonListItem() {
  return (
    <div className="ds-skeleton-list-item" aria-hidden="true">
      <div style={{ flex: 1, minWidth: 0 }}>
        <Skeleton width="140px" height="16px" style={{ marginBottom: 'var(--space-2)', maxWidth: '100%' }} />
        <Skeleton width="100px" height="12px" />
      </div>
      <Skeleton width="80px" height="24px" borderRadius="var(--radius-xl)" />
    </div>
  )
})

export const SkeletonList = React.memo(function SkeletonList({ count = 5 }) {
  return (
    <div className="ds-skeleton-list" role="status" aria-label="Carregando">
      {Array.from({ length: count }).map((_, i) => <SkeletonListItem key={i} />)}
    </div>
  )
})

export const SkeletonTableRow = React.memo(function SkeletonTableRow({ columns = 5 }) {
  return (
    <tr className="ds-skeleton-table-row" aria-hidden="true">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i}><Skeleton width={i === 0 ? '120px' : '80px'} height="16px" /></td>
      ))}
    </tr>
  )
})

export const SkeletonTable = React.memo(function SkeletonTable({ rows = 5, columns = 5 }) {
  return (
    <div role="status" aria-label="Carregando">
      <table className="ds-skeleton-table">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i}><Skeleton width="80px" height="14px" /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => <SkeletonTableRow key={i} columns={columns} />)}
        </tbody>
      </table>
    </div>
  )
})

export const SkeletonDashboard = React.memo(function SkeletonDashboard() {
  return (
    <div role="status" aria-label="Carregando">
      <div className="ds-skeleton-grid">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="ds-skeleton-card">
        <Skeleton width="30%" height="20px" style={{ marginBottom: 'var(--space-5)' }} />
        <Skeleton width="100%" height="200px" borderRadius="var(--radius-lg)" />
      </div>
    </div>
  )
})

export default Skeleton
