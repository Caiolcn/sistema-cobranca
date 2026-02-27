import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import useWindowSize from './hooks/useWindowSize'
import ConfirmModal from './ConfirmModal'
import { useUserPlan } from './hooks/useUserPlan'
import { useUser } from './contexts/UserContext'

console.log('>>> WhatsAppConexao.js CARREGADO <<<')

// Estado global do status de conexão do WhatsApp
let globalStatus = 'disconnected'
const statusListeners = []

export const subscribeToWhatsAppStatus = (callback) => {
  statusListeners.push(callback)
  return () => {
    const index = statusListeners.indexOf(callback)
    if (index > -1) statusListeners.splice(index, 1)
  }
}

const updateGlobalStatus = (newStatus) => {
  globalStatus = newStatus
  statusListeners.forEach(listener => listener(newStatus))
}

export const getWhatsAppStatus = () => globalStatus

// Templates padrão bonitos com emojis
const TEMPLATES_PADRAO = {
  pre_due_3days: `Olá, {{nomeCliente}}! 👋

Passando para te ajudar na organização da semana: sua mensalidade vence em 3 dias. 😃

💰 Valor: {{valorMensalidade}}
📆 Vencimento: {{dataVencimento}}

🔑 Chave Pix: {{chavePix}}

Adiantar o pagamento garante sua tranquilidade e a continuidade dos seus planos sem correria! 💪`,

  due_day: `Oi, {{nomeCliente}}! Tudo bem? 😃

Hoje é o dia do vencimento da sua mensalidade.

💰 Valor: {{valorMensalidade}}
💳 Pix para pagamento: {{chavePix}}

Manter seu plano em dia garante que você continue aproveitando todos os nossos benefícios sem interrupções! 🚀

Qualquer dúvida, estou à disposição.`,

  overdue: `Olá, {{nomeCliente}}, como vai?

Notamos que o pagamento da sua mensalidade (vencida em {{dataVencimento}}) ainda não consta em nosso sistema.

Sabemos que a rotina é corrida, por isso trouxemos os dados aqui para facilitar sua regularização agora mesmo:

💰 Valor: {{valorMensalidade}}
🔑 Chave Pix: {{chavePix}}

Se você já realizou o pagamento e foi um atraso na nossa baixa manual, basta me enviar o comprovante por aqui! Obrigado! 🙏`,

  class_reminder: `Olá, {{nomeCliente}}!

Lembrete: sua aula de {{descricaoAula}} começa em 1 hora! 🕐

⏰ Horário: {{horarioAula}}
📍 Local: {{nomeEmpresa}}

Até já! 💪`,

  birthday: `Feliz aniversário, {{nomeCliente}}! 🎂🎉

A equipe {{nomeEmpresa}} deseja a você um dia incrível, cheio de saúde, alegria e conquistas!

Obrigado por fazer parte da nossa família. Conte sempre com a gente! 💪🎈`
}

// Mensagem padrão do template (fallback para compatibilidade)
const MENSAGEM_PADRAO = TEMPLATES_PADRAO.overdue

export default function WhatsAppConexao() {
  const navigate = useNavigate()
  const { isMobile, isTablet, isSmallScreen } = useWindowSize()
  const { isLocked } = useUserPlan()
  const { userId: contextUserId, isAdmin, adminViewingAs } = useUser()
  const isStarter = isLocked('pro') // true se plano é starter
  const automacaoLocked = isLocked('pro') // Automações de 3 e 5 dias são Pro+
  const [activeTab, setActiveTab] = useState('conexao')

  // ESTADOS SIMPLIFICADOS (6 essenciais)
  const [status, setStatus] = useState('disconnected') // 'disconnected' | 'connecting' | 'connected'
  const [qrCode, setQrCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [config, setConfig] = useState({ apiKey: '', apiUrl: '', instanceName: '' })
  const configRef = useRef(config)
  const [tempoRestante, setTempoRestante] = useState(120) // Contador de 2 minutos (120 segundos)

  // Estados para conexão por código de pareamento (alternativa ao QR Code para celular)
  const [modoConexao, setModoConexao] = useState('qrcode') // 'qrcode' | 'pairing'
  const [pairingCode, setPairingCode] = useState(null)
  const [telefoneParear, setTelefoneParear] = useState('')

  // Estados para templates
  const [templates, setTemplates] = useState([])
  const [templateAtual, setTemplateAtual] = useState({
    titulo: 'Lembrete de Cobrança',
    mensagem: MENSAGEM_PADRAO
  })
  const [tipoTemplateSelecionado, setTipoTemplateSelecionado] = useState('due_day') // Starter começa em "No Dia"
  const [templatesAgrupados, setTemplatesAgrupados] = useState({
    pre_due_3days: null,
    due_day: null,
    overdue: null
  })
  const [tituloTemplate, setTituloTemplate] = useState('Lembrete - Vencimento Hoje')
  const [mensagemTemplate, setMensagemTemplate] = useState(TEMPLATES_PADRAO.due_day)

  // Starter só pode editar template "No Dia" (due_day)
  // Pro/Premium podem editar todos os templates
  const templateEditLocked = isStarter && tipoTemplateSelecionado !== 'due_day'

  // Estados para automação (novo fluxo: 3 dias antes, no dia, 3 dias depois)
  const [automacao3DiasAtiva, setAutomacao3DiasAtiva] = useState(false)
  const [automacaoNoDiaAtiva, setAutomacaoNoDiaAtiva] = useState(true) // Ativo por padrão
  const [automacao3DiasDepoisAtiva, setAutomacao3DiasDepoisAtiva] = useState(false)
  const [automacaoLembreteAulaAtiva, setAutomacaoLembreteAulaAtiva] = useState(false)
  const [automacaoAniversarioAtiva, setAutomacaoAniversarioAtiva] = useState(false)

  // Estado para Chave PIX
  const [chavePix, setChavePix] = useState('')
  const [salvandoPix, setSalvandoPix] = useState(false)

  // Estado para modal de feedback
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: 'success', title: '', message: '' })
  const [previewModalAberto, setPreviewModalAberto] = useState(false)

  // Estado para modal de upgrade (recurso bloqueado)
  const [upgradeModal, setUpgradeModal] = useState({ isOpen: false, featureName: '' })

  // Estado para modal de confirmação de desconexão
  const [confirmDesconexaoModal, setConfirmDesconexaoModal] = useState(false)

  // Estado para método de pagamento (PIX Manual ou Link Asaas)
  const [metodoPagamento, setMetodoPagamento] = useState('pix_manual')
  const [asaasConfigurado, setAsaasConfigurado] = useState(false)

  // Atualizar status global quando mudar
  useEffect(() => {
    updateGlobalStatus(status)
  }, [status])

  // Manter configRef sincronizado
  useEffect(() => {
    configRef.current = config
  }, [config])

  // Carregar tudo em paralelo para melhorar performance
  // Recarrega quando admin troca de cliente
  useEffect(() => {
    const carregarTudo = async () => {
      try {
        // Usar userId do contexto (admin pode estar visualizando outro cliente)
        const effectiveUserId = contextUserId
        if (!effectiveUserId) return

        const instanceName = `instance_${effectiveUserId.substring(0, 8)}`

        // 2. Fazer TODAS as queries em paralelo
        const [configResult, templatesResult, automacoesResult, usuarioResult, metodoPagResult, asaasResult] = await Promise.all([
          // Config da Evolution API
          supabase
            .from('config')
            .select('chave, valor')
            .in('chave', ['evolution_api_key', 'evolution_api_url']),

          // Templates do usuário
          supabase
            .from('templates')
            .select('*')
            .eq('user_id', effectiveUserId)
            .eq('ativo', true)
            .order('created_at', { ascending: false }),

          // Configurações de automação do usuário (da tabela configuracoes_cobranca)
          supabase
            .from('configuracoes_cobranca')
            .select('enviar_3_dias_antes, enviar_no_dia, enviar_3_dias_depois, enviar_lembrete_aula, enviar_aniversario')
            .eq('user_id', effectiveUserId)
            .maybeSingle(),

          // Dados do usuário (chave PIX)
          supabase
            .from('usuarios')
            .select('chave_pix')
            .eq('id', effectiveUserId)
            .single(),

          // Método de pagamento WhatsApp
          supabase
            .from('config')
            .select('chave, valor')
            .eq('chave', `${effectiveUserId}_metodo_pagamento_whatsapp`)
            .maybeSingle(),

          // Verificar se Asaas está configurado
          supabase
            .from('usuarios')
            .select('asaas_api_key, modo_integracao')
            .eq('id', effectiveUserId)
            .single()
        ])

        // 3. Processar Config Evolution API
        const configMap = {}
        configResult.data?.forEach(item => { configMap[item.chave] = item.valor })

        const apiKey = configMap.evolution_api_key || ''
        const apiUrl = configMap.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'

        setConfig({ apiKey, apiUrl, instanceName })

        // 3.1 Processar Chave PIX
        if (usuarioResult.data?.chave_pix) {
          setChavePix(usuarioResult.data.chave_pix)
        }

        // 4. Processar Templates
        // Priorizar templates customizados (is_padrao !== true) sobre os padrões
        const templates = templatesResult.data || []
        const findBestTemplate = (tipo) => {
          // Primeiro tenta encontrar um template customizado (is_padrao = false ou null)
          const customizado = templates.find(t => t.tipo === tipo && t.is_padrao !== true)
          if (customizado) return customizado
          // Se não encontrar customizado, usa o padrão
          return templates.find(t => t.tipo === tipo) || null
        }
        let agrupados = {
          pre_due_3days: findBestTemplate('pre_due_3days'),
          due_day: findBestTemplate('due_day'),
          overdue: findBestTemplate('overdue'),
          class_reminder: findBestTemplate('class_reminder'),
          birthday: findBestTemplate('birthday')
        }

        // 4.1 Criar templates que não existem automaticamente
        // Todos os 3 tipos são criados para garantir que o n8n encontre templates
        const templatesParaCriar = [
          { tipo: 'due_day', titulo: 'Lembrete - Vencimento Hoje', mensagem: TEMPLATES_PADRAO.due_day },
          { tipo: 'pre_due_3days', titulo: 'Lembrete - 3 Dias Antes do Vencimento', mensagem: TEMPLATES_PADRAO.pre_due_3days },
          { tipo: 'overdue', titulo: 'Cobrança - 3 Dias Após o Vencimento', mensagem: TEMPLATES_PADRAO.overdue }
        ]

        for (const tmpl of templatesParaCriar) {
          if (!agrupados[tmpl.tipo]) {
            const { data: novoTemplate, error: erroInsert } = await supabase
              .from('templates')
              .insert({
                user_id: effectiveUserId,
                titulo: tmpl.titulo,
                mensagem: tmpl.mensagem,
                tipo: tmpl.tipo,
                ativo: true,
                is_padrao: true
              })
              .select()
              .single()

            if (!erroInsert && novoTemplate) {
              agrupados[tmpl.tipo] = novoTemplate
              console.log(`Template "${tmpl.tipo}" criado automaticamente`)
            }
          }
        }

        setTemplatesAgrupados(agrupados)

        // Carregar template atual baseado no tipo selecionado (due_day por padrão)
        const templateAtual = agrupados[tipoTemplateSelecionado] || agrupados['due_day']
        if (templateAtual) {
          setTituloTemplate(templateAtual.titulo)
          setMensagemTemplate(templateAtual.mensagem)
        } else {
          setTituloTemplate(getTituloDefault(tipoTemplateSelecionado))
          setMensagemTemplate(getMensagemDefault(tipoTemplateSelecionado))
        }

        // 5. Processar Automações (da tabela configuracoes_cobranca)
        const configCobranca = automacoesResult.data
        // Se não existir configuração, "No Dia" vem ativo por padrão
        setAutomacao3DiasAtiva(configCobranca?.enviar_3_dias_antes === true)
        setAutomacaoNoDiaAtiva(configCobranca?.enviar_no_dia !== false)
        setAutomacao3DiasDepoisAtiva(configCobranca?.enviar_3_dias_depois === true)
        setAutomacaoLembreteAulaAtiva(configCobranca?.enviar_lembrete_aula === true)
        setAutomacaoAniversarioAtiva(configCobranca?.enviar_aniversario === true)

        // 5.1 Processar método de pagamento
        if (metodoPagResult.data?.valor) {
          setMetodoPagamento(metodoPagResult.data.valor)
        }

        // 5.2 Verificar se Asaas está configurado
        if (asaasResult.data) {
          setAsaasConfigurado(!!(asaasResult.data.asaas_api_key && asaasResult.data.modo_integracao === 'asaas'))
        }

        // 6. Verificar status WhatsApp (pode ser em paralelo com os outros)
        if (apiKey && instanceName) {
          try {
            const response = await fetch(
              `${apiUrl}/instance/connectionState/${instanceName}`,
              { headers: { 'apikey': apiKey } }
            )

            if (response.ok) {
              const data = await response.json()
              const state = data.instance?.state || 'close'
              if (state === 'open') {
                setStatus('connected')
                // Sincronizar mensallizap para que o onboarding checklist reflita a conexão
                supabase
                  .from('mensallizap')
                  .upsert({
                    user_id: effectiveUserId,
                    conectado: true,
                    instance_name: instanceName,
                    updated_at: new Date().toISOString()
                  }, { onConflict: 'user_id' })
                  .then(({ error }) => {
                    if (error) console.warn('Erro ao sincronizar mensallizap:', error)
                  })
              }
            }
          } catch (error) {
            console.log('Instância não existe ou está desconectada')
          }
        }
      } catch (error) {
        console.error('Erro ao carregar configurações:', error)
        setErro('Erro ao carregar configurações')
      }
    }

    carregarTudo()
  }, [contextUserId])

  // Salvar conexão WhatsApp no banco de dados (na tabela config E mensallizap)
  const salvarConexaoNoBanco = async () => {
    try {
      if (!contextUserId) {
        console.error('Usuário não autenticado')
        return
      }

      console.log('🔍 Salvando conexão WhatsApp...')
      console.log('User ID:', contextUserId)
      console.log('Instance Name:', config.instanceName)

      // Salvar instance_name na tabela config (GLOBAL para o usuário)
      const { data: dataInstanceName, error: errorInstanceName } = await supabase
        .from('config')
        .upsert({
          user_id: contextUserId,
          chave: 'evolution_instance_name',
          valor: config.instanceName,
          descricao: 'Nome da instância conectada na Evolution API',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,chave'
        })
        .select()

      if (errorInstanceName) {
        console.warn('⚠️ Erro ao salvar instance name (não crítico):', errorInstanceName)
        // Continua execução - não é fatal
      }

      console.log('✅ Instance name salvo:', dataInstanceName)

      // Salvar status de conexão (conectado = true)
      const { data: dataStatus, error: errorStatus } = await supabase
        .from('config')
        .upsert({
          user_id: contextUserId,
          chave: 'whatsapp_conectado',
          valor: 'true',
          descricao: 'Status de conexão do WhatsApp',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,chave'
        })
        .select()

      if (errorStatus) {
        console.error('❌ Erro ao salvar status:', errorStatus)
      } else {
        console.log('✅ Status salvo:', dataStatus)
        console.log('✅ Conexão WhatsApp salva no banco de dados')

        // Verificar o que foi salvo
        const { data: verificacao, error: errorVerificacao } = await supabase
          .from('config')
          .select('chave, valor')
          .in('chave', ['evolution_instance_name', 'whatsapp_conectado'])

        console.log('📊 Verificação no banco:', verificacao)
        if (errorVerificacao) console.error('Erro na verificação:', errorVerificacao)
      }

      // ===================================
      // ATUALIZAR TABELA MENSALLIZAP
      // ===================================
      console.log('💾 Atualizando tabela mensallizap...')

      // Buscar dados do usuário
      const { data: usuarioData, error: usuarioError } = await supabase
        .from('usuarios')
        .select('nome_completo, email, telefone, plano')
        .eq('id', contextUserId)
        .single()

      if (usuarioError) {
        console.error('❌ Erro ao buscar dados do usuário:', usuarioError)
        return
      }

      // Buscar número do WhatsApp conectado (tentativa via Evolution API)
      let whatsappNumero = null
      try {
        const profileResponse = await fetch(
          `${config.apiUrl}/instance/fetchProfile/${config.instanceName}`,
          { headers: { 'apikey': config.apiKey } }
        )
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          whatsappNumero = profileData.wuid || profileData.id || null
          console.log('📱 Número WhatsApp detectado:', whatsappNumero)
        }
      } catch (err) {
        console.log('⚠️ Não foi possível buscar o número do WhatsApp:', err.message)
      }

      // Atualizar ou criar registro na mensallizap
      const agora = new Date().toISOString()
      const { data: mensallizapData, error: mensallizapError } = await supabase
        .from('mensallizap')
        .upsert({
          user_id: contextUserId,
          nome_completo: usuarioData?.nome_completo || null,
          email: usuarioData?.email || '',
          telefone: usuarioData?.telefone || null,
          plano: usuarioData?.plano || 'starter',
          whatsapp_numero: whatsappNumero,
          instance_name: config.instanceName,
          conectado: true,
          ultima_conexao: agora,
          updated_at: agora
        }, {
          onConflict: 'user_id'
        })
        .select()

      if (mensallizapError) {
        console.error('❌ Erro ao atualizar mensallizap:', mensallizapError)
        console.error('❌ Detalhes do erro:', JSON.stringify(mensallizapError, null, 2))
      } else {
        console.log('✅ Mensallizap atualizada com sucesso!', mensallizapData)
        console.log('📅 Horário salvo (ISO):', agora)
        console.log('📅 Horário local:', new Date(agora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))
      }

    } catch (error) {
      console.error('Erro ao salvar conexão:', error)
    }
  }

  // Carregar configurações de automação
  const carregarConfiguracoesAutomacao = async () => {
    try {
      if (!contextUserId) return

      // Chaves únicas por usuário (prefixadas com user_id)
      const chaves = [
        `${contextUserId}_automacao_3dias_ativa`,
        `${contextUserId}_automacao_5dias_ativa`,
        `${contextUserId}_automacao_ematraso_ativa`
      ]

      const { data, error } = await supabase
        .from('config')
        .select('chave, valor')
        .in('chave', chaves)

      if (error) {
        console.error('Erro ao carregar configurações de automação:', error)
        return
      }

      const configMap = {}
      data?.forEach(item => {
        // Remover o prefixo do user_id para facilitar o acesso
        const chaveSimples = item.chave.replace(`${contextUserId}_`, '')
        configMap[chaveSimples] = item.valor
      })

      setAutomacao3DiasAtiva(configMap['automacao_3dias_ativa'] === 'true')
      // No Dia vem ativo por padrão se não houver configuração
      setAutomacaoNoDiaAtiva(configMap['automacao_nodia_ativa'] !== 'false')
      setAutomacao3DiasDepoisAtiva(configMap['automacao_3diasdepois_ativa'] === 'true')
    } catch (error) {
      console.error('Erro ao carregar configurações de automação:', error)
    }
  }

  // Salvar configuração de automação na tabela configuracoes_cobranca
  const salvarConfiguracaoAutomacao = async (chave, valor) => {
    try {
      if (!contextUserId) {
        setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Usuário não autenticado' })
        return false
      }

      // Mapear chave do React para coluna da tabela configuracoes_cobranca
      const mapeamentoColunas = {
        'automacao_3dias_ativa': 'enviar_3_dias_antes',
        'automacao_nodia_ativa': 'enviar_no_dia',
        'automacao_3diasdepois_ativa': 'enviar_3_dias_depois',
        'automacao_lembrete_aula_ativa': 'enviar_lembrete_aula',
        'automacao_aniversario_ativa': 'enviar_aniversario'
      }

      const coluna = mapeamentoColunas[chave]
      if (!coluna) {
        console.error('Chave de automação inválida:', chave)
        return false
      }

      // Verificar se já existe registro para este usuário
      const { data: existing, error: selectError } = await supabase
        .from('configuracoes_cobranca')
        .select('id')
        .eq('user_id', contextUserId)
        .maybeSingle()

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('Erro ao verificar configuração:', selectError)
      }

      if (existing) {
        // Atualizar registro existente
        const { error } = await supabase
          .from('configuracoes_cobranca')
          .update({
            [coluna]: valor,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', contextUserId)

        if (error) {
          console.error('Erro ao atualizar configuração:', error)
          setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar configuração: ' + error.message })
          return false
        }
      } else {
        // Inserir novo registro
        const { error } = await supabase
          .from('configuracoes_cobranca')
          .insert({
            user_id: contextUserId,
            [coluna]: valor
          })

        if (error) {
          console.error('Erro ao inserir configuração:', error)
          setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar configuração: ' + error.message })
          return false
        }
      }

      return true
    } catch (error) {
      console.error('Erro ao salvar configuração de automação:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar configuração' })
      return false
    }
  }

  // Atualizar variável de pagamento nos templates (troca {{chavePix}} <-> {{linkPagamento}})
  // Também troca os labels associados para manter consistência
  const atualizarVariavelTemplates = async (de, para) => {
    try {
      if (!contextUserId) return

      // Buscar templates que contenham a variável antiga OU os labels antigos
      const { data: templatesParaAtualizar } = await supabase
        .from('templates')
        .select('id, mensagem')
        .eq('user_id', contextUserId)

      const temAlteracao = templatesParaAtualizar?.filter(t =>
        t.mensagem.includes(de) ||
        (de === '{{chavePix}}' && (t.mensagem.includes('Chave Pix:') || t.mensagem.includes('Pix para pagamento:'))) ||
        (de === '{{linkPagamento}}' && t.mensagem.includes('Link de pagamento:'))
      )

      if (temAlteracao?.length) {
        for (const t of temAlteracao) {
          let novaMensagem = t.mensagem.replaceAll(de, para)

          // Trocar também os labels
          if (de === '{{chavePix}}') {
            // PIX -> Link Asaas: trocar labels
            novaMensagem = novaMensagem
              .replace(/🔑 Chave Pix:/g, '🔗 Link de pagamento:')
              .replace(/💳 Pix para pagamento:/g, '🔗 Link de pagamento:')
          } else if (de === '{{linkPagamento}}') {
            // Link Asaas -> PIX: trocar labels de volta
            novaMensagem = novaMensagem
              .replace(/🔗 Link de pagamento:/g, '🔑 Chave Pix:')
          }

          await supabase
            .from('templates')
            .update({ mensagem: novaMensagem })
            .eq('id', t.id)
        }

        // Recarregar templates no estado
        const { data: templatesAtualizados } = await supabase
          .from('templates')
          .select('*')
          .eq('user_id', contextUserId)
          .eq('ativo', true)
          .order('created_at', { ascending: false })

        if (templatesAtualizados) {
          // Priorizar customizados sobre padrões (mesma lógica de carregarTemplates)
          const findBest = (tipo) => {
            const custom = templatesAtualizados.find(t => t.tipo === tipo && t.is_padrao !== true)
            return custom || templatesAtualizados.find(t => t.tipo === tipo) || null
          }
          const agrupados = {
            pre_due_3days: findBest('pre_due_3days'),
            due_day: findBest('due_day'),
            overdue: findBest('overdue')
          }
          setTemplatesAgrupados(agrupados)

          // Atualizar template atualmente selecionado no editor
          const templateSelecionado = agrupados[tipoTemplateSelecionado]
          if (templateSelecionado) {
            setMensagemTemplate(templateSelecionado.mensagem)
          }
        }
      }
    } catch (error) {
      console.error('Erro ao atualizar variável nos templates:', error)
    }
  }

  // Salvar método de pagamento (PIX Manual ou Link Asaas)
  const salvarMetodoPagamento = async (metodo) => {
    try {
      if (!contextUserId) return

      setMetodoPagamento(metodo)

      const chaveUnica = `${contextUserId}_metodo_pagamento_whatsapp`

      // Verificar se já existe
      const { data: existing } = await supabase
        .from('config')
        .select('id')
        .eq('chave', chaveUnica)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('config')
          .update({ valor: metodo, updated_at: new Date().toISOString() })
          .eq('chave', chaveUnica)
      } else {
        await supabase
          .from('config')
          .insert({
            user_id: contextUserId,
            chave: chaveUnica,
            valor: metodo,
            descricao: 'Método de pagamento nas mensagens WhatsApp',
            updated_at: new Date().toISOString()
          })
      }

      // Auto-atualizar templates: trocar variável de pagamento
      if (metodo === 'asaas_link') {
        await atualizarVariavelTemplates('{{chavePix}}', '{{linkPagamento}}')
      } else {
        await atualizarVariavelTemplates('{{linkPagamento}}', '{{chavePix}}')
      }

      // Atualizar template exibido no editor (caso seja default/não salvo)
      const templateAtual = templatesAgrupados[tipoTemplateSelecionado]
      if (!templateAtual) {
        let msg = TEMPLATES_PADRAO[tipoTemplateSelecionado] || TEMPLATES_PADRAO.overdue
        if (metodo === 'asaas_link') {
          msg = msg
            .replaceAll('{{chavePix}}', '{{linkPagamento}}')
            .replace(/🔑 Chave Pix:/g, '🔗 Link de pagamento:')
            .replace(/💳 Pix para pagamento:/g, '🔗 Link de pagamento:')
        }
        setMensagemTemplate(msg)
      }

      setFeedbackModal({
        isOpen: true,
        type: 'success',
        title: 'Salvo!',
        message: metodo === 'asaas_link'
          ? 'Link de pagamento Asaas ativado nas mensagens'
          : 'PIX manual ativado nas mensagens'
      })
    } catch (error) {
      console.error('Erro ao salvar método de pagamento:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar método de pagamento' })
    }
  }

  // Função para criar ou atualizar template padrão automaticamente ao ativar toggle
  const criarTemplatePadraoSeNaoExiste = async (tipo) => {
    try {
      if (!contextUserId) return false

      // Verificar se já existe template deste tipo (ativo ou inativo)
      const { data: existente, error: erroBusca } = await supabase
        .from('templates')
        .select('id, ativo, mensagem')
        .eq('user_id', contextUserId)
        .eq('tipo', tipo)
        .maybeSingle()

      if (erroBusca) {
        console.error('Erro ao verificar template existente:', erroBusca)
        return false
      }

      // Criar template padrão
      const titulos = {
        pre_due_3days: 'Lembrete - 3 Dias Antes do Vencimento',
        due_day: 'Lembrete - Vencimento Hoje',
        overdue: 'Cobrança - 3 Dias Após o Vencimento',
        class_reminder: 'Lembrete de Aula',
        birthday: 'Mensagem de Aniversário'
      }

      // Se já existe, verificar se precisa atualizar
      if (existente) {
        // Se já está ativo e tem mensagem, não precisa fazer nada
        if (existente.ativo && existente.mensagem && existente.mensagem.trim() !== '') {
          console.log(`Template ${tipo} já existe e está ativo`)
          return true
        }

        // Atualizar template existente (ativar e/ou preencher mensagem)
        const { error: erroUpdate } = await supabase
          .from('templates')
          .update({
            ativo: true,
            mensagem: existente.mensagem && existente.mensagem.trim() !== ''
              ? existente.mensagem
              : TEMPLATES_PADRAO[tipo],
            titulo: titulos[tipo],
            updated_at: new Date().toISOString()
          })
          .eq('id', existente.id)

        if (erroUpdate) {
          console.error('Erro ao atualizar template:', erroUpdate)
          return false
        }

        console.log(`✅ Template ${tipo} atualizado com sucesso!`)
        await carregarTemplates()
        return true
      }

      // Criar novo template
      const { error: erroInsert } = await supabase
        .from('templates')
        .insert({
          user_id: contextUserId,
          titulo: titulos[tipo],
          mensagem: TEMPLATES_PADRAO[tipo],
          tipo: tipo,
          ativo: true,
          is_padrao: true
        })

      if (erroInsert) {
        console.error('Erro ao criar template padrão:', erroInsert)
        return false
      }

      console.log(`✅ Template padrão ${tipo} criado com sucesso!`)

      // Atualizar lista de templates
      await carregarTemplates()

      return true
    } catch (error) {
      console.error('Erro ao criar template padrão:', error)
      return false
    }
  }

  // Toggle automação 3 dias
  const toggleAutomacao3Dias = async () => {
    const novoValor = !automacao3DiasAtiva

    // Se está ativando, criar template padrão se não existir
    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('pre_due_3days')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_3dias_ativa', novoValor)
    if (sucesso) {
      setAutomacao3DiasAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Automação Ativada',
          message: 'Lembretes de 3 dias antes serão enviados automaticamente! O template padrão foi configurado.'
        })
      }
    }
  }

  // Toggle automação no dia
  const toggleAutomacaoNoDia = async () => {
    const novoValor = !automacaoNoDiaAtiva

    // Se está ativando, criar template padrão se não existir
    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('due_day')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_nodia_ativa', novoValor)
    if (sucesso) {
      setAutomacaoNoDiaAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Automação Ativada',
          message: 'Lembretes no dia do vencimento serão enviados automaticamente! O template padrão foi configurado.'
        })
      }
    }
  }

  // Toggle automação 3 dias depois
  const toggleAutomacao3DiasDepois = async () => {
    const novoValor = !automacao3DiasDepoisAtiva

    // Se está ativando, criar template padrão se não existir
    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('overdue')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_3diasdepois_ativa', novoValor)
    if (sucesso) {
      setAutomacao3DiasDepoisAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Automação Ativada',
          message: 'Cobranças de 3 dias após o vencimento serão enviadas automaticamente! O template padrão foi configurado.'
        })
      }
    }
  }

  const toggleAutomacaoLembreteAula = async () => {
    const novoValor = !automacaoLembreteAulaAtiva

    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('class_reminder')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_lembrete_aula_ativa', novoValor)
    if (sucesso) {
      setAutomacaoLembreteAulaAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Lembrete de Aula Ativado',
          message: 'Lembretes de aula serão enviados 1 hora antes via WhatsApp! Configure os horários na página Horários.'
        })
      }
    }
  }

  // Toggle automação aniversário
  const toggleAutomacaoAniversario = async () => {
    const novoValor = !automacaoAniversarioAtiva

    if (novoValor) {
      const templateCriado = await criarTemplatePadraoSeNaoExiste('birthday')
      if (!templateCriado) {
        setFeedbackModal({
          isOpen: true,
          type: 'danger',
          title: 'Erro',
          message: 'Não foi possível criar o template padrão. Tente novamente.'
        })
        return
      }
    }

    const sucesso = await salvarConfiguracaoAutomacao('automacao_aniversario_ativa', novoValor)
    if (sucesso) {
      setAutomacaoAniversarioAtiva(novoValor)
      if (novoValor) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Aniversário Ativado',
          message: 'Mensagens de aniversário serão enviadas automaticamente às 8h! O template padrão foi configurado.'
        })
      }
    }
  }

  // FUNÇÃO UNIFICADA: Conectar WhatsApp
  const conectarWhatsApp = async () => {
    setLoading(true)
    setErro('')

    try {
      console.log('📱 Conectando WhatsApp...')

      // 1. Verificar se instância existe
      console.log('🔍 Verificando instância...')
      const response = await fetch(`${config.apiUrl}/instance/fetchInstances`, {
        headers: { 'apikey': config.apiKey }
      })

      let instanciaExiste = false
      let estadoInstancia = null
      if (response.ok) {
        const data = await response.json()
        const minhaInstancia = data.find(inst => inst.instance?.instanceName === config.instanceName)
        instanciaExiste = !!minhaInstancia
        estadoInstancia = minhaInstancia?.instance?.state || null
      }

      console.log(`ℹ️ Instância existe: ${instanciaExiste}`)
      if (instanciaExiste && estadoInstancia) {
        console.log(`📊 Estado da instância: ${estadoInstancia}`)
      }

      // 2. Se já está conectada, não precisa gerar QR Code
      if (instanciaExiste && estadoInstancia === 'open') {
        console.log('✅ Instância já está conectada! Pulando QR Code.')
        setStatus('connected')
        setQrCode(null)
        await salvarConexaoNoBanco()
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Já Conectado',
          message: 'Seu WhatsApp já está conectado! Não é necessário escanear o QR Code novamente.'
        })
        return
      }

      // 3. Se não existe, criar
      if (!instanciaExiste) {
        console.log('🔄 Criando instância...')
        const createResponse = await fetch(`${config.apiUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.apiKey
          },
          body: JSON.stringify({
            instanceName: config.instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS'
          })
        })

        // 403/409 = já existe, não é erro
        if (createResponse.status !== 403 && createResponse.status !== 409 && !createResponse.ok) {
          const errorData = await createResponse.json().catch(() => ({}))
          throw new Error(errorData.message || `Erro ao criar instância: HTTP ${createResponse.status}`)
        }

        console.log('✅ Instância criada/já existe')
      }

      // 3. Gerar QR Code ou Código de Pareamento
      if (modoConexao === 'pairing') {
        // Modo código de pareamento (para celular)
        const telefoneLimpo = telefoneParear.replace(/\D/g, '')
        if (telefoneLimpo.length < 10) {
          throw new Error('Digite seu número de telefone com DDD (ex: 11999999999)')
        }

        const numeroCompleto = telefoneLimpo.startsWith('55') ? telefoneLimpo : `55${telefoneLimpo}`
        console.log('📱 Gerando código de pareamento para:', numeroCompleto)

        const connectResponse = await fetch(`${config.apiUrl}/instance/connect/${config.instanceName}?number=${numeroCompleto}`, {
          headers: { 'apikey': config.apiKey }
        })

        if (!connectResponse.ok) {
          const errorData = await connectResponse.json().catch(() => ({}))
          throw new Error(errorData.message || `HTTP ${connectResponse.status}`)
        }

        const data = await connectResponse.json()
        console.log('📦 Resposta completa da API:', data)

        const code = data.pairingCode
        if (!code) {
          console.error('❌ Código de pareamento não encontrado. Resposta:', Object.keys(data))
          throw new Error('Código de pareamento não foi gerado. Tente novamente ou use o QR Code.')
        }

        console.log('✅ Código de pareamento gerado:', code)
        setPairingCode(code)
        setQrCode(null)
        setStatus('connecting')
        setTempoRestante(120)
      } else {
        // Modo QR Code (padrão)
        console.log('📡 Gerando QR Code...')
        const connectResponse = await fetch(`${config.apiUrl}/instance/connect/${config.instanceName}`, {
          headers: { 'apikey': config.apiKey }
        })

        if (!connectResponse.ok) {
          const errorData = await connectResponse.json().catch(() => ({}))
          throw new Error(errorData.message || `HTTP ${connectResponse.status}`)
        }

        const data = await connectResponse.json()
        console.log('📦 Resposta completa da API:', data)

        // Tentar extrair QR Code de múltiplos formatos
        const qr = data.base64 || data.qrcode?.base64 || data.code || data.qr

        if (!qr) {
          console.error('❌ QR Code não encontrado. Estrutura da resposta:', Object.keys(data))
          throw new Error('QR Code não foi gerado pela API. Abra o console (F12) para ver detalhes.')
        }

        console.log('✅ QR Code gerado!')
        setQrCode(qr)
        setPairingCode(null)
        setStatus('connecting')
        setTempoRestante(120)
      }

    } catch (error) {
      console.error('❌ Erro completo:', error)
      setErro(error.message)
      setStatus('disconnected')
    } finally {
      setLoading(false)
    }
  }

  // POLLING SIMPLIFICADO
  useEffect(() => {
    if (status !== 'connecting' || (!qrCode && !pairingCode)) return

    const currentConfig = configRef.current
    if (!currentConfig.apiKey) return

    console.log('🔄 Iniciando polling...')

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(
          `${currentConfig.apiUrl}/instance/connectionState/${currentConfig.instanceName}`,
          { headers: { 'apikey': currentConfig.apiKey } }
        )

        if (response.ok) {
          const data = await response.json()
          const state = data.instance?.state || 'close'

          console.log(`📊 Status: ${state}`)

          if (state === 'open') {
            console.log('✅ Conectado!')
            setStatus('connected')
            setQrCode(null)
            setPairingCode(null)

            // Salvar conexão no banco de dados
            await salvarConexaoNoBanco()
          }
        }
      } catch (error) {
        console.error('Erro no polling:', error)
      }
    }, 3000)

    // Contador regressivo de 1 em 1 segundo
    const countdownId = setInterval(() => {
      setTempoRestante(prev => {
        if (prev <= 1) {
          return 0
        }
        return prev - 1
      })
    }, 1000)

    const timeoutId = setTimeout(() => {
      console.log('⏱️ Código expirado')
      clearInterval(intervalId)
      clearInterval(countdownId)
      setQrCode(null)
      setPairingCode(null)
      setStatus('disconnected')
      setTempoRestante(120)
      setErro('Tempo expirado. Clique em "Conectar WhatsApp" novamente.')
    }, 120000)

    return () => {
      console.log('🧹 Limpando polling...')
      clearInterval(intervalId)
      clearInterval(countdownId)
      clearTimeout(timeoutId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, qrCode, pairingCode])

  // Desconectar
  const desconectar = async () => {
    setLoading(true)
    try {
      await fetch(`${config.apiUrl}/instance/logout/${config.instanceName}`, {
        method: 'DELETE',
        headers: { 'apikey': config.apiKey }
      })

      // Atualizar status no banco de dados (tabela config)
      if (contextUserId) {
        await supabase
          .from('config')
          .upsert({
            user_id: contextUserId,
            chave: 'whatsapp_conectado',
            valor: 'false',
            descricao: 'Status de conexão do WhatsApp',
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,chave'
          })

        // Atualizar tabela mensallizap (marcar como desconectado)
        console.log('💾 Atualizando mensallizap (desconexão)...')
        const { error: mensallizapError } = await supabase
          .from('mensallizap')
          .update({
            conectado: false,
            ultima_desconexao: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', contextUserId)

        if (mensallizapError) {
          console.error('❌ Erro ao atualizar mensallizap:', mensallizapError)
        } else {
          console.log('✅ Mensallizap atualizada (desconectado)')
        }
      }

      setStatus('disconnected')
      setQrCode(null)
      setFeedbackModal({ isOpen: true, type: 'success', title: 'Desconectado', message: 'WhatsApp desconectado com sucesso!' })
    } catch (error) {
      setErro('Erro ao desconectar: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // ========== TEMPLATES ==========

  const gerarPreview = (mensagem) => {
    return mensagem
      .replace(/\{\{nomeCliente\}\}/g, 'João Silva')
      .replace(/\{\{telefone\}\}/g, '(62) 98246-6639')
      .replace(/\{\{valorMensalidade\}\}/g, 'R$ 150,00')
      .replace(/\{\{dataVencimento\}\}/g, '06/01/2026')
      .replace(/\{\{diasAtraso\}\}/g, '5')
      .replace(/\{\{nomeEmpresa\}\}/g, 'Minha Empresa')
      .replace(/\{\{chavePix\}\}/g, 'minha@chave.pix')
      .replace(/\{\{linkPagamento\}\}/g, 'https://app.mensallizap.com.br/pagar/abc123')
  }

  const getTituloDefault = (tipo) => {
    const titulos = {
      pre_due_3days: 'Lembrete - 3 Dias Antes do Vencimento',
      due_day: 'Lembrete - Vencimento Hoje',
      overdue: 'Cobrança - 3 Dias Após o Vencimento',
      class_reminder: 'Lembrete de Aula',
      birthday: 'Mensagem de Aniversário'
    }
    return titulos[tipo] || ''
  }

  const getMensagemDefault = (tipo) => {
    let mensagem = TEMPLATES_PADRAO[tipo] || TEMPLATES_PADRAO.overdue
    // Se método de pagamento é Asaas, trocar variável e labels
    if (metodoPagamento === 'asaas_link') {
      mensagem = mensagem
        .replaceAll('{{chavePix}}', '{{linkPagamento}}')
        .replace(/🔑 Chave Pix:/g, '🔗 Link de pagamento:')
        .replace(/💳 Pix para pagamento:/g, '🔗 Link de pagamento:')
    }
    return mensagem
  }

  const restaurarMensagemPadrao = async () => {
    const novoTitulo = getTituloDefault(tipoTemplateSelecionado)
    const novaMensagem = getMensagemDefault(tipoTemplateSelecionado)

    setTituloTemplate(novoTitulo)
    setMensagemTemplate(novaMensagem)

    // Salvar no banco automaticamente
    try {
      const templateExistente = templatesAgrupados[tipoTemplateSelecionado]

      if (templateExistente) {
        // Atualizar template existente
        const { error } = await supabase
          .from('templates')
          .update({
            titulo: novoTitulo,
            mensagem: novaMensagem,
            is_padrao: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', templateExistente.id)

        if (error) throw error
      } else {
        // Criar novo template com o padrão
        const { error } = await supabase
          .from('templates')
          .insert({
            user_id: contextUserId,
            titulo: novoTitulo,
            mensagem: novaMensagem,
            tipo: tipoTemplateSelecionado,
            ativo: true,
            is_padrao: true
          })

        if (error) throw error
      }

      await carregarTemplates()
      setFeedbackModal({ isOpen: true, type: 'success', title: 'Restaurado', message: 'Mensagem padrão restaurada e salva!' })
    } catch (error) {
      console.error('Erro ao restaurar padrão:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar template padrão' })
    }
  }

  const carregarTemplates = async () => {
    try {
      if (!contextUserId) return

      const { data: templates, error } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', contextUserId)
        .eq('ativo', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Group templates by type - priorizar customizados sobre padrões
      const findBestTemplate = (tipo) => {
        const customizado = templates?.find(t => t.tipo === tipo && t.is_padrao !== true)
        if (customizado) return customizado
        return templates?.find(t => t.tipo === tipo) || null
      }
      const agrupados = {
        pre_due_3days: findBestTemplate('pre_due_3days'),
        due_day: findBestTemplate('due_day'),
        overdue: findBestTemplate('overdue'),
        class_reminder: findBestTemplate('class_reminder')
      }

      setTemplatesAgrupados(agrupados)

      // Load current selected type template
      const templateAtual = agrupados[tipoTemplateSelecionado]
      if (templateAtual) {
        setTituloTemplate(templateAtual.titulo)
        setMensagemTemplate(templateAtual.mensagem)
      } else {
        setTituloTemplate(getTituloDefault(tipoTemplateSelecionado))
        setMensagemTemplate(getMensagemDefault(tipoTemplateSelecionado))
      }
    } catch (error) {
      console.error('Erro ao carregar templates:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao carregar templates' })
    }
  }

  const salvarChavePix = async () => {
    try {
      setSalvandoPix(true)
      if (!contextUserId) return

      const { error } = await supabase
        .from('usuarios')
        .update({ chave_pix: chavePix })
        .eq('id', contextUserId)

      if (error) throw error

      setFeedbackModal({ isOpen: true, type: 'success', title: 'Salvo!', message: 'Chave PIX atualizada com sucesso' })
    } catch (error) {
      console.error('Erro ao salvar chave PIX:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar chave PIX' })
    } finally {
      setSalvandoPix(false)
    }
  }

  const salvarTemplate = async () => {
    if (!tituloTemplate.trim() || !mensagemTemplate.trim()) {
      setFeedbackModal({ isOpen: true, type: 'warning', title: 'Atenção', message: 'Preencha o título e a mensagem do template' })
      return
    }

    try {
      const templateExistente = templatesAgrupados[tipoTemplateSelecionado]

      if (templateExistente) {
        // Update existing - marcar como customizado (não padrão)
        const { error, data } = await supabase
          .from('templates')
          .update({
            titulo: tituloTemplate,
            mensagem: mensagemTemplate,
            is_padrao: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', templateExistente.id)
          .select()

        if (error) throw error

        // Atualizar estado local imediatamente
        setTemplatesAgrupados(prev => ({
          ...prev,
          [tipoTemplateSelecionado]: { ...templateExistente, titulo: tituloTemplate, mensagem: mensagemTemplate, is_padrao: false }
        }))
      } else {
        // Create new
        const { error, data } = await supabase
          .from('templates')
          .insert({
            user_id: contextUserId,
            titulo: tituloTemplate,
            mensagem: mensagemTemplate,
            tipo: tipoTemplateSelecionado,
            ativo: true,
            is_padrao: false
          })
          .select()

        if (error) throw error

        // Atualizar estado local imediatamente
        if (data && data[0]) {
          setTemplatesAgrupados(prev => ({
            ...prev,
            [tipoTemplateSelecionado]: data[0]
          }))
        }
      }

      setFeedbackModal({ isOpen: true, type: 'success', title: 'Sucesso', message: 'Template salvo com sucesso!' })
    } catch (error) {
      console.error('Erro ao salvar template:', error)
      setFeedbackModal({ isOpen: true, type: 'danger', title: 'Erro', message: 'Erro ao salvar template: ' + error.message })
    }
  }

  // ========== RENDER ==========

  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
      {/* Título */}
      <div style={{ marginBottom: isSmallScreen ? '16px' : '20px' }}>
        <h2 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
          WhatsApp
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: isSmallScreen ? '13px' : '14px', color: '#666' }}>
          Gerencie sua conexao e templates de mensagens
        </p>
      </div>

      {/* Menu de Abas + Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: isSmallScreen ? '16px' : '24px', flexWrap: 'wrap' }}>
        {/* Tabs segmented control */}
        <div style={{
          display: 'inline-flex',
          gap: '4px',
          backgroundColor: '#f3f4f6',
          borderRadius: '10px',
          padding: '4px'
        }}>
          {[
            { id: 'conexao', label: 'Conexao', icon: 'mdi:connection' },
            { id: 'templates', label: isSmallScreen ? 'Templates' : 'Templates de Mensagens', icon: 'mdi:message-text' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: isSmallScreen ? '8px 16px' : '8px 20px',
                backgroundColor: activeTab === tab.id ? 'white' : 'transparent',
                color: activeTab === tab.id ? '#1a1a1a' : '#555',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: isSmallScreen ? '13px' : '14px',
                fontWeight: activeTab === tab.id ? '600' : '400',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                opacity: activeTab === tab.id ? 1 : 0.75
              }}
            >
              <Icon icon={tab.icon} width={isSmallScreen ? 16 : 18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Status badge + Desconectar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '20px',
            backgroundColor: status === 'connected' ? '#e8f5e9' : status === 'connecting' ? '#fff3e0' : '#fef2f2',
            border: `1px solid ${status === 'connected' ? '#c8e6c9' : status === 'connecting' ? '#ffe0b2' : '#fecaca'}`
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: status === 'connected' ? '#4CAF50' : status === 'connecting' ? '#ff9800' : '#f44336'
            }} />
            <span style={{ fontSize: '13px', fontWeight: '600', color: status === 'connected' ? '#2e7d32' : status === 'connecting' ? '#e65100' : '#c62828' }}>
              {status === 'connected' ? 'Conectado' : status === 'connecting' ? 'Conectando...' : 'Desconectado'}
            </span>
          </div>
          {status === 'connected' && (
            <button
              onClick={() => setConfirmDesconexaoModal(true)}
              disabled={loading}
              style={{
                padding: '6px 14px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                opacity: loading ? 0.7 : 1
              }}
            >
              Desconectar
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      {activeTab === 'conexao' ? (
        <>

          {/* Conteúdo Principal */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: isSmallScreen ? '20px' : '40px',
            border: '1px solid #e5e7eb',
            boxShadow: 'none'
          }}>
            {status === 'connected' ? (
              // ESTADO 1: CONECTADO
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Icon icon="mdi:check-circle" width="80" height="80" style={{ color: '#4CAF50', marginBottom: '20px' }} />
                <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: '600', color: '#344848' }}>
                  WhatsApp Conectado!
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                  Seu WhatsApp está conectado e pronto para enviar mensagens automáticas.
                </p>
              </div>
            ) : pairingCode ? (
              // ESTADO 2B: CONECTANDO (Código de Pareamento visível)
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '600', color: '#344848' }}>
                  Digite este código no WhatsApp
                </h3>
                <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#666' }}>
                  Abra seu WhatsApp e siga os passos abaixo
                </p>

                {/* Código de pareamento grande */}
                <div style={{
                  display: 'inline-block',
                  padding: '20px 36px',
                  backgroundColor: '#f0faf4',
                  borderRadius: '12px',
                  border: '2px solid #25D366',
                  marginBottom: '24px'
                }}>
                  <span style={{
                    fontSize: isSmallScreen ? '28px' : '36px',
                    fontWeight: '700',
                    fontFamily: 'monospace',
                    letterSpacing: '4px',
                    color: '#344848'
                  }}>
                    {pairingCode.slice(0, 4)}-{pairingCode.slice(4)}
                  </span>
                </div>

                {/* Instruções passo a passo */}
                <div style={{
                  textAlign: 'left',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '8px',
                  padding: '16px 20px',
                  marginBottom: '24px'
                }}>
                  <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#666', lineHeight: '2' }}>
                    <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
                    <li>Vá em <strong>Dispositivos conectados</strong></li>
                    <li>Toque em <strong>Conectar dispositivo</strong></li>
                    <li>Toque em <strong>"Conectar com número de telefone"</strong></li>
                    <li>Digite o código <strong>{pairingCode.slice(0, 4)}-{pairingCode.slice(4)}</strong></li>
                  </ol>
                </div>

                {/* Contador de tempo */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    backgroundColor: tempoRestante <= 30 ? '#fff3cd' : '#f5f5f5',
                    borderRadius: '20px',
                    border: `1px solid ${tempoRestante <= 30 ? '#ffc107' : '#e0e0e0'}`
                  }}>
                    <Icon icon="mdi:clock-outline" width="18" height="18" style={{ color: tempoRestante <= 30 ? '#ff9800' : '#666' }} />
                    <span style={{ fontSize: '14px', fontWeight: '500', color: tempoRestante <= 30 ? '#856404' : '#666' }}>
                      {Math.floor(tempoRestante / 60)}:{(tempoRestante % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '20px' }}>
                  <button
                    onClick={() => {
                      setPairingCode(null)
                      setStatus('disconnected')
                      setTempoRestante(120)
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: 'white',
                      color: '#666',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    Cancelar
                  </button>
                </div>

                {status === 'connecting' && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: '#e3f2fd',
                    border: '1px solid #2196F3',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}>
                    <Icon icon="eos-icons:loading" width="20" height="20" style={{ color: '#2196F3' }} />
                    <span style={{ fontSize: '14px', color: '#2196F3', fontWeight: '500' }}>
                      Aguardando pareamento...
                    </span>
                  </div>
                )}
              </div>
            ) : qrCode ? (
              // ESTADO 2: CONECTANDO (QR Code visível)
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '600', color: '#344848' }}>
                  Escaneie o QR Code
                </h3>
                <p style={{ margin: '0 0 30px 0', fontSize: '14px', color: '#666' }}>
                  Aponte a câmera do seu WhatsApp para este código
                </p>

                <div style={{
                  display: 'inline-block',
                  padding: isSmallScreen ? '12px' : '20px',
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  border: '2px solid #e0e0e0',
                  marginBottom: '30px'
                }}>
                  <img
                    src={qrCode}
                    alt="QR Code WhatsApp"
                    style={{
                      width: isSmallScreen ? '220px' : '300px',
                      height: isSmallScreen ? '220px' : '300px',
                      display: 'block'
                    }}
                  />
                </div>

                {/* Contador de tempo */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    backgroundColor: tempoRestante <= 30 ? '#fff3cd' : '#f5f5f5',
                    borderRadius: '20px',
                    border: `1px solid ${tempoRestante <= 30 ? '#ffc107' : '#e0e0e0'}`
                  }}>
                    <Icon icon="mdi:clock-outline" width="18" height="18" style={{ color: tempoRestante <= 30 ? '#ff9800' : '#666' }} />
                    <span style={{ fontSize: '14px', fontWeight: '500', color: tempoRestante <= 30 ? '#856404' : '#666' }}>
                      {Math.floor(tempoRestante / 60)}:{(tempoRestante % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '20px' }}>
                  <button
                    onClick={() => {
                      setQrCode(null)
                      setStatus('disconnected')
                      setTempoRestante(120)
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: 'white',
                      color: '#666',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    Cancelar
                  </button>
                </div>

                {status === 'connecting' && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: '#e3f2fd',
                    border: '1px solid #2196F3',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}>
                    <Icon icon="eos-icons:loading" width="20" height="20" style={{ color: '#2196F3' }} />
                    <span style={{ fontSize: '14px', color: '#2196F3', fontWeight: '500' }}>
                      Aguardando leitura do QR Code...
                    </span>
                  </div>
                )}
              </div>
            ) : (
              // ESTADO 3: DESCONECTADO
              <div>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600', color: '#344848' }}>
                  Conectar WhatsApp
                </h3>

                {/* Toggle QR Code / Código de Pareamento */}
                <div style={{
                  display: 'flex',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '8px',
                  padding: '4px',
                  marginBottom: '24px',
                  gap: '4px'
                }}>
                  <button
                    onClick={() => setModoConexao('qrcode')}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      backgroundColor: modoConexao === 'qrcode' ? 'white' : 'transparent',
                      border: modoConexao === 'qrcode' ? '1px solid #e5e7eb' : 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: modoConexao === 'qrcode' ? '600' : '400',
                      color: modoConexao === 'qrcode' ? '#344848' : '#888',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Icon icon="mdi:qrcode" width="18" height="18" />
                    QR Code
                  </button>
                  <button
                    onClick={() => setModoConexao('pairing')}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      backgroundColor: modoConexao === 'pairing' ? 'white' : 'transparent',
                      border: modoConexao === 'pairing' ? '1px solid #e5e7eb' : 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: modoConexao === 'pairing' ? '600' : '400',
                      color: modoConexao === 'pairing' ? '#344848' : '#888',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Icon icon="mdi:cellphone-link" width="18" height="18" />
                    Código (celular)
                  </button>
                </div>

                {modoConexao === 'qrcode' ? (
                  <div style={{ marginBottom: '30px' }}>
                    <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
                      Para conectar seu WhatsApp:
                    </p>
                    <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#666', lineHeight: '1.8' }}>
                      <li>Abra o WhatsApp no seu celular</li>
                      <li>Toque em Mais opções (⋮) ou Configurações (⚙)</li>
                      <li>Toque em Dispositivos conectados</li>
                      <li>Toque em Conectar dispositivo</li>
                      <li>Clique no botão abaixo e escaneie o QR Code que aparecer</li>
                    </ol>
                  </div>
                ) : (
                  <div style={{ marginBottom: '30px' }}>
                    <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
                      Ideal para quem está acessando pelo celular:
                    </p>
                    <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#666', lineHeight: '1.8' }}>
                      <li>Digite seu número de telefone abaixo</li>
                      <li>Clique em "Conectar WhatsApp"</li>
                      <li>Um código de 8 caracteres será exibido</li>
                      <li>No WhatsApp, vá em Dispositivos conectados</li>
                      <li>Toque em "Conectar dispositivo"</li>
                      <li>Toque em "Conectar com número de telefone"</li>
                      <li>Digite o código exibido na tela</li>
                    </ol>

                    {/* Campo de telefone */}
                    <div style={{ marginTop: '20px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#344848', marginBottom: '8px' }}>
                        Seu número com DDD:
                      </label>
                      <input
                        type="tel"
                        placeholder="(11) 99999-9999"
                        value={telefoneParear}
                        onChange={(e) => {
                          // Máscara de telefone
                          let v = e.target.value.replace(/\D/g, '')
                          if (v.length > 11) v = v.slice(0, 11)
                          if (v.length > 6) {
                            v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`
                          } else if (v.length > 2) {
                            v = `(${v.slice(0, 2)}) ${v.slice(2)}`
                          } else if (v.length > 0) {
                            v = `(${v}`
                          }
                          setTelefoneParear(v)
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          fontSize: '16px',
                          border: '2px solid #e0e0e0',
                          borderRadius: '8px',
                          outline: 'none',
                          boxSizing: 'border-box',
                          transition: 'border-color 0.2s'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#25D366'}
                        onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={conectarWhatsApp}
                  disabled={loading || (modoConexao === 'pairing' && telefoneParear.replace(/\D/g, '').length < 10)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: '#25D366',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: (loading || (modoConexao === 'pairing' && telefoneParear.replace(/\D/g, '').length < 10)) ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    opacity: (loading || (modoConexao === 'pairing' && telefoneParear.replace(/\D/g, '').length < 10)) ? 0.7 : 1,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#20BA5A')}
                  onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#25D366')}
                >
                  {loading ? (
                    <>
                      <Icon icon="eos-icons:loading" width="24" height="24" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <Icon icon={modoConexao === 'qrcode' ? 'mdi:qrcode' : 'mdi:cellphone-link'} width="24" height="24" />
                      Conectar WhatsApp
                    </>
                  )}
                </button>

                {erro && (
                  <div style={{
                    marginTop: '20px',
                    padding: '12px 16px',
                    backgroundColor: '#ffebee',
                    border: '1px solid #f44336',
                    borderRadius: '6px',
                    color: '#f44336',
                    fontSize: '14px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <Icon icon="mdi:alert-circle" width="20" height="20" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div style={{ flex: 1 }}>
                        <strong style={{ display: 'block', marginBottom: '8px' }}>{erro}</strong>
                        <details style={{ fontSize: '13px', cursor: 'pointer' }}>
                          <summary style={{ marginBottom: '8px' }}>Ver ajuda para resolver</summary>
                          <div style={{ paddingLeft: '8px', borderLeft: '2px solid #f44336', marginTop: '8px' }}>
                            <p style={{ margin: '0 0 8px 0' }}>1. Abra o console do navegador (pressione F12)</p>
                            <p style={{ margin: '0 0 8px 0' }}>2. Procure por mensagens detalhadas do erro</p>
                            <p style={{ margin: '0 0 8px 0' }}>3. Verifique se a Evolution API está online</p>
                            <p style={{ margin: '0' }}>4. Verifique se a API Key está configurada corretamente</p>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Aviso */}
          <div style={{
            marginTop: '25px',
            padding: '16px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '8px',
            display: 'flex',
            gap: '12px'
          }}>
            <Icon icon="mdi:information" width="24" height="24" style={{ color: '#ff9800', flexShrink: 0 }} />
            <div style={{ fontSize: '13px', color: '#856404', lineHeight: '1.6' }}>
              <strong>Importante:</strong> Mantenha o WhatsApp conectado ao seu celular com internet para que as mensagens sejam enviadas automaticamente.
            </div>
          </div>
        </>
      ) : (
        /* Aba de Templates - Redesign */
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: isSmallScreen ? '16px' : '24px',
          border: '1px solid #e5e7eb'
        }}>
          {/* Layout 2 colunas */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile || isTablet ? '1fr' : '1fr 1fr', gap: isSmallScreen ? '16px' : '24px' }}>

            {/* COLUNA ESQUERDA: Cards de automação + Config */}
            <div>
              <div style={{ marginBottom: '12px' }}>
                <h3 style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: '600', color: '#344848' }}>
                  Automações
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Ative e selecione para editar</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {[
                  { tipo: 'pre_due_3days', nome: '3 Dias Antes', descricao: 'Lembrete 3 dias antes do vencimento', icone: 'mdi:calendar-clock', cor: '#2196F3', ativo: automacao3DiasAtiva, toggle: toggleAutomacao3Dias, locked: automacaoLocked },
                  { tipo: 'due_day', nome: 'No Dia', descricao: 'Lembrete no dia do vencimento', icone: 'mdi:calendar-today', cor: '#ff9800', ativo: automacaoNoDiaAtiva, toggle: toggleAutomacaoNoDia, locked: false },
                  { tipo: 'overdue', nome: '3 Dias Depois', descricao: 'Cobrança 3 dias após o vencimento', icone: 'mdi:alert-circle', cor: '#f44336', ativo: automacao3DiasDepoisAtiva, toggle: toggleAutomacao3DiasDepois, locked: automacaoLocked },
                  { tipo: 'class_reminder', nome: 'Lembrete Aula', descricao: 'Lembrete 1h antes da aula', icone: 'mdi:clock-alert-outline', cor: '#6366f1', ativo: automacaoLembreteAulaAtiva, toggle: toggleAutomacaoLembreteAula, locked: automacaoLocked },
                  { tipo: 'birthday', nome: 'Aniversário', descricao: 'Parabéns no dia do aniversário (8h)', icone: 'mdi:cake-variant', cor: '#E91E63', ativo: automacaoAniversarioAtiva, toggle: toggleAutomacaoAniversario, locked: automacaoLocked }
                ].map((item) => (
                  <div
                    key={item.tipo}
                    onClick={() => {
                      if (item.locked) { setUpgradeModal({ isOpen: true, featureName: item.nome }); return }
                      if (!item.ativo) return
                      setTipoTemplateSelecionado(item.tipo)
                      const template = templatesAgrupados[item.tipo]
                      if (template) { setTituloTemplate(template.titulo); setMensagemTemplate(template.mensagem) }
                      else { setTituloTemplate(getTituloDefault(item.tipo)); setMensagemTemplate(getMensagemDefault(item.tipo)) }
                    }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 14px', backgroundColor: tipoTemplateSelecionado === item.tipo ? `${item.cor}08` : 'white',
                      borderRadius: '8px', border: tipoTemplateSelecionado === item.tipo ? `2px solid ${item.cor}` : '1px solid #e5e7eb',
                      cursor: item.locked ? 'pointer' : (item.ativo ? 'pointer' : 'default'),
                      transition: 'all 0.2s', opacity: item.locked ? 0.7 : (!item.ativo ? 0.5 : 1)
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: `${item.cor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon icon={item.icone} width="20" style={{ color: item.cor }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {item.nome}
                          {item.locked && <span style={{ fontSize: '10px', fontWeight: '600', color: '#e65100', backgroundColor: '#fff3e0', padding: '1px 6px', borderRadius: '4px' }}>PRO</span>}
                          {templatesAgrupados[item.tipo] && item.ativo && !item.locked && <Icon icon="mdi:check-circle" width="14" style={{ color: '#4CAF50' }} />}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.descricao}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {item.locked ? (
                        <button onClick={(e) => { e.stopPropagation(); setUpgradeModal({ isOpen: true, featureName: item.nome }) }}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '12px', cursor: 'pointer', fontSize: '11px', fontWeight: '500', color: '#e65100' }}>
                          <Icon icon="mdi:lock" width="12" /> Pro
                        </button>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); item.toggle() }}
                          style={{ position: 'relative', width: '44px', height: '24px', backgroundColor: item.ativo ? '#4CAF50' : '#ccc', borderRadius: '12px', border: 'none', cursor: 'pointer', transition: 'background-color 0.3s', padding: 0 }}>
                          <div style={{ position: 'absolute', top: '2px', left: item.ativo ? '22px' : '2px', width: '20px', height: '20px', backgroundColor: 'white', borderRadius: '50%', transition: 'left 0.3s', border: '1px solid #e5e7eb' }} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Config Rápida: PIX + Pagamento */}
              <details style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <summary style={{ padding: '12px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#555', display: 'flex', alignItems: 'center', gap: '8px', listStyle: 'none' }}>
                  <Icon icon="mdi:cog-outline" width="16" style={{ color: '#888' }} />
                  Configurações de Pagamento
                  <Icon icon="mdi:chevron-down" width="16" style={{ color: '#888', marginLeft: 'auto' }} />
                </summary>
                <div style={{ padding: '0 14px 14px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#666', marginBottom: '4px' }}>Chave PIX</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="text" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" value={chavePix} onChange={(e) => setChavePix(e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                      <button onClick={salvarChavePix} disabled={salvandoPix}
                        style={{ padding: '8px 14px', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: salvandoPix ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                        {salvandoPix ? '...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#666', marginBottom: '4px' }}>Método nas mensagens</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => salvarMetodoPagamento('pix_manual')}
                        style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: '600', backgroundColor: metodoPagamento !== 'asaas_link' ? '#e8f5e9' : 'white', color: metodoPagamento !== 'asaas_link' ? '#2e7d32' : '#666', border: metodoPagamento !== 'asaas_link' ? '2px solid #4CAF50' : '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }}>
                        PIX Manual
                      </button>
                      <button onClick={() => asaasConfigurado ? salvarMetodoPagamento('asaas_link') : navigate('/app/configuracao?aba=integracoes')}
                        style={{ flex: 1, padding: '8px', fontSize: '12px', fontWeight: '600', backgroundColor: metodoPagamento === 'asaas_link' ? '#e3f2fd' : 'white', color: metodoPagamento === 'asaas_link' ? '#1565c0' : (asaasConfigurado ? '#666' : '#bbb'), border: metodoPagamento === 'asaas_link' ? '2px solid #2196F3' : '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', opacity: asaasConfigurado ? 1 : 0.6, position: 'relative' }}
                        title={!asaasConfigurado ? 'Clique para configurar o Asaas em Integrações' : ''}>
                        Link Asaas
                      </button>
                    </div>
                    {!asaasConfigurado && (
                      <button onClick={() => navigate('/app/configuracao?aba=integracoes')}
                        style={{ marginTop: '6px', background: 'none', border: 'none', padding: 0, fontSize: '11px', color: '#2196F3', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}>
                        <Icon icon="mdi:open-in-new" width="12" />
                        Configurar Asaas em Integrações
                      </button>
                    )}
                  </div>
                </div>
              </details>
            </div>

            {/* COLUNA DIREITA: Editor (sticky) */}
            <div style={{ position: isMobile || isTablet ? 'static' : 'sticky', top: '20px', alignSelf: 'start' }}>
              {!tipoTemplateSelecionado ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px dashed #ddd' }}>
                  <Icon icon="mdi:cursor-default-click" width="48" style={{ color: '#ccc', marginBottom: '12px' }} />
                  <p style={{ margin: 0, fontSize: '14px', color: '#999' }}>Selecione uma automação ativa para editar o template</p>
                </div>
              ) : (
                <>
                  {/* Aviso de bloqueio para Starter */}
                  {templateEditLocked && (
                    <div style={{ padding: '12px 16px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Icon icon="mdi:lock" width="20" style={{ color: '#ff9800', flexShrink: 0 }} />
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#e65100' }}>Template bloqueado para edição</span>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>Disponível apenas para planos Pro e Premium.</p>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: '600', color: '#344848' }}>
                        Mensagem
                      </h3>
                      <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Edite o template selecionado</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={restaurarMensagemPadrao}
                    disabled={templateEditLocked}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'white',
                      border: '1px solid #e0e0e0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: templateEditLocked ? '#aaa' : '#666',
                      cursor: templateEditLocked ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: templateEditLocked ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!templateEditLocked) {
                        e.currentTarget.style.backgroundColor = '#f5f5f5'
                        e.currentTarget.style.borderColor = '#ccc'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!templateEditLocked) {
                        e.currentTarget.style.backgroundColor = 'white'
                        e.currentTarget.style.borderColor = '#e0e0e0'
                      }
                    }}
                  >
                    <Icon icon="material-symbols:refresh" width="14" />
                    Restaurar Padrão
                  </button>
                  <button
                    onClick={() => setPreviewModalAberto(true)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'white',
                      border: '1px solid #e0e0e0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#666',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f5f5f5'; e.currentTarget.style.borderColor = '#ccc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = '#e0e0e0' }}
                  >
                    <Icon icon="mdi:eye-outline" width="14" />
                    Preview
                  </button>
                  <button
                    onClick={salvarTemplate}
                    disabled={templateEditLocked}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: templateEditLocked ? '#ccc' : '#25D366',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'white',
                      cursor: templateEditLocked ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: templateEditLocked ? 0.7 : 1
                    }}
                  >
                    <Icon icon={templateEditLocked ? 'mdi:lock' : 'mdi:content-save'} width="14" />
                    Salvar
                  </button>
                    </div>
                  </div>

                <textarea
                  value={mensagemTemplate}
                  onChange={(e) => setMensagemTemplate(e.target.value)}
                  disabled={templateEditLocked}
                  style={{
                    width: '100%',
                    minHeight: isSmallScreen ? '200px' : '300px',
                    padding: '14px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    fontSize: '16px',
                    fontFamily: 'inherit',
                    lineHeight: '1.6',
                    resize: templateEditLocked ? 'none' : 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                    backgroundColor: templateEditLocked ? '#f5f5f5' : 'white',
                    cursor: templateEditLocked ? 'not-allowed' : 'text',
                    opacity: templateEditLocked ? 0.7 : 1
                  }}
                  placeholder="Digite sua mensagem aqui..."
                />

              <div style={{
                padding: '14px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                marginBottom: '16px'
              }}>
                <h5 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: '600', color: '#344848' }}>
                  Variáveis Disponíveis (clique para copiar):
                </h5>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {tipoTemplateSelecionado === 'birthday' ? (
                    <>
                      {[
                        { var: '{{nomeCliente}}', bg: '#fce4ec', border: '#f48fb1', color: '#c2185b' },
                        { var: '{{nomeEmpresa}}', bg: '#fce4ec', border: '#f48fb1', color: '#c2185b' }
                      ].map(v => (
                        <code
                          key={v.var}
                          onClick={() => {
                            navigator.clipboard.writeText(v.var)
                            setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: `${v.var} copiado para a área de transferência` })
                          }}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: v.bg,
                            border: `1px solid ${v.border}`,
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: v.color,
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          {v.var}
                        </code>
                      ))}
                    </>
                  ) : tipoTemplateSelecionado === 'class_reminder' ? (
                    <>
                      {[
                        { var: '{{nomeCliente}}', bg: '#e3f2fd', border: '#e0e0e0', color: '#8867A1' },
                        { var: '{{descricaoAula}}', bg: '#ede7f6', border: '#ce93d8', color: '#6a1b9a' },
                        { var: '{{horarioAula}}', bg: '#ede7f6', border: '#ce93d8', color: '#6a1b9a' },
                        { var: '{{nomeEmpresa}}', bg: '#e3f2fd', border: '#e0e0e0', color: '#8867A1' }
                      ].map(v => (
                        <code
                          key={v.var}
                          onClick={() => {
                            navigator.clipboard.writeText(v.var)
                            setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: `${v.var} copiado para a área de transferência` })
                          }}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: v.bg,
                            border: `1px solid ${v.border}`,
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: v.color,
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          {v.var}
                        </code>
                      ))}
                    </>
                  ) : (
                    <>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{nomeCliente}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{nomeCliente}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e3f2fd',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#8867A1',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{nomeCliente}}`}
                      </code>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{valorMensalidade}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{valorMensalidade}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e3f2fd',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#8867A1',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{valorMensalidade}}`}
                      </code>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{dataVencimento}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{dataVencimento}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e3f2fd',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#8867A1',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{dataVencimento}}`}
                      </code>
                      {tipoTemplateSelecionado === 'overdue' && (
                        <code
                          onClick={() => {
                            navigator.clipboard.writeText('{{diasAtraso}}')
                            setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{diasAtraso}} copiado para a área de transferência' })
                          }}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#ffebee',
                            border: '1px solid #e0e0e0',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#8867A1',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          {`{{diasAtraso}}`}
                        </code>
                      )}
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{nomeEmpresa}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{nomeEmpresa}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e3f2fd',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#8867A1',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{nomeEmpresa}}`}
                      </code>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{chavePix}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{chavePix}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#e8f5e9',
                          border: '1px solid #81c784',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#2e7d32',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {`{{chavePix}}`}
                      </code>
                      <code
                        onClick={() => {
                          navigator.clipboard.writeText('{{linkPagamento}}')
                          setFeedbackModal({ isOpen: true, type: 'success', title: 'Copiado!', message: '{{linkPagamento}} copiado para a área de transferência' })
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#fff3e0',
                          border: '1px solid #ffb74d',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#e65100',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                        title="Gera automaticamente um link de pagamento PIX com QR Code"
                      >
                        {`{{linkPagamento}}`}
                      </code>
                    </>
                  )}
                </div>
                {tipoTemplateSelecionado === 'birthday' && (
                  <p style={{ fontSize: '11px', color: '#E91E63', marginTop: '8px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
                    Variáveis exclusivas para mensagem de aniversário
                  </p>
                )}
                {tipoTemplateSelecionado === 'class_reminder' && (
                  <p style={{ fontSize: '11px', color: '#6366f1', marginTop: '8px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
                    Variáveis exclusivas para lembrete de aula
                  </p>
                )}
                {tipoTemplateSelecionado !== 'overdue' && tipoTemplateSelecionado !== 'class_reminder' && tipoTemplateSelecionado !== 'birthday' && (
                  <p style={{ fontSize: '11px', color: '#999', marginTop: '8px', fontStyle: 'italic', margin: '8px 0 0 0' }}>
                    Nota: {`{{diasAtraso}}`} não está disponível para mensagens pré-vencimento
                  </p>
                )}
              </div>

                </>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Modal de Preview WhatsApp */}
      {previewModalAberto && (
        <>
          <div
            onClick={() => setPreviewModalAberto(false)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 10000,
              animation: 'fadeIn 0.2s ease-out'
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
              zIndex: 10001,
              width: '90vw',
              maxWidth: '420px',
              animation: 'slideUp 0.3s ease-out'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#344848' }}>Preview da Mensagem</h4>
              <button
                onClick={() => setPreviewModalAberto(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex' }}
              >
                <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
              </button>
            </div>
            <div style={{
              backgroundColor: '#e5ddd5',
              backgroundImage: 'url(/whatsapp-bg.png)',
              backgroundSize: 'contain',
              backgroundRepeat: 'repeat',
              backgroundPosition: 'center',
              borderRadius: '8px',
              padding: '16px',
              maxHeight: '60vh',
              overflowY: 'auto'
            }}>
              <div style={{
                backgroundColor: '#dcf8c6',
                borderRadius: '8px',
                padding: '10px 14px',
                position: 'relative',
                maxWidth: '90%',
                marginLeft: 'auto',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                wordWrap: 'break-word'
              }}>
                <div style={{
                  position: 'absolute',
                  right: '-6px',
                  bottom: '6px',
                  width: '0', height: '0',
                  borderLeft: '8px solid #dcf8c6',
                  borderRight: '8px solid transparent',
                  borderTop: '4px solid transparent',
                  borderBottom: '4px solid transparent'
                }} />
                <div style={{
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: '#303030',
                  whiteSpace: 'pre-wrap',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                }}>
                  {gerarPreview(mensagemTemplate)}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: '#667781',
                  marginTop: '6px',
                  textAlign: 'right',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '4px'
                }}>
                  <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <Icon icon="mdi:check-all" width="16" height="16" style={{ color: '#53bdeb', display: 'block' }} />
                </div>
              </div>
            </div>
            <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#999', textAlign: 'center' }}>
              As variáveis foram substituídas por dados de exemplo
            </p>
          </div>
        </>
      )}

      {/* Modal de Feedback */}
      <ConfirmModal
        isOpen={feedbackModal.isOpen}
        onClose={() => setFeedbackModal({ ...feedbackModal, isOpen: false })}
        onConfirm={() => setFeedbackModal({ ...feedbackModal, isOpen: false })}
        title={feedbackModal.title}
        message={feedbackModal.message}
        confirmText="OK"
        cancelText=""
        type={feedbackModal.type}
      />

      {/* Modal de Confirmação de Desconexão */}
      <ConfirmModal
        isOpen={confirmDesconexaoModal}
        onClose={() => setConfirmDesconexaoModal(false)}
        onConfirm={() => {
          setConfirmDesconexaoModal(false)
          desconectar()
        }}
        title="Desconectar WhatsApp"
        message="Tem certeza que deseja desconectar o WhatsApp? As mensagens automáticas deixarão de ser enviadas."
        confirmText="Desconectar"
        cancelText="Cancelar"
        type="danger"
      />

      {/* Modal de Upgrade (Recurso Bloqueado) */}
      {upgradeModal.isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setUpgradeModal({ isOpen: false, featureName: '' })}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 10000,
              animation: 'fadeIn 0.2s ease-out'
            }}
          />

          {/* Modal */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
              zIndex: 10001,
              minWidth: '280px',
              maxWidth: '90vw',
              textAlign: 'center',
              animation: 'slideUp 0.3s ease-out'
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#fff3e0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto'
            }}>
              <Icon icon="mdi:lock" width="24" height="24" style={{ color: '#ff9800' }} />
            </div>

            <h4 style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a'
            }}>
              Recurso Bloqueado
            </h4>

            <p style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: '#666',
              lineHeight: '1.5'
            }}>
              <strong>{upgradeModal.featureName}</strong> está disponível no plano <strong>Pro</strong> ou superior.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setUpgradeModal({ isOpen: false, featureName: '' })}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#666',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  minWidth: '100px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5'
                  e.currentTarget.style.borderColor = '#ccc'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                  e.currentTarget.style.borderColor = '#e0e0e0'
                }}
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  setUpgradeModal({ isOpen: false, featureName: '' })
                  navigate('/app/configuracao?aba=upgrade')
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ff9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  minWidth: '100px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f57c00'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ff9800'
                }}
              >
                <Icon icon="mdi:rocket-launch" width="16" height="16" />
                Fazer Upgrade
              </button>
            </div>
          </div>

          <style>
            {`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideUp {
                from { transform: translate(-50%, -50%) translateY(20px); opacity: 0; }
                to { transform: translate(-50%, -50%) translateY(0); opacity: 1; }
              }
            `}
          </style>
        </>
      )}
    </div>
  )
}
