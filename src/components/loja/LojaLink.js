import { useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { QRCodeCanvas } from 'qrcode.react'
import { showToast } from '../../Toast'
import { copiar, linkLoja, textoGrupoLoja } from './lojaUtil'

// Link público da loja + QR + texto pronto para o grupo (molde: LinkPortalConta).
// Usado no passo "Publicar" do wizard e na sub-aba Configurar.

const botao = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '13px', cursor: 'pointer', textDecoration: 'none' }

export default function LojaLink({ slug, nomeEmpresa, noAr = true }) {
  const qrRef = useRef(null)
  const [copiado, setCopiado] = useState('')
  const link = linkLoja(slug)

  if (!slug) {
    return <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Gerando o endereço da loja...</p>
  }

  const marcar = (qual) => { setCopiado(qual); setTimeout(() => setCopiado(''), 1500) }

  const baixarQr = () => {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `qrcode-loja-${slug}.png`
    a.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px', fontSize: '13px', fontWeight: 700, color: noAr ? '#14532d' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '9px 12px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          {link}
        </div>
        <button type="button" style={botao} onClick={async () => { await copiar(link); marcar('link') }}>
          <Icon icon={copiado === 'link' ? 'mdi:check' : 'mdi:content-copy'} width="16" /> {copiado === 'link' ? 'Copiado' : 'Copiar'}
        </button>
        <a href={link} target="_blank" rel="noopener noreferrer" style={botao}>
          <Icon icon="mdi:open-in-new" width="16" /> Abrir
        </a>
      </div>

      {!noAr && (
        <div style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>
          A loja está fora do ar: o link abre uma página de "indisponível" até você ligar <strong>Loja no ar</strong>.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div ref={qrRef} style={{ padding: '8px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', lineHeight: 0 }}>
          <QRCodeCanvas value={link} size={104} marginSize={1} />
        </div>
        <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b', lineHeight: 1.5 }}>
            Imprima o QR para a recepção ou mande o texto pronto no grupo de alunos.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" style={botao} onClick={baixarQr}>
              <Icon icon="mdi:download" width="16" /> Baixar QR
            </button>
            <button type="button" style={{ ...botao, borderColor: '#86efac', color: '#166534' }}
              onClick={async () => { await copiar(textoGrupoLoja(nomeEmpresa, link)); marcar('texto'); showToast('Texto copiado. É só colar no grupo.', 'success') }}>
              <Icon icon={copiado === 'texto' ? 'mdi:check' : 'mdi:whatsapp'} width="16" /> Texto para o grupo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
