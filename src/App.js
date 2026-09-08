import React, { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { UserProvider } from './contexts/UserContext'
import { capturarAtribuicao } from './utils/metaAttribution'
import Toast from './Toast'
import './App.css'
import './design-system/tokens.css'

// Componentes carregados imediatamente (rotas públicas)
import LandingPage from './LandingPage'
import Login, { destinoPosLogin } from './Login'
import Signup from './Signup'
import ResetPassword from './ResetPassword'
import Privacidade from './pages/Privacidade'
import BarraModoEspelho from './components/BarraModoEspelho'
import InstalarAppPrompt from './components/InstalarAppPrompt'

// Lazy loading para componentes do app (carregados sob demanda)
// Economia estimada: ~339 KiB no carregamento inicial
const Dashboard = lazy(() => import('./Dashboard'))
const Home = lazy(() => import('./Home'))
const Financeiro = lazy(() => import('./Financeiro'))
const Clientes = lazy(() => import('./Clientes'))
const WhatsAppConexao = lazy(() => import('./WhatsAppConexao'))
const Configuracao = lazy(() => import('./Configuracao'))
const MinhaAssinatura = lazy(() => import('./assinatura/MinhaAssinatura'))
const UpgradeSuccessPage = lazy(() => import('./UpgradeSuccessPage'))
const PaginaPagamento = lazy(() => import('./pages/PaginaPagamento'))
const PortalCliente = lazy(() => import('./pages/PortalCliente'))
const PaginaContrato = lazy(() => import('./pages/PaginaContrato'))
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
const AdminLeads = lazy(() => import('./AdminLeads'))
const Avisos = lazy(() => import('./Avisos'))
const Agendamento = lazy(() => import('./pages/Agendamento'))
const LandingAcademia = lazy(() => import('./pages/LandingAcademia'))
const LandingEscolinha = lazy(() => import('./pages/LandingEscolinha'))
const LinkInBio = lazy(() => import('./pages/LinkInBio'))
const PreviewRecibo = lazy(() => import('./pages/PreviewRecibo'))
const VerComo = lazy(() => import('./pages/VerComo'))

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
const PaginaStatCard = lazy(() => import('./design-system/PaginaStatCard'))
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

// Deslogado tentando abrir uma rota do app. Antes ia direto pro /login e a
// intenção morria ali: quem clicava no link de renovação do WhatsApp caía na
// Home depois de entrar e tinha que caçar a tela de pagamento de novo.
// Guarda o destino em ?next= e o Login devolve a pessoa pra lá.
function RedirecionarParaLogin() {
  const { pathname, search } = useLocation()
  const destino = `${pathname}${search}`
  return <Navigate to={`/login?next=${encodeURIComponent(destino)}`} replace />
}

// Link antigo (/app/upgrade) -> rota nova, com a query intacta.
function RedirecionarParaAssinatura() {
  const { search } = useLocation()
  return <Navigate to={`/app/assinatura${search}`} replace />
}

// Já logado batendo em /login: respeita o ?next=. Sem isso, quem entrava pelo
// link do WhatsApp caía na Home — esta rota re-renderiza no instante em que a
// sessão aparece e o <Navigate> dela ganhava a corrida contra o redirect do
// próprio formulário.
function RedirecionarPosLogin() {
  const { search } = useLocation()
  return <Navigate to={destinoPosLogin(search)} replace />
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  // O signUp autentica na hora, então a sessão existe antes do cadastro terminar.
  // Sem esse flag o guard da rota /signup jogaria a pessoa no /app/home no meio
  // do processo, antes do popup de conta criada aparecer.
  const [cadastroEmCurso, setCadastroEmCurso] = useState(false)

  useEffect(() => {
    // Guarda fbclid/UTMs do primeiro toque antes que a navegação limpe a URL.
    // Só é lido lá no cadastro, que pode acontecer dias depois.
    capturarAtribuicao()

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
          <BarraModoEspelho />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Rotas públicas */}
              <Route path="/" element={session ? <Navigate to="/app/home" replace /> : <LandingPage />} />
              <Route path="/signup" element={session && !cadastroEmCurso ? <Navigate to="/app/home" replace /> : <Signup onCadastroIniciado={() => setCadastroEmCurso(true)} />} />
              <Route path="/login" element={session ? <RedirecionarPosLogin /> : <Login onLogin={() => setSession(true)} />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/pagar/:token" element={<PaginaPagamento />} />
              <Route path="/portal/:token" element={<PortalCliente />} />
              <Route path="/contrato/:token" element={<PaginaContrato />} />
              <Route path="/agendar/:slug" element={<Agendamento />} />
              <Route path="/preview-recibo" element={<PreviewRecibo />} />
              {/* Ver como cliente: resgata o token e abre a sessão dele (modo espelho) */}
              <Route path="/ver-como/:token" element={<VerComo />} />
              {/* Landing de nicho (trafego pago). Fica ANTES do catch-all /:slug
                  e o slug 'escolinha' esta reservado em Configuracao.js pra
                  nenhum cliente registrar o site dele nessa URL. */}
              <Route path="/escolinha" element={session ? <Navigate to="/app/home" replace /> : <LandingEscolinha />} />
              <Route path="/links" element={<LinkInBio />} />
              <Route path="/privacidade" element={<Privacidade />} />

              {/* Rotas protegidas (sistema) - carregadas sob demanda */}
              {session ? (
                <>
                  {/* O wizard de 4 passos saiu do caminho: a conta agora cai
                      direto na dashboard e o onboarding virou um painel dentro
                      da Home. A rota fica só redirecionando pra não quebrar
                      link antigo (Onboarding.js segue no repo, desligado). */}
                  <Route path="/app/onboarding" element={<Navigate to="/app/home" replace />} />
                  {/* /app/upgrade saiu, mas nao pode morrer: e o link que foi no
                      WhatsApp dos lembretes de vencimento, e essas mensagens estao
                      em conversas que ninguem reescreve. Redireciona PRESERVANDO a
                      query — sem isso o ?renovar=1 se perde e a pessoa cai na tela
                      sem o modal de pagamento aberto.
                      A rota de destino, /app/assinatura, vive DENTRO do Dashboard
                      (com o menu lateral) — ver o passe-livre no bloqueio de conta
                      vencida em Dashboard.js. */}
                  <Route path="/app/upgrade" element={<RedirecionarParaAssinatura />} />
                  {/* Fica em /app/upgrade/success de proposito: e a URL de retorno
                      do cartao, montada dentro da edge function create-subscription
                      (`${origin}/app/upgrade/success`). Mexer aqui exigiria deploy
                      da function pra ganhar nada que o cliente veja. */}
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
                    <Route path="statcard" element={<PaginaStatCard />} />
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
                    <Route path="assinatura" element={<MinhaAssinatura comoPagina />} />
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
                    <Route path="admin/leads" element={<AdminLeads />} />
                  </Route>
                </>
              ) : (
                <Route path="/app/*" element={<RedirecionarParaLogin />} />
              )}

              {/* Landing page publica da academia por slug raiz.
                  Deve ser a ULTIMA rota — React Router prioriza as rotas
                  nomeadas acima (/login, /app/*, etc) sobre esta dinamica. */}
              <Route path="/:slug" element={<LandingAcademia />} />
            </Routes>
          </Suspense>
          {/* Fica fora do Suspense de proposito: o convite de instalacao nao
              depende de nenhuma rota carregar, e ele mesmo filtra onde aparece
              (so /app e /portal — na landing a pessoa nem sabe o que e isso) */}
          <InstalarAppPrompt />
          <Toast />
        </div>
      </UserProvider>
    </Router>
  )
}

export default App