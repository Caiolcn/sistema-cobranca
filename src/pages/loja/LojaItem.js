import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { FUNCTIONS_URL } from '../../supabaseClient'
import { carregarFontesBio } from '../../data/bioTemas'
import { mascaraTelefone, mascaraCPF, mascaraData, validarTelefone, validarCPF, dataNascimentoParaISO, idadeEmAnos } from '../../utils/validators'
import { lojaApi, headersPublicos, resolverAparenciaLoja, fmtBRL, sufixoPreco, fmtDataHora, TIPO_ICONE, TIPO_CTA } from './lojaTema'
import { LojaShell, TelaCarregando, TelaIndisponivel } from './LojaVitrine'

// Página do item (/loja/:slug/p/:produtoId) com o checkout embutido:
// etapa 'item' (detalhes) -> 'ficha' (cadastro + forma de pagamento) -> cria o
// pedido na edge loja-comprar e segue para /loja/:slug/pedido/:token, onde o
// pagamento acontece.

const ERROS_CAMPO = {
  nome: 'nome', telefone_invalid: 'telefone', cpf_invalid: 'cpf', nascimento: 'dataNascimento',
  menor_sem_responsavel: 'responsavelNome', variacao: 'variacao', campo_extra: null,
}

function Campo({ label, erro, children, dica }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '6px', opacity: 0.9 }}>{label}</span>
      {children}
      {dica && !erro && <span style={{ display: 'block', fontSize: '11.5px', marginTop: '4px', opacity: 0.65 }}>{dica}</span>}
      {erro && <span style={{ display: 'block', fontSize: '12px', marginTop: '4px', color: 'var(--lj-erro)', fontWeight: 600 }}>{erro}</span>}
    </label>
  )
}

const inputStyle = (tema, erro) => ({
  width: '100%', boxSizing: 'border-box', padding: '12px 13px', borderRadius: '12px', fontSize: '15px', fontFamily: 'inherit',
  border: `1.5px solid ${erro ? '#f87171' : tema.cardBorda}`, backgroundColor: 'rgba(255,255,255,0.96)', color: '#18181b', outline: 'none',
})

export default function LojaItem() {
  const { slug, produtoId } = useParams()
  const navigate = useNavigate()
  const [query] = useSearchParams()

  const [dados, setDados] = useState(null)
  const [erroCarga, setErroCarga] = useState(null)
  const [loading, setLoading] = useState(true)

  const [etapa, setEtapa] = useState('item')
  const [variacao, setVariacao] = useState('')
  const [metodo, setMetodo] = useState('pix')
  const [form, setForm] = useState({ nome: '', telefone: '', dataNascimento: '', cpf: '', email: '', responsavelNome: '', responsavelTelefone: '', responsavelCpf: '', website: '' })
  const [respostas, setRespostas] = useState({})
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [alunoToken] = useState(query.get('aluno') || '')
  const [alunoPreenchido, setAlunoPreenchido] = useState(false)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    lojaApi.item(slug, produtoId)
      .then((json) => { if (!cancelado) setDados(json) })
      .catch((e) => { if (!cancelado) setErroCarga(e) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [slug, produtoId])

  // Link vindo da ficha do aluno (?aluno=portal_token): pré-preenche pelo portal
  useEffect(() => {
    if (!alunoToken) return
    let cancelado = false
    fetch(`${FUNCTIONS_URL}/portal-dados?token=${encodeURIComponent(alunoToken)}`, { headers: headersPublicos })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelado || !json?.devedor) return
        const d = json.devedor
        setForm((f) => ({
          ...f,
          nome: d.nome || f.nome,
          telefone: d.telefone ? mascaraTelefone(String(d.telefone)) : f.telefone,
          email: d.email || f.email,
          cpf: d.cpf ? mascaraCPF(String(d.cpf)) : f.cpf,
          dataNascimento: d.data_nascimento ? d.data_nascimento.split('-').reverse().join('/') : f.dataNascimento,
          responsavelNome: d.responsavel_nome || f.responsavelNome,
          responsavelTelefone: d.responsavel_telefone ? mascaraTelefone(String(d.responsavel_telefone)) : f.responsavelTelefone,
        }))
        setAlunoPreenchido(true)
      })
      .catch(() => {})
    return () => { cancelado = true }
  }, [alunoToken])

  const empresa = dados?.empresa
  const produto = dados?.produto
  const aparencia = useMemo(() => (empresa ? resolverAparenciaLoja(empresa) : null), [empresa])
  useEffect(() => { if (aparencia) carregarFontesBio([aparencia.fonteId]) }, [aparencia])
  useEffect(() => { if (produto && empresa) document.title = `${produto.nome} · ${empresa.nome_empresa}` }, [produto, empresa])

  useEffect(() => {
    // primeira forma liberada como padrão
    const f = empresa?.formas_pagamento
    if (f && !f.pix && f.cartao) setMetodo('cartao')
  }, [empresa])

  if (loading) return <TelaCarregando />
  if (erroCarga || !empresa || !produto) return <TelaIndisponivel titulo="Item indisponível" mensagem={erroCarga?.message} telefone={dados?.empresa?.telefone} />

  const { tema, fonte } = aparencia
  const indisponivel = produto.esgotado || produto.lotado
  const pagamentoDisponivel = dados.pagamento_disponivel !== false
  const exigeNascimento = produto.tipo === 'plano' || produto.tipo === 'pacote'
  const nascISO = dataNascimentoParaISO(form.dataNascimento)
  const menor = nascISO ? idadeEmAnos(nascISO) < 18 : false
  const temVariacoes = produto.tipo === 'produto' && (produto.variacoes || []).length > 0
  const formas = empresa.formas_pagamento || { pix: true }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setMask = (k, mask) => (e) => setForm((f) => ({ ...f, [k]: mask(e.target.value) }))

  const irParaFicha = () => {
    if (temVariacoes && !variacao) { setErros({ variacao: 'Escolha uma opção' }); return }
    setErros({})
    setEtapa('ficha')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const validar = () => {
    const e = {}
    if (form.nome.trim().length < 2) e.nome = 'Digite o nome completo'
    if (exigeNascimento && !nascISO) e.dataNascimento = 'Data inválida (DD/MM/AAAA)'
    if (!exigeNascimento && form.dataNascimento && !nascISO) e.dataNascimento = 'Data inválida (DD/MM/AAAA)'
    if (menor) {
      if (form.responsavelNome.trim().length < 2) e.responsavelNome = 'Nome do responsável'
      if (!validarTelefone(form.responsavelTelefone)) e.responsavelTelefone = 'WhatsApp inválido'
      if (!validarCPF(form.responsavelCpf)) e.responsavelCpf = 'CPF inválido'
    } else {
      if (!validarTelefone(form.telefone)) e.telefone = 'WhatsApp inválido'
      if (!validarCPF(form.cpf)) e.cpf = 'CPF inválido'
    }
    for (const c of produto.campos_extras || []) {
      if (c.obrigatorio && !(respostas[c.chave] || '').trim()) e[`extra_${c.chave}`] = 'Preencha este campo'
    }
    setErros(e)
    return Object.keys(e).length === 0
  }

  const comprar = async () => {
    setErroGeral(null)
    if (!validar()) return
    setEnviando(true)
    try {
      const res = await lojaApi.comprar({
        slug, produto_id: produto.id, variacao: variacao || null, metodo, website: form.website,
        origem_link: query.get('o') || (alunoToken ? 'ficha' : 'direto'),
        aluno_token: alunoToken || undefined,
        ficha: {
          nome: form.nome.trim(), telefone: form.telefone, cpf: form.cpf, email: form.email.trim() || null,
          data_nascimento: nascISO || null,
          responsavel_nome: menor ? form.responsavelNome.trim() : null,
          responsavel_telefone: menor ? form.responsavelTelefone : null,
          responsavel_cpf: menor ? form.responsavelCpf : null,
          respostas,
        },
      })
      navigate(`/loja/${slug}/pedido/${res.token}`, { replace: true, state: { pagamento: res.pagamento, empresa } })
    } catch (err) {
      const campo = ERROS_CAMPO[err.code]
      if (campo) setErros({ [campo]: err.message })
      else if (err.code === 'campo_extra' && err.extra?.campo) setErros({ [`extra_${err.extra.campo}`]: err.message })
      else if (err.code === 'esgotado' || err.code === 'lotado' || err.code === 'produto_inativo' || err.code === 'valor_minimo') {
        setErroGeral(err.message)
        setEtapa('item')
        lojaApi.item(slug, produtoId).then(setDados).catch(() => {})
      } else setErroGeral(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const botaoPrimario = {
    width: '100%', padding: '15px', borderRadius: '14px', border: 'none', cursor: 'pointer', fontFamily: fonte.stack, fontWeight: 700, fontSize: '15.5px',
    backgroundColor: tema.destaque, color: tema.destaqueTexto, boxShadow: `0 10px 24px -10px ${tema.destaque}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  }
  const card = { padding: '16px', borderRadius: '18px', backgroundColor: tema.card, border: `1.5px solid ${tema.cardBorda}`, color: tema.cardTexto, boxShadow: tema.sombra }

  // ---------------- ETAPA ITEM ----------------
  if (etapa === 'item') {
    return (
      <LojaShell empresa={empresa} aparencia={aparencia} titulo={aparencia.titulo} subtitulo={null} voltar={() => navigate(`/loja/${slug}`)}>
        <div style={{ borderRadius: '20px', overflow: 'hidden', backgroundColor: 'var(--lj-sutil)', aspectRatio: produto.imagem_url ? '4 / 3' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: produto.imagem_url ? undefined : '120px' }}>
          {produto.imagem_url
            ? <img src={produto.imagem_url} alt={produto.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Icon icon={TIPO_ICONE[produto.tipo]} width="56" style={{ opacity: 0.6 }} />}
        </div>

        <h2 style={{ margin: '18px 0 6px', fontSize: '24px', fontWeight: 800, lineHeight: 1.15 }}>{produto.nome}</h2>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontSize: '26px', fontWeight: 800 }}>{fmtBRL(produto.valor)}</span>
          {sufixoPreco(produto) && <span style={{ fontSize: '14px', color: tema.textoSuave }}>{sufixoPreco(produto)}</span>}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
          {produto.tipo === 'plano' && <Chip tema={tema} icon="mdi:calendar-sync">{`Cobrança ${produto.plano?.ciclo_cobranca || 'mensal'}`}</Chip>}
          {produto.tipo === 'plano' && produto.exigir_turma && <Chip tema={tema} icon="mdi:clock-outline">Você escolhe o horário após pagar</Chip>}
          {produto.tipo === 'pacote' && produto.plano?.numero_aulas && <Chip tema={tema} icon="mdi:ticket-confirmation-outline">{`${produto.plano.numero_aulas} aulas`}</Chip>}
          {produto.tipo === 'pacote' && produto.validade_dias && <Chip tema={tema} icon="mdi:timer-sand">{`Validade ${produto.validade_dias} dias`}</Chip>}
          {produto.tipo === 'evento' && produto.data_evento && <Chip tema={tema} icon="mdi:calendar">{fmtDataHora(produto.data_evento)}</Chip>}
          {produto.tipo === 'evento' && produto.local_evento && <Chip tema={tema} icon="mdi:map-marker">{produto.local_evento}</Chip>}
          {produto.tipo === 'evento' && produto.vagas_restantes != null && <Chip tema={tema} icon="mdi:account-group">{`${produto.vagas_restantes} vagas`}</Chip>}
          {produto.retirada_presencial && <Chip tema={tema} icon="mdi:storefront">Retirada na academia</Chip>}
        </div>

        {produto.descricao && <p style={{ margin: '16px 0 0', fontSize: '14.5px', lineHeight: 1.6, color: tema.textoSuave, whiteSpace: 'pre-line' }}>{produto.descricao}</p>}

        {temVariacoes && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tema.textoSuave, marginBottom: '8px' }}>Escolha uma opção</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {produto.variacoes.map((v) => {
                const ativo = variacao === v.nome
                return (
                  <button key={v.nome} type="button" disabled={v.esgotado} onClick={() => { setVariacao(v.nome); setErros({}) }}
                    style={{ padding: '10px 16px', borderRadius: '12px', fontFamily: fonte.stack, fontWeight: 700, fontSize: '14px', cursor: v.esgotado ? 'default' : 'pointer',
                      border: `1.5px solid ${ativo ? tema.destaque : tema.cardBorda}`, backgroundColor: ativo ? tema.destaque : tema.card, color: ativo ? tema.destaqueTexto : tema.cardTexto,
                      opacity: v.esgotado ? 0.45 : 1, textDecoration: v.esgotado ? 'line-through' : 'none' }}>
                    {v.nome}
                  </button>
                )
              })}
            </div>
            {erros.variacao && <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--lj-erro)', fontWeight: 600 }}>{erros.variacao}</div>}
          </div>
        )}

        {erroGeral && <Aviso tema={tema} tipo="erro">{erroGeral}</Aviso>}
        {!pagamentoDisponivel && <Aviso tema={tema}>As compras online estão temporariamente indisponíveis. Fale com a academia pelo WhatsApp.</Aviso>}

        <div style={{ marginTop: '24px' }}>
          <button type="button" onClick={irParaFicha} disabled={indisponivel || !pagamentoDisponivel} style={{ ...botaoPrimario, opacity: indisponivel || !pagamentoDisponivel ? 0.5 : 1, cursor: indisponivel || !pagamentoDisponivel ? 'default' : 'pointer' }}>
            {produto.esgotado ? 'Esgotado' : produto.lotado ? 'Vagas esgotadas' : TIPO_CTA[produto.tipo]}
            {!indisponivel && <Icon icon="mdi:arrow-right" width="20" />}
          </button>
          <p style={{ textAlign: 'center', fontSize: '12px', color: tema.textoSuave, margin: '18px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Icon icon="mdi:lock-outline" width="14" />
            {(() => {
              const lista = [formas.pix && 'Pix', formas.cartao && 'cartão', formas.boleto && 'boleto'].filter(Boolean)
              const texto = lista.length > 1 ? `${lista.slice(0, -1).join(', ')} ou ${lista[lista.length - 1]}` : lista[0]
              return `Pagamento seguro por ${texto}`
            })()}
          </p>
        </div>
      </LojaShell>
    )
  }

  // ---------------- ETAPA FICHA ----------------
  return (
    <LojaShell empresa={empresa} aparencia={aparencia} titulo={aparencia.titulo} subtitulo={null} voltar={() => setEtapa('item')}>
      <div style={{ ...card, display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '12px', overflow: 'hidden', backgroundColor: 'var(--lj-sutil)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {produto.imagem_url ? <img src={produto.imagem_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon icon={TIPO_ICONE[produto.tipo]} width="26" style={{ opacity: 0.7 }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '14.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{produto.nome}{variacao ? ` · ${variacao}` : ''}</div>
          <div style={{ fontSize: '13px', opacity: 0.8 }}>{fmtBRL(produto.valor)}{sufixoPreco(produto)}</div>
        </div>
      </div>

      <Passos tema={tema} atual={1} />

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{exigeNascimento ? 'Dados do aluno' : 'Seus dados'}</h3>
        {alunoPreenchido && <Aviso tema={tema} compacto>Preenchemos com o seu cadastro. Confira e siga.</Aviso>}

        <Campo label="Nome completo" erro={erros.nome}>
          <input style={inputStyle(tema, erros.nome)} value={form.nome} onChange={set('nome')} autoComplete="name" placeholder="Como está no documento" />
        </Campo>

        <Campo label={exigeNascimento ? 'Data de nascimento' : 'Data de nascimento (opcional)'} erro={erros.dataNascimento}>
          <input style={inputStyle(tema, erros.dataNascimento)} value={form.dataNascimento} onChange={setMask('dataNascimento', mascaraData)} inputMode="numeric" placeholder="DD/MM/AAAA" />
        </Campo>

        {menor ? (
          <>
            <div style={{ fontSize: '12.5px', padding: '10px 12px', borderRadius: '10px', backgroundColor: 'var(--lj-sutil)' }}>
              Menor de 18 anos: os dados abaixo são do <strong>responsável</strong>, que fará o pagamento.
            </div>
            <Campo label="Nome do responsável" erro={erros.responsavelNome}>
              <input style={inputStyle(tema, erros.responsavelNome)} value={form.responsavelNome} onChange={set('responsavelNome')} />
            </Campo>
            <Campo label="WhatsApp do responsável" erro={erros.responsavelTelefone}>
              <input style={inputStyle(tema, erros.responsavelTelefone)} value={form.responsavelTelefone} onChange={setMask('responsavelTelefone', mascaraTelefone)} inputMode="tel" placeholder="(00) 00000-0000" />
            </Campo>
            <Campo label="CPF do responsável" erro={erros.responsavelCpf} dica="Necessário para emitir o pagamento">
              <input style={inputStyle(tema, erros.responsavelCpf)} value={form.responsavelCpf} onChange={setMask('responsavelCpf', mascaraCPF)} inputMode="numeric" placeholder="000.000.000-00" />
            </Campo>
          </>
        ) : (
          <>
            <Campo label="WhatsApp" erro={erros.telefone} dica="Você recebe a confirmação por aqui">
              <input style={inputStyle(tema, erros.telefone)} value={form.telefone} onChange={setMask('telefone', mascaraTelefone)} inputMode="tel" placeholder="(00) 00000-0000" disabled={alunoPreenchido && !!form.telefone} />
            </Campo>
            <Campo label="CPF" erro={erros.cpf} dica="Necessário para emitir o pagamento">
              <input style={inputStyle(tema, erros.cpf)} value={form.cpf} onChange={setMask('cpf', mascaraCPF)} inputMode="numeric" placeholder="000.000.000-00" />
            </Campo>
          </>
        )}

        <Campo label="E-mail (opcional)" erro={erros.email}>
          <input style={inputStyle(tema, erros.email)} value={form.email} onChange={set('email')} type="email" autoComplete="email" />
        </Campo>

        {(produto.campos_extras || []).map((c) => (
          <Campo key={c.chave} label={`${c.rotulo || c.chave}${c.obrigatorio ? '' : ' (opcional)'}`} erro={erros[`extra_${c.chave}`]}>
            {c.tipo === 'opcao' && Array.isArray(c.opcoes) && c.opcoes.length ? (
              <select style={inputStyle(tema, erros[`extra_${c.chave}`])} value={respostas[c.chave] || ''} onChange={(e) => setRespostas((r) => ({ ...r, [c.chave]: e.target.value }))}>
                <option value="">Selecione</option>
                {c.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input style={inputStyle(tema, erros[`extra_${c.chave}`])} value={respostas[c.chave] || ''} onChange={(e) => setRespostas((r) => ({ ...r, [c.chave]: e.target.value }))} />
            )}
          </Campo>
        ))}

        {/* isca anti-robô */}
        <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: '-9999px', opacity: 0 }} aria-hidden="true" />
      </div>

      <div style={{ ...card, marginTop: '14px' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 800 }}>Como você quer pagar?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${[formas.pix, formas.cartao, formas.boleto].filter(Boolean).length}, 1fr)`, gap: '8px' }}>
          {formas.pix && <OpcaoMetodo tema={tema} ativo={metodo === 'pix'} onClick={() => setMetodo('pix')} icon="mdi:qrcode" label="Pix" sub="Na hora" />}
          {formas.cartao && <OpcaoMetodo tema={tema} ativo={metodo === 'cartao'} onClick={() => setMetodo('cartao')} icon="mdi:credit-card-outline" label="Cartão" sub="Crédito" />}
          {formas.boleto && <OpcaoMetodo tema={tema} ativo={metodo === 'boleto'} onClick={() => setMetodo('boleto')} icon="mdi:barcode" label="Boleto" sub="1 a 2 dias" />}
        </div>
      </div>

      {erroGeral && <Aviso tema={tema} tipo="erro">{erroGeral}</Aviso>}

      <div style={{ marginTop: '18px' }}>
        <button type="button" onClick={comprar} disabled={enviando} style={{ ...botaoPrimario, opacity: enviando ? 0.7 : 1 }}>
          {enviando ? <Icon icon="eos-icons:loading" width="22" /> : <>Continuar para o pagamento · {fmtBRL(produto.valor)} <Icon icon="mdi:arrow-right" width="20" /></>}
        </button>
        <p style={{ textAlign: 'center', fontSize: '11.5px', color: tema.textoSuave, margin: '10px 0 0', lineHeight: 1.5 }}>
          Seus dados ficam só com a {empresa.nome_empresa}. O pagamento é processado pelo Asaas.
        </p>
      </div>
    </LojaShell>
  )
}

function Chip({ tema, icon, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: tema.card, border: `1px solid ${tema.cardBorda}`, color: tema.cardTexto }}>
      <Icon icon={icon} width="15" /> {children}
    </span>
  )
}

export function Aviso({ tema, tipo, compacto, children }) {
  const erro = tipo === 'erro'
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: compacto ? '9px 12px' : '12px 14px', borderRadius: '12px', marginTop: compacto ? 0 : '14px', fontSize: '13px', lineHeight: 1.45,
      backgroundColor: erro ? 'var(--lj-erro-bg)' : tema.avisoBg, border: `1px solid ${erro ? 'var(--lj-erro)' : tema.avisoBorda}`, color: erro ? 'var(--lj-erro)' : tema.avisoTexto }}>
      <Icon icon={erro ? 'mdi:alert-circle-outline' : 'mdi:information-outline'} width="18" style={{ flexShrink: 0, marginTop: '1px' }} />
      <span>{children}</span>
    </div>
  )
}

export function Passos({ tema, atual, total = 3, rotulos = ['Cadastro', 'Pagamento', 'Confirmação'] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0 14px' }}>
      {rotulos.slice(0, total).map((r, i) => {
        const n = i + 1
        const feito = n < atual
        const ativo = n === atual
        return (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, flexShrink: 0,
              backgroundColor: feito || ativo ? tema.destaque : tema.sutil, color: feito || ativo ? tema.destaqueTexto : tema.textoSuave }}>
              {feito ? <Icon icon="mdi:check" width="14" /> : n}
            </div>
            <span style={{ fontSize: '11.5px', fontWeight: ativo ? 700 : 500, color: ativo ? tema.texto : tema.textoSuave, whiteSpace: 'nowrap' }}>{r}</span>
            {n < total && <div style={{ flex: 1, height: '1px', backgroundColor: tema.cardBorda, marginLeft: '2px' }} />}
          </div>
        )
      })}
    </div>
  )
}

function OpcaoMetodo({ tema, ativo, onClick, icon, label, sub }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: '12px 8px', borderRadius: '14px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
        border: `1.5px solid ${ativo ? tema.destaque : tema.cardBorda}`, backgroundColor: ativo ? tema.destaque : tema.card, color: ativo ? tema.destaqueTexto : tema.cardTexto }}>
      <Icon icon={icon} width="24" />
      <div style={{ fontWeight: 700, fontSize: '13.5px', marginTop: '4px' }}>{label}</div>
      <div style={{ fontSize: '11px', opacity: 0.75 }}>{sub}</div>
    </button>
  )
}
