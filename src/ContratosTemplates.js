import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { useUser } from './contexts/UserContext'
import { useUserPlan } from './hooks/useUserPlan'

const VARIAVEIS_DISPONIVEIS = [
  { chave: 'dadosCliente', desc: 'Texto corrido com os dados da ficha do aluno (nome, CPF, nascimento, telefone, e-mail, endereço e responsável), separados por vírgula. Pula campos vazios.', bloco: true },
  { chave: 'dadosEmpresa', desc: 'Texto corrido com os dados da sua empresa (nome, CNPJ, endereço, telefone, e-mail e site), separados por vírgula. Pula campos vazios.', bloco: true },
  { chave: 'nomeCliente', desc: 'Nome completo do aluno' },
  { chave: 'cpfCliente', desc: 'CPF do aluno' },
  { chave: 'telefoneCliente', desc: 'Telefone do aluno' },
  { chave: 'emailCliente', desc: 'E-mail do aluno' },
  { chave: 'dataNascimento', desc: 'Data de nascimento' },
  { chave: 'nomeResponsavel', desc: 'Nome do responsável legal' },
  { chave: 'telefoneResponsavel', desc: 'Telefone do responsável' },
  { chave: 'enderecoCompletoCliente', desc: 'Endereço completo formatado (rua, número, complemento, bairro, cidade/UF, CEP)' },
  { chave: 'enderecoCliente', desc: 'Rua/logradouro do aluno' },
  { chave: 'numeroCliente', desc: 'Número do endereço' },
  { chave: 'complementoCliente', desc: 'Complemento do endereço (apto, bloco, etc.)' },
  { chave: 'bairroCliente', desc: 'Bairro do aluno' },
  { chave: 'cidadeCliente', desc: 'Cidade do aluno' },
  { chave: 'estadoCliente', desc: 'UF do aluno' },
  { chave: 'cepCliente', desc: 'CEP do aluno' },
  { chave: 'nomePlano', desc: 'Nome do plano contratado' },
  { chave: 'valorPlano', desc: 'Valor do plano' },
  { chave: 'nomeEmpresa', desc: 'Nome da sua empresa' },
  { chave: 'dataAtual', desc: 'Data do envio (ex: 22/04/2026)' }
]

const MODELO_MENSALIDADE_ADULTO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

Pelo presente instrumento particular, de um lado {{nomeEmpresa}}, doravante denominada CONTRATADA, e de outro {{nomeCliente}}, CPF {{cpfCliente}}, telefone {{telefoneCliente}}, doravante denominado(a) CONTRATANTE, têm entre si justo e contratado o seguinte:

CLÁUSULA 1ª — DO OBJETO
A CONTRATADA prestará ao CONTRATANTE os serviços conforme plano "{{nomePlano}}", nas dependências da CONTRATADA, dentro dos horários e condições por ela estabelecidos.

CLÁUSULA 2ª — DA VIGÊNCIA
O presente contrato tem prazo indeterminado, com início na data de assinatura, podendo ser rescindido por qualquer das partes mediante comunicação prévia de 30 (trinta) dias.

CLÁUSULA 3ª — DO VALOR E PAGAMENTO
O CONTRATANTE pagará mensalmente o valor de {{valorPlano}}, com vencimento conforme acordado no ato da matrícula. O atraso superior a 10 (dez) dias implica suspensão do acesso até regularização do débito.

CLÁUSULA 4ª — DAS OBRIGAÇÕES DO CONTRATANTE
a) Efetuar os pagamentos pontualmente, na forma e prazo ajustados;
b) Respeitar as normas internas, horários e demais regulamentos da CONTRATADA;
c) Comunicar quaisquer alterações de dados cadastrais;
d) Apresentar atestado médico quando solicitado pela CONTRATADA;
e) Informar restrições médicas, lesões ou condições especiais que impactem a prática.

CLÁUSULA 5ª — DA AUTORIZAÇÃO DE USO DE IMAGEM
O CONTRATANTE autoriza, em caráter gratuito, o uso de sua imagem captada durante as atividades em materiais institucionais e redes sociais da CONTRATADA, podendo, a qualquer tempo, revogar tal autorização mediante comunicação por escrito.

CLÁUSULA 6ª — DAS DISPOSIÇÕES GERAIS
As partes declaram, sob as penas da lei, estarem de pleno acordo com as cláusulas aqui estabelecidas. Fica eleito o foro da comarca da sede da CONTRATADA para dirimir eventuais controvérsias oriundas deste contrato.

E por estarem justas e contratadas, as partes assinam o presente instrumento.

Data: {{dataAtual}}


_________________________________
{{nomeCliente}}
CPF: {{cpfCliente}}
CONTRATANTE


_________________________________
{{nomeEmpresa}}
CONTRATADA`

const MODELO_MENSALIDADE_MENOR = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS — ALUNO MENOR DE IDADE

Pelo presente instrumento particular, de um lado {{nomeEmpresa}}, doravante denominada CONTRATADA, e de outro {{nomeResponsavel}}, telefone {{telefoneResponsavel}}, na qualidade de responsável legal pelo(a) menor {{nomeCliente}}, nascido(a) em {{dataNascimento}}, doravante denominado(a) ALUNO(A), têm entre si justo e contratado o seguinte:

CLÁUSULA 1ª — DO OBJETO
A CONTRATADA prestará ao(à) ALUNO(A) os serviços conforme plano "{{nomePlano}}", nas dependências da CONTRATADA, dentro dos horários e condições por ela estabelecidos.

CLÁUSULA 2ª — DA AUTORIZAÇÃO E RESPONSABILIDADE PARENTAL
O(A) RESPONSÁVEL declara expressamente:
a) Autorizar a participação do(a) ALUNO(A) em todas as atividades oferecidas pela CONTRATADA dentro do plano contratado;
b) Estar ciente da natureza das atividades praticadas e dos eventuais riscos inerentes;
c) Que o(a) ALUNO(A) se encontra em condições físicas e de saúde compatíveis com a prática, comprometendo-se a comunicar qualquer alteração.

CLÁUSULA 3ª — DA VIGÊNCIA
O presente contrato tem prazo indeterminado, com início na data de assinatura, podendo ser rescindido por qualquer das partes mediante comunicação prévia de 30 (trinta) dias.

CLÁUSULA 4ª — DO VALOR E PAGAMENTO
O(A) RESPONSÁVEL pagará mensalmente o valor de {{valorPlano}}, com vencimento conforme acordado no ato da matrícula. O atraso superior a 10 (dez) dias implica suspensão do acesso até regularização do débito.

CLÁUSULA 5ª — DA ENTRADA, SAÍDA E EMERGÊNCIAS
a) O(A) ALUNO(A) somente poderá ser entregue ou retirado pelo(a) RESPONSÁVEL ou por pessoas previamente autorizadas por escrito;
b) Em caso de emergência médica, a CONTRATADA está autorizada a prestar os primeiros socorros e acionar atendimento médico, contatando imediatamente o(a) RESPONSÁVEL no telefone {{telefoneResponsavel}};
c) O(A) RESPONSÁVEL se compromete a manter os contatos de emergência sempre atualizados.

CLÁUSULA 6ª — DA AUTORIZAÇÃO DE USO DE IMAGEM
O(A) RESPONSÁVEL autoriza, em caráter gratuito, o uso da imagem do(a) ALUNO(A) captada durante as atividades em materiais institucionais e redes sociais da CONTRATADA, podendo, a qualquer tempo, revogar tal autorização mediante comunicação por escrito.

CLÁUSULA 7ª — DAS OBRIGAÇÕES DO(A) RESPONSÁVEL
a) Efetuar os pagamentos pontualmente;
b) Manter os dados cadastrais e contatos de emergência atualizados;
c) Comunicar restrições médicas, alergias ou quaisquer condições especiais do(a) ALUNO(A);
d) Respeitar e fazer respeitar as normas internas e horários da CONTRATADA.

CLÁUSULA 8ª — DAS DISPOSIÇÕES GERAIS
As partes declaram estar de pleno acordo com as cláusulas aqui estabelecidas. Fica eleito o foro da comarca da sede da CONTRATADA para dirimir eventuais controvérsias oriundas deste contrato.

E por estarem justas e contratadas, as partes assinam o presente instrumento.

Data: {{dataAtual}}


_________________________________
{{nomeResponsavel}}
RESPONSÁVEL LEGAL POR {{nomeCliente}}


_________________________________
{{nomeEmpresa}}
CONTRATADA`

const MODELO_FIDELIDADE = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS — PLANO COM FIDELIDADE

Pelo presente instrumento particular, de um lado {{nomeEmpresa}}, doravante denominada CONTRATADA, e de outro {{nomeCliente}}, CPF {{cpfCliente}}, telefone {{telefoneCliente}}, doravante denominado(a) CONTRATANTE, têm entre si justo e contratado o seguinte:

CLÁUSULA 1ª — DO OBJETO
A CONTRATADA prestará ao CONTRATANTE os serviços conforme plano "{{nomePlano}}", em regime de fidelização, nos termos das cláusulas a seguir.

CLÁUSULA 2ª — DA VIGÊNCIA E DA FIDELIDADE
O presente contrato vigorará pelo período de [_____] meses, contados a partir da data de assinatura. Em razão deste prazo, o CONTRATANTE recebe condição comercial diferenciada, com desconto sobre o valor da mensalidade avulsa.

CLÁUSULA 3ª — DO VALOR E PAGAMENTO
O CONTRATANTE pagará mensalmente o valor de {{valorPlano}}, com vencimento conforme acordado no ato da matrícula. O atraso superior a 10 (dez) dias implica suspensão do acesso até regularização do débito.

CLÁUSULA 4ª — DA RESCISÃO ANTECIPADA
O CONTRATANTE poderá rescindir o presente contrato antes do término do período de fidelidade, ficando obrigado, neste caso, ao pagamento de multa correspondente a 30% (trinta por cento) do valor proporcional ao saldo restante do contrato, nos termos do art. 413 do Código Civil.

A multa não será aplicada nas seguintes hipóteses, devidamente comprovadas:
a) Incapacidade médica para a prática (mediante atestado médico);
b) Mudança de domicílio para localidade superior a 50 km da sede da CONTRATADA;
c) Desemprego involuntário comprovado por documento idôneo.

CLÁUSULA 5ª — DA RENOVAÇÃO
Ao término do período de fidelidade, o contrato será automaticamente convertido em prazo indeterminado, podendo qualquer das partes rescindi-lo mediante aviso prévio de 30 (trinta) dias, sem incidência de multa.

CLÁUSULA 6ª — DAS OBRIGAÇÕES DO CONTRATANTE
a) Efetuar os pagamentos pontualmente;
b) Respeitar as normas internas, horários e demais regulamentos da CONTRATADA;
c) Comunicar quaisquer alterações de dados cadastrais;
d) Apresentar atestado médico quando solicitado;
e) Informar restrições médicas, lesões ou condições especiais que impactem a prática.

CLÁUSULA 7ª — DA AUTORIZAÇÃO DE USO DE IMAGEM
O CONTRATANTE autoriza, em caráter gratuito, o uso de sua imagem captada durante as atividades em materiais institucionais e redes sociais da CONTRATADA, podendo, a qualquer tempo, revogar tal autorização mediante comunicação por escrito.

CLÁUSULA 8ª — DAS DISPOSIÇÕES GERAIS
As partes declaram estar de pleno acordo com as cláusulas aqui estabelecidas. Fica eleito o foro da comarca da sede da CONTRATADA para dirimir eventuais controvérsias oriundas deste contrato.

E por estarem justas e contratadas, as partes assinam o presente instrumento.

Data: {{dataAtual}}


_________________________________
{{nomeCliente}}
CPF: {{cpfCliente}}
CONTRATANTE


_________________________________
{{nomeEmpresa}}
CONTRATADA`

const MODELO_PACOTE_AULAS = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS — PACOTE DE AULAS

Pelo presente instrumento particular, de um lado {{nomeEmpresa}}, doravante denominada CONTRATADA, e de outro {{nomeCliente}}, CPF {{cpfCliente}}, telefone {{telefoneCliente}}, doravante denominado(a) CONTRATANTE, têm entre si justo e contratado o seguinte:

CLÁUSULA 1ª — DO OBJETO
A CONTRATADA prestará ao CONTRATANTE pacote de aulas conforme plano "{{nomePlano}}", composto por [_____] aulas, a serem utilizadas conforme as cláusulas a seguir.

CLÁUSULA 2ª — DA VALIDADE
O CONTRATANTE deverá utilizar todas as aulas contratadas dentro do prazo de [_____] dias, contados da data de assinatura. As aulas não utilizadas dentro do prazo serão consideradas perdidas, sem direito a reembolso ou prorrogação, salvo em caso de afastamento por motivo médico devidamente comprovado.

CLÁUSULA 3ª — DO VALOR E PAGAMENTO
Pelo pacote contratado, o CONTRATANTE pagará o valor total de {{valorPlano}}, no ato da contratação ou conforme parcelamento previamente acordado entre as partes.

CLÁUSULA 4ª — DOS AGENDAMENTOS, CANCELAMENTOS E FALTAS
a) As aulas devem ser previamente agendadas, conforme disponibilidade da CONTRATADA;
b) Cancelamentos com antecedência inferior a [_____] horas serão debitados do pacote;
c) Faltas sem aviso prévio serão integralmente debitadas do pacote;
d) Reagendamentos respeitarão a disponibilidade da grade e o prazo de validade do pacote.

CLÁUSULA 5ª — DA NÃO RENOVAÇÃO AUTOMÁTICA
O presente pacote NÃO se renova automaticamente. Ao término ou esgotamento das aulas, novo pacote deverá ser contratado mediante novo instrumento.

CLÁUSULA 6ª — DAS OBRIGAÇÕES DO CONTRATANTE
a) Respeitar os horários previamente agendados;
b) Apresentar-se em condições físicas e de saúde adequadas para a prática;
c) Comunicar restrições médicas, lesões ou condições especiais que impactem a prática;
d) Cumprir as normas internas e regulamentos da CONTRATADA.

CLÁUSULA 7ª — DA AUTORIZAÇÃO DE USO DE IMAGEM
O CONTRATANTE autoriza, em caráter gratuito, o uso de sua imagem captada durante as atividades em materiais institucionais e redes sociais da CONTRATADA, podendo, a qualquer tempo, revogar tal autorização mediante comunicação por escrito.

CLÁUSULA 8ª — DAS DISPOSIÇÕES GERAIS
As partes declaram estar de pleno acordo com as cláusulas aqui estabelecidas. Fica eleito o foro da comarca da sede da CONTRATADA para dirimir eventuais controvérsias oriundas deste contrato.

E por estarem justas e contratadas, as partes assinam o presente instrumento.

Data: {{dataAtual}}


_________________________________
{{nomeCliente}}
CPF: {{cpfCliente}}
CONTRATANTE


_________________________________
{{nomeEmpresa}}
CONTRATADA`

const MODELOS_PADRAO = [
  {
    id: 'mensalidade_adulto',
    titulo: 'Prestação de Serviços — Aluno Adulto',
    descricao: 'Plano mensal recorrente, prazo indeterminado, rescisão com aviso de 30 dias.',
    icone: 'mdi:account-cash-outline',
    cor: '#4f46e5',
    bg: '#eef2ff',
    conteudo: MODELO_MENSALIDADE_ADULTO
  },
  {
    id: 'mensalidade_menor',
    titulo: 'Prestação de Serviços — Menor de Idade',
    descricao: 'Assinado pelo responsável legal, com autorização parental e contato de emergência.',
    icone: 'mdi:account-child-outline',
    cor: '#0ea5e9',
    bg: '#e0f2fe',
    conteudo: MODELO_MENSALIDADE_MENOR
  },
  {
    id: 'fidelidade',
    titulo: 'Plano com Fidelidade',
    descricao: 'Trimestral, semestral ou anual com desconto e multa rescisória de 30% sobre saldo.',
    icone: 'mdi:calendar-check-outline',
    cor: '#16a34a',
    bg: '#dcfce7',
    conteudo: MODELO_FIDELIDADE
  },
  {
    id: 'pacote_aulas',
    titulo: 'Pacote de Aulas (Créditos)',
    descricao: 'Quantidade fechada de aulas com prazo de validade, sem renovação automática.',
    icone: 'mdi:ticket-confirmation-outline',
    cor: '#ea580c',
    bg: '#ffedd5',
    conteudo: MODELO_PACOTE_AULAS
  }
]

export default function ContratosTemplates() {
  const { userId, loading: loadingUser } = useUser()
  const { isLocked, loading: loadingPlan } = useUserPlan()

  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  const [mostrarModal, setMostrarModal] = useState(false)
  const [etapaModal, setEtapaModal] = useState('editar') // 'escolher' | 'editar'
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
    setFormConteudo('')
    setEtapaModal('escolher')
    setMostrarModal(true)
  }

  const abrirEditarTemplate = (t) => {
    setTemplateEditando(t)
    setFormTitulo(t.titulo)
    setFormConteudo(t.conteudo)
    setEtapaModal('editar')
    setMostrarModal(true)
  }

  const selecionarModelo = (modelo) => {
    if (modelo) {
      setFormTitulo(modelo.titulo)
      setFormConteudo(modelo.conteudo)
    } else {
      setFormTitulo('')
      setFormConteudo('')
    }
    setEtapaModal('editar')
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {etapaModal === 'editar' && !templateEditando && (
                  <button
                    onClick={() => setEtapaModal('escolher')}
                    title="Voltar para os modelos"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}
                  >
                    <Icon icon="mdi:arrow-left" width="20" style={{ color: '#666' }} />
                  </button>
                )}
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700' }}>
                  {templateEditando
                    ? 'Editar template'
                    : etapaModal === 'escolher' ? 'Escolha um modelo' : 'Novo template'}
                </h3>
              </div>
              <button onClick={() => setMostrarModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Icon icon="mdi:close" width="22" style={{ color: '#666' }} />
              </button>
            </div>

            {etapaModal === 'escolher' ? (
              <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
                <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>
                  Comece com um modelo pronto e adapte ao seu negócio. Você pode editar tudo depois.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                  {MODELOS_PADRAO.map(modelo => (
                    <button
                      key={modelo.id}
                      onClick={() => selecionarModelo(modelo)}
                      style={{
                        textAlign: 'left',
                        padding: '14px',
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = modelo.cor
                        e.currentTarget.style.boxShadow = `0 2px 8px ${modelo.cor}22`
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: modelo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon icon={modelo.icone} width="20" style={{ color: modelo.cor }} />
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>
                        {modelo.titulo}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.5' }}>
                        {modelo.descricao}
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={() => selecionarModelo(null)}
                    style={{
                      textAlign: 'left',
                      padding: '14px',
                      backgroundColor: 'white',
                      border: '1px dashed #d1d5db',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#9ca3af'
                      e.currentTarget.style.backgroundColor = '#f9fafb'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db'
                      e.currentTarget.style.backgroundColor = 'white'
                    }}
                  >
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon icon="mdi:file-outline" width="20" style={{ color: '#6b7280' }} />
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>
                      Em branco
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.5' }}>
                      Comece do zero e escreva seu próprio contrato.
                    </div>
                  </button>
                </div>
                <div style={{ marginTop: '16px', padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <Icon icon="mdi:information-outline" width="16" style={{ color: '#b45309', flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '12px', color: '#78350f', lineHeight: '1.5' }}>
                    Os modelos são uma base genérica. Recomendamos revisar com seu advogado antes de usar com alunos.
                  </span>
                </div>
              </div>
            ) : (
              <>
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
                        style={{
                          padding: '4px 8px',
                          backgroundColor: v.bloco ? '#dcfce7' : '#eef2ff',
                          border: `1px solid ${v.bloco ? '#86efac' : '#c7d2fe'}`,
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: v.bloco ? '#166534' : '#3730a3',
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          fontWeight: v.bloco ? '600' : '400',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {v.bloco && <Icon icon="mdi:view-list-outline" width="12" />}
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
              </>
            )}
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
