import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import Input from '../../design-system/components/Input'
import Select from '../../design-system/components/Select'
import Button from '../../design-system/components/Button'
import { COLUNAS, FILAS, planoPara, formatarDataHora, formatarTelefone, formatarDataCurta } from './utils'

// Painel de contexto da conversa aberta.
//
// `nicho` e `alunos` não são enfeite: são o que alimenta as variáveis das
// respostas rápidas e o que decide o plano na hora de falar preço. Preencher
// os dois é o próprio ato de qualificar o lead.
//
// Metade das conversas desta caixa é de cliente pagante, não de lead — por
// isso o bloco da conta vem antes de tudo: dá pra responder suporte sabendo
// quem é a pessoa sem sair da tela.

export default function PainelLead({ lead, onSalvar, onIgnorar, salvando }) {
  const [form, setForm] = useState({})
  const [sujo, setSujo] = useState(false)

  useEffect(() => {
    setForm({
      nome: lead?.nome || '',
      nicho: lead?.nicho || '',
      alunos: lead?.alunos ?? '',
      status: lead?.status || 'novo',
      fila: lead?.fila || '',
      proximo_toque_em: lead?.proximo_toque_em || '',
      observacoes: lead?.observacoes || '',
      retornar_em: lead?.retornar_em || ''
    })
    setSujo(false)
  }, [lead?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lead) return null

  const mudar = (campo, valor) => {
    setForm(f => ({ ...f, [campo]: valor }))
    setSujo(true)
  }

  const salvar = async () => {
    await onSalvar({
      nome: form.nome.trim() || null,
      nicho: form.nicho.trim() || null,
      alunos: form.alunos === '' ? null : Number(form.alunos),
      status: form.status,
      fila: form.fila || null,
      proximo_toque_em: form.proximo_toque_em || null,
      observacoes: form.observacoes || null,
      retornar_em: form.retornar_em || null
    })
    setSujo(false)
  }

  const plano = planoPara(form.alunos)
  const filaAtual = FILAS.find(f => f.id === form.fila)

  return (
    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Situação da conta */}
      {lead.usuario_id ? (
        <div style={{
          backgroundColor: lead.plano_pago ? '#f0fdf4' : '#ecfeff',
          border: `1px solid ${lead.plano_pago ? '#bbf7d0' : '#a5f3fc'}`,
          borderRadius: '10px', padding: '10px 12px', fontSize: '12.5px'
        }}>
          <strong style={{ display: 'block', marginBottom: '3px' }}>
            {lead.plano_pago ? '✅ Cliente pagante' : '🎯 Criou conta (trial)'}
          </strong>
          <div style={{ color: '#475569' }}>{lead.usuario_nome}</div>
          <div style={{ color: '#64748b', fontSize: '11.5px' }}>{lead.usuario_email}</div>
          <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '3px' }}>
            Cadastrou em {formatarDataHora(lead.usuario_cadastro)}
            {lead.trial_fim && !lead.plano_pago ? ` · trial até ${formatarDataCurta(String(lead.trial_fim).slice(0, 10))}` : ''}
          </div>
        </div>
      ) : (
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', fontSize: '12.5px', color: '#64748b' }}>
          Ainda não tem conta no Mensalli com esse telefone.
        </div>
      )}

      <Input label="Nome" value={form.nome} onChange={(e) => mudar('nome', e.target.value)}
        placeholder="Sem nome" icon="mdi:account" size="sm" fullWidth
        helper="O bot só preenche o nome quando está vazio — o que você escrever aqui fica." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 92px', gap: '8px', alignItems: 'start' }}>
        <Input label="Nicho" value={form.nicho} onChange={(e) => mudar('nicho', e.target.value)}
          placeholder="personal, escolinha…" size="sm" fullWidth />
        <Input label="Alunos" type="number" min="0" value={form.alunos}
          onChange={(e) => mudar('alunos', e.target.value)} placeholder="—" size="sm" fullWidth />
      </div>

      {plano && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
          color: '#1d4ed8', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: '8px', padding: '7px 10px'
        }}>
          <Icon icon="mdi:tag-outline" width="14" />
          Plano da faixa: <strong>{plano.nome} · R$ {plano.preco}/mês</strong>
        </div>
      )}

      <Select label="Etapa do funil" options={COLUNAS.map(c => ({ value: c.id, label: c.titulo }))}
        value={form.status} onChange={(v) => mudar('status', v)} size="sm" fullWidth />

      <div>
        <Select
          label="Fila de follow-up"
          options={[{ value: '', label: 'Sem fila' }, ...FILAS.map(f => ({ value: f.id, label: f.titulo }))]}
          value={form.fila}
          onChange={(v) => mudar('fila', v)}
          size="sm"
          fullWidth
        />
        {filaAtual && (
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '5px' }}>
            Toques nos dias {filaAtual.dias.join(', ')} do silêncio · já foram {lead.toque_num || 0}.
            A data do próximo é agendada sozinha a cada mensagem que você envia.
          </div>
        )}
      </div>

      <Input type="date" label="Próximo toque" value={form.proximo_toque_em}
        onChange={(e) => mudar('proximo_toque_em', e.target.value)} size="sm" fullWidth
        helper="Aparece na aba Hoje quando chegar a data" />

      <div>
        <label style={{ display: 'block', marginBottom: '5px', fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
          Anotações
        </label>
        <textarea
          value={form.observacoes}
          onChange={(e) => mudar('observacoes', e.target.value)}
          placeholder="Ex: disse que ia esperar virar o mês pra assinar"
          rows={3}
          style={{
            width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #d1d5db',
            fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
          }}
        />
      </div>

      <Input type="date" label="Retornar em" value={form.retornar_em}
        onChange={(e) => mudar('retornar_em', e.target.value)} size="sm" fullWidth />

      <Button variant="primary" fullWidth loading={salvando} disabled={!sujo} onClick={salvar}>
        {sujo ? 'Salvar alterações' : 'Tudo salvo'}
      </Button>

      <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
        {lead.telefone && (
          <Button variant="outline" size="sm" icon="mdi:whatsapp"
            onClick={() => window.open(`https://wa.me/${String(lead.telefone).replace(/\D/g, '')}`, '_blank', 'noopener')}>
            No WhatsApp
          </Button>
        )}
        <Button variant="danger-soft" size="sm" icon="mdi:account-off" onClick={onIgnorar}>
          Não é lead
        </Button>
      </div>

      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
        {lead.telefone ? formatarTelefone(lead.telefone) : 'Sem número (conta LID)'} · {lead.total_mensagens} mensagens
      </div>
    </div>
  )
}
