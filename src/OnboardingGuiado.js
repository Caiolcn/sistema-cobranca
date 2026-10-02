import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from './supabaseClient'
import { useUser } from './contexts/UserContext'
import { showToast } from './Toast'
import { validarTelefone } from './utils/validators'
import Input from './design-system/components/Input'
import Select from './design-system/components/Select'
import Button from './design-system/components/Button'
import Modal from './design-system/components/Modal'
import CsvImportModal from './components/CsvImportModal'
import whatsappService from './services/whatsappService'
import {
  carregarConfigEvolution,
  verificarEstado,
  gerarQrCode,
  salvarConexao,
  garantirTemplatesPadrao
} from './services/whatsappConexao'
import { TEMPLATES_PADRAO } from './data/templatesPadrao'
import './OnboardingGuiado.css'

/* --------------------------------------------------------------------------
   Onboarding guiado — o caminho que separa quem fica de quem some:

   1. Cadastrar 1 aluno       (aluno + plano + 1ª mensalidade, de uma vez)
   2. Ver/ajustar a mensagem  (template REAL, com o aluno que ele criou)
   3. Conectar e ver chegando (QR aqui mesmo; o teste sai da instância dele)

   Conectar vem POR ÚLTIMO de propósito: pedir o QR antes de a pessoa ver
   qualquer coisa é pedir confiança sem ter mostrado valor. Depois de ver a
   cobrança da própria aluna, conectar vira "falta só isso pra ela sair do
   meu número". Empresa e PIX saíram: não mudam a primeira experiência.

   Só o aluno tem sinal no banco. Enviar o teste É o que marca
   `onboarding_completed = true`; quem sai antes volta no passo da mensagem.
-------------------------------------------------------------------------- */

const PASSOS = [
  { key: 'cliente', label: 'Primeiro aluno' },
  { key: 'mensagem', label: 'Sua mensagem' },
  { key: 'teste', label: 'Conectar e ver chegando' }
]

const SEGUNDOS_QR = 120

const DIAS_VENCIMENTO = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1)
}))

const TIPO_TEMPLATE_TESTE = 'pre_due_3days'

const formatarTelefone = (valor) => {
  const nums = String(valor || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11)
  if (nums.length <= 2) return nums
  if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`
}

const dataLocalISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Primeiro vencimento: o dia escolhido no mês que vem, preso ao fim do mês curto.
const proximoVencimento = (diaEscolhido) => {
  const hoje = new Date()
  const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  alvo.setDate(Math.min(diaEscolhido, ultimoDia))
  return dataLocalISO(alvo)
}

const formatarMoeda = (valor) =>
  `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Compara pelos 8 últimos dígitos: cobre o nono dígito e o 55 na frente.
const mesmoNumero = (a, b) => {
  const fim = (n) => String(n || '').replace(/\D/g, '').slice(-8)
  return fim(a).length === 8 && fim(a) === fim(b)
}

export default function OnboardingGuiado({ sinais, onExplorar, onConcluir }) {
  const { userId, userData, nomeEmpresa, chavePix, refreshUserData } = useUser()

  // Concluídos nesta sessão (o pai só fica sabendo no próximo carregamento)
  const [feitos, setFeitos] = useState({ whatsapp: false, cliente: false })
  const whatsappOk = sinais.whatsapp || feitos.whatsapp
  const clienteOk = sinais.cliente || feitos.cliente
  const [passo, setPasso] = useState(clienteOk ? 1 : 0)
  const [concluido, setConcluido] = useState(false)

  /* --------------------------- 3. WhatsApp -------------------------------- */
  const [zapStatus, setZapStatus] = useState('idle') // idle | carregando | aguardando | conectado | erro
  const [zapQr, setZapQr] = useState(null)
  const [zapSegundos, setZapSegundos] = useState(SEGUNDOS_QR)
  const [zapErro, setZapErro] = useState('')
  const [modalZap, setModalZap] = useState(false)
  const zapConfigRef = useRef(null)

  // proximo = null: marca feito sem trocar de passo (o WhatsApp conecta dentro
  // do passo 3 e só revela o envio do teste).
  const marcarFeito = useCallback((key, proximo = null) => {
    setFeitos((prev) => ({ ...prev, [key]: true }))
    // Respiro curto para o check verde aparecer antes de trocar de passo
    if (proximo !== null) setTimeout(() => setPasso(proximo), 1200)
  }, [])

  const conectarWhatsApp = useCallback(async () => {
    setZapErro('')
    setZapStatus('carregando')
    try {
      const config = zapConfigRef.current || (await carregarConfigEvolution(userId))
      zapConfigRef.current = config
      const { jaConectado, qr } = await gerarQrCode(config, { userId })
      if (jaConectado) {
        await salvarConexao(userId, config)
        setZapStatus('conectado')
        marcarFeito('whatsapp')
        return
      }
      setZapQr(qr)
      setZapSegundos(SEGUNDOS_QR)
      setZapStatus('aguardando')
    } catch (error) {
      setZapErro(error.message)
      setZapStatus('erro')
    }
  }, [userId, marcarFeito])

  // Polling do pareamento: para ao conectar, ao expirar ou ao desmontar
  useEffect(() => {
    if (zapStatus !== 'aguardando' || !zapQr) return

    const intervalo = setInterval(async () => {
      const estado = await verificarEstado(zapConfigRef.current)
      if (estado === 'open') {
        clearInterval(intervalo)
        setZapQr(null)
        try {
          // salvarConexao semeia os templates ANTES de marcar conectado —
          // sem isso a régua entraria com mensagem vazia.
          await salvarConexao(userId, zapConfigRef.current)
        } catch (error) {
          console.error('Conectou mas falhou ao gravar no banco:', error)
        }
        setZapStatus('conectado')
        marcarFeito('whatsapp')
      }
    }, 3000)

    const contagem = setInterval(() => {
      setZapSegundos((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)

    const expira = setTimeout(() => {
      setZapQr(null)
      setZapStatus('idle')
      setZapErro('O código expirou. Gere um novo QR Code.')
    }, SEGUNDOS_QR * 1000)

    return () => {
      clearInterval(intervalo)
      clearInterval(contagem)
      clearTimeout(expira)
    }
  }, [zapStatus, zapQr, userId, marcarFeito])

  // Conectou: o modal mostra o ✓ por um instante e fecha sozinho, revelando o
  // envio do teste que já apareceu atrás dele.
  useEffect(() => {
    if (zapStatus !== 'conectado' || !modalZap) return
    const t = setTimeout(() => setModalZap(false), 1600)
    return () => clearTimeout(t)
  }, [zapStatus, modalZap])

  const abrirModalZap = () => {
    setModalZap(true)
    conectarWhatsApp()
  }

  // Fechar no meio cancela o pareamento (o polling para junto com o QR).
  const fecharModalZap = () => {
    setModalZap(false)
    if (zapStatus !== 'conectado') {
      setZapQr(null)
      setZapStatus('idle')
      setZapErro('')
    }
  }

  /* ------------------------------ 1. Aluno -------------------------------- */
  const [alunoNome, setAlunoNome] = useState('')
  const [alunoTelefone, setAlunoTelefone] = useState('')
  const [alunoValor, setAlunoValor] = useState('')
  const [alunoDia, setAlunoDia] = useState('10')
  const [salvandoAluno, setSalvandoAluno] = useState(false)
  const [mostrarCsv, setMostrarCsv] = useState(false)

  // Reaproveita um plano ativo com o mesmo valor; senão cria "Mensalidade".
  const garantirPlano = async (valor) => {
    const { data: existentes } = await supabase
      .from('planos')
      .select('id, nome, valor')
      .eq('user_id', userId)
      .eq('ativo', true)
    const igual = (existentes || []).find((p) => Number(p.valor) === valor)
    if (igual) return igual

    const { data, error } = await supabase
      .from('planos')
      .insert({ user_id: userId, nome: 'Mensalidade', valor, ativo: true })
      .select()
      .single()
    if (error) throw error
    return data
  }

  const cadastrarAluno = async () => {
    if (salvandoAluno) return
    if (!alunoNome.trim()) {
      showToast('Informe o nome do aluno', 'warning')
      return
    }
    if (!validarTelefone(alunoTelefone)) {
      showToast('Telefone inválido. Use DDD + número.', 'warning')
      return
    }
    const valor = parseFloat(String(alunoValor).replace(',', '.'))
    if (!(valor > 0)) {
      showToast('Informe o valor da mensalidade', 'warning')
      return
    }

    const dia = Math.min(Math.max(parseInt(alunoDia, 10) || 10, 1), 28)
    const vencimento = proximoVencimento(dia)

    setSalvandoAluno(true)
    try {
      const plano = await garantirPlano(valor)

      // Mesmo formato do wizard antigo: aluno já nasce vinculado ao plano e com
      // a 1ª mensalidade — senão ficava tudo verde e nenhuma cobrança existia.
      const { data: aluno, error } = await supabase.from('devedores').insert({
        user_id: userId,
        nome: alunoNome.trim(),
        telefone: alunoTelefone.replace(/\D/g, ''),
        plano_id: plano.id,
        valor_devido: valor,
        data_vencimento: vencimento,
        assinatura_ativa: true,
        data_inicio_assinatura: dataLocalISO(new Date()),
        status: 'pendente',
        portal_token: crypto.randomUUID().replace(/-/g, '')
      }).select().single()
      if (error) throw error

      const { error: erroMensalidade } = await supabase.from('mensalidades').insert({
        user_id: userId,
        devedor_id: aluno.id,
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

      marcarFeito('cliente', 1)
    } catch (error) {
      showToast('Erro ao adicionar aluno: ' + error.message, 'error')
    } finally {
      setSalvandoAluno(false)
    }
  }

  /* -------------------- 2. Mensagem  +  envio do teste --------------------- */
  const [amostra, setAmostra] = useState(null) // { nome, valor, vencimento }
  const [templateOriginal, setTemplateOriginal] = useState('')
  const [templateTexto, setTemplateTexto] = useState('')
  const [editando, setEditando] = useState(false)
  const [destino, setDestino] = useState('')
  const [numeroConectado, setNumeroConectado] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [salvandoTexto, setSalvandoTexto] = useState(false)

  useEffect(() => {
    setDestino((atual) => atual || formatarTelefone(userData?.telefone || ''))
  }, [userData])

  // Carrega aluno de exemplo + template ao chegar no passo da mensagem
  useEffect(() => {
    if (passo < 1 || !userId || amostra) return
    let cancelado = false

    ;(async () => {
      const [{ data: mensalidade }, { data: template }, { data: zap }] = await Promise.all([
        supabase
          .from('mensalidades')
          .select('valor, data_vencimento, devedor:devedores(nome, responsavel_nome)')
          .eq('user_id', userId)
          .eq('status', 'pendente')
          .or('lixo.is.null,lixo.eq.false')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('templates')
          .select('mensagem')
          .eq('user_id', userId)
          .eq('tipo', TIPO_TEMPLATE_TESTE)
          .eq('ativo', true)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('mensallizap')
          .select('whatsapp_numero')
          .eq('user_id', userId)
          .maybeSingle()
      ])
      if (cancelado) return

      const nomeContato = mensalidade?.devedor?.responsavel_nome || mensalidade?.devedor?.nome || 'Maria'
      setAmostra({
        nome: nomeContato.split(' ')[0],
        valor: mensalidade?.valor || 150,
        vencimento: mensalidade?.data_vencimento || proximoVencimento(10)
      })
      const texto = template?.mensagem || TEMPLATES_PADRAO[TIPO_TEMPLATE_TESTE]
      setTemplateOriginal(texto)
      setTemplateTexto(texto)
      setNumeroConectado(zap?.whatsapp_numero || null)
    })()

    return () => { cancelado = true }
  }, [passo, userId, amostra])

  const empresaReal = nomeEmpresa && nomeEmpresa.trim().toLowerCase() !== 'minha empresa' ? nomeEmpresa.trim() : ''

  // Sem PIX configurado, a linha da chave sairia vazia ("🔑 Chave Pix: ").
  // Na prévia ela some; volta sozinha quando o PIX for configurado.
  const renderizar = (texto) => {
    if (!amostra) return ''
    let base = texto
    if (!(chavePix && chavePix.trim())) {
      base = base.split('\n').filter((linha) => !linha.includes('{{chavePix}}')).join('\n')
      // A linha some, mas as linhas em branco em volta dela ficavam dobradas
      base = base.replace(/\n{3,}/g, '\n\n')
    }
    return whatsappService.substituirVariaveis(base, {
      nomeCliente: amostra.nome,
      nomeAluno: amostra.nome,
      nomeAlunoReal: amostra.nome,
      valorMensalidade: formatarMoeda(amostra.valor),
      dataVencimento: new Date(amostra.vencimento + 'T00:00:00').toLocaleDateString('pt-BR'),
      diasAtraso: '0',
      nomeEmpresa: empresaReal || 'nossa equipe',
      chavePix: chavePix || '',
      linkPagamento: 'mensalli.com.br/portal/…',
      portalCliente: 'mensalli.com.br/portal/…'
    })
  }

  const mensagemPrevia = renderizar(templateTexto)
  const caiNoChatVoce = numeroConectado && mesmoNumero(destino, numeroConectado)

  // Personalizou? Vira o template de verdade da régua. Os templates só nascem
  // na conexão; como aqui ele ainda não conectou, semeia antes de gravar
  // (semear sem estar conectado é inofensivo: as views exigem conectado).
  const confirmarMensagem = async () => {
    if (templateTexto.trim() && templateTexto !== templateOriginal) {
      setSalvandoTexto(true)
      try {
        await garantirTemplatesPadrao(userId)
        await supabase
          .from('templates')
          .update({ mensagem: templateTexto, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('tipo', TIPO_TEMPLATE_TESTE)
        setTemplateOriginal(templateTexto)
      } catch (error) {
        showToast('Não conseguimos salvar seu texto: ' + error.message, 'error')
        return
      } finally {
        setSalvandoTexto(false)
      }
    }
    setEditando(false)
    setPasso(2)
  }

  const enviarTeste = async () => {
    if (!validarTelefone(destino)) {
      showToast('Informe um WhatsApp válido com DDD', 'warning')
      return
    }
    setEnviando(true)
    try {
      const texto = `${mensagemPrevia}\n\n_Mensagem de teste. Nenhum aluno recebeu._`
      const resultado = await whatsappService.enviarMensagem(destino.replace(/\D/g, ''), texto)
      if (resultado && resultado.sucesso === false) {
        showToast(resultado.erro || 'Não conseguimos enviar agora. Tente de novo.', 'error')
        return
      }

      await supabase
        .from('usuarios')
        .update({ onboarding_completed: true, onboarding_step: 4 })
        .eq('id', userId)

      setConcluido(true)
    } catch (error) {
      showToast('Não conseguimos enviar agora: ' + error.message, 'error')
    } finally {
      setEnviando(false)
    }
  }

  const irParaPainel = async () => {
    await refreshUserData?.()
    onConcluir?.()
  }

  /* -------------------------------- render -------------------------------- */
  const statusPasso = (i) => {
    const key = PASSOS[i].key
    if (key === 'cliente' && clienteOk) return 'feito'
    if (key === 'mensagem' && passo > 1) return 'feito'
    if (key === 'teste' && concluido) return 'feito'
    return i === passo ? 'atual' : 'pendente'
  }

  if (concluido) {
    return (
      <div className="onbg">
        <div className="onbg-fim">
          <div className="onbg-fim-icone"><Icon icon="mdi:party-popper" width="34" /></div>
          <h2>Chegou aí? É exatamente isso que seu aluno vai receber.</h2>
          <p>
            A partir de agora a cobrança da <strong>{amostra?.nome}</strong> sai sozinha, 3 dias antes,
            no dia e depois do vencimento — do seu número, sem você lembrar de nada.
          </p>
          <div className="onbg-fim-proximos">
            <span>Quando quiser:</span>
            <span><Icon icon="mdi:account-multiple-plus-outline" width="16" /> cadastre o resto dos alunos</span>
            <span><Icon icon="mdi:qrcode" width="16" /> configure sua chave PIX</span>
          </div>
          <Button variant="primary" size="lg" iconRight="mdi:arrow-right" onClick={irParaPainel}>
            Ir para o meu painel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="onbg">
      <div className="onbg-topo">
        <h2 className="onbg-titulo">Em 3 passos a sua cobrança roda sozinha</h2>
        <p className="onbg-sub">Leva uns 3 minutos. No fim, a cobrança chega no seu WhatsApp do jeitinho que o aluno vê.</p>
      </div>

      <ol className="onbg-stepper">
        {PASSOS.map((p, i) => {
          const st = statusPasso(i)
          return (
            <li key={p.key} className={`onbg-step ${st}`}>
              <span className="onbg-step-bola">
                {st === 'feito' ? <Icon icon="mdi:check" width="16" /> : i + 1}
              </span>
              <span className="onbg-step-label">{p.label}</span>
            </li>
          )
        })}
      </ol>

      <div className="onbg-card">
        {/* ---------------- Passo 1: Aluno ---------------- */}
        {passo === 0 && (
          <div className="onbg-passo">
            <div className="onbg-passo-cab">
              <div className="onbg-passo-icone"><Icon icon="mdi:account-plus-outline" width="24" /></div>
              <div>
                <h3>Cadastre seu primeiro aluno</h3>
                <p>Só o básico. Com ele no sistema, a cobrança dele já fica agendada.</p>
              </div>
            </div>

            {clienteOk ? (
              <div className="onbg-ok">
                <Icon icon="mdi:check-circle" width="28" />
                <strong>Aluno cadastrado e cobrança agendada!</strong>
              </div>
            ) : (
              <>
                <div className="onbg-grid-aluno">
                  <Input
                    label="Nome do aluno"
                    value={alunoNome}
                    onChange={(e) => setAlunoNome(e.target.value)}
                    placeholder="Ex: Maria Souza"
                    icon="mdi:account-outline"
                  />
                  <Input
                    label="WhatsApp do aluno"
                    type="tel"
                    value={alunoTelefone}
                    onChange={(e) => setAlunoTelefone(formatarTelefone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    inputMode="numeric"
                    icon="mdi:whatsapp"
                  />
                  <Input
                    label="Mensalidade"
                    type="number"
                    prefix="R$"
                    value={alunoValor}
                    onChange={(e) => setAlunoValor(e.target.value)}
                    placeholder="150,00"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                  />
                  <Select
                    label="Vence dia"
                    options={DIAS_VENCIMENTO}
                    value={alunoDia}
                    onChange={setAlunoDia}
                  />
                </div>

                <div className="onbg-acao-linha">
                  <button type="button" className="onbg-link" onClick={() => setMostrarCsv(true)}>
                    <Icon icon="ph:file-csv" width="16" />
                    Tenho muitos alunos — importar de uma planilha
                  </button>
                  <Button
                    variant="primary"
                    iconRight="mdi:arrow-right"
                    onClick={cadastrarAluno}
                    loading={salvandoAluno}
                    disabled={salvandoAluno}
                  >
                    Cadastrar e continuar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ------- Passos 2 e 3: o celular fica fixo, o lado direito muda ------- */}
        {passo >= 1 && (
          <div className="onbg-passo">
            <div className="onbg-passo-cab">
              <div className={`onbg-passo-icone ${passo === 2 ? 'zap' : ''}`}>
                <Icon icon={passo === 1 ? 'mdi:message-text-outline' : 'mdi:whatsapp'} width="24" />
              </div>
              <div>
                {passo === 1 ? (
                  <>
                    <h3>É assim que {amostra?.nome || 'seu aluno'} vai receber</h3>
                    <p>Lembrete automático 3 dias antes do vencimento — depois vêm o do dia e o de atraso. Pode deixar assim ou escrever do seu jeito.</p>
                  </>
                ) : whatsappOk ? (
                  <>
                    <h3>Pronto! Agora veja chegando</h3>
                    <p>Mande essa mensagem pra você e confira no celular — exatamente como o aluno vê.</p>
                  </>
                ) : (
                  <>
                    <h3>Falta só conectar seu WhatsApp</h3>
                    <p>É dele que essa mensagem sai — do seu próprio número, sem você precisar lembrar de cobrar ninguém.</p>
                  </>
                )}
              </div>
            </div>

            {/* O celular só aparece no passo da mensagem: no de conectar ele já
                foi visto, e repetir só empurrava o botão pra longe. */}
            <div className={`onbg-teste ${passo === 2 ? 'sem-celular' : ''}`}>
              {passo === 1 && (
              <div className="onbg-celular">
                <div className="onbg-celular-topo">
                  <Icon icon="mdi:account-circle" width="28" />
                  <div>
                    <strong>{empresaReal || 'Seu WhatsApp'}</strong>
                    <span>online</span>
                  </div>
                </div>
                <div className="onbg-celular-chat">
                  {amostra ? (
                    <div className="onbg-balao">{mensagemPrevia}</div>
                  ) : (
                    <div className="onbg-balao carregando">Carregando a mensagem…</div>
                  )}
                </div>
              </div>
              )}

              <div className="onbg-teste-lado">
                {/* ---- Passo 2: ajustar a mensagem ---- */}
                {passo === 1 && (
                  <>
                    {editando ? (
                      <div className="onbg-editor">
                        <label htmlFor="onbg-template">Seu texto</label>
                        <textarea
                          id="onbg-template"
                          value={templateTexto}
                          onChange={(e) => setTemplateTexto(e.target.value)}
                          rows={11}
                        />
                        <span className="onbg-dica">
                          Os campos entre <code>{'{{ }}'}</code> são trocados pelos dados de cada aluno.
                        </span>
                      </div>
                    ) : (
                      <div className="onbg-lista-beneficios">
                        <span><Icon icon="mdi:check-circle" width="18" /> Sai sozinha, todo mês, pra cada aluno</span>
                        <span><Icon icon="mdi:check-circle" width="18" /> Com o nome e o valor certo de cada um</span>
                        <span><Icon icon="mdi:check-circle" width="18" /> Para de chegar quando ele paga</span>
                        <Button
                          variant="outline"
                          size="lg"
                          fullWidth
                          iconRight="mdi:pencil-outline"
                          onClick={() => setEditando(true)}
                          className="onbg-btn-editar"
                        >
                          Quero escrever do meu jeito
                        </Button>
                      </div>
                    )}

                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      iconRight="mdi:arrow-right"
                      onClick={confirmarMensagem}
                      loading={salvandoTexto}
                      disabled={salvandoTexto || !amostra}
                    >
                      {editando ? 'Salvar e continuar' : 'Gostei, continuar'}
                    </Button>
                  </>
                )}

                {/* ---- Passo 3a: conectar ---- */}
                {passo === 2 && !whatsappOk && (
                  <>
                    <div className="onbg-acao">
                      <Button
                        variant="whatsapp"
                        size="lg"
                        icon="mdi:qrcode-scan"
                        onClick={abrirModalZap}
                      >
                        Conectar meu WhatsApp
                      </Button>
                      <span className="onbg-dica">É só ler um QR Code com o celular. Menos de 1 minuto.</span>
                    </div>
                    <button type="button" className="onbg-link onbg-voltar" onClick={() => setPasso(1)}>
                      <Icon icon="mdi:arrow-left" width="16" /> Voltar pra mensagem
                    </button>
                  </>
                )}

                {/* ---- Passo 3b: conectado → enviar o teste ---- */}
                {passo === 2 && whatsappOk && (
                  <>
                    <div className="onbg-ok compacto">
                      <Icon icon="mdi:check-circle" width="22" />
                      <strong>WhatsApp conectado</strong>
                    </div>

                    <Input
                      label="Enviar o teste para"
                      type="tel"
                      value={destino}
                      onChange={(e) => setDestino(formatarTelefone(e.target.value))}
                      placeholder="(00) 00000-0000"
                      inputMode="numeric"
                      icon="mdi:whatsapp"
                    />

                    {caiNoChatVoce && (
                      <div className="onbg-aviso">
                        <Icon icon="mdi:information-outline" width="18" />
                        <span>
                          Esse é o número que você acabou de conectar — a mensagem vai cair na conversa
                          <strong> "Você"</strong>, sem notificação. Pra ver chegando de verdade, use outro
                          número (sócio, esposa, um amigo).
                        </span>
                      </div>
                    )}

                    <Button
                      variant="whatsapp"
                      size="lg"
                      fullWidth
                      icon="mdi:send"
                      onClick={enviarTeste}
                      loading={enviando}
                      disabled={enviando || !amostra}
                    >
                      Enviar pro meu WhatsApp
                    </Button>
                    <span className="onbg-dica">Sai do seu número. Nenhum aluno recebe nada.</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {onExplorar && (
        <button type="button" className="onbg-explorar" onClick={onExplorar}>
          Explorar o sistema primeiro <Icon icon="mdi:arrow-right" width="16" />
        </button>
      )}

      <Modal
        isOpen={modalZap}
        onClose={fecharModalZap}
        title="Conecte seu WhatsApp"
        subtitle="Leia o código com o celular que vai enviar as cobranças"
        size="sm"
        centered
        closeOnBackdrop={false}
        className="onbg-modal"
      >
        <Modal.Body>
          <div className="onbg-modal-zap">
            <div className="onbg-modal-qr">
              {zapStatus === 'conectado' ? (
                <div className="onbg-modal-ok">
                  <Icon icon="mdi:check-circle" width="64" />
                  <strong>WhatsApp conectado!</strong>
                </div>
              ) : zapQr ? (
                <img src={zapQr} alt="QR Code do WhatsApp" />
              ) : zapStatus === 'carregando' ? (
                <div className="onbg-modal-carregando">
                  <span className="onbg-spinner" />
                  <span>Gerando o código…</span>
                </div>
              ) : (
                <div className="onbg-modal-carregando">
                  <Icon icon="mdi:qrcode-remove" width="48" />
                  <span className="onbg-erro">{zapErro || 'Não foi possível gerar o código.'}</span>
                  <Button variant="whatsapp" icon="mdi:refresh" onClick={conectarWhatsApp}>
                    Gerar novo QR Code
                  </Button>
                </div>
              )}
            </div>

            {zapQr && zapStatus === 'aguardando' && (
              <span className="onbg-qr-aguardando">
                <span className="onbg-pulso" /> Aguardando a leitura… {Math.floor(zapSegundos / 60)}:{String(zapSegundos % 60).padStart(2, '0')}
              </span>
            )}

            <ol className="onbg-modal-passos">
              <li><span>1</span><div>Abra o <strong>WhatsApp</strong> no celular</div></li>
              <li><span>2</span><div>Toque em <strong>⋮</strong> (Android) ou <strong>Configurações</strong> (iPhone) e depois em <strong>Aparelhos conectados</strong></div></li>
              <li><span>3</span><div>Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para o código acima</div></li>
            </ol>
          </div>
        </Modal.Body>
      </Modal>

      <CsvImportModal
        isOpen={mostrarCsv}
        onClose={() => setMostrarCsv(false)}
        onImportComplete={(count) => {
          setMostrarCsv(false)
          showToast(`${count} alunos importados!`, 'success')
          if (count > 0) marcarFeito('cliente', 1)
        }}
        userId={userId}
        existingClients={[]}
        planos={[]}
        limiteClientes={500}
        clientesAtivos={0}
      />
    </div>
  )
}
