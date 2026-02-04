import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useUser } from './contexts/UserContext'
import { showToast } from './Toast'
import { Icon } from '@iconify/react'
import { validarTelefone } from './utils/validators'
import CsvImportModal from './components/CsvImportModal'
import './Onboarding.css'

const STEPS = [
  { num: 1, title: 'Sua Empresa', icon: 'mdi:office-building-outline' },
  { num: 2, title: 'Chave PIX', icon: 'mdi:qrcode' },
  { num: 3, title: 'Primeiro Plano', icon: 'mdi:package-variant-closed' },
  { num: 4, title: 'Clientes', icon: 'mdi:account-group-outline' }
]

export default function Onboarding() {
  const navigate = useNavigate()
  const { userId, userData, refreshUserData } = useUser()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1
  const [nomeEmpresa, setNomeEmpresa] = useState('')

  // Step 2
  const [chavePix, setChavePix] = useState('')
  const [tipoChavePix, setTipoChavePix] = useState('cpf')

  // Step 3
  const [planoNome, setPlanoNome] = useState('')
  const [planoValor, setPlanoValor] = useState('')

  // Step 4
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [clientesCriados, setClientesCriados] = useState([])
  const [mostrarCsvImport, setMostrarCsvImport] = useState(false)
  const [planosCriados, setPlanosCriados] = useState([])

  // Retomar step salvo
  useEffect(() => {
    if (userData) {
      const savedStep = userData.onboarding_step || 0
      if (savedStep > 0 && savedStep < 4) {
        setStep(savedStep + 1)
      }
      if (userData.nome_empresa) setNomeEmpresa(userData.nome_empresa)
      if (userData.chave_pix) setChavePix(userData.chave_pix)
    }
  }, [userData])

  // Carregar planos criados
  useEffect(() => {
    if (userId) {
      supabase.from('planos').select('id, nome, valor').eq('user_id', userId).eq('ativo', true)
        .then(({ data }) => { if (data) setPlanosCriados(data) })
    }
  }, [userId])

  const saveStep = async (stepNum) => {
    await supabase.from('usuarios').update({ onboarding_step: stepNum }).eq('id', userId)
  }

  const finishOnboarding = async () => {
    await supabase.from('usuarios').update({
      onboarding_completed: true,
      onboarding_step: 4
    }).eq('id', userId)
    await refreshUserData()
    navigate('/app/home', { replace: true })
  }

  // Step 1: Salvar nome da empresa
  const handleStep1Next = async () => {
    if (!nomeEmpresa.trim()) {
      showToast('Informe o nome da sua empresa', 'warning')
      return
    }
    setSaving(true)
    await supabase.from('usuarios').update({ nome_empresa: nomeEmpresa.trim() }).eq('id', userId)
    await saveStep(1)
    await refreshUserData()
    setSaving(false)
    setStep(2)
  }

  // Step 2: Salvar chave PIX
  const handleStep2Next = async () => {
    if (chavePix.trim()) {
      setSaving(true)
      await supabase.from('usuarios').update({ chave_pix: chavePix.trim() }).eq('id', userId)
      await refreshUserData()
      setSaving(false)
    }
    await saveStep(2)
    setStep(3)
  }

  // Step 3: Criar primeiro plano
  const handleStep3Next = async () => {
    if (planoNome.trim() && planoValor) {
      // Evitar duplicata se usuario voltou e avancou de novo
      const jaExiste = planosCriados.some(p => p.nome === planoNome.trim())
      if (jaExiste) {
        await saveStep(3)
        setStep(4)
        return
      }

      const valor = parseFloat(planoValor)
      if (valor <= 0) {
        showToast('Valor deve ser maior que zero', 'warning')
        return
      }
      setSaving(true)
      const { data, error } = await supabase.from('planos').insert({
        user_id: userId,
        nome: planoNome.trim(),
        valor,
        ativo: true
      }).select()

      if (!error && data) {
        setPlanosCriados(prev => [...prev, data[0]])
        showToast(`Plano "${planoNome}" criado!`, 'success')
      }
      setSaving(false)
    }
    await saveStep(3)
    setStep(4)
  }

  // Step 4: Adicionar cliente manual
  const handleAdicionarCliente = async () => {
    if (!clienteNome.trim()) {
      showToast('Informe o nome do cliente', 'warning')
      return
    }
    if (!validarTelefone(clienteTelefone)) {
      showToast('Telefone inválido', 'warning')
      return
    }

    setSaving(true)
    const { data, error } = await supabase.from('devedores').insert({
      user_id: userId,
      nome: clienteNome.trim(),
      telefone: clienteTelefone.replace(/\D/g, ''),
      assinatura_ativa: false,
      valor_devido: 0,
      data_vencimento: new Date().toISOString().split('T')[0],
      status: 'pendente',
      portal_token: crypto.randomUUID().replace(/-/g, '')
    }).select()

    if (!error && data) {
      setClientesCriados(prev => [...prev, data[0]])
      setClienteNome('')
      setClienteTelefone('')
      showToast('Cliente adicionado!', 'success')
    } else {
      showToast('Erro ao adicionar cliente', 'error')
    }
    setSaving(false)
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        {/* Logo */}
        <div className="onboarding-logo">
          <span className="onboarding-logo-text">Mensalli</span>
        </div>

        {/* Progress Steps */}
        <div className="onboarding-steps">
          {STEPS.map((s) => (
            <div key={s.num} className={`onboarding-step-item ${s.num < step ? 'completed' : ''} ${s.num === step ? 'active' : ''}`}>
              <div className="onboarding-step-circle">
                {s.num < step ? (
                  <Icon icon="mdi:check" width="16" />
                ) : (
                  <Icon icon={s.icon} width="16" />
                )}
              </div>
              <span className="onboarding-step-label">{s.title}</span>
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="onboarding-content">

          {/* STEP 1: Nome da Empresa */}
          {step === 1 && (
            <div className="onboarding-step-content">
              <div className="onboarding-step-header">
                <h2>Como se chama sua empresa?</h2>
                <p>Esse nome aparecerá nas cobranças enviadas aos seus clientes.</p>
              </div>
              <div className="onboarding-field">
                <label>Nome da Empresa</label>
                <input
                  type="text"
                  value={nomeEmpresa}
                  onChange={(e) => setNomeEmpresa(e.target.value)}
                  placeholder="Ex: Studio Pilates Maria"
                  autoFocus
                />
              </div>
              <div className="onboarding-actions">
                <div />
                <button className="onboarding-btn-primary" onClick={handleStep1Next} disabled={saving}>
                  {saving ? 'Salvando...' : 'Continuar'}
                  <Icon icon="mdi:arrow-right" width="18" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Chave PIX */}
          {step === 2 && (
            <div className="onboarding-step-content">
              <div className="onboarding-step-header">
                <h2>Configure sua chave PIX</h2>
                <p>Usada para gerar links de pagamento automaticamente.</p>
              </div>
              <div className="onboarding-field">
                <label>Tipo da Chave</label>
                <select value={tipoChavePix} onChange={(e) => setTipoChavePix(e.target.value)}>
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                  <option value="aleatoria">Chave Aleatória</option>
                </select>
              </div>
              <div className="onboarding-field">
                <label>Chave PIX</label>
                <input
                  type="text"
                  value={chavePix}
                  onChange={(e) => setChavePix(e.target.value)}
                  placeholder={tipoChavePix === 'cpf' ? '000.000.000-00' : tipoChavePix === 'email' ? 'seu@email.com' : 'Sua chave PIX'}
                />
              </div>
              <div className="onboarding-actions">
                <button className="onboarding-btn-secondary" onClick={() => setStep(1)}>Voltar</button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="onboarding-btn-skip" onClick={async () => { await saveStep(2); setStep(3) }}>
                    Pular
                  </button>
                  <button className="onboarding-btn-primary" onClick={handleStep2Next} disabled={saving}>
                    {saving ? 'Salvando...' : 'Continuar'}
                    <Icon icon="mdi:arrow-right" width="18" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Primeiro Plano */}
          {step === 3 && (
            <div className="onboarding-step-content">
              <div className="onboarding-step-header">
                <h2>Crie seu primeiro plano</h2>
                <p>Defina o plano de cobrança que você oferece aos clientes.</p>
              </div>
              <div className="onboarding-fields-row">
                <div className="onboarding-field" style={{ flex: 2 }}>
                  <label>Nome do Plano</label>
                  <input
                    type="text"
                    value={planoNome}
                    onChange={(e) => setPlanoNome(e.target.value)}
                    placeholder="Ex: Mensal, Pilates 3x"
                    autoFocus
                  />
                </div>
                <div className="onboarding-field" style={{ flex: 1 }}>
                  <label>Valor (R$)</label>
                  <input
                    type="number"
                    value={planoValor}
                    onChange={(e) => setPlanoValor(e.target.value)}
                    placeholder="150,00"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              <div className="onboarding-actions">
                <button className="onboarding-btn-secondary" onClick={() => setStep(2)}>Voltar</button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="onboarding-btn-skip" onClick={async () => { await saveStep(3); setStep(4) }}>
                    Pular
                  </button>
                  <button className="onboarding-btn-primary" onClick={handleStep3Next} disabled={saving}>
                    {saving ? 'Salvando...' : 'Criar e Continuar'}
                    <Icon icon="mdi:arrow-right" width="18" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Adicionar Clientes */}
          {step === 4 && (
            <div className="onboarding-step-content">
              <div className="onboarding-step-header">
                <h2>Adicione seus clientes</h2>
                <p>Cadastre manualmente ou importe de uma planilha.</p>
              </div>

              {/* Opcoes como cards */}
              <div className="onboarding-option-cards">
                {/* Card: Adicionar manual */}
                <div className="onboarding-option-card">
                  <div className="onboarding-option-card-header">
                    <Icon icon="mdi:account-plus-outline" width="20" />
                    <span>Adicionar manualmente</span>
                  </div>
                  <div className="onboarding-fields-row">
                    <div className="onboarding-field" style={{ flex: 1 }}>
                      <input
                        type="text"
                        value={clienteNome}
                        onChange={(e) => setClienteNome(e.target.value)}
                        placeholder="Nome do cliente"
                      />
                    </div>
                    <div className="onboarding-field" style={{ flex: 1 }}>
                      <input
                        type="text"
                        value={clienteTelefone}
                        onChange={(e) => setClienteTelefone(e.target.value)}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <button
                      className="onboarding-btn-add"
                      onClick={handleAdicionarCliente}
                      disabled={saving}
                    >
                      <Icon icon="mdi:plus" width="18" />
                    </button>
                  </div>
                  {clientesCriados.length > 0 && (
                    <div className="onboarding-clientes-list">
                      {clientesCriados.map((c, i) => (
                        <div key={i} className="onboarding-cliente-item">
                          <Icon icon="mdi:check-circle" width="16" style={{ color: '#16a34a' }} />
                          <span>{c.nome}</span>
                          <span style={{ color: '#9ca3af', fontSize: '12px' }}>{c.telefone}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Divisor */}
                <div className="onboarding-divider">
                  <span>ou</span>
                </div>

                {/* Card: Importar CSV */}
                <button
                  className="onboarding-option-card onboarding-option-card-clickable"
                  onClick={() => setMostrarCsvImport(true)}
                >
                  <div className="onboarding-option-card-header">
                    <Icon icon="ph:file-csv" width="20" />
                    <span>Importar planilha CSV</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                    Importe clientes de uma planilha Excel ou CSV
                  </p>
                </button>
              </div>

              <div className="onboarding-actions">
                <button className="onboarding-btn-secondary" onClick={() => setStep(3)}>Voltar</button>
                <button className="onboarding-btn-primary onboarding-btn-finish" onClick={finishOnboarding}>
                  {clientesCriados.length > 0 ? 'Concluir' : 'Pular e Concluir'}
                  <Icon icon="mdi:check" width="18" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={mostrarCsvImport}
        onClose={() => setMostrarCsvImport(false)}
        onImportComplete={(count) => {
          setMostrarCsvImport(false)
          setClientesCriados(prev => [...prev, ...Array(count).fill({ nome: 'Importado', telefone: '' })])
          showToast(`${count} clientes importados!`, 'success')
        }}
        userId={userId}
        existingClients={clientesCriados}
        planos={planosCriados}
        limiteClientes={500}
        clientesAtivos={clientesCriados.length}
      />
    </div>
  )
}
