// ==========================================
// AgendaNovaPartes — helpers visuais compartilhados entre as views da
// Agenda Nova (AgendaNovaSemana, AgendaNovaDia).
// Mantém visual consistente entre desktop e mobile.
// ==========================================

// Paleta determinística por nome — mesmo aluno = mesma cor sempre.
export const PALETA_ALUNO = [
  { bg: '#ede9fe', text: '#5b21b6' }, // violet
  { bg: '#dbeafe', text: '#1e40af' }, // blue
  { bg: '#dcfce7', text: '#166534' }, // green
  { bg: '#fef3c7', text: '#854d0e' }, // amber
  { bg: '#fce7f3', text: '#9f1239' }, // pink
  { bg: '#e0e7ff', text: '#3730a3' }, // indigo
  { bg: '#fed7aa', text: '#9a3412' }, // orange
  { bg: '#cffafe', text: '#155e75' }  // cyan
]

export const corDoAluno = (nome) => {
  if (!nome) return PALETA_ALUNO[0]
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) | 0
  return PALETA_ALUNO[Math.abs(hash) % PALETA_ALUNO.length]
}

// AvatarStack — pilha de iniciais/fotos dos alunos com "+N" quando exceder max.
// Tooltip do container mostra "X/Y alunos"; tooltip de cada avatar mostra o nome.
// `size` permite ajustar dimensão (default 18px, ideal pra card compacto).
export function AvatarStack({ roster, max = 3, capacidade, size = 18 }) {
  if (!roster || roster.length === 0) {
    return (
      <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '500' }}>
        0/{capacidade}
      </span>
    )
  }
  const shown = roster.slice(0, max)
  const extra = roster.length - shown.length
  const overlap = Math.max(4, Math.round(size * 0.28))
  const fontSize = Math.max(8, Math.round(size * 0.48))
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}
      title={`${roster.length}/${capacidade} alunos`}>
      {shown.map((r, i) => {
        const nome = r.devedores?.nome || '?'
        const inicial = nome.charAt(0).toUpperCase()
        const c = corDoAluno(nome)
        const foto = r.devedores?.foto_url
        return (
          <div key={(r.devedorId || '') + i}
            title={nome}
            style={{
              width: `${size}px`, height: `${size}px`, borderRadius: '50%',
              backgroundColor: c.bg, color: c.text,
              border: '1.5px solid #fff',
              marginLeft: i === 0 ? 0 : `-${overlap}px`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: `${fontSize}px`, fontWeight: '700',
              overflow: 'hidden',
              flexShrink: 0,
              zIndex: max - i
            }}>
            {foto
              ? <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = inicial }} />
              : inicial}
          </div>
        )
      })}
      {extra > 0 && (
        <div style={{
          height: `${size}px`, padding: `0 ${Math.max(4, Math.round(size * 0.28))}px`,
          borderRadius: `${size / 2}px`,
          backgroundColor: '#f1f5f9',
          border: '1.5px solid #fff',
          marginLeft: `-${overlap}px`,
          display: 'flex', alignItems: 'center',
          fontSize: `${fontSize}px`, fontWeight: '700',
          color: '#475569',
          flexShrink: 0,
          zIndex: 0
        }}>
          +{extra}
        </div>
      )}
    </div>
  )
}
