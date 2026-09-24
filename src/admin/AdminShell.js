import { useState } from 'react'
import { Outlet, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import useWindowSize from '../hooks/useWindowSize'
import Button from '../design-system/components/Button'
import EmptyState from '../design-system/components/EmptyState'
import useAdminContas from './useAdminContas'
import { itemDoCaminho } from './navegacao'
import AbaVisaoGeral from './AbaVisaoGeral'
import AbaContas from './AbaContas'
import AbaFinanceiro from './AbaFinanceiro'
import AbaRetencao from './AbaRetencao'
import AbaNovidades from './AbaNovidades'
import AbaProspeccao from './AbaProspeccao'
import CentralMensagens from '../CentralMensagens'
import ModalEditarConta from './ModalEditarConta'
import ModalDisparo from './ModalDisparo'

/* ============================================================
   CRM Mensalli — telas do /admin que eram abas (?aba=)

   Visão Geral, Contas, Financeiro e Retenção leem a mesma carga
   (vw_admin_contas) e dividem os modais de edição e disparo. Por isso ficam
   sob uma rota-pai, <SecaoCRM>, que carrega uma vez e entrega tudo pelo
   contexto do <Outlet>: trocar de Contas para Retenção não recarrega nada.
   Central de mensagens, Atualizações e Prospecção têm carga própria e são
   páginas soltas, só com o mesmo cabeçalho.
   ============================================================ */

// Estilo em AdminLayout.css (.adm-pagina / .adm-cabecalho / .adm-titulo).
function Cabecalho({ titulo, subtitulo, acoes }) {
  return (
    <div className="adm-cabecalho">
      <div>
        <h1 className="adm-titulo">{titulo}</h1>
        {subtitulo && <div className="adm-subtitulo">{subtitulo}</div>}
      </div>
      {acoes}
    </div>
  )
}

// Casca das páginas soltas: mesmo padding e cabeçalho da seção CRM.
function Pagina({ titulo, subtitulo, acoes, children }) {
  return (
    <div className="adm-pagina">
      {titulo && <Cabecalho titulo={titulo} subtitulo={subtitulo} acoes={acoes} />}
      {children}
    </div>
  )
}

/* ---------- Seção CRM (rota-pai) ---------- */

export function SecaoCRM() {
  // Dados do PRÓPRIO admin, nunca os "efetivos": com um cliente selecionado no
  // "ver como", userId/chavePix do contexto são os dele — e o disparo de
  // retenção mandaria o PIX do cliente para as contas do Mensalli.
  const { isAdmin, realUserId: userId, userData } = useUser()
  const chavePix = userData?.chave_pix || ''
  const navigate = useNavigate()
  const location = useLocation()
  const { isSmallScreen } = useWindowSize()

  const dados = useAdminContas(isAdmin)

  // Modal de edição de conta e modal de disparo, compartilhados entre as telas
  const [contaEditando, setContaEditando] = useState(null)
  const [disparo, setDisparo] = useState(null) // { grupo, lista }

  // Monta a URL da tela com os filtros. Só entra na query o que difere do
  // padrão — assim trocar de tela não arrasta filtro de outra junto.
  //   ciclo  — um dos 7 estados do ciclo de vida
  //   origem — origem do pagamento (mercadopago / manual / nenhum)
  //   foco   — recorte que não é nem ciclo nem origem (ex: pagante sem data)
  const urlDe = (slug, filtros = {}) => {
    const q = new URLSearchParams()
    if (filtros.ciclo && filtros.ciclo !== 'todos') q.set('ciclo', filtros.ciclo)
    if (filtros.origem && filtros.origem !== 'todos') q.set('origem', filtros.origem)
    if (filtros.foco) q.set('foco', filtros.foco)
    const s = q.toString()
    return `/admin/${slug}${s ? `?${s}` : ''}`
  }

  // A Visão Geral ainda fala em "aba" (c.aba || 'contas'); os nomes das abas
  // do CRM são os próprios slugs, com exceção da visão.
  const irPara = (aba, filtros) => navigate(urlDe(aba === 'visao' ? 'visao-geral' : aba, filtros))

  const atual = itemDoCaminho(location.pathname)

  return (
    <div className="adm-pagina">
      <Cabecalho
        titulo={atual ? atual.label : 'CRM Mensalli'}
        subtitulo={dados.carregando
          ? 'Carregando contas…'
          : `${atual?.descricao ? `${atual.descricao} · ` : ''}${dados.contas.length} contas · ${dados.kpis.pagantes} pagando hoje`}
        acoes={
          <Button variant="outline" icon="mdi:refresh" onClick={dados.recarregar} loading={dados.carregando}>
            Atualizar
          </Button>
        }
      />

      {dados.erro ? (
        <EmptyState
          variant="error"
          title="Não foi possível carregar o CRM"
          description={dados.erro}
          action={<Button variant="primary" icon="mdi:refresh" onClick={dados.recarregar}>Tentar de novo</Button>}
        />
      ) : (
        <Outlet context={{ dados, irPara, urlDe, setContaEditando, setDisparo, isSmallScreen }} />
      )}

      <ModalEditarConta
        conta={contaEditando}
        onClose={() => setContaEditando(null)}
        onSalvo={dados.recarregar}
        planos={dados.planos}
      />

      <ModalDisparo
        disparo={disparo}
        onClose={() => setDisparo(null)}
        onConcluido={dados.recarregar}
        userId={userId}
        chavePix={chavePix}
        precoDoPlano={dados.precoDoPlano}
        nomeDoPlano={dados.nomeDoPlano}
        isSmallScreen={isSmallScreen}
      />
    </div>
  )
}

export function PaginaVisaoGeral() {
  const { dados, irPara, isSmallScreen } = useOutletContext()
  return <AbaVisaoGeral dados={dados} irPara={irPara} isSmallScreen={isSmallScreen} />
}

export function PaginaContas() {
  const { dados, urlDe, setContaEditando, isSmallScreen } = useOutletContext()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Filtros na URL para o "voltar" do navegador funcionar e o link ser compartilhável.
  const filtrosURL = {
    ciclo: params.get('ciclo') || 'todos',
    origem: params.get('origem') || 'todos',
    foco: params.get('foco') || null,
  }
  return (
    <AbaContas
      dados={dados}
      filtrosURL={filtrosURL}
      // replace: mexer num filtro não empilha entrada no histórico —
      // senão "voltar" percorreria cada clique de chip.
      onFiltrosChange={(filtros) => navigate(urlDe('contas', filtros), { replace: true })}
      onEditar={setContaEditando}
      isSmallScreen={isSmallScreen}
    />
  )
}

export function PaginaFinanceiro() {
  const { dados, isSmallScreen } = useOutletContext()
  return <AbaFinanceiro dados={dados} isSmallScreen={isSmallScreen} />
}

export function PaginaRetencao() {
  const { dados, setDisparo, isSmallScreen } = useOutletContext()
  return <AbaRetencao dados={dados} onDisparar={setDisparo} isSmallScreen={isSmallScreen} />
}

/* ---------- Páginas soltas ---------- */

// A Central tem fonte própria (vw_central_mensagens). O token faz o
// "Atualizar" do cabeçalho recarregar a lista dela.
export function PaginaMensagens() {
  const navigate = useNavigate()
  const [token, setToken] = useState(0)
  return (
    <Pagina
      titulo="Central de mensagens"
      subtitulo="Mensagens de todas as contas, com a classe da falha"
      acoes={<Button variant="outline" icon="mdi:refresh" onClick={() => setToken(t => t + 1)}>Atualizar</Button>}
    >
      <CentralMensagens
        // Já estamos dentro do guard de admin do layout.
        isAdmin
        // O CTA "reconectar" é sobre a conta DONA da mensagem, não sobre a
        // nossa: vai para o painel com a conexão de todas as contas.
        irParaConexao={() => navigate('/admin/whatsapp-saude')}
        recarregarToken={token}
      />
    </Pagina>
  )
}

// AbaNovidades já traz o próprio cabeçalho (com o botão de publicar).
export function PaginaAtualizacoes() {
  return <Pagina><AbaNovidades /></Pagina>
}

export function PaginaProspeccao() {
  return <Pagina titulo="Prospecção"><AbaProspeccao /></Pagina>
}
