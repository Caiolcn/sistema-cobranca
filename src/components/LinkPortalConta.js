import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../supabaseClient'
import { showToast } from '../Toast'
import Modal from '../design-system/components/Modal'
import Button from '../design-system/components/Button'
import Input from '../design-system/components/Input'

// Link único do portal da escola (/portal/c/{slug}). Um link só pro grupo, bio
// ou recepção: o aluno digita o WhatsApp e recebe o link individual dele no
// número cadastrado (edge function portal-solicitar-acesso). O slug é o mesmo
// do agendamento online (usuarios.agendamento_slug) e nasce aqui se faltar.

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = texto; document.body.appendChild(ta)
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
  }
}

export default function LinkPortalConta({ isOpen, onClose, userId }) {
  const [slug, setSlug] = useState(null)
  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [conectado, setConectado] = useState(true)
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
        const [{ data: usuario, error }, { data: zap }] = await Promise.all([
          supabase.from('usuarios').select('agendamento_slug, nome_empresa').eq('id', userId).single(),
          supabase.from('mensallizap').select('id').eq('user_id', userId).eq('conectado', true).limit(1),
        ])
        if (error) throw error
        if (cancelado) return
        setNomeEmpresa(usuario.nome_empresa || '')
        setConectado((zap || []).length > 0)

        let s = usuario.agendamento_slug
        if (!s) {
          const { data: gerado, error: erroRpc } = await supabase.rpc('gerar_agendamento_slug', {
            nome_empresa: usuario.nome_empresa || 'escola'
          })
          if (erroRpc || !gerado) throw erroRpc || new Error('slug vazio')
          const { error: erroUpd } = await supabase.from('usuarios').update({ agendamento_slug: gerado }).eq('id', userId)
          if (erroUpd) throw erroUpd
          s = gerado
        }
        if (!cancelado) setSlug(s)
      } catch (e) {
        console.error('Erro ao montar link do portal:', e)
        if (!cancelado) setErro('Não foi possível gerar o link agora. Tente de novo.')
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    carregar()
    return () => { cancelado = true }
  }, [isOpen, userId])

  const link = slug ? `${window.location.origin}/portal/c/${slug}` : ''
  const textoGrupo = `📲 *Portal do aluno${nomeEmpresa ? ` da ${nomeEmpresa}` : ''}*\n\n` +
    `Por lá você vê suas mensalidades, paga pelo PIX e confere seus horários.\n\n` +
    `É só abrir o link, digitar seu WhatsApp e tocar no link que chegar pra você:\n${link}`

  const baixarQr = () => {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `qrcode-portal-${slug}.png`
    a.click()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Link do portal da sua escola"
      subtitle="Um link só pra todos os alunos. Mande no grupo, na bio ou deixe o QR na recepção."
      size="md"
    >
      <Modal.Body>
        {carregando || (!slug && !erro) ? (
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Gerando link...</p>
        ) : erro ? (
          <p style={{ margin: 0, color: '#dc2626', fontSize: 14 }}>{erro}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!conectado && (
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12,
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                fontSize: 13, color: '#92400e', lineHeight: 1.5
              }}>
                <Icon icon="mdi:alert-outline" width="18" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Seu WhatsApp está desconectado. O link de acesso sai pelo WhatsApp da escola, então conecte antes de divulgar.</span>
              </div>
            )}

            <Input label="Link" value={link} readOnly onFocus={e => e.target.select()} />

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                icon="mdi:content-copy"
                onClick={async () => { await copiar(link); showToast('Link copiado', 'success') }}
              >
                Copiar link
              </Button>
              <Button
                variant="outline"
                icon="mdi:whatsapp"
                onClick={async () => { await copiar(textoGrupo); showToast('Texto copiado — é só colar no grupo', 'success') }}
              >
                Copiar texto pro grupo
              </Button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div ref={qrRef} style={{ padding: 8, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, lineHeight: 0 }}>
                <QRCodeCanvas value={link} size={120} marginSize={1} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                  Imprima e deixe na recepção: o aluno aponta a câmera e entra.
                </p>
                <Button variant="outline" size="sm" icon="mdi:download" onClick={baixarQr}>
                  Baixar QR Code
                </Button>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
              Como funciona: o aluno digita o WhatsApp e recebe o link dele no número do cadastro (ou do responsável).
              Ninguém entra no portal de outro aluno só sabendo o telefone.
            </p>
          </div>
        )}
      </Modal.Body>
    </Modal>
  )
}
