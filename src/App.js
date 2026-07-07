import React, { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { UserProvider } from './contexts/UserContext'
import Toast from './Toast'
import './App.css'
import './design-system/tokens.css'

// Componentes carregados imediatamente (rotas públicas)
import LandingPage from './LandingPage'
import Login from './Login'
import Signup from './Signup'
import ResetPassword from './ResetPassword'
import Privacidade from './pages/Privacidade'

// Lazy loading para componentes do app (carregados sob demanda)
// Economia estimada: ~339 KiB no carregamento inicial
const Dashboard = lazy(() => import('./Dashboard'))
const Home = lazy(() => import('./Home'))
const Financeiro = lazy(() => import('./Financeiro'))
const Clientes = lazy(() => import('./Clientes'))
const WhatsAppConexao = lazy(() => import('./WhatsAppConexao'))
const Configuracao = lazy(() => import('./Configuracao'))
const UpgradePage = lazy(() => import('./UpgradePage'))
const UpgradeSuccessPage = lazy(() => import('./UpgradeSuccessPage'))
const PaginaPagamento = lazy(() => import('./pages/PaginaPagamento'))
const PortalCliente = lazy(() => import('./pages/PortalCliente'))
const PaginaContrato = lazy(() => import('./pages/PaginaContrato'))
const Onboarding = lazy(() => import('./Onboarding'))
const AgendaNova = lazy(() => import('./AgendaNova'))
const Relatorios = lazy(() => import('./Relatorios'))
const Ajuda = lazy(() => import('./Ajuda'))
const CRM = lazy(() => import('./CRM'))
const Admin = lazy(() => import('./Admin'))
const AdminErrosMensagens = lazy(() => import('./AdminErrosMensagens'))
const AdminCron = lazy(() => import('./AdminCron'))
const AdminWhatsAppSaude = lazy(() => import('./AdminWhatsAppSaude'))
const AdminWhatsAppMaster = lazy(() => import('./AdminWhatsAppMaster'))
const AdminCobrancaSaas = lazy(() => import('./AdminCobrancaSaas'))
const Avisos = lazy(() => import('./Avisos'))
const Agendamento = lazy(() => import('./pages/Agendamento'))
const LandingAcademia = lazy(() => import('./pages/LandingAcademia'))
const LinkInBio = lazy(() => import('./pages/LinkInBio'))
const PreviewRecibo = lazy(() => import('./pages/PreviewRecibo'))

// Design System (rota interna /app/design-system/*)
const DSLayout = lazy(() => import('./design-system/DSLayout'))
const PaginaCores = lazy(() => import('./design-system/PaginaCores'))
const PaginaTipografia = lazy(() => import('./design-system/PaginaTipografia'))
const PaginaEspacoSombra = lazy(() => import('./design-system/PaginaEspacoSombra'))
const PaginaMotion = lazy(() => import('./design-system/PaginaMotion'))
const PaginaButton = lazy(() => import('./design-system/PaginaButton'))
const PaginaInput = lazy(() => import('./design-system/PaginaInput'))
const PaginaSelect = lazy(() => import('./design-system/PaginaSelect'))
const PaginaCheckboxRadio = lazy(() => import('./design-system/PaginaCheckboxRadio'))
const PaginaSwitch = lazy(() => import('./design-system/PaginaSwitch'))
const PaginaBadge = lazy(() => import('./design-system/PaginaBadge'))
const PaginaAvatar = lazy(() => import('./design-system/PaginaAvatar'))
const PaginaCard = lazy(() => import('./design-system/PaginaCard'))
const PaginaModal = lazy(() => import('./design-system/PaginaModal'))
const PaginaToast = lazy(() => import('./design-system/PaginaToast'))
const PaginaTable = lazy(() => import('./design-system/PaginaTable'))
const PaginaTabs = lazy(() => import('./design-system/PaginaTabs'))
const PaginaDropdown = lazy(() => import('./design-system/PaginaDropdown'))
const PaginaEmptyState = lazy(() => import('./design-system/PaginaEmptyState'))
const PaginaClienteIdentity = lazy(() => import('./design-system/PaginaClienteIdentity'))
const PaginaCobrancaStatus = lazy(() => import('./design-system/PaginaCobrancaStatus'))
const PaginaPlanoCard = lazy(() => import('./design-system/PaginaPlanoCard'))
const PaginaWizardStepper = lazy(() => import('./design-system/PaginaWizardStepper'))
const PaginaPlaceholder = lazy(() => import('./design-system/PaginaPlaceholder'))

// Componente de loading para Suspense
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    color: '#344848'
  }}>
    Carregando...
  </div>
)

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return <div style={{ textAlign: 'center', marginTop: '100px' }}>Carregando...</div>
  }

  return (
    <Router>
      <UserProvider>
        <div className="App">
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Rotas públicas */}
              <Route path="/" element={session ? <Navigate to="/app/home" replace /> : <LandingPage />} />
              <Route path="/signup" element={session ? <Navigate to="/app/home" replace /> : <Signup />} />
              <Route path="/login" element={session ? <Navigate to="/app/home" replace /> : <Login onLogin={() => setSession(true)} />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/pagar/:token" element={<PaginaPagamento />} />
              <Route path="/portal/:token" element={<PortalCliente />} />
              <Route path="/contrato/:token" element={<PaginaContrato />} />
              <Route path="/agendar/:slug" element={<Agendamento />} />
              <Route path="/preview-recibo" element={<PreviewRecibo />} />
              <Route path="/links" element={<LinkInBio />} />
              <Route path="/privacidade" element={<Privacidade />} />

              {/* Rotas protegidas (sistema) - carregadas sob demanda */}
              {session ? (
                <>
                  <Route path="/app/onboarding" element={<Onboarding />} />
                  <Route path="/app/upgrade" element={<UpgradePage />} />
                  <Route path="/app/upgrade/success" element={<UpgradeSuccessPage />} />
                  <Route path="/app/design-system" element={<DSLayout />}>
                    <Route index element={<Navigate to="cores" replace />} />
                    <Route path="cores" element={<PaginaCores />} />
                    <Route path="tipografia" element={<PaginaTipografia />} />
                    <Route path="espaco-sombra" element={<PaginaEspacoSombra />} />
                    <Route path="motion" element={<PaginaMotion />} />
                    <Route path="button" element={<PaginaButton />} />
                    <Route path="input" element={<PaginaInput />} />
                    <Route path="select" element={<PaginaSelect />} />
                    <Route path="checkbox-radio" element={<PaginaCheckboxRadio />} />
                    <Route path="switch" element={<PaginaSwitch />} />
                    <Route path="badge" element={<PaginaBadge />} />
                    <Route path="avatar" element={<PaginaAvatar />} />
                    <Route path="card" element={<PaginaCard />} />
                    <Route path="modal" element={<PaginaModal />} />
                    <Route path="toast" element={<PaginaToast />} />
                    <Route path="table" element={<PaginaTable />} />
                    <Route path="tabs" element={<PaginaTabs />} />
                    <Route path="dropdown" element={<PaginaDropdown />} />
                    <Route path="empty-state" element={<PaginaEmptyState />} />
                    <Route path="cliente-identity" element={<PaginaClienteIdentity />} />
                    <Route path="cobranca-status" element={<PaginaCobrancaStatus />} />
                    <Route path="plano-card" element={<PaginaPlanoCard />} />
                    <Route path="wizard-stepper" element={<PaginaWizardStepper />} />
                    <Route path=":slug" element={<PaginaPlaceholder />} />
                  </Route>
                  <Route path="/app" element={<Dashboard />}>
                    <Route index element={<Navigate to="/app/home" replace />} />
                    <Route path="home" element={<Home />} />
                    <Route path="financeiro" element={<Financeiro />} />
                    <Route path="clientes" element={<Clientes />} />
                    <Route path="horarios" element={<AgendaNova />} />
                    <Route path="relatorios" element={<Relatorios />} />
                    <Route path="whatsapp" element={<WhatsAppConexao />} />
                    <Route path="configuracao" element={<Configuracao secao="config" />} />
                    <Route path="marketing" element={<Configuracao secao="marketing" />} />
                    <Route path="ajuda" element={<Ajuda />} />
                    <Route path="avisos" element={<Avisos />} />
                    <Route path="crm" element={<CRM />} />
                    <Route path="admin" element={<Admin />} />
                    <Route path="admin/erros-mensagens" element={<AdminErrosMensagens />} />
                    <Route path="admin/cron" element={<AdminCron />} />
                    <Route path="admin/whatsapp-saude" element={<AdminWhatsAppSaude />} />
                    <Route path="admin/whatsapp-master" element={<AdminWhatsAppMaster />} />
                    <Route path="admin/cobranca-saas" element={<AdminCobrancaSaas />} />
                  </Route>
                </>
              ) : (
                <Route path="/app/*" element={<Navigate to="/login" replace />} />
              )}

              {/* Landing page publica da academia por slug raiz.
                  Deve ser a ULTIMA rota — React Router prioriza as rotas
                  nomeadas acima (/login, /app/*, etc) sobre esta dinamica. */}
              <Route path="/:slug" element={<LandingAcademia />} />
            </Routes>
          </Suspense>
          <Toast />
        </div>
      </UserProvider>
    </Router>
  )
}

export default App