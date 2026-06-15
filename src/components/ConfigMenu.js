import { Icon } from '@iconify/react'
import { CONFIG_TABS } from '../configTabs'

// ============================================================
// ConfigMenu — dropdown reutilizável das seções de Configuração.
// Lista CONFIG_TABS com ícone + label, destaca a aba ativa.
// Reutilizável em desktop (engrenagem da topbar) e mobile.
//
// Props:
//   open       — boolean, controla visibilidade
//   onClose()  — fecha o menu (clique fora / após selecionar)
//   onSelect(id) — chamado com o id da aba escolhida
//   activeId   — id da aba atualmente ativa (highlight)
//   anchorStyle — posicionamento do painel (ex: { top: 46, right: 0 })
//                 O painel é position:absolute; o pai deve ser position:relative.
// ============================================================

export default function ConfigMenu({ open, onClose, onSelect, activeId, anchorStyle = {} }) {
  if (!open) return null

  return (
    <>
      {/* Backdrop transparente — clique fora fecha */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200 }} />

      <div style={{
        position: 'absolute', zIndex: 1201, minWidth: '236px',
        backgroundColor: '#fff', borderRadius: '12px',
        border: '1px solid #eee', boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
        padding: '6px', ...anchorStyle
      }}>
        <div style={{
          fontSize: '11px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase',
          letterSpacing: '0.4px', padding: '8px 10px 6px'
        }}>
          Configurações
        </div>

        {CONFIG_TABS.map((item) => {
          const ativo = item.id === activeId
          return (
            <button
              key={item.id}
              onClick={() => { onSelect(item.id); onClose() }}
              style={{
                width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 10px', borderRadius: '8px', marginBottom: '1px',
                fontSize: '13px', fontWeight: ativo ? '600' : '500',
                color: ativo ? '#4338ca' : '#444',
                backgroundColor: ativo ? '#eef2ff' : 'transparent',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => { if (!ativo) e.currentTarget.style.backgroundColor = '#f5f5f5' }}
              onMouseLeave={(e) => { if (!ativo) e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <Icon icon={item.icon} width="18" height="18" style={{ flexShrink: 0 }} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
