import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import Modal from '../design-system/components/Modal'
import Button from '../design-system/components/Button'
import Select from '../design-system/components/Select'
import Input from '../design-system/components/Input'
import Switch from '../design-system/components/Switch'
import Badge from '../design-system/components/Badge'
import { showSuccess, showError } from '../Toast'
import { infoCiclo, formatarData, nomeDaConta, formatarBRL } from './ciclo'

/* ============================================================
   Edição de conta pelo /admin

   É aqui que morava o bug de origem. O botão "marcar como expirado" gravava:

       { plano_pago: false, trial_fim: ontem }

   Como toda a derivação do sistema escolhia a data-limite por `plano_pago`
   (`plano_pago ? plano_vencimento : trial_fim`), desligar a flag jogava a conta
   no trilho do trial — e `trial_fim` no passado É a definição de trial
   expirado. O ex-pagante voltava a ser lido como trial, e o cliente via
   "Seu período de teste de 3 dias terminou".

   Agora expirar grava `plano_vencimento: ontem` + `cancelado_em`, e NUNCA toca
   em `trial_fim`. `virou_pagante_em` é write-once e sobrevive ao cancelamento:
   é ele que mantém a conta sendo lida como ex-pagante para sempre.
   ============================================================ */

const MOTIVOS_CANCELAMENTO = [
  { value: 'nao_pagou', label: 'Não pagou' },
  { value: 'pediu_cancelamento', label: 'Pediu para cancelar' },
  { value: 'inadimplente', label: 'Inadimplente há tempo' },
  { value: 'teste_interno', label: 'Conta de teste interna' },
  { value: 'outro', label: 'Outro motivo' },
]

function isoParaInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dataRelativa(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ModalEditarConta({ conta, onClose, onSalvo, planos }) {
  const [form, setForm] = useState({ plano_pago: false, plano: 'starter', plano_vencimento: '', trial_fim: '' })
  const [motivo, setMotivo] = useState('nao_pagou')
  const [salvando, setSalvando] = useState(false)
  const [confirmandoExpirar, setConfirmandoExpirar] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (!conta) return
    setForm({
      plano_pago: !!conta.plano_pago,
      plano: conta.plano || 'starter',
      plano_vencimento: isoParaInput(conta.plano_vencimento),
      trial_fim: isoParaInput(conta.trial_fim),
    })
    setMotivo(conta.cancelado_motivo || 'nao_pagou')
    setConfirmandoExpirar(false)
    setErro(null)
  }, [conta])

  if (!conta) return null

  const info = infoCiclo(conta.ciclo)
  const eraPagante = !!conta.virou_pagante_em
  const cancelada = !!conta.cancelado_em

  const opcoesPlano = (planos?.length ? planos : [])
    .filter(p => p.ativo !== false)
    .map(p => ({ value: p.id, label: `${p.nome} — ${formatarBRL(p.preco)}/mês` }))
  const opcoesFinal = opcoesPlano.length ? opcoesPlano : [
    { value: 'starter', label: 'Starter' },
    { value: 'pro', label: 'Pro' },
    { value: 'premium', label: 'Premium' },
  ]

  const gravar = async (updates, mensagem) => {
    setSalvando(true)
    setErro(null)
    try {
      const { error } = await supabase.from('usuarios').update(updates).eq('id', conta.id)
      if (error) throw error
      showSuccess(mensagem)
      // Recarrega do servidor em vez de atualizar o estado local: o update
      // otimista deixava os KPIs financeiros defasados até o próximo F5.
      await onSalvo?.()
      onClose()
    } catch (e) {
      setErro(e.message)
      showError('Não foi possível salvar')
    } finally {
      setSalvando(false)
    }
  }

  const salvar = () => {
    // Pagante sem data de vencimento é o dado que o gate trata como bloqueio
    // (fail-closed): a conta perde acesso em silêncio. Barrar na entrada.
    if (form.plano_pago && !form.plano_vencimento) {
      setErro('Conta marcada como paga precisa de uma data de vencimento — sem ela o acesso é bloqueado.')
      return
    }

    const updates = {
      plano: form.plano,
      plano_pago: form.plano_pago,
      plano_vencimento: form.plano_vencimento || null,
      trial_fim: form.trial_fim || null,
    }

    if (form.plano_pago) {
      // Marcar como paga reabre a conta e, na primeira vez, registra a
      // conversão. `virou_pagante_em` só é gravado se ainda for nulo.
      updates.cancelado_em = null
      updates.cancelado_motivo = null
      if (!conta.virou_pagante_em) updates.virou_pagante_em = new Date().toISOString()
    }

    gravar(updates, 'Conta atualizada')
  }

  const expirar = () => {
    // O gate libera o dia inteiro do vencimento (mesma regra do banco em
    // usuario_pode_enviar), então gravar HOJE só cortaria amanhã. Quem clica
    // aqui quer cortar agora: grava ontem.
    const ontem = dataRelativa(-1)
    gravar({
      plano_pago: false,
      plano_vencimento: ontem,
      cancelado_em: new Date().toISOString(),
      cancelado_motivo: motivo,
      // Se a conta pagava e ninguém tinha registrado quando ela virou pagante,
      // registra agora — senão ela vira "trial expirado" na próxima leitura,
      // que é exatamente o bug que este trilho existe para matar.
      ...(conta.virou_pagante_em ? {} : { virou_pagante_em: new Date().toISOString() }),
      // trial_fim NÃO entra aqui. De propósito.
    }, 'Conta marcada como expirada')
  }

  const reativar = () => {
    gravar({
      plano_pago: true,
      plano_vencimento: dataRelativa(30),
      cancelado_em: null,
      cancelado_motivo: null,
      ...(conta.virou_pagante_em ? {} : { virou_pagante_em: new Date().toISOString() }),
    }, 'Conta reativada por 30 dias')
  }

  return (
    <Modal isOpen={!!conta} onClose={onClose} size="md" title={nomeDaConta(conta)} subtitle={conta.email}>
      <Modal.Body>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <span title={info.descricao}>
            <Badge variant={info.badge} icon={info.icon}>{info.label}</Badge>
          </span>
          {eraPagante && (
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              pagante desde {formatarData(conta.virou_pagante_em)}
            </span>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <Switch
            checked={form.plano_pago}
            onChange={e => setForm(s => ({ ...s, plano_pago: e.target.checked }))}
            label="Conta paga"
            description="Liga o acesso pelo plano. Precisa de data de vencimento."
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>Plano</div>
          <Select
            portal
            options={opcoesFinal}
            value={form.plano}
            onChange={v => setForm(s => ({ ...s, plano: v }))}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Input
            type="date"
            label="Vencimento do plano"
            value={form.plano_vencimento}
            onChange={e => setForm(s => ({ ...s, plano_vencimento: e.target.value }))}
            helper="A data que decide o acesso de quem já foi pagante. Vale até o fim do dia."
            error={form.plano_pago && !form.plano_vencimento ? 'Obrigatório para conta paga' : undefined}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {[30, 60, 90].map(d => (
              <Button
                key={d}
                size="xs"
                variant="outline"
                onClick={() => setForm(s => ({ ...s, plano_vencimento: dataRelativa(d) }))}
              >
                +{d} dias
              </Button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <Input
            type="date"
            label="Fim do trial"
            value={form.trial_fim}
            onChange={e => setForm(s => ({ ...s, trial_fim: e.target.value }))}
            helper={eraPagante
              ? 'Esta conta já foi pagante — o trial_fim não decide mais nada para ela. É só histórico.'
              : 'Decide o acesso de quem nunca pagou.'}
          />
        </div>

        {erro && (
          <div style={{
            marginTop: 14, padding: 12, borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--danger-50)', border: '1px solid var(--danger-500)',
            fontSize: 12, color: 'var(--danger-700)', lineHeight: 1.5,
          }}>
            {erro}
          </div>
        )}

        {/* Zona de mudança de ciclo */}
        <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--color-border-subtle)' }}>
          <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 10 }}>
            Ciclo de vida
          </div>

          {cancelada ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
                Cancelada em {formatarData(conta.cancelado_em)}
                {conta.cancelado_motivo && ` · motivo: ${conta.cancelado_motivo}`}.
                Reativar religa o acesso por 30 dias.
              </div>
              <Button variant="primary" icon="mdi:account-reactivate" onClick={reativar} loading={salvando}>
                Reativar conta
              </Button>
            </>
          ) : !confirmandoExpirar ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
                Corta o acesso agora e registra o cancelamento. A conta passa a aparecer como
                {' '}<strong>{eraPagante ? 'churn' : 'trial expirado'}</strong>, não como o outro —
                {' '}o histórico de pagamento é preservado.
              </div>
              <Button variant="danger-outline" icon="mdi:cancel" onClick={() => setConfirmandoExpirar(true)}>
                Marcar como expirado
              </Button>
            </>
          ) : (
            <div style={{
              padding: 14, borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--danger-50)', border: '1px solid var(--danger-500)',
            }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <Icon icon="mdi:alert" width={18} height={18} style={{ color: 'var(--danger-700)', flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                  A conta perde acesso imediatamente e a cobrança automática dos alunos dela para.
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  Motivo
                </div>
                <Select portal options={MOTIVOS_CANCELAMENTO} value={motivo} onChange={setMotivo} />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="danger" icon="mdi:cancel" onClick={expirar} loading={salvando}>
                  Confirmar
                </Button>
                <Button variant="outline" onClick={() => setConfirmandoExpirar(false)} disabled={salvando}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal.Body>

      <Modal.Footer align="between">
        <Button variant="outline" onClick={onClose} disabled={salvando}>Fechar</Button>
        <Button variant="primary" icon="mdi:content-save" onClick={salvar} loading={salvando}>
          Salvar
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
