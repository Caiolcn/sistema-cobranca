import { useState } from 'react'
import whatsappService from './services/whatsappService'
import { Icon } from '@iconify/react'

export default function TesteWhatsApp() {
  const [telefone, setTelefone] = useState('')
  const [mensagem, setMensagem] = useState('Olá! Esta é uma mensagem de teste do sistema de cobranças. 🚀')
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState(null)

  const enviarTesteMensagem = async () => {
    if (!telefone.trim()) {
      alert('Digite um número de telefone')
      return
    }

    if (!mensagem.trim()) {
      alert('Digite uma mensagem')
      return
    }

    setLoading(true)
    setResultado(null)

    try {
      console.log('📤 Enviando mensagem de teste...')
      console.log('📞 Telefone:', telefone)
      console.log('💬 Mensagem:', mensagem)

      const resultado = await whatsappService.enviarMensagem(telefone, mensagem)

      console.log('📊 Resultado:', resultado)

      setResultado(resultado)

      if (resultado.sucesso) {
        alert('✅ Mensagem enviada com sucesso!')
      } else {
        alert(`❌ Erro ao enviar: ${resultado.erro}`)
      }
    } catch (error) {
      console.error('❌ Erro:', error)
      setResultado({
        sucesso: false,
        erro: error.message
      })
      alert(`❌ Erro: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ flex: 1, padding: '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '25px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Icon icon="mdi:test-tube" width="32" height="32" style={{ color: '#2196F3' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>
              Teste de Envio WhatsApp
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
              Envie uma mensagem de teste para validar a integração
            </p>
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '30px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        maxWidth: '600px'
      }}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#344848' }}>
            Número de Telefone
          </label>
          <input
            type="text"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="Ex: (62) 98246-6639 ou 62982466639"
            style={{
              width: '100%',
              padding: '12px 14px',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: 'inherit',
              outline: 'none'
            }}
          />
          <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>
            Pode incluir ou não o código do país (55). O sistema adiciona automaticamente.
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#344848' }}>
            Mensagem
          </label>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Digite a mensagem que deseja enviar..."
            style={{
              width: '100%',
              minHeight: '150px',
              padding: '12px 14px',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: 'inherit',
              lineHeight: '1.5',
              resize: 'vertical',
              outline: 'none'
            }}
          />
        </div>

        <button
          onClick={enviarTesteMensagem}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: '#25D366',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            opacity: loading ? 0.7 : 1,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#20BA5A')}
          onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#25D366')}
        >
          {loading ? (
            <>
              <Icon icon="eos-icons:loading" width="24" height="24" />
              Enviando...
            </>
          ) : (
            <>
              <Icon icon="mdi:send" width="24" height="24" />
              Enviar Mensagem de Teste
            </>
          )}
        </button>

        {/* Resultado */}
        {resultado && (
          <div style={{
            marginTop: '20px',
            padding: '16px',
            backgroundColor: resultado.sucesso ? '#e8f5e9' : '#ffebee',
            border: `1px solid ${resultado.sucesso ? '#4CAF50' : '#f44336'}`,
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <Icon
                icon={resultado.sucesso ? 'mdi:check-circle' : 'mdi:alert-circle'}
                width="24"
                height="24"
                style={{ color: resultado.sucesso ? '#4CAF50' : '#f44336' }}
              />
              <strong style={{ fontSize: '14px', color: resultado.sucesso ? '#2e7d32' : '#c62828' }}>
                {resultado.sucesso ? 'Mensagem Enviada!' : 'Erro ao Enviar'}
              </strong>
            </div>

            {resultado.sucesso && resultado.messageId && (
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#2e7d32' }}>
                <strong>Message ID:</strong> {resultado.messageId}
              </p>
            )}

            {!resultado.sucesso && resultado.erro && (
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#c62828' }}>
                <strong>Erro:</strong> {resultado.erro}
              </p>
            )}

            <details style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
              <summary style={{ cursor: 'pointer', fontWeight: '500' }}>Ver resposta completa da API</summary>
              <pre style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: 'rgba(0,0,0,0.05)',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '11px'
              }}>
                {JSON.stringify(resultado.dados || resultado, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>

      {/* Instruções */}
      <div style={{
        marginTop: '25px',
        padding: '16px',
        backgroundColor: '#e3f2fd',
        border: '1px solid #2196F3',
        borderRadius: '8px',
        maxWidth: '600px'
      }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Icon icon="mdi:information" width="24" height="24" style={{ color: '#2196F3', flexShrink: 0 }} />
          <div style={{ fontSize: '13px', color: '#1565c0', lineHeight: '1.6' }}>
            <strong>Dicas para teste:</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
              <li>Use seu próprio número para testar</li>
              <li>Verifique o console (F12) para ver logs detalhados</li>
              <li>Se der erro, verifique se o WhatsApp está conectado na aba "WhatsApp"</li>
              <li>O número pode ter ou não formatação - o sistema trata automaticamente</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
