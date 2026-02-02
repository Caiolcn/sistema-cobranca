import React, { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { UserProvider } from './contexts/UserContext'
import Toast from './Toast'
import './App.css'

// Componentes carregados imediatamente (rotas públicas)
import LandingPage from './LandingPage'
import Login from './Login'
import Signup from './Signup'
import ResetPassword from './ResetPassword'

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
const Onboarding = lazy(() => import('./Onboarding'))

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
              <Route path="/" element={<LandingPage />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/login" element={<Login onLogin={() => setSession(true)} />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/pagar/:token" element={<PaginaPagamento />} />
              <Route path="/portal/:token" element={<PortalCliente />} />

              {/* Rotas protegidas (sistema) - carregadas sob demanda */}
              {session ? (
                <>
                  <Route path="/app/onboarding" element={<Onboarding />} />
                  <Route path="/app/upgrade" element={<UpgradePage />} />
                  <Route path="/app/upgrade/success" element={<UpgradeSuccessPage />} />
                  <Route path="/app" element={<Dashboard />}>
                    <Route index element={<Navigate to="/app/home" replace />} />
                    <Route path="home" element={<Home />} />
                    <Route path="financeiro" element={<Financeiro />} />
                    <Route path="clientes" element={<Clientes />} />
                    <Route path="whatsapp" element={<WhatsAppConexao />} />
                    <Route path="configuracao" element={<Configuracao />} />
                  </Route>
                </>
              ) : (
                <Route path="/app/*" element={<Navigate to="/login" replace />} />
              )}
            </Routes>
          </Suspense>
          <Toast />
        </div>
      </UserProvider>
    </Router>
  )
}

export default App