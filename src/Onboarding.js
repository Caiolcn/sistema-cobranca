import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useUser } from './contexts/UserContext'
import { showToast } from './Toast'
import { Icon } from '@iconify/react'
import { validarTelefone, validarCPF, validarCNPJ } from './utils/validators'
import CsvImportModal from './components/CsvImportModal'
import Input from './design-system/components/Input'
import Select from './design-system/components/Select'
import Button from './design-system/components/Button'
import WizardStepper from './design-system/components/WizardStepper'
import whatsappService from './services/whatsappService'
import {
  carregarConfigEvolution,
  verificarEstado,
  gerarQrCode,
  salvarConexao
} from './services/whatsappConexao'
import './Onboarding.css'

// A ordem importa: conectar o WhatsApp é o passo que separa quem vira cliente de
// quem some. Na base, 71% de quem conectou virou pagante contra 12% de quem não
// conectou — e antes esse passo nem estava no wizard, só no checklist opcional.
// Rótulos curtos de propósito: o stepper horizontal não encolhe (flex-shrink: 0 +
// nowrap no DS), então texto longo vaza do card em vez de quebrar.
// Alunos ANTES de Cobrança de propósito: o plano mora junto do aluno (pra ficar
// claro que um está vinculado ao outro), e a chave PIX fecha o wizard já podendo
// disparar o exemplo de cobrança com todos os dados reais preenchidos.
const STEPS = [
  { label: 'Empresa' },
  { label: 'WhatsApp' },
  { label: 'Alunos' },
  { label: 'Cobrança' }
]

const TIPOS_CHAVE_PIX = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave Aleatória' }
]

const DIAS_VENCIMENTO = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1)
}))

const SEGUNDOS_QR = 120

const formatarTelefone = (valor) => {
  const nums = valor.replace(/\D/g, '').slice(0, 11)
  if (nums.length <= 2) return nums
  if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`
}

const formatarCpfCnpj = (valor, tipo) => {
  const nums = valor.replace(/\D/g, '').slice(0, tipo === 'cnpj' ? 14 : 11)
  if (tipo === 'cnpj') {
    return nums
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return nums
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

// O tipo da chave não é gravado (não existe coluna): serve para validar o que a
// pessoa digitou. Antes era um select decorativo, que só trocava o placeholder —
// dava pra salvar CPF inválido ou telefone sem DDD e o PIX nascia quebrado.
const validarChavePix = (chave, tipo) => {
  const valor = (chave || '').trim()
  if (!valor) return 'Informe sua chave PIX'

  if (tipo === 'cpf' && !validarCPF(valor)) return 'CPF inválido'
  if (tipo === 'cnpj' && !validarCNPJ(valor)) return 'CNPJ inválido'
  if (tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) return 'E-mail inválido'
  if (tipo === 'telefone' && !validarTelefone(valor)) return 'Telefone inválido. Use DDD + número.'
  if (tipo === 'aleatoria' && valor.replace(/-/g, '').length !== 32) {
    return 'Chave aleatória inválida. Copie a chave completa do seu banco.'
  }
  return null
}

// Deduz o tipo a partir de uma chave já salva. Sem isso, quem volta ao wizard com
// um PIX de e-mail cadastrado bate em "CPF inválido" (o select nasce em 'cpf') e
// fica travado sem entender o motivo.
const deduzirTipoChave = (chave) => {
  const valor = (chave || '').trim()
  if (!valor) return null
  if (valor.includes('@')) return 'email'
  const digitos = valor.replace(/\D/g, '')
  if (valor.replace(/-/g, '').length === 32 && /[a-zA-Z]/.test(valor)) return 'aleatoria'
  if (digitos.length === 14) return 'cnpj'
  if (digitos.length === 11) return validarCPF(digitos) ? 'cpf' : 'telefone'
  if (digitos.length === 10) return 'telefone'
  return null
}

const hojeISO = () => new Date().toISOString().split('T')[0]

// Primeiro vencimento: mesmo dia do mês que vem, preso ao último dia quando o mês
// é curto (dia 31 -> 28/02). Data local, nunca UTC, senão volta um dia no BRT.
const proximoVencimento = (diaEscolhido) => {
  const hoje = new Date()
  const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  alvo.setDate(Math.min(diaEscolhido, ultimoDia))
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { userId, userData, refreshUserData } = useUser()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1
  const [nomeEmpresa, setNomeEmpresa] = useState('')

  // Step 2 — WhatsApp
  const [zapConfig, setZapConfig] = useState(null)
  const [zapStatus, setZapStatus] = useState('idle') // idle | carregando | aguardando | conectado | erro
  const [zapQr, setZapQr] = useState(null)
  const [zapErro, setZapErro] = useState('')
  const [zapSegundos, setZapSegundos] = useState(SEGUNDOS_QR)

  // Step 3 — Cobrança (chave PIX + primeiro plano)
  const [chavePix, setChavePix] = useState('')
  const [tipoChavePix, setTipoChavePix] = useState('cpf')
  const [erroPix, setErroPix] = useState('')
  const [planoNome, setPlanoNome] = useState('')
  const [planoValor, setPlanoValor] = useState('')
  const [planosCriados, setPlanosCriados] = useState([])

  // Step 4 — Alunos
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [diaVencimento, setDiaVencimento] = useState('10')
  const [clientesCriados, setClientesCriados] = useState([])
  const [mostrarCsvImport, setMostrarCsvImport] = useState(false)
  const [enviandoTeste, setEnviandoTeste] = useState(false)
  const [testeEnviado, setTesteEnviado] = useState(false)
  // Destino da prévia. Nasce do telefone do cadastro, mas é editável: são coisas
  // diferentes: quem ENVIA é a instância conectada, quem RECEBE é este número.
  // Dá pra ter se cadastrado com o celular pessoal e conectado o WhatsApp do studio.
  const [telefoneTeste, setTelefoneTeste] = useState('')
  const [erroTelefoneTeste, setErroTelefoneTeste] = useState('')

  const zapConfigRef = useRef(null)
  zapConfigRef.current = zapConfig

  // Retomar step salvo
  useEffect(() => {
    if (userData) {
      const savedStep = userData.onboarding_step || 0
      if (savedStep > 0 && savedStep < 4) setStep(savedStep + 1)
      if (userData.nome_empresa) setNomeEmpresa(userData.nome_empresa)
      if (userData.chave_pix) {
        setChavePix(userData.chave_pix)
        const tipo = deduzirTipoChave(userData.chave_pix)
        if (tipo) setTipoChavePix(tipo)
      }
      // Só preenche na primeira vez, pra não sobrescrever o que a pessoa corrigiu
      setTelefoneTeste((atual) => atual || formatarTelefone(userData.telefone || ''))
    }
  }, [userData])

  // Planos que já existem (a pessoa pode ter voltado ao wizard)
  useEffect(() => {
    if (!userId) return
    supabase.from('planos').select('id, nome, valor').eq('user_id', userId).eq('ativo', true)
      .then(({ data }) => { if (data) setPlanosCriados(data) })
  }, [userId])

  // Config da Evolution + estado atual da instância, assim que entra no wizard
  useEffect(() => {
    if (!userId) return
    let cancelado = false

    carregarConfigEvolution(userId).then(async (config) => {
      if (cancelado) return
      setZapConfig(config)
      const estado = await verificarEstado(config)
      if (!cancelado && estado === 'open') setZapStatus('conectado')
    })

    return () => { cancelado = true }
  }, [userId])

  // Polling do QR: para sozinho ao conectar, ao expirar ou ao sair do passo 2
  useEffect(() => {
    if (zapStatus !== 'aguardando' || !zapQr) return

    const intervalo = setInterval(async () => {
      const estado = await verificarEstado(zapConfigRef.current)
      if (estado === 'open') {
        setZapStatus('conectado')
        setZapQr(null)
        try {
          await salvarConexao(userId, zapConfigRef.current)
        } catch (error) {
          console.error('Conectou mas falhou ao gravar no banco:', error)
        }
      }
    }, 3000)

    const contagem = setInterval(() => {
      setZapSegundos((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)

    const expira = setTimeout(() => {
      setZapQr(null)
      setZapStatus('idle')
      setZapSegundos(SEGUNDOS_QR)
      setZapErro('O código expirou. Gere um novo QR Code.')
    }, SEGUNDOS_QR * 1000)

    return () => {
      clearInterval(intervalo)
      clearInterval(contagem)
      clearTimeout(expira)
    }
  }, [zapStatus, zapQr, userId])

  const conectarWhatsApp = useCallback(async () => {
    setZapErro('')
    setZapStatus('carregando')
    try {
      const config = zapConfigRef.current || (await carregarConfigEvolution(userId))
      setZapConfig(config)

      const { jaConectado, qr } = await gerarQrCode(config)
      if (jaConectado) {
        setZapStatus('conectado')
        await salvarConexao(userId, config)
        return
      }
      setZapQr(qr)
      setZapSegundos(SEGUNDOS_QR)
      setZapStatus('aguardando')
    } catch (error) {
      setZapErro(error.message)
      setZapStatus('erro')
    }
  }, [userId])

  const saveStep = async (stepNum) => {
    await supabase.from('usuarios').update({ onboarding_step: stepNum }).eq('id', userId)
  }

  // Último passo (Cobrança): grava a chave PIX e encerra o wizard.
  const finishOnboarding = async () => {
    if (saving) return

    // Chave vazia é permitido (dá pra concluir sem), mas chave preenchida e
    // inválida não passa — PIX errado só aparece quando o aluno tenta pagar.
    if (chavePix.trim()) {
      const erro = validarChavePix(chavePix, tipoChavePix)
      if (erro) {
        setErroPix(erro)
        return
      }
    }
    setErroPix('')

    try {
      setSaving(true)
      if (chavePix.trim()) {
        await supabase.from('usuarios').update({ chave_pix: chavePix.trim() }).eq('id', userId)
      }
      // Só marca como concluído (some o checklist do Home) se a pessoa realmente
      // cadastrou ao menos 1 aluno. Se pulou tudo, o checklist "Primeiros Passos"
      // continua no Home como rede de segurança.
      // onboarding_step = 4 sempre: é o que impede o RequireOnboarding de trazer
      // a pessoa de volta pro wizard em loop depois de "Pular e Concluir".
      await supabase.from('usuarios').update({
        onboarding_completed: clientesCriados.length > 0,
        onboarding_step: 4
      }).eq('id', userId)
      await refreshUserData()
      navigate('/app/home', { replace: true })
    } catch (error) {
      showToast('Erro ao finalizar. Tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Step 1: nome da empresa
  const handleStep1Next = async () => {
    if (saving) return
    if (!nomeEmpresa.trim()) {
      showToast('Informe o nome da sua empresa', 'warning')
      return
    }
    setSaving(true)
    try {
      await supabase.from('usuarios').update({ nome_empresa: nomeEmpresa.trim() }).eq('id', userId)
      await saveStep(1)
      await refreshUserData()
      setStep(2)
    } catch (error) {
      showToast('Erro ao salvar. Tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Garante o plano ANTES de criar o aluno. O plano nasce sob demanda (na hora de
  // adicionar o primeiro aluno), e não num passo separado: assim a pessoa vê os
  // dois no mesmo lugar e entende que o aluno fica vinculado ao plano.
  // Idempotente — do 2º aluno em diante reaproveita o plano já criado.
  const garantirPlano = async () => {
    if (planosCriados.length > 0) return planosCriados[0]
    if (!planoNome.trim() || !planoValor) return null

    const valor = parseFloat(planoValor)
    if (!(valor > 0)) {
      showToast('Valor do plano deve ser maior que zero', 'warning')
      return null
    }

    const { data, error } = await supabase.from('planos').insert({
      user_id: userId,
      nome: planoNome.trim(),
      valor,
      ativo: true
    }).select().single()

    if (error) throw error
    setPlanosCriados((prev) => [...prev, data])
    return data
  }

  // Step 3 (Alunos): se a pessoa preencheu o plano mas não chegou a adicionar
  // nenhum aluno, o plano ainda assim é criado — senão ela digitou à toa.
  const handleStep3Next = async () => {
    if (saving) return
    setSaving(true)
    try {
      await garantirPlano()
      await saveStep(3)
      setStep(4)
    } catch (error) {
      showToast('Erro ao salvar. Tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Cadastra o aluno JÁ VINCULADO ao plano e com a 1ª mensalidade criada.
  // Antes o aluno nascia com valor_devido 0, sem plano_id e com assinatura
  // inativa — a pessoa terminava o wizard com tudo verde e nenhuma cobrança
  // existindo de fato.
  const handleAdicionarCliente = async () => {
    if (saving) return
    if (!clienteNome.trim()) {
      showToast('Informe o nome do aluno', 'warning')
      return
    }
    if (!validarTelefone(clienteTelefone)) {
      showToast('Telefone inválido. Use DDD + número.', 'warning')
      return
    }

    const dia = Math.min(Math.max(parseInt(diaVencimento, 10) || 10, 1), 28)
    const vencimento = proximoVencimento(dia)

    setSaving(true)
    try {
      const plano = await garantirPlano()
      const valor = plano ? parseFloat(plano.valor) : 0

      const { data, error } = await supabase.from('devedores').insert({
        user_id: userId,
        nome: clienteNome.trim(),
        telefone: clienteTelefone.replace(/\D/g, ''),
        plano_id: plano?.id || null,
        valor_devido: valor,
        data_vencimento: vencimento,
        assinatura_ativa: !!plano,
        data_inicio_assinatura: plano ? hojeISO() : null,
        status: 'pendente',
        portal_token: crypto.randomUUID().replace(/-/g, '')
      }).select().single()

      if (error) throw error

      if (plano) {
        const { error: erroMensalidade } = await supabase.from('mensalidades').insert({
          user_id: userId,
          devedor_id: data.id,
          valor,
          data_vencimento: vencimento,
          status: 'pendente',
          is_mensalidade: true,
          numero_mensalidade: 1
        })
        if (erroMensalidade) {
          console.error('Aluno criado mas a 1ª mensalidade falhou:', erroMensalidade)
          showToast('Aluno adicionado, mas a mensalidade falhou. Confira em Financeiro.', 'warning')
        }
      }

      setClientesCriados((prev) => [...prev, { ...data, planoNome: plano?.nome || null }])
      setClienteNome('')
      setClienteTelefone('')
      showToast(plano ? 'Aluno adicionado e cobrança agendada!' : 'Aluno adicionado!', 'success')
    } catch (error) {
      showToast('Erro ao adicionar aluno: ' + error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Prévia da cobrança no WhatsApp do próprio gestor: a prova de valor mais barata
  // que existe — ele vê a mensagem chegando, com o número dele, antes de cadastrar
  // a base inteira. Roda no último passo, quando plano, aluno e PIX já existem,
  // então o exemplo sai com os dados reais dele em vez de placeholders.
  const enviarCobrancaTeste = async () => {
    if (!validarTelefone(telefoneTeste)) {
      setErroTelefoneTeste('Informe um WhatsApp válido com DDD')
      return
    }
    setErroTelefoneTeste('')
    const meuTelefone = telefoneTeste.replace(/\D/g, '')

    setEnviandoTeste(true)
    try {
      const plano = planosCriados[0]
      const valorExemplo = plano ? parseFloat(plano.valor) : 150
      const empresa = nomeEmpresa.trim() || 'sua empresa'
      const primeiroAluno = clientesCriados.find((c) => c.nome && c.nome !== 'Importado')
      const nomeExemplo = primeiroAluno ? primeiroAluno.nome.split(' ')[0] : 'Maria'
      const mensagem =
`Olá, ${nomeExemplo}! 👋

Sua mensalidade da ${empresa} está chegando:

📌 ${plano?.nome || 'Mensalidade'}
💰 R$ ${valorExemplo.toFixed(2).replace('.', ',')}
📅 Vence dia ${diaVencimento}
${chavePix.trim() ? `🔑 PIX: ${chavePix.trim()}` : ''}

_Esta é uma PRÉVIA enviada só para você. Nenhum aluno recebeu esta mensagem._

_Este texto é um modelo e pode ser personalizado dentro do Mensalli._ ✅`

      await whatsappService.enviarMensagem(meuTelefone, mensagem)
      setTesteEnviado(true)
      showToast('Enviamos no seu WhatsApp! Confira o celular.', 'success')
    } catch (error) {
      showToast('Não conseguimos enviar agora: ' + error.message, 'error')
    } finally {
      setEnviandoTeste(false)
    }
  }

  if (!userId) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', color: '#344848' }}>
      Carregando...
    </div>
  )

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <div className="onboarding-logo">
          <span className="onboarding-logo-text">Mensalli</span>
        </div>

        {/* Progresso — WizardStepper do DS.
            No celular o layout compact resolve o problema que o stepper feito à
            mão tinha: em vez de 4 círculos anônimos, mostra "2 de 4 · WhatsApp". */}
        <WizardStepper
          className="onboarding-stepper"
          layout="horizontal"
          current={step - 1}
          steps={STEPS}
        />
        <WizardStepper
          className="onboarding-stepper-mobile"
          layout="compact"
          current={step - 1}
          steps={STEPS}
        />

        <div className="onboarding-content">

          {/* STEP 1: Nome da Empresa */}
          {step === 1 && (
            <div className="onboarding-step-content">
              <div className="onboarding-step-header">
                <h2>Como se chama sua empresa?</h2>
                <p>Esse nome aparecerá nas cobranças enviadas aos seus alunos.</p>
              </div>
              <Input
                label="Nome da Empresa"
                value={nomeEmpresa}
                onChange={(e) => setNomeEmpresa(e.target.value)}
                placeholder="Ex: Studio Pilates Maria"
                icon="mdi:office-building-outline"
                autoFocus
              />
              <div className="onboarding-actions">
                <div />
                <Button
                  variant="secondary"
                  iconRight="mdi:arrow-right"
                  onClick={handleStep1Next}
                  loading={saving}
                  disabled={saving}
                >
                  Continuar
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: WhatsApp */}
          {step === 2 && (
            <div className="onboarding-step-content">
              <div className="onboarding-step-header">
                <h2>Conecte seu WhatsApp</h2>
                <p>É daqui que as cobranças vão sair — no seu próprio número, para seus alunos.</p>
              </div>

              {zapStatus === 'conectado' ? (
                <div className="onboarding-zap-ok">
                  <Icon icon="mdi:check-circle" width="44" />
                  <div>
                    <strong>WhatsApp conectado!</strong>
                    <p>Suas cobranças já saem automaticamente por este número.</p>
                  </div>
                </div>
              ) : (
                <div className="onboarding-zap-box">
                  {zapQr ? (
                    <>
                      <img src={zapQr} alt="QR Code do WhatsApp" className="onboarding-zap-qr" />
                      <ol className="onboarding-zap-passos">
                        <li>Abra o WhatsApp no seu celular</li>
                        <li>Toque em <strong>Aparelhos conectados</strong></li>
                        <li>Aponte a câmera para este código</li>
                      </ol>
                      <span className="onboarding-zap-timer">
                        O código expira em {Math.floor(zapSegundos / 60)}:{String(zapSegundos % 60).padStart(2, '0')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Icon icon="mdi:whatsapp" width="48" style={{ color: '#25D366' }} />
                      <p className="onboarding-zap-chamada">
                        Sem isso, o Mensalli não consegue enviar nenhuma cobrança.
                        Leva 20 segundos.
                      </p>
                      <Button
                        variant="whatsapp"
                        size="lg"
                        iconRight="mdi:qrcode-scan"
                        onClick={conectarWhatsApp}
                        loading={zapStatus === 'carregando'}
                        disabled={zapStatus === 'carregando'}
                      >
                        Gerar QR Code
                      </Button>
                    </>
                  )}

                  {zapErro && <p className="onboarding-zap-erro">{zapErro}</p>}
                </div>
              )}

              <div className="onboarding-actions">
                <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                {/* Só um caminho à frente por vez: enquanto não conectou, avançar
                    é explicitamente "deixar pra depois" — não um Continuar neutro
                    ao lado de um Pular que faz exatamente a mesma coisa. */}
                {zapStatus === 'conectado' ? (
                  <Button
                    variant="secondary"
                    iconRight="mdi:arrow-right"
                    onClick={async () => { await saveStep(2); setStep(3) }}
                  >
                    Continuar
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={async () => { await saveStep(2); setStep(3) }}
                  >
                    Conectar depois
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Alunos + o plano deles */}
          {step === 3 && (
            <div className="onboarding-step-content">
              <div className="onboarding-step-header">
                <h2>Seus alunos e o plano</h2>
                <p>Defina o plano uma vez — cada aluno que você adicionar entra nele.</p>
              </div>

              {/* Plano primeiro: é o que dá valor e vencimento pro aluno logo abaixo */}
              <div className="onboarding-fields-row">
                <div style={{ flex: 2 }}>
                  <Input
                    label="Nome do Plano"
                    value={planoNome}
                    onChange={(e) => setPlanoNome(e.target.value)}
                    placeholder="Ex: Mensal, Pilates 3x"
                    disabled={planosCriados.length > 0}
                    helper={planosCriados.length > 0 ? 'Plano criado' : undefined}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    label="Valor"
                    type="number"
                    prefix="R$"
                    value={planosCriados.length > 0 ? planosCriados[0].valor : planoValor}
                    onChange={(e) => setPlanoValor(e.target.value)}
                    placeholder="150,00"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    disabled={planosCriados.length > 0}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Select
                    label="Vence dia"
                    options={DIAS_VENCIMENTO}
                    value={diaVencimento}
                    onChange={setDiaVencimento}
                  />
                </div>
              </div>

              <div className="onboarding-divider" style={{ margin: '20px 0 16px' }}>
                <span>alunos nesse plano</span>
              </div>

              <div className="onboarding-fields-row">
                <div style={{ flex: 1 }}>
                  <Input
                    value={clienteNome}
                    onChange={(e) => setClienteNome(e.target.value)}
                    placeholder="Nome do aluno"
                    icon="mdi:account-outline"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    type="tel"
                    value={clienteTelefone}
                    onChange={(e) => setClienteTelefone(formatarTelefone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    inputMode="numeric"
                    icon="mdi:whatsapp"
                  />
                </div>
                <Button
                  variant="secondary"
                  icon="mdi:plus"
                  iconOnly
                  aria-label="Adicionar aluno"
                  onClick={handleAdicionarCliente}
                  loading={saving}
                  disabled={saving}
                  className="onboarding-btn-add"
                />
              </div>

              {clientesCriados.length > 0 && (
                <div className="onboarding-clientes-list">
                  {clientesCriados.map((c, i) => (
                    <div key={i} className="onboarding-cliente-item">
                      <Icon icon="mdi:check-circle" width="16" style={{ color: '#16a34a' }} />
                      <span>{c.nome}</span>
                      {c.planoNome && <span className="onboarding-cliente-plano">{c.planoNome}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* CSV como saída secundária: quem migra de planilha tem base grande e
                  não vai cadastrar um a um, mas isso não pode competir com o fluxo
                  principal de "adiciona um aluno e entende o vínculo com o plano". */}
              <button
                type="button"
                className="onboarding-link-csv"
                onClick={() => setMostrarCsvImport(true)}
              >
                <Icon icon="ph:file-csv" width="16" />
                Tenho muitos alunos — importar de uma planilha
              </button>

              <div className="onboarding-actions">
                <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Button variant="ghost" onClick={async () => { await saveStep(3); setStep(4) }}>
                    Pular
                  </Button>
                  <Button
                    variant="secondary"
                    iconRight="mdi:arrow-right"
                    onClick={handleStep3Next}
                    loading={saving}
                    disabled={saving}
                  >
                    Continuar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Cobrança (chave PIX + prévia da mensagem) */}
          {step === 4 && (
            <div className="onboarding-step-content">
              <div className="onboarding-step-header">
                <h2>Como você recebe?</h2>
                <p>A chave PIX que vai junto em toda cobrança enviada aos seus alunos.</p>
              </div>

              <div className="onboarding-fields-row">
                <div style={{ flex: 1 }}>
                  <Select
                    label="Tipo da Chave"
                    options={TIPOS_CHAVE_PIX}
                    value={tipoChavePix}
                    onChange={(valor) => { setTipoChavePix(valor); setChavePix(''); setErroPix('') }}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <Input
                    label="Chave PIX"
                    value={chavePix}
                    error={erroPix || undefined}
                    onChange={(e) => {
                      const bruto = e.target.value
                      if (tipoChavePix === 'cpf' || tipoChavePix === 'cnpj') {
                        setChavePix(formatarCpfCnpj(bruto, tipoChavePix))
                      } else if (tipoChavePix === 'telefone') {
                        setChavePix(formatarTelefone(bruto))
                      } else {
                        setChavePix(bruto)
                      }
                      setErroPix('')
                    }}
                    inputMode={['cpf', 'cnpj', 'telefone'].includes(tipoChavePix) ? 'numeric' : 'text'}
                    placeholder={
                      tipoChavePix === 'cpf' ? '000.000.000-00'
                        : tipoChavePix === 'cnpj' ? '00.000.000/0000-00'
                        : tipoChavePix === 'email' ? 'seu@email.com'
                        : tipoChavePix === 'telefone' ? '(11) 99999-9999'
                        : 'Cole a chave aleatória do seu banco'
                    }
                  />
                </div>
              </div>

              {/* Prévia, não disparo real: o texto precisa deixar explícito que a
                  mensagem vai só pro WhatsApp do gestor. "Receber uma cobrança de
                  teste" sozinho dava a entender que os alunos seriam cobrados agora. */}
              {zapStatus === 'conectado' && (
                <div className="onboarding-preview">
                  <div className="onboarding-preview-texto">
                    <strong>Quer ver como fica?</strong>
                    <p>
                      Enviamos um <strong>exemplo</strong> da cobrança, disparado pelo
                      WhatsApp que você acabou de conectar. Nenhum aluno recebe nada.
                    </p>
                  </div>
                  {/* Campo editável em vez de texto fixo: o número do cadastro pode
                      estar errado ou desatualizado, e aí a prévia sumiria sem
                      explicação — a pessoa concluiria que o envio não funciona. */}
                  <Input
                    label="Enviar o exemplo para"
                    type="tel"
                    value={telefoneTeste}
                    error={erroTelefoneTeste || undefined}
                    onChange={(e) => {
                      setTelefoneTeste(formatarTelefone(e.target.value))
                      setErroTelefoneTeste('')
                      setTesteEnviado(false)
                    }}
                    placeholder="(00) 00000-0000"
                    inputMode="numeric"
                    icon="mdi:whatsapp"
                    helper={erroTelefoneTeste ? undefined : 'Seu próprio WhatsApp, para você conferir'}
                  />
                  <Button
                    variant="whatsapp"
                    fullWidth
                    className="onboarding-preview-btn"
                    icon={testeEnviado ? 'mdi:check-circle' : 'mdi:eye-outline'}
                    onClick={enviarCobrancaTeste}
                    loading={enviandoTeste}
                    disabled={enviandoTeste || testeEnviado}
                  >
                    {testeEnviado ? 'Enviado! Confira o WhatsApp' : 'Ver o exemplo'}
                  </Button>
                </div>
              )}

              {/* Fora do bloco de prévia de propósito: quem não conectou o WhatsApp
                  também precisa saber que o texto não é engessado. É a dúvida que
                  aparece assim que a pessoa lê a mensagem pronta pela primeira vez. */}
              <p className="onboarding-nota-templates">
                <Icon icon="mdi:pencil-outline" width="15" />
                <span>
                  Esse texto é só um modelo — <strong>todas as mensagens são
                  personalizáveis dentro do sistema</strong>, você escreve do seu jeito
                  quando quiser.
                </span>
              </p>

              <div className="onboarding-actions">
                <Button variant="outline" onClick={() => setStep(3)}>Voltar</Button>
                <Button
                  variant="primary"
                  iconRight="mdi:check"
                  onClick={finishOnboarding}
                  loading={saving}
                  disabled={saving}
                >
                  {/* O rótulo agora reflete a chave PIX, que é o que este passo pede */}
                  {chavePix.trim() ? 'Concluir' : 'Pular e Concluir'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CsvImportModal
        isOpen={mostrarCsvImport}
        onClose={() => setMostrarCsvImport(false)}
        onImportComplete={(count) => {
          setMostrarCsvImport(false)
          setClientesCriados((prev) => [...prev, ...Array(count).fill({ nome: 'Importado', telefone: '' })])
          showToast(`${count} alunos importados!`, 'success')
        }}
        userId={userId}
        existingClients={clientesCriados}
        planos={planosCriados}
        limiteClientes={500}
        clientesAtivos={clientesCriados.length}
      />
    </div>
  )
}
