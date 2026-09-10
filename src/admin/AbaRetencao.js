import { Icon } from '@iconify/react'
import Button from '../design-system/components/Button'
import RetencaoSaas from '../components/RetencaoSaas'
import { nomeDaConta, telefoneDaConta } from './ciclo'

/* ============================================================
   Aba Retenção

   Dois blocos:
     1. Lembretes de vencimento (D-3 / hoje / vencido) — saem direto pela
        instância mensalli_master, sem passar pelo n8n.
     2. Recuperação (trial expirado / ex-pagante) — dispara pelo webhook do n8n.

   Os três buckets de vencimento agora usam o MESMO predicado. Antes o bucket
   "vencido" era o único que não exigia `plano_pago`, então pescava conta já
   cancelada — e o cliente que tinha pedido pra sair recebia cobrança.

   E os grupos de recuperação saem do `ciclo` da view, não mais do cruzamento
   com pagamentos do Mercado Pago: os 10 ex-pagantes de venda na mão pararam de
   cair no balde de "trial expirado" e receber a mensagem errada.
   ============================================================ */

export default function AbaRetencao({ dados, onDisparar, isSmallScreen }) {
  const { bucketsVencimento, listasRecuperacao, carregando } = dados

  const lembretes = [
    {
      grupo: 'venc_d3',
      titulo: 'Vence em até 3 dias',
      descricao: 'Avise antes do acesso e da cobrança automática pararem.',
      icon: 'mdi:calendar-arrow-right',
      tom: 'warning',
      lista: bucketsVencimento.venc_d3,
    },
    {
      grupo: 'venc_hoje',
      titulo: 'Vence hoje',
      descricao: 'Último dia de acesso. O corte cai amanhã.',
      icon: 'mdi:calendar-today',
      tom: 'warning',
      lista: bucketsVencimento.venc_hoje,
    },
    {
      grupo: 'venc_vencido',
      titulo: 'Venceu (até 3 dias)',
      descricao: 'Já perderam acesso e os disparos para os alunos estão parados.',
      icon: 'mdi:calendar-alert',
      tom: 'danger',
      lista: bucketsVencimento.venc_vencido,
    },
  ]

  const recuperacoes = [
    {
      grupo: 'trial',
      titulo: 'Trial expirado',
      descricao: 'Testaram, o prazo acabou e nunca pagaram. Oferta de extensão ou desconto.',
      icon: 'mdi:rocket-launch',
      tom: 'info',
      lista: listasRecuperacao.trial,
    },
    {
      grupo: 'churn',
      titulo: 'Ex-pagantes',
      descricao: 'Já pagaram e hoje não pagam — inclui cancelados e inadimplentes. Oferta de volta.',
      icon: 'mdi:account-reactivate',
      tom: 'danger',
      lista: listasRecuperacao.churn,
    },
  ]

  const grade = isSmallScreen ? 'minmax(0, 1fr)' : 'repeat(auto-fit, minmax(280px, 1fr))'

  return (
    <div>
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#344848' }}>Lembretes de vencimento</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Saem direto pela instância <code>mensalli_master</code>, um a cada 15 segundos.
          A aba precisa ficar aberta até o fim do envio.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: grade, gap: 12 }}>
          {lembretes.map(b => (
            <CardBucket key={b.grupo} {...b} carregando={carregando} onDisparar={onDisparar} />
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#344848' }}>Recuperação</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Disparo em lote pelo n8n, com oferta escolhida no momento do envio.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: grade, gap: 12 }}>
          {recuperacoes.map(b => (
            <CardBucket key={b.grupo} {...b} carregando={carregando} onDisparar={onDisparar} />
          ))}
        </div>
      </section>

      <section style={{ paddingTop: 24, borderTop: '1px solid var(--color-border-subtle)' }}>
        <RetencaoSaas />
      </section>
    </div>
  )
}

/* ---------- Card de bucket ---------- */

const TONS = {
  warning: { borda: 'var(--warning-500)', icone: 'var(--warning-700)' },
  danger: { borda: 'var(--danger-500)', icone: 'var(--danger-700)' },
  info: { borda: 'var(--info-500)', icone: 'var(--info-700)' },
}

function CardBucket({ grupo, titulo, descricao, icon, tom, lista, carregando, onDisparar }) {
  const cores = TONS[tom]
  const total = lista?.length || 0
  const semTelefone = (lista || []).filter(c => !telefoneDaConta(c)).length

  return (
    <div style={{
      border: '1px solid var(--color-border-subtle)',
      borderLeft: `3px solid ${cores.borda}`,
      borderRadius: 'var(--radius-xl)',
      padding: 16,
      backgroundColor: 'var(--color-bg-surface)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon icon={icon} width={18} height={18} style={{ color: cores.icone }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{titulo}</span>
      </div>

      <div style={{ fontSize: 32, fontWeight: 700, color: '#344848', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {carregando ? '—' : total}
      </div>

      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, flex: 1 }}>
        {descricao}
      </div>

      {semTelefone > 0 && (
        <div style={{ fontSize: 11, color: 'var(--warning-700)' }}>
          {semTelefone} sem telefone — não recebem.
        </div>
      )}

      {total > 0 && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          {lista.slice(0, 3).map(c => nomeDaConta(c)).join(' · ')}
          {total > 3 && ` · +${total - 3}`}
        </div>
      )}

      <Button
        variant={total > 0 ? 'primary' : 'outline'}
        icon="mdi:send"
        disabled={total === 0 || carregando}
        fullWidth
        onClick={() => onDisparar({ grupo, lista })}
      >
        {total > 0 ? `Enviar para ${total}` : 'Ninguém neste grupo'}
      </Button>
    </div>
  )
}
