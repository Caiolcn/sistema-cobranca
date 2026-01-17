import React from 'react'

const shimmerStyle = `
  @keyframes shimmer {
    0% {
      background-position: -200px 0;
    }
    100% {
      background-position: calc(200px + 100%) 0;
    }
  }
`

const baseStyle = {
  backgroundColor: '#e0e0e0',
  backgroundImage: 'linear-gradient(90deg, #e0e0e0 0%, #f5f5f5 50%, #e0e0e0 100%)',
  backgroundSize: '200px 100%',
  backgroundRepeat: 'no-repeat',
  animation: 'shimmer 1.5s ease-in-out infinite',
  borderRadius: '4px'
}

export function Skeleton({ width = '100%', height = '20px', borderRadius, style = {} }) {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div
        style={{
          ...baseStyle,
          width,
          height,
          borderRadius: borderRadius || '4px',
          ...style
        }}
      />
    </>
  )
}

export function SkeletonCard({ style = {} }) {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          ...style
        }}
      >
        <Skeleton width="60%" height="14px" style={{ marginBottom: '12px' }} />
        <Skeleton width="80%" height="28px" style={{ marginBottom: '8px' }} />
        <Skeleton width="40%" height="12px" />
      </div>
    </>
  )
}

export function SkeletonTableRow({ columns = 5 }) {
  return (
    <>
      <style>{shimmerStyle}</style>
      <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
        {Array.from({ length: columns }).map((_, i) => (
          <td key={i} style={{ padding: '16px 20px' }}>
            <Skeleton width={i === 0 ? '120px' : '80px'} height="16px" />
          </td>
        ))}
      </tr>
    </>
  )
}

export function SkeletonListItem() {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ flex: 1 }}>
          <Skeleton width="140px" height="16px" style={{ marginBottom: '8px' }} />
          <Skeleton width="100px" height="12px" />
        </div>
        <Skeleton width="80px" height="24px" borderRadius="12px" />
      </div>
    </>
  )
}

export function SkeletonDashboard() {
  return (
    <>
      <style>{shimmerStyle}</style>
      {/* Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Chart area */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        <Skeleton width="30%" height="20px" style={{ marginBottom: '20px' }} />
        <Skeleton width="100%" height="200px" borderRadius="8px" />
      </div>
    </>
  )
}

export function SkeletonList({ count = 5 }) {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonListItem key={i} />
        ))}
      </div>
    </>
  )
}

export function SkeletonTable({ rows = 5, columns = 5 }) {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9' }}>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} style={{ padding: '16px 20px', textAlign: 'left' }}>
                  <Skeleton width="80px" height="14px" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonTableRow key={i} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default Skeleton
