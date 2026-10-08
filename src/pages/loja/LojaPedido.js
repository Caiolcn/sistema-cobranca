import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { carregarFontesBio } from '../../data/bioTemas'
import { lojaApi, resolverAparenciaLoja, fmtBRL, fmtDataHora, copiarTexto, telefoneWa } from './lojaTema'
import { LojaShell, TelaCarregando, TelaIndisponivel } from './LojaVitrine'
import { Aviso, Passos } from './LojaItem'

// Página do pedido (/loja/:slug/pedido/:token). É o destino de tudo:
//  - aguardando_pagamento: mostra Pix (QR + copia e cola) ou abre o checkout do Asaas; faz polling
//  - expirado: oferece gerar novo Pix
//  - turma_pendente: aluno escolhe o horário (lista com vagas reais)
//  - pago/concluido/aguardando_retirada/retirado: confirmação com próximos passos
//  - cancelado/estornado: aviso

const POLL_MS = 4000

export default function LojaPedido() {
  const { slug, token } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pagamento, setPagamento] = useState(location.state?.pagamento || null)
  const [gerando, setGerando] = useState(false)
  const [conferindo, setConferindo] = useState(false)
  const [msg, setMsg] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const timer = useRef(null)

  const carregar = useCallback(async (force = false) => {
    try {
      const json = await lojaApi.status(token, force)
      setDados(json)
      setErro(null)
      return json
    } catch (e) {
      setErro(e)
      return null
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { carregar() }, [carregar])

  // Polling enquanto aguarda pagamento
  const status = dados?.pedido?.status
  useEffect(() => {
    clearInterval(timer.current)
    if (status === 'aguardando_pagamento') {
      timer.current = setInterval(() => carregar(false), POLL_MS)
    }
    return () => clearInterval(timer.current)
  }, [status, carregar])

  // Sem dados de pagamento na mão (recarregou a página): pede ao servidor
  useEffect(() => {
    if (status !== 'aguardando_pagamento' || pagamento || gerando) return
    setGerando(true)
    lojaApi.pagar(token, dados?.pedido?.metodo || 'pix')
      .then((r) => setPagamento(r.pagamento))
      .catch((e) => setMsg({ tipo: 'erro', texto: e.message }))
      .finally(() => setGerando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pagamento, token])

  const empresa = dados?.empresa || location.state?.empresa
  const aparencia = useMemo(() => (empresa ? resolverAparenciaLoja(empresa) : null), [empresa])
  useEffect(() => { if (aparencia) carregarFontesBio([aparencia.fonteId]) }, [aparencia])
  useEffect(() => { if (empresa) document.title = `Pedido · ${empresa.nome_empresa}` }, [empresa])

  if (loading && !dados) return <TelaCarregando />
  if (erro && !dados) return <TelaIndisponivel titulo="Pedido não encontrado" mensagem={erro.message} />
  if (!dados?.pedido || !empresa) return <TelaIndisponivel titulo="Pedido não encontrado" />

  const pedido = dados.pedido
  const { tema, fonte } = aparencia
  const slugReal = dados.slug || slug
  const card = { padding: '16px', borderRadius: '18px', backgroundColor: tema.card, border: `1.5px solid ${tema.cardBorda}`, color: tema.cardTexto, boxShadow: tema.sombra }
  const botaoPrimario = {
    width: '100%', padding: '15px', borderRadius: '14px', border: 'none', cursor: 'pointer', fontFamily: fonte.stack, fontWeight: 700, fontSize: '15.5px',
    backgroundColor: tema.destaque, color: tema.destaqueTexto, boxShadow: `0 10px 24px -10px ${tema.destaque}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  }
  const botaoSecundario = { ...botaoPrimario, backgroundColor: tema.card, color: tema.texto, boxShadow: 'none', border: `1.5px solid ${tema.cardBorda}` }

  const trocarMetodo = async (metodo) => {
    setMsg(null); setGerando(true)
    try {
      const r = await lojaApi.pagar(token, metodo)
      setPagamento(r.pagamento)
      setDados((d) => ({ ...d, pedido: { ...d.pedido, metodo, status: 'aguardando_pagamento' } }))
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message })
    } finally { setGerando(false) }
  }

  const jaPaguei = async () => {
    setConferindo(true); setMsg(null)
    const r = await carregar(true)
    setConferindo(false)
    if (r?.pedido?.status === 'aguardando_pagamento') setMsg({ tipo: 'info', texto: 'Ainda não identificamos o pagamento. Pode levar alguns segundos; esta página atualiza sozinha.' })
  }

  const copiar = async () => {
    if (!pagamento?.pix_copia_cola) return
    const ok = await copiarTexto(pagamento.pix_copia_cola)
    setCopiado(ok)
    setTimeout(() => setCopiado(false), 2500)
  }

  const resumo = (
    <div style={{ ...card, display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
      <div style={{ width: '52px', height: '52px', borderRadius: '12px', overflow: 'hidden', backgroundColor: tema.sutil, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {pedido.produto?.imagem_url ? <img src={pedido.produto.imagem_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon icon="mdi:tag-outline" width="26" style={{ opacity: 0.7 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '14.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pedido.item_nome}{pedido.variacao ? ` · ${pedido.variacao}` : ''}</div>
        <div style={{ fontSize: '13px', opacity: 0.8 }}>{fmtBRL(pedido.valor)} · {pedido.nome}</div>
      </div>
    </div>
  )

  // ---------------- AGUARDANDO PAGAMENTO ----------------
  if (pedido.status === 'aguardando_pagamento' || pedido.status === 'expirado') {
    const expirado = pedido.status === 'expirado'
    const formas = empresa.formas_pagamento || { pix: true }
    const metodo = pedido.metodo || 'pix'
    return (
      <LojaShell empresa={empresa} aparencia={aparencia} titulo={aparencia.titulo} voltar={() => navigate(`/loja/${slugReal}`)}>
        {resumo}
        <Passos tema={tema} atual={2} />

        {expirado ? (
          <div style={{ ...card, textAlign: 'center' }}>
            <Icon icon="mdi:timer-off-outline" width="44" style={{ opacity: 0.7 }} />
            <h3 style={{ margin: '10px 0 6px', fontSize: '17px', fontWeight: 800 }}>O prazo deste pagamento acabou</h3>
            <p style={{ margin: 0, fontSize: '13.5px', opacity: 0.8 }}>Sem problema: gere um novo e pague agora.</p>
            <button type="button" onClick={() => trocarMetodo('pix')} disabled={gerando} style={{ ...botaoPrimario, marginTop: '16px' }}>
              {gerando ? <Icon icon="eos-icons:loading" width="22" /> : <><Icon icon="mdi:qrcode" width="20" /> Gerar novo Pix</>}
            </button>
          </div>
        ) : (
          <div style={card}>
            {metodo === 'pix' ? (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800 }}>Pague com Pix</h3>
                <p style={{ margin: '0 0 14px', fontSize: '13px', opacity: 0.8 }}>Abra o app do seu banco, escolha pagar com Pix e escaneie o código ou cole o copia e cola.</p>
                <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '240px' }}>
                  {pagamento?.pix_qr_code
                    ? <img src={`data:image/png;base64,${pagamento.pix_qr_code}`} alt="QR Code Pix" style={{ width: '220px', height: '220px' }} />
                    : <Icon icon="eos-icons:loading" width="36" style={{ color: '#71717a' }} />}
                </div>
                {pagamento?.pix_copia_cola && (
                  <>
                    <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '10px', backgroundColor: tema.sutil, color: tema.textoSuave, fontSize: '11px', wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', maxHeight: '58px', overflow: 'hidden' }}>
                      {pagamento.pix_copia_cola}
                    </div>
                    <button type="button" onClick={copiar} style={{ ...botaoPrimario, marginTop: '10px' }}>
                      <Icon icon={copiado ? 'mdi:check' : 'mdi:content-copy'} width="20" /> {copiado ? 'Copiado!' : 'Copiar código Pix'}
                    </button>
                  </>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '12.5px', opacity: 0.8 }}>
                  <Icon icon="eos-icons:three-dots-loading" width="22" /> Aguardando o pagamento. A confirmação aparece aqui sozinha.
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800 }}>{metodo === 'cartao' ? 'Pague com cartão' : 'Pague com boleto'}</h3>
                <p style={{ margin: '0 0 14px', fontSize: '13px', opacity: 0.8 }}>
                  {metodo === 'cartao' ? 'Você vai para a página segura do Asaas para digitar os dados do cartão.' : 'O boleto compensa em até 2 dias úteis. Esta página atualiza quando o pagamento entrar.'}
                </p>
                <a href={pagamento?.invoice_url || '#'} target="_blank" rel="noopener noreferrer" style={{ ...botaoPrimario, textDecoration: 'none', opacity: pagamento?.invoice_url ? 1 : 0.6 }}>
                  <Icon icon={metodo === 'cartao' ? 'mdi:credit-card-outline' : 'mdi:barcode'} width="20" /> {metodo === 'cartao' ? 'Abrir pagamento com cartão' : 'Abrir boleto'}
                </a>
              </>
            )}

            <button type="button" onClick={jaPaguei} disabled={conferindo} style={{ ...botaoSecundario, marginTop: '10px' }}>
              {conferindo ? <Icon icon="eos-icons:loading" width="22" /> : <><Icon icon="mdi:check-decagram-outline" width="20" /> Já paguei, conferir agora</>}
            </button>

            {([formas.pix, formas.cartao, formas.boleto].filter(Boolean).length > 1) && (
              <div style={{ marginTop: '14px', display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', fontSize: '12.5px' }}>
                <span style={{ opacity: 0.7 }}>Pagar de outro jeito:</span>
                {formas.pix && metodo !== 'pix' && <LinkMetodo tema={tema} onClick={() => trocarMetodo('pix')}>Pix</LinkMetodo>}
                {formas.cartao && metodo !== 'cartao' && <LinkMetodo tema={tema} onClick={() => trocarMetodo('cartao')}>Cartão</LinkMetodo>}
                {formas.boleto && metodo !== 'boleto' && <LinkMetodo tema={tema} onClick={() => trocarMetodo('boleto')}>Boleto</LinkMetodo>}
              </div>
            )}
          </div>
        )}

        {msg && <Aviso tema={tema} tipo={msg.tipo === 'erro' ? 'erro' : undefined}>{msg.texto}</Aviso>}
      </LojaShell>
    )
  }

  // ---------------- TURMA PENDENTE ----------------
  if (pedido.status === 'turma_pendente') {
    return (
      <LojaShell empresa={empresa} aparencia={aparencia} titulo={aparencia.titulo}>
        {resumo}
        <Passos tema={tema} atual={3} total={3} rotulos={['Cadastro', 'Pagamento', 'Horário']} />
        <Aviso tema={tema} compacto>Pagamento confirmado! Agora escolha seu horário.</Aviso>
        <div style={{ height: '12px' }} />
        <EscolhaTurma slug={slugReal} token={token} pedido={pedido} tema={tema} fonte={fonte} card={card} botaoPrimario={botaoPrimario} onConcluido={() => carregar()} />
      </LojaShell>
    )
  }

  // ---------------- CANCELADO / ESTORNADO ----------------
  if (pedido.status === 'cancelado' || pedido.status === 'estornado') {
    const wa = telefoneWa(empresa.loja?.suporte_whatsapp || empresa.telefone)
    return (
      <LojaShell empresa={empresa} aparencia={aparencia} titulo={aparencia.titulo} voltar={() => navigate(`/loja/${slugReal}`)}>
        {resumo}
        <div style={{ ...card, textAlign: 'center' }}>
          <Icon icon="mdi:close-circle-outline" width="44" style={{ opacity: 0.7 }} />
          <h3 style={{ margin: '10px 0 6px', fontSize: '17px', fontWeight: 800 }}>{pedido.status === 'estornado' ? 'Pagamento estornado' : 'Pedido cancelado'}</h3>
          <p style={{ margin: 0, fontSize: '13.5px', opacity: 0.8 }}>Se tiver dúvida, fale com a academia.</p>
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" style={{ ...botaoSecundario, marginTop: '16px', textDecoration: 'none' }}><Icon icon="mdi:whatsapp" width="20" /> Falar no WhatsApp</a>}
        </div>
      </LojaShell>
    )
  }

  // ---------------- CONFIRMAÇÃO ----------------
  const wa = telefoneWa(empresa.loja?.suporte_whatsapp || empresa.telefone)
  const retirada = empresa.loja?.retirada
  const boasVindas = empresa.loja?.boas_vindas
  return (
    <LojaShell empresa={empresa} aparencia={aparencia} titulo={aparencia.titulo} voltar={() => navigate(`/loja/${slugReal}`)}>
      <Passos tema={tema} atual={3} />
      <div style={{ ...card, textAlign: 'center', paddingTop: '26px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto', backgroundColor: tema.destaque, color: tema.destaqueTexto, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon icon="mdi:check-bold" width="34" />
        </div>
        <h2 style={{ margin: '14px 0 4px', fontSize: '22px', fontWeight: 800 }}>
          {pedido.tipo === 'plano' ? 'Matrícula confirmada!' : pedido.tipo === 'evento' ? 'Inscrição confirmada!' : 'Pagamento confirmado!'}
        </h2>
        <p style={{ margin: 0, fontSize: '14px', opacity: 0.85 }}>{pedido.item_nome}{pedido.variacao ? ` · ${pedido.variacao}` : ''} · {fmtBRL(pedido.valor)}</p>
        {boasVindas && <p style={{ margin: '14px 0 0', fontSize: '14px', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{boasVindas}</p>}
      </div>

      <div style={{ ...card, marginTop: '12px' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.85 }}>O que acontece agora</h3>
        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14px', lineHeight: 1.7 }}>
          {pedido.tipo === 'plano' && <li>Você já é aluno. Suas mensalidades e horários ficam no seu portal.</li>}
          {pedido.tipo === 'plano' && pedido.turmas?.length > 0 && (
            <li>Seu horário: {pedido.turmas.map((t) => `${t.dia} às ${t.horario}`).join(', ')}.</li>
          )}
          {pedido.tipo === 'pacote' && <li>Suas aulas já estão liberadas. Agende pelo portal ou direto com a academia.</li>}
          {pedido.tipo === 'evento' && pedido.produto?.data_evento && <li>Anote: {fmtDataHora(pedido.produto.data_evento)}{pedido.produto?.local_evento ? `, em ${pedido.produto.local_evento}` : ''}.</li>}
          {pedido.tipo === 'produto' && (pedido.status === 'aguardando_retirada' || pedido.produto?.retirada_presencial) && (
            <li>Retire na academia{retirada?.endereco ? `: ${retirada.endereco}` : ''}{retirada?.horario ? ` (${retirada.horario})` : ''}.</li>
          )}
          {pedido.tipo === 'produto' && pedido.status === 'retirado' && <li>Produto entregue. Bom uso!</li>}
          {pedido.tipo === 'produto' && !pedido.produto?.retirada_presencial && pedido.status !== 'retirado' && <li>A academia entra em contato para combinar a entrega.</li>}
          {pedido.contrato && pedido.contrato.status !== 'assinado' && <li>Falta assinar o contrato (leva 1 minuto).</li>}
          <li>Enviamos a confirmação no seu WhatsApp.</li>
        </ul>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
        {pedido.contrato && pedido.contrato.status !== 'assinado' && (
          <a href={`/contrato/${pedido.contrato.token}`} style={{ ...botaoPrimario, textDecoration: 'none' }}><Icon icon="mdi:file-sign" width="20" /> Assinar contrato</a>
        )}
        {pedido.portal_token && (
          <a href={`/portal/${pedido.portal_token}`} style={{ ...(pedido.contrato && pedido.contrato.status !== 'assinado' ? botaoSecundario : botaoPrimario), textDecoration: 'none' }}>
            <Icon icon="mdi:account-circle-outline" width="20" /> Abrir meu portal
          </a>
        )}
        {wa && (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" style={{ ...botaoSecundario, textDecoration: 'none' }}>
            <Icon icon="mdi:whatsapp" width="20" /> Falar com a academia
          </a>
        )}
        <button type="button" onClick={() => navigate(`/loja/${slugReal}`)} style={{ ...botaoSecundario, backgroundColor: 'transparent', border: 'none', boxShadow: 'none', fontSize: '13.5px', opacity: 0.8 }}>
          Voltar para a loja
        </button>
      </div>
    </LojaShell>
  )
}

function LinkMetodo({ tema, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: tema.destaque, fontWeight: 700, fontFamily: 'inherit', fontSize: 'inherit', textDecoration: 'underline' }}>
      {children}
    </button>
  )
}

// Lista de turmas com vagas reais (capacidade - fixos ativos) e escolha atômica no servidor.
function EscolhaTurma({ slug, token, pedido, tema, fonte, card, botaoPrimario, onConcluido }) {
  const [turmas, setTurmas] = useState(null)
  const [erro, setErro] = useState(null)
  const [sel, setSel] = useState([])
  const [enviando, setEnviando] = useState(false)
  const qtd = pedido.produto?.qtd_turmas ?? 1   // 0 = livre

  const carregar = useCallback(() => {
    if (!pedido.produto?.id) return
    setErro(null)
    lojaApi.turmas(slug, pedido.produto.id)
      .then((r) => setTurmas(r.turmas || []))
      .catch((e) => setErro(e.message))
  }, [slug, pedido.produto])

  useEffect(() => { carregar() }, [carregar])

  const alternar = (id) => {
    setSel((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id)
      if (qtd === 1) return [id]
      if (qtd > 0 && s.length >= qtd) return s
      return [...s, id]
    })
  }

  const confirmar = async () => {
    setEnviando(true); setErro(null)
    try {
      await lojaApi.escolherTurma(token, sel)
      onConcluido()
    } catch (e) {
      setErro(e.message)
      if (e.code === 'lotado' || e.code === 'turma_invalida') { setSel([]); carregar() }
    } finally { setEnviando(false) }
  }

  if (erro && !turmas) return <Aviso tema={tema} tipo="erro">{erro}</Aviso>
  if (!turmas) return <div style={{ ...card, textAlign: 'center' }}><Icon icon="eos-icons:loading" width="30" /></div>

  if (turmas.length === 0) {
    return (
      <div style={{ ...card, textAlign: 'center' }}>
        <Icon icon="mdi:calendar-remove-outline" width="40" style={{ opacity: 0.7 }} />
        <p style={{ margin: '10px 0 0', fontSize: '14px' }}>A academia ainda não abriu horários online. Ela vai entrar em contato para combinar o seu.</p>
      </div>
    )
  }

  const porDia = turmas.reduce((acc, t) => { (acc[t.dia_nome] = acc[t.dia_nome] || []).push(t); return acc }, {})
  const pronto = qtd === 0 ? sel.length > 0 : sel.length === qtd

  return (
    <div>
      <div style={{ ...card, marginBottom: '12px' }}>
        <h3 style={{ margin: '0 0 2px', fontSize: '16px', fontWeight: 800 }}>Escolha {qtd === 1 ? 'seu horário' : qtd === 0 ? 'seus horários' : `${qtd} horários`}</h3>
        <p style={{ margin: 0, fontSize: '12.5px', opacity: 0.75 }}>Mostramos só turmas com vaga. {qtd > 1 ? `Selecionados: ${sel.length} de ${qtd}.` : ''}</p>
      </div>
      {Object.entries(porDia).map(([dia, lista]) => (
        <div key={dia} style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tema.textoSuave, margin: '0 0 8px 4px' }}>{dia}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {lista.map((t) => {
              const ativo = sel.includes(t.id)
              return (
                <button key={t.id} type="button" disabled={t.lotada} onClick={() => alternar(t.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '14px', textAlign: 'left', fontFamily: fonte.stack, cursor: t.lotada ? 'default' : 'pointer',
                    border: `1.5px solid ${ativo ? tema.destaque : tema.cardBorda}`, backgroundColor: ativo ? tema.destaque : tema.card, color: ativo ? tema.destaqueTexto : tema.cardTexto, opacity: t.lotada ? 0.5 : 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '16px', minWidth: '52px' }}>{t.horario}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.modalidade || t.descricao || 'Turma'}</div>
                    <div style={{ fontSize: '12px', opacity: 0.75 }}>{t.professor ? `${t.professor} · ` : ''}{t.lotada ? 'Lotada' : `${t.vagas} ${t.vagas === 1 ? 'vaga' : 'vagas'}`}</div>
                  </div>
                  <Icon icon={ativo ? 'mdi:check-circle' : 'mdi:circle-outline'} width="22" style={{ opacity: ativo ? 1 : 0.5 }} />
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {erro && <Aviso tema={tema} tipo="erro">{erro}</Aviso>}
      {/* Barra fixa no rodapé da tela: a lista pode ter dezenas de turmas e o botão não pode
          ficar lá embaixo. `fixed` em vez de `sticky` porque o body do app tem overflow-x
          hidden, o que quebra o sticky. O espaço embaixo da lista evita cobrir a última turma. */}
      <div style={{ height: '88px' }} />
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, padding: '10px 16px 14px', background: `linear-gradient(180deg, transparent 0%, ${tema.fundo[0]} 40%)` }}>
        <div style={{ maxWidth: '608px', margin: '0 auto' }}>
          <button type="button" onClick={confirmar} disabled={!pronto || enviando} style={{ ...botaoPrimario, opacity: !pronto || enviando ? 0.55 : 1 }}>
            {enviando
              ? <Icon icon="eos-icons:loading" width="22" />
              : pronto
                ? <>Confirmar {resumoSelecao(turmas, sel)} <Icon icon="mdi:check" width="20" /></>
                : <>{qtd === 1 ? 'Escolha um horário' : qtd === 0 ? 'Escolha seus horários' : `Escolha ${qtd} horários (${sel.length}/${qtd})`}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// "Seg 09:00" ou "2 horários" no texto do botão
function resumoSelecao(turmas, sel) {
  if (sel.length === 1) {
    const t = turmas.find((x) => x.id === sel[0])
    return t ? `${(t.dia_nome || '').slice(0, 3)} ${t.horario}` : 'horário'
  }
  return `${sel.length} horários`
}
