// ==========================================
// Fonte única das seções de Configuração.
// Consumida por:
//  - Configuracao.js  (abas internas / segmented control / select mobile)
//  - Dashboard.js     (dropdown da engrenagem no desktop + submenu mobile)
//  - components/ConfigMenu.js (dropdown reutilizável)
// Mantenha a ordem aqui = ordem exibida em todo lugar.
// ==========================================

export const CONFIG_TABS = [
  { id: 'empresa', label: 'Dados da Empresa', icon: 'mdi:office-building-outline' },
  { id: 'planos', label: 'Planos', icon: 'mdi:package-variant-closed' },
  { id: 'integracoes', label: 'Integrações', icon: 'mdi:connection' },
  { id: 'upgrade', label: 'Upgrade de Plano', icon: 'mdi:rocket-launch-outline' },
  { id: 'agendamento', label: 'Agendamento Online', icon: 'mdi:calendar-cursor' },
  { id: 'colaboradores', label: 'Colaboradores', icon: 'mdi:account-tie-outline' },
  { id: 'landing', label: 'Site', icon: 'mdi:web' },
  { id: 'anamnese', label: 'Anamnese', icon: 'mdi:clipboard-text-outline' },
  { id: 'contratos', label: 'Contratos', icon: 'mdi:file-document-outline' }
]
