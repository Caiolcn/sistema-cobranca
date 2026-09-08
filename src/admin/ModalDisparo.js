import { useState, useEffect, useMemo, useRef } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import whatsappService from '../services/whatsappService'
import Modal from '../design-system/components/Modal'
import Button from '../design-system/components/Button'
import Select from '../design-system/components/Select'
import SearchInput from '../design-system/components/SearchInput'
import Checkbox from '../design-system/components/Checkbox'
import Badge from '../design-system/components/Badge'
import { showError } from '../Toast'
import { formatarData, nomeDaConta, telefoneDaConta } from './ciclo'

/* ============================================================
   Disparo em lote (lembretes de vencimento e recuperação)

   Dois caminhos, escolhidos pelo grupo:
     venc_*        → envio direto pela Evolution (instância mensalli_master),
                     um a cada 15s, com o texto editável aqui.
     trial / churn → webhook do n8n, com oferta escolhida no momento.

   Correção de robustez no caminho direto: o log de cada envio é gravado NA
   HORA, não só no fim do laço. Antes, fechar a aba no meio de um disparo de 40
   contas perdia o registro dos 40 — e no dia seguinte ninguém sabia quem já
   tinha sido avisado. Também ganhou botão de parar, que antes não existia.
   ============================================================ */

const INSTANCIA_MENSALLI = 'mensalli_master'
const INTERVALO_ENVIO_MS = 15000

const TEMPERATURAS = {
  quente: { label: 'QUENTE', icon: 'mdi:fire', variant: 'danger' },
  morno: { label: 'MORNO', icon: 'mdi:thermometer', variant: 'warning' },
  frio: { label: 'FRIO', icon: 'mdi:snowflake', variant: 'default' },
}

// Os textos de vencimento moram em `templates_admin` no banco — é de lá que a
// cobrança automática das 9h (edge function cobranca-saas) lê. O disparo manual
// desta tela lê do MESMO lugar, senão as duas cópias divergem e você edita uma
// achando que arrumou as duas.
//
// Isto aqui é só o fallback de primeira carga (conta nova, template ainda não
// semeado). Se aparecer na tela, é sinal de que a linha sumiu da tabela.
const FALLBACK_LEMBRETE = {
  venc_d3: 'Oi {{nome}}! Sua mensalidade do Mensalli vence em {{dias}} dias ({{vencimento}}). Plano {{plano}} · R$ {{valor}}. Renove em segundos clicando no link abaixo: https://www.mensalli.com.br/app/assinatura?renovar=1',
  venc_hoje: 'Oi {{nome}}! Sua mensalidade do Mensalli vence hoje ({{vencimento}}). Plano {{plano}} · R$ {{valor}}. Renove em segundos clicando no link abaixo: https://www.mensalli.com.br/app/assinatura?renovar=1',
  venc_vencido: 'Oi {{nome}}! Sua mensalidade do Mensalli venceu em {{vencimento}} e ainda não identifiquei o pagamento. Plano {{plano}} · R$ {{valor}}. Reative em segundos clicando no link abaixo: https://www.mensalli.com.br/app/assinatura?renovar=1',
}

const OFERTAS = {
  trial: [
    { value: 'extensao_7_dias', label: 'Extensão de 7 dias' },
    { value: 'extensao_14_dias', label: 'Extensão de 14 dias' },
    { value: 'desconto_50_1mes', label: '50% off no 1º mês' },
    { value: 'desconto_30_3meses', label: '30% off por 3 meses' },
  ],
  churn: [
    { value: 'extensao_7_dias', label: '7 dias grátis pra voltar' },
    { value: 'extensao_14_dias', label: '14 dias grátis pra voltar' },
    { value: 'desconto_50_proximo_mes', label: '50% off no próximo mês' },
    { value: 'desconto_30_proximo_mes', label: '30% off no próximo mês' },
  ],
}

const GRUPO_VISUAL = {
  trial: { titulo: 'Recuperar trials expirados', icon: 'mdi:rocket-launch' },
  churn: { titulo: 'Reativar ex-pagantes', icon: 'mdi:account-reactivate' },
  venc_d3: { titulo: 'Lembrete — vence em até 3 dias', icon: 'mdi:calendar-arrow-right' },
  venc_hoje: { titulo: 'Lembrete — vence hoje', icon: 'mdi:calendar-today' },
  venc_vencido: { titulo: 'Lembrete — plano vencido', icon: 'mdi:calendar-alert' },
}

// Lembretes não gravam flag de "já enviei": eles se repetem a cada ciclo de
// vencimento. Recuperação grava, para não bombardear a mesma conta.
const META_GRUPO = {
  trial: { tipoLog: 'retencao_b', flag: 'retencao_b_enviado_em', rotulo: 'Recuperação trial' },
  churn: { tipoLog: 'retencao_c1', flag: 'retencao_c1_enviado_em', rotulo: 'Reativação ex-pagante' },
  venc_d3: { tipoLog: 'venc_d3', flag: null, rotulo: 'Lembrete vencimento (3 dias antes)' },
  venc_hoje: { tipoLog: 'venc_hoje', flag: null, rotulo: 'Lembrete vencimento (hoje)' },
  venc_vencido: { tipoLog: 'venc_vencido', flag: null, rotulo: 'Lembrete vencimento (vencido)' },
}

function diasAteVencimento(iso) {
  if (!iso) return null
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const venc = new Date(iso); venc.setHours(0, 0, 0, 0)
  if (isNaN(venc.getTime())) return null
  return Math.round((venc - hoje) / (1000 * 60 * 60 * 24))
}

export default function ModalDisparo({
  disparo, onClose, onConcluido, userId, chavePix,
  precoDoPlano, nomeDoPlano, isSmallScreen,
}) {
  const grupo = disparo?.grupo
  const lista = useMemo(() => disparo?.lista || [], [disparo])
  const ehLembrete = !!grupo && grupo.startsWith('venc_')

  const [selecionados, setSelecionados] = useState(new Set())
  const [busca, setBusca] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [oferta, setOferta] = useState('extensao_14_dias')
  const [enviando, setEnviando] = useState(false)
  const [progresso, setProgresso] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [carregandoTemplate, setCarregandoTemplate] = useState(false)
  const abortar = useRef(false)

  useEffect(() => {
    if (!disparo) return
    // Nasce com todo mundo marcado: o admin abriu o modal a partir de um bucket
    // que ele já decidiu disparar. Desmarcar exceção é mais rápido que marcar 40.
    setSelecionados(new Set(lista.map(c => c.id)))
    setBusca('')
    setMensagem('')
    setOferta('extensao_14_dias')
    setProgresso(null)
    setResultado(null)
    abortar.current = false
  }, [disparo, lista])

  // Busca o texto em templates_admin — a MESMA linha que a cobrança automática
  // das 9h usa. Editar o template lá dentro passa a valer aqui na hora.
  useEffect(() => {
    if (!disparo || !grupo?.startsWith('venc_')) return
    let cancelado = false
    setCarregandoTemplate(true)
    supabase
      .from('templates_admin')
      .select('mensagem')
      .eq('tipo', grupo)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return
        setMensagem(data?.mensagem || FALLBACK_LEMBRETE[grupo] || '')
        setCarregandoTemplate(false)
      })
    return () => { cancelado = true }
  }, [disparo, grupo])

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const base = termo
      ? lista.filter(c => nomeDaConta(c).toLowerCase().includes(termo) || c.email?.toLowerCase().includes(termo))
      : lista
    // Mais quentes primeiro: se o disparo for interrompido, quem tinha mais
    // chance de converter já recebeu.
    return [...base].sort((a, b) => (b.score || 0) - (a.score || 0))
  }, [lista, busca])

  if (!disparo) return null

  const visual = GRUPO_VISUAL[grupo] || { titulo: 'Disparo', icon: 'mdi:send' }
  const alvos = lista.filter(c => selecionados.has(c.id))
  const semTelefone = alvos.filter(c => !telefoneDaConta(c)).length

  const alternar = (id) => {
    setSelecionados(prev => {
      const p = new Set(prev)
      if (p.has(id)) p.delete(id); else p.add(id)
      return p
    })
  }

  const montarMensagem = (template, c) => {
    const plano = c.plano || 'starter'
    const primeiroNome = (c.nome_completo || c.nome_empresa || 'Cliente').trim().split(' ')[0]
    const valor = precoDoPlano(plano).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const dias = diasAteVencimento(c.plano_vencimento)
    return (template || '')
      .replace(/\{\{nome\}\}/g, primeiroNome)
      .replace(/\{\{plano\}\}/g, nomeDoPlano(plano))
      .replace(/\{\{valor\}\}/g, valor)
      .replace(/\{\{vencimento\}\}/g, formatarData(c.plano_vencimento))
      .replace(/\{\{dias\}\}/g, dias !== null && dias > 0 ? String(dias) : '')
      .replace(/\{\{dias_atraso\}\}/g, dias !== null && dias < 0 ? String(Math.abs(dias)) : '')
      .replace(/\{\{pix\}\}/g, chavePix || '(PIX não configurado)')
  }

  /* ---------- Envio direto (lembretes) ---------- */

  const dispararDireto = async () => {
    if (!alvos.length) return showError('Selecione ao menos uma conta.')
    if (!mensagem.trim()) return showError('A mensagem não pode ficar vazia.')

    const meta = META_GRUPO[grupo]
    setEnviando(true)
    setResultado(null)
    abortar.current = false
    setProgresso({ total: alvos.length, enviados: 0, falhas: 0, erros: [] })

    let enviados = 0, falhas = 0
    const erros = []

    for (let i = 0; i < alvos.length; i++) {
      if (abortar.current) break

      const c = alvos[i]
      const nome = nomeDaConta(c)
      const tel = telefoneDaConta(c)
      const texto = montarMensagem(mensagem, c)

      let log
      if (!tel) {
        falhas++
        erros.push(`${nome}: sem telefone`)
        log = { usuario_id: c.id, tipo: meta.tipoLog, mensagem: meta.rotulo, canal: 'crm_direto', status: 'falha', erro: 'sem telefone', enviado_por: userId }
      } else {
        const res = await whatsappService.enviarMensagem(tel, texto, INSTANCIA_MENSALLI)
        if (res.sucesso) {
          enviados++
          log = { usuario_id: c.id, tipo: meta.tipoLog, mensagem: texto, canal: 'crm_direto', status: 'enviado', enviado_por: userId }
        } else {
          falhas++
          erros.push(`${nome}: ${res.erro}`)
          log = { usuario_id: c.id, tipo: meta.tipoLog, mensagem: meta.rotulo, canal: 'crm_direto', status: 'falha', erro: res.erro, enviado_por: userId }
        }
      }

      // Grava JÁ. O laço espera 15s entre envios; acumular os logs até o fim
      // significava perder o registro inteiro se a aba fechasse no meio.
      try {
        await supabase.from('retencao_saas_envios').insert(log)
      } catch (e) {
        console.error('Falha ao gravar log de envio:', e)
      }

      setProgresso({ total: alvos.length, enviados, falhas, erros: [...erros] })

      if (i < alvos.length - 1 && !abortar.current) {
        await new Promise(r => setTimeout(r, INTERVALO_ENVIO_MS))
      }
    }

    setEnviando(false)
    setResultado({
      sucesso: true, enviados, falhas, erros,
      interrompido: abortar.current,
      restantes: abortar.current ? alvos.length - enviados - falhas : 0,
    })
    onConcluido?.()
  }

  /* ---------- Disparo pelo n8n (recuperação) ---------- */

  const dispararN8n = async () => {
    if (!alvos.length) return showError('Selecione ao menos uma conta.')

    setEnviando(true)
    setResultado(null)
    try {
      const { data: cfgData, error: cfgErro } = await supabase
        .from('config')
        .select('chave, valor')
        .in('chave', ['n8n_webhook_recuperar_trial', 'evolution_api_url', 'evolution_api_key'])
      if (cfgErro) throw cfgErro

      const cfg = Object.fromEntries((cfgData || []).map(c => [c.chave, c.valor]))
      if (!cfg.n8n_webhook_recuperar_trial) {
        throw new Error('Webhook não configurado. Adicione a chave "n8n_webhook_recuperar_trial" na tabela config.')
      }
      if (!cfg.evolution_api_url || !cfg.evolution_api_key) {
        throw new Error('Credenciais Evolution não encontradas na tabela config.')
      }

      const meta = META_GRUPO[grupo]
      const labelOferta = OFERTAS[grupo]?.find(o => o.value === oferta)?.label || oferta

      const resposta = await fetch(cfg.n8n_webhook_recuperar_trial, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grupo,
          oferta,
          oferta_label: labelOferta,
          evolution_api_url: cfg.evolution_api_url,
          evolution_api_key: cfg.evolution_api_key,
          chave_pix: chavePix || '',
          total: alvos.length,
          disparado_em: new Date().toISOString(),
          disparado_por: userId,
          usuarios: alvos.map(c => ({
            id: c.id,
            email: c.email,
            nome_completo: c.nome_completo,
            nome_empresa: c.nome_empresa,
            telefone: telefoneDaConta(c),
            trial_fim: c.trial_fim,
            plano: c.plano || 'starter',
            plano_nome: nomeDoPlano(c.plano),
            plano_valor: precoDoPlano(c.plano),
            plano_vencimento: c.plano_vencimento,
            ciclo: c.ciclo,
            created_at: c.data_cadastro || c.created_at,
          })),
        }),
      })
      if (!resposta.ok) throw new Error(`Webhook respondeu HTTP ${resposta.status}`)

      await supabase.from('retencao_saas_envios').insert(alvos.map(c => ({
        usuario_id: c.id,
        tipo: meta.tipoLog,
        mensagem: `${meta.rotulo} - ${labelOferta}`,
        canal: 'n8n_bulk',
        status: 'enviado',
        enviado_por: userId,
      })))

      if (meta.flag) {
        await supabase
          .from('usuarios')
          .update({ [meta.flag]: new Date().toISOString() })
          .in('id', alvos.map(c => c.id))
      }

      setResultado({ sucesso: true, enviados: alvos.length, falhas: 0, erros: [] })
      onConcluido?.()
    } catch (e) {
      setResultado({ sucesso: false, erro: e.message })
    } finally {
      setEnviando(false)
    }
  }

  const fechar = () => {
    if (enviando) return
    onClose()
  }

  return (
    <Modal
      isOpen={!!disparo}
      onClose={fechar}
      size="lg"
      title={visual.titulo}
      subtitle={`${alvos.length} de ${lista.length} contas selecionadas`}
      closeOnBackdrop={!enviando}
      closeOnEsc={!enviando}
    >
      <Modal.Body>
        {/* Configuração do envio */}
        {ehLembrete ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              gap: 8, marginBottom: 6,
            }}>
              <span className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>
                Mensagem
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {carregandoTemplate ? 'carregando template…' : 'template de templates_admin'}
              </span>
            </div>
            <textarea
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              disabled={enviando || carregandoTemplate}
              rows={12}
              style={{
                width: '100%', padding: 12, fontSize: 13, lineHeight: 1.55,
                fontFamily: 'var(--font-sans)', resize: 'vertical',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-lg)', color: 'var(--color-text-primary)',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              Variáveis: <code>{'{{nome}}'}</code> <code>{'{{plano}}'}</code> <code>{'{{valor}}'}</code>{' '}
              <code>{'{{vencimento}}'}</code> <code>{'{{dias}}'}</code> <code>{'{{dias_atraso}}'}</code>{' '}
              <code>{'{{pix}}'}</code>
              <div style={{ marginTop: 4 }}>
                Editar aqui vale só para <strong>este</strong> disparo. Para mudar o texto que a
                cobrança automática manda todo dia às 9h, edite o template em{' '}
                <code>templates_admin</code>.
              </div>
            </div>

            {alvos[0] && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                  Prévia com {nomeDaConta(alvos[0])}
                </summary>
                <pre style={{
                  marginTop: 8, padding: 12, fontSize: 12, lineHeight: 1.55,
                  whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)',
                  backgroundColor: 'var(--neutral-50)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                }}>
                  {montarMensagem(mensagem, alvos[0])}
                </pre>
              </details>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: 18 }}>
            <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Oferta
            </div>
            <Select
              portal
              options={OFERTAS[grupo] || OFERTAS.trial}
              value={oferta}
              onChange={setOferta}
              disabled={enviando}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
              O texto da mensagem é montado pelo fluxo do n8n a partir da oferta escolhida.
            </div>
          </div>
        )}

        {/* Aviso do envio direto */}
        {ehLembrete && !resultado && (
          <div style={{
            display: 'flex', gap: 8, padding: 12, marginBottom: 16,
            backgroundColor: 'var(--info-50)', border: '1px solid var(--info-500)',
            borderRadius: 'var(--radius-lg)', fontSize: 12, lineHeight: 1.5,
          }}>
            <Icon icon="mdi:information-outline" width={16} height={16} style={{ color: 'var(--info-700)', flexShrink: 0, marginTop: 1 }} />
            <span>
              Um envio a cada 15 segundos pela instância <code>mensalli_master</code> —
              {' '}{Math.ceil((alvos.length * INTERVALO_ENVIO_MS) / 60000)} min para {alvos.length} contas.
              {' '}<strong>Mantenha esta aba aberta.</strong> Cada envio é registrado na hora,
              então parar no meio não perde o que já saiu.
            </span>
          </div>
        )}

        {semTelefone > 0 && (
          <div style={{
            padding: 10, marginBottom: 16, fontSize: 12,
            backgroundColor: 'var(--warning-50)', border: '1px solid var(--warning-500)',
            borderRadius: 'var(--radius-lg)', color: 'var(--color-text-primary)',
          }}>
            {semTelefone} das contas selecionadas não têm telefone e vão falhar.
          </div>
        )}

        {/* Progresso */}
        {progresso && (
          <div style={{
            padding: 14, marginBottom: 16,
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--neutral-50)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>
                {progresso.enviados + progresso.falhas} de {progresso.total}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {progresso.enviados} enviados · {progresso.falhas} falhas
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 999, backgroundColor: 'var(--neutral-200)', overflow: 'hidden' }}>
              <div style={{
                width: `${((progresso.enviados + progresso.falhas) / progresso.total) * 100}%`,
                height: '100%', backgroundColor: 'var(--mensalli-green-500)',
                transition: 'width var(--duration-300) var(--ease-out)',
              }} />
            </div>
            {progresso.erros.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--danger-700)', maxHeight: 90, overflowY: 'auto' }}>
                {progresso.erros.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Resultado */}
        {resultado && (
          <div style={{
            padding: 14, marginBottom: 16,
            border: `1px solid ${resultado.sucesso ? 'var(--success-500)' : 'var(--danger-500)'}`,
            backgroundColor: resultado.sucesso ? 'var(--success-50)' : 'var(--danger-50)',
            borderRadius: 'var(--radius-lg)', fontSize: 13, lineHeight: 1.55,
          }}>
            {resultado.sucesso ? (
              <>
                <strong>
                  {resultado.interrompido ? 'Disparo interrompido.' : 'Disparo concluído.'}
                </strong>{' '}
                {resultado.enviados} enviados
                {resultado.falhas > 0 && `, ${resultado.falhas} falhas`}
                {resultado.restantes > 0 && `, ${resultado.restantes} não chegaram a sair`}.
                {resultado.erros?.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--danger-700)', maxHeight: 120, overflowY: 'auto' }}>
                    {resultado.erros.map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                )}
              </>
            ) : (
              <><strong>Falhou:</strong> {resultado.erro}</>
            )}
          </div>
        )}

        {/* Lista de destinatários */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, flexWrap: 'wrap', marginBottom: 10,
        }}>
          <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>
            Destinatários
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button size="xs" variant="outline" disabled={enviando} onClick={() => setSelecionados(new Set(lista.map(c => c.id)))}>
              Todos
            </Button>
            <Button
              size="xs" variant="outline" disabled={enviando}
              title="Score de engajamento: quem tem mais chance de converter"
              onClick={() => setSelecionados(new Set(
                lista.filter(c => c.temperatura === 'quente' || c.temperatura === 'morno').map(c => c.id)
              ))}
            >
              Só quentes e mornos
            </Button>
            <Button size="xs" variant="outline" disabled={enviando} onClick={() => setSelecionados(new Set())}>
              Nenhum
            </Button>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <SearchInput
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Filtrar destinatários…"
            disabled={enviando}
          />
        </div>

        <div style={{
          maxHeight: isSmallScreen ? 240 : 320, overflowY: 'auto',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
        }}>
          {visiveis.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>
              Nenhuma conta com esse filtro.
            </div>
          ) : visiveis.map((c, i) => {
            const temp = TEMPERATURAS[c.temperatura] || TEMPERATURAS.frio
            const tel = telefoneDaConta(c)
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  borderBottom: i < visiveis.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                }}
              >
                <Checkbox
                  checked={selecionados.has(c.id)}
                  onChange={() => alternar(c.id)}
                  disabled={enviando}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {nomeDaConta(c)}
                  </div>
                  <div style={{ fontSize: 11, color: tel ? 'var(--color-text-muted)' : 'var(--danger-700)' }}>
                    {tel || 'sem telefone'}
                    {c.plano_vencimento && ` · vence ${formatarData(c.plano_vencimento)}`}
                  </div>
                </div>
                <span title={(c.motivos || []).join(' · ') || `Score ${c.score || 0}/100`}>
                  <Badge variant={temp.variant} size="xs" icon={temp.icon}>{temp.label}</Badge>
                </span>
              </div>
            )
          })}
        </div>
      </Modal.Body>

      <Modal.Footer align="between">
        <Button variant="outline" onClick={fechar} disabled={enviando}>
          {resultado ? 'Fechar' : 'Cancelar'}
        </Button>
        {enviando && ehLembrete ? (
          <Button variant="danger-outline" icon="mdi:stop" onClick={() => { abortar.current = true }}>
            Parar após o envio atual
          </Button>
        ) : (
          <Button
            variant="primary"
            icon="mdi:send"
            loading={enviando}
            disabled={alvos.length === 0 || carregandoTemplate || (ehLembrete && !mensagem.trim())}
            onClick={ehLembrete ? dispararDireto : dispararN8n}
          >
            Enviar para {alvos.length}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
