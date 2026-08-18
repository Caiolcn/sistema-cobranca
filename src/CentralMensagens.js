import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import useWindowSize from './hooks/useWindowSize'
import { showToast } from './Toast'
import { reenviarMensagem } from './services/reenvioMensagem'
import Table from './design-system/components/Table'
import Badge from './design-system/components/Badge'
import Select from './design-system/components/Select'
import SearchInput from './design-system/components/SearchInput'
import Modal from './design-system/components/Modal'
import EmptyState from './design-system/components/EmptyState'

/* ============================================================
   Central de Mensagens — Fase 1 (somente leitura)

   Fonte única: vw_central_mensagens, que une os dois lados que antes não
   conversavam:
     - mensagens_fila  → o que VAI sair (ou foi barrado, ou expirou sem sair).
                         Antes disso, mensagem não tentada não existia em lugar
                         nenhum: instância caída na hora do cron fazia a parcela
                         sumir da view sem log e sem alerta.
     - logs_mensagens  → o que já foi tentado.

   POR QUE NÃO TEM BOTÃO "REENVIAR" AQUI
   O reenvio hoje passaria por whatsappService.enviarCobranca() →
   enviarMensagem(), que ao detectar 'Connection Closed' chama restartInstance().
   E a classe que ganharia o botão ('transitoria') é composta exatamente de
   instance_500 / Connection Closed — ou seja, o botão só apareceria nos casos
   que disparam restart. Um clique chega a 9 chamadas à Evolution + 1 restart,
   sem teto, enquanto o whatsapp-zumbi-diario limita restart a 1x/24h por
   instância justamente porque restart derruba cliente saudável.
   O reenvio entra na Fase 2, por um caminho próprio sem auto-recovery.

   "Enviado" aqui significa ACEITO PELO PROVEDOR, não entregue. Entregue/lida
   depende do evento MESSAGES_UPDATE da Evolution, que ainda não assinamos.
   ============================================================ */

const PERIODOS = [
  { value: '1', label: 'Hoje' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' }
]

// Rótulo, cor e explicação de cada situação. O texto de ajuda existe porque
// metade destas situações não existia antes desta tela — ninguém sabe o que
// "barrada" quer dizer sem alguém contar.
const SITUACOES = {
  enviado: {
    label: 'Enviado',
    variant: 'success',
    icon: 'mdi:check',
    ajuda: 'Aceito pelo provedor. Não é confirmação de entrega — isso depende do MESSAGES_UPDATE, que ainda não assinamos.'
  },
  falhou: {
    label: 'Falhou',
    variant: 'danger',
    icon: 'mdi:alert-circle-outline',
    ajuda: 'O envio foi tentado e o provedor recusou ou não respondeu.'
  },
  agendada: {
    label: 'Agendada',
    variant: 'info',
    icon: 'mdi:clock-outline',
    ajuda: 'Prevista para a janela de envio do dia e ainda não tentada.'
  },
  barrada: {
    label: 'Barrada',
    variant: 'warning',
    icon: 'mdi:wifi-off',
    ajuda: 'Passaria em todos os filtros, mas o WhatsApp da conta está desconectado. Antes desta tela, sumia sem deixar rastro.'
  },
  nao_enviada: {
    label: 'Não saiu',
    variant: 'danger',
    icon: 'mdi:close-octagon-outline',
    ajuda: 'A janela do dia passou e a mensagem nunca chegou a ser tentada.'
  }
}

// Por que a falha aconteceu, em português, e o que dá pra fazer sobre ela.
const CLASSES_FALHA = {
  transitoria: { label: 'Conexão/infra', ajuda: 'Instância caída ou instável no momento do envio. Reenviar resolve — mas só depois do WhatsApp voltar.' },
  permanente: { label: 'Número inválido', ajuda: 'O número não existe no WhatsApp. Reenviar nunca vai funcionar: precisa corrigir o cadastro do aluno.' },
  nao_falha: { label: 'Entregue', ajuda: 'Foi entregue. O número tem JID canônico sem o 9 (conta BR anterior à Anatel) e o guard do n8n acusa como erro.' },
  nao_tentada: { label: 'Nunca tentada', ajuda: 'O lote do n8n estourou o tempo e marcou como falha algo que nunca chegou a sair.' },
  config: { label: 'Credencial', ajuda: 'Credencial ou instância inválida na Evolution. Não se resolve reenviando.' },
  indeterminada: { label: 'Motivo não informado', ajuda: 'O provedor não devolveu motivo estruturado — o n8n gravou o erro genérico.' }
}

const TIPOS = {
  pre_due_3days: 'Lembrete 3 dias antes',
  due_day: 'Vence hoje',
  overdue: 'Em atraso',
  payment_confirmed: 'Pagamento confirmado',
  welcome: 'Boas-vindas',
  birthday: 'Aniversário',
  class_reminder: 'Lembrete de aula',
  cobranca_manual: 'Envio manual'
}

const fmtDataHora = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function CentralMensagens({ isAdmin, irParaConexao, recarregarToken = 0 }) {
  const { isSmallScreen } = useWindowSize()

  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [linhas, setLinhas] = useState([])
  const [contasMap, setContasMap] = useState({})
  const [alunosMap, setAlunosMap] = useState({})

  const [periodo, setPeriodo] = useState('7')
  const [fSituacao, setFSituacao] = useState('todas')
  const [fTipo, setFTipo] = useState('todos')
  const [fConta, setFConta] = useState('todas')
  const [busca, setBusca] = useState('')
  const [detalhe, setDetalhe] = useState(null)
  // Guarda o id em voo. A trava de verdade é o UNIQUE do dedupe_key no banco;
  // isto aqui só evita o segundo clique chegar a sair do navegador.
  const [reenviando, setReenviando] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErroCarga('')
    try {
      const desde = new Date()
      desde.setDate(desde.getDate() - Number(periodo))
      if (periodo === '1') desde.setHours(0, 0, 0, 0)

      const { data, error } = await supabase
        .from('vw_central_mensagens')
        .select('id, fonte, ref_id, user_id, devedor_id, mensalidade_id, tipo, telefone, quando, situacao, motivo, erro, erro_codigo, falha_classe, mensagem, pode_reenviar, conta_conectada')
        .gte('quando', desde.toISOString())
        .order('quando', { ascending: false })
        .limit(3000)

      if (error) throw error
      const arr = data || []
      setLinhas(arr)

      // Nomes não vêm na view de propósito — juntar usuarios/devedores no SQL
      // deixaria a listagem bem mais pesada por um dado que cabe em dois mapas.
      // Mesmo padrão de AdminErrosMensagens.js.
      const userIds = [...new Set(arr.map(l => l.user_id).filter(Boolean))]
      const devIds = [...new Set(arr.map(l => l.devedor_id).filter(Boolean))]

      const [{ data: contas }, { data: alunos }] = await Promise.all([
        userIds.length
          ? supabase.from('usuarios').select('id, nome_empresa, nome_completo').in('id', userIds)
          : Promise.resolve({ data: [] }),
        devIds.length
          ? supabase.from('devedores').select('id, nome, responsavel_nome').in('id', devIds)
          : Promise.resolve({ data: [] })
      ])

      const cm = {}; (contas || []).forEach(c => { cm[c.id] = c })
      const am = {}; (alunos || []).forEach(a => { am[a.id] = a })
      setContasMap(cm)
      setAlunosMap(am)
    } catch (e) {
      console.error('Central de Mensagens: falha ao carregar', e)
      setErroCarga(e.message || 'Não foi possível carregar as mensagens.')
    } finally {
      setCarregando(false)
    }
  }, [periodo])

  useEffect(() => { if (isAdmin) carregar() }, [isAdmin, carregar, recarregarToken])

  const aoReenviar = useCallback(async (linha) => {
    if (reenviando) return
    setReenviando(linha.id)
    try {
      const r = await reenviarMensagem(linha.ref_id)
      showToast(r.mensagem, r.ok ? 'success' : 'error')
      // Recarrega em qualquer desfecho: sucesso cria log novo, falha também —
      // e a linha antiga deixa de ser reenviável nos dois casos.
      await carregar()
      setDetalhe(null)
    } catch (e) {
      console.error('Reenvio falhou', e)
      showToast('Não foi possível reenviar. Tente de novo.', 'error')
    } finally {
      setReenviando(null)
    }
  }, [reenviando, carregar])

  const nomeConta = useCallback(
    (uid) => contasMap[uid]?.nome_empresa || contasMap[uid]?.nome_completo || '—',
    [contasMap]
  )
  // O ALUNO é o nome do aluno, sempre — é por ele que se busca em /app/clientes.
  // Mostrar o responsável aqui fazia a tela inventar um aluno que não existe:
  // "JOSÉ ROBERTO VITAL" é o responsável do "ENZO PINTER VITAL", e procurar
  // pelo primeiro na tela de Alunos não achava nada.
  const nomeAluno = useCallback(
    (did) => alunosMap[did]?.nome || '—',
    [alunosMap]
  )

  // Quem de fato recebe a mensagem, quando difere do aluno.
  const nomeResponsavel = useCallback(
    (did) => {
      const d = alunosMap[did]
      const r = (d?.responsavel_nome || '').trim()
      return r && r !== d?.nome ? r : null
    },
    [alunosMap]
  )

  const opcoesConta = useMemo(() => {
    const vistos = new Map()
    linhas.forEach(l => { if (l.user_id && !vistos.has(l.user_id)) vistos.set(l.user_id, nomeConta(l.user_id)) })
    return [{ value: 'todas', label: 'Todas as contas' },
      ...[...vistos.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, label]) => ({ value: v, label }))]
  }, [linhas, nomeConta])

  const opcoesTipo = useMemo(() => {
    const vistos = [...new Set(linhas.map(l => l.tipo).filter(Boolean))]
    return [{ value: 'todos', label: 'Todos os tipos' },
      ...vistos.sort().map(t => ({ value: t, label: TIPOS[t] || t }))]
  }, [linhas])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return linhas.filter(l => {
      if (fSituacao !== 'todas' && l.situacao !== fSituacao) return false
      if (fTipo !== 'todos' && l.tipo !== fTipo) return false
      if (fConta !== 'todas' && l.user_id !== fConta) return false
      if (!q) return true
      // Busca cobre aluno E responsável: o gestor pode conhecer o contato por
      // qualquer um dos dois.
      return nomeAluno(l.devedor_id).toLowerCase().includes(q)
        || (nomeResponsavel(l.devedor_id) || '').toLowerCase().includes(q)
        || (l.telefone || '').toLowerCase().includes(q)
        || nomeConta(l.user_id).toLowerCase().includes(q)
    })
  }, [linhas, fSituacao, fTipo, fConta, busca, nomeAluno, nomeResponsavel, nomeConta])

  const resumo = useMemo(() => {
    const r = { enviado: 0, falhou: 0, agendada: 0, barrada: 0, nao_enviada: 0 }
    filtradas.forEach(l => { if (r[l.situacao] !== undefined) r[l.situacao] += 1 })
    return r
  }, [filtradas])

  if (!isAdmin) {
    return (
      <EmptyState
        variant="forbidden"
        title="Central de Mensagens"
        description="Esta tela está em validação interna e ainda não foi liberada."
      />
    )
  }

  const colunas = [
    {
      key: 'quando',
      label: 'Quando',
      width: 120,
      render: (r) => (
        <span style={{ fontSize: 13, color: '#555', whiteSpace: 'nowrap' }}>{fmtDataHora(r.quando)}</span>
      )
    },
    {
      key: 'conta',
      label: 'Conta',
      render: (r) => (
        <span style={{ fontSize: 13, color: '#344848' }}>{nomeConta(r.user_id)}</span>
      )
    },
    {
      key: 'aluno',
      label: 'Aluno',
      render: (r) => {
        const resp = nomeResponsavel(r.devedor_id)
        return (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500 }}>{nomeAluno(r.devedor_id)}</div>
            <div style={{ fontSize: 12, color: '#888' }}>
              {r.telefone || '—'}
              {resp && <span> · resp. {resp}</span>}
            </div>
          </div>
        )
      }
    },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 13, color: '#555' }}>{TIPOS[r.tipo] || r.tipo || '—'}</span>
          {/* Sem isto, 1 mensalidade + 2 avulsas viravam três linhas idênticas
              "Pagamento confirmado" e pareciam envio triplicado. */}
          {r.tipo === 'payment_confirmed' && (
            <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
              {r.mensalidade_id ? 'mensalidade' : 'cobrança avulsa'}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'situacao',
      label: 'Situação',
      width: 210,
      render: (r) => {
        const s = SITUACOES[r.situacao] || { label: r.situacao, variant: 'default', icon: 'mdi:help' }
        const c = r.falha_classe ? CLASSES_FALHA[r.falha_classe] : null
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
            <Badge variant={s.variant} icon={s.icon}>{s.label}</Badge>
            {c && <span style={{ fontSize: 11, color: '#888' }}>{c.label}</span>}
            {r.motivo === 'whatsapp_offline' && (
              <span style={{ fontSize: 11, color: '#888' }}>WhatsApp desconectado</span>
            )}
          </div>
        )
      }
    },
    {
      key: 'acao',
      label: '',
      width: 130,
      align: 'right',
      render: (r) => {
        // O botão só existe onde reenviar resolve. Em falha permanente ou em
        // mensagem já entregue ele nem aparece — botão desabilitado convida
        // a insistir, e aqui insistir duplica cobrança.
        // Conta caída: a mensagem FICA registrada aqui e o caminho é
        // reconectar. Reenviar contra socket morto é falha garantida e carga
        // à toa na Evolution — por isso aqui não existe "tentar mesmo assim".
        if (!r.pode_reenviar && r.falha_classe === 'transitoria' && !r.conta_conectada) {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); irParaConexao?.() }}
              title="O WhatsApp desta conta está desconectado. Reconecte e depois volte aqui para reenviar — a mensagem continua registrada."
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 7, whiteSpace: 'nowrap',
                border: '1px solid #fde68a', backgroundColor: '#fffbeb',
                color: '#a16207', fontSize: 12.5, fontWeight: 500, cursor: 'pointer'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fef3c7' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fffbeb' }}
            >
              <Icon icon="mdi:wifi-off" width={14} />
              Reconectar
            </button>
          )
        }
        if (!r.pode_reenviar) {
          return <Icon icon="mdi:chevron-right" width={18} style={{ color: '#bbb' }} />
        }
        const emVoo = reenviando === r.id
        return (
          <button
            onClick={(e) => { e.stopPropagation(); aoReenviar(r) }}
            disabled={!!reenviando}
            title="Reenvia o mesmo texto, pela mesma instância. Não gera cobrança nova."
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 7, whiteSpace: 'nowrap',
              border: '1px solid #d5dede', backgroundColor: emVoo ? '#eef2f2' : '#fff',
              color: '#344848', fontSize: 12.5, fontWeight: 500,
              cursor: reenviando ? 'not-allowed' : 'pointer',
              opacity: reenviando && !emVoo ? 0.5 : 1
            }}
            onMouseEnter={(e) => { if (!reenviando) e.currentTarget.style.backgroundColor = '#f1f5f5' }}
            onMouseLeave={(e) => { if (!reenviando) e.currentTarget.style.backgroundColor = '#fff' }}
          >
            <Icon icon={emVoo ? 'mdi:loading' : 'mdi:refresh'} width={15}
              style={emVoo ? { animation: 'ds-spin 1s linear infinite' } : undefined} />
            {emVoo ? 'Reenviando...' : 'Reenviar'}
          </button>
        )
      }
    }
  ]

  return (
    <div>
      {/* Aviso de honestidade. Enquanto MESSAGES_UPDATE não estiver assinado,
          "Enviado" é aceite do provedor — e a tela precisa dizer isso, não
          deixar o gestor concluir que chegou. */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '10px 14px', marginBottom: 16,
        backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8
      }}>
        <Icon icon="mdi:information-outline" width={18} style={{ color: '#64748b', flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>
          <strong>Enviado</strong> significa aceito pelo provedor, não entregue ao aluno.
          Confirmação de entrega e leitura depende do evento <code>MESSAGES_UPDATE</code> da
          Evolution, que ainda não assinamos. O botão <strong>Reenviar</strong> só aparece em
          falha de conexão/infra: número inválido pede correção do cadastro, e mensagem já
          entregue não deve ser reenviada — reenviar ali duplicaria a cobrança do aluno.
          Com o WhatsApp da conta desconectado, a mensagem <strong>fica registrada aqui</strong> e
          o caminho é reconectar primeiro; o reenvio passa a ficar disponível depois.
        </span>
      </div>

      {/* Resumo */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {Object.entries(resumo).map(([k, v]) => {
          const s = SITUACOES[k]
          return (
            <button
              key={k}
              onClick={() => setFSituacao(fSituacao === k ? 'todas' : k)}
              title={s.ajuda}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                border: fSituacao === k ? '1px solid #344848' : '1px solid #e5e7eb',
                backgroundColor: fSituacao === k ? '#f1f5f5' : '#fff',
                transition: 'all .15s'
              }}
              onMouseEnter={(e) => { if (fSituacao !== k) e.currentTarget.style.backgroundColor = '#fafafa' }}
              onMouseLeave={(e) => { if (fSituacao !== k) e.currentTarget.style.backgroundColor = '#fff' }}
            >
              <Icon icon={s.icon} width={16} style={{ color: '#666' }} />
              <span style={{ fontSize: 13, color: '#555' }}>{s.label}</span>
              <strong style={{ fontSize: 14, color: '#1a1a1a' }}>{v}</strong>
            </button>
          )
        })}
      </div>

      {/* Filtros */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isSmallScreen ? '1fr' : 'minmax(180px,1fr) minmax(160px,1fr) minmax(160px,1fr) minmax(200px,1.4fr)',
        gap: 10, marginBottom: 16
      }}>
        <Select options={PERIODOS} value={periodo} onChange={setPeriodo} />
        <Select options={opcoesTipo} value={fTipo} onChange={setFTipo} searchable />
        <Select options={opcoesConta} value={fConta} onChange={setFConta} searchable />
        <SearchInput
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por aluno, telefone ou conta..."
        />
      </div>

      {erroCarga ? (
        <EmptyState
          variant="error"
          title="Não foi possível carregar"
          description={erroCarga}
        />
      ) : (
        <Table
          columns={colunas}
          data={filtradas}
          rowKey="id"
          loading={carregando}
          onRowClick={(r) => setDetalhe(r)}
          size="sm"
          stickyHeader
          emptyTitle="Nenhuma mensagem no período"
          emptyMessage="Ajuste o período ou os filtros para ver mais."
          emptyIcon="mdi:message-off-outline"
        />
      )}

      {/* Detalhe */}
      <Modal
        isOpen={!!detalhe}
        onClose={() => setDetalhe(null)}
        title="Detalhe da mensagem"
        subtitle={detalhe ? `${nomeAluno(detalhe.devedor_id)} · ${nomeConta(detalhe.user_id)}` : ''}
        position="aside"
        size="md"
      >
        <Modal.Body>
          {detalhe && (() => {
            const s = SITUACOES[detalhe.situacao] || {}
            const c = detalhe.falha_classe ? CLASSES_FALHA[detalhe.falha_classe] : null
            const Campo = ({ rotulo, children }) => (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, color: '#94a3b8', marginBottom: 4 }}>{rotulo}</div>
                <div style={{ fontSize: 13.5, color: '#1a1a1a' }}>{children}</div>
              </div>
            )
            return (
              <div>
                <Campo rotulo="Situação">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                    <Badge variant={s.variant} icon={s.icon}>{s.label}</Badge>
                    <span style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>{s.ajuda}</span>
                  </div>
                </Campo>

                {c && (
                  <Campo rotulo="Motivo">
                    <div style={{ fontWeight: 500, marginBottom: 3 }}>{c.label}</div>
                    <span style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>{c.ajuda}</span>
                  </Campo>
                )}

                <Campo rotulo="Quando">{fmtDataHora(detalhe.quando)}</Campo>
                <Campo rotulo="Tipo">{TIPOS[detalhe.tipo] || detalhe.tipo || '—'}</Campo>
                <Campo rotulo="Telefone">{detalhe.telefone || '—'}</Campo>

                {detalhe.mensagem ? (
                  <Campo rotulo="Texto enviado">
                    <pre style={{
                      margin: 0, padding: 12, backgroundColor: '#f8fafc',
                      border: '1px solid #e5e7eb', borderRadius: 8,
                      fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word', fontFamily: 'inherit', color: '#334155'
                    }}>{detalhe.mensagem}</pre>
                  </Campo>
                ) : (
                  <Campo rotulo="Texto">
                    <span style={{ color: '#94a3b8' }}>
                      Ainda não gerado — a mensagem é montada no momento do envio.
                    </span>
                  </Campo>
                )}

                {detalhe.erro && (
                  <Campo rotulo="Retorno do provedor">
                    <pre style={{
                      margin: 0, padding: 12, backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca', borderRadius: 8,
                      fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', color: '#991b1b'
                    }}>{detalhe.erro}</pre>
                    {detalhe.erro_codigo && (
                      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6 }}>
                        código: <code>{detalhe.erro_codigo}</code>
                      </div>
                    )}
                  </Campo>
                )}
              </div>
            )
          })()}
        </Modal.Body>
      </Modal>
    </div>
  )
}
