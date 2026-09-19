// Fila "Aguardando aprovação" da tela de Alunos + modal do link de cadastro.
//
// Pendente = devedor com experimental = true (sem plano, sem mensalidade).
// Chegam por dois caminhos:
//   origem 'autocadastro' -> aluno preencheu a ficha pelo link /cadastro/:slug
//   origem 'agendamento'  -> aluno experimental do link de agendamento
//
// Aprovar não acontece aqui: devolve o devedor para o Clientes.js abrir o
// modal de Novo aluno já preenchido (onAprovar). Recusar arquiva, igual ao
// "Descartar" do CRM.
import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import { showToast } from '../Toast'
import Modal, { ConfirmDialog } from '../design-system/components/Modal'
import Button from '../design-system/components/Button'
import Badge from '../design-system/components/Badge'
import Switch from '../design-system/components/Switch'
import { formatarTelefone } from '../utils/validators'

// Experimental do agendamento entra na fila só se for recente: os antigos
// parados continuam no CRM e não viram uma faixa de "179 aguardando".
const DIAS_EXPERIMENTAL_NA_FILA = 30

const MS_DIA = 24 * 60 * 60 * 1000

const diasEntre = (isoData, hoje) =>
  Math.round((new Date(isoData + 'T00:00:00') - hoje) / MS_DIA)

function idade(dataNascimento) {
  if (!dataNascimento) return null
  const n = new Date(dataNascimento + 'T12:00:00')
  const h = new Date()
  let anos = h.getFullYear() - n.getFullYear()
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) anos--
  return anos
}

function quandoChegou(createdAt) {
  const dias = Math.floor((Date.now() - new Date(createdAt).getTime()) / MS_DIA)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

// Mesma leitura do CRM: próxima aula confirmada, senão a última que passou
function situacaoAula(agendamentos) {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const confirmados = (agendamentos || []).filter(a => a.status === 'confirmado')
  const futuros = confirmados.filter(a => diasEntre(a.data, hoje) >= 0).sort((a, b) => a.data.localeCompare(b.data))
  if (futuros.length) {
    const d = diasEntre(futuros[0].data, hoje)
    return d === 0 ? 'Aula hoje' : d === 1 ? 'Aula amanhã' : `Aula em ${d} dias`
  }
  const passados = confirmados.sort((a, b) => b.data.localeCompare(a.data))
  if (passados.length) {
    const d = -diasEntre(passados[0].data, hoje)
    return d === 0 ? 'Fez aula hoje' : d === 1 ? 'Fez aula ontem' : `Fez aula há ${d} dias`
  }
  return 'Não marcou aula'
}

export async function carregarPendentes(userId) {
  // Só a data (AAAA-MM-DD): hora ISO tem "." e ":" que complicam o filtro .or()
  const corte = new Date(Date.now() - DIAS_EXPERIMENTAL_NA_FILA * MS_DIA).toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('devedores')
    .select('id, nome, telefone, email, cpf, data_nascimento, responsavel_nome, responsavel_telefone, cep, endereco, numero, complemento, bairro, cidade, estado, tags, origem, created_at')
    .eq('user_id', userId)
    .eq('experimental', true)
    .or('lixo.is.null,lixo.eq.false')
    .or(`origem.eq.autocadastro,created_at.gte.${corte}`)
    .order('created_at', { ascending: false })

  if (error) throw error
  const pendentes = data || []

  const idsExperimentais = pendentes.filter(p => p.origem !== 'autocadastro').map(p => p.id)
  let porDevedor = {}
  if (idsExperimentais.length) {
    const { data: ags } = await supabase
      .from('agendamentos')
      .select('devedor_id, data, status')
      .in('devedor_id', idsExperimentais)
    porDevedor = (ags || []).reduce((acc, a) => {
      (acc[a.devedor_id] = acc[a.devedor_id] || []).push(a)
      return acc
    }, {})
  }

  return pendentes.map(p => ({
    ...p,
    situacao: p.origem === 'autocadastro' ? null : situacaoAula(porDevedor[p.id])
  }))
}

// Recusar = mesmo efeito do "Descartar" do CRM: arquiva o aluno, marca o
// lead como perdido e limpa vínculos da Agenda (senão sobram órfãos).
async function recusarPendente(devedorId) {
  await supabase.from('devedores').update({
    lixo: true,
    deletado_em: new Date().toISOString()
  }).eq('id', devedorId)

  await Promise.all([
    supabase.from('leads').update({ status: 'perdido' }).eq('convertido_em_devedor_id', devedorId),
    supabase.from('aulas_fixos').delete().eq('devedor_id', devedorId),
    supabase.from('agendamentos').delete().eq('devedor_id', devedorId).eq('status', 'confirmado'),
    supabase.from('aulas').update({ ativo: false }).eq('devedor_id', devedorId)
  ])
}

export default function AprovacaoCadastros({
  userId, nomeEmpresa, isSmallScreen, onAprovar, recarregar, mostrarLink, onFecharLink,
  abrirLista, onListaAberta // ?aprovacao=1 (vindo do sino): abre a fila direto
}) {
  const [pendentes, setPendentes] = useState([])
  const [carregou, setCarregou] = useState(false)
  const [mostrarLista, setMostrarLista] = useState(false)
  const [recusando, setRecusando] = useState(null) // devedor em confirmação
  const [processandoRecusa, setProcessandoRecusa] = useState(false)

  // Link de cadastro
  const [linkConfig, setLinkConfig] = useState({ slug: '', ativo: false, carregado: false })
  const [salvandoLink, setSalvandoLink] = useState(false)

  const atualizar = useCallback(async () => {
    if (!userId) return
    try {
      setPendentes(await carregarPendentes(userId))
    } catch (err) {
      console.error('Erro ao carregar cadastros pendentes:', err)
    } finally {
      setCarregou(true)
    }
  }, [userId])

  useEffect(() => { atualizar() }, [atualizar, recarregar])

  useEffect(() => {
    if (!abrirLista || !carregou) return
    if (pendentes.length > 0) setMostrarLista(true)
    onListaAberta()
  }, [abrirLista, carregou, pendentes.length, onListaAberta])

  // Some a lista quando ela esvazia (último aprovado/recusado)
  useEffect(() => {
    if (mostrarLista && pendentes.length === 0) setMostrarLista(false)
  }, [pendentes.length, mostrarLista])

  useEffect(() => {
    if (!mostrarLink || !userId || linkConfig.carregado) return
    supabase
      .from('usuarios')
      .select('agendamento_slug, autocadastro_ativo')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => setLinkConfig({
        slug: data?.agendamento_slug || '',
        ativo: !!data?.autocadastro_ativo,
        carregado: true
      }))
  }, [mostrarLink, userId, linkConfig.carregado])

  const link = linkConfig.slug ? `${window.location.origin}/cadastro/${linkConfig.slug}` : ''

  const alternarLink = async (ativar) => {
    setSalvandoLink(true)
    try {
      let slug = linkConfig.slug
      // O link usa o mesmo endereço do agendamento; quem nunca configurou
      // agendamento ganha um agora, a partir do nome da empresa.
      if (ativar && !slug) {
        if (!nomeEmpresa) {
          showToast('Preencha o nome da empresa em Configurações primeiro', 'warning')
          return
        }
        const { data, error } = await supabase.rpc('gerar_agendamento_slug', { nome_empresa: nomeEmpresa })
        if (error || !data) throw error || new Error('Não foi possível gerar o link')
        slug = data
      }
      const { error } = await supabase
        .from('usuarios')
        .update({ autocadastro_ativo: ativar, ...(slug !== linkConfig.slug ? { agendamento_slug: slug } : {}) })
        .eq('id', userId)
      if (error) throw error
      setLinkConfig(c => ({ ...c, slug, ativo: ativar }))
      showToast(ativar ? 'Link de cadastro ativado!' : 'Link de cadastro desativado', 'success')
    } catch (err) {
      console.error('Erro ao salvar link de cadastro:', err)
      showToast('Erro ao salvar: ' + (err?.message || 'tente de novo'), 'error')
    } finally {
      setSalvandoLink(false)
    }
  }

  const copiarLink = () => {
    navigator.clipboard.writeText(link)
      .then(() => showToast('Link copiado!', 'success'))
      .catch(() => showToast('Não foi possível copiar', 'error'))
  }

  const mensagemWhatsApp = `Olá! Para fazer sua matrícula${nomeEmpresa ? ` na ${nomeEmpresa}` : ''}, preencha sua ficha neste link: ${link}`

  const confirmarRecusa = async () => {
    if (!recusando) return
    setProcessandoRecusa(true)
    try {
      await recusarPendente(recusando.id)
      showToast(`Cadastro de ${recusando.nome} recusado`, 'success')
      setRecusando(null)
      atualizar()
    } catch (err) {
      showToast('Erro ao recusar: ' + err.message, 'error')
    } finally {
      setProcessandoRecusa(false)
    }
  }

  const aprovar = (p) => {
    setMostrarLista(false)
    onAprovar(p)
  }

  return (
    <>
      {/* Faixa no topo da tela de Alunos */}
      {pendentes.length > 0 && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setMostrarLista(true)}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setMostrarLista(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
            marginBottom: '16px', backgroundColor: '#fffbeb', border: '1px solid #fde68a',
            borderRadius: '10px', cursor: 'pointer'
          }}
        >
          <Icon icon="mdi:account-clock-outline" width="22" style={{ color: '#d97706', flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: '14px', color: '#92400e' }}>
            <strong>{pendentes.length} {pendentes.length === 1 ? 'cadastro aguardando' : 'cadastros aguardando'} aprovação</strong>
            {!isSmallScreen && <span style={{ color: '#b45309' }}> · aprove e escolha o plano</span>}
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#d97706', display: 'flex', alignItems: 'center', gap: '2px' }}>
            Ver <Icon icon="mdi:chevron-right" width="18" />
          </span>
        </div>
      )}

      {/* Lista de pendentes */}
      <Modal
        isOpen={mostrarLista}
        onClose={() => setMostrarLista(false)}
        title="Aguardando aprovação"
        subtitle="Aprove para escolher o plano e o vencimento"
        size={isSmallScreen ? 'fullscreen' : 'md'}
      >
        <Modal.Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pendentes.map(p => {
              const anos = idade(p.data_nascimento)
              const contato = p.responsavel_nome
                ? `Resp.: ${p.responsavel_nome} · ${formatarTelefone(p.responsavel_telefone || p.telefone)}`
                : formatarTelefone(p.telefone)
              return (
                <div key={p.id} style={{
                  border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px',
                  display: 'flex', flexDirection: isSmallScreen ? 'column' : 'row',
                  alignItems: isSmallScreen ? 'stretch' : 'center', gap: '10px'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '15px', color: '#111827' }}>{p.nome}</span>
                      {p.origem === 'autocadastro'
                        ? <Badge variant="info" icon="mdi:file-document-edit-outline">Link de cadastro</Badge>
                        : <Badge variant="warning" icon="mdi:run">Experimental</Badge>}
                    </div>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                      {contato}
                      {anos !== null && ` · Nasc. ${p.data_nascimento.split('-').reverse().join('/')} (${anos} anos)`}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                      {p.situacao ? `${p.situacao} · ` : ''}chegou {quandoChegou(p.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <Button variant="outline" size="sm" onClick={() => setRecusando(p)} style={{ flex: isSmallScreen ? 1 : 'none' }}>
                      Recusar
                    </Button>
                    <Button variant="primary" size="sm" icon="mdi:check" onClick={() => aprovar(p)} style={{ flex: isSmallScreen ? 1 : 'none' }}>
                      Aprovar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Modal.Body>
      </Modal>

      <ConfirmDialog
        isOpen={!!recusando}
        onClose={() => setRecusando(null)}
        onConfirm={confirmarRecusa}
        loading={processandoRecusa}
        title={`Recusar ${recusando?.nome || ''}?`}
        description="O cadastro vai para a lixeira e sai da fila. O aluno não recebe nenhuma mensagem."
        confirmLabel="Recusar"
        variant="danger"
      />

      {/* Link de cadastro */}
      <Modal
        isOpen={mostrarLink}
        onClose={onFecharLink}
        title="Link de cadastro"
        subtitle="O aluno preenche a ficha e você só aprova e escolhe o plano"
        size="md"
      >
        <Modal.Body>
          {!linkConfig.carregado ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>
              <Icon icon="eos-icons:loading" width="24" />
            </div>
          ) : (
            <>
              <Switch
                checked={linkConfig.ativo}
                disabled={salvandoLink}
                onChange={e => alternarLink(e.target.checked)}
                label="Link ativo"
                description="Desligado, quem abrir o link vê um aviso de link desativado"
              />

              {linkConfig.ativo && link && (
                <>
                  <div style={{
                    marginTop: '18px', padding: '12px 14px', backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px',
                    color: '#111827', wordBreak: 'break-all'
                  }}>
                    {link}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexDirection: isSmallScreen ? 'column' : 'row' }}>
                    <Button variant="outline" icon="mdi:content-copy" onClick={copiarLink} style={{ flex: 1 }}>
                      Copiar link
                    </Button>
                    <Button
                      variant="primary"
                      icon="mdi:whatsapp"
                      onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(mensagemWhatsApp)}`, '_blank', 'noopener')}
                      style={{ flex: 1 }}
                    >
                      Enviar no WhatsApp
                    </Button>
                  </div>
                </>
              )}

              <div style={{
                marginTop: '18px', padding: '12px 14px', backgroundColor: '#eef2ff',
                border: '1px solid #c7d2fe', borderRadius: '8px', fontSize: '13px',
                color: '#4338ca', lineHeight: 1.5, display: 'flex', gap: '8px'
              }}>
                <Icon icon="mdi:information-outline" width="18" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  O aluno preenche nome, nascimento, WhatsApp e, se quiser, e-mail, CPF e endereço.
                  O cadastro aparece no topo desta tela em <strong>Aguardando aprovação</strong> e
                  você recebe um aviso no WhatsApp. Nada é cobrado antes de você aprovar.
                </span>
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>
    </>
  )
}
