import { useState } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../../supabaseClient'
import { showToast } from '../../Toast'
import { formatarBRL } from '../../planosMensalli'
import Button from '../../design-system/components/Button'
import Checkbox from '../../design-system/components/Checkbox'
import LojaLink from './LojaLink'
import { Chave, titulo, dica, campo, SELECT_PRODUTO, erroDeSchema, MSG_SQL, lojaNaBio, VERDE } from './lojaUtil'

// Primeira vez na loja (loja_produtos vazia): três passos num card.
// 1) importar planos  2) aparência  3) publicar.
// Cada passo grava na hora e avisa o LojaEditor pelos callbacks, para o
// preview ao lado refletir o que já foi feito.

const PASSOS = [
  { n: 1, label: 'Importar planos' },
  { n: 2, label: 'Aparência' },
  { n: 3, label: 'Publicar' }
]

export default function LojaWizard({
  userId, linha, planos, cfg, setCfg, nomeEmpresa, telefoneEmpresa, asaasOk,
  onProdutosCriados, onCfgSalva, onLojaNoAr, onBioAtualizada, onConcluir, onPular, onIrParaIntegracoes
}) {
  const [passo, setPasso] = useState(1)
  const [ocupado, setOcupado] = useState('')
  const planosAtivos = (planos || []).filter(p => p.ativo !== false)
  const [marcados, setMarcados] = useState(() => new Set(planosAtivos.map(p => p.id)))

  const alternar = (id) => setMarcados(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // ---------- passo 1 ----------
  const importar = async () => {
    const escolhidos = planosAtivos.filter(p => marcados.has(p.id))
    if (!escolhidos.length) { setPasso(2); return }
    setOcupado('importar')
    try {
      const linhas = escolhidos.map((p, i) => ({
        user_id: userId,
        tipo: (p.tipo || 'recorrente') === 'recorrente' ? 'plano' : 'pacote',
        plano_id: p.id,
        nome: p.nome,
        descricao: p.descricao || null,
        valor: Number(p.valor) || 0,
        exigir_turma: (p.tipo || 'recorrente') === 'recorrente',
        qtd_turmas: 1,
        ativo: true,
        ordem: i
      }))
      const { data, error } = await supabase.from('loja_produtos').insert(linhas).select(SELECT_PRODUTO)
      if (error) {
        if (erroDeSchema(error)) { showToast(MSG_SQL, 'error'); return }
        throw error
      }
      onProdutosCriados(data || [])
      showToast(`${data.length} ${data.length === 1 ? 'plano importado' : 'planos importados'}`, 'success')
      setPasso(2)
    } catch (err) {
      showToast('Erro ao importar: ' + err.message, 'error')
    } finally {
      setOcupado('')
    }
  }

  // ---------- passo 2 ----------
  const setRetirada = (patch) => setCfg(prev => ({ ...prev, retirada: { ...prev.retirada, ...patch } }))
  const setAparencia = (patch) => setCfg(prev => ({ ...prev, aparencia: { ...prev.aparencia, ...patch } }))

  const salvarAparencia = async () => {
    setOcupado('cfg')
    try {
      const final = {
        ...cfg,
        titulo: cfg.titulo.trim() || nomeEmpresa || '',
        suporte_whatsapp: ''   // a loja usa sempre o WhatsApp da conta
      }
      const { error } = await supabase.from('usuarios').update({ loja_config: final }).eq('id', userId)
      if (error) {
        if (erroDeSchema(error)) { showToast(MSG_SQL, 'error'); return }
        throw error
      }
      onCfgSalva(final)
      setPasso(3)
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error')
    } finally {
      setOcupado('')
    }
  }

  // ---------- passo 3 ----------
  const colocarNoAr = async () => {
    if (!asaasOk) return
    setOcupado('ar')
    try {
      const { error } = await supabase.from('usuarios').update({ loja_ativa: true }).eq('id', userId)
      if (error) {
        if (erroDeSchema(error)) { showToast(MSG_SQL, 'error'); return }
        throw error
      }
      await onLojaNoAr()
      showToast('Sua loja está no ar!', 'success')
    } catch (err) {
      showToast('Erro ao publicar: ' + err.message, 'error')
    } finally {
      setOcupado('')
    }
  }

  const noAr = !!linha.loja_ativa
  const jaNaBio = lojaNaBio(linha.bio_config)

  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '18px', marginBottom: '14px' }}>
      {/* cabeçalho com os passos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {PASSOS.map((p, i) => {
          const feito = passo > p.n
          const atual = passo === p.n
          return (
            <div key={p.n} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button type="button" onClick={() => feito && setPasso(p.n)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '999px', border: 'none', cursor: feito ? 'pointer' : 'default', fontSize: '12.5px', fontWeight: 700, backgroundColor: atual ? '#111827' : feito ? '#dcfce7' : '#f3f4f6', color: atual ? '#fff' : feito ? '#166534' : '#6b7280' }}>
                <span style={{ width: '18px', height: '18px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', backgroundColor: atual ? 'rgba(255,255,255,0.2)' : feito ? '#16a34a' : '#e5e7eb', color: atual || feito ? '#fff' : '#6b7280' }}>
                  {feito ? <Icon icon="mdi:check" width="12" /> : p.n}
                </span>
                {p.label}
              </button>
              {i < PASSOS.length - 1 && <span style={{ width: '14px', height: '1px', backgroundColor: '#e5e7eb' }} />}
            </div>
          )
        })}
      </div>

      {passo === 1 && (
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>Quais planos você quer vender na loja?</h3>
          <p style={dica}>Nome, preço e ciclo vêm dos seus planos. Planos recorrentes entram como "Plano" (aluno escolhe turma depois de pagar); pacotes entram como "Pacote".</p>
          {planosAtivos.length === 0 ? (
            <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
              Você ainda não tem planos ativos. Pode cadastrar em Configurações › Planos ou seguir e adicionar produtos e eventos.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '6px' }}>
              {planosAtivos.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e5e7eb', backgroundColor: marcados.has(p.id) ? '#f0fdf4' : '#fff' }}>
                  <Checkbox checked={marcados.has(p.id)} onChange={() => alternar(p.id)}
                    label={p.nome}
                    description={`${formatarBRL(p.valor)} · ${p.tipo === 'pacote' ? `pacote de ${p.numero_aulas || '?'} aulas` : (p.ciclo_cobranca || 'mensal')}`} />
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '16px' }}>
            <Button variant="primary" onClick={importar} loading={ocupado === 'importar'}>
              {marcados.size ? `Importar ${marcados.size} ${marcados.size === 1 ? 'plano' : 'planos'}` : 'Continuar sem importar'}
            </Button>
            <button type="button" onClick={onPular} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>
              Começar do zero
            </button>
          </div>
        </div>
      )}

      {passo === 2 && (
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>Como a loja se apresenta</h3>
          <p style={dica}>Dá para mudar tudo depois em Configurar.</p>
          <div style={{ display: 'grid', gap: '14px' }}>
            <div>
              <span style={titulo}>Título da loja</span>
              <input value={cfg.titulo} maxLength={60} onChange={(e) => setCfg(prev => ({ ...prev, titulo: e.target.value }))} placeholder={nomeEmpresa || 'Nome da academia'} style={campo} />
            </div>
            <div>
              <span style={titulo}>Frase curta</span>
              <input value={cfg.frase} maxLength={120} onChange={(e) => setCfg(prev => ({ ...prev, frase: e.target.value }))} placeholder="Ex.: Planos, pacotes e produtos oficiais" style={campo} />
            </div>
            <Chave ligado={cfg.aparencia.herdar_bio} onChange={(v) => setAparencia({ herdar_bio: v })}>
              <strong>Herdar o visual da bio</strong> <span style={{ color: '#6b7280' }}>(mesmas cores e fonte do link na bio)</span>
            </Chave>
            <div>
              <Chave ligado={cfg.retirada.ativa} onChange={(v) => setRetirada({ ativa: v })}>
                <strong>Retirada presencial</strong> <span style={{ color: '#6b7280' }}>(para produtos físicos)</span>
              </Chave>
              {cfg.retirada.ativa && (
                <div style={{ display: 'grid', gap: '8px', marginTop: '6px' }}>
                  <input value={cfg.retirada.endereco} maxLength={160} onChange={(e) => setRetirada({ endereco: e.target.value })} placeholder="Endereço de retirada" style={campo} />
                  <input value={cfg.retirada.horario} maxLength={120} onChange={(e) => setRetirada({ horario: e.target.value })} placeholder="Horário. Ex.: seg a sex, 8h às 20h" style={campo} />
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '16px' }}>
            <Button variant="primary" onClick={salvarAparencia} loading={ocupado === 'cfg'}>Salvar e continuar</Button>
            <Button variant="ghost" onClick={() => setPasso(1)}>Voltar</Button>
          </div>
        </div>
      )}

      {passo === 3 && (
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>Pronto para publicar</h3>
          <p style={dica}>Este é o endereço da sua loja. Divulgue no grupo, na bio e na recepção.</p>
          <LojaLink slug={linha.agendamento_slug} nomeEmpresa={nomeEmpresa} noAr={noAr} />

          <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '16px 0' }} />

          {!asaasOk && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px', borderRadius: '10px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', fontSize: '13px', color: '#92400e', lineHeight: 1.5, marginBottom: '12px' }}>
              <Icon icon="mdi:alert-outline" width="18" style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>
                Para receber os pagamentos a loja precisa do <strong>Asaas conectado</strong>. Até lá ela fica fora do ar.
                {onIrParaIntegracoes && <> <button type="button" onClick={onIrParaIntegracoes} style={{ background: 'none', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontWeight: 700 }}>Conectar Asaas</button></>}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {noAr ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#166534' }}>
                <Icon icon="mdi:check-circle" width="18" style={{ color: VERDE }} /> Loja no ar
              </span>
            ) : (
              <Button variant="primary" icon="mdi:rocket-launch-outline" onClick={colocarNoAr} loading={ocupado === 'ar'} disabled={!asaasOk}>Colocar loja no ar</Button>
            )}
          </div>
          <p style={{ ...dica, margin: '10px 0 0' }}>
            {jaNaBio ? 'O botão da loja já está na sua bio.' : 'Para mostrar o botão da loja na sua bio, ligue "Loja e matrícula" em Marketing › Link na bio.'}
          </p>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '18px' }}>
            <Button variant="secondary" onClick={onConcluir}>Ir para o editor</Button>
            <Button variant="ghost" onClick={() => setPasso(2)}>Voltar</Button>
          </div>
        </div>
      )}
    </div>
  )
}
