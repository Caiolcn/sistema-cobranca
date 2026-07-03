// ==========================================
// Fonte única das seções de Configuração.
// Consumida por:
//  - Configuracao.js  (abas internas / segmented control / select mobile)
//  - Dashboard.js     (dropdown da engrenagem no desktop + submenu mobile)
//  - components/ConfigMenu.js (dropdown reutilizável)
// Mantenha a ordem aqui = ordem exibida em todo lugar.
//
// Cada aba tem um `group`. A ordem dos grupos é definida em CONFIG_GROUPS e
// as abas abaixo já estão na ordem dos grupos (grupos contíguos), pra que
// qualquer consumidor que renderize a lista "crua" já saia agrupado.
// Use groupedConfigTabs() para renderizar com cabeçalhos de grupo.
// ==========================================

// `section` separa o que vive sob a engrenagem "Configurações" (config) do que
// vive no item "Marketing" do menu lateral (marketing). Mesmo componente
// Configuracao renderiza os dois, filtrando por seção.
export const CONFIG_GROUPS = [
  { id: 'negocio', label: 'Negócio', section: 'config' },
  { id: 'pagamentos', label: 'Pagamentos', section: 'config' },
  { id: 'marketing', label: 'Marketing', section: 'marketing' },
  { id: 'modelos', label: 'Modelos & Documentos', section: 'config' },
  { id: 'conta', label: 'Sua conta', section: 'config' }
]

export const CONFIG_TABS = [
  // Negócio
  { id: 'empresa', label: 'Dados da Empresa', icon: 'mdi:office-building-outline', group: 'negocio' },
  { id: 'planos', label: 'Planos', icon: 'mdi:package-variant-closed', group: 'negocio' },
  { id: 'colaboradores', label: 'Colaboradores', icon: 'mdi:account-tie-outline', group: 'negocio' },
  // Pagamentos
  { id: 'integracoes', label: 'Integrações', icon: 'mdi:connection', group: 'pagamentos' },
  // Marketing
  { id: 'artes', label: 'Artes', icon: 'mdi:palette-outline', group: 'marketing' },
  { id: 'landing', label: 'Site', icon: 'mdi:web', group: 'marketing' },
  { id: 'agendamento', label: 'Agendamento Online', icon: 'mdi:calendar-cursor', group: 'marketing' },
  // Modelos & Documentos
  { id: 'anamnese', label: 'Anamnese', icon: 'mdi:clipboard-text-outline', group: 'modelos' },
  { id: 'contratos', label: 'Contratos', icon: 'mdi:file-document-outline', group: 'modelos' },
  // Sua conta
  { id: 'upgrade', label: 'Upgrade de Plano', icon: 'mdi:rocket-launch-outline', group: 'conta' }
]

// Agrupa CONFIG_TABS na ordem de CONFIG_GROUPS, descartando grupos vazios.
// Passe `section` ('config' | 'marketing') para restringir a uma seção;
// sem argumento, retorna todos os grupos.
// Retorna: [{ id, label, section, items: [...tabs] }]
export function groupedConfigTabs(section) {
  return CONFIG_GROUPS
    .filter((g) => !section || g.section === section)
    .map((g) => ({ ...g, items: CONFIG_TABS.filter((t) => t.group === g.id) }))
    .filter((g) => g.items.length > 0)
}

// IDs das abas de uma seção, na ordem exibida.
export function configTabIds(section) {
  return groupedConfigTabs(section).flatMap((g) => g.items.map((i) => i.id))
}
