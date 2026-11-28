import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, FUNCTIONS_URL } from './supabaseClient'
import { chamarEvolution } from './services/evolutionProxy'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import useWindowSize from './hooks/useWindowSize'
import ConfirmModal from './ConfirmModal'
import { useUserPlan } from './hooks/useUserPlan'
import { useUser } from './contexts/UserContext'
import whatsappService from './services/whatsappService'
import CentralMensagens from './CentralMensagens'
import { verificarSaude, gerarQrCode, resolverInstanceName } from './services/whatsappConexao'
import { resolverDestinatario } from './utils/destinatario'
// Textos vivem em src/data pra o wizard de onboarding poder semear os mesmos
// templates ao conectar, sem importar este componente inteiro
import { TEMPLATES_PADRAO, TEMPLATES_SEED, TITULOS_PADRAO } from './data/templatesPadrao'
import Alert from './design-system/components/Alert'
import Badge from './design-system/components/Badge'
import Card from './design-system/components/Card'
import Input from './design-system/components/Input'
import Textarea from './design-system/components/Textarea'
import Checkbox from './design-system/components/Checkbox'
import EmptyState from './design-system/components/EmptyState'
import Switch from './design-system/components/Switch'
import Button from './design-system/components/Button'
import Modal from './design-system/components/Modal'
import Select from './design-system/components/Select'
import Tabs from './design-system/components/Tabs'

console.log('>>> WhatsAppConexao.js CARREGADO <<<')

// Tradução visual da tag {{nomeCliente}} ↔ {{nomeAluno}}.
// Banco/automações (n8n) seguem usando {{nomeCliente}}; UI sempre mostra
// {{nomeAluno}} pra ser coerente com os chips. paraExibir é aplicada
// ao carregar; paraSalvar ao persistir.
const paraExibir = (msg) => (msg || '').replace(/\{\{nomeCliente\}\}/g, '{{nomeAluno}}')
const paraSalvar = (msg) => (msg || '').replace(/\{\{nomeAluno\}\}/g, '{{nomeCliente}}')

// Tipos ligados a AULA: o editor mostra outro conjunto de variáveis pra eles
// (nada de valor/vencimento) e esconde a nota de {{diasAtraso}}.
const TIPOS_AULA = ['class_reminder', 'class_reminder_24h', 'booking_confirmed']

// Destes dois quem renderiza são as edge functions (agendamento-agendar e
// lembrete-aula-24h), que conhecem a data do agendamento. O lembrete de 1h fica
// de fora de propósito: é montado pelo n8n, que NÃO substitui {{dataAula}} nem
// {{diaSemana}} — oferecer o chip lá faria o aluno receber a chave crua.
const TIPOS_AULA_COM_DATA = ['class_reminder_24h', 'booking_confirmed']

// ==========================================
// COMPONENTE: CAMPANHAS
// ==========================================
function CampanhasContent({ contextUserId, isSmallScreen, whatsappStatus, irParaConexao }) {
  const [campanhas, setCampanhas] = useState([])
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)

  // Form nova campanha
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [imagemUrl, setImagemUrl] = useState('') // imagem opcional (enviada como mídia com legenda)
  const [uploadingImagem, setUploadingImagem] = useState(false)
  const [imagemErro, setImagemErro] = useState('') // erro de upload mostrado inline no campo
  const imagemInputRef = useRef(null)
  const [segmento, setSegmento] = useState('todos')
  const [planos, setPlanos] = useState([])
  const [filtroPlanoId, setFiltroPlanoId] = useState('')
  const [destinatarios, setDestinatarios] = useState([])
  const [carregandoDest, setCarregandoDest] = useState(false)
  const [destExpandido, setDestExpandido] = useState(false)
  const [destDesmarcados, setDestDesmarcados] = useState(new Set()) // IDs removidos
  const [regrasExpandidas, setRegrasExpandidas] = useState(false)

  // Envio
  const [enviando, setEnviando] = useState(false)
  const [progresso, setProgresso] = useState({ enviados: 0, falhas: 0, total: 0 })
  const [campanhaAtiva, setCampanhaAtiva] = useState(null)
  const cancelarRef = useRef(false)

  // Tabs
  const [tab, setTab] = useState('nova') // 'nova' | 'historico'
  const [campanhaExpandida, setCampanhaExpandida] = useState(null) // id da campanha expandida
  const [enviosDaCampanha, setEnviosDaCampanha] = useState([]) // detalhes dos envios

  const carregarCampanhas = useCallback(async () => {
    if (!contextUserId) return
    const { data } = await supabase.from('campanhas').select('*').eq('user_id', contextUserId).order('created_at', { ascending: false }).limit(20)
    if (data) setCampanhas(data)
    setLoading(false)
  }, [contextUserId])

  const carregarPlanos = useCallback(async () => {
    if (!contextUserId) return
    const { data } = await supabase.from('planos').select('id, nome').eq('user_id', contextUserId).eq('ativo', true)
    if (data) setPlanos(data)
  }, [contextUserId])

  useEffect(() => { carregarCampanhas(); carregarPlanos() }, [carregarCampanhas, carregarPlanos])

  // Buscar destinatários com base no segmento
  const buscarDestinatarios = async () => {
    setCarregandoDest(true)
    let query = supabase.from('devedores')
      .select('id, nome, telefone, responsavel_nome, responsavel_telefone, assinatura_ativa, plano_id, bloquear_mensagens, comunicacoes_ativas')
      .eq('user_id', contextUserId)
      .or('lixo.is.null,lixo.eq.false')
      // Campanha é comunicação: só "Comunicações ativas" barra.
      .or('comunicacoes_ativas.is.null,comunicacoes_ativas.eq.true')
      .not('telefone', 'is', null)

    if (segmento === 'todos') {
      query = query.eq('assinatura_ativa', true)
    } else if (segmento === 'plano' && filtroPlanoId) {
      query = query.eq('plano_id', filtroPlanoId).eq('assinatura_ativa', true)
    } else if (segmento === 'inadimplentes') {
      query = query.eq('assinatura_ativa', true)
    }

    const { data } = await query.order('nome').limit(500)

    if (segmento === 'inadimplentes' && data) {
      // Filtrar só quem tem mensalidade vencida
      const hoje = new Date().toISOString().split('T')[0]
      const ids = data.map(d => d.id)
      const { data: mensalidades } = await supabase.from('mensalidades')
        .select('devedor_id').eq('status', 'pendente').lt('data_vencimento', hoje)
        .in('devedor_id', ids)
      const idsInadimplentes = new Set(mensalidades?.map(m => m.devedor_id) || [])
      setDestinatarios(data.filter(d => idsInadimplentes.has(d.id))); setDestDesmarcados(new Set())
    } else {
      setDestinatarios(data || []); setDestDesmarcados(new Set())
    }
    setCarregandoDest(false)
  }

  useEffect(() => { if (contextUserId) buscarDestinatarios() }, [segmento, filtroPlanoId, contextUserId])

  // Buscar nome da empresa (e o link da Loja, para o placeholder {{linkLoja}})
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [linkLoja, setLinkLoja] = useState('')
  useEffect(() => {
    if (!contextUserId) return
    supabase.from('usuarios').select('nome_empresa, agendamento_slug').eq('id', contextUserId).single().then(({ data }) => {
      if (data) setNomeEmpresa(data.nome_empresa || '')
    })
    // consulta separada: se o SQL da loja não rodou, a coluna não existe e isso não pode quebrar as campanhas
    supabase.from('usuarios').select('agendamento_slug, loja_ativa').eq('id', contextUserId).maybeSingle().then(({ data }) => {
      if (data?.loja_ativa && data?.agendamento_slug) setLinkLoja(`${window.location.origin}/loja/${data.agendamento_slug}?o=campanha`)
    }).catch(() => {})
  }, [contextUserId])

  // Enviar campanha
  // Destinatários selecionados (sem os desmarcados)
  const destinatariosSelecionados = destinatarios.filter(d => !destDesmarcados.has(d.id))

  // Upload da imagem da campanha para o Storage (bucket 'logos', público)
  const handleUploadImagem = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImagemErro('')

    if (!file.type.startsWith('image/')) {
      const msg = 'Selecione um arquivo de imagem (JPG ou PNG)'
      setImagemErro(msg); showToast(msg, 'warning')
      if (imagemInputRef.current) imagemInputRef.current.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      const tamanhoMb = (file.size / 1024 / 1024).toFixed(1)
      const msg = `Imagem muito pesada (${tamanhoMb} MB). O limite é 5 MB.`
      setImagemErro(msg); showToast(msg, 'warning')
      if (imagemInputRef.current) imagemInputRef.current.value = ''
      return
    }

    setUploadingImagem(true)
    try {
      const ext = file.name.split('.').pop()
      // Política do bucket exige UUID do usuário como 1ª pasta: `${userId}/...`
      const fileName = `${contextUserId}/campanhas/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('logos').upload(fileName, file, { upsert: false })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
      setImagemUrl(urlData.publicUrl)
      showToast('Imagem anexada!', 'success')
    } catch (err) {
      console.error('Erro ao subir imagem da campanha:', err)
      const msg = `Erro ao anexar imagem: ${err.message || 'tente novamente'}`
      setImagemErro(msg); showToast(msg, 'error')
    } finally {
      setUploadingImagem(false)
      if (imagemInputRef.current) imagemInputRef.current.value = ''
    }
  }

  const removerImagem = () => {
    setImagemUrl('')
    setImagemErro('')
    if (imagemInputRef.current) imagemInputRef.current.value = ''
  }

  const enviarCampanha = async () => {
    if (!titulo.trim() || !mensagem.trim()) { showToast('Preencha o título e a mensagem', 'warning'); return }
    if (destinatariosSelecionados.length === 0) { showToast('Nenhum destinatário selecionado', 'warning'); return }

    setEnviando(true)
    cancelarRef.current = false
    const destFinal = destinatariosSelecionados
    setProgresso({ enviados: 0, falhas: 0, total: destFinal.length })

    // Criar campanha no banco
    const { data: campanha, error } = await supabase.from('campanhas').insert({
      user_id: contextUserId, titulo: titulo.trim(), mensagem: mensagem.trim(),
      imagem_url: imagemUrl || null,
      segmento, filtro_plano_id: filtroPlanoId || null,
      total_destinatarios: destFinal.length, status: 'enviando', iniciada_em: new Date().toISOString()
    }).select().single()

    if (error || !campanha) { showToast('Erro ao criar campanha', 'error'); setEnviando(false); return }
    setCampanhaAtiva(campanha)

    // Criar envios pendentes
    const envios = destFinal.map(d => ({
      campanha_id: campanha.id, devedor_id: d.id,
      telefone: d.responsavel_telefone || d.telefone, status: 'pendente'
    }))
    await supabase.from('campanha_envios').insert(envios)

    // Enviar um por um com throttle
    let enviados = 0, falhas = 0
    for (const dest of destFinal) {
      if (cancelarRef.current) break

      const destInfo = resolverDestinatario(dest)
      const telefone = destInfo.telefone
      // {{nomeCliente}} / {{nomeAluno}}: responsável quando há um cadastrado,
      // senão o próprio aluno (fallback automático).
      // {{nomeResponsavel}}: responsável se houver, senão vazio (uso explícito).
      const nomeContatoDest = destInfo.primeiroNome || 'Aluno'
      const primeiroNomeRespDest = destInfo.ehResponsavel ? destInfo.primeiroNome : ''
      const msgFinal = mensagem
        .replace(/\{\{nomeCliente\}\}/g, nomeContatoDest)
        .replace(/\{\{nomeAlunoReal\}\}/g, destInfo.primeiroNomeAluno || '')
        .replace(/\{\{nomeAluno\}\}/g, nomeContatoDest)
        .replace(/\{\{nomeResponsavel\}\}/g, primeiroNomeRespDest)
        .replace(/\{\{nomeEmpresa\}\}/g, nomeEmpresa)
        .replace(/\{\{linkLoja\}\}/g, linkLoja)

      try {
        const resultado = imagemUrl
          ? await whatsappService.enviarDocumento(telefone, imagemUrl, msgFinal, 'campanha.png', 'image')
          : await whatsappService.enviarMensagem(telefone, msgFinal)
        if (resultado.sucesso) {
          enviados++
          await supabase.from('campanha_envios').update({ status: 'enviado', enviado_em: new Date().toISOString() })
            .eq('campanha_id', campanha.id).eq('devedor_id', dest.id)
        } else {
          falhas++
          await supabase.from('campanha_envios').update({ status: 'falha', erro: resultado.erro })
            .eq('campanha_id', campanha.id).eq('devedor_id', dest.id)
        }
      } catch {
        falhas++
        await supabase.from('campanha_envios').update({ status: 'falha', erro: 'Erro de conexão' })
          .eq('campanha_id', campanha.id).eq('devedor_id', dest.id)
      }

      setProgresso({ enviados, falhas, total: destFinal.length })

      // Atualizar contadores da campanha
      await supabase.from('campanhas').update({ total_enviados: enviados, total_falhas: falhas }).eq('id', campanha.id)

      // Throttle 25-30 segundos
      if (!cancelarRef.current) {
        const delay = 25000 + Math.random() * 5000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    // Finalizar
    await supabase.from('campanhas').update({
      status: cancelarRef.current ? 'cancelada' : 'concluida',
      total_enviados: enviados, total_falhas: falhas,
      concluida_em: new Date().toISOString()
    }).eq('id', campanha.id)

    setEnviando(false)
    setCampanhaAtiva(null)
    showToast(cancelarRef.current ? 'Campanha cancelada' : `Campanha concluída! ${enviados} enviados, ${falhas} falhas`, cancelarRef.current ? 'warning' : 'success')
    setTitulo(''); setMensagem(''); setImagemUrl(''); carregarCampanhas(); setTab('historico')
  }

  const podeEnviar = !!(titulo.trim() && mensagem.trim() && destinatariosSelecionados.length > 0)
  const whatsCaiu = whatsappStatus === 'disconnected' || whatsappStatus === 'zombie'
  const variaveis = ['{{nomeAluno}}', '{{nomeAlunoReal}}', '{{nomeResponsavel}}', '{{nomeEmpresa}}', ...(linkLoja ? ['{{linkLoja}}'] : [])]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Tabs
        variant="segmented"
        fullWidth
        value={tab}
        onChange={setTab}
        items={[
          { value: 'nova', label: 'Nova campanha', icon: 'mdi:bullhorn-outline' },
          { value: 'historico', label: `Histórico (${campanhas.length})`, icon: 'mdi:history' }
        ]}
      />

      {/* Nova Campanha */}
      {tab === 'nova' && !enviando && (
        <Card padding={isSmallScreen ? 'default' : 'spacious'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {whatsCaiu && (
              <Alert
                variant="warning"
                title="Seu WhatsApp está desconectado"
                action={<Button variant="outline" size="sm" onClick={irParaConexao}>Conectar</Button>}
              >
                Conecte antes de enviar, senão as mensagens da campanha não saem.
              </Alert>
            )}

            <Input
              label="Título da campanha"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ex.: Aviso de feriado"
              helper="Só você vê; serve para achar a campanha no histórico."
            />

            <div>
              {/* No celular as três opções não cabem numa linha: vira um seletor */}
              {isSmallScreen ? (
                <Select
                  label="Enviar para"
                  showAll
                  value={segmento}
                  onChange={v => v && setSegmento(v)}
                  options={[
                    { value: 'todos', label: 'Todos os alunos ativos' },
                    { value: 'plano', label: 'Alunos de um plano' },
                    { value: 'inadimplentes', label: 'Inadimplentes' }
                  ]}
                />
              ) : (
                <>
                  <span className="ds-input-label" style={{ display: 'block', marginBottom: '6px' }}>Enviar para</span>
                  <Tabs
                    variant="segmented"
                    fullWidth
                    value={segmento}
                    onChange={setSegmento}
                    items={[
                      { value: 'todos', label: 'Todos ativos' },
                      { value: 'plano', label: 'Por plano' },
                      { value: 'inadimplentes', label: 'Inadimplentes' }
                    ]}
                  />
                </>
              )}
              {segmento === 'plano' && (
                <div style={{ marginTop: '8px' }}>
                  <Select
                    aria-label="Plano"
                    value={filtroPlanoId}
                    onChange={v => setFiltroPlanoId(v || '')}
                    placeholder="Selecionar plano..."
                    options={planos.map(p => ({ value: p.id, label: p.nome }))}
                  />
                </div>
              )}
            </div>

            {/* Destinatários — recolhível, com marcar/desmarcar */}
            <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <button
                type="button"
                className="cmp-dest-topo"
                onClick={() => !carregandoDest && setDestExpandido(!destExpandido)}
                aria-expanded={destExpandido}
              >
                <Icon icon="mdi:account-group-outline" width={18} aria-hidden="true" />
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {carregandoDest ? 'Carregando…' : (
                    <><strong>{destinatarios.length - destDesmarcados.size}</strong> de {destinatarios.length} aluno{destinatarios.length !== 1 ? 's' : ''} selecionado{destinatarios.length - destDesmarcados.size !== 1 ? 's' : ''}</>
                  )}
                </span>
                <Icon icon={destExpandido ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={20} aria-hidden="true" />
              </button>
              {destExpandido && destinatarios.length > 0 && (
                <div style={{ maxHeight: 280, overflowY: 'auto', borderTop: '1px solid var(--color-border-subtle)', padding: '4px 12px' }}>
                  <div style={{ padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <Checkbox
                      checked={destDesmarcados.size === 0}
                      indeterminate={destDesmarcados.size > 0 && destDesmarcados.size < destinatarios.length}
                      onChange={() => {
                        if (destDesmarcados.size === 0) setDestDesmarcados(new Set(destinatarios.map(d => d.id)))
                        else setDestDesmarcados(new Set())
                      }}
                      label={destDesmarcados.size === 0 ? 'Desmarcar todos' : 'Marcar todos'}
                    />
                  </div>
                  {destinatarios.map(d => (
                    <div key={d.id} style={{ padding: '2px 0' }}>
                      <Checkbox
                        checked={!destDesmarcados.has(d.id)}
                        onChange={() => {
                          setDestDesmarcados(prev => {
                            const novo = new Set(prev)
                            if (novo.has(d.id)) novo.delete(d.id); else novo.add(d.id)
                            return novo
                          })
                        }}
                        label={d.nome}
                        description={d.responsavel_telefone || d.telefone}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Textarea
                label="Mensagem"
                value={mensagem}
                onChange={e => setMensagem(e.target.value)}
                rows={5}
                placeholder="Escreva sua mensagem aqui..."
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {variaveis.map(v => (
                  <button key={v} type="button" className="cmp-var" onClick={() => setMensagem(prev => prev + v)}>{v}</button>
                ))}
              </div>
              <p className="ds-text-caption" style={{ margin: '8px 0 0', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                A mensagem vai para o WhatsApp do responsável (quando cadastrado). Para falar com o responsável citando o aluno, use <strong>{`{{nomeResponsavel}}`}</strong> + <strong>{`{{nomeAlunoReal}}`}</strong>. Ex.: "Oi {`{{nomeResponsavel}}`}, sobre a mensalidade do {`{{nomeAlunoReal}}`}".
              </p>
            </div>

            {/* Imagem (opcional) */}
            <div>
              <span className="ds-input-label" style={{ display: 'block', marginBottom: '6px' }}>
                Imagem <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(opcional)</span>
              </span>
              <input ref={imagemInputRef} type="file" accept="image/*" onChange={handleUploadImagem} style={{ display: 'none' }} />
              {imagemUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--neutral-50)' }}>
                  <img src={imagemUrl} alt="Imagem da campanha" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
                  <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--color-brand-fill)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon icon="mdi:check-circle" width={16} /> Imagem anexada
                  </span>
                  <Button variant="danger-soft" size="sm" icon="mdi:trash-can-outline" onClick={removerImagem}>Remover</Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  icon="mdi:image-plus"
                  fullWidth
                  loading={uploadingImagem}
                  onClick={() => imagemInputRef.current?.click()}
                  style={{ borderStyle: 'dashed' }}
                >
                  Anexar imagem
                </Button>
              )}
              {imagemErro ? (
                <p className="ds-text-caption" style={{ margin: '6px 0 0', color: 'var(--danger-700)' }}>{imagemErro}</p>
              ) : (
                <p className="ds-text-caption" style={{ margin: '6px 0 0', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                  A imagem vai junto com a mensagem, como legenda. JPG ou PNG, até 5 MB.
                </p>
              )}
            </div>

            {/* Prévia */}
            {mensagem && (
              <div style={{ padding: '12px 14px', backgroundColor: 'var(--success-50)', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', border: '1px solid var(--mensalli-green-100)' }}>
                <div className="ds-text-eyebrow" style={{ color: 'var(--color-brand-fill)', marginBottom: 6 }}>Prévia</div>
                {imagemUrl && (
                  <img src={imagemUrl} alt="Prévia" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6, marginBottom: 8, display: 'block' }} />
                )}
                {mensagem
                  .replace(/\{\{nomeCliente\}\}/g, 'João')
                  .replace(/\{\{nomeAlunoReal\}\}/g, 'João')
                  .replace(/\{\{nomeAluno\}\}/g, 'João')
                  .replace(/\{\{nomeResponsavel\}\}/g, 'Maria')
                  .replace(/\{\{nomeEmpresa\}\}/g, nomeEmpresa || 'Sua Empresa')}
              </div>
            )}

            {/* Regras de envio — recolhível */}
            <details className="cmp-regras">
              <summary>
                <Icon icon="mdi:alert-outline" width={18} aria-hidden="true" />
                <span style={{ flex: 1 }}>Regras de envio</span>
                {destinatariosSelecionados.length > 0 && (
                  <span className="cmp-regras-tempo">~{Math.ceil(destinatariosSelecionados.length * 30 / 60)} min</span>
                )}
              </summary>
              <ul>
                <li>Evite mais de <strong>20 mensagens por hora</strong>: risco de bloqueio.</li>
                <li>Envie só para alunos que <strong>já têm seu número salvo</strong>: reduz o risco de denúncia.</li>
                <li>Não exagere no conteúdo promocional: pode ser marcado como spam.</li>
                <li>O WhatsApp pode <strong>bloquear temporariamente</strong> números que mandam muitas mensagens em pouco tempo.</li>
                <li>O <strong>Mensalli não se responsabiliza</strong> por bloqueios decorrentes do uso de campanhas.</li>
              </ul>
              {destinatariosSelecionados.length > 0 && (
                <p>Tempo estimado: ~{Math.ceil(destinatariosSelecionados.length * 30 / 60)} minutos para {destinatariosSelecionados.length} destinatário{destinatariosSelecionados.length !== 1 ? 's' : ''}.</p>
              )}
            </details>

            <Button variant="primary" size="lg" icon="mdi:send" fullWidth disabled={!podeEnviar} onClick={enviarCampanha}>
              Enviar campanha ({destinatariosSelecionados.length})
            </Button>
            {!podeEnviar && (
              <p className="ds-text-caption" style={{ margin: '-8px 0 0', color: 'var(--color-text-muted)', textAlign: 'center', fontWeight: 400 }}>
                {!titulo.trim() ? 'Preencha o título para enviar.' : !mensagem.trim() ? 'Escreva a mensagem para enviar.' : 'Selecione pelo menos um aluno.'}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Progresso de envio */}
      {enviando && (
        <Card padding={isSmallScreen ? 'default' : 'spacious'} style={{ textAlign: 'center' }}>
          <Icon icon="mdi:send-clock" width={48} style={{ color: 'var(--color-brand-fill)', marginBottom: 12 }} />
          <h3 className="ds-text-h4" style={{ margin: '0 0 4px', color: 'var(--color-text-primary)' }}>Enviando campanha…</h3>
          <p className="ds-text-body" style={{ margin: '0 0 16px', color: 'var(--color-text-secondary)' }}>"{campanhaAtiva?.titulo}"</p>
          <div style={{ height: 8, borderRadius: 4, backgroundColor: 'var(--neutral-200)', overflow: 'hidden', marginBottom: 12 }}>
            <div style={{
              height: '100%', borderRadius: 4, transition: 'width 0.3s', backgroundColor: 'var(--color-brand-fill)',
              width: `${progresso.total > 0 ? ((progresso.enviados + progresso.falhas) / progresso.total * 100) : 0}%`
            }} />
          </div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            {progresso.enviados + progresso.falhas} / {progresso.total}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', marginBottom: 16 }}>
            <span style={{ color: 'var(--color-brand-fill)' }}>✓ {progresso.enviados} enviados</span>
            {progresso.falhas > 0 && <span style={{ color: 'var(--danger-700)', marginLeft: 12 }}>✗ {progresso.falhas} falhas</span>}
          </div>
          <Button variant="danger-soft" icon="mdi:stop" onClick={() => { cancelarRef.current = true }}>
            Cancelar envio
          </Button>
        </Card>
      )}

      {/* Histórico */}
      {tab === 'historico' && !enviando && (
        loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Carregando…</div>
        ) : campanhas.length === 0 ? (
          <EmptyState
            variant="first-use"
            icon="mdi:bullhorn-outline"
            title="Nenhuma campanha enviada"
            description="Quando você enviar uma campanha, ela aparece aqui com quem recebeu e quem não recebeu."
            action={<Button variant="primary" icon="mdi:plus" onClick={() => setTab('nova')}>Nova campanha</Button>}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {campanhas.map(c => {
              const isExpandida = campanhaExpandida === c.id
              const st = c.status === 'concluida' ? { v: 'success', t: 'Concluída' }
                : c.status === 'enviando' ? { v: 'warning', t: 'Enviando' }
                : c.status === 'cancelada' ? { v: 'danger', t: 'Cancelada' }
                : { v: 'default', t: 'Rascunho' }
              return (
                <Card key={c.id} padding="none">
                  <button
                    type="button"
                    className="cmp-hist-topo"
                    aria-expanded={isExpandida}
                    onClick={async () => {
                      if (isExpandida) { setCampanhaExpandida(null); return }
                      setCampanhaExpandida(c.id)
                      const { data } = await supabase.from('campanha_envios')
                        .select('*, devedores(nome)').eq('campanha_id', c.id).order('enviado_em', { ascending: true })
                      setEnviosDaCampanha(data || [])
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'block', fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.titulo}</span>
                      <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {new Date(c.created_at).toLocaleDateString('pt-BR')} · {c.segmento === 'todos' ? 'Todos ativos' : c.segmento === 'plano' ? 'Por plano' : 'Inadimplentes'}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right', flexShrink: 0 }}>
                      <Badge variant={st.v}>{st.t}</Badge>
                      <span style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
                        {c.total_enviados}/{c.total_destinatarios} enviados{c.total_falhas > 0 && ` · ${c.total_falhas} falhas`}
                      </span>
                    </span>
                    <Icon icon={isExpandida ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={20} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} aria-hidden="true" />
                  </button>

                  {isExpandida && (
                    <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '12px 16px', maxHeight: 320, overflowY: 'auto' }}>
                      <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 4 }}>Mensagem enviada</div>
                      <div style={{ padding: '10px 12px', backgroundColor: 'var(--neutral-50)', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                        {c.mensagem}
                      </div>
                      {enviosDaCampanha.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>Carregando…</div>
                      ) : (
                        enviosDaCampanha.map((e, idx) => (
                          <div key={e.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                            padding: '8px 0', borderTop: idx > 0 ? '1px solid var(--color-border-subtle)' : 'none'
                          }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-primary)' }}>{e.devedores?.nome || 'Aluno'}</div>
                              {e.erro && <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger-700)' }}>{e.erro}</div>}
                            </div>
                            <Badge variant={e.status === 'enviado' ? 'success' : e.status === 'falha' ? 'danger' : 'default'} size="xs">
                              {e.status === 'enviado' ? 'Enviado' : e.status === 'falha' ? 'Falha' : 'Pendente'}
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )
      )}

      <style>{`
        .cmp-dest-topo, .cmp-hist-topo {
          display: flex; align-items: center; gap: 10px; width: 100%;
          min-height: var(--touch-min); padding: 10px 14px; border: none;
          background: var(--neutral-50); color: var(--color-text-secondary);
          font-family: inherit; font-size: var(--text-sm); cursor: pointer;
        }
        .cmp-hist-topo { background: transparent; padding: 14px 16px; }
        .cmp-dest-topo:hover, .cmp-hist-topo:hover { background: var(--neutral-100); }
        .cmp-dest-topo:focus-visible, .cmp-hist-topo:focus-visible { outline: none; box-shadow: inset var(--focus-ring); }
        .cmp-var {
          padding: 4px 8px; font-family: var(--font-mono); font-size: var(--text-2xs); font-weight: 600;
          background: var(--info-50); color: var(--info-700); border: 1px solid var(--info-100);
          border-radius: var(--radius-sm); cursor: pointer; min-height: 32px;
        }
        .cmp-var:hover { background: var(--info-100); }
        .cmp-regras { border: 1px solid var(--warning-100); border-radius: var(--radius-lg); background: var(--warning-50); padding: 0 14px; }
        .cmp-regras > summary {
          display: flex; align-items: center; gap: 8px; min-height: var(--touch-min);
          font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--warning-700);
          cursor: pointer; list-style: none;
        }
        .cmp-regras > summary::-webkit-details-marker { display: none; }
        .cmp-regras-tempo { font-weight: 500; font-size: var(--text-xs); }
        .cmp-regras ul { margin: 0 0 10px; padding-left: 18px; font-size: var(--text-xs); color: var(--color-text-secondary); line-height: 1.7; }
        .cmp-regras p { margin: 0 0 12px; font-size: var(--text-xs); font-weight: 600; color: var(--warning-700); }
      `}</style>
    </div>
  )
}

// Estado global do status de conexão do WhatsApp (bolinha do menu).
// Começa 'unknown' (sem bolinha) em vez de 'disconnected': antes o menu
// mostrava vermelho em toda abertura do app até alguém abrir esta tela.
// O Dashboard preenche lendo `mensallizap.conectado` (fonte de verdade).
let globalStatus = 'unknown'
const statusListeners = []

export const subscribeToWhatsAppStatus = (callback) => {
  statusListeners.push(callback)
  return () => {
    const index = statusListeners.indexOf(callback)
    if (index > -1) statusListeners.splice(index, 1)
  }
}

const updateGlobalStatus = (newStatus) => {
  globalStatus = newStatus
  statusListeners.forEach(listener => listener(newStatus))
}

export const getWhatsAppStatus = () => globalStatus

/** Atualiza a bolinha do menu com um estado já conhecido (ex.: lido do banco). */
export const definirStatusWhatsApp = (novoStatus) => updateGlobalStatus(novoStatus)

// Mensagem padrão do template (fallback para compatibilidade)
const MENSAGEM_PADRAO = TEMPLATES_PADRAO.overdue

/**
 * Zumbi SEM sonda: a evidencia sai dos NOSSOS logs, nao da Evolution.
 *
 * Duas assinaturas, ambas medidas em 21/08:
 *   - "Connection Closed": socket morto (Studio T.S)
 *   - "Cannot read properties of undefined": instancia registrada sem cliente
 *     Baileys ativo (Team Juliana). Faltava esta, e por isso a tela dela seguiu
 *     verde enquanto 3 envios falhavam.
 *
 * So conta se NAO houve envio bem-sucedido depois da falha — senao a conta
 * oscilou e voltou, que e diferente de estar travada.
 */
async function temEvidenciaDeZumbi(userId) {
  if (!userId) return false
  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('logs_mensagens')
      .select('status, erro_codigo, erro, enviado_em')
      .eq('user_id', userId)
      .gte('enviado_em', desde)
      .order('enviado_em', { ascending: false })
      .limit(30)

    const ultimoOk = (data || []).find((r) => r.status === 'enviado')
    const ultimaMorte = (data || []).find(
      (r) =>
        r.status === 'falha' &&
        (r.erro_codigo === 'connection_closed' ||
          r.erro_codigo === 'instance_500' ||
          /Connection Closed/i.test(r.erro || '') ||
          /Cannot read properties of undefined/i.test(r.erro || ''))
    )
    return !!ultimaMorte && (!ultimoOk || ultimoOk.enviado_em < ultimaMorte.enviado_em)
  } catch {
    return false
  }
}

export default function WhatsAppConexao() {
  const navigate = useNavigate()
  const { isMobile, isTablet, isSmallScreen } = useWindowSize()
  const { isLocked } = useUserPlan()
  const { userId: contextUserId, isAdmin, adminViewingAs, refreshUserData, loading: loadingUser, nomeEmpresa: nomeEmpresaConta } = useUser()
  const isStarter = isLocked('pro') // true se plano é starter
  const automacaoLocked = isLocked('pro') // Automações de 3 e 5 dias são Pro+
  const [searchParams] = useSearchParams()
  // 'mensagens' (Central de Mensagens) é admin-only nesta fase: a tela expõe a
  // taxa de falha real de todas as contas e os bugs do n8n ainda estão abertos.
  const abaUrl = searchParams.get('aba')
  const [activeTab, setActiveTab] = useState(
    abaUrl === 'templates' ? 'templates' : abaUrl === 'mensagens' ? 'mensagens' : 'conexao'
  )
  // Contador que a Central observa para recarregar — o botão de atualizar vive
  // no header, junto da tag de conexão, mas os dados moram no filho.
  const [recarregarMensagens, setRecarregarMensagens] = useState(0)

  // A aba 'mensagens' é admin-only e não aparece no menu para os outros, mas
  // `?aba=mensagens` na URL entra direto no estado — sem isto o gestor ficava
  // numa aba fantasma, que não existe no seletor e da qual ele não sai.
  // Gate por `!loadingUser`: `isAdmin` deriva de userData, que chega DEPOIS do
  // user, então checar antes do fim do load expulsaria o próprio admin.
  useEffect(() => {
    if (!loadingUser && !isAdmin && activeTab === 'mensagens') setActiveTab('conexao')
  }, [loadingUser, isAdmin, activeTab])

  // ESTADOS SIMPLIFICADOS (6 essenciais)
  const [status, setStatus] = useState('disconnected') // 'disconnected' | 'connecting' | 'connected'
  const [qrCode, setQrCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [config, setConfig] = useState({ instanceName: '' })
  const configRef = useRef(config)
  const [tempoRestante, setTempoRestante] = useState(120) // Contador de 2 minutos (120 segundos)

  // Estados para templates
  const [templates, setTemplates] = useState([])
  const [templateAtual, setTemplateAtual] = useState({
    titulo: 'Lembrete de Cobrança',
    mensagem: MENSAGEM_PADRAO
  })
  const [tipoTemplateSelecionado, setTipoTemplateSelecionado] = useState('due_day') // Starter começa em "No Dia"
  const [templatesAgrupados, setTemplatesAgrupados] = useState({
    pre_due_3days: null,
    due_day: null,
    overdue: null,
    payment_confirmed: null,
    welcome: null
  })
  const [tituloTemplate, setTituloTemplate] = useState('Lembrete - Vencimento Hoje')
  const [mensagemTemplate, setMensagemTemplate] = useState(paraExibir(TEMPLATES_PADRAO.due_day))

  // Starter só pode editar os templates das automações que ele tem: "No Dia" (due_day) e "Confirmação Pagamento" (payment_confirmed)
  // Pro/Premium podem editar todos os templates
  const templateEditLocked = isStarter && !['due_day', 'payment_confirmed'].includes(tipoTemplateSelecionado)

  // Estados para automação (novo fluxo: 3 dias antes, no dia, 3 dias depois)
  const [automacao3DiasAtiva, setAutomacao3DiasAtiva] = useState(false)
  const [automacaoNoDiaAtiva, setAutomacaoNoDiaAtiva] = useState(true) // Ativo por padrão
  const [automacao3DiasDepoisAtiva, setAutomacao3DiasDepoisAtiva] = useState(false)
  const [automacaoLembreteAulaAtiva, setAutomacaoLembreteAulaAtiva] = useState(false)
  const [automacaoLembreteAula24hAtiva, setAutomacaoLembreteAula24hAtiva] = useState(false)
  const [automacaoConfirmacaoAgendamentoAtiva, setAutomacaoConfirmacaoAgendamentoAtiva] = useState(false)
  const [automacaoConfirmacaoPgtoAtiva, setAutomacaoConfirmacaoPgtoAtiva] = useState(true) // Ativo por padrão
  const [automacaoAniversarioAtiva, setAutomacaoAniversarioAtiva] = useState(false)
  const [enviarDomingoAtivo, setEnviarDomingoAtivo] = useState(true)
  const [automacaoResumoDiarioAtiva, setAutomacaoResumoDiarioAtiva] = useState(false)
  const [automacaoAlertaDespesasAtiva, setAutomacaoAlertaDespesasAtiva] = useState(false)
  const [alertaDespesasDiasAntes, setAlertaDespesasDiasAntes] = useState(3)
  const [automacaoRecuperacaoAtiva, setAutomacaoRecuperacaoAtiva] = useState(false)
  const [temPresencasRecentes, setTemPresencasRecentes] = useState(null)
  const [automacaoNpsAtiva, setAutomacaoNpsAtiva] = useState(false)
  const [categoriaAutomacao, setCategoriaAutomacao] = useState('cobrancas')
  const [botAtivo, setBotAtivo] = useState(false)
  const [botSaudacao, setBotSaudacao] = useState('Olá {{nomeAluno}}! 👋 Sou o assistente virtual da {{nomeEmpresa}}.')
  const [botOpcoesAtivas, setBotOpcoesAtivas] = useState({ mensalidade: true, horarios: true, pix: true, agendar: true })
  const [botLeadOpcoesAtivas, setBotLeadOpcoesAtivas] = useState({ conhecer: true, valores: true, experimental: true })
  const [botLeadSaudacao, setBotLeadSaudacao] = useState('Olá {{nomeAluno}}! 👋 Bem-vindo(a) à {{nomeEmpresa}}!')
  const [botTextoConhecer, setBotTextoConhecer] = useState('')
  const [salvandoBot, setSalvandoBot] = useState(false)
  // Último valor salvo dos três textos do bot: o botão "Salvar textos" só
  // aparece quando algum deles foi mudado.
  const [textosBotSalvos, setTextosBotSalvos] = useState(null)

  // Estado para Chave PIX
  const [chavePix, setChavePix] = useState('')

  // Estado para modal de feedback
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: 'success', title: '', message: '' })
  const [previewModalAberto, setPreviewModalAberto] = useState(false)
  // Celular/tablet: o editor do modelo abre em tela cheia ao tocar no cartão
  const [editorAberto, setEditorAberto] = useState(false)
  const [confirmDescartar, setConfirmDescartar] = useState(false)

  // Estado para modal de upgrade (recurso bloqueado)
  const [upgradeModal, setUpgradeModal] = useState({ isOpen: false, featureName: '' })

  // Estado para modal de confirmação de desconexão
  const [confirmDesconexaoModal, setConfirmDesconexaoModal] = useState(false)

  // Número pareado (mensallizap.whatsapp_numero), mostrado no cartão de conectado
  const [numeroConectado, setNumeroConectado] = useState(null)
  useEffect(() => {
    if (status !== 'connected' || !contextUserId) return
    let cancelado = false
    supabase.from('mensallizap').select('whatsapp_numero').eq('user_id', contextUserId).maybeSingle()
      .then(({ data }) => { if (!cancelado) setNumeroConectado(data?.whatsapp_numero || null) })
    return () => { cancelado = true }
  }, [status, contextUserId])

  // Estado para método de pagamento (PIX Manual ou Link Asaas)
  const [metodoPagamento, setMetodoPagamento] = useState('pix_manual')

  // Atualizar status global quando mudar. A primeira execução é o valor
  // inicial do useState ('disconnected'), ainda sem checagem nenhuma — se fosse
  // espalhado, a bolinha do menu piscava vermelha toda vez que a tela abria,
  // e o cliente achava que o WhatsApp tinha caído e voltado.
  const statusInicialRef = useRef(true)
  useEffect(() => {
    if (statusInicialRef.current) { statusInicialRef.current = false; return }
    updateGlobalStatus(status)
  }, [status])

  // Manter configRef sincronizado
  useEffect(() => {
    configRef.current = config
  }, [config])

  // Carregar tudo em paralelo para melhorar performance
  // Recarrega quando admin troca de cliente
  useEffect(() => {
    const carregarTudo = async () => {
      try {
        // Usar userId do contexto (admin pode estar visualizando outro cliente)
        const effectiveUserId = contextUserId
        if (!effectiveUserId) return

        // LÊ do banco, não deriva: a conta pode ter sido apontada para uma
        // instância nova depois de um travamento da Evolution.
        const instanceName = await resolverInstanceName(effectiveUserId)

        // 2. Fazer TODAS as queries em paralelo
        const [templatesResult, automacoesResult, usuarioResult, metodoPagResult] = await Promise.all([
          // Templates do usuário
          supabase
            .from('templates')
            .select('*')
            .eq('user_id', effectiveUserId)
            .eq('ativo', true)
            .order('created_at', { ascending: false }),

          // Configurações de automação do usuário (da tabela configuracoes_cobranca)
          supabase
            .from('configuracoes_cobranca')
            .select('enviar_3_dias_antes, enviar_no_dia, enviar_3_dias_depois, enviar_lembrete_aula, enviar_lembrete_aula_24h, enviar_confirmacao_agendamento, enviar_aniversario, enviar_confirmacao_pagamento, enviar_domingo, enviar_resumo_diario, alertar_despesas, alertar_despesas_dias_antes, recuperacao_inativos_ativa, nps_experimental_ativo, bot_ativo, bot_saudacao, bot_opcoes_ativas, bot_lead_opcoes_ativas, bot_lead_saudacao, bot_texto_conhecer')
            .eq('user_id', effectiveUserId)
            .maybeSingle(),

          // Dados do usuário (chave PIX)
          supabase
            .from('usuarios')
            .select('chave_pix')
            .eq('id', effectiveUserId)
            .single(),

          // Método de pagamento WhatsApp
          supabase
            .from('config')
            .select('chave, valor')
            .eq('chave', `${effectiveUserId}_metodo_pagamento_whatsapp`)
            .maybeSingle()
        ])

        // A chave da Evolution nao e mais lida aqui: as chamadas passam pela
        // edge function evolution-proxy. Sobra o nome da instancia.
        setConfig({ instanceName })

        // 3.1 Processar Chave PIX
        if (usuarioResult.data?.chave_pix) {
          setChavePix(usuarioResult.data.chave_pix)
        }

        // 4. Processar Templates
        // Priorizar templates customizados (is_padrao !== true) sobre os padrões
        const templates = templatesResult.data || []
        const findBestTemplate = (tipo) => {
          // Primeiro tenta encontrar um template customizado (is_padrao = false ou null)
          const customizado = templates.find(t => t.tipo === tipo && t.is_padrao !== true)
          if (customizado) return customizado
          // Se não encontrar customizado, usa o padrão
          return templates.find(t => t.tipo === tipo) || null
        }
        let agrupados = {
          pre_due_3days: findBestTemplate('pre_due_3days'),
          due_day: findBestTemplate('due_day'),
          overdue: findBestTemplate('overdue'),
          class_reminder: findBestTemplate('class_reminder'),
          class_reminder_24h: findBestTemplate('class_reminder_24h'),
          booking_confirmed: findBestTemplate('booking_confirmed'),
          birthday: findBestTemplate('birthday'),
          payment_confirmed: findBestTemplate('payment_confirmed'),
          welcome: findBestTemplate('welcome')
        }

        // 4.1 Criar templates que não existem automaticamente
        // Todos os 3 tipos são criados para garantir que o n8n encontre templates
        const templatesParaCriar = TEMPLATES_SEED

        for (const tmpl of templatesParaCriar) {
          if (!agrupados[tmpl.tipo]) {
            const { data: novoTemplate, error: erroInsert } = await supabase
              .from('templates')
              .insert({
                user_id: effectiveUserId,
                titulo: tmpl.titulo,
                mensagem: tmpl.mensagem,
                tipo: tmpl.tipo,
                ativo: true,
                is_padrao: true
              })
              .select()
              .single()

            if (!erroInsert && novoTemplate) {
              agrupados[tmpl.tipo] = novoTemplate
              console.log(`Template "${tmpl.tipo}" criado automaticamente`)
            }
          }
        }

        setTemplatesAgrupados(agrupados)

        // Carregar template atual baseado no tipo selecionado (due_day por padrão)
        const templateAtual = agrupados[tipoTemplateSelecionado] || agrupados['due_day']
        if (templateAtual) {
          setTituloTemplate(templateAtual.titulo)
          setMensagemTemplate(paraExibir(templateAtual.mensagem))
        } else {
          setTituloTemplate(getTituloDefault(tipoTemplateSelecionado))
          setMensagemTemplate(paraExibir(getMensagemDefault(tipoTemplateSelecionado)))
        }

        // 5. Processar Automações (da tabela configuracoes_cobranca)
        let configCobranca = automacoesResult.data

        // Se não existe registro, criar com padrões pra garantir que n8n funcione
        if (!configCobranca && effectiveUserId) {
          const { data: novoConfig } = await supabase
            .from('configuracoes_cobranca')
            .insert({ user_id: effectiveUserId, enviar_no_dia: true, enviar_domingo: true })
            .select()
            .maybeSingle()
          if (novoConfig) configCobranca = novoConfig
        }

        setAutomacao3DiasAtiva(configCobranca?.enviar_3_dias_antes === true)
        setAutomacaoNoDiaAtiva(configCobranca?.enviar_no_dia !== false)
        setAutomacao3DiasDepoisAtiva(configCobranca?.enviar_3_dias_depois === true)
        setAutomacaoLembreteAulaAtiva(configCobranca?.enviar_lembrete_aula === true)
        setAutomacaoLembreteAula24hAtiva(configCobranca?.enviar_lembrete_aula_24h === true)
        setAutomacaoConfirmacaoAgendamentoAtiva(configCobranca?.enviar_confirmacao_agendamento === true)
        setAutomacaoAniversarioAtiva(configCobranca?.enviar_aniversario === true)
        setAutomacaoConfirmacaoPgtoAtiva(configCobranca?.enviar_confirmacao_pagamento !== false)
        setEnviarDomingoAtivo(configCobranca?.enviar_domingo !== false)
        setAutomacaoResumoDiarioAtiva(configCobranca?.enviar_resumo_diario === true)
        setAutomacaoAlertaDespesasAtiva(configCobranca?.alertar_despesas === true)
        if (configCobranca?.alertar_despesas_dias_antes != null) {
          setAlertaDespesasDiasAntes(configCobranca.alertar_despesas_dias_antes)
        }
        setAutomacaoRecuperacaoAtiva(configCobranca?.recuperacao_inativos_ativa === true)
        setAutomacaoNpsAtiva(configCobranca?.nps_experimental_ativo === true)
        setBotAtivo(configCobranca?.bot_ativo === true)
        if (configCobranca?.bot_saudacao) setBotSaudacao(paraExibir(configCobranca.bot_saudacao))
        if (configCobranca?.bot_opcoes_ativas && typeof configCobranca.bot_opcoes_ativas === 'object') {
          setBotOpcoesAtivas({
            mensalidade: configCobranca.bot_opcoes_ativas.mensalidade !== false,
            horarios: configCobranca.bot_opcoes_ativas.horarios !== false,
            pix: configCobranca.bot_opcoes_ativas.pix !== false,
            agendar: configCobranca.bot_opcoes_ativas.agendar !== false,
          })
        }
        if (configCobranca?.bot_lead_opcoes_ativas && typeof configCobranca.bot_lead_opcoes_ativas === 'object') {
          setBotLeadOpcoesAtivas({
            conhecer: configCobranca.bot_lead_opcoes_ativas.conhecer !== false,
            valores: configCobranca.bot_lead_opcoes_ativas.valores !== false,
            experimental: configCobranca.bot_lead_opcoes_ativas.experimental !== false,
          })
        }
        if (configCobranca?.bot_lead_saudacao) setBotLeadSaudacao(paraExibir(configCobranca.bot_lead_saudacao))
        if (configCobranca?.bot_texto_conhecer != null) setBotTextoConhecer(configCobranca.bot_texto_conhecer || '')
        setTextosBotSalvos({
          saudacao: configCobranca?.bot_saudacao ? paraExibir(configCobranca.bot_saudacao) : 'Olá {{nomeAluno}}! 👋 Sou o assistente virtual da {{nomeEmpresa}}.',
          lead: configCobranca?.bot_lead_saudacao ? paraExibir(configCobranca.bot_lead_saudacao) : 'Olá {{nomeAluno}}! 👋 Bem-vindo(a) à {{nomeEmpresa}}!',
          conhecer: configCobranca?.bot_texto_conhecer != null ? (configCobranca.bot_texto_conhecer || '') : ''
        })

        // 5.1 Processar método de pagamento
        if (metodoPagResult.data?.valor) {
          setMetodoPagamento(metodoPagResult.data.valor)
        }

        // 6. Verificar status WhatsApp (pode ser em paralelo com os outros)
        //
        // Só o round-trip real decide. O connectionState fica "open" com o socket
        // morto ("zumbi"), e confiar nele causava dois estragos: a tela mostrava
        // "WhatsApp Conectado!" ao lado do banner vermelho de desconexão, e o
        // upsert abaixo reescrevia conectado = true por cima do veredito do
        // health-check — devolvendo a conta às views vw_parcelas_* com o canal
        // morto, até a varredura seguinte derrubar de novo. Agora só gravamos
        // conectado = true quando a sonda passa; no zumbi não tocamos no banco
        // (quem manda ali é o health-check) e a UI conta a verdade.
        if (instanceName) {
          try {
            const { veredito } = await verificarSaude({ instanceName })

            // Zumbi SEM sonda: a evidencia sai dos NOSSOS logs, nao da Evolution.
            //
            // A tela ja tinha o estado 'zombie' pronto (bloco "Conexao travada",
            // com botao que forca reconexao), mas ele virou codigo morto em
            // 11/08, quando a sonda foi desligada — verificarSaude passou a
            // devolver so 'conectado'/'desconectado'. Desde entao o cliente
            // zumbi ve a tela verde de sucesso e NAO TEM caminho nenhum para se
            // resolver: o botao de forcar so existe no bloco de desconectado.
            // Foi o caso do Studio T.S em 21/08 — 9 falhas em 24h com a tela
            // dizendo "WhatsApp Conectado!".
            //
            // Criterio: falha recente com assinatura de socket morto e NENHUM
            // envio bem-sucedido depois dela. E o mesmo que o
            // whatsapp-zumbi-diario usa, e nao custa nada a Evolution.
            const ehZumbi = veredito === 'conectado' && (await temEvidenciaDeZumbi(effectiveUserId))

            if (ehZumbi) {
              setStatus('zombie')
            } else if (veredito === 'conectado') {
              setStatus('connected')
              // Sincronizar mensallizap para que o onboarding checklist reflita a conexão.
              //
              // NUNCA gravar o instance_name que está na memória desta aba. Quando
              // trocamos a instância de um cliente (a saída do deadlock), a aba que
              // ele deixou aberta continua com o nome ANTIGO; a instância antiga é
              // um zumbi, responde 'open', e este upsert reescrevia o registro de
              // volta para ela — desfazendo a troca e ainda marcando conectado =
              // true, o que devolve a conta às vw_parcelas_* com o canal morto.
              // Foi o que aconteceu com a INDEPENDENTE em 17/08.
              const { data: reg } = await supabase
                .from('mensallizap')
                .select('instance_name')
                .eq('user_id', effectiveUserId)
                .maybeSingle()

              if (reg?.instance_name && reg.instance_name !== instanceName) {
                console.warn(
                  `⚠️ Instância trocada em outro lugar (memória: ${instanceName}, ` +
                  `registrada: ${reg.instance_name}). Recarregue a página.`
                )
                setStatus('disconnected')
              } else {
                supabase
                  .from('mensallizap')
                  .upsert({
                    user_id: effectiveUserId,
                    conectado: true,
                    instance_name: instanceName,
                    updated_at: new Date().toISOString()
                  }, { onConflict: 'user_id' })
                  .then(({ error }) => {
                    if (error) console.warn('Erro ao sincronizar mensallizap:', error)
                  })
              }
            } else if (veredito === 'zumbi') {
              setStatus('zombie')
            }
          } catch (error) {
            console.log('Instância não existe ou está desconectada')
          }
        }
      } catch (error) {
        console.error('Erro ao carregar configurações:', error)
        setErro('Erro ao carregar configurações')
      }
    }

    carregarTudo()
  }, [contextUserId])

  // Salvar conexão WhatsApp no banco de dados (na tabela config E mensallizap)
  const salvarConexaoNoBanco = async () => {
    try {
      if (!contextUserId) {
        console.error('Usuário não autenticado')
        return
      }

      console.log('🔍 Salvando conexão WhatsApp...')
      console.log('User ID:', contextUserId)
      console.log('Instance Name:', config.instanceName)

      // Salvar instance_name na tabela config (GLOBAL para o usuário)
      const { data: dataInstanceName, error: errorInstanceName } = await supabase
        .from('config')
        .upsert({
          user_id: contextUserId,
          chave: 'evolution_instance_name',
          valor: config.instanceName,
          descricao: 'Nome da instância conectada na Evolution API',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,chave'
        })
        .select()

      if (errorInstanceName) {
        console.warn('⚠️ Erro ao salvar instance name (não crítico):', errorInstanceName)
        // Continua execução - não é fatal
      }

      console.log('✅ Instance name salvo:', dataInstanceName)

      // Salvar status de conexão (conectado = true)
      const { data: dataStatus, error: errorStatus } = await supabase
        .from('config')
        .upsert({
          user_id: contextUserId,
          chave: 'whatsapp_conectado',
          valor: 'true',
          descricao: 'Status de conexão do WhatsApp',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,chave'
        })
        .select()

      if (errorStatus) {
        console.error('❌ Erro ao salvar status:', errorStatus)
      } else {
        console.log('✅ Status salvo:', dataStatus)
        console.log('✅ Conexão WhatsApp salva no banco de dados')

        // Verificar o que foi salvo
        const { data: verificacao, error: errorVerificacao } = await supabase
          .from('config')
          .select('chave, valor')
          .in('chave', ['evolution_instance_name', 'whatsapp_conectado'])

        console.log('📊 Verificação no banco:', verificacao)
        if (errorVerificacao) console.error('Erro na verificação:', errorVerificacao)
      }

      // ===================================
      // ATUALIZAR TABELA MENSALLIZAP
      // ===================================
      console.log('💾 Atualizando tabela mensallizap...')

      // Buscar dados do usuário
      const { data: usuarioData, error: usuarioError } = await supabase
        .from('usuarios')
        .select('nome_completo, email, telefone, plano')
        .eq('id', contextUserId)
        .single()

      if (usuarioError) {
        console.error('❌ Erro ao buscar dados do usuário:', usuarioError)
        return
      }

      // Número pareado, do ownerJid. Antes lia GET /instance/fetchProfile, que
      // NÃO existe nesta versão e responde 404 — por isso whatsapp_numero
      // nasceu NULL em toda a base. Esse número é o que permite sondar o socket
      // com um número real (a sonda com número inventado foi o que derrubou a
      // base em agosto) e é o destino de fallback do aviso de queda.
      let whatsappNumero = null
      try {
        const res = await chamarEvolution('fetchInstances', {}, config.instanceName, 8000)
        if (res.ok) {
          const dados = res.data
          const inst = (Array.isArray(dados) ? dados : [dados])[0]
          whatsappNumero = inst?.ownerJid ? String(inst.ownerJid).split('@')[0] : null
          console.log('📱 Número WhatsApp detectado:', whatsappNumero)
        }
      } catch (err) {
        console.log('⚠️ Não foi possível buscar o número do WhatsApp:', err.message)
      }

      // A instância REGISTRADA manda. Esta tela carrega o nome no mount e o
      // mantém em memória; se a conta for reapontada para outra instância (o
      // conserto de deadlock) enquanto a página está aberta, gravar o nome da
      // memória DESFAZ o reapontamento em silêncio. Foi o que aconteceu com a
      // GR Esperança em 17/08 às 12:10: ela reconectou na instância travada e o
      // reapontamento se perdeu.
      const { data: registrada } = await supabase
        .from('mensallizap')
        .select('instance_name')
        .eq('user_id', contextUserId)
        .maybeSingle()

      if (registrada?.instance_name && registrada.instance_name !== config.instanceName) {
        console.warn(
          `⚠️ Instância mudou durante o pareamento (memória: ${config.instanceName}, registrada: ${registrada.instance_name}). ` +
          'Não gravando conexão — recarregue a página e conecte de novo.'
        )
        setErro('A conexão foi atualizada em outro lugar. Recarregue a página e clique em conectar novamente.')
        setStatus('disconnected')
        return
      }

      // Atualizar ou criar registro na mensallizap
      const agora = new Date().toISOString()
      const { data: mensallizapData, error: mensallizapError } = await supabase
        .from('mensallizap')
        .upsert({
          user_id: contextUserId,
          nome_completo: usuarioData?.nome_completo || null,
          email: usuarioData?.email || '',
          telefone: usuarioData?.telefone || null,
          plano: usuarioData?.plano || 'starter',
          whatsapp_numero: whatsappNumero,
          instance_name: registrada?.instance_name || config.instanceName,
          conectado: true,
          ultima_conexao: agora,
          updated_at: agora
        }, {
          onConflict: 'user_id'
        })
        .select()

      if (mensallizapError) {
        console.error('❌ Erro ao atualizar mensallizap:', mensallizapError)
        console.error('❌ Detalhes do erro:', JSON.stringify(mensallizapError, null, 2))
      } else {
        console.log('✅ Mensallizap atualizada com sucesso!', mensallizapData)
        console.log('📅 Horário salvo (ISO):', agora)
        console.log('📅 Horário local:', new Date(agora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))
      }

    } catch (error) {
      console.error('Erro ao salvar conexão:', error)
    }
  }

  // Carregar configurações de automação
  const carregarConfiguracoesAutomacao = async () => {
    try {
      if (!contextUserId) return

      // Chaves únicas por usuário (prefixadas com user_id)
      const chaves = [
        `${contextUserId}_automacao_3dias_ativa`,
        `${contextUserId}_automacao_5dias_ativa`,
        `${contextUserId}_automacao_ematraso_ativa`
      ]

      const { data, error } = await supabase
        .from('config')
        .select('chave, valor')
        .in('chave', chaves)

      if (error) {
        console.error('Erro ao carregar configurações de automação:', error)
        return
      }

      const configMap = {}
      data?.forEach(item => {
        // Remover o prefixo do user_id para facilitar o acesso
        const chaveSimples = item.chave.replace(`${contextUserId}_`, '')
        configMap[chaveSimples] = item.valor
      })

      setAutomacao3DiasAtiva(configMap['automacao_3dias_ativa'] === 'true')
      // No Dia vem ativo por padrão se não houver configuração
      setAutomacaoNoDiaAtiva(configMap['automacao_nodia_ativa'] !== 'false')
      setAutomacao3DiasDepoisAtiva(configMap['automacao_3diasdepois_ativa'] === 'true')
    } catch (error) {
      console.error('Erro ao carregar configurações de automação:', error)
    }
  }

  // Salvar configuração de automação na tabela configuracoes_cobranca
  const salvarConfiguracaoAutomacao = async (chave, valor) => {
    try {
      if (!contextUserId) {
        setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Usuário não autenticado' })
        return false
      }

      // Mapear chave do React para coluna da tabela configuracoes_cobranca
      const mapeamentoColunas = {
        'automacao_3dias_ativa': 'enviar_3_dias_antes',
        'automacao_nodia_ativa': 'enviar_no_dia',
        'automacao_3diasdepois_ativa': 'enviar_3_dias_depois',
        'automacao_lembrete_aula_ativa': 'enviar_lembrete_aula',
        'automacao_lembrete_aula_24h_ativa': 'enviar_lembrete_aula_24h',
        'automacao_confirmacao_agendamento_ativa': 'enviar_confirmacao_agendamento',
        'automacao_aniversario_ativa': 'enviar_aniversario',
        'automacao_confirmacao_pgto_ativa': 'enviar_confirmacao_pagamento',
        'automacao_resumo_diario_ativa': 'enviar_resumo_diario',
        'automacao_alerta_despesas_ativa': 'alertar_despesas',
        'alerta_despesas_dias_antes': 'alertar_despesas_dias_antes',
        'automacao_recuperacao_ativa': 'recuperacao_inativos_ativa',
        'automacao_nps_ativa': 'nps_experimental_ativo',
        'enviar_domingo_ativo': 'enviar_domingo',
        'bot_ativo': 'bot_ativo',
        'bot_saudacao': 'bot_saudacao'
      }

      const coluna = mapeamentoColunas[chave]
      if (!coluna) {
        console.error('Chave de automação inválida:', chave)
        return false
      }

      // Verificar se já existe registro para este usuário
      const { data: existing, error: selectError } = await supabase
        .from('configuracoes_cobranca')
        .select('id')
        .eq('user_id', contextUserId)
        .maybeSingle()

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('Erro ao verificar configuração:', selectError)
      }

      if (existing) {
        // Atualizar registro existente
        const { error } = await supabase
          .from('configuracoes_cobranca')
          .update({
            [coluna]: valor,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', contextUserId)

        if (error) {
          console.error('Erro ao atualizar configuração:', error)
          setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar configuração: ' + error.message })
          return false
        }
      } else {
        // Inserir novo registro
        const { error } = await supabase
          .from('configuracoes_cobranca')
          .insert({
            user_id: contextUserId,
            [coluna]: valor
          })

        if (error) {
          console.error('Erro ao inserir configuração:', error)
          setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar configuração: ' + error.message })
          return false
        }
      }

      return true
    } catch (error) {
      console.error('Erro ao salvar configuração de automação:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar configuração' })
      return false
    }
  }

  // A troca de Pix/link nas mensagens e nos modelos agora acontece em
  // Configurações › Recebimentos (services/metodoPagamento.js).

  // Função para criar ou atualizar template padrão automaticamente ao ativar toggle
  const criarTemplatePadraoSeNaoExiste = async (tipo) => {
    try {
      if (!contextUserId) return false

      // Verificar se já existe template deste tipo (ativo ou inativo)
      const { data: existente, error: erroBusca } = await supabase
        .from('templates')
        .select('id, ativo, mensagem')
        .eq('user_id', contextUserId)
        .eq('tipo', tipo)
        .maybeSingle()

      if (erroBusca) {
        console.error('Erro ao verificar template existente:', erroBusca)
        return false
      }

      const titulos = TITULOS_PADRAO

      // Se já existe, verificar se precisa atualizar
      if (existente) {
        // Se já está ativo e tem mensagem, não precisa fazer nada
        if (existente.ativo && existente.mensagem && existente.mensagem.trim() !== '') {
          console.log(`Template ${tipo} já existe e está ativo`)
          return true
        }

        // Atualizar template existente (ativar e/ou preencher mensagem)
        const { error: erroUpdate } = await supabase
          .from('templates')
          .update({
            ativo: true,
            mensagem: existente.mensagem && existente.mensagem.trim() !== ''
              ? existente.mensagem
              : TEMPLATES_PADRAO[tipo],
            titulo: titulos[tipo],
            updated_at: new Date().toISOString()
          })
          .eq('id', existente.id)

        if (erroUpdate) {
          console.error('Erro ao atualizar template:', erroUpdate)
          return false
        }

        console.log(`✅ Template ${tipo} atualizado com sucesso!`)
        await carregarTemplates()
        return true
      }

      // Criar novo template
      const { error: erroInsert } = await supabase
        .from('templates')
        .insert({
          user_id: contextUserId,
          titulo: titulos[tipo],
          mensagem: TEMPLATES_PADRAO[tipo],
          tipo: tipo,
          ativo: true,
          is_padrao: true
        })

      if (erroInsert) {
        console.error('Erro ao criar template padrão:', erroInsert)
        return false
      }

      console.log(`✅ Template padrão ${tipo} criado com sucesso!`)

      // Atualizar lista de templates
      await carregarTemplates()

      return true
    } catch (error) {
      console.error('Erro ao criar template padrão:', error)
      return false
    }
  }

  // Toggle automação 3 dias
  const toggleAutomacao3Dias = async () => {
    const novoValor = !automacao3DiasAtiva

    // Se está ativando, criar template padrão se não existir
    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('pre_due_3days')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_3dias_ativa', novoValor)
    if (sucesso) {
      setAutomacao3DiasAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Automação Ativada',
          message: 'Lembretes de 3 dias antes serão enviados automaticamente! O template padrão foi configurado.'
        })
      }
    }
  }

  // Toggle automação no dia
  const toggleAutomacaoNoDia = async () => {
    const novoValor = !automacaoNoDiaAtiva

    // Se está ativando, criar template padrão se não existir
    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('due_day')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_nodia_ativa', novoValor)
    if (sucesso) {
      setAutomacaoNoDiaAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Automação Ativada',
          message: 'Lembretes no dia do vencimento serão enviados automaticamente! O template padrão foi configurado.'
        })
      }
    }
  }

  // Toggle automação 3 dias depois
  const toggleAutomacao3DiasDepois = async () => {
    const novoValor = !automacao3DiasDepoisAtiva

    // Se está ativando, criar template padrão se não existir
    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('overdue')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_3diasdepois_ativa', novoValor)
    if (sucesso) {
      setAutomacao3DiasDepoisAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Automação Ativada',
          message: 'Cobranças de 3 dias após o vencimento serão enviadas automaticamente! O template padrão foi configurado.'
        })
      }
    }
  }

  const toggleAutomacaoLembreteAula = async () => {
    const novoValor = !automacaoLembreteAulaAtiva

    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('class_reminder')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_lembrete_aula_ativa', novoValor)
    if (sucesso) {
      setAutomacaoLembreteAulaAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Lembrete de Aula Ativado',
          message: 'Lembretes de aula serão enviados 1 hora antes via WhatsApp! Configure os horários na página Horários.'
        })
      }
    }
  }

  // Lembrete da véspera. Vale só para aula avulsa (agendamentos) — aluno de
  // turma fixa receberia "sua aula é amanhã" todo dia, e isso é bloqueio na
  // certa. Quem envia é a edge function lembrete-aula-24h (pg_cron 15/15min).
  const toggleAutomacaoLembreteAula24h = async () => {
    const novoValor = !automacaoLembreteAula24hAtiva

    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('class_reminder_24h')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_lembrete_aula_24h_ativa', novoValor)
    if (sucesso) {
      setAutomacaoLembreteAula24hAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Lembrete da Véspera Ativado',
          message: 'Quem marcar aula avulsa vai receber um lembrete 24h antes, além do de 1 hora. Alunos de turma fixa não recebem este.'
        })
      }
    }
  }

  // Confirmação que sai na hora em que o aluno marca pelo link de agendamento.
  // O envio mora na edge function agendamento-agendar.
  const toggleAutomacaoConfirmacaoAgendamento = async () => {
    const novoValor = !automacaoConfirmacaoAgendamentoAtiva

    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('booking_confirmed')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_confirmacao_agendamento_ativa', novoValor)
    if (sucesso) {
      setAutomacaoConfirmacaoAgendamentoAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Confirmação Ativada',
          message: 'Quem marcar aula pelo seu link de agendamento vai receber a confirmação no WhatsApp na mesma hora.'
        })
      }
    }
  }

  // Toggle automação aniversário
  const toggleAutomacaoAniversario = async () => {
    const novoValor = !automacaoAniversarioAtiva

    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('birthday')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_aniversario_ativa', novoValor)
    if (sucesso) {
      setAutomacaoAniversarioAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Aniversário Ativado',
          message: 'Mensagens de aniversário serão enviadas automaticamente às 8h! O template padrão foi configurado.'
        })
      }
    }
  }

  const toggleAutomacaoConfirmacaoPgto = async () => {
    const novoValor = !automacaoConfirmacaoPgtoAtiva

    if (novoValor) {
      await criarTemplatePadraoSeNaoExiste('payment_confirmed')
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_confirmacao_pgto_ativa', novoValor)
    if (sucesso) {
      setAutomacaoConfirmacaoPgtoAtiva(novoValor)
    }
  }

  const toggleResumoDiario = async () => {
    const novoValor = !automacaoResumoDiarioAtiva
    const sucesso = await salvarConfiguracaoAutomacao('automacao_resumo_diario_ativa', novoValor)
    if (sucesso) {
      setAutomacaoResumoDiarioAtiva(novoValor)
    }
  }

  const toggleAlertaDespesas = async () => {
    const novoValor = !automacaoAlertaDespesasAtiva
    if (novoValor) {
      await criarTemplatePadraoSeNaoExiste('despesa_vencendo')
    }
    const sucesso = await salvarConfiguracaoAutomacao('automacao_alerta_despesas_ativa', novoValor)
    if (sucesso) {
      setAutomacaoAlertaDespesasAtiva(novoValor)
    }
  }

  // O ajuste de dias do Alerta de Despesa saiu da tela (confundia); vale o que
  // já está gravado em configuracoes_cobranca.alerta_despesas_dias_antes.

  const toggleNps = async () => {
    const novoValor = !automacaoNpsAtiva
    // Se ativando, avisa que precisa do bot ativo (porque captura depende do bot)
    if (novoValor && !botAtivo) {
      setFeedbackModal({
        isOpen: true,
        type: 'warning',
        title: 'Bot WhatsApp necessário',
        message: 'O NPS depende do bot pra capturar as respostas dos alunos. Ative o bot na aba "Bot" antes de ativar essa automação. Sem ele, as mensagens são enviadas mas as notas dos alunos não serão registradas automaticamente.'
      })
    }
    const sucesso = await salvarConfiguracaoAutomacao('automacao_nps_ativa', novoValor)
    if (sucesso) {
      setAutomacaoNpsAtiva(novoValor)
    }
  }

  // Toggle da Recuperação de Inativos — verifica se a academia usa presenças
  // antes de ativar. Se não usa, mostra aviso educativo mas permite ativar.
  const toggleRecuperacaoInativos = async () => {
    const novoValor = !automacaoRecuperacaoAtiva

    // Ao ATIVAR, checa se tem presenças recentes pra avisar
    if (novoValor) {
      try {
        const trintaDiasAtras = new Date()
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)
        const { count } = await supabase
          .from('presencas')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', contextUserId)
          .eq('presente', true)
          .gte('data', trintaDiasAtras.toISOString().slice(0, 10))

        const temPresencas = (count || 0) > 0
        setTemPresencasRecentes(temPresencas)

        if (!temPresencas) {
          setFeedbackModal({
            isOpen: true,
            type: 'warning',
            title: 'Atenção',
            message: 'Essa automação detecta alunos inativos pela presença em aulas. Como você ainda não marcou presença de nenhum aluno nos últimos 30 dias, a recuperação não vai disparar nada até que você comece a marcar presenças. A automação foi ativada mesmo assim.'
          })
        }
      } catch (err) {
        console.error('Erro ao verificar presenças:', err)
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_recuperacao_ativa', novoValor)
    if (sucesso) {
      setAutomacaoRecuperacaoAtiva(novoValor)
    }
  }

  // Toggle do Bot WhatsApp - ativa/desativa e configura webhook na Evolution
  const toggleBot = async () => {
    const novoValor = !botAtivo

    // Só bloqueia se tentar ATIVAR com WhatsApp desconectado.
    // Desativar é permitido mesmo sem conexão (permite sair de um estado inválido).
    if (novoValor && status !== 'connected') {
      setFeedbackModal({
        isOpen: true,
        type: 'warning',
        title: 'WhatsApp não conectado',
        message: 'Conecte o WhatsApp antes de ativar o bot.'
      })
      return
    }
    setSalvandoBot(true)

    try {
      // 1. Salvar flag no banco
      const sucesso = await salvarConfiguracaoAutomacao('bot_ativo', novoValor)
      if (!sucesso) {
        setSalvandoBot(false)
        return
      }

      // 2. Configurar webhook na Evolution API
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(`${FUNCTIONS_URL}/whatsapp-bot-config`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ acao: novoValor ? 'ativar' : 'desativar' })
      })

      const result = await resp.json()
      if (!resp.ok) {
        // Se estava tentando ATIVAR e o webhook falhou → reverter flag
        // Se estava tentando DESATIVAR → manter flag false (o importante é o bot parar)
        if (novoValor) {
          await salvarConfiguracaoAutomacao('bot_ativo', !novoValor)
          setFeedbackModal({
            isOpen: true,
            type: 'danger',
            title: 'Erro ao configurar webhook',
            message: result.error || 'Não foi possível configurar o bot. Tente novamente.'
          })
          setSalvandoBot(false)
          return
        } else {
          // Desativou mas webhook não respondeu — alerta mas mantém desativado
          setBotAtivo(false)
          setFeedbackModal({
            isOpen: true,
            type: 'warning',
            title: 'Bot desativado',
            message: 'O bot foi desativado no sistema, mas não consegui confirmar com a Evolution API. Se o WhatsApp voltar a conectar e o bot ainda responder, me avise.'
          })
          setSalvandoBot(false)
          return
        }
      }

      setBotAtivo(novoValor)
      setFeedbackModal({
        isOpen: true,
        type: 'success',
        title: novoValor ? 'Bot ativado' : 'Bot desativado',
        message: novoValor
          ? 'Pronto! Agora quando alguém mandar mensagem pro WhatsApp, o bot vai responder com o menu.'
          : 'O bot foi desativado. Mensagens não serão mais respondidas automaticamente.'
      })
    } catch (err) {
      setFeedbackModal({
        isOpen: true,
        type: 'danger',
        title: 'Erro',
        message: err.message || 'Erro ao configurar bot'
      })
    } finally {
      setSalvandoBot(false)
    }
  }

  const toggleBotOpcao = async (key) => {
    const novoValor = botOpcoesAtivas[key] === false ? true : false
    const novasOpcoes = { ...botOpcoesAtivas, [key]: novoValor }
    setBotOpcoesAtivas(novasOpcoes)
    try {
      const { error } = await supabase
        .from('configuracoes_cobranca')
        .update({ bot_opcoes_ativas: novasOpcoes, updated_at: new Date().toISOString() })
        .eq('user_id', contextUserId)
      if (error) throw error
    } catch (err) {
      setBotOpcoesAtivas(botOpcoesAtivas)
      setFeedbackModal({
        isOpen: true,
        type: 'danger',
        title: 'Erro',
        message: 'Não foi possível salvar: ' + err.message
      })
    }
  }

  const toggleBotLeadOpcao = async (key) => {
    const novoValor = botLeadOpcoesAtivas[key] === false ? true : false
    const novasOpcoes = { ...botLeadOpcoesAtivas, [key]: novoValor }
    setBotLeadOpcoesAtivas(novasOpcoes)
    try {
      const { error } = await supabase
        .from('configuracoes_cobranca')
        .update({ bot_lead_opcoes_ativas: novasOpcoes, updated_at: new Date().toISOString() })
        .eq('user_id', contextUserId)
      if (error) throw error
    } catch (err) {
      setBotLeadOpcoesAtivas(botLeadOpcoesAtivas)
      setFeedbackModal({
        isOpen: true,
        type: 'danger',
        title: 'Erro',
        message: 'Não foi possível salvar: ' + err.message
      })
    }
  }

  // Salva os três textos do bot de uma vez (antes eram três botões separados,
  // e quem editava os três e salvava um perdia os outros sem aviso).
  const salvarTextosBot = async () => {
    setSalvandoBot(true)
    try {
      const { error } = await supabase
        .from('configuracoes_cobranca')
        .update({
          bot_saudacao: paraSalvar(botSaudacao),
          bot_lead_saudacao: paraSalvar(botLeadSaudacao),
          bot_texto_conhecer: botTextoConhecer,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', contextUserId)
      if (error) throw error
      setTextosBotSalvos({ saudacao: botSaudacao, lead: botLeadSaudacao, conhecer: botTextoConhecer })
      showToast('Textos do bot salvos', 'success')
    } catch (err) {
      console.error('Erro ao salvar textos do bot:', err)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Não foi possível salvar os textos do bot. Tente de novo.' })
    } finally {
      setSalvandoBot(false)
    }
  }

  const descartarTextosBot = () => {
    if (!textosBotSalvos) return
    setBotSaudacao(textosBotSalvos.saudacao)
    setBotLeadSaudacao(textosBotSalvos.lead)
    setBotTextoConhecer(textosBotSalvos.conhecer)
  }

  const toggleEnviarDomingo = async () => {
    const novoValor = !enviarDomingoAtivo
    const sucesso = await salvarConfiguracaoAutomacao('enviar_domingo_ativo', novoValor)
    if (sucesso) {
      setEnviarDomingoAtivo(novoValor)
      setFeedbackModal({
        isOpen: true,
        type: 'success',
        title: novoValor ? 'Envio no domingo ativado' : 'Envio no domingo desativado',
        message: novoValor
          ? 'Mensagens serão enviadas normalmente no domingo.'
          : 'Mensagens de domingo serão enviadas na segunda-feira.'
      })
    }
  }

  // FUNÇÃO UNIFICADA: Conectar WhatsApp
  //
  // O passo a passo (sonda, zumbi, reset da instância, retry do QR) mora no
  // service — é o mesmo do wizard de onboarding. Aqui ficou só o que é de tela.
  // Este fluxo já foi duplicado antes e as duas cópias divergiram: a do wizard
  // ganhou o tratamento de zumbi e esta não, então o cliente que caía batia no
  // "QR Code não foi gerado pela API" sem nenhum caminho de volta.
  //
  // forcar = clique em "Reconectar/Forçar nova conexão": descarta a sessão presa
  // antes de pedir o QR (a que fica em 'connecting' segurando o nome).
  const conectarWhatsApp = async ({ forcar = false } = {}) => {
    setLoading(true)
    setErro('')

    try {
      console.log(forcar ? '📱 Forçando nova conexão do WhatsApp...' : '📱 Conectando WhatsApp...')

      const { jaConectado, qr } = await gerarQrCode(config, { forcar, userId: contextUserId })

      if (jaConectado) {
        // A Evolution diz 'open', mas se os nossos logs mostram envio morrendo
        // sem sucesso depois, ela esta mentindo — e mandar "Ja Conectado!" deixa
        // o cliente sem saida nenhuma. Foi o caso da Team Juliana em 21/08: ela
        // clicou, recebeu o modal de sucesso, e continuou sem enviar.
        if (!forcar && (await temEvidenciaDeZumbi(contextUserId))) {
          console.warn('⚠️ open + falhas recentes sem sucesso = zumbi. Mostrando conexao travada.')
          setStatus('zombie')
          setQrCode(null)
          return
        }
        console.log('✅ Instância já está conectada! Pulando QR Code.')
        setStatus('connected')
        setQrCode(null)
        await salvarConexaoNoBanco()
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Já Conectado',
          message: 'Seu WhatsApp já está conectado! Não é necessário escanear o QR Code novamente.'
        })
        return
      }

      console.log('✅ QR Code gerado!')
      setQrCode(qr)
      setStatus('connecting')
      setTempoRestante(120)

    } catch (error) {
      console.error('❌ Erro completo:', error)
      setErro(error.message)
      // Cai em 'disconnected' (não 'zombie') de propósito: é o estado que mostra
      // o botão de forçar nova conexão junto do erro.
      setStatus('disconnected')
    } finally {
      setLoading(false)
    }
  }

  // POLLING SIMPLIFICADO
  useEffect(() => {
    if (status !== 'connecting' || !qrCode) return

    const currentConfig = configRef.current
    if (!currentConfig.instanceName) return

    console.log('🔄 Iniciando polling...')

    const intervalId = setInterval(async () => {
      try {
        const response = await chamarEvolution('connectionState', {}, currentConfig.instanceName)

        if (response.ok) {
          const data = response.data
          const state = data.instance?.state || 'close'

          console.log(`📊 Status: ${state}`)

          if (state === 'open') {
            console.log('✅ Conectado!')
            setStatus('connected')
            setQrCode(null)

            // Salvar conexão no banco de dados
            await salvarConexaoNoBanco()
          }
        }
      } catch (error) {
        console.error('Erro no polling:', error)
      }
    }, 3000)

    // Contador regressivo de 1 em 1 segundo
    const countdownId = setInterval(() => {
      setTempoRestante(prev => {
        if (prev <= 1) {
          return 0
        }
        return prev - 1
      })
    }, 1000)

    const timeoutId = setTimeout(() => {
      console.log('⏱️ Código expirado')
      clearInterval(intervalId)
      clearInterval(countdownId)
      setQrCode(null)
      setStatus('disconnected')
      setTempoRestante(120)
      setErro('Tempo expirado. Clique em "Conectar WhatsApp" novamente.')
    }, 120000)

    return () => {
      console.log('🧹 Limpando polling...')
      clearInterval(intervalId)
      clearInterval(countdownId)
      clearTimeout(timeoutId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, qrCode])

  // Desconectar
  const desconectar = async () => {
    setLoading(true)
    try {
      await chamarEvolution('logout', {}, config.instanceName)

      // Atualizar status no banco de dados (tabela config)
      if (contextUserId) {
        await supabase
          .from('config')
          .upsert({
            user_id: contextUserId,
            chave: 'whatsapp_conectado',
            valor: 'false',
            descricao: 'Status de conexão do WhatsApp',
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,chave'
          })

        // Atualizar tabela mensallizap (marcar como desconectado)
        console.log('💾 Atualizando mensallizap (desconexão)...')
        const { error: mensallizapError } = await supabase
          .from('mensallizap')
          .update({
            conectado: false,
            ultima_desconexao: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', contextUserId)

        if (mensallizapError) {
          console.error('❌ Erro ao atualizar mensallizap:', mensallizapError)
        } else {
          console.log('✅ Mensallizap atualizada (desconectado)')
        }
      }

      setStatus('disconnected')
      setQrCode(null)
      setFeedbackModal({ isOpen: true, type: 'success', title: 'Desconectado', message: 'WhatsApp desconectado com sucesso!' })
    } catch (error) {
      setErro('Erro ao desconectar: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // ========== TEMPLATES ==========

  const gerarPreview = (mensagem) => {
    return mensagem
      .replace(/\{\{nomeCliente\}\}/g, 'João Silva')
      .replace(/\{\{telefone\}\}/g, '(62) 98246-6639')
      .replace(/\{\{valorMensalidade\}\}/g, 'R$ 150,00')
      .replace(/\{\{dataVencimento\}\}/g, '06/01/2026')
      .replace(/\{\{diasAtraso\}\}/g, '5')
      // Nome real da conta: a prévia mostrava "Minha Empresa" fixo e o dono
      // achava que a mensagem sairia assim mesmo depois de renomear.
      .replace(/\{\{nomeEmpresa\}\}/g, (nomeEmpresaConta || '').trim() || 'Minha Empresa')
      .replace(/\{\{chavePix\}\}/g, 'minha@chave.pix')
      .replace(/\{\{linkPagamento\}\}/g, 'https://app.mensallizap.com.br/pagar/abc123')
  }

  const getTituloDefault = (tipo) => TITULOS_PADRAO[tipo] || ''

  const getMensagemDefault = (tipo) => {
    let mensagem = TEMPLATES_PADRAO[tipo] || TEMPLATES_PADRAO.overdue
    // Se método de pagamento é Asaas, trocar variável e labels
    if (metodoPagamento === 'asaas_link') {
      mensagem = mensagem
        .replaceAll('{{chavePix}}', '{{linkPagamento}}')
        .replace(/🔑 Chave Pix:/g, '🔗 Link de pagamento:')
        .replace(/💳 Pix para pagamento:/g, '🔗 Link de pagamento:')
    }
    return mensagem
  }

  const restaurarMensagemPadrao = async () => {
    const novoTitulo = getTituloDefault(tipoTemplateSelecionado)
    const novaMensagem = getMensagemDefault(tipoTemplateSelecionado)

    setTituloTemplate(novoTitulo)
    setMensagemTemplate(paraExibir(novaMensagem))

    // Salvar no banco automaticamente
    try {
      const templateExistente = templatesAgrupados[tipoTemplateSelecionado]

      if (templateExistente) {
        // Atualizar template existente
        const { error } = await supabase
          .from('templates')
          .update({
            titulo: novoTitulo,
            mensagem: novaMensagem,
            is_padrao: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', templateExistente.id)

        if (error) throw error
      } else {
        // Criar novo template com o padrão
        const { error } = await supabase
          .from('templates')
          .insert({
            user_id: contextUserId,
            titulo: novoTitulo,
            mensagem: novaMensagem,
            tipo: tipoTemplateSelecionado,
            ativo: true,
            is_padrao: true
          })

        if (error) throw error
      }

      await carregarTemplates()
      setFeedbackModal({ isOpen: true, type: 'success', title: 'Restaurado', message: 'Mensagem padrão restaurada e salva!' })
    } catch (error) {
      console.error('Erro ao restaurar padrão:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar template padrão' })
    }
  }

  const carregarTemplates = async () => {
    try {
      if (!contextUserId) return

      const { data: templates, error } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', contextUserId)
        .eq('ativo', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Group templates by type - priorizar customizados sobre padrões
      const findBestTemplate = (tipo) => {
        const customizado = templates?.find(t => t.tipo === tipo && t.is_padrao !== true)
        if (customizado) return customizado
        return templates?.find(t => t.tipo === tipo) || null
      }
      // Todos os tipos conhecidos — tipo de fora daqui nunca acha o template salvo,
      // e o salvar vira INSERT duplicado em vez de UPDATE
      const agrupados = Object.fromEntries(
        Object.keys(TITULOS_PADRAO).map(tipo => [tipo, findBestTemplate(tipo)])
      )

      setTemplatesAgrupados(agrupados)

      // Load current selected type template
      const templateAtual = agrupados[tipoTemplateSelecionado]
      if (templateAtual) {
        setTituloTemplate(templateAtual.titulo)
        setMensagemTemplate(paraExibir(templateAtual.mensagem))
      } else {
        setTituloTemplate(getTituloDefault(tipoTemplateSelecionado))
        setMensagemTemplate(paraExibir(getMensagemDefault(tipoTemplateSelecionado)))
      }
    } catch (error) {
      console.error('Erro ao carregar templates:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao carregar templates' })
    }
  }

  const salvarTemplate = async () => {
    if (!tituloTemplate.trim() || !mensagemTemplate.trim()) {
      setFeedbackModal({ isOpen: true, type: 'warning', title: 'Atenção', message: 'Preencha o título e a mensagem do template' })
      return
    }

    try {
      const templateExistente = templatesAgrupados[tipoTemplateSelecionado]

      const mensagemParaPersistir = paraSalvar(mensagemTemplate)

      if (templateExistente) {
        // Update existing - marcar como customizado (não padrão)
        const { error, data } = await supabase
          .from('templates')
          .update({
            titulo: tituloTemplate,
            mensagem: mensagemParaPersistir,
            is_padrao: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', templateExistente.id)
          .select()

        if (error) throw error

        // Atualizar estado local imediatamente (cache reflete o banco)
        setTemplatesAgrupados(prev => ({
          ...prev,
          [tipoTemplateSelecionado]: { ...templateExistente, titulo: tituloTemplate, mensagem: mensagemParaPersistir, is_padrao: false }
        }))
      } else {
        // Create new
        const { error, data } = await supabase
          .from('templates')
          .insert({
            user_id: contextUserId,
            titulo: tituloTemplate,
            mensagem: mensagemParaPersistir,
            tipo: tipoTemplateSelecionado,
            ativo: true,
            is_padrao: false
          })
          .select()

        if (error) throw error

        // Atualizar estado local imediatamente
        if (data && data[0]) {
          setTemplatesAgrupados(prev => ({
            ...prev,
            [tipoTemplateSelecionado]: data[0]
          }))
        }
      }

      setFeedbackModal({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Template salvo com sucesso!' })
    } catch (error) {
      console.error('Erro ao salvar template:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar template: ' + error.message })
    }
  }

  // ========== RENDER ==========

  // Selo do status da conexão: no computador fica ao lado das abas; no celular
  // sobe para a linha do título, para o seletor de seção ter a largura toda.
  const seloStatusWhats = (() => {
    const selo = status === 'connected' ? { variant: 'success', texto: 'Conectado' }
      : status === 'connecting' ? { variant: 'warning', texto: 'Conectando…' }
      : status === 'zombie' ? { variant: 'danger', texto: 'Travado' }
      : { variant: 'danger', texto: 'Desconectado' }
    return <Badge variant={selo.variant} dot size="md">{selo.texto}</Badge>
  })()

  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh', paddingBottom: isSmallScreen ? '40px' : '60px', boxSizing: 'border-box', minWidth: 0, overflowX: 'hidden' }}>
      {/* Título */}
      <div style={{ marginBottom: isSmallScreen ? '16px' : '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
            WhatsApp
          </h2>
          {isMobile && seloStatusWhats}
        </div>
        <p style={{ margin: '5px 0 0 0', fontSize: isSmallScreen ? '13px' : '14px', color: '#666' }}>
          Gerencie sua conexão e os templates de mensagens
        </p>
      </div>

      {/* Menu de Abas + Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: isSmallScreen ? '16px' : '24px', minWidth: 0, width: '100%' }}>
        {/* Abas da tela — Select do DS no celular, Tabs segmentadas no computador */}
        {(() => {
          const abas = [
            { value: 'conexao', label: 'Conexão', icon: 'mdi:connection' },
            { value: 'templates', label: 'Templates de mensagens', icon: 'mdi:message-text-outline' },
            { value: 'campanhas', label: 'Campanhas', icon: 'mdi:bullhorn-outline' },
            { value: 'bot', label: 'Bot', icon: 'mdi:robot-happy-outline' },
            ...(isAdmin ? [{ value: 'mensagens', label: 'Central de Mensagens', icon: 'mdi:message-alert-outline' }] : [])
          ]
          return isMobile ? (
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <Select
                aria-label="Seção do WhatsApp"
                size="lg"
                showAll
                value={activeTab}
                onChange={(v) => v && setActiveTab(v)}
                options={abas}
              />
            </div>
          ) : (
            <Tabs variant="segmented" value={activeTab} onChange={setActiveTab} items={abas} />
          )
        })()}

        {/* Status badge + Desconectar */}
        {/* 'zombie' cai no visual vermelho junto com 'disconnected': o canal está
            morto, então mostrar verde aqui era a contradição que o cliente via
            entre esta tela e o banner de desconexão. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Atualizar a Central sem recarregar a página. Só lê banco — não
              encosta na Evolution, então clicar à vontade não custa conexão. */}
          {activeTab === 'mensagens' && (
            <button
              onClick={() => setRecarregarMensagens(n => n + 1)}
              title="Atualizar a lista de mensagens"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: isMobile ? '8px' : '6px 12px',
                width: isMobile ? '32px' : 'auto', height: isMobile ? '32px' : 'auto',
                backgroundColor: '#fff', color: '#344848',
                border: '1px solid #d5dede', borderRadius: isMobile ? '50%' : '20px',
                fontSize: '13px', fontWeight: '500', cursor: 'pointer', flexShrink: 0
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f5' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff' }}
            >
              <Icon icon="mdi:refresh" width="16" />
              {!isMobile && 'Atualizar'}
            </button>
          )}
          {!isMobile && seloStatusWhats}
        </div>
      </div>

      {/* Conteúdo */}
      {activeTab === 'conexao' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Card padding={isSmallScreen ? 'default' : 'spacious'}>
            {status === 'connected' ? (
              // ESTADO 1: CONECTADO
              <div style={{ textAlign: 'center', padding: isSmallScreen ? '16px 0' : '24px 0' }}>
                <Icon icon="mdi:check-circle" width="64" height="64" style={{ color: 'var(--color-brand-fill)', marginBottom: '12px' }} />
                <h3 className="ds-text-h3" style={{ margin: '0 0 6px 0', color: 'var(--color-text-primary)' }}>
                  WhatsApp conectado
                </h3>
                {numeroConectado && (
                  <p className="ds-text-body" style={{ margin: '0 0 6px 0', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                    {(() => {
                      const d = String(numeroConectado).replace(/\D/g, '').replace(/^55/, '')
                      if (d.length < 10) return numeroConectado
                      // (62) 9••••-1234: mostra só o DDD, o primeiro dígito e o final
                      return d.length === 11
                        ? `(${d.slice(0, 2)}) ${d[2]}••••-${d.slice(-4)}`
                        : `(${d.slice(0, 2)}) ••••-${d.slice(-4)}`
                    })()}
                  </p>
                )}
                <p className="ds-text-body" style={{ margin: '0 auto 20px', color: 'var(--color-text-secondary)', maxWidth: 420 }}>
                  Pronto para enviar as cobranças e os lembretes automáticos.
                </p>
                <div style={{ display: 'flex', flexDirection: isSmallScreen ? 'column' : 'row', gap: '10px', justifyContent: 'center' }}>
                  <Button variant="primary" icon="mdi:message-text-outline" onClick={() => setActiveTab('templates')}>
                    Ver mensagens automáticas
                  </Button>
                  <Button variant="danger-soft" icon="mdi:logout-variant" disabled={loading} onClick={() => setConfirmDesconexaoModal(true)}>
                    Desconectar
                  </Button>
                </div>
              </div>
            ) : status === 'zombie' && !qrCode ? (
              // ESTADO 1B: ZUMBI — a Evolution diz "open", mas o canal está morto.
              // Sem este bloco o cliente via a tela verde de sucesso e não tinha
              // como descobrir que nada estava saindo.
              <div style={{ textAlign: 'center', padding: isSmallScreen ? '16px 0' : '24px 0' }}>
                <Icon icon="mdi:alert-circle" width="64" height="64" style={{ color: 'var(--danger-700)', marginBottom: '12px' }} />
                <h3 className="ds-text-h3" style={{ margin: '0 0 6px 0', color: 'var(--color-text-primary)' }}>
                  Conexão travada
                </h3>
                <p className="ds-text-body" style={{ margin: '0 auto 20px', color: 'var(--color-text-secondary)', maxWidth: 420 }}>
                  Seu WhatsApp aparece como conectado, mas o canal parou de responder:
                  suas cobranças e lembretes <strong>não estão sendo enviados</strong>.
                  Reconecte para voltar a enviar.
                </p>
                <Button variant="primary" icon="mdi:refresh" loading={loading} onClick={() => conectarWhatsApp({ forcar: true })}>
                  Reconectar WhatsApp
                </Button>
              </div>
            ) : qrCode ? (
              // ESTADO 2: CONECTANDO (QR Code visível)
              <div style={{ textAlign: 'center' }}>
                <h3 className="ds-text-h4" style={{ margin: '0 0 6px 0', color: 'var(--color-text-primary)' }}>
                  Escaneie o QR Code
                </h3>
                <p className="ds-text-body" style={{ margin: '0 0 20px 0', color: 'var(--color-text-secondary)' }}>
                  No WhatsApp do celular, toque em <strong>Conectar dispositivo</strong> e aponte a câmera para o código.
                </p>

                <div style={{
                  display: 'inline-block',
                  padding: isSmallScreen ? '12px' : '20px',
                  backgroundColor: 'white',
                  borderRadius: 'var(--radius-xl)',
                  border: '1px solid var(--color-border-default)',
                  marginBottom: '16px'
                }}>
                  <img
                    src={qrCode}
                    alt="QR Code para conectar o WhatsApp"
                    style={{
                      width: isSmallScreen ? '220px' : '300px',
                      height: isSmallScreen ? '220px' : '300px',
                      display: 'block'
                    }}
                  />
                </div>

                {/* Contador de tempo */}
                <div style={{ marginBottom: '16px' }}>
                  <Badge variant={tempoRestante <= 30 ? 'warning' : 'default'} icon="mdi:clock-outline" size="md">
                    {`Expira em ${Math.floor(tempoRestante / 60)}:${(tempoRestante % 60).toString().padStart(2, '0')}`}
                  </Badge>
                </div>

                {status === 'connecting' && (
                  <Alert variant="info" icon="eos-icons:loading" style={{ marginBottom: '16px', textAlign: 'left' }}>
                    Aguardando a leitura do QR Code…
                  </Alert>
                )}

                <Button
                  variant="outline"
                  onClick={() => {
                    setQrCode(null)
                    setStatus('disconnected')
                    setTempoRestante(120)
                  }}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              // ESTADO 3: DESCONECTADO
              <div>
                <h3 className="ds-text-h4" style={{ margin: '0 0 12px 0', color: 'var(--color-text-primary)' }}>
                  Conectar WhatsApp
                </h3>

                <ol className="cnx-passos">
                  <li>Abra o WhatsApp no celular que vai mandar as cobranças.</li>
                  <li>
                    Vá em <strong>Dispositivos conectados</strong>:
                    <span className="cnx-sub">No Android: toque em ⋮ (canto de cima).</span>
                    <span className="cnx-sub">No iPhone: toque em Configurações.</span>
                  </li>
                  <li>Toque em <strong>Conectar dispositivo</strong>.</li>
                  <li>Toque no botão abaixo e escaneie o QR Code que aparecer.</li>
                </ol>

                {isSmallScreen && (
                  <Alert variant="neutral" icon="mdi:monitor-cellphone" style={{ marginBottom: '16px' }}>
                    O QR Code precisa ser escaneado por outro aparelho. Se estiver no celular do WhatsApp, abra o Mensalli no computador para conectar.
                  </Alert>
                )}

                <Button variant="primary" size="lg" icon="mdi:qrcode" fullWidth loading={loading} onClick={() => conectarWhatsApp()}>
                  Conectar WhatsApp
                </Button>

                {/* Saída para quando o botão verde não resolve: derruba a sessão
                    presa e pede um QR novo. Fica fora do bloco de erro porque quem
                    já tentou conectar duas vezes sem sucesso precisa achar isto sozinho. */}
                <Button variant="outline" icon="mdi:refresh" fullWidth disabled={loading} onClick={() => conectarWhatsApp({ forcar: true })} style={{ marginTop: '10px' }}>
                  Gerar QR Code novo
                </Button>
                <p className="ds-text-caption" style={{ margin: '6px 0 0 0', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                  Use se o QR Code não aparecer: encerra a sessão antiga e gera um novo.
                </p>

                {erro && (
                  <Alert variant="danger" title={erro} style={{ marginTop: '16px' }}>
                    Toque em <strong>Gerar QR Code novo</strong>. Se ainda assim não aparecer o QR Code, chame o suporte: resolvemos direto no servidor.
                  </Alert>
                )}
              </div>
            )}
          </Card>

          <Alert variant="info" icon="mdi:information-outline">
            Mantenha o celular do WhatsApp ligado e com internet para que as mensagens sejam enviadas automaticamente.
          </Alert>

          <style>{`
            .cnx-passos { margin: 0 0 16px; padding-left: 20px; font-size: var(--text-md); color: var(--color-text-secondary); line-height: 1.6; display: flex; flex-direction: column; gap: 6px; }
            .cnx-passos strong { color: var(--color-text-primary); }
            .cnx-sub { display: block; font-size: var(--text-sm); color: var(--color-text-muted); }
          `}</style>
        </div>
      )}

      {activeTab === 'templates' && (
        /* Aba de Templates - Redesign */
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: isSmallScreen ? '16px' : '24px',
          border: '1px solid #e5e7eb',
          boxSizing: 'border-box'
        }}>
          {/* Layout 2 colunas */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile || isTablet ? '1fr' : '1fr 1fr', gap: isSmallScreen ? '16px' : '24px', minWidth: 0 }}>

            {/* COLUNA ESQUERDA: Cards de automação + Config */}
            <div style={{ minWidth: 0 }}>
              <div style={{ marginBottom: '12px' }}>
                <h3 style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: '600', color: '#344848' }}>
                  Automações
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Ative e selecione para editar</p>
              </div>

              {/* Categoria das automações — Select do DS no celular, Tabs no computador */}
              {(() => {
                const categorias = [
                  { value: 'cobrancas', label: 'Cobranças', icon: 'mdi:cash-multiple' },
                  { value: 'aulas', label: 'Aulas', icon: 'mdi:calendar-clock' },
                  { value: 'relacionamento', label: 'Relacionamento', icon: 'mdi:heart-outline' },
                  { value: 'retencao', label: 'Retenção', icon: 'mdi:account-reactivate' }
                ]
                return (
                  <div style={{ marginBottom: '16px' }}>
                    {isMobile ? (
                      <Select
                        aria-label="Tipo de automação"
                        showAll
                        value={categoriaAutomacao}
                        onChange={(v) => v && setCategoriaAutomacao(v)}
                        options={categorias}
                      />
                    ) : (
                      <Tabs variant="segmented" fullWidth value={categoriaAutomacao} onChange={setCategoriaAutomacao} items={categorias} />
                    )}
                  </div>
                )
              })()}

              {/* Aviso educativo quando categoria = retenção */}
              {categoriaAutomacao === 'retencao' && (
                <div style={{
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fcd34d',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '16px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start'
                }}>
                  <Icon icon="mdi:alert" width="18" style={{ color: '#b45309', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '12px', color: '#78350f', lineHeight: '1.5' }}>
                    <strong>Importante:</strong> a recuperação de inativos depende de você <strong>marcar presença</strong> dos alunos nas aulas. Sem o registro de presença, o sistema não consegue identificar quem sumiu. Se ainda não usa, a régua fica ativada mas silenciosa.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {[
                  { tipo: 'pre_due_3days', categoria: 'cobrancas', nome: '3 Dias Antes', descricao: 'Lembrete 3 dias antes do vencimento', icone: 'mdi:calendar-clock', cor: '#2196F3', ativo: automacao3DiasAtiva, toggle: toggleAutomacao3Dias, locked: automacaoLocked, plano: 'Pro' },
                  { tipo: 'due_day', categoria: 'cobrancas', nome: 'No Dia', descricao: 'Lembrete no dia do vencimento', icone: 'mdi:calendar-today', cor: '#ff9800', ativo: automacaoNoDiaAtiva, toggle: toggleAutomacaoNoDia, locked: false },
                  { tipo: 'overdue', categoria: 'cobrancas', nome: '3 Dias Depois', descricao: 'Cobrança 3 dias após o vencimento', icone: 'mdi:alert-circle', cor: '#f44336', ativo: automacao3DiasDepoisAtiva, toggle: toggleAutomacao3DiasDepois, locked: automacaoLocked, plano: 'Pro' },
                  { tipo: 'payment_confirmed', categoria: 'cobrancas', nome: 'Confirmação Pagamento', descricao: 'Enviada ao marcar como pago', icone: 'mdi:check-decagram', cor: '#4CAF50', ativo: automacaoConfirmacaoPgtoAtiva, toggle: toggleAutomacaoConfirmacaoPgto, locked: false },
                  { tipo: 'despesa_vencendo', categoria: 'cobrancas', nome: 'Alerta de Despesa', descricao: `Avisa no WhatsApp do dono ${alertaDespesasDiasAntes} dia(s) antes do vencimento`, icone: 'mdi:cash-clock', cor: '#dc2626', ativo: automacaoAlertaDespesasAtiva, toggle: toggleAlertaDespesas, locked: automacaoLocked, plano: 'Pro' },
                  { tipo: 'class_reminder', categoria: 'aulas', nome: 'Lembrete Aula', descricao: 'Lembrete 1h antes da aula', icone: 'mdi:clock-alert-outline', cor: '#6366f1', ativo: automacaoLembreteAulaAtiva, toggle: toggleAutomacaoLembreteAula, locked: automacaoLocked, plano: 'Pro' },
                  { tipo: 'class_reminder_24h', categoria: 'aulas', nome: 'Lembrete Véspera', descricao: 'Lembrete 24h antes (só aula avulsa)', icone: 'mdi:calendar-clock-outline', cor: '#6366f1', ativo: automacaoLembreteAula24hAtiva, toggle: toggleAutomacaoLembreteAula24h, locked: automacaoLocked, plano: 'Pro' },
                  { tipo: 'booking_confirmed', categoria: 'aulas', nome: 'Confirmação de Agendamento', descricao: 'Enviada ao aluno quando ele marca pelo link', icone: 'mdi:calendar-check', cor: '#10b981', ativo: automacaoConfirmacaoAgendamentoAtiva, toggle: toggleAutomacaoConfirmacaoAgendamento, locked: isLocked('premium'), plano: 'Premium' },
                  { tipo: 'resumo_diario', categoria: 'aulas', nome: 'Resumo do Dia', descricao: 'Receba os agendamentos do dia às 7h', icone: 'mdi:clipboard-text-clock', cor: '#0ea5e9', ativo: automacaoResumoDiarioAtiva, toggle: toggleResumoDiario, locked: isLocked('premium'), semTemplate: true, plano: 'Premium' },
                  { tipo: 'birthday', categoria: 'relacionamento', nome: 'Aniversário', descricao: 'Parabéns no dia do aniversário (8h)', icone: 'mdi:cake-variant', cor: '#E91E63', ativo: automacaoAniversarioAtiva, toggle: toggleAutomacaoAniversario, locked: automacaoLocked, plano: 'Pro' },
                  { tipo: 'welcome', categoria: 'relacionamento', nome: 'Boas-vindas', descricao: 'Enviada ao cadastrar novo aluno', icone: 'mdi:hand-wave', cor: '#8B5CF6', ativo: true, toggle: null, locked: false, semToggle: true },
                  { tipo: 'nps_experimental', categoria: 'relacionamento', nome: 'NPS Pós-Experimental', descricao: 'Pesquisa de satisfação 24h após a 1ª aula', icone: 'mdi:star-outline', cor: '#fbbf24', ativo: automacaoNpsAtiva, toggle: toggleNps, locked: isLocked('premium'), plano: 'Premium' },
                  { tipo: 'recuperacao_15', categoria: 'retencao', nome: 'Recuperação — 15 dias', descricao: '1º toque: aluno sumido há 15 dias', icone: 'mdi:account-reactivate', cor: '#a855f7', ativo: automacaoRecuperacaoAtiva, toggle: toggleRecuperacaoInativos, locked: automacaoLocked, plano: 'Pro' },
                  { tipo: 'recuperacao_30', categoria: 'retencao', nome: 'Recuperação — 30 dias', descricao: '2º toque: aluno sumido há 30 dias', icone: 'mdi:account-reactivate', cor: '#a855f7', ativo: automacaoRecuperacaoAtiva, toggle: null, locked: automacaoLocked, semToggle: true, plano: 'Pro' },
                  { tipo: 'recuperacao_45', categoria: 'retencao', nome: 'Recuperação — 45 dias', descricao: '3º toque: aluno sumido há 45 dias', icone: 'mdi:account-reactivate', cor: '#a855f7', ativo: automacaoRecuperacaoAtiva, toggle: null, locked: automacaoLocked, semToggle: true, plano: 'Pro' }
                ].filter(item => item.categoria === categoriaAutomacao).map((item) => (
                  <Fragment key={item.tipo}>
                  <div
                    onClick={() => {
                      if (item.locked) { setUpgradeModal({ isOpen: true, featureName: item.nome, plano: item.plano || 'Pro' }); return }
                      if (!item.ativo) return
                      setTipoTemplateSelecionado(item.tipo)
                      const template = templatesAgrupados[item.tipo]
                      if (template) { setTituloTemplate(template.titulo); setMensagemTemplate(paraExibir(template.mensagem)) }
                      else { setTituloTemplate(getTituloDefault(item.tipo)); setMensagemTemplate(paraExibir(getMensagemDefault(item.tipo))) }
                      if ((isMobile || isTablet) && !item.semTemplate) setEditorAberto(true)
                    }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      // No celular/tablet o cartão só fica marcado enquanto o editor está aberto;
                      // no computador marca qual mensagem está no editor ao lado.
                      padding: '12px 14px', backgroundColor: tipoTemplateSelecionado === item.tipo && (!(isMobile || isTablet) || editorAberto) ? `${item.cor}08` : 'white',
                      borderRadius: '8px', border: tipoTemplateSelecionado === item.tipo && (!(isMobile || isTablet) || editorAberto) ? `2px solid ${item.cor}` : '1px solid #e5e7eb',
                      cursor: item.locked ? 'pointer' : (item.ativo ? 'pointer' : 'default'),
                      transition: 'all 0.2s', opacity: item.locked ? 0.7 : (!item.ativo ? 0.5 : 1),
                      minWidth: 0, boxSizing: 'border-box'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: `${item.cor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon icon={item.icone} width="20" style={{ color: item.cor }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {item.nome}
                          {item.locked && <span style={{ fontSize: '10px', fontWeight: '600', color: '#e65100', backgroundColor: '#fff3e0', padding: '1px 6px', borderRadius: '4px' }}>{(item.plano || 'Pro').toUpperCase()}</span>}
                          {templatesAgrupados[item.tipo] && item.ativo && !item.locked && <Icon icon="mdi:check-circle" width="14" style={{ color: '#4CAF50' }} />}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.descricao}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {(isMobile || isTablet) && item.ativo && !item.locked && !item.semTemplate && (
                        <Icon icon="mdi:chevron-right" width="20" aria-label="Editar mensagem" style={{ color: 'var(--color-text-muted)', order: 2 }} />
                      )}
                      {item.semToggle ? null : item.locked ? (
                        <button onClick={(e) => { e.stopPropagation(); setUpgradeModal({ isOpen: true, featureName: item.nome, plano: item.plano || 'Pro' }) }}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '12px', cursor: 'pointer', fontSize: '11px', fontWeight: '500', color: '#e65100' }}>
                          <Icon icon="mdi:lock" width="12" /> {item.plano || 'Pro'}
                        </button>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); item.toggle() }}
                          style={{ position: 'relative', width: '44px', height: '24px', backgroundColor: item.ativo ? '#4CAF50' : '#ccc', borderRadius: '12px', border: 'none', cursor: 'pointer', transition: 'background-color 0.3s', padding: 0 }}>
                          <div style={{ position: 'absolute', top: '2px', left: item.ativo ? '22px' : '2px', width: '20px', height: '20px', backgroundColor: 'white', borderRadius: '50%', transition: 'left 0.3s', border: '1px solid #e5e7eb' }} />
                        </button>
                      )}
                    </div>
                  </div>
                  </Fragment>
                ))}
              </div>

              {/* Como o aluno paga — só leitura. Quem decide é Configurações › Recebimentos
                  (fonte única desde a repaginada de dez/2026; ver services/metodoPagamento.js). */}
              {/* Só na categoria Cobranças: é a forma de pagamento que vai nas cobranças */}
              {categoriaAutomacao === 'cobrancas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {metodoPagamento === 'asaas_link' ? (
                  <Alert
                    variant="success"
                    icon="mdi:bank-outline"
                    title="Suas mensagens mandam o link de pagamento do Asaas"
                    action={<Button variant="outline" size="sm" onClick={() => navigate('/app/configuracao?aba=integracoes')}>Alterar</Button>}
                  >
                    O aluno escolhe Pix, cartão ou boleto, e a baixa acontece sozinha.
                  </Alert>
                ) : (chavePix || '').trim() ? (
                  <>
                    <Alert
                      variant="neutral"
                      icon="mdi:qrcode"
                      title={`Suas mensagens mandam: Pix (chave ••••${chavePix.trim().slice(-4)})`}
                      action={<Button variant="outline" size="sm" onClick={() => navigate('/app/configuracao?aba=integracoes')}>Alterar</Button>}
                    >
                      Para trocar a chave ou a forma de pagamento, vá em Configurações › Recebimentos.
                    </Alert>
                    <Alert
                      variant="info"
                      icon="mdi:lightbulb-on-outline"
                      title="Quer parar de dar baixa na mão?"
                      action={<Button variant="primary" size="sm" onClick={() => navigate('/app/configuracao?aba=integracoes')}>Conhecer o Asaas</Button>}
                    >
                      Com o Asaas o aluno paga por link (Pix, cartão ou boleto) e a baixa acontece sozinha.
                    </Alert>
                  </>
                ) : (
                  <Alert
                    variant="danger"
                    title="Suas cobranças estão saindo sem forma de pagamento"
                    action={<Button variant="danger" size="sm" onClick={() => navigate('/app/configuracao?aba=integracoes')}>Cadastrar agora</Button>}
                  >
                    Cadastre sua chave Pix ou conecte o Asaas em Configurações › Recebimentos.
                  </Alert>
                )}
              </div>
              )}

              {/* Configurações */}
              <details open={searchParams.get('config') === 'abrir'} style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <summary style={{ padding: '12px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#555', display: 'flex', alignItems: 'center', gap: '8px', listStyle: 'none' }}>
                  <Icon icon="mdi:cog-outline" width="16" style={{ color: '#888' }} />
                  Configurações
                  <Icon icon="mdi:chevron-down" width="16" style={{ color: '#888', marginLeft: 'auto' }} />
                </summary>
                <div style={{ padding: '0 14px 14px' }}>
                  {/* Enviar no domingo */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <Icon icon="mdi:calendar-weekend" width="20" style={{ color: '#7c3aed' }} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#344848' }}>Enviar no domingo</div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                          {enviarDomingoAtivo ? 'Mensagens enviadas normalmente' : 'Mensagens de domingo vão na segunda'}
                        </div>
                      </div>
                    </div>
                    <button onClick={toggleEnviarDomingo}
                      style={{ position: 'relative', width: '44px', height: '24px', backgroundColor: enviarDomingoAtivo ? '#4CAF50' : '#ccc', borderRadius: '12px', border: 'none', cursor: 'pointer', transition: 'background-color 0.3s', padding: 0, flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: '2px', left: enviarDomingoAtivo ? '22px' : '2px', width: '20px', height: '20px', backgroundColor: 'white', borderRadius: '50%', transition: 'left 0.3s', border: '1px solid #e5e7eb' }} />
                    </button>
                  </div>
                </div>
              </details>
            </div>

            {/* COLUNA DIREITA: Editor. No computador fica ao lado da lista (sticky);
                no celular/tablet o MESMO conteúdo abre em tela cheia ao tocar no cartão. */}
            {(() => {
              const editorEmJanela = isMobile || isTablet
              const salvoAtual = tipoTemplateSelecionado
                ? (templatesAgrupados[tipoTemplateSelecionado]
                    ? paraExibir(templatesAgrupados[tipoTemplateSelecionado].mensagem)
                    : paraExibir(getMensagemDefault(tipoTemplateSelecionado)))
                : ''
              const temAlteracao = (mensagemTemplate || '').trim() !== (salvoAtual || '').trim()
              const fecharEditor = () => { if (temAlteracao && !templateEditLocked) setConfirmDescartar(true); else setEditorAberto(false) }
              const conteudoEditor = (
              <>
              {!tipoTemplateSelecionado ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px dashed #ddd' }}>
                  <Icon icon="mdi:cursor-default-click" width="48" style={{ color: '#ccc', marginBottom: '12px' }} />
                  <p style={{ margin: 0, fontSize: '14px', color: '#999' }}>Selecione uma automação ativa para editar o template</p>
                </div>
              ) : (
                <>
                  {/* Aviso de bloqueio para Starter */}
                  {templateEditLocked && (
                    <div style={{ padding: '12px 16px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Icon icon="mdi:lock" width="20" style={{ color: '#ff9800', flexShrink: 0 }} />
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#e65100' }}>Template bloqueado para edição</span>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>Disponível apenas para planos Pro e Premium.</p>
                      </div>
                    </div>
                  )}

                  {!editorEmJanela && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: '600', color: '#344848' }}>
                        Mensagem
                      </h3>
                      <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Edite o template selecionado</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={restaurarMensagemPadrao}
                    disabled={templateEditLocked}
                    title="Restaurar Padrão"
                    style={{
                      padding: isSmallScreen ? '6px 8px' : '6px 12px',
                      backgroundColor: 'white',
                      border: '1px solid #e0e0e0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: templateEditLocked ? '#aaa' : '#666',
                      cursor: templateEditLocked ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: templateEditLocked ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!templateEditLocked) {
                        e.currentTarget.style.backgroundColor = '#f5f5f5'
                        e.currentTarget.style.borderColor = '#ccc'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!templateEditLocked) {
                        e.currentTarget.style.backgroundColor = 'white'
                        e.currentTarget.style.borderColor = '#e0e0e0'
                      }
                    }}
                  >
                    <Icon icon="material-symbols:refresh" width={isSmallScreen ? "18" : "14"} />
                    {!isSmallScreen && 'Restaurar Padrão'}
                  </button>
                  <button
                    onClick={() => setPreviewModalAberto(true)}
                    style={{
                      padding: isSmallScreen ? '6px 8px' : '6px 12px',
                      backgroundColor: 'white',
                      border: '1px solid #e0e0e0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#666',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f5f5f5'; e.currentTarget.style.borderColor = '#ccc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = '#e0e0e0' }}
                  >
                    <Icon icon="mdi:eye-outline" width={isSmallScreen ? "18" : "14"} />
                    {!isSmallScreen && 'Preview'}
                  </button>
                  <button
                    onClick={salvarTemplate}
                    disabled={templateEditLocked}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: templateEditLocked ? '#ccc' : '#25D366',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'white',
                      cursor: templateEditLocked ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: templateEditLocked ? 0.7 : 1
                    }}
                  >
                    <Icon icon={templateEditLocked ? 'mdi:lock' : 'mdi:content-save'} width="14" />
                    Salvar
                  </button>
                    </div>
                  </div>
                  )}

                <textarea
                  value={mensagemTemplate}
                  onChange={(e) => setMensagemTemplate(e.target.value)}
                  disabled={templateEditLocked}
                  style={{
                    width: '100%',
                    minHeight: isSmallScreen ? '200px' : '300px',
                    padding: '14px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    fontSize: '16px',
                    fontFamily: 'inherit',
                    lineHeight: '1.6',
                    resize: templateEditLocked ? 'none' : 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                    backgroundColor: templateEditLocked ? '#f5f5f5' : 'white',
                    cursor: templateEditLocked ? 'not-allowed' : 'text',
                    opacity: templateEditLocked ? 0.7 : 1
                  }}
                  placeholder="Digite sua mensagem aqui..."
                />

              <div style={{
                padding: '14px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                marginBottom: '16px'
              }}>
                <h5 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: '600', color: '#344848' }}>
                  Variáveis Disponíveis (clique para copiar):
                </h5>
                {tipoTemplateSelecionado !== 'birthday' && !TIPOS_AULA.includes(tipoTemplateSelecionado) && (
                  <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#6b7280', lineHeight: '1.4' }}>
                    A mensagem é enviada pro WhatsApp do responsável (quando cadastrado). Pra falar com o responsável citando o aluno, use <strong>{`{{nomeResponsavel}}`}</strong> + <strong>{`{{nomeAlunoReal}}`}</strong> {`— este sempre traz o nome do aluno (ex.: "Oi {{nomeResponsavel}}, sobre a mensalidade do {{nomeAlunoReal}}")`}.
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {tipoTemplateSelecionado === 'birthday' ? (
                    <>
                      {[
                        { var: '{{nomeAluno}}', bg: '#fce4ec', border: '#f48fb1', color: '#c2185b' },
                        { var: '{{nomeEmpresa}}', bg: '#fce4ec', border: '#f48fb1', color: '#c2185b' }
                      ].map(v => (
                        <code
                          key={v.var}
                          onClick={() => {
                            navigator.clipboard.writeText(v.var)
                            setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: `${v.var} copiado para a área de transferência` })
                          }}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: v.bg,
                            border: `1px solid ${v.border}`,
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: v.color,
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          {v.var}
                        </code>
                      ))}
                    </>
                  ) : TIPOS_AULA.includes(tipoTemplateSelecionado) ? (
                    <>
                      {[
                        { var: '{{nomeAluno}}', bg: '#e3f2fd', border: '#e0e0e0', color: '#8867A1' },
                        { var: '{{descricaoAula}}', bg: '#ede7f6', border: '#ce93d8', color: '#6a1b9a' },
                        { var: '{{horarioAula}}', bg: '#ede7f6', border: '#ce93d8', color: '#6a1b9a' },
                        ...(TIPOS_AULA_COM_DATA.includes(tipoTemplateSelecionado) ? [
                          { var: '{{dataAula}}', bg: '#ede7f6', border: '#ce93d8', color: '#6a1b9a' },
                          { var: '{{diaSemana}}', bg: '#ede7f6', border: '#ce93d8', color: '#6a1b9a' }
                        ] : []),
                        { var: '{{nomeEmpresa}}', bg: '#e3f2fd', border: '#e0e0e0', color: '#8867A1' }
                      ].map(v => (
                        <code
                          key={v.var}
                          onClick={() => {
                            navigator.clipboard.writeText(v.var)
                            setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: `${v.var} copiado para a área de transferência` })
                          }}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: v.bg,
                            border: `1px solid ${v.border}`,
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: v.color,
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          {v.var}
                        </code>
                      ))}
                    </>
                  ) : (
                    <>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{nomeAluno}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{nomeAluno}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e3f2fd',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#8867A1',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{nomeAluno}}`}
                      </code>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{nomeAlunoReal}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{nomeAlunoReal}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e3f2fd',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#8867A1',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{nomeAlunoReal}}`}
                      </code>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{nomeResponsavel}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{nomeResponsavel}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e3f2fd',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#8867A1',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{nomeResponsavel}}`}
                      </code>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{valorMensalidade}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{valorMensalidade}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e3f2fd',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#8867A1',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{valorMensalidade}}`}
                      </code>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{dataVencimento}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{dataVencimento}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e3f2fd',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#8867A1',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{dataVencimento}}`}
                      </code>
                      {tipoTemplateSelecionado === 'overdue' && (
                        <code
                          onClick={() => {
                            navigator.clipboard.writeText('{{diasAtraso}}')
                            setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{diasAtraso}} copiado para a área de transferência' })
                          }}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#ffebee',
                            border: '1px solid #e0e0e0',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#8867A1',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          {`{{diasAtraso}}`}
                        </code>
                      )}
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{nomeEmpresa}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{nomeEmpresa}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e3f2fd',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#8867A1',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{nomeEmpresa}}`}
                      </code>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{chavePix}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{chavePix}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e8f5e9',
                          border: '1px solid #81c784',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#2e7d32',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{chavePix}}`}
                      </code>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{linkPagamento}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{linkPagamento}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#fff3e0',
                          border: '1px solid #ffb74d',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#e65100',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                        title="Gera automaticamente um link de pagamento PIX com QR Code"
                      >
                        {`{{linkPagamento}}`}
                      </code>
                    </>
                  )}
                </div>
                {tipoTemplateSelecionado === 'birthday' && (
                  <p style={{ fontSize: '11px', color: '#E91E63', marginTop: '8px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
                    Variáveis exclusivas para mensagem de aniversário
                  </p>
                )}
                {TIPOS_AULA.includes(tipoTemplateSelecionado) && (
                  <p style={{ fontSize: '11px', color: '#6366f1', marginTop: '8px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
                    {tipoTemplateSelecionado === 'booking_confirmed'
                      ? 'Enviada ao aluno assim que ele marca a aula pelo seu link de agendamento'
                      : tipoTemplateSelecionado === 'class_reminder_24h'
                        ? 'Enviada 24h antes. Só para aula avulsa — quem tem turma fixa não recebe'
                        : 'Variáveis exclusivas para lembrete de aula'}
                  </p>
                )}
                {tipoTemplateSelecionado === 'payment_confirmed' && (
                  <p style={{ fontSize: '11px', color: '#4CAF50', marginTop: '8px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
                    Enviada automaticamente quando você marca uma mensalidade como paga
                  </p>
                )}
                {tipoTemplateSelecionado === 'welcome' && (
                  <p style={{ fontSize: '11px', color: '#8B5CF6', marginTop: '8px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
                    Enviada ao cadastrar novo aluno com boas-vindas ativada
                  </p>
                )}
                {tipoTemplateSelecionado !== 'overdue' && !TIPOS_AULA.includes(tipoTemplateSelecionado) && tipoTemplateSelecionado !== 'birthday' && tipoTemplateSelecionado !== 'payment_confirmed' && tipoTemplateSelecionado !== 'welcome' && (
                  <p style={{ fontSize: '11px', color: '#999', marginTop: '8px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
                    Nota: {`{{diasAtraso}}`} não está disponível para mensagens pré-vencimento
                  </p>
                )}
              </div>

                </>
              )}
              </>
              )

              if (!editorEmJanela) {
                return (
                  <div style={{ position: 'sticky', top: '20px', alignSelf: 'start' }}>
                    {conteudoEditor}
                  </div>
                )
              }

              return (
                <>
                  <Modal
                    isOpen={editorAberto && !!tipoTemplateSelecionado}
                    onClose={fecharEditor}
                    title={tituloTemplate || 'Mensagem'}
                    subtitle="Edite o texto que o aluno recebe"
                    size="lg"
                  >
                    <Modal.Body>{conteudoEditor}</Modal.Body>
                    <Modal.Footer>
                      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                        <Button
                          variant="outline"
                          icon="material-symbols:refresh"
                          title="Volta o texto para a mensagem padrão do Mensalli"
                          disabled={templateEditLocked}
                          onClick={restaurarMensagemPadrao}
                          style={{ flex: 1 }}
                        >
                          Restaurar padrão
                        </Button>
                        <Button
                          variant="primary"
                          icon={templateEditLocked ? 'mdi:lock' : 'mdi:content-save-outline'}
                          disabled={templateEditLocked}
                          onClick={salvarTemplate}
                          style={{ flex: 1 }}
                        >
                          Salvar
                        </Button>
                      </div>
                    </Modal.Footer>
                  </Modal>
                  <ConfirmModal
                    isOpen={confirmDescartar}
                    onClose={() => setConfirmDescartar(false)}
                    onConfirm={() => {
                      setMensagemTemplate(salvoAtual)
                      setConfirmDescartar(false)
                      setEditorAberto(false)
                    }}
                    title="Descartar alterações?"
                    message="Você mudou a mensagem e ainda não salvou. Se sair agora, a alteração se perde."
                    confirmText="Descartar"
                    cancelText="Continuar editando"
                    type="warning"
                  />
                </>
              )
            })()}
          </div>
        </div>
      )}


      {/* Modal de Preview WhatsApp */}
      {previewModalAberto && (
        <>
          <div
            onClick={() => setPreviewModalAberto(false)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 10000,
              animation: 'fadeIn 0.2s ease-out'
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
              zIndex: 10001,
              width: '90vw',
              maxWidth: '420px',
              animation: 'slideUp 0.3s ease-out'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#344848' }}>Preview da Mensagem</h4>
              <button
                onClick={() => setPreviewModalAberto(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
              >
                <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
              </button>
            </div>
            <div style={{
              backgroundColor: '#e5ddd5',
              backgroundImage: 'url(/whatsapp-bg.png)',
              backgroundSize: 'contain',
              backgroundRepeat: 'repeat',
              backgroundPosition: 'center',
              borderRadius: '8px',
              padding: '16px',
              maxHeight: '60vh',
              overflowY: 'auto'
            }}>
              <div style={{
                backgroundColor: '#dcf8c6',
                borderRadius: '8px',
                padding: '10px 14px',
                position: 'relative',
                maxWidth: '90%',
                marginLeft: 'auto',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                wordWrap: 'break-word'
              }}>
                <div style={{
                  position: 'absolute',
                  right: '-6px',
                  bottom: '6px',
                  width: '0', height: '0',
                  borderLeft: '8px solid #dcf8c6',
                  borderRight: '8px solid transparent',
                  borderTop: '4px solid transparent',
                  borderBottom: '4px solid transparent'
                }} />
                <div style={{
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: '#303030',
                  whiteSpace: 'pre-wrap',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                }}>
                  {gerarPreview(mensagemTemplate)}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: '#667781',
                  marginTop: '6px',
                  textAlign: 'right',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '4px'
                }}>
                  <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <Icon icon="mdi:check-all" width="16" height="16" style={{ color: '#53bdeb', display: 'block' }} />
                </div>
              </div>
            </div>
            <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#999', textAlign: 'center' }}>
              As variáveis foram substituídas por dados de exemplo
            </p>
          </div>
        </>
      )}

      {/* Modal de Feedback */}
      <ConfirmModal
        isOpen={feedbackModal.isOpen}
        onClose={() => setFeedbackModal({ ...feedbackModal, isOpen: false })}
        onConfirm={() => setFeedbackModal({ ...feedbackModal, isOpen: false })}
        title={feedbackModal.title}
        message={feedbackModal.message}
        confirmText="OK"
        cancelText=""
        type={feedbackModal.type}
      />

      {/* Modal de Confirmação de Desconexão */}
      <ConfirmModal
        isOpen={confirmDesconexaoModal}
        onClose={() => setConfirmDesconexaoModal(false)}
        onConfirm={() => {
          setConfirmDesconexaoModal(false)
          desconectar()
        }}
        title="Desconectar WhatsApp"
        message="Tem certeza que deseja desconectar o WhatsApp? As mensagens automáticas deixarão de ser enviadas."
        confirmText="Desconectar"
        cancelText="Cancelar"
        type="danger"
      />

      {/* Modal de Upgrade (Recurso Bloqueado) */}
      {upgradeModal.isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setUpgradeModal({ isOpen: false, featureName: '' })}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 10000,
              animation: 'fadeIn 0.2s ease-out'
            }}
          />

          {/* Modal */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
              zIndex: 10001,
              minWidth: '280px',
              maxWidth: '90vw',
              textAlign: 'center',
              animation: 'slideUp 0.3s ease-out'
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#fff3e0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto'
            }}>
              <Icon icon="mdi:lock" width="24" height="24" style={{ color: '#ff9800' }} />
            </div>

            <h4 style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a'
            }}>
              Recurso Bloqueado
            </h4>

            <p style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: '#666',
              lineHeight: '1.5'
            }}>
              <strong>{upgradeModal.featureName}</strong> está disponível no plano <strong>{upgradeModal.plano || 'Pro'}</strong>{upgradeModal.plano === 'Premium' ? '.' : ' ou superior.'}
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setUpgradeModal({ isOpen: false, featureName: '' })}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#666',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  minWidth: '100px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5'
                  e.currentTarget.style.borderColor = '#ccc'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                  e.currentTarget.style.borderColor = '#e0e0e0'
                }}
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  setUpgradeModal({ isOpen: false, featureName: '' })
                  navigate('/app/configuracao?aba=assinatura')
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ff9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  minWidth: '100px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f57c00'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ff9800'
                }}
              >
                <Icon icon="mdi:rocket-launch" width="16" height="16" />
                Fazer Upgrade
              </button>
            </div>
          </div>

          <style>
            {`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideUp {
                from { transform: translate(-50%, -50%) translateY(20px); opacity: 0; }
                to { transform: translate(-50%, -50%) translateY(0); opacity: 1; }
              }
            `}
          </style>
        </>
      )}

      {/* ===== ABA CAMPANHAS ===== */}
      {activeTab === 'campanhas' && (() => {
        if (isLocked('premium')) {
          return (
            <EmptyState
              variant="forbidden"
              icon="mdi:bullhorn-outline"
              size="large"
              title="Campanhas de WhatsApp"
              description="Mande uma mensagem para vários alunos de uma vez: avisos, promoções e comunicados. Disponível no plano Premium."
              action={<Button variant="primary" onClick={() => navigate('/app/configuracao?aba=assinatura')}>Ver planos</Button>}
            />
          )
        }

        return <CampanhasContent contextUserId={contextUserId} isSmallScreen={isSmallScreen} whatsappStatus={status} irParaConexao={() => setActiveTab('conexao')} />
      })()}

      {/* ===== ABA CENTRAL DE MENSAGENS (admin-only nesta fase) ===== */}
      {/* Só monta depois do contexto resolvido: enquanto carrega, isAdmin é
          false por padrão e o admin veria um "não liberada" piscando. */}
      {activeTab === 'mensagens' && !loadingUser && (
        <CentralMensagens
          isAdmin={isAdmin}
          irParaConexao={() => setActiveTab('conexao')}
          recarregarToken={recarregarMensagens}
        />
      )}

      {/* ===== ABA BOT WHATSAPP ===== */}
      {activeTab === 'bot' && (() => {
        if (isLocked('premium')) {
          return (
            <EmptyState
              variant="forbidden"
              icon="mdi:robot-happy-outline"
              size="large"
              title="Bot WhatsApp"
              description="Atendimento automático com menu de opções: seus alunos consultam a mensalidade, os horários e agendam sozinhos. Disponível no plano Premium."
              action={<Button variant="primary" onClick={() => navigate('/app/configuracao?aba=assinatura')}>Ver planos</Button>}
            />
          )
        }

        const textosMudaram = !!textosBotSalvos && (
          botSaudacao !== textosBotSalvos.saudacao ||
          botLeadSaudacao !== textosBotSalvos.lead ||
          botTextoConhecer !== textosBotSalvos.conhecer
        )

        const catalogoAluno = [
          { key: 'mensalidade', icon: 'mdi:cash', titulo: 'Minha mensalidade', desc: 'Mostra valor e vencimento da próxima mensalidade pendente' },
          { key: 'horarios', icon: 'mdi:calendar-clock', titulo: 'Horários das aulas', desc: 'Lista todos os horários da grade fixa' },
          { key: 'pix', icon: 'mdi:qrcode', titulo: '2ª via do Pix', desc: 'Manda o Pix copia e cola direto no WhatsApp' },
          { key: 'agendar', icon: 'mdi:calendar-plus', titulo: 'Agendar aula', desc: 'Manda o link do agendamento online (se ativado)' },
          { key: 'atendente', icon: 'mdi:account-tie', titulo: 'Falar com atendente', desc: 'Pausa o bot por 30 minutos para você atender', obrigatorio: true }
        ]
        const ativosAluno = catalogoAluno.filter(c => c.obrigatorio || botOpcoesAtivas[c.key] !== false)

        const catalogoLead = [
          { key: 'conhecer', icon: 'mdi:school-outline', titulo: 'Conhecer as aulas', desc: 'Manda a apresentação (abaixo) e o link da aula experimental' },
          { key: 'valores', icon: 'mdi:tag-outline', titulo: 'Saber valores', desc: 'Lista os planos cadastrados com preços' },
          { key: 'experimental', icon: 'mdi:gift-outline', titulo: 'Aula experimental', desc: 'Manda o link de agendamento direto' },
          { key: 'outro', icon: 'mdi:dots-horizontal', titulo: 'Outro assunto', desc: 'Avisa você e pausa o bot', obrigatorio: true }
        ]
        const ativosLead = catalogoLead.filter(c => c.obrigatorio || botLeadOpcoesAtivas[c.key] !== false)

        const listaOpcoes = (catalogo, ativos, opcoesAtivasObj, toggleFn) => (
          <div className="bot-opcoes">
            {catalogo.map(opt => {
              const ativo = opt.obrigatorio || opcoesAtivasObj[opt.key] !== false
              const numero = ativo ? (ativos.findIndex(a => a.key === opt.key) + 1) : null
              return (
                <div key={opt.key} className={`bot-opcao${ativo ? '' : ' bot-opcao--off'}`}>
                  <span className="bot-opcao__num" aria-hidden="true">{numero || '—'}</span>
                  <Icon icon={opt.icon} width="18" className="bot-opcao__icone" aria-hidden="true" />
                  <span className="bot-opcao__texto">
                    <span className="bot-opcao__titulo">{opt.titulo}</span>
                    <span className="bot-opcao__desc">{opt.desc}</span>
                  </span>
                  {opt.obrigatorio ? (
                    <span className="bot-opcao__sempre">sempre</span>
                  ) : (
                    <Switch
                      size="sm"
                      checked={ativo}
                      disabled={salvandoBot}
                      onChange={() => toggleFn(opt.key)}
                      aria-label={`${ativo ? 'Desligar' : 'Ligar'} a opção ${opt.titulo}`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Ligar o bot */}
            <Card padding={isSmallScreen ? 'default' : 'spacious'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{
                  width: 44, height: 44, borderRadius: 'var(--radius-xl)', flexShrink: 0,
                  backgroundColor: 'var(--mensalli-green-50)', color: 'var(--color-brand-fill)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                }} aria-hidden="true">
                  <Icon icon="mdi:robot-happy-outline" width="26" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 className="ds-text-h4" style={{ margin: 0, color: 'var(--color-text-primary)' }}>Bot de atendimento</h2>
                  <p className="ds-text-body-sm" style={{ margin: '2px 0 0', color: 'var(--color-text-secondary)' }}>
                    Quando alguém manda mensagem, o bot responde na hora com um menu de opções.
                  </p>
                </div>
                <Switch
                  size="lg"
                  checked={botAtivo}
                  disabled={salvandoBot}
                  onChange={toggleBot}
                  aria-label={botAtivo ? 'Desligar o bot' : 'Ligar o bot'}
                />
              </div>
              {status !== 'connected' && (
                <Alert
                  variant="warning"
                  style={{ marginTop: '16px' }}
                  action={<Button variant="outline" size="sm" onClick={() => setActiveTab('conexao')}>Ir para Conexão</Button>}
                >
                  Conecte o WhatsApp antes de ligar o bot.
                </Alert>
              )}
            </Card>

            {/* Menu para alunos */}
            <details className="bot-secao" open={!isSmallScreen}>
              <summary>
                <Icon icon="mdi:account-outline" width="20" aria-hidden="true" />
                <span className="bot-secao__titulo">
                  Menu para alunos
                  <span className="bot-secao__sub">{ativosAluno.length} opções no menu</span>
                </span>
                <Icon icon="mdi:chevron-down" width="20" className="bot-secao__seta" aria-hidden="true" />
              </summary>
              <div className="bot-secao__corpo">
                <p className="ds-text-body-sm" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                  Quando um aluno cadastrado manda mensagem, o bot envia este menu. Desligue o que você não quer oferecer; a numeração se ajusta sozinha.
                </p>
                {listaOpcoes(catalogoAluno, ativosAluno, botOpcoesAtivas, toggleBotOpcao)}
                <Textarea
                  label="Saudação para alunos"
                  helper="Aparece antes do menu. Use {{nomeCliente}} e {{nomeEmpresa}}."
                  value={botSaudacao}
                  onChange={(e) => setBotSaudacao(e.target.value)}
                  rows={3}
                />
              </div>
            </details>

            {/* Menu para novos alunos (leads) */}
            <details className="bot-secao" open={!isSmallScreen}>
              <summary>
                <Icon icon="mdi:account-plus-outline" width="20" aria-hidden="true" />
                <span className="bot-secao__titulo">
                  Menu para novos alunos
                  <span className="bot-secao__sub">{ativosLead.length} opções · vira lead no CRM</span>
                </span>
                <Icon icon="mdi:chevron-down" width="20" className="bot-secao__seta" aria-hidden="true" />
              </summary>
              <div className="bot-secao__corpo">
                <p className="ds-text-body-sm" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                  Quando alguém que ainda não é aluno manda mensagem, o bot pergunta o interesse, cria um lead no CRM e te avisa aqui no WhatsApp.
                </p>
                {listaOpcoes(catalogoLead, ativosLead, botLeadOpcoesAtivas, toggleBotLeadOpcao)}
                <Textarea
                  label="Saudação para novos alunos"
                  helper="Aparece antes do menu. Use {{nomeCliente}} e {{nomeEmpresa}}."
                  value={botLeadSaudacao}
                  onChange={(e) => setBotLeadSaudacao(e.target.value)}
                  rows={3}
                />
                <Textarea
                  label='Apresentação da opção "Conhecer as aulas"'
                  helper="Depois dela o bot manda o link da aula experimental. Em branco, ele manda a grade de horários. Use {{nomeEmpresa}}."
                  value={botTextoConhecer}
                  onChange={(e) => setBotTextoConhecer(e.target.value)}
                  rows={5}
                  placeholder="Ex.: Somos a {{nomeEmpresa}} e trabalhamos com pilates há 10 anos, com aulas personalizadas e um ambiente acolhedor."
                />
                <Alert
                  variant="info"
                  icon="mdi:account-group-outline"
                  title="Os leads aparecem no seu CRM"
                  action={<Button variant="outline" size="sm" onClick={() => navigate('/app/crm')}>Ver CRM</Button>}
                >
                  Quem o bot captar cai sozinho no quadro de leads.
                </Alert>
              </div>
            </details>

            {/* Um "Salvar" para os três textos, só quando algo mudou */}
            {textosMudaram && (
              <div className="bot-salvar">
                <span className="ds-text-body-sm" style={{ flex: 1, color: 'var(--color-text-secondary)' }}>Você mudou textos do bot.</span>
                <Button variant="ghost" size="sm" onClick={descartarTextosBot} disabled={salvandoBot}>Descartar</Button>
                <Button variant="primary" size="sm" icon="mdi:content-save-outline" loading={salvandoBot} onClick={salvarTextosBot}>Salvar textos</Button>
              </div>
            )}

            <style>{`
              .bot-secao { background: var(--color-bg-surface); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-xl); }
              .bot-secao > summary {
                display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 12px 16px;
                cursor: pointer; list-style: none; color: var(--color-text-primary);
              }
              .bot-secao > summary::-webkit-details-marker { display: none; }
              .bot-secao > summary:focus-visible { outline: none; box-shadow: inset var(--focus-ring); border-radius: var(--radius-xl); }
              .bot-secao__titulo { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: var(--text-md); font-weight: var(--weight-semibold); }
              .bot-secao__sub { font-size: var(--text-xs); font-weight: 400; color: var(--color-text-muted); }
              .bot-secao__seta { color: var(--color-text-muted); transition: transform var(--duration-150) var(--ease-out); }
              .bot-secao[open] .bot-secao__seta { transform: rotate(180deg); }
              .bot-secao__corpo { display: flex; flex-direction: column; gap: 16px; padding: 0 16px 16px; }
              .bot-opcoes { display: flex; flex-direction: column; gap: 8px; }
              .bot-opcao {
                display: flex; align-items: center; gap: 10px; padding: 10px 12px;
                background: var(--neutral-50); border-radius: var(--radius-lg);
              }
              .bot-opcao--off { opacity: 0.55; }
              .bot-opcao__num {
                width: 26px; height: 26px; flex-shrink: 0; border-radius: var(--radius-md);
                background: var(--color-bg-surface); border: 1px solid var(--color-border-subtle);
                display: inline-flex; align-items: center; justify-content: center;
                font-size: var(--text-sm); font-weight: var(--weight-bold); color: var(--color-brand-fill);
              }
              .bot-opcao__icone { color: var(--color-text-secondary); flex-shrink: 0; }
              .bot-opcao__texto { flex: 1; min-width: 0; display: flex; flex-direction: column; }
              .bot-opcao__titulo { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--color-text-primary); }
              .bot-opcao__desc { font-size: var(--text-xs); color: var(--color-text-muted); line-height: 1.35; }
              .bot-opcao__sempre { font-size: var(--text-2xs); color: var(--color-text-muted); font-style: italic; flex-shrink: 0; }
              .bot-salvar {
                position: sticky; bottom: 8px; z-index: var(--z-sticky);
                display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
                padding: 10px 12px; background: var(--color-bg-surface);
                border: 1px solid var(--color-border-default); border-radius: var(--radius-xl);
                box-shadow: var(--shadow-lg);
              }
            `}</style>
          </div>
        )
      })()}
    </div>
  )
}
