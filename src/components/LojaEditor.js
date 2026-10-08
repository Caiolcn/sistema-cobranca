import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import { showToast } from '../Toast'
import { useUser } from '../contexts/UserContext'
import useWindowSize from '../hooks/useWindowSize'
import { useUserPlan } from '../hooks/useUserPlan'
import { FONTES_BIO, todosOsTemas, carregarFontesBio, bioPublicada } from '../data/bioTemas'
import Tabs from '../design-system/components/Tabs'
import Button from '../design-system/components/Button'
import { LojaView } from '../pages/loja/LojaVitrine'
import { montarEmpresaPreview, montarSecoesPreview, PASSOS_PADRAO, corDaLoja } from '../pages/loja/lojaTema'
import LojaWizard from './loja/LojaWizard'
import LojaProdutos from './loja/LojaProdutos'
import LojaPedidos from './loja/LojaPedidos'
import LojaLink from './loja/LojaLink'
import {
  Bloco, Chave, titulo, dica, campo, VERDE, PRECO_ADDON,
  normalizarCfg, produtosVisiveis, SELECT_PRODUTO, erroDeSchema, MSG_SQL, colocarNaBio, lojaNaBio
} from './loja/lojaUtil'

// Editor da Loja (Marketing › Loja) — lado do gestor do Mensalli Vendas.
// Mesma estrutura do BioEditor: formulário à esquerda, preview da vitrine à
// direita na moldura de celular (no mobile vira "Ver como fica").
//
// O que salva na hora: Produtos (loja_produtos) e ações em Pedidos (loja_pedidos).
// O que salva na barra "Salvar": tudo de Configurar (usuarios.loja_config + loja_ativa).

const CAMPOS_USUARIO = 'nome_empresa, logo_url, telefone, landing_cor_primaria, landing_foto_capa_url, landing_descricao, landing_hero_subtitulo, instagram_url, bio_config, loja_config, loja_ativa, agendamento_slug, agendamento_ativo, plano, asaas_api_key, modo_integracao, endereco, numero, bairro, cidade, estado, landing_ativo, landing_galeria, landing_faq, landing_depoimentos_manuais, landing_cta_final_titulo, landing_cta_final_subtitulo'

const SUB_ABAS = [
  { value: 'produtos', label: 'Produtos', icon: 'mdi:tag-multiple-outline' },
  { value: 'pedidos', label: 'Pedidos', icon: 'mdi:cart-outline' },
  { value: 'configurar', label: 'Configurar', icon: 'mdi:cog-outline' }
]

const Carregando = () => <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Carregando...</div>

function ItemChecklist({ ok, aviso, texto, detalhe, acao }) {
  const cor = ok ? '#166534' : aviso ? '#92400e' : '#991b1b'
  const icone = ok ? 'mdi:check-circle' : aviso ? 'mdi:alert-circle-outline' : 'mdi:close-circle-outline'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <Icon icon={icone} width="20" style={{ color: ok ? VERDE : aviso ? '#f59e0b' : '#ef4444', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: cor }}>{texto}</div>
        {detalhe && <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.4 }}>{detalhe}</div>}
      </div>
      {!ok && acao}
    </div>
  )
}

// WhatsApp do Mensalli (mesmo número de Ajuda e Minha Assinatura)
const WHATSAPP_MENSALLI = '5562981618862'
const linkAtivarAddon = (nomeEmpresa) =>
  `https://wa.me/${WHATSAPP_MENSALLI}?text=${encodeURIComponent(`Quero ativar o Mensalli Vendas${nomeEmpresa ? ` na conta ${nomeEmpresa}` : ''}.`)}`

export default function LojaEditor({ onIrParaAssinatura, onIrParaIntegracoes }) {
  const { userId, nomeEmpresa, telefoneEmpresa, refreshExtras, isAdmin, adminViewingAs } = useUser()
  const { isLocked, hasAddon, loading: planoCarregando } = useUserPlan()
  const { width } = useWindowSize()
  const mobile = width < 980

  const [loading, setLoading] = useState(true)
  const [linha, setLinha] = useState(null)              // linha de usuarios
  const [produtos, setProdutos] = useState([])
  const [planos, setPlanos] = useState([])
  const [modalidades, setModalidades] = useState([])
  const [contratos, setContratos] = useState([])
  const [zapConectado, setZapConectado] = useState(true)
  const [cfg, setCfg] = useState(normalizarCfg(null))   // loja_config em edição
  const [noAr, setNoAr] = useState(false)               // loja_ativa em edição
  const [salvo, setSalvo] = useState('')                // JSON do que está salvo
  const [salvando, setSalvando] = useState(false)
  const [wizard, setWizard] = useState(false)
  const [subAba, setSubAba] = useState('produtos')
  const [previewAberto, setPreviewAberto] = useState(false)
  const [previewTelaCheia, setPreviewTelaCheia] = useState(false)
  const [bioOcupado, setBioOcupado] = useState(false)
  const gerandoSlug = useRef(false)

  const temAddon = hasAddon('vendas')
  const visualizandoCliente = isAdmin && !!adminViewingAs
  const podeUpload = !visualizandoCliente

  useEffect(() => { carregarFontesBio(FONTES_BIO.map(f => f.id)) }, [])

  const carregar = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [rUsuario, rProdutos, rPlanos, rModalidades, rContratos, rZap] = await Promise.all([
      supabase.from('usuarios').select(CAMPOS_USUARIO).eq('id', userId).single(),
      supabase.from('loja_produtos').select(SELECT_PRODUTO).eq('user_id', userId).order('ordem', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('planos').select('id, nome, valor, descricao, ativo, ciclo_cobranca, tipo, numero_aulas').eq('user_id', userId).eq('ativo', true).order('nome'),
      supabase.from('modalidades').select('id, nome, cor').eq('user_id', userId).order('nome'),
      supabase.from('contratos_templates').select('id, titulo, ativo').eq('user_id', userId).eq('ativo', true).order('titulo'),
      supabase.from('mensallizap').select('id').eq('user_id', userId).eq('conectado', true).limit(1)
    ])
    if (rUsuario.error || rProdutos.error) {
      const e = rUsuario.error || rProdutos.error
      showToast(erroDeSchema(e) ? MSG_SQL : 'Erro ao carregar a loja: ' + e.message, 'error')
    }
    if (rUsuario.data) {
      setLinha(rUsuario.data)
      const inicial = normalizarCfg(rUsuario.data.loja_config)
      setCfg(inicial)
      setNoAr(!!rUsuario.data.loja_ativa)
      setSalvo(JSON.stringify({ cfg: inicial, noAr: !!rUsuario.data.loja_ativa }))
    }
    const lista = rProdutos.data || []
    setProdutos(lista)
    setWizard(!rProdutos.error && lista.length === 0)
    setPlanos(rPlanos.data || [])
    setModalidades(rModalidades.data || [])
    setContratos(rContratos.data || [])
    setZapConectado((rZap.data || []).length > 0)
    setLoading(false)
  }, [userId])

  useEffect(() => { carregar() }, [carregar])

  // Endereço público: nasce aqui se a conta ainda não tem (igual LinkPortalConta)
  useEffect(() => {
    if (!linha || linha.agendamento_slug || !temAddon || gerandoSlug.current || !userId) return
    gerandoSlug.current = true
    ;(async () => {
      try {
        const { data: gerado, error } = await supabase.rpc('gerar_agendamento_slug', { nome_empresa: linha.nome_empresa || nomeEmpresa || 'academia' })
        if (error || !gerado) throw error || new Error('slug vazio')
        const { error: erroUpd } = await supabase.from('usuarios').update({ agendamento_slug: gerado }).eq('id', userId)
        if (erroUpd) throw erroUpd
        setLinha(prev => ({ ...prev, agendamento_slug: gerado }))
      } catch (e) {
        console.error('Erro ao gerar endereço da loja:', e)
        showToast('Não foi possível gerar o endereço da loja agora.', 'error')
      } finally {
        gerandoSlug.current = false
      }
    })()
  }, [linha, temAddon, userId, nomeEmpresa])

  // ---------- derivados ----------
  const asaasOk = !!(linha && linha.asaas_api_key && linha.modo_integracao === 'asaas')
  const slug = linha?.agendamento_slug || ''
  const temItemAtivo = produtos.some(p => p.ativo)
  const alterado = JSON.stringify({ cfg, noAr }) !== salvo
  const premiumComAgendamento = !!linha && String(linha.plano || '').toLowerCase() === 'premium' && !!linha.agendamento_ativo
  const bioNoAr = !!linha && bioPublicada(linha.bio_config, linha.landing_ativo)
  const jaNaBio = lojaNaBio(linha?.bio_config)

  const empresaPreview = useMemo(() => {
    if (!linha) return null
    try {
      return montarEmpresaPreview({ userRow: { ...linha, loja_config: cfg, loja_ativa: noAr }, bioConfig: linha.bio_config, lojaConfig: cfg })
    } catch (e) {
      console.error('Erro ao montar preview da loja:', e)
      return null
    }
  }, [linha, cfg, noAr])
  const produtosPreview = useMemo(() => produtosVisiveis(produtos), [produtos])
  const secoesPreview = useMemo(() => {
    if (!linha) return {}
    try { return montarSecoesPreview(linha, cfg) } catch { return {} }
  }, [linha, cfg])

  const setCfgCampo = (patch) => setCfg(prev => ({ ...prev, ...patch }))
  const setSecoes = (patch) => setCfg(prev => ({ ...prev, secoes: { ...prev.secoes, ...patch } }))
  const setRetirada = (patch) => setCfg(prev => ({ ...prev, retirada: { ...prev.retirada, ...patch } }))
  const setAparencia = (patch) => setCfg(prev => ({ ...prev, aparencia: { ...prev.aparencia, ...patch } }))

  const salvar = async () => {
    if (noAr && !asaasOk) { showToast('Conecte o Asaas antes de colocar a loja no ar.', 'warning'); return }
    if (noAr && !slug) { showToast('O endereço da loja ainda está sendo gerado. Tente de novo em instantes.', 'warning'); return }
    setSalvando(true)
    try {
      const limpo = {
        ...cfg,
        titulo: cfg.titulo.trim(),
        frase: cfg.frase.trim(),
        boas_vindas: cfg.boas_vindas.trim(),
        suporte_whatsapp: cfg.suporte_whatsapp.trim(),
        retirada: { ...cfg.retirada, endereco: (cfg.retirada.endereco || '').trim(), horario: (cfg.retirada.horario || '').trim() }
      }
      const mudouAr = noAr !== !!linha.loja_ativa
      const atualizacao = { loja_config: limpo }
      if (mudouAr) atualizacao.loja_ativa = noAr
      const { error } = await supabase.from('usuarios').update(atualizacao).eq('id', userId)
      if (error) {
        if (erroDeSchema(error)) { showToast(MSG_SQL, 'error'); return }
        throw error
      }
      setCfg(limpo)
      setLinha(prev => ({ ...prev, loja_config: limpo, loja_ativa: noAr }))
      setSalvo(JSON.stringify({ cfg: limpo, noAr }))
      if (mudouAr) refreshExtras()
      showToast(noAr ? 'Loja salva e no ar!' : 'Loja salva!', 'success')
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  const colocarLojaNaBio = async () => {
    setBioOcupado(true)
    try {
      const novo = await colocarNaBio(userId)
      setLinha(prev => ({ ...prev, bio_config: novo }))
      showToast('A loja agora aparece na sua bio', 'success')
    } catch (err) {
      showToast('Erro ao atualizar a bio: ' + err.message, 'error')
    } finally {
      setBioOcupado(false)
    }
  }

  // ---------- gates ----------
  if (planoCarregando) return <Carregando />

  // Loja exige Pro ou Premium (gateLoja na edge aplica a mesma regra)
  if (isLocked('pro')) {
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '60px 40px', textAlign: 'center', border: '1px solid #e5e7eb', maxWidth: '500px', margin: '40px auto' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#fff3e0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
          <Icon icon="mdi:lock" width="32" style={{ color: '#ff9800' }} />
        </div>
        <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: 600, color: '#1a1a1a' }}>Mensalli Vendas</h2>
        <p style={{ margin: '0 0 24px', fontSize: '15px', color: '#666', lineHeight: 1.6 }}>
          Sua loja online para vender planos, pacotes, produtos e eventos.
          Disponível a partir do plano <strong>Pro</strong>.
        </p>
        <button onClick={onIrParaAssinatura}
          style={{ padding: '12px 32px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>
          Fazer upgrade
        </button>
      </div>
    )
  }

  if (!temAddon) {
    return (
      <div style={{ maxWidth: '560px', margin: '24px auto' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '18px', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px auto' }}>
            <Icon icon="mdi:storefront-outline" width="34" style={{ color: VERDE }} />
          </div>
          <h2 style={{ margin: '0 0 10px', fontSize: '24px', fontWeight: 800, color: '#111827' }}>Mensalli Vendas</h2>
          <p style={{ margin: '0 0 18px', fontSize: '15px', color: '#4b5563', lineHeight: 1.6 }}>
            Sua página para vender planos e produtos 24h por dia. O aluno escolhe, se cadastra, paga e agenda sozinho. Sem comissão sobre vendas.
          </p>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#111827', marginBottom: '4px' }}>{PRECO_ADDON}</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '20px' }}>Add-on do seu plano. Cancele quando quiser.</div>
          {/* A ativação é feita pela equipe do Mensalli pelo WhatsApp (cobrança por Pix e
              liberação na conta). O checkout do add-on dentro do app fica para depois. */}
          <Button variant="whatsapp" size="lg" icon="mdi:whatsapp" onClick={() => window.open(linkAtivarAddon(nomeEmpresa), '_blank', 'noopener')}>
            Ativar Mensalli Vendas
          </Button>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '10px' }}>Abre uma conversa com a nossa equipe. A gente ativa na hora.</div>
        </div>
        <div style={{ marginTop: '14px', backgroundColor: '#fff', borderRadius: '14px', padding: '18px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>O que inclui</div>
          {[
            ['mdi:calendar-sync-outline', 'Planos e pacotes', 'O aluno paga pelo Pix ou cartão, já vira cliente ativo com mensalidade e escolhe a turma na hora.'],
            ['mdi:tshirt-crew-outline', 'Produtos e eventos', 'Uniforme, suplemento, campeonato, aulão. Com variações, estoque, vagas e retirada presencial.'],
            ['mdi:link-variant', 'Um link só', 'Vitrine com a sua cara, no mesmo endereço do agendamento. Entra na bio com um clique.']
          ].map(([icone, t, d]) => (
            <div key={t} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '8px 0' }}>
              <Icon icon={icone} width="22" style={{ color: '#344848', flexShrink: 0, marginTop: '1px' }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{t}</div>
                <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loading || !linha) return <Carregando />

  const temas = todosOsTemas(linha.landing_cor_primaria || '#344848')

  // ---------- checklist ----------
  const tudoOk = asaasOk && !!slug && temItemAtivo
  const checklist = (
    <div style={{ backgroundColor: tudoOk && noAr ? '#f0fdf4' : '#fffbeb', border: `1px solid ${tudoOk && noAr ? '#bbf7d0' : '#fde68a'}`, borderRadius: '14px', padding: '14px 16px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: tudoOk && noAr ? '#166534' : '#92400e' }}>
          {noAr && linha.loja_ativa ? 'Sua loja está no ar' : 'Para a loja funcionar'}
        </div>
        {visualizandoCliente && (
          <span style={{ fontSize: '11px', color: '#6b7280', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Icon icon="mdi:eye-outline" width="14" /> vendo como cliente · uploads desativados
          </span>
        )}
      </div>
      <ItemChecklist ok={asaasOk} texto="Asaas conectado"
        detalhe={asaasOk ? null : 'É por ele que o aluno paga. Sem Asaas a loja não pode ir ao ar.'}
        acao={onIrParaIntegracoes && <Button variant="outline" size="sm" onClick={onIrParaIntegracoes}>Conectar Asaas</Button>} />
      <ItemChecklist ok={!!slug} texto="Endereço público" detalhe={slug ? `${window.location.host}/loja/${slug}` : 'Gerando o endereço da sua loja...'} />
      <ItemChecklist ok={zapConectado} aviso texto="WhatsApp conectado"
        detalhe={zapConectado ? null : 'Sem ele a confirmação de compra e o contrato não chegam ao aluno. A venda continua funcionando.'} />
      <ItemChecklist ok={temItemAtivo} texto="Pelo menos 1 item ativo"
        detalhe={temItemAtivo ? null : 'Adicione um plano, produto ou evento na aba Produtos.'}
        acao={!wizard && <Button variant="outline" size="sm" onClick={() => setSubAba('produtos')}>Adicionar</Button>} />
    </div>
  )

  // ---------- sub-aba Configurar ----------
  const configurar = (
    <div>
      <Bloco icone="mdi:rocket-launch-outline" nome="Publicação">
        <Chave ligado={noAr} disabled={!asaasOk} onChange={setNoAr}>
          <strong>Loja no ar</strong> <span style={{ color: '#6b7280' }}>(qualquer pessoa com o link consegue comprar)</span>
        </Chave>
        {!asaasOk && (
          <div style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.5, marginBottom: '10px' }}>
            Conecte o Asaas em Integrações para liberar este interruptor: é por ele que a loja recebe os pagamentos.
          </div>
        )}
        {noAr !== !!linha.loja_ativa && (
          <div style={{ fontSize: '12px', color: '#b45309', marginBottom: '10px' }}>Clique em <strong>Salvar loja</strong> para {noAr ? 'publicar' : 'tirar do ar'}.</div>
        )}
        <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.06)', margin: '6px 0 12px' }} />
        <LojaLink slug={slug} nomeEmpresa={linha.nome_empresa || nomeEmpresa} noAr={!!linha.loja_ativa} />
      </Bloco>

      <Bloco icone="mdi:palette-outline" nome="Aparência">
        <span style={titulo}>Cor</span>
        <p style={dica}>A loja é sempre clara; a cor escolhida vai para botões, selos e detalhes. "Minha cor" usa a cor da sua marca.</p>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '22px' }}>
          {temas.map(t => {
            const ativo = (cfg.aparencia.tema || 'marca') === t.id
            return (
              <button key={t.id} type="button" onClick={() => setAparencia({ tema: t.id })} title={t.nome} aria-label={t.nome}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'center' }}>
                <span style={{
                  display: 'block', width: '46px', height: '46px', borderRadius: '50%', backgroundColor: corDaLoja(t, linha.landing_cor_primaria || '#344848'),
                  boxShadow: ativo ? '0 0 0 3px #fff, 0 0 0 5px #111827' : '0 1px 4px rgba(0,0,0,0.25)', transition: 'box-shadow 0.15s'
                }} />
                <span style={{ display: 'block', marginTop: '8px', fontSize: '11px', fontWeight: ativo ? 700 : 500, color: ativo ? '#111827' : '#6b7280' }}>{t.nome}</span>
              </button>
            )
          })}
        </div>
        <span style={titulo}>Fonte</span>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
          {FONTES_BIO.map(f => {
            const ativo = (cfg.aparencia.fonte || 'inter') === f.id
            return (
              <button key={f.id} type="button" onClick={() => setAparencia({ fonte: f.id })}
                style={{ padding: '9px 14px', borderRadius: '10px', cursor: 'pointer', fontFamily: f.stack, fontSize: '16px', border: ativo ? '2px solid #111827' : '1px solid #d1d5db', backgroundColor: ativo ? '#111827' : '#fff', color: ativo ? '#fff' : '#374151' }}>
                {f.label}
              </button>
            )
          })}
        </div>
      </Bloco>

      <Bloco icone="mdi:text-box-outline" nome="Textos">
        <div style={{ display: 'grid', gap: '14px' }}>
          <div>
            <span style={titulo}>Título da loja</span>
            <input value={cfg.titulo} maxLength={60} onChange={(e) => setCfgCampo({ titulo: e.target.value })} placeholder={linha.nome_empresa || 'Nome da academia'} style={campo} />
          </div>
          <div>
            <span style={titulo}>Frase curta</span>
            <input value={cfg.frase} maxLength={120} onChange={(e) => setCfgCampo({ frase: e.target.value })} placeholder="Ex.: Planos, pacotes e produtos oficiais" style={campo} />
          </div>
          <div>
            <span style={titulo}>Boas-vindas na confirmação</span>
            <textarea value={cfg.boas_vindas} rows={3} maxLength={400} onChange={(e) => setCfgCampo({ boas_vindas: e.target.value })}
              placeholder="Ex.: Seja bem-vindo à família! Chegue 10 minutos antes da primeira aula para conhecer a equipe." style={{ ...campo, resize: 'vertical' }} />
            <div style={{ textAlign: 'right', fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{cfg.boas_vindas.length}/400</div>
          </div>
          <div>
            <span style={titulo}>WhatsApp de suporte</span>
            <input value={cfg.suporte_whatsapp} maxLength={20} onChange={(e) => setCfgCampo({ suporte_whatsapp: e.target.value })} placeholder={linha.telefone || telefoneEmpresa || '(11) 99999-9999'} style={campo} />
            <p style={{ ...dica, margin: '6px 0 0' }}>Em branco usa o telefone da conta.</p>
          </div>
          <div>
            <Chave ligado={cfg.retirada.ativa} onChange={(v) => setRetirada({ ativa: v })}>
              <strong>Retirada presencial</strong> <span style={{ color: '#6b7280' }}>(endereço e horário para produtos físicos)</span>
            </Chave>
            {cfg.retirada.ativa && (
              <div style={{ display: 'grid', gap: '8px', marginTop: '6px' }}>
                <input value={cfg.retirada.endereco} maxLength={160} onChange={(e) => setRetirada({ endereco: e.target.value })} placeholder="Endereço de retirada" style={campo} />
                <input value={cfg.retirada.horario} maxLength={120} onChange={(e) => setRetirada({ horario: e.target.value })} placeholder="Horário. Ex.: seg a sex, 8h às 20h" style={campo} />
              </div>
            )}
          </div>
          {premiumComAgendamento && (
            <Chave ligado={cfg.mostrar_experimental} onChange={(v) => setCfgCampo({ mostrar_experimental: v })}>
              <strong>Mostrar aula experimental</strong> <span style={{ color: '#6b7280' }}>(card com o botão de agendar grátis)</span>
            </Chave>
          )}
        </div>
      </Bloco>

      <Bloco icone="mdi:view-sequential-outline" nome="Seções da página">
        <p style={dica}>Capa e itens à venda sempre aparecem. As demais você liga e desliga aqui. Seção sem conteúdo fica oculta na página.</p>
        <SecaoToggle ligado={cfg.secoes.como_funciona} onChange={(v) => setSecoes({ como_funciona: v })} nome="Como funciona" sub="Três passos curtos. Deixe em branco para usar o texto padrão.">
          {cfg.secoes.como_funciona && (
            <div style={{ display: 'grid', gap: '6px' }}>
              {[0, 1, 2].map(i => (
                <input key={i} value={cfg.secoes.passos[i] || ''} maxLength={80} placeholder={PASSOS_PADRAO[i]} style={campo}
                  onChange={(e) => setSecoes({ passos: cfg.secoes.passos.map((p, j) => (j === i ? e.target.value : p)) })} />
              ))}
            </div>
          )}
        </SecaoToggle>
        <SecaoToggle ligado={cfg.secoes.resultados} onChange={(v) => setSecoes({ resultados: v })} nome="Resultados" sub={`Grade com as fotos da sua bio${secoesPreview.galeria?.length ? ` (${secoesPreview.galeria.length} fotos)` : ' — adicione fotos em Marketing › Bio para ativar'}.`} />
        <SecaoToggle ligado={cfg.secoes.depoimentos} onChange={(v) => setSecoes({ depoimentos: v })} nome="Depoimentos" sub="Notas 9 e 10 do NPS entram sozinhas. Você pode somar até três depoimentos próprios.">
          {cfg.secoes.depoimentos && (
            <ListaEditavel
              itens={cfg.secoes.depoimentos_manuais} max={3} onChange={(lista) => setSecoes({ depoimentos_manuais: lista })}
              novo={() => ({ nome: '', texto: '' })} rotuloAdicionar="Adicionar depoimento"
              render={(d, atualizar) => (
                <>
                  <input value={d.nome} maxLength={60} placeholder="Nome do aluno" style={campo} onChange={(e) => atualizar({ nome: e.target.value })} />
                  <textarea value={d.texto} maxLength={240} rows={2} placeholder="O que ele disse" style={{ ...campo, resize: 'vertical' }} onChange={(e) => atualizar({ texto: e.target.value })} />
                </>
              )} />
          )}
        </SecaoToggle>
        <SecaoToggle ligado={cfg.secoes.horarios} onChange={(v) => setSecoes({ horarios: v })} nome="Horários" sub="Grade da semana, direto da sua Agenda." />
        <SecaoToggle ligado={cfg.secoes.faq} onChange={(v) => setSecoes({ faq: v })} nome="Dúvidas frequentes" sub="Até seis perguntas. Se já tinha FAQ no site antigo, ele é usado enquanto esta lista estiver vazia.">
          {cfg.secoes.faq && (
            <ListaEditavel
              itens={cfg.secoes.faq_itens} max={6} onChange={(lista) => setSecoes({ faq_itens: lista })}
              novo={() => ({ pergunta: '', resposta: '' })} rotuloAdicionar="Adicionar pergunta"
              render={(f, atualizar) => (
                <>
                  <input value={f.pergunta} maxLength={120} placeholder="Pergunta (ex.: Precisa de experiência?)" style={campo} onChange={(e) => atualizar({ pergunta: e.target.value })} />
                  <textarea value={f.resposta} maxLength={400} rows={2} placeholder="Resposta" style={{ ...campo, resize: 'vertical' }} onChange={(e) => atualizar({ resposta: e.target.value })} />
                </>
              )} />
          )}
        </SecaoToggle>
        <SecaoToggle ligado={cfg.secoes.sobre} onChange={(v) => setSecoes({ sobre: v })} nome="Sobre e como chegar" sub="Descrição, endereço e Instagram do seu cadastro." />
        <SecaoToggle ligado={cfg.secoes.chamada_final} onChange={(v) => setSecoes({ chamada_final: v })} nome="Chamada final" sub="Bloco colorido no fim da página com botão para os planos." ultimo>
          {cfg.secoes.chamada_final && (
            <div style={{ display: 'grid', gap: '6px' }}>
              <input value={cfg.secoes.chamada_titulo} maxLength={60} placeholder="Pronto para começar?" style={campo} onChange={(e) => setSecoes({ chamada_titulo: e.target.value })} />
              <input value={cfg.secoes.chamada_texto} maxLength={140} placeholder="Escolha seu plano, pague em 2 minutos e garanta sua vaga." style={campo} onChange={(e) => setSecoes({ chamada_texto: e.target.value })} />
            </div>
          )}
        </SecaoToggle>
      </Bloco>

      <Bloco icone="mdi:link-variant" nome="Link na bio">
        <p style={dica}>Coloca o botão da loja na sua página de bio, junto dos outros botões.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {jaNaBio ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#166534' }}>
              <Icon icon="mdi:check-circle" width="18" style={{ color: VERDE }} /> A loja já está na bio
            </span>
          ) : (
            <Button variant="outline" icon="mdi:link-variant" onClick={colocarLojaNaBio} loading={bioOcupado}>Colocar na bio</Button>
          )}
          {!bioNoAr && (
            <span style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>
              Sua bio está fora do ar. Publique em Marketing › Link na bio para o botão aparecer.
            </span>
          )}
        </div>
      </Bloco>

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 0', background: 'linear-gradient(transparent, #f9fafb 30%)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button type="button" onClick={salvar} disabled={salvando || !alterado}
          style={{ padding: '12px 28px', borderRadius: '10px', border: 'none', backgroundColor: alterado ? VERDE : '#d1d5db', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: alterado && !salvando ? 'pointer' : 'default' }}>
          {salvando ? 'Salvando...' : 'Salvar loja'}
        </button>
        {alterado && <span style={{ fontSize: '12px', color: '#b45309' }}>Alterações não salvas</span>}
      </div>
    </div>
  )

  // ---------- coluna da esquerda ----------
  const formulario = (
    <div style={{ flex: 1, minWidth: 0, maxWidth: '680px' }}>
      {checklist}

      {wizard ? (
        <LojaWizard
          userId={userId}
          linha={linha}
          planos={planos}
          cfg={cfg}
          setCfg={setCfg}
          nomeEmpresa={linha.nome_empresa || nomeEmpresa}
          telefoneEmpresa={linha.telefone || telefoneEmpresa}
          asaasOk={asaasOk}
          onIrParaIntegracoes={onIrParaIntegracoes}
          onProdutosCriados={(rows) => setProdutos(prev => [...prev, ...rows].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)))}
          onCfgSalva={(final) => {
            setCfg(final)
            setLinha(prev => ({ ...prev, loja_config: final }))
            setSalvo(JSON.stringify({ cfg: final, noAr }))
          }}
          onLojaNoAr={async () => {
            setNoAr(true)
            setLinha(prev => ({ ...prev, loja_ativa: true }))
            setSalvo(prev => { try { const s = JSON.parse(prev); return JSON.stringify({ ...s, noAr: true }) } catch { return prev } })
            await refreshExtras()
          }}
          onBioAtualizada={(novo) => setLinha(prev => ({ ...prev, bio_config: novo }))}
          onConcluir={() => { setWizard(false); setSubAba('produtos') }}
          onPular={() => { setWizard(false); setSubAba('produtos') }}
        />
      ) : (
        <>
          <div style={{ marginBottom: '14px' }}>
            <Tabs items={SUB_ABAS} value={subAba} onChange={setSubAba} variant="segmented" fullWidth={mobile} />
          </div>
          {subAba === 'produtos' && (
            <LojaProdutos
              produtos={produtos}
              setProdutos={setProdutos}
              planos={planos}
              modalidades={modalidades}
              contratos={contratos}
              userId={userId}
              podeUpload={podeUpload}
              onImportarPlanos={planos.length ? () => setWizard(true) : null}
            />
          )}
          {subAba === 'pedidos' && <LojaPedidos userId={userId} slug={slug} produtos={produtos} />}
          {subAba === 'configurar' && configurar}
        </>
      )}
    </div>
  )

  const preview = (
    <div style={{ width: '100%', maxWidth: '340px', margin: '0 auto' }}>
      <div style={{ borderRadius: '38px', padding: '10px', backgroundColor: '#111827', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ borderRadius: '29px', overflow: 'hidden', height: mobile ? '560px' : 'min(640px, calc(100vh - 150px))', overflowY: 'auto', scrollbarWidth: 'none', backgroundColor: '#000' }}>
          {empresaPreview
            ? <LojaView empresa={empresaPreview} produtos={produtosPreview} secoes={secoesPreview} preview />
            : <div style={{ padding: '40px 20px', color: '#9ca3af', fontSize: '13px', textAlign: 'center' }}>Prévia indisponível</div>}
        </div>
      </div>
      {empresaPreview && (
        <button type="button" onClick={() => setPreviewTelaCheia(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', marginTop: '10px', padding: '9px', borderRadius: '10px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
          <Icon icon="mdi:monitor" width="16" /> Ver como fica no computador
        </button>
      )}
      {!noAr && (
        <div style={{ textAlign: 'center', fontSize: '12px', color: '#6b7280', marginTop: '10px' }}>Prévia: a loja ainda não está no ar.</div>
      )}
    </div>
  )

  // Prévia em tela cheia: a vitrine na largura real do navegador (layout de computador)
  const previewTelaCheiaEl = previewTelaCheia && empresaPreview && (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, backgroundColor: '#f6f7f9', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 16px', backgroundColor: '#111827', color: '#fff', fontSize: '13px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon icon="mdi:monitor" width="18" /> Prévia da loja como o aluno vê no computador. Os botões não navegam aqui.</span>
        <button type="button" onClick={() => setPreviewTelaCheia(false)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.3)', backgroundColor: 'transparent', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          <Icon icon="mdi:close" width="16" /> Fechar
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <LojaView empresa={empresaPreview} produtos={produtosPreview} secoes={secoesPreview} preview />
      </div>
    </div>
  )

  if (mobile) {
    return (
      <div>
        {formulario}
        <button type="button" onClick={() => setPreviewAberto(v => !v)}
          style={{ width: '100%', margin: '4px 0 14px', padding: '12px', borderRadius: '10px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
          {previewAberto ? 'Esconder prévia' : 'Ver como fica'}
        </button>
        {previewAberto && preview}
        {previewTelaCheiaEl}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
      {formulario}
      <div style={{ position: 'sticky', top: '16px', flexShrink: 0, width: '340px' }}>{preview}</div>
      {previewTelaCheiaEl}
    </div>
  )
}

// ---------- helpers do bloco "Seções da página" ----------

// Linha com interruptor + descrição; o conteúdo (mini editor) abre embaixo quando ligado.
function SecaoToggle({ ligado, onChange, nome, sub, children, ultimo }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: ultimo ? 'none' : '1px solid #f1f5f9' }}>
      <Chave ligado={ligado} onChange={onChange}>
        <strong>{nome}</strong>
        {sub && <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginTop: '2px', lineHeight: 1.4 }}>{sub}</span>}
      </Chave>
      {ligado && children ? <div style={{ marginTop: '8px', paddingLeft: '2px' }}>{children}</div> : null}
    </div>
  )
}

// Lista curta editável (FAQ, depoimentos): adicionar, editar inline, remover. Sem arrastar.
function ListaEditavel({ itens, max, onChange, novo, render, rotuloAdicionar }) {
  const lista = Array.isArray(itens) ? itens : []
  const atualizar = (i, patch) => onChange(lista.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const remover = (i) => onChange(lista.filter((_, j) => j !== i))
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {lista.map((item, i) => (
        <div key={i} style={{ display: 'grid', gap: '6px', padding: '10px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', position: 'relative' }}>
          {render(item, (patch) => atualizar(i, patch))}
          <button type="button" onClick={() => remover(i)} aria-label="Remover"
            style={{ position: 'absolute', top: '6px', right: '6px', width: '26px', height: '26px', borderRadius: '50%', border: 'none', background: '#fff', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
            <Icon icon="mdi:close" width="15" />
          </button>
        </div>
      ))}
      {lista.length < max && (
        <button type="button" onClick={() => onChange([...lista, novo()])}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px dashed #cbd5e1', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
          <Icon icon="mdi:plus" width="16" /> {rotuloAdicionar} ({lista.length}/{max})
        </button>
      )}
    </div>
  )
}
