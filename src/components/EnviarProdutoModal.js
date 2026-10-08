import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import { showToast } from '../Toast'
import whatsappService from '../services/whatsappService'
import Modal from '../design-system/components/Modal'
import Button from '../design-system/components/Button'

// "Enviar produto" na ficha do aluno: escolhe um item da Loja e manda pelo
// WhatsApp o link já com o cadastro pré-preenchido (?aluno=portal_token).

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
const TIPO = { plano: 'Plano', pacote: 'Pacote', produto: 'Produto', evento: 'Evento' }

export default function EnviarProdutoModal({ isOpen, onClose, userId, cliente }) {
  const [produtos, setProdutos] = useState(null)
  const [slug, setSlug] = useState(null)
  const [sel, setSel] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!isOpen || !userId) return
    let cancelado = false
    setSel(null)
    Promise.all([
      supabase.from('loja_produtos').select('id, tipo, nome, valor, imagem_url, ativo').eq('user_id', userId).eq('ativo', true).order('ordem'),
      supabase.from('usuarios').select('agendamento_slug, loja_ativa, nome_empresa').eq('id', userId).maybeSingle(),
    ]).then(([p, u]) => {
      if (cancelado) return
      setProdutos(p.data || [])
      setSlug(u.data?.loja_ativa ? u.data?.agendamento_slug : null)
    })
    return () => { cancelado = true }
  }, [isOpen, userId])

  const link = (produto) => `${window.location.origin}/loja/${slug}/p/${produto.id}?aluno=${cliente?.portal_token || ''}&o=ficha`

  const enviar = async () => {
    if (!sel || !cliente) return
    const telefone = cliente.responsavel_telefone || cliente.telefone
    const nome = (cliente.responsavel_nome || cliente.nome || 'Aluno').split(' ')[0]
    const msg = `Olá, ${nome}! 👋\n\nSeparei isso pra você: *${sel.nome}* (${fmt(sel.valor)}).\n\nÉ só abrir o link, conferir seus dados e pagar por Pix ou cartão:\n${link(sel)}\n\nQualquer dúvida, me chama! 😊`
    setEnviando(true)
    try {
      const r = await whatsappService.enviarMensagem(telefone, msg)
      if (r.sucesso) { showToast('Link do produto enviado por WhatsApp!', 'success'); onClose() }
      else showToast(r.erro || 'Erro ao enviar', 'warning')
    } catch {
      showToast('Erro ao enviar WhatsApp', 'error')
    } finally {
      setEnviando(false)
    }
  }

  const copiar = async () => {
    if (!sel) return
    try { await navigator.clipboard.writeText(link(sel)); showToast('Link copiado!', 'success') } catch { showToast('Não foi possível copiar', 'warning') }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enviar produto da loja" subtitle={cliente?.nome} size="sm">
      <Modal.Body>
        {produtos === null && <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>Carregando...</div>}
        {produtos !== null && !slug && (
          <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', fontSize: '13px', color: '#92400e' }}>
            Sua loja está fora do ar. Ligue em <strong>Marketing › Loja</strong> para enviar produtos pelo link.
          </div>
        )}
        {produtos !== null && slug && produtos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280', fontSize: '14px' }}>Nenhum item ativo na loja.</div>
        )}
        {produtos !== null && slug && produtos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
            {produtos.map((p) => {
              const ativo = sel?.id === p.id
              return (
                <button key={p.id} type="button" onClick={() => setSel(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
                    border: `1.5px solid ${ativo ? '#4CAF50' : '#e5e7eb'}`, backgroundColor: ativo ? '#f0fdf4' : '#fff' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#f3f4f6', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {p.imagem_url ? <img src={p.imagem_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon icon="mdi:tag-outline" width="20" style={{ color: '#9ca3af' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{TIPO[p.tipo] || p.tipo} · {fmt(p.valor)}</div>
                  </div>
                  {ativo && <Icon icon="mdi:check-circle" width="20" style={{ color: '#4CAF50' }} />}
                </button>
              )
            })}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline" onClick={copiar} disabled={!sel} icon="mdi:content-copy">Copiar link</Button>
        <Button variant="whatsapp" onClick={enviar} disabled={!sel || enviando} loading={enviando} icon="mdi:whatsapp">Enviar no WhatsApp</Button>
      </Modal.Footer>
    </Modal>
  )
}
