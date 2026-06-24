import { useState } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'

// ==========================================
// ModalidadePicker — seletor de modalidade da turma (Pilates, Yoga...).
// Mostra as modalidades existentes como pills clicáveis + opção de criar
// uma nova na hora. Compartilhado pelo modal de criar e de editar turma.
//
// Props:
//   userId          — conta dona da modalidade
//   modalidades     — lista [{ id, nome, cor }]
//   value           — modalidade_id selecionada ('' = nenhuma)
//   onChange(id)    — troca a seleção
//   onCriada(mod)   — avisa o pai que uma modalidade nova foi criada
// ==========================================

export const PALETA_MODALIDADE = [
  '#8b5cf6', '#0ea5e9', '#ec4899', '#10b981',
  '#f59e0b', '#ef4444', '#6366f1', '#14b8a6'
]

export default function ModalidadePicker({ userId, modalidades = [], value, onChange, onCriada }) {
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)

  const criar = async () => {
    const limpo = nome.trim()
    if (!limpo) { setCriando(false); setNome(''); return }

    // Se já existe (case-insensitive), só seleciona — não duplica
    const existente = modalidades.find(m => m.nome.toLowerCase() === limpo.toLowerCase())
    if (existente) {
      onChange(existente.id)
      setCriando(false); setNome('')
      return
    }

    setSalvando(true)
    const cor = PALETA_MODALIDADE[modalidades.length % PALETA_MODALIDADE.length]
    const { data, error } = await supabase.from('modalidades')
      .insert({ user_id: userId, nome: limpo, cor })
      .select('id, nome, cor')
      .single()
    setSalvando(false)

    if (error) {
      showToast('Erro ao criar modalidade: ' + error.message, 'error')
      return
    }
    onCriada?.(data)
    onChange(data.id)
    setCriando(false); setNome('')
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '8px' }}>
        Modalidade <span style={{ color: '#999', fontWeight: 400 }}>(opcional)</span>
      </label>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Nenhuma */}
        <button type="button" onClick={() => onChange('')}
          style={pillStyle(!value, '#64748b')}>
          Nenhuma
        </button>

        {/* Modalidades existentes */}
        {modalidades.map(m => {
          const sel = value === m.id
          return (
            <button type="button" key={m.id} onClick={() => onChange(m.id)}
              style={{
                ...pillStyle(sel, m.cor),
                display: 'inline-flex', alignItems: 'center', gap: '6px'
              }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: m.cor, flexShrink: 0 }} />
              {m.nome}
            </button>
          )
        })}

        {/* Criar nova */}
        {criando ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <input
              autoFocus
              value={nome}
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criar() } if (e.key === 'Escape') { setCriando(false); setNome('') } }}
              placeholder="Nome da modalidade"
              disabled={salvando}
              style={{
                padding: '6px 10px', border: '1px solid #344848', borderRadius: '999px',
                fontSize: '13px', outline: 'none', width: '160px'
              }}
            />
            <button type="button" onClick={criar} disabled={salvando} title="Adicionar"
              style={{ ...iconBtn, color: '#16a34a' }}>
              <Icon icon="mdi:check" width="18" />
            </button>
            <button type="button" onClick={() => { setCriando(false); setNome('') }} title="Cancelar"
              style={{ ...iconBtn, color: '#dc2626' }}>
              <Icon icon="mdi:close" width="18" />
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setCriando(true)}
            style={{
              ...pillStyle(false, '#344848'),
              borderStyle: 'dashed', display: 'inline-flex', alignItems: 'center', gap: '4px'
            }}>
            <Icon icon="mdi:plus" width="15" /> Nova
          </button>
        )}
      </div>
    </div>
  )
}

const pillStyle = (sel, cor) => ({
  padding: '6px 12px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
  cursor: 'pointer',
  border: sel ? `2px solid ${cor}` : '1px solid #e2e8f0',
  backgroundColor: sel ? cor + '1a' : '#fff',
  color: sel ? cor : '#475569'
})

const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '28px', height: '28px', borderRadius: '8px',
  border: 'none', background: 'none', cursor: 'pointer'
}
