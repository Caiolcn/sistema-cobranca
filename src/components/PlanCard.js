export default function PlanCard({ plano, limite, preco, descricao, popular, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: selected ? '3px solid #667eea' : popular ? '2px solid #22c55e' : '2px solid #e0e0e0',
        borderRadius: '12px',
        padding: '20px',
        cursor: 'pointer',
        backgroundColor: selected ? '#f0f4ff' : 'white',
        transition: 'all 0.2s',
        marginBottom: '16px',
        position: 'relative'
      }}
    >
      {popular && (
        <div style={{
          position: 'absolute',
          top: '-10px',
          right: '16px',
          backgroundColor: '#22c55e',
          color: 'white',
          padding: '4px 12px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: '600'
        }}>
          Mais popular
        </div>
      )}
      <h3 style={{ margin: '0 0 8px 0', color: '#333', textTransform: 'capitalize' }}>
        {plano}
      </h3>
      <p style={{ margin: '0 0 8px 0', color: '#333', fontSize: '24px', fontWeight: 'bold' }}>
        {preco}
      </p>
      <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
        {descricao && <span>{descricao} • </span>}
        {limite} mensagens/mês
      </p>
      {selected && (
        <div style={{ marginTop: '12px', color: '#667eea', fontSize: '14px', fontWeight: '500' }}>
          ✓ Plano selecionado
        </div>
      )}
    </div>
  )
}
