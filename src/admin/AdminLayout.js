import { useState, useEffect } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import { useUser } from '../contexts/UserContext'
import useWindowSize from '../hooks/useWindowSize'
import { GRUPOS_ADMIN, grupoDoCaminho, itemDoCaminho } from './navegacao'
import './AdminLayout.css'

/* ============================================================
   /admin — layout próprio da área interna do Mensalli

   Fica fora do Dashboard de propósito: lá dentro o admin herdava a sidebar
   do cliente, o banner de plano, o seletor "ver como"... e ainda tinha as
   próprias abas e atalhos por cima. Aqui é uma sidebar só, agrupada por
   assunto, com o caminho para voltar ao app no rodapé.
   ============================================================ */

// Ícones da moldura (menu/fechar/sair) vão em SVG inline: o Iconify baixa do
// CDN em runtime e, se falhar, o celular ficaria sem como abrir a gaveta.
const SvgMenu = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)
const SvgFechar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
const SvgSair = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3M16 17l5-5-5-5M21 12H9" />
  </svg>
)

// Nome do PRÓPRIO admin (userData), não o "efetivo" do contexto — com um
// cliente selecionado no "ver como", nomeCompleto seria o dele.
function useNomeAdmin() {
  const { userData, user } = useUser()
  const nome = (userData?.nome_completo || '').trim()
  const email = userData?.email || user?.email || ''
  const exibido = nome || email.split('@')[0] || 'Admin'
  const iniciais = exibido.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()
  return { exibido, primeiro: exibido.split(/\s+/)[0], iniciais }
}

async function sair() {
  await supabase.auth.signOut()
  window.location.href = '/login'
}

function Marca() {
  return (
    <div className="adm-marca">
      <img src="/logo-f.png" alt="Mensalli" />
      <span className="adm-selo">Admin</span>
    </div>
  )
}

function Sidebar({ aoNavegar, aoFechar }) {
  const { exibido, iniciais } = useNomeAdmin()
  return (
    <aside className="adm-sidebar">
      <div className="adm-sidebar-topo">
        <Marca />
        {aoFechar && (
          <button type="button" className="adm-icone-btn" onClick={aoFechar} aria-label="Fechar menu">
            <SvgFechar />
          </button>
        )}
      </div>

      <nav className="adm-nav">
        {GRUPOS_ADMIN.map(g => (
          <div key={g.grupo} className="adm-nav-grupo">
            <div className="adm-nav-titulo">{g.grupo}</div>
            {g.itens.map(item => (
              <NavLink
                key={item.slug}
                to={`/admin/${item.slug}`}
                onClick={aoNavegar}
                className={({ isActive }) => `adm-nav-item${isActive ? ' ativo' : ''}`}
              >
                <Icon icon={item.icon} width={20} height={20} />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="adm-rodape">
        <NavLink to="/app/home" className="adm-nav-item">
          <Icon icon="mdi:arrow-left" width={20} height={20} />
          Voltar para o app
        </NavLink>
        <div className="adm-usuario">
          <div className="adm-avatar">{iniciais}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="adm-usuario-nome">{exibido}</div>
            <div className="adm-usuario-papel">admin</div>
          </div>
          <button type="button" className="adm-icone-btn" onClick={sair} title="Sair" aria-label="Sair">
            <SvgSair />
          </button>
        </div>
      </div>
    </aside>
  )
}

export default function AdminLayout() {
  const { isAdmin, loading: userLoading } = useUser()
  const { isMobile } = useWindowSize()
  const location = useLocation()
  const { primeiro } = useNomeAdmin()
  const [gavetaAberta, setGavetaAberta] = useState(false)

  // Trocou de tela (inclusive pelo "voltar" do navegador): fecha a gaveta.
  useEffect(() => { setGavetaAberta(false) }, [location.pathname])

  if (userLoading) return null
  if (!isAdmin) return <Navigate to="/app/home" replace />

  const atual = itemDoCaminho(location.pathname)
  const grupo = grupoDoCaminho(location.pathname)

  if (!isMobile) {
    return (
      <div className="adm-layout">
        <Sidebar />
        <div className="adm-coluna">
          <header className="adm-topbar">
            <div className="adm-caminho">
              {grupo && atual ? <>{grupo} <span style={{ margin: '0 6px' }}>/</span> <strong>{atual.label}</strong></> : null}
            </div>
            <div className="adm-boasvindas">Olá, <strong>{primeiro}</strong></div>
          </header>
          <main className="adm-conteudo app-conteudo">
            <Outlet />
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="adm-layout mobile">
      <header className="adm-topbar">
        <button type="button" className="adm-icone-btn" onClick={() => setGavetaAberta(true)} aria-label="Abrir menu">
          <SvgMenu />
        </button>
        <Marca />
      </header>

      {gavetaAberta && (
        <>
          <div className="adm-gaveta-fundo" onClick={() => setGavetaAberta(false)} />
          <div className="adm-gaveta">
            <Sidebar aoNavegar={() => setGavetaAberta(false)} aoFechar={() => setGavetaAberta(false)} />
          </div>
        </>
      )}

      <main className="adm-conteudo app-conteudo">
        <Outlet />
      </main>
    </div>
  )
}
