import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../supabaseClient'
import { showToast } from '../Toast'
import Modal from '../design-system/components/Modal'
import Button from '../design-system/components/Button'
import Input from '../design-system/components/Input'

// Link da Loja da academia (/loja/{slug}) com QR e texto pronto para grupo.
// Mesmo molde do LinkPortalConta: o slug é o agendamento_slug e nasce aqui se faltar.

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = texto; document.body.appendChild(ta)
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
  }
}

export default function LinkLojaConta({ isOpen, onClose, userId }) {
  const [slug, setSlug] = useState(null)
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [lojaAtiva, setLojaAtiva] = useState(true)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(null)
  const qrRef = useRef(null)

  useEffect(() => {
    if (!isOpen || !userId) return
    let cancelado = false

    async function carregar() {
      setCarregando(true)
      setErro(null)
      try {
        const { data: usuario, error } = await supabase
          .from('usuarios').select('agendamento_slug, nome_empresa, loja_ativa').eq('id', userId).single()
        if (error) throw error
        if (cancelado) return
        setNomeEmpresa(usuario.nome_empresa || '')
        setLojaAtiva(!!usuario.loja_ativa)

        let s = usuario.agendamento_slug
        if (!s) {
          const { data: gerado, error: erroRpc } = await supabase.rpc('gerar_agendamento_slug', { nome_empresa: usuario.nome_empresa || 'escola' })
          if (erroRpc || !gerado) throw erroRpc || new Error('slug vazio')
          const { error: erroUpd } = await supabase.from('usuarios').update({ agendamento_slug: gerado }).eq('id', userId)
          if (erroUpd) throw erroUpd
          s = gerado
        }
        if (!cancelado) setSlug(s)
      } catch (e) {
        console.error('Erro ao montar link da loja:', e)
        if (!cancelado) setErro('Não foi possível gerar o link agora. Tente de novo.')
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    carregar()
    return () => { cancelado = true }
  }, [isOpen, userId])

  const link = slug ? `${window.location.origin}/loja/${slug}` : ''
  const textoGrupo = `🛒 *Loja${nomeEmpresa ? ` da ${nomeEmpresa}` : ''}*\n\n` +
    `Matrícula, pacotes, uniformes e inscrições em um só lugar. Você escolhe, se cadastra e paga por Pix ou cartão em 2 minutos:\n${link}`

  const baixarQr = () => {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.download = `loja-${slug}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Link da loja" size="sm">
      <Modal.Body>
        {carregando && <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>Gerando link...</div>}
        {erro && <div style={{ color: '#b91c1c', fontSize: '14px' }}>{erro}</div>}
        {!carregando && !erro && slug && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {!lojaAtiva && (
              <div style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', fontSize: '13px', color: '#92400e', display: 'flex', gap: '8px' }}>
                <Icon icon="mdi:alert-outline" width="18" style={{ flexShrink: 0 }} />
                <span>Sua loja está fora do ar. Ligue em <strong>Marketing › Loja</strong> antes de divulgar o link.</span>
              </div>
            )}
            <Input label="Link da loja" value={link} readOnly
              suffix={<button type="button" onClick={() => { copiar(link); showToast('Link copiado!', 'success') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontWeight: 600, fontSize: '13px' }}>Copiar</button>} />
            <div ref={qrRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '12px' }}>
              <QRCodeCanvas value={link} size={160} includeMargin />
              <Button variant="ghost" size="sm" icon="mdi:download" onClick={baixarQr}>Baixar QR para imprimir</Button>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Texto pronto para o grupo</div>
              <textarea readOnly value={textoGrupo} rows={6}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', backgroundColor: '#fff' }} />
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline" onClick={onClose}>Fechar</Button>
        <Button variant="primary" icon="mdi:content-copy" disabled={!slug} onClick={() => { copiar(textoGrupo); showToast('Texto copiado!', 'success') }}>
          Copiar texto
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
