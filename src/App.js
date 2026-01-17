import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { UserProvider } from './contexts/UserContext'
import LandingPage from './LandingPage'
import Login from './Login'
import Signup from './Signup'
import Dashboard from './Dashboard'
import Home from './Home'
import Financeiro from './Financeiro'
import Clientes from './Clientes'
import WhatsAppConexao from './WhatsAppConexao'
import Configuracao from './Configuracao'
import UpgradePage from './UpgradePage'
import UpgradeSuccessPage from './UpgradeSuccessPage'
import ResetPassword from './ResetPassword'
import Toast from './Toast'
import './App.css'

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
          <Routes>
            {/* Rotas públicas */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login onLogin={() => setSession(true)} />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Rotas protegidas (sistema) */}
            {session ? (
              <>
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
          <Toast />
        </div>
      </UserProvider>
    </Router>
  )
}

export default App