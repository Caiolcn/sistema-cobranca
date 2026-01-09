import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Login from './Login'
import Dashboard from './Dashboard'
import Home from './Home'
import Financeiro from './Financeiro'
import Clientes from './Clientes'
import WhatsAppConexao from './WhatsAppConexao'
import TesteWhatsApp from './TesteWhatsApp'
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
      <div className="App">
        {!session ? (
          <Login onLogin={() => setSession(true)} />
        ) : (
          <Routes>
            <Route path="/" element={<Dashboard />}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="home" element={<Home />} />
              <Route path="financeiro" element={<Financeiro />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="whatsapp" element={<WhatsAppConexao />} />
              <Route path="teste-whatsapp" element={<TesteWhatsApp />} />
            </Route>
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        )}
      </div>
    </Router>
  )
}

export default App