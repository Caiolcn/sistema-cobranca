import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { useUser } from './contexts/UserContext'
import { useUserPlan } from './hooks/useUserPlan'

const VARIAVEIS_DISPONIVEIS = [
  { chave: 'nomeCliente', desc: 'Nome completo do aluno' },
  { chave: 'cpfCliente', desc: 'CPF do aluno' },
  { chave: 'telefoneCliente', desc: 'Telefone do aluno' },
  { chave: 'emailCliente', desc: 'E-mail do aluno' },
  { chave: 'dataNascimento', desc: 'Data de nascimento' },
  { chave: 'nomeResponsavel', desc: 'Nome do responsável legal' },
  { chave: 'telefoneResponsavel', desc: 'Telefone do responsável' },
  { chave: 'nomePlano', desc: 'Nome do plano contratado' },
  { chave: 'valorPlano', desc: 'Valor do plano' },
  { chave: 'nomeEmpresa', desc: 'Nome da sua empresa' },
  { chave: 'dataAtual', desc: 'Data do envio (ex: 22/04/2026)' }
]

const TEMPLATE_EXEMPLO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

Pelo presente instrumento, {{nomeEmpresa}}, doravante denominada CONTRATADA, e {{nomeCliente}}, CPF {{cpfCliente}}, doravante denominado(a) CONTRATANTE, têm entre si justo e contratado o seguinte:

1. OBJETO
A CONTRATADA prestará os serviços conforme plano "{{nomePlano}}", pelo valor mensal de {{valorPlano}}.

2. VIGÊNCIA
Este contrato entra em vigor na data da assinatura e tem prazo indeterminado, podendo ser rescindido por qualquer das partes mediante aviso prévio de 30 dias.

3. PAGAMENTO
O pagamento será efetuado mensalmente, via Pix ou outro meio acordado.

4. OBRIGAÇÕES DO CONTRATANTE
a) Efetuar os pagamentos em dia;
b) Respeitar os horários e regras da CONTRATADA;
c) Comunicar mudanças de dados cadastrais.

5. DISPOSIÇÕES GERAIS
Ambas as partes declaram estar de acordo com as cláusulas aqui estabelecidas.

Data: {{dataAtual}}

_________________________
{{nomeCliente}}
CONTRATANTE`

export default function ContratosTemplates() {
  const { userId, loading: loadingUser } = useUser()
  const { isLocked, loading: loadingPlan } = useUserPlan()

  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  const [mostrarModal, setMostrarModal] = useState(false)
  const [templateEditando, setTemplateEditando] = useState(null)
  const [formTitulo, setFormTitulo] = useState('')
  const [formConteudo, setFormConteudo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState({ show: false, template: null })

  const plano = isLocked('pro')
  const locked = plano

  const carregarTemplates = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('contratos_templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      showToast('Erro ao carregar templates: ' + error.message, 'error')
    } else {
      setTemplates(data || [])
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { carregarTemplates() }, [carregarTemplates])

  const abrirNovoTemplate = () => {
    setTemplateEditando(null)
    setFormTitulo('')
    setFormConteudo(TEMPLATE_EXEMPLO)
    setMostrarModal(true)
  }

  const abrirEditarTemplate = (t) => {
    setTemplateEditando(t)
    setFormTitulo(t.titulo)
    setFormConteudo(t.conteudo)
    setMostrarModal(true)
  }

  const salvarTemplate = async () => {
    if (!formTitulo.trim() || !formConteudo.trim()) {
      showToast('Preencha título e conteúdo', 'warning')
      return
    }
    setSalvando(true)
    const payload = {
      user_id: userId,
      titulo: formTitulo.trim(),
      conteudo: formConteudo
    }
    const { error } = templateEditando
      ? await supabase.from('contratos_templates').update(payload).eq('id', templateEditando.id)
      : await supabase.from('contratos_templates').insert(payload)

    setSalvando(false)
    if (error) {
      showToast('Erro ao salvar: ' + error.message, 'error')
      return
    }
    showToast(templateEditando ? 'Template atualizado!' : 'Template criado!', 'success')
    setMostrarModal(false)
    carregarTemplates()
  }

  const deletarTemplate = async () => {
    const t = confirmDelete.template
    setConfirmDelete({ show: false, template: null })
    const { error } = await supabase.from('contratos_templates').delete().eq('id', t.id)
    if (error) {
      showToast('Erro ao deletar: ' + error.message, 'error')
      return
    }
    showToast('Template excluído', 'success')
    carregarTemplates()
  }

  const inserirVariavel = (chave) => {
    const textarea = document.getElementById('contrato-conteudo-textarea')
    if (!textarea) {
      setFormConteudo(prev => prev + ` {{${chave}}}`)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const novo = formConteudo.slice(0, start) + `{{${chave}}}` + formConteudo.slice(end)
    setFormConteudo(novo)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + chave.length + 4, start + chave.length + 4)
    }, 0)
  }

  if (loadingUser || loadingPlan) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Carregando...</div>
  }

  if (locked) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#fff7ed', borderRadius: '12px', border: '1px solid #fed7aa' }}>
        <Icon icon="mdi:lock-outline" width="48" style={{ color: '#ea580c' }} />
        <h3 style={{ margin: '12px 0 6px', color: '#7c2d12' }}>Recurso Pro</h3>
        <p style={{ color: '#9a3412', fontSize: '14px' }}>Os contratos estão disponíveis a partir do plano Pro.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>Contratos</h2>
          <p style={{ fontSize: '13px', color: '#666', margin: '4px 0 0' }}>
            Crie modelos de contrato pra enviar aos alunos com assinatura digital simples.
          </p>
        </div>
        <button
          onClick={abrirNovoTemplate}
          style={{
            padding: '10px 16px', backgroundColor: '#4CAF50', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <Icon icon="mdi:plus" width="18" /> Novo template
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Carregando templates...</div>
      ) : templates.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
          <Icon icon="mdi:file-document-outline" width="48" style={{ color: '#9ca3af' }} />
          <p style={{ margin: '12px 0 4px', fontSize: '15px', fontWeight: '600', color: '#374151' }}>Nenhum template ainda</p>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Clique em "Novo template" pra criar seu primeiro contrato.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {templates.map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '14px 16px', backgroundColor: 'white',
              border: '1px solid #e5e7eb', borderRadius: '10px'
            }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon icon="mdi:file-document-outline" width="22" style={{ color: '#4f46e5' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>
                  {t.titulo}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  Criado em {new Date(t.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button
                  onClick={() => abrirEditarTemplate(t)}
                  title="Editar"
                  style={{ padding: '8px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }}
                >
                  <Icon icon="mdi:pencil-outline" width="16" style={{ color: '#4b5563' }} />
                </button>
                <button
                  onClick={() => setConfirmDelete({ show: true, template: t })}
                  title="Excluir"
                  style={{ padding: '8px', backgroundColor: 'white', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}
                >
                  <Icon icon="mdi:trash-can-outline" width="16" style={{ color: '#dc2626' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar template */}
      {mostrarModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '100%', maxWidth: '760px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700' }}>
                {templateEditando ? 'Editar template' : 'Novo template'}
              </h3>
              <button onClick={() => setMostrarModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Icon icon="mdi:close" width="22" style={{ color: '#666' }} />
              </button>
            </div>

            <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
                Título do contrato
              </label>
              <input
                type="text"
                value={formTitulo}
                onChange={(e) => setFormTitulo(e.target.value)}
                placeholder="Ex: Contrato de Prestação de Serviços"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '16px' }}
              />

              <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
                Variáveis disponíveis (clique pra inserir)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                {VARIAVEIS_DISPONIVEIS.map(v => (
                  <button
                    key={v.chave}
                    onClick={() => inserirVariavel(v.chave)}
                    title={v.desc}
                    style={{ padding: '4px 8px', backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '4px', fontSize: '11px', color: '#3730a3', cursor: 'pointer', fontFamily: 'monospace' }}
                  >
                    {'{{'}{v.chave}{'}}'}
                  </button>
                ))}
              </div>

              <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
                Conteúdo do contrato
              </label>
              <textarea
                id="contrato-conteudo-textarea"
                value={formConteudo}
                onChange={(e) => setFormConteudo(e.target.value)}
                rows={16}
                style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical', lineHeight: '1.6' }}
              />
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setMostrarModal(false)}
                style={{ padding: '10px 16px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={salvarTemplate}
                disabled={salvando}
                style={{ padding: '10px 20px', backgroundColor: salvando ? '#9ca3af' : '#4CAF50', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: salvando ? 'not-allowed' : 'pointer' }}
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmModal
        isOpen={confirmDelete.show}
        onClose={() => setConfirmDelete({ show: false, template: null })}
        onConfirm={deletarTemplate}
        title="Excluir template"
        message={`Tem certeza que deseja excluir "${confirmDelete.template?.titulo}"? Os contratos já enviados permanecem intactos.`}
        confirmText="Excluir"
        danger
      />
    </div>
  )
}
