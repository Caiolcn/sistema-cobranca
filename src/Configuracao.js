import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { supabase } from './supabaseClient'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import {
  buscarConfiguracoes,
  atualizarConfiguracao,
  executarAutomacoes
} from './services/automacaoService'
import { asaasService } from './services/asaasService'
import { validarCPFouCNPJ, validarTelefone } from './utils/validators'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'
import { useUserPlan } from './hooks/useUserPlan'

// Preview da landing page publica (renderiza o componente real em modo preview)
const LandingAcademia = lazy(() => import('./pages/LandingAcademia'))
const ContratosTemplates = lazy(() => import('./ContratosTemplates'))

function mascararNomePreview(nome) {
  if (!nome) return 'Aluno(a)'
  const partes = String(nome).trim().split(/\s+/)
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[partes.length - 1][0]}.`
}

function CollapseCard({ open, onToggle, title, icon, children }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '10px',
      marginBottom: '10px',
      backgroundColor: 'white',
      overflow: 'hidden'
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '14px 16px',
          background: open ? '#f9fafb' : 'white',
          border: 'none',
          borderBottom: open ? '1px solid #e5e7eb' : 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#344848',
          textAlign: 'left'
        }}>
        <Icon icon={icon} width="18" style={{ color: '#344848', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{title}</span>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s'
          }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: '18px 16px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// Templates padrão para criação automática
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

  birthday: `Feliz aniversário, {{nomeCliente}}! 🎂🎉

A equipe {{nomeEmpresa}} deseja a você um dia incrível, cheio de saúde, alegria e conquistas!

Obrigado por fazer parte da nossa família. Conte sempre com a gente! 💪🎈`
}

function Configuracao() {
  const [searchParams] = useSearchParams()
  const { isMobile, isTablet, isSmallScreen } = useWindowSize()
  const [abaAtiva, setAbaAtiva] = useState(searchParams.get('aba') || 'empresa')
  const [loading, setLoading] = useState(false)
  const [anamneseCamposExtras, setAnamneseCamposExtras] = useState([])
  const [anamneseSalvando, setAnamneseSalvando] = useState(false)
  const { userId: contextUserId, isAdmin, adminViewingAs } = useUser()
  const { isLocked } = useUserPlan()

  // Company data
  const [dadosEmpresa, setDadosEmpresa] = useState({
    nomeEmpresa: '',
    cnpj: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: '',
    telefone: '',
    email: '',
    site: '',
    chavePix: '',
    logoUrl: ''
  })

  // Billing config
  const [configCobranca, setConfigCobranca] = useState({
    enviarAntes: false,
    enviar3DiasAntes: false,
    enviarNoDia: false,
    enviar3DiasDepois: false,
    enviarAniversario: false
  })

  // Plans
  const [planos, setPlanos] = useState([])
  const [mostrarModalPlano, setMostrarModalPlano] = useState(false)
  const [planoEditando, setPlanoEditando] = useState(null)
  const [formPlano, setFormPlano] = useState({
    nome: '',
    valor: '',
    ciclo: 'mensal',
    descricao: '',
    tipo: 'recorrente',
    numero_aulas: ''
  })
  const [atualizarMensalidadesFuturas, setAtualizarMensalidadesFuturas] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState({ show: false, plano: null })

  // Usage
  const [usoSistema, setUsoSistema] = useState({
    clientes: { usado: 0, limite: 100 },
    mensagens: { usado: 0, limite: 100 }
  })

  // Upgrade
  const [planoAtual, setPlanoAtual] = useState('starter')
  const [processandoCheckout, setProcessandoCheckout] = useState(false)

  // Integrações
  const [modoIntegracao, setModoIntegracao] = useState('manual') // 'asaas' ou 'manual'
  const [salvandoModo, setSalvandoModo] = useState(false)

  // Asaas (Boletos)
  const [asaasConfig, setAsaasConfig] = useState({
    apiKey: '',
    ambiente: 'production'
  })
  const [asaasConectado, setAsaasConectado] = useState(false)
  const [testandoAsaas, setTestandoAsaas] = useState(false)
  const [salvandoAsaas, setSalvandoAsaas] = useState(false)
  const [asaasContaInfo, setAsaasContaInfo] = useState(null)

  // Logo upload
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Agendamento Online
  const [agendamentoConfig, setAgendamentoConfig] = useState({
    slug: '',
    ativo: false,
    antecedenciaHoras: 2
  })
  const [salvandoAgendamento, setSalvandoAgendamento] = useState(false)
  const [gerandoSlug, setGerandoSlug] = useState(false)

  // Landing Page Publica
  const [landingConfig, setLandingConfig] = useState({
    ativo: false,
    slug: '',
    descricao: '',
    corPrimaria: '#344848',
    fotoCapaUrl: '',
    instagramUrl: '',
    facebookUrl: '',
    tiktokUrl: '',
    rodapeTexto: '',
    heroTitulo: '',
    heroSubtitulo: '',
    ctaTexto: '',
    ctaFinalTitulo: '',
    ctaFinalSubtitulo: '',
    galeria: [],
    faq: [],
    depoimentosManuais: [],
    ordemSecoes: ['sobre', 'planos', 'galeria', 'horarios', 'depoimentos', 'faq', 'mapa'],
    mostrarDepoimentos: true,
    mostrarPlanos: true,
    mostrarHorarios: true,
    mostrarGaleria: true,
    mostrarFaq: true,
    mostrarCtaWhatsapp: true,
    mostrarCtaAgendar: true,
    mostrarCtaFinal: true,
    ctaFinalMostrarBotao: true
  })
  const [salvandoLanding, setSalvandoLanding] = useState(false)
  const [uploadingCapa, setUploadingCapa] = useState(false)
  const [uploadingGaleria, setUploadingGaleria] = useState(false)

  // Dados reais pro preview (planos/aulas/NPS)
  const [previewPlanos, setPreviewPlanos] = useState([])
  const [previewAulas, setPreviewAulas] = useState([])
  const [previewNpsDepoimentos, setPreviewNpsDepoimentos] = useState([])
  const [previewDadosCarregados, setPreviewDadosCarregados] = useState(false)

  // Quais secoes do accordion estao abertas (so 1 aberta por padrao)
  const [landingSecoesAbertas, setLandingSecoesAbertas] = useState({
    iniciais: true,
    topo: false,
    sobre: false,
    galeria: false,
    depoimentos: false,
    faq: false,
    ctaFinal: false,
    rodape: false,
    avancado: false
  })
  const toggleLandingSecao = (key) => setLandingSecoesAbertas(prev => ({ ...prev, [key]: !prev[key] }))

  // Automação WhatsApp - REMOVIDO (movido para /whatsapp)
  // const [configAutomacao, setConfigAutomacao] = useState({...})
  // const [testando, setTestando] = useState(false)

  useEffect(() => {
    carregarDados()
  }, [contextUserId])

  // Atualizar aba quando URL mudar (vindo do menu mobile)
  useEffect(() => {
    const abaUrl = searchParams.get('aba')
    if (abaUrl && ['empresa', 'planos', 'uso', 'upgrade', 'integracoes', 'agendamento', 'landing', 'anamnese'].includes(abaUrl)) {
      setAbaAtiva(abaUrl)
    }
  }, [searchParams])

  const carregarDados = async () => {
    setLoading(true)
    try {
      if (!contextUserId) return

      await Promise.all([
        carregarDadosEmpresa(contextUserId),
        carregarConfigCobranca(contextUserId),
        carregarPlanos(contextUserId),
        carregarUsoSistema(contextUserId),
        carregarConfigAsaas()
      ])
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
      showToast('Erro ao carregar configurações', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ==========================================
  // COMPANY DATA FUNCTIONS
  // ==========================================

  const carregarDadosEmpresa = async (userId) => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (data) {
      setDadosEmpresa({
        nomeEmpresa: data.nome_empresa || '',
        cnpj: data.cpf_cnpj || '',
        endereco: data.endereco || '',
        numero: data.numero || '',
        complemento: data.complemento || '',
        bairro: data.bairro || '',
        cidade: data.cidade || '',
        estado: data.estado || '',
        cep: data.cep || '',
        telefone: data.telefone || '',
        email: data.email_empresa || data.email || '',
        site: data.site || '',
        chavePix: data.chave_pix || '',
        logoUrl: data.logo_url || ''
      })
      // Carregar modo de integração
      setModoIntegracao(data.modo_integracao || 'manual')

      // Carregar config de agendamento
      setAgendamentoConfig({
        slug: data.agendamento_slug || '',
        ativo: data.agendamento_ativo || false,
        antecedenciaHoras: data.agendamento_antecedencia_horas || 2
      })

      // Carregar config da landing page
      setLandingConfig({
        ativo: data.landing_ativo || false,
        slug: data.landing_slug || '',
        descricao: data.landing_descricao || '',
        corPrimaria: data.landing_cor_primaria || '#344848',
        fotoCapaUrl: data.landing_foto_capa_url || '',
        instagramUrl: data.instagram_url || '',
        facebookUrl: data.facebook_url || '',
        tiktokUrl: data.tiktok_url || '',
        rodapeTexto: data.landing_rodape_texto || '',
        heroTitulo: data.landing_hero_titulo || '',
        heroSubtitulo: data.landing_hero_subtitulo || '',
        ctaTexto: data.landing_cta_texto || '',
        ctaFinalTitulo: data.landing_cta_final_titulo || '',
        ctaFinalSubtitulo: data.landing_cta_final_subtitulo || '',
        galeria: Array.isArray(data.landing_galeria) ? data.landing_galeria : [],
        faq: Array.isArray(data.landing_faq) ? data.landing_faq : [],
        depoimentosManuais: Array.isArray(data.landing_depoimentos_manuais) ? data.landing_depoimentos_manuais : [],
        ordemSecoes: Array.isArray(data.landing_ordem_secoes) && data.landing_ordem_secoes.length > 0
          ? data.landing_ordem_secoes
          : ['sobre', 'planos', 'galeria', 'horarios', 'depoimentos', 'faq', 'mapa'],
        mostrarDepoimentos: data.landing_mostrar_depoimentos !== false,
        mostrarPlanos: data.landing_mostrar_planos !== false,
        mostrarHorarios: data.landing_mostrar_horarios !== false,
        mostrarGaleria: data.landing_mostrar_galeria !== false,
        mostrarFaq: data.landing_mostrar_faq !== false,
        mostrarCtaWhatsapp: data.landing_mostrar_cta_whatsapp !== false,
        mostrarCtaAgendar: data.landing_mostrar_cta_agendar !== false,
        mostrarCtaFinal: data.landing_mostrar_cta_final !== false,
        ctaFinalMostrarBotao: data.landing_cta_final_mostrar_botao !== false
      })

      // Carregar campos extras da anamnese
      if (Array.isArray(data.anamnese_campos_extras)) {
        setAnamneseCamposExtras(data.anamnese_campos_extras)
      }
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('Selecione um arquivo de imagem (PNG, JPG, etc.)', 'warning')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('A imagem deve ter no maximo 2MB', 'warning')
      return
    }

    setUploadingLogo(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${contextUserId}/logo.${ext}`

      // Upload para Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      // Buscar URL publica
      const { data: urlData } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName)

      const logoUrl = urlData.publicUrl

      // Salvar URL no banco
      await supabase.from('usuarios').update({ logo_url: logoUrl }).eq('id', contextUserId)
      setDadosEmpresa(prev => ({ ...prev, logoUrl }))
      showToast('Logo atualizada!', 'success')
    } catch (error) {
      console.error('Erro no upload:', error)
      showToast('Erro ao fazer upload da logo: ' + error.message, 'error')
    } finally {
      setUploadingLogo(false)
    }
  }

  const removerLogo = async () => {
    try {
      await supabase.from('usuarios').update({ logo_url: null }).eq('id', contextUserId)
      setDadosEmpresa(prev => ({ ...prev, logoUrl: '' }))
      showToast('Logo removida', 'success')
    } catch (error) {
      showToast('Erro ao remover logo', 'error')
    }
  }

  const salvarDadosEmpresa = async () => {
    if (!dadosEmpresa.nomeEmpresa?.trim()) {
      showToast('Nome da empresa é obrigatório', 'warning')
      return
    }

    if (dadosEmpresa.email && !validarEmail(dadosEmpresa.email)) {
      showToast('Email inválido', 'warning')
      return
    }

    // Validar CPF/CNPJ se preenchido
    if (dadosEmpresa.cnpj?.trim() && !validarCPFouCNPJ(dadosEmpresa.cnpj)) {
      showToast('CPF/CNPJ inválido', 'warning')
      return
    }

    // Validar telefone se preenchido
    if (dadosEmpresa.telefone?.trim() && !validarTelefone(dadosEmpresa.telefone)) {
      showToast('Telefone inválido. Use o formato (XX) XXXXX-XXXX', 'warning')
      return
    }

    try {
      const { error } = await supabase
        .from('usuarios')
        .update({
          nome_empresa: dadosEmpresa.nomeEmpresa,
          cpf_cnpj: dadosEmpresa.cnpj,
          endereco: dadosEmpresa.endereco,
          numero: dadosEmpresa.numero,
          complemento: dadosEmpresa.complemento,
          bairro: dadosEmpresa.bairro,
          cidade: dadosEmpresa.cidade,
          estado: dadosEmpresa.estado,
          cep: dadosEmpresa.cep,
          telefone: dadosEmpresa.telefone,
          email_empresa: dadosEmpresa.email,
          site: dadosEmpresa.site,
          chave_pix: dadosEmpresa.chavePix,
          updated_at: new Date().toISOString()
        })
        .eq('id', contextUserId)

      if (error) throw error
      showToast('Configurações salvas!', 'success')
    } catch (error) {
      console.error('Erro ao salvar:', error)
      showToast('Erro ao salvar: ' + error.message, 'error')
    }
  }

  const formatarCPFouCNPJ = (value) => {
    const numbers = value.replace(/\D/g, '')
    // CPF: 11 dígitos
    if (numbers.length <= 11) {
      return numbers
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    }
    // CNPJ: 14 dígitos
    if (numbers.length <= 14) {
      return numbers
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
    }
    return value
  }

  const formatarTelefone = (value) => {
    const numbers = value.replace(/\D/g, '')
    if (numbers.length <= 11) {
      return numbers
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
    }
    return value
  }

  const validarEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  // ==========================================
  // BILLING CONFIG FUNCTIONS
  // ==========================================

  const carregarConfigCobranca = async (userId) => {
    const { data } = await supabase
      .from('configuracoes_cobranca')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (data) {
      setConfigCobranca({
        enviarAntes: data.enviar_antes_vencimento,
        enviar3DiasAntes: data.enviar_3_dias_antes || false,
        enviarNoDia: data.enviar_no_dia || false,
        enviar3DiasDepois: data.enviar_3_dias_depois || false,
        enviarAniversario: data.enviar_aniversario || false
      })
    }
  }

  // Função para criar template padrão se não existir
  const criarTemplatePadraoSeNaoExiste = async (tipo) => {
    try {
      // Verificar se já existe template deste tipo
      const { data: existente } = await supabase
        .from('templates')
        .select('id, ativo, mensagem')
        .eq('user_id', contextUserId)
        .eq('tipo', tipo)
        .maybeSingle()

      const titulos = {
        pre_due_3days: 'Lembrete - 3 Dias Antes do Vencimento',
        due_day: 'Lembrete - Vencimento Hoje',
        overdue: 'Cobrança - 3 Dias Após o Vencimento',
        birthday: 'Mensagem de Aniversário'
      }

      // Se já existe, atualizar se necessário
      if (existente) {
        if (existente.ativo && existente.mensagem && existente.mensagem.trim() !== '') {
          return true
        }
        // Atualizar template existente
        await supabase
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
        return true
      }

      // Criar novo template
      await supabase
        .from('templates')
        .insert({
          user_id: contextUserId,
          titulo: titulos[tipo],
          mensagem: TEMPLATES_PADRAO[tipo],
          tipo: tipo,
          ativo: true,
          is_padrao: true
        })

      return true
    } catch (error) {
      console.error('Erro ao criar template padrão:', error)
      return false
    }
  }

  const salvarConfigCobranca = async () => {
    try {
      const { error } = await supabase
        .from('configuracoes_cobranca')
        .upsert({
          user_id: contextUserId,
          enviar_antes_vencimento: configCobranca.enviarAntes,
          enviar_3_dias_antes: configCobranca.enviar3DiasAntes,
          enviar_no_dia: configCobranca.enviarNoDia,
          enviar_3_dias_depois: configCobranca.enviar3DiasDepois,
          enviar_aniversario: configCobranca.enviarAniversario,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })

      if (error) throw error

      // Criar templates padrão para cada automação ativada
      if (configCobranca.enviar3DiasAntes) {
        await criarTemplatePadraoSeNaoExiste('pre_due_3days')
      }
      if (configCobranca.enviarNoDia) {
        await criarTemplatePadraoSeNaoExiste('due_day')
      }
      if (configCobranca.enviar3DiasDepois) {
        await criarTemplatePadraoSeNaoExiste('overdue')
      }
      if (configCobranca.enviarAniversario) {
        await criarTemplatePadraoSeNaoExiste('birthday')
      }

      showToast('Configurações salvas!', 'success')
    } catch (error) {
      console.error('Erro ao salvar:', error)
      showToast('Erro ao salvar: ' + error.message, 'error')
    }
  }

  // ==========================================
  // PLANS FUNCTIONS
  // ==========================================

  const carregarPlanos = async (userId) => {
    const { data } = await supabase
      .from('planos')
      .select('*')
      .eq('user_id', userId)
      .order('nome')

    setPlanos(data || [])
  }

  const abrirModalNovoPlan = () => {
    setPlanoEditando(null)
    setFormPlano({ nome: '', valor: '', ciclo: 'mensal', descricao: '', tipo: 'recorrente', numero_aulas: '' })
    setAtualizarMensalidadesFuturas(false)
    setMostrarModalPlano(true)
  }

  const abrirModalEditarPlano = async (plano) => {
    setPlanoEditando(plano)
    setFormPlano({
      nome: plano.nome,
      valor: plano.valor,
      ciclo: plano.ciclo_cobranca || 'mensal',
      descricao: plano.descricao || '',
      tipo: plano.tipo || 'recorrente',
      numero_aulas: plano.numero_aulas?.toString() || ''
    })

    // Count future mensalidades
    const hoje = new Date().toISOString().split('T')[0]
    const { data: devedores } = await supabase
      .from('devedores')
      .select('id')
      .eq('plano_id', plano.id)

    let mensalidadesFuturas = 0
    if (devedores?.length > 0) {
      const { count } = await supabase
        .from('mensalidades')
        .select('*', { count: 'exact', head: true })
        .in('devedor_id', devedores.map(d => d.id))
        .eq('is_mensalidade', true)
        .gte('data_vencimento', hoje)

      mensalidadesFuturas = count || 0
    }

    setPlanoEditando({ ...plano, mensalidadesFuturas })
    setAtualizarMensalidadesFuturas(false)
    setMostrarModalPlano(true)
  }

  const criarPlano = async () => {
    if (!formPlano.nome?.trim()) {
      showToast('Nome do plano é obrigatório', 'warning')
      return
    }

    if (!formPlano.valor || parseFloat(formPlano.valor) <= 0) {
      showToast('Valor deve ser maior que zero', 'warning')
      return
    }

    if (formPlano.tipo === 'pacote' && (!formPlano.numero_aulas || parseInt(formPlano.numero_aulas) <= 0)) {
      showToast('Preencha o número de aulas do pacote', 'warning')
      return
    }

    try {
      const { error } = await supabase.from('planos').insert({
        user_id: contextUserId,
        nome: formPlano.nome.trim(),
        valor: parseFloat(formPlano.valor),
        ciclo_cobranca: formPlano.tipo === 'pacote' ? 'mensal' : formPlano.ciclo,
        descricao: formPlano.descricao?.trim() || null,
        tipo: formPlano.tipo,
        numero_aulas: formPlano.tipo === 'pacote' ? parseInt(formPlano.numero_aulas) : null,
        ativo: true
      })

      if (error) throw error

      showToast('Plano criado!', 'success')
      setMostrarModalPlano(false)
      await carregarPlanos(contextUserId)
    } catch (error) {
      console.error('Erro ao criar plano:', error)
      showToast('Erro ao criar plano: ' + error.message, 'error')
    }
  }

  const atualizarPlano = async () => {
    if (!formPlano.nome?.trim()) {
      showToast('Nome do plano é obrigatório', 'warning')
      return
    }

    if (!formPlano.valor || parseFloat(formPlano.valor) <= 0) {
      showToast('Valor deve ser maior que zero', 'warning')
      return
    }

    if (formPlano.tipo === 'pacote' && (!formPlano.numero_aulas || parseInt(formPlano.numero_aulas) <= 0)) {
      showToast('Preencha o número de aulas do pacote', 'warning')
      return
    }

    try {
      // Update plan
      const { error } = await supabase.from('planos')
        .update({
          nome: formPlano.nome.trim(),
          valor: parseFloat(formPlano.valor),
          ciclo_cobranca: formPlano.tipo === 'pacote' ? 'mensal' : formPlano.ciclo,
          descricao: formPlano.descricao?.trim() || null,
          tipo: formPlano.tipo,
          numero_aulas: formPlano.tipo === 'pacote' ? parseInt(formPlano.numero_aulas) : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', planoEditando.id)

      if (error) throw error

      // If checkbox checked, update future mensalidades
      if (atualizarMensalidadesFuturas) {
        const hoje = new Date().toISOString().split('T')[0]

        const { data: devedores } = await supabase
          .from('devedores')
          .select('id')
          .eq('plano_id', planoEditando.id)

        if (devedores?.length > 0) {
          const devedorIds = devedores.map(d => d.id)

          const { error: updateError } = await supabase.from('mensalidades')
            .update({ valor: parseFloat(formPlano.valor) })
            .in('devedor_id', devedorIds)
            .eq('is_mensalidade', true)
            .gte('data_vencimento', hoje)

          if (updateError) {
            console.error('Erro ao atualizar mensalidades:', updateError)
          } else {
            showToast(`Plano e ${planoEditando.mensalidadesFuturas} mensalidade(s) atualizados!`, 'success')
          }
        }
      } else {
        showToast('Plano atualizado!', 'success')
      }

      setMostrarModalPlano(false)
      await carregarPlanos(contextUserId)
    } catch (error) {
      console.error('Erro ao atualizar plano:', error)
      showToast('Erro ao atualizar plano: ' + error.message, 'error')
    }
  }

  const excluirPlano = async (plano) => {
    // Check if plan is in use
    const { data: devedores } = await supabase
      .from('devedores')
      .select('id')
      .eq('plano_id', plano.id)
      .limit(1)

    if (devedores?.length > 0) {
      showToast('Este plano está em uso e não pode ser excluído', 'warning')
      return
    }

    setConfirmDelete({ show: true, plano })
  }

  const confirmarExclusaoPlano = async () => {
    try {
      const { error } = await supabase.from('planos')
        .delete()
        .eq('id', confirmDelete.plano.id)

      if (error) throw error

      showToast('Plano excluído!', 'success')
      setConfirmDelete({ show: false, plano: null })
      await carregarPlanos(contextUserId)
    } catch (error) {
      console.error('Erro ao excluir plano:', error)
      showToast('Erro ao excluir plano: ' + error.message, 'error')
    }
  }

  const togglePlanoAtivo = async (planoId, novoStatus) => {
    try {
      const { error } = await supabase.from('planos')
        .update({
          ativo: novoStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', planoId)

      if (error) throw error

      showToast(`Plano ${novoStatus ? 'ativado' : 'desativado'}!`, 'success')
      await carregarPlanos(contextUserId)
    } catch (error) {
      console.error('Erro ao atualizar status:', error)
      showToast('Erro ao atualizar status: ' + error.message, 'error')
    }
  }

  // ==========================================
  // USAGE FUNCTIONS
  // ==========================================

  const carregarUsoSistema = async (userId) => {
    try {
      // Get clients (mesma lógica do Clientes.js)
      const { data: clientesData } = await supabase
        .from('devedores')
        .select('id, assinatura_ativa')
        .eq('user_id', userId)
        .or('lixo.is.null,lixo.eq.false')

      // Filtrar: apenas clientes com assinatura ativa (igual ao Clientes.js)
      const clientesCount = (clientesData || []).filter(c => c.assinatura_ativa).length

      // Get plan limits
      const { data: controle } = await supabase
        .from('controle_planos')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      // Buscar limite de clientes do plano
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('plano')
        .eq('id', userId)
        .single()

      // Limites de clientes por plano
      const limiteClientesPorPlano = {
        'starter': 50,
        'pro': 150,
        'premium': 500
      }
      const limiteClientes = limiteClientesPorPlano[usuario?.plano] || 50

      setUsoSistema({
        clientes: { usado: clientesCount, limite: limiteClientes },
        mensagens: { usado: controle?.usage_count || 0, limite: controle?.limite_mensal || 200 }
      })
    } catch (error) {
      console.error('Erro ao carregar uso:', error)
    }
  }

  const calcularCor = (percentual) => {
    if (percentual < 80) return '#4CAF50'
    if (percentual < 95) return '#ff9800'
    return '#f44336'
  }

  // ==========================================
  // AUTOMAÇÃO WHATSAPP FUNCTIONS
  // ==========================================

  // Funções de automação REMOVIDAS - movidas para /whatsapp
  // carregarConfigAutomacao, salvarConfigAutomacao, testarAutomacao

  // ==========================================
  // RENDER FUNCTIONS
  // ==========================================

  const renderDadosEmpresa = () => (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isSmallScreen ? '16px' : '24px', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
      {/* Header com logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <label style={{
          width: 56, height: 56, borderRadius: '12px',
          border: dadosEmpresa.logoUrl ? '2px solid #e5e7eb' : '2px dashed #ccc',
          overflow: 'hidden', cursor: uploadingLogo ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f9fafb', flexShrink: 0, position: 'relative',
          opacity: uploadingLogo ? 0.6 : 1, transition: 'opacity 0.2s'
        }}>
          {dadosEmpresa.logoUrl ? (
            <img src={dadosEmpresa.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <Icon icon="mdi:camera-plus-outline" width="22" style={{ color: '#aaa' }} />
          )}
          <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
        </label>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#333' }}>
            Dados da Empresa
          </h3>
          <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
            {dadosEmpresa.logoUrl ? 'Clique na logo para trocar' : 'Clique para adicionar logo'}
            {dadosEmpresa.logoUrl && (
              <button onClick={removerLogo} style={{
                background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer',
                fontSize: '12px', marginLeft: '8px', padding: 0, textDecoration: 'underline'
              }}>remover</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(2, 1fr)', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            Nome da Empresa *
          </label>
          <input
            type="text"
            value={dadosEmpresa.nomeEmpresa}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, nomeEmpresa: e.target.value })}
            placeholder="Nome da empresa"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            CPF/CNPJ
          </label>
          <input
            type="text"
            value={dadosEmpresa.cnpj}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, cnpj: formatarCPFouCNPJ(e.target.value) })}
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            maxLength="18"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            Endereço
          </label>
          <input
            type="text"
            value={dadosEmpresa.endereco}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, endereco: e.target.value })}
            placeholder="Rua, Avenida..."
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            Número
          </label>
          <input
            type="text"
            value={dadosEmpresa.numero}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, numero: e.target.value })}
            placeholder="123"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            Complemento
          </label>
          <input
            type="text"
            value={dadosEmpresa.complemento}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, complemento: e.target.value })}
            placeholder="Sala 101, Bloco A..."
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            Bairro
          </label>
          <input
            type="text"
            value={dadosEmpresa.bairro}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, bairro: e.target.value })}
            placeholder="Centro"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            Cidade
          </label>
          <input
            type="text"
            value={dadosEmpresa.cidade}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, cidade: e.target.value })}
            placeholder="Cidade"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            Estado
          </label>
          <input
            type="text"
            value={dadosEmpresa.estado}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, estado: e.target.value.toUpperCase() })}
            placeholder="SP"
            maxLength="2"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              textTransform: 'uppercase',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            CEP
          </label>
          <input
            type="text"
            value={dadosEmpresa.cep}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, cep: e.target.value })}
            placeholder="00000-000"
            maxLength="9"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            Telefone
          </label>
          <input
            type="text"
            value={dadosEmpresa.telefone}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, telefone: formatarTelefone(e.target.value) })}
            placeholder="(00) 00000-0000"
            maxLength="15"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            E-mail
          </label>
          <input
            type="email"
            value={dadosEmpresa.email}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, email: e.target.value })}
            placeholder="contato@empresa.com"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            Site
          </label>
          <input
            type="url"
            value={dadosEmpresa.site}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, site: e.target.value })}
            placeholder="https://www.empresa.com"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={salvarDadosEmpresa}
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            padding: '10px 24px',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Salvar Configurações
        </button>
      </div>
    </div>
  )

  const renderConfigCobranca = () => (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isSmallScreen ? '16px' : '24px', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#333' }}>
        Configurações de Cobrança
      </h3>
      <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#666' }}>
        Configure quando enviar mensagens de lembrete para seus alunos
      </p>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
          <div style={{ position: 'relative', display: 'inline-block', width: '44px', height: '22px' }}>
            <input
              type="checkbox"
              checked={configCobranca.enviarAntes}
              onChange={(e) => setConfigCobranca({ ...configCobranca, enviarAntes: e.target.checked })}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute',
              cursor: 'pointer',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: configCobranca.enviarAntes ? '#4CAF50' : '#ccc',
              transition: '0.3s',
              borderRadius: '22px'
            }}>
              <span style={{
                position: 'absolute',
                content: '',
                height: '16px',
                width: '16px',
                left: configCobranca.enviarAntes ? '25px' : '3px',
                bottom: '3px',
                backgroundColor: 'white',
                transition: '0.3s',
                borderRadius: '50%'
              }} />
            </span>
          </div>
          <span style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>
            Enviar mensagens antes do vencimento
          </span>
        </label>
      </div>

      {configCobranca.enviarAntes && (
        <div style={{
          marginTop: '20px',
          padding: '20px',
          backgroundColor: '#f9f9f9',
          borderRadius: '8px',
          border: '1px solid #e0e0e0'
        }}>
          <label style={{ display: 'block', marginBottom: '16px', fontSize: '14px', fontWeight: '600', color: '#555' }}>
            Quando enviar mensagens?
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Checkbox 3 dias antes */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              cursor: 'pointer',
              padding: '12px',
              backgroundColor: 'white',
              borderRadius: '6px',
              border: configCobranca.enviar3DiasAntes ? '2px solid #2196F3' : '2px solid #e0e0e0',
              transition: 'all 0.2s'
            }}>
              <input
                type="checkbox"
                checked={configCobranca.enviar3DiasAntes}
                onChange={(e) => setConfigCobranca({ ...configCobranca, enviar3DiasAntes: e.target.checked })}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  marginTop: '2px',
                  accentColor: '#2196F3'
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Icon icon="mdi:calendar-clock" width="20" style={{ color: '#2196F3' }} />
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    3 dias antes do vencimento
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#666', lineHeight: '1.4' }}>
                  Lembrete antecipado para o aluno se preparar
                </p>
              </div>
            </label>

            {/* Checkbox no dia do vencimento */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              cursor: 'pointer',
              padding: '12px',
              backgroundColor: 'white',
              borderRadius: '6px',
              border: configCobranca.enviarNoDia ? '2px solid #ff9800' : '2px solid #e0e0e0',
              transition: 'all 0.2s'
            }}>
              <input
                type="checkbox"
                checked={configCobranca.enviarNoDia}
                onChange={(e) => setConfigCobranca({ ...configCobranca, enviarNoDia: e.target.checked })}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  marginTop: '2px',
                  accentColor: '#ff9800'
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Icon icon="mdi:calendar-today" width="20" style={{ color: '#ff9800' }} />
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    No dia do vencimento
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#666', lineHeight: '1.4' }}>
                  Aviso no dia exato do vencimento da mensalidade
                </p>
              </div>
            </label>

            {/* Checkbox 3 dias depois */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              cursor: 'pointer',
              padding: '12px',
              backgroundColor: 'white',
              borderRadius: '6px',
              border: configCobranca.enviar3DiasDepois ? '2px solid #f44336' : '2px solid #e0e0e0',
              transition: 'all 0.2s'
            }}>
              <input
                type="checkbox"
                checked={configCobranca.enviar3DiasDepois}
                onChange={(e) => setConfigCobranca({ ...configCobranca, enviar3DiasDepois: e.target.checked })}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  marginTop: '2px',
                  accentColor: '#f44336'
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Icon icon="mdi:calendar-alert" width="20" style={{ color: '#f44336' }} />
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    3 dias após o vencimento
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#666', lineHeight: '1.4' }}>
                  Cobrança para mensalidades em atraso
                </p>
              </div>
            </label>

            {/* Separador visual */}
            <div style={{ borderTop: '1px dashed #e0e0e0', margin: '4px 0' }} />

            {/* Checkbox aniversário */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              cursor: 'pointer',
              padding: '12px',
              backgroundColor: 'white',
              borderRadius: '6px',
              border: configCobranca.enviarAniversario ? '2px solid #E91E63' : '2px solid #e0e0e0',
              transition: 'all 0.2s'
            }}>
              <input
                type="checkbox"
                checked={configCobranca.enviarAniversario}
                onChange={(e) => setConfigCobranca({ ...configCobranca, enviarAniversario: e.target.checked })}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer',
                  marginTop: '2px',
                  accentColor: '#E91E63'
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Icon icon="mdi:cake-variant" width="20" style={{ color: '#E91E63' }} />
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    Mensagem de aniversário
                  </span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: '600',
                    color: '#E91E63',
                    backgroundColor: '#FCE4EC',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>PRO</span>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#666', lineHeight: '1.4' }}>
                  Parabéns automático no dia do aniversário do aluno (enviado às 8h)
                </p>
              </div>
            </label>
          </div>

          {!configCobranca.enviar3DiasAntes && !configCobranca.enviarNoDia && !configCobranca.enviar3DiasDepois && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#fff3cd',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Icon icon="mdi:information" width="20" style={{ color: '#856404' }} />
              <span style={{ fontSize: '13px', color: '#856404' }}>
                Selecione pelo menos uma opção para ativar as mensagens
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={salvarConfigCobranca}
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            padding: '10px 24px',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Salvar Configurações
        </button>
      </div>
    </div>
  )

  const renderPlanos = () => (
    <div>
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isSmallScreen ? '16px' : '24px', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
        <div style={{ display: 'flex', flexDirection: isSmallScreen ? 'column' : 'row', justifyContent: 'space-between', alignItems: isSmallScreen ? 'stretch' : 'center', gap: isSmallScreen ? '16px' : '0', marginBottom: '24px' }}>
          <h3 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#333' }}>
            Planos de Mensalidade
          </h3>
          <button
            onClick={abrirModalNovoPlan}
            style={{
              backgroundColor: '#2196F3',
              color: 'white',
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Icon icon="material-symbols:add" width="18" />
            Adicionar Plano
          </button>
        </div>

        {planos.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <Icon icon="mdi:package-variant-closed" width="64" height="64" style={{ color: '#ccc' }} />
            <p style={{ color: '#999', fontSize: '16px', margin: '12px 0 0 0' }}>
              Nenhum plano cadastrado
            </p>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '8px 0 0 0' }}>
              Clique em "Adicionar Plano" para começar
            </p>
          </div>
        ) : isSmallScreen ? (
          /* Cards para Mobile/Tablet */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {planos.map((plano) => (
              <div
                key={plano.id}
                style={{
                  backgroundColor: '#f9f9f9',
                  borderRadius: '8px',
                  padding: '16px',
                  borderLeft: `4px solid ${plano.ativo ? '#4CAF50' : '#ccc'}`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 4px 0' }}>
                      {plano.nome}
                    </p>
                    <p style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: 0 }}>
                      R$ {parseFloat(plano.valor).toFixed(2)}
                    </p>
                  </div>
                  <span style={{
                    backgroundColor: plano.ativo ? '#e8f5e9' : '#ffebee',
                    color: plano.ativo ? '#2e7d32' : '#c62828',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}>
                    {plano.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: '13px', color: '#666', margin: 0, textTransform: 'capitalize' }}>
                    Ciclo: {plano.ciclo_cobranca || 'mensal'}
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => abrirModalEditarPlano(plano)}
                      style={{
                        backgroundColor: 'white',
                        border: '1px solid #ddd',
                        color: '#2196F3',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '6px'
                      }}
                    >
                      <Icon icon="material-symbols:edit-outline" width="18" />
                    </button>
                    <button
                      onClick={() => togglePlanoAtivo(plano.id, !plano.ativo)}
                      style={{
                        backgroundColor: 'white',
                        border: '1px solid #ddd',
                        color: plano.ativo ? '#ff9800' : '#4CAF50',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '6px'
                      }}
                    >
                      <Icon icon={plano.ativo ? 'material-symbols:toggle-on' : 'material-symbols:toggle-off'} width="18" />
                    </button>
                    <button
                      onClick={() => excluirPlano(plano)}
                      style={{
                        backgroundColor: 'white',
                        border: '1px solid #ddd',
                        color: '#f44336',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '6px'
                      }}
                    >
                      <Icon icon="material-symbols:delete-outline" width="18" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Tabela para Desktop */
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #e0e0e0' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase' }}>
                  Nome
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase' }}>
                  Valor
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase' }}>
                  Ciclo
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase' }}>
                  Status
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#666', textTransform: 'uppercase' }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {planos.map((plano) => (
                <tr
                  key={plano.id}
                  style={{ borderBottom: '1px solid #e5e7eb' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
                    {plano.nome}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#333' }}>
                    R$ {parseFloat(plano.valor).toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#666', textTransform: 'capitalize' }}>
                    {plano.ciclo_cobranca || 'mensal'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      backgroundColor: plano.ativo ? '#e8f5e9' : '#ffebee',
                      color: plano.ativo ? '#2e7d32' : '#c62828',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {plano.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        onClick={() => abrirModalEditarPlano(plano)}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: '#2196F3',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '4px'
                        }}
                        title="Editar"
                      >
                        <Icon icon="material-symbols:edit-outline" width="20" />
                      </button>
                      <button
                        onClick={() => togglePlanoAtivo(plano.id, !plano.ativo)}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: plano.ativo ? '#ff9800' : '#4CAF50',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '4px'
                        }}
                        title={plano.ativo ? 'Desativar' : 'Ativar'}
                      >
                        <Icon icon={plano.ativo ? 'material-symbols:toggle-on' : 'material-symbols:toggle-off'} width="20" />
                      </button>
                      <button
                        onClick={() => excluirPlano(plano)}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: '#f44336',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '4px'
                        }}
                        title="Excluir"
                      >
                        <Icon icon="material-symbols:delete-outline" width="20" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de Plano */}
      {mostrarModalPlano && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: isSmallScreen ? 'white' : 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: isSmallScreen ? 'stretch' : 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setMostrarModalPlano(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: isSmallScreen ? 0 : '12px',
              width: isSmallScreen ? '100%' : '90%',
              maxWidth: isSmallScreen ? '100%' : '450px',
              height: isSmallScreen ? '100%' : 'auto',
              maxHeight: isSmallScreen ? '100%' : 'calc(100vh - 40px)',
              overflow: 'auto',
              boxShadow: isSmallScreen ? 'none' : '0 4px 20px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                {planoEditando ? 'Editar Plano' : 'Novo Plano'}
              </h3>
              <button
                onClick={() => setMostrarModalPlano(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Icon icon="material-symbols:close" width="24" />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
                  Nome do Plano *
                </label>
                <input
                  type="text"
                  value={formPlano.nome}
                  onChange={(e) => setFormPlano({ ...formPlano, nome: e.target.value })}
                  placeholder="Ex: Plano Básico"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '16px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
                  Valor (R$) *
                </label>
                <input
                  type="number"
                  value={formPlano.valor}
                  onChange={(e) => setFormPlano({ ...formPlano, valor: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '16px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Tipo do Plano */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
                  Tipo do Plano *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { value: 'recorrente', label: 'Recorrente', icon: 'mdi:refresh' },
                    { value: 'pacote', label: 'Pacote de Aulas', icon: 'mdi:package-variant' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormPlano({ ...formPlano, tipo: opt.value })}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: `2px solid ${formPlano.tipo === opt.value ? '#2196F3' : '#e0e0e0'}`,
                        backgroundColor: formPlano.tipo === opt.value ? '#e3f2fd' : 'white',
                        color: formPlano.tipo === opt.value ? '#1565C0' : '#666',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Icon icon={opt.icon} width={18} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Número de Aulas (só para pacote) */}
              {formPlano.tipo === 'pacote' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
                    Número de Aulas *
                  </label>
                  <input
                    type="number"
                    value={formPlano.numero_aulas}
                    onChange={(e) => setFormPlano({ ...formPlano, numero_aulas: e.target.value })}
                    placeholder="Ex: 8"
                    min="1"
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '16px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: '12px', color: '#888', marginTop: '4px', display: 'block' }}>
                    Quantidade de aulas que o aluno pode fazer com este pacote
                  </span>
                </div>
              )}

              {/* Ciclo de Cobrança (só para recorrente) */}
              {formPlano.tipo === 'recorrente' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
                    Ciclo de Cobrança *
                  </label>
                  <select
                    value={formPlano.ciclo}
                    onChange={(e) => setFormPlano({ ...formPlano, ciclo: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '16px',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="mensal">Mensal</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
                  Descrição (opcional)
                </label>
                <textarea
                  value={formPlano.descricao}
                  onChange={(e) => setFormPlano({ ...formPlano, descricao: e.target.value })}
                  placeholder="Descreva os benefícios do plano..."
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '16px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {planoEditando?.id && planoEditando.mensalidadesFuturas > 0 && (
                <div style={{ padding: '12px', backgroundColor: '#fff3e0', borderRadius: '6px', marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={atualizarMensalidadesFuturas}
                      onChange={(e) => setAtualizarMensalidadesFuturas(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', color: '#e65100' }}>
                      Atualizar {planoEditando.mensalidadesFuturas} mensalidade(s) futura(s) com o novo valor
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e0e0e0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                onClick={() => setMostrarModalPlano(false)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#666',
                  padding: '10px 20px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={planoEditando ? atualizarPlano : criarPlano}
                style={{
                  backgroundColor: '#2196F3',
                  color: 'white',
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                {planoEditando ? 'Salvar Alterações' : 'Criar Plano'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={confirmDelete.show}
        onClose={() => setConfirmDelete({ show: false, plano: null })}
        onConfirm={confirmarExclusaoPlano}
        title="Excluir Plano"
        message={`Tem certeza que deseja excluir o plano "${confirmDelete.plano?.nome}"?`}
        confirmText="Excluir"
        cancelText="Cancelar"
        type="danger"
      />
    </div>
  )

  const renderUsoSistema = () => {
    const percentualClientes = (usoSistema.clientes.usado / usoSistema.clientes.limite) * 100
    const percentualMensagens = (usoSistema.mensagens.usado / usoSistema.mensagens.limite) * 100

    return (
      <div>
        <h3 style={{ margin: '0 0 24px 0', fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#333' }}>
          Uso do Sistema
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(2, 1fr)', gap: '20px' }}>
          {/* Card Clientes */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isSmallScreen ? '16px' : '24px', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#e3f2fd',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon icon="mdi:account-group" width="28" style={{ color: '#2196F3' }} />
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>Alunos</div>
                <div style={{ fontSize: '20px', fontWeight: '600', color: '#333' }}>
                  {usoSistema.clientes.usado} / {usoSistema.clientes.limite}
                </div>
              </div>
            </div>

            <div style={{ width: '100%', height: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(percentualClientes, 100)}%`,
                height: '100%',
                backgroundColor: calcularCor(percentualClientes),
                transition: 'width 0.3s ease'
              }} />
            </div>

            <div style={{ marginTop: '8px', fontSize: '13px', color: '#666', textAlign: 'right' }}>
              {percentualClientes.toFixed(1)}% utilizado
            </div>
          </div>

          {/* Card Mensagens */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isSmallScreen ? '16px' : '24px', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#f3e5f5',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon icon="mdi:message-text" width="28" style={{ color: '#9c27b0' }} />
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>Mensagens</div>
                <div style={{ fontSize: '20px', fontWeight: '600', color: '#333' }}>
                  {usoSistema.mensagens.usado} / {usoSistema.mensagens.limite}
                </div>
              </div>
            </div>

            <div style={{ width: '100%', height: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(percentualMensagens, 100)}%`,
                height: '100%',
                backgroundColor: calcularCor(percentualMensagens),
                transition: 'width 0.3s ease'
              }} />
            </div>

            <div style={{ marginTop: '8px', fontSize: '13px', color: '#666', textAlign: 'right' }}>
              {percentualMensagens.toFixed(1)}% utilizado
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Carregar plano atual do usuário
  useEffect(() => {
    const carregarPlanoAtual = async () => {
      if (contextUserId) {
        const { data } = await supabase
          .from('usuarios')
          .select('plano')
          .eq('id', contextUserId)
          .single()
        if (data?.plano) {
          setPlanoAtual(data.plano)
        }
      }
    }
    carregarPlanoAtual()
  }, [contextUserId])

  const planosDisponiveis = [
    {
      id: 'starter',
      nome: 'Starter',
      preco: 49.90,
      subtitulo: 'Ideal para começar',
      features: [
        'Lembretes automáticos 3 dias antes',
        '1 template personalizável',
        'Dashboard básico',
        'Exportação CSV',
        'Suporte'
      ],
      destaque: false,
      dica: 'Economize ~2h/semana em cobranças',
      cta: 'Começar no Starter'
    },
    {
      id: 'pro',
      nome: 'Pro',
      preco: 99.90,
      subtitulo: 'Para negócios em crescimento',
      features: [
        'Lembretes em 3 dias antes, no dia do vencimento e 3 dias depois',
        '3 templates personalizáveis',
        'Dashboard com gráficos completos',
        'Aging Report + Receita Projetada',
        'Mensagem de aniversário automática',
        'Suporte WhatsApp'
      ],
      destaque: true,
      dica: 'Economize ~5h/semana + Reduza 70% inadimplência',
      cta: 'Escolher mais popular'
    },
    {
      id: 'premium',
      nome: 'Premium',
      preco: 149.90,
      subtitulo: 'Gestão profissional',
      features: [
        'Tudo do plano Pro',
        'Consultoria inicial (1h)',
        'Suporte prioritário (4h)',
        'Acesso antecipado a features'
      ],
      destaque: false,
      dica: 'Economize ~10h/semana + Suporte VIP',
      cta: 'Ativar Premium'
    }
  ]

  const handleUpgrade = async (planoId) => {
    if (planoId === planoAtual) {
      showToast('Você já está neste plano', 'info')
      return
    }

    setProcessandoCheckout(true)
    try {
      // Aqui você pode integrar com Stripe, Mercado Pago, etc.
      // Por enquanto, apenas mostra mensagem
      showToast('Redirecionando para checkout...', 'info')

      // Simular redirecionamento (substituir pela integração real)
      setTimeout(() => {
        showToast('Integração de pagamento em desenvolvimento', 'warning')
        setProcessandoCheckout(false)
      }, 1500)
    } catch (error) {
      console.error('Erro no checkout:', error)
      showToast('Erro ao processar. Tente novamente.', 'error')
      setProcessandoCheckout(false)
    }
  }

  const handleSuporteWhatsApp = () => {
    window.open('https://wa.me/5562981618862?text=Olá! Preciso de ajuda com o MensalliZap', '_blank')
  }

  const renderUpgrade = () => (
    <div>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h3 style={{
          fontSize: isSmallScreen ? '28px' : '36px',
          fontWeight: 'bold',
          marginBottom: '12px',
          color: '#333'
        }}>
          Faça upgrade do seu plano
        </h3>
        <p style={{
          fontSize: '16px',
          color: '#666',
          maxWidth: '500px',
          margin: '0 auto'
        }}>
          Desbloqueie mais recursos e automatize ainda mais suas cobranças
        </p>
      </div>

      {/* Cards de Planos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '24px',
        marginBottom: '40px'
      }}>
        {planosDisponiveis.map((plano) => {
          const isPro = plano.destaque
          const isAtual = plano.id === planoAtual

          return (
            <div
              key={plano.id}
              style={{
                backgroundColor: isPro ? '#25D366' : '#fafafa',
                padding: '32px',
                borderRadius: '16px',
                border: isPro ? 'none' : '1px solid #eee',
                boxShadow: isPro ? '0 8px 32px rgba(37,211,102,0.3)' : 'none',
                transform: isPro ? 'scale(1.02)' : 'scale(1)',
                position: 'relative'
              }}
            >
              {/* Badge Mais popular */}
              {isPro && (
                <div style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: '#1a1a1a',
                  color: 'white',
                  padding: '6px 16px',
                  borderRadius: '100px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  Mais popular
                </div>
              )}

              {/* Badge Plano Atual */}
              {isAtual && (
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  backgroundColor: isPro ? 'rgba(255,255,255,0.2)' : '#e8f5e9',
                  color: isPro ? 'white' : '#2e7d32',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  SEU PLANO
                </div>
              )}

              {/* Subtítulo */}
              <p style={{
                fontSize: '12px',
                fontWeight: '600',
                color: isPro ? 'rgba(255,255,255,0.7)' : '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '4px',
                marginTop: isPro ? '8px' : '0'
              }}>
                {plano.subtitulo}
              </p>

              {/* Nome do plano */}
              <h4 style={{
                fontSize: '20px',
                fontWeight: '700',
                marginBottom: '16px',
                color: isPro ? 'white' : '#1a1a1a'
              }}>
                {plano.nome}
              </h4>

              {/* Preço */}
              <div style={{ marginBottom: '24px' }}>
                <span style={{ fontSize: '42px', fontWeight: '800', color: isPro ? 'white' : '#1a1a1a' }}>
                  R${plano.id === 'starter' ? '49' : plano.id === 'pro' ? '99' : '149'}
                </span>
                <span style={{ fontSize: '16px', color: isPro ? 'rgba(255,255,255,0.7)' : '#999' }}>
                  /mês
                </span>
              </div>

              {/* Features */}
              <ul style={{
                listStyle: 'none',
                padding: 0,
                marginBottom: '32px'
              }}>
                {plano.features.map((feature, i) => (
                  <li key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    marginBottom: '12px',
                    fontSize: '14px',
                    color: isPro ? 'rgba(255,255,255,0.95)' : '#444'
                  }}>
                    <Icon
                      icon="mdi:check"
                      width="18"
                      style={{ color: isPro ? 'white' : '#16a34a', flexShrink: 0, marginTop: '2px' }}
                    />
                    <span>{feature}</span>
                  </li>
                ))}
                {/* Dica de economia */}
                <li style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  marginBottom: '12px',
                  fontSize: '14px',
                  color: isPro ? 'rgba(255,255,255,0.95)' : '#444'
                }}>
                  <span>💡 {plano.dica}</span>
                </li>
              </ul>

              {/* Botão */}
              <button
                onClick={() => handleUpgrade(plano.id)}
                disabled={isAtual || processandoCheckout}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '14px',
                  backgroundColor: isAtual ? '#ccc' : (isPro ? 'white' : 'transparent'),
                  color: isAtual ? 'white' : (isPro ? '#25D366' : '#1a1a1a'),
                  border: isPro ? 'none' : '1px solid #1a1a1a',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: '600',
                  textAlign: 'center',
                  cursor: isAtual ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: isAtual ? 0.6 : 1
                }}
                onMouseOver={(e) => {
                  if (!isAtual && !isPro) {
                    e.currentTarget.style.backgroundColor = '#1a1a1a'
                    e.currentTarget.style.color = 'white'
                  }
                  if (!isAtual && isPro) {
                    e.currentTarget.style.opacity = '0.9'
                  }
                }}
                onMouseOut={(e) => {
                  if (!isAtual && !isPro) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = '#1a1a1a'
                  }
                  if (!isAtual && isPro) {
                    e.currentTarget.style.opacity = '1'
                  }
                }}
              >
                {processandoCheckout ? 'Processando...' : isAtual ? 'Plano Atual' : plano.cta}
              </button>

              {/* Texto extra para Pro */}
              {isPro && (
                <p style={{
                  textAlign: 'center',
                  marginTop: '16px',
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.8)'
                }}>
                  Economize R$ 150/mês vs. sistemas tradicionais
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Garantias e Benefícios */}
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '16px',
        border: '1px solid #e0e0e0',
        marginBottom: '40px'
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '32px',
          marginBottom: '32px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon icon="mdi:check-circle" width="24" style={{ color: '#4CAF50' }} />
            <span style={{ fontSize: '15px', color: '#333' }}>Cancele quando quiser, sem multa</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon icon="mdi:check-circle" width="24" style={{ color: '#4CAF50' }} />
            <span style={{ fontSize: '15px', color: '#333' }}>Seus dados continuam salvos por 30 dias</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon icon="mdi:check-circle" width="24" style={{ color: '#4CAF50' }} />
            <span style={{ fontSize: '15px', color: '#333' }}>Upgrade ou downgrade a qualquer momento</span>
          </div>
        </div>

        <div style={{
          textAlign: 'center',
          paddingTop: '24px',
          borderTop: '1px solid #e0e0e0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
            <Icon icon="mdi:shield-check" width="24" style={{ color: '#2196F3' }} />
            <span style={{ fontSize: '16px', fontWeight: '600', color: '#333' }}>
              Pagamento 100% seguro via Mercado Pago
            </span>
          </div>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Seus dados financeiros estão protegidos com criptografia SSL
          </p>
        </div>
      </div>

      {/* Botão de Suporte */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <button
          onClick={handleSuporteWhatsApp}
          style={{
            padding: '14px 28px',
            backgroundColor: '#25D366',
            color: 'white',
            border: 'none',
            borderRadius: '50px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)'
          }}
          onMouseOver={(e) => {
            e.target.style.transform = 'translateY(-2px)'
            e.target.style.boxShadow = '0 6px 16px rgba(37, 211, 102, 0.4)'
          }}
          onMouseOut={(e) => {
            e.target.style.transform = 'translateY(0)'
            e.target.style.boxShadow = '0 4px 12px rgba(37, 211, 102, 0.3)'
          }}
        >
          <Icon icon="mdi:whatsapp" width="22" />
          Dúvidas? Chama no WhatsApp
        </button>
      </div>
    </div>
  )

  // ==========================================
  // ASAAS (BOLETOS)
  // ==========================================

  const carregarConfigAsaas = async () => {
    try {
      const config = await asaasService.getConfig()
      setAsaasConfig({
        apiKey: config.apiKey || '',
        ambiente: config.ambiente || 'sandbox'
      })
      if (config.apiKey) {
        setAsaasConectado(true)
      }
    } catch (error) {
      console.log('Asaas não configurado ainda')
    }
  }

  const testarConexaoAsaas = async () => {
    if (!asaasConfig.apiKey) {
      showToast('Digite a API Key do Asaas', 'error')
      return
    }

    setTestandoAsaas(true)
    try {
      // Salvar temporariamente para testar (sempre production)
      await asaasService.salvarConfig(asaasConfig.apiKey, 'production')

      const resultado = await asaasService.testarConexao()

      if (resultado.success) {
        setAsaasConectado(true)
        setAsaasContaInfo(resultado.conta)
        showToast('Conexão com Asaas estabelecida!', 'success')
      } else {
        setAsaasConectado(false)
        showToast(resultado.message || 'Erro ao conectar com Asaas', 'error')
      }
    } catch (error) {
      setAsaasConectado(false)
      showToast('Erro ao testar conexão: ' + error.message, 'error')
    } finally {
      setTestandoAsaas(false)
    }
  }

  const salvarConfigAsaas = async () => {
    setSalvandoAsaas(true)
    try {
      // Sempre salvar como 'production' - ambiente de produção
      await asaasService.salvarConfig(asaasConfig.apiKey, 'production')
      showToast('Configuração do Asaas salva com sucesso!', 'success')
    } catch (error) {
      showToast('Erro ao salvar: ' + error.message, 'error')
    } finally {
      setSalvandoAsaas(false)
    }
  }

  // Salvar modo de integração
  const salvarModoIntegracao = async (novoModo) => {
    setSalvandoModo(true)
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ modo_integracao: novoModo })
        .eq('id', contextUserId)

      if (error) throw error

      setModoIntegracao(novoModo)
      showToast(`Modo alterado para ${novoModo === 'asaas' ? 'Asaas' : 'PIX Manual'}`, 'success')
    } catch (error) {
      console.error('Erro ao salvar modo:', error)
      showToast('Erro ao salvar configuração', 'error')
    } finally {
      setSalvandoModo(false)
    }
  }

  // Salvar chave PIX
  const salvarChavePix = async () => {
    if (!dadosEmpresa.chavePix?.trim()) {
      showToast('Informe sua chave PIX', 'warning')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ chave_pix: dadosEmpresa.chavePix })
        .eq('id', contextUserId)

      if (error) throw error
      showToast('Chave PIX salva com sucesso!', 'success')
    } catch (error) {
      console.error('Erro ao salvar chave PIX:', error)
      showToast('Erro ao salvar chave PIX', 'error')
    } finally {
      setLoading(false)
    }
  }

  const renderIntegracoes = () => (
    <div style={{ padding: isSmallScreen ? '16px' : '24px' }}>
      {/* Header Section */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: isSmallScreen ? '20px' : '28px',
        marginBottom: '24px',
        border: '1px solid #e5e7eb',
        boxShadow: 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icon icon="mdi:link-variant" width="24" style={{ color: 'white' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a2e', margin: 0 }}>
              Integrações de Pagamento
            </h2>
            <p style={{ fontSize: '14px', color: '#666', margin: '4px 0 0 0' }}>
              Escolha como deseja receber pagamentos dos seus alunos
            </p>
          </div>
        </div>
      </div>

      {/* Seletor de Modo */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: isSmallScreen ? '20px' : '28px',
        marginBottom: '24px',
        border: '1px solid #e5e7eb',
        boxShadow: 'none'
      }}>
        <h3 style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#344848',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Icon icon="mdi:swap-horizontal" width="20" style={{ color: '#667eea' }} />
          Selecione o modo de integração
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr',
          gap: '20px'
        }}>
          {/* Opção Asaas */}
          <div
            onClick={() => !salvandoModo && salvarModoIntegracao('asaas')}
            style={{
              padding: '24px',
              backgroundColor: modoIntegracao === 'asaas' ? '#f0f7ff' : '#fafafa',
              border: modoIntegracao === 'asaas' ? '2px solid #2196F3' : '2px solid #e5e7eb',
              borderRadius: '16px',
              cursor: salvandoModo ? 'wait' : 'pointer',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: modoIntegracao === 'asaas' ? '0 4px 15px rgba(33, 150, 243, 0.2)' : 'none'
            }}
          >
            {/* Badge Recomendado */}
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              backgroundColor: '#4CAF50',
              color: 'white',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <Icon icon="mdi:star" width="12" />
              Recomendado
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                backgroundColor: modoIntegracao === 'asaas' ? '#2196F3' : '#e0e0e0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}>
                <Icon icon="mdi:bank" width="26" style={{ color: 'white' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: modoIntegracao === 'asaas' ? '#1565c0' : '#333' }}>
                  Asaas
                </h3>
                <span style={{ fontSize: '13px', color: '#666' }}>Gateway completo</span>
              </div>
              {modoIntegracao === 'asaas' && (
                <Icon icon="mdi:check-circle" width="28" style={{ marginLeft: 'auto', color: '#2196F3' }} />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { text: 'Link de pagamento Asaas', subtitle: 'Múltiplas formas de pagamento' },
                { text: 'Confirmação automática', subtitle: null },
                { text: 'Geração de Boletos', subtitle: null }
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon
                    icon="mdi:check-circle"
                    width="18"
                    style={{ color: '#4CAF50' }}
                  />
                  <div>
                    <span style={{ fontSize: '14px', color: '#444' }}>{item.text}</span>
                    {item.subtitle && (
                      <span style={{ fontSize: '12px', color: '#888', display: 'block' }}>{item.subtitle}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Opção PIX Manual */}
          <div
            onClick={() => !salvandoModo && salvarModoIntegracao('manual')}
            style={{
              padding: '24px',
              backgroundColor: modoIntegracao === 'manual' ? '#fff8f0' : '#fafafa',
              border: modoIntegracao === 'manual' ? '2px solid #FF9800' : '2px solid #e5e7eb',
              borderRadius: '16px',
              cursor: salvandoModo ? 'wait' : 'pointer',
              transition: 'all 0.3s ease',
              position: 'relative',
              boxShadow: modoIntegracao === 'manual' ? '0 4px 15px rgba(255, 152, 0, 0.2)' : 'none'
            }}
          >
            {/* Badge Simples */}
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              backgroundColor: '#9e9e9e',
              color: 'white',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '600'
            }}>
              Simples
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                backgroundColor: modoIntegracao === 'manual' ? '#FF9800' : '#e0e0e0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease'
              }}>
                <Icon icon="mdi:qrcode" width="26" style={{ color: 'white' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: modoIntegracao === 'manual' ? '#e65100' : '#333' }}>
                  PIX Manual
                </h3>
                <span style={{ fontSize: '13px', color: '#666' }}>Sem gateway externo</span>
              </div>
              {modoIntegracao === 'manual' && (
                <Icon icon="mdi:check-circle" width="28" style={{ marginLeft: 'auto', color: '#FF9800' }} />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { text: 'Link de pagamento interno', active: true },
                { text: 'Confirmação manual', active: false },
                { text: 'Sem boletos', active: false }
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon
                    icon={item.active ? "mdi:check-circle" : "mdi:close-circle"}
                    width="18"
                    style={{ color: item.active ? '#4CAF50' : '#bdbdbd' }}
                  />
                  <span style={{ fontSize: '14px', color: item.active ? '#444' : '#999' }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Configuração baseada no modo selecionado */}
      {modoIntegracao === 'asaas' ? (
        // Configuração Asaas
        <>
          {/* Status da conexão */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: isSmallScreen ? '20px' : '28px',
            marginBottom: '24px',
            border: '1px solid #e5e7eb',
            boxShadow: 'none'
          }}>
            <div style={{
              padding: '20px',
              backgroundColor: asaasConectado ? '#e8f5e9' : '#fff3e0',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: asaasConectado ? '#4CAF50' : '#FF9800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Icon
                  icon={asaasConectado ? 'mdi:check-circle' : 'mdi:alert-circle'}
                  width="24"
                  style={{ color: 'white' }}
                />
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: '700', fontSize: '16px', color: asaasConectado ? '#2e7d32' : '#e65100' }}>
                  {asaasConectado ? '✓ Asaas Conectado' : 'Asaas Não Configurado'}
                </p>
                {asaasConectado && asaasContaInfo && (
                  <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#666' }}>
                    <strong>{asaasContaInfo.nome}</strong> • {asaasContaInfo.email}
                  </p>
                )}
                {!asaasConectado && (
                  <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#666' }}>
                    Configure sua API Key abaixo para começar a emitir boletos
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Formulário Asaas */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: isSmallScreen ? '20px' : '28px',
            border: '1px solid #e5e7eb',
            boxShadow: 'none'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '700',
              color: '#344848',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#e3f2fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon icon="mdi:key-variant" width="18" style={{ color: '#2196F3' }} />
              </div>
              Configurar API Key
            </h3>

            {/* API Key */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontSize: '14px', fontWeight: '600', color: '#344848' }}>
                API Key do Asaas <span style={{ color: '#f44336' }}>*</span>
              </label>
              <input
                type="password"
                value={asaasConfig.apiKey}
                onChange={(e) => setAsaasConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="$aact_..."
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '14px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  boxSizing: 'border-box'
                }}
              />
              <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                Encontre sua API Key em: Asaas {'>'} Minha Conta {'>'} Integrações {'>'} Gerar nova chave de API
              </p>
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={testarConexaoAsaas}
                disabled={testandoAsaas || !asaasConfig.apiKey}
                style={{
                  flex: 1,
                  minWidth: '150px',
                  padding: '12px 20px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: testandoAsaas || !asaasConfig.apiKey ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: testandoAsaas || !asaasConfig.apiKey ? 0.6 : 1
                }}
              >
                <Icon icon={testandoAsaas ? 'mdi:loading' : 'mdi:connection'} width="18" style={testandoAsaas ? { animation: 'spin 1s linear infinite' } : {}} />
                {testandoAsaas ? 'Testando...' : 'Testar Conexão'}
              </button>

              <button
                onClick={salvarConfigAsaas}
                disabled={salvandoAsaas || !asaasConfig.apiKey}
                style={{
                  flex: 1,
                  minWidth: '150px',
                  padding: '12px 20px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: salvandoAsaas || !asaasConfig.apiKey ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: salvandoAsaas || !asaasConfig.apiKey ? 0.6 : 1
                }}
              >
                <Icon icon={salvandoAsaas ? 'mdi:loading' : 'mdi:content-save'} width="18" style={salvandoAsaas ? { animation: 'spin 1s linear infinite' } : {}} />
                {salvandoAsaas ? 'Salvando...' : 'Salvar Configuração'}
              </button>
            </div>
          </div>

          {/* Instruções Asaas */}
          <div style={{
            marginTop: '24px',
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: isSmallScreen ? '20px' : '28px',
            border: '1px solid #e5e7eb',
            boxShadow: 'none'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '700',
              color: '#344848',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#e3f2fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon icon="mdi:help-circle" width="18" style={{ color: '#2196F3' }} />
              </div>
              Como configurar o Asaas
            </h3>

            <div style={{
              display: 'grid',
              gap: '12px'
            }}>
              {[
                { step: 1, text: <>Acesse <a href="https://www.asaas.com" target="_blank" rel="noopener noreferrer" style={{ color: '#2196F3', fontWeight: '600' }}>asaas.com</a> e crie sua conta gratuita</> },
                { step: 2, text: <>Vá em <strong>Minha Conta</strong> → <strong>Integrações</strong></> },
                { step: 3, text: <>Clique em <strong>Gerar nova chave de API</strong></> },
                { step: 4, text: <>Copie a chave gerada e cole no campo acima</> }
              ].map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  padding: '12px 16px',
                  backgroundColor: '#fafafa',
                  borderRadius: '10px'
                }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: '#2196F3',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: '700',
                    flexShrink: 0
                  }}>
                    {item.step}
                  </div>
                  <span style={{ fontSize: '14px', color: '#444', lineHeight: '28px' }}>{item.text}</span>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: '20px',
              padding: '16px 20px',
              background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Icon icon="mdi:gift" width="24" style={{ color: '#1565c0' }} />
              <div>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#1565c0' }}>
                  Taxa do Asaas: R$ 0,00 por boleto emitido
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#1976d2' }}>
                  Emita quantos boletos quiser sem custo!
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        // Configuração PIX Manual
        <>
          {/* Formulário PIX */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: isSmallScreen ? '20px' : '28px',
            marginBottom: '24px',
            border: '1px solid #e5e7eb',
            boxShadow: 'none'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '700',
              color: '#344848',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#fff3e0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon icon="mdi:key" width="18" style={{ color: '#FF9800' }} />
              </div>
              Configurar Chave PIX
            </h3>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontSize: '14px', fontWeight: '600', color: '#344848' }}>
                Sua Chave PIX <span style={{ color: '#f44336' }}>*</span>
              </label>
              <input
                type="text"
                value={dadosEmpresa.chavePix}
                onChange={(e) => setDadosEmpresa(prev => ({ ...prev, chavePix: e.target.value }))}
                placeholder="CPF, CNPJ, Email, Telefone ou Chave Aleatória"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  fontSize: '15px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '10px',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#FF9800'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
              <p style={{ fontSize: '13px', color: '#888', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon icon="mdi:information-outline" width="16" style={{ color: '#999' }} />
                Esta chave será usada para gerar o QR Code PIX nos links de pagamento.
              </p>
            </div>

            <button
              onClick={salvarChavePix}
              disabled={loading || !dadosEmpresa.chavePix}
              style={{
                padding: '14px 28px',
                backgroundColor: loading || !dadosEmpresa.chavePix ? '#ccc' : '#FF9800',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: loading || !dadosEmpresa.chavePix ? 'not-allowed' : 'pointer',
                fontSize: '15px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'all 0.2s',
                boxShadow: loading || !dadosEmpresa.chavePix ? 'none' : '0 4px 12px rgba(255, 152, 0, 0.3)'
              }}
            >
              <Icon icon={loading ? 'mdi:loading' : 'mdi:content-save'} width="20" style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
              {loading ? 'Salvando...' : 'Salvar Chave PIX'}
            </button>
          </div>

          {/* Informações PIX Manual */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: isSmallScreen ? '20px' : '28px',
            border: '1px solid #e5e7eb',
            boxShadow: 'none'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '700',
              color: '#344848',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#fff3e0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon icon="mdi:information" width="18" style={{ color: '#FF9800' }} />
              </div>
              Como funciona o PIX Manual
            </h3>

            <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
              {[
                { icon: 'mdi:send', text: 'Você envia um link de pagamento para o aluno via WhatsApp' },
                { icon: 'mdi:qrcode-scan', text: 'O aluno acessa o link e vê o QR Code PIX + código copia e cola' },
                { icon: 'mdi:check-decagram', text: 'Após o pagamento, você confirma manualmente no sistema' },
                { icon: 'mdi:alert-circle', text: 'Não é possível gerar boletos neste modo', warning: true }
              ].map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  padding: '14px 16px',
                  backgroundColor: item.warning ? '#fff3e0' : '#fafafa',
                  borderRadius: '10px',
                  border: item.warning ? '1px solid #ffcc80' : '1px solid transparent'
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: item.warning ? '#FF9800' : '#e8e8e8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Icon icon={item.icon} width="18" style={{ color: item.warning ? 'white' : '#666' }} />
                  </div>
                  <span style={{ fontSize: '14px', color: item.warning ? '#e65100' : '#444', lineHeight: '32px', fontWeight: item.warning ? '600' : '400' }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>

            <div style={{
              padding: '16px 20px',
              background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Icon icon="mdi:lightbulb" width="24" style={{ color: '#1565c0' }} />
              <p style={{ margin: 0, fontSize: '14px', color: '#1565c0' }}>
                Para emitir <strong>boletos</strong> e ter <strong>confirmação automática</strong>, use a integração <strong>Asaas</strong>.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )

  // Aba de Automação WhatsApp foi movida para /whatsapp
  // A configuração de automações agora está integrada na página de templates

  // ==========================================
  // AGENDAMENTO ONLINE
  // ==========================================

  const gerarSlug = async () => {
    if (!dadosEmpresa.nomeEmpresa) {
      showToast('Preencha o nome da empresa primeiro', 'warning')
      return
    }
    setGerandoSlug(true)
    try {
      const { data, error } = await supabase.rpc('gerar_agendamento_slug', { nome_empresa: dadosEmpresa.nomeEmpresa })
      if (error) throw error
      setAgendamentoConfig(prev => ({ ...prev, slug: data }))
      showToast('Slug gerado!', 'success')
    } catch (err) {
      console.error('Erro ao gerar slug:', err)
      // Fallback: gerar localmente
      let slug = dadosEmpresa.nomeEmpresa.toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
      setAgendamentoConfig(prev => ({ ...prev, slug }))
    }
    setGerandoSlug(false)
  }

  const salvarAgendamento = async () => {
    if (agendamentoConfig.ativo && !agendamentoConfig.slug) {
      showToast('Defina um slug antes de ativar', 'warning')
      return
    }
    setSalvandoAgendamento(true)
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({
          agendamento_slug: agendamentoConfig.slug || null,
          agendamento_ativo: agendamentoConfig.ativo,
          agendamento_antecedencia_horas: agendamentoConfig.antecedenciaHoras
        })
        .eq('id', contextUserId)

      if (error) throw error
      showToast('Configuração de agendamento salva!', 'success')
    } catch (err) {
      console.error('Erro ao salvar agendamento:', err)
      showToast('Erro ao salvar: ' + (err.message || 'erro desconhecido'), 'error')
    }
    setSalvandoAgendamento(false)
  }

  const copiarLinkAgendamento = () => {
    const link = `${window.location.origin}/agendar/${agendamentoConfig.slug}`
    navigator.clipboard.writeText(link).then(() => {
      showToast('Link copiado!', 'success')
    }).catch(() => {
      showToast('Erro ao copiar', 'error')
    })
  }

  // ==========================================
  // LANDING PAGE PUBLICA
  // ==========================================

  const slugifyLocal = (txt) => {
    return String(txt || '').toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  const gerarLandingSlug = () => {
    const slug = slugifyLocal(dadosEmpresa.nomeEmpresa || 'academia')
    setLandingConfig(prev => ({ ...prev, slug }))
    showToast('Slug gerado!', 'success')
  }

  const salvarLanding = async () => {
    if (landingConfig.ativo && !landingConfig.slug) {
      showToast('Defina um endereço antes de ativar', 'warning')
      return
    }
    if (landingConfig.slug && landingConfig.slug.length < 3) {
      showToast('O endereço precisa ter pelo menos 3 caracteres', 'warning')
      return
    }
    if (slugEhReservado(landingConfig.slug)) {
      showToast(`"${landingConfig.slug}" é uma palavra reservada do sistema. Escolha outro endereço.`, 'warning')
      return
    }
    if (landingConfig.descricao && landingConfig.descricao.length > 500) {
      showToast('A descrição deve ter no máximo 500 caracteres', 'warning')
      return
    }
    setSalvandoLanding(true)
    try {
      // Limpa FAQ e depoimentos vazios antes de salvar
      const faqLimpo = (landingConfig.faq || []).filter(f => f && (f.pergunta || '').trim() && (f.resposta || '').trim())
      const depoimentosLimpo = (landingConfig.depoimentosManuais || []).filter(d => d && (d.nome || '').trim() && (d.comentario || '').trim())

      const { error } = await supabase
        .from('usuarios')
        .update({
          landing_ativo: landingConfig.ativo,
          landing_slug: landingConfig.slug || null,
          landing_descricao: landingConfig.descricao || null,
          landing_cor_primaria: landingConfig.corPrimaria || '#344848',
          landing_foto_capa_url: landingConfig.fotoCapaUrl || null,
          instagram_url: landingConfig.instagramUrl || null,
          facebook_url: (landingConfig.facebookUrl || '').trim() || null,
          tiktok_url: (landingConfig.tiktokUrl || '').trim() || null,
          landing_rodape_texto: (landingConfig.rodapeTexto || '').trim() || null,
          landing_hero_titulo: (landingConfig.heroTitulo || '').trim() || null,
          landing_hero_subtitulo: (landingConfig.heroSubtitulo || '').trim() || null,
          landing_cta_texto: (landingConfig.ctaTexto || '').trim() || null,
          landing_cta_final_titulo: (landingConfig.ctaFinalTitulo || '').trim() || null,
          landing_cta_final_subtitulo: (landingConfig.ctaFinalSubtitulo || '').trim() || null,
          landing_galeria: landingConfig.galeria || [],
          landing_faq: faqLimpo,
          landing_depoimentos_manuais: depoimentosLimpo,
          landing_ordem_secoes: landingConfig.ordemSecoes,
          landing_mostrar_depoimentos: landingConfig.mostrarDepoimentos,
          landing_mostrar_planos: landingConfig.mostrarPlanos,
          landing_mostrar_horarios: landingConfig.mostrarHorarios,
          landing_mostrar_galeria: landingConfig.mostrarGaleria,
          landing_mostrar_faq: landingConfig.mostrarFaq,
          landing_mostrar_cta_whatsapp: landingConfig.mostrarCtaWhatsapp,
          landing_mostrar_cta_agendar: landingConfig.mostrarCtaAgendar,
          landing_mostrar_cta_final: landingConfig.mostrarCtaFinal,
          landing_cta_final_mostrar_botao: landingConfig.ctaFinalMostrarBotao
        })
        .eq('id', contextUserId)

      if (error) {
        if (String(error.message || '').includes('duplicate') || error.code === '23505') {
          throw new Error('Este endereço já está em uso. Escolha outro.')
        }
        throw error
      }
      showToast('Site atualizado!', 'success')
    } catch (err) {
      console.error('Erro ao salvar landing:', err)
      showToast('Erro ao salvar: ' + (err.message || 'erro desconhecido'), 'error')
    }
    setSalvandoLanding(false)
  }

  const handleCapaUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Selecione uma imagem (PNG, JPG)', 'warning')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      showToast('A imagem deve ter no máximo 3MB', 'warning')
      return
    }
    setUploadingCapa(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${contextUserId}/capa.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
      // Cache-bust pra atualizar preview imediatamente
      const url = `${urlData.publicUrl}?t=${Date.now()}`
      setLandingConfig(prev => ({ ...prev, fotoCapaUrl: url }))
      showToast('Foto de capa carregada! Lembre de salvar.', 'success')
    } catch (err) {
      console.error('Erro upload capa:', err)
      showToast('Erro ao enviar foto: ' + err.message, 'error')
    } finally {
      setUploadingCapa(false)
    }
  }

  const removerCapa = () => {
    setLandingConfig(prev => ({ ...prev, fotoCapaUrl: '' }))
    showToast('Foto removida. Lembre de salvar.', 'info')
  }

  const copiarLinkLanding = () => {
    const link = `${window.location.origin}/${landingConfig.slug}`
    navigator.clipboard.writeText(link).then(() => {
      showToast('Link copiado!', 'success')
    }).catch(() => showToast('Erro ao copiar', 'error'))
  }

  const abrirLandingPreview = () => {
    if (!landingConfig.slug) {
      showToast('Defina um endereço primeiro', 'warning')
      return
    }
    window.open(`${window.location.origin}/${landingConfig.slug}`, '_blank')
  }

  const CORES_PRESET = ['#344848', '#007bff', '#16a34a', '#dc2626', '#f59e0b', '#7c3aed', '#0891b2', '#db2777']

  // Slugs que conflitam com rotas do sistema - nao podem ser usados
  const SLUGS_RESERVADOS = new Set([
    'login', 'signup', 'logout', 'reset-password', 'reset',
    'pagar', 'portal', 'agendar', 'academia', 'app', 'admin', 'api',
    'www', 'assets', 'static', 'public', 'img', 'images', 'css', 'js',
    'help', 'ajuda', 'home', 'sobre', 'about', 'contact', 'contato',
    'upgrade', 'success', 'onboarding', 'configuracao', 'dashboard',
    'mensalli', 'suporte', 'termos', 'privacidade', 'financeiro',
    'clientes', 'horarios', 'relatorios', 'whatsapp', 'crm', 'avisos',
    'null', 'undefined', 'index', 'root'
  ])

  const slugEhReservado = (slug) => {
    const s = String(slug || '').trim().toLowerCase()
    return SLUGS_RESERVADOS.has(s)
  }

  const LABELS_SECAO = {
    sobre: 'Sobre nós',
    planos: 'Planos',
    galeria: 'Galeria de fotos',
    horarios: 'Horários das aulas',
    depoimentos: 'Depoimentos',
    faq: 'Perguntas frequentes',
    mapa: 'Como chegar (mapa)'
  }

  const ORDEM_PADRAO = ['sobre', 'planos', 'galeria', 'horarios', 'depoimentos', 'faq', 'mapa']

  // Carrega dados reais pro preview quando abre a aba landing
  useEffect(() => {
    if (abaAtiva !== 'landing' || !contextUserId || previewDadosCarregados) return
    let cancelado = false
    async function carregarDadosPreview() {
      try {
        const [planosR, aulasR, npsR] = await Promise.all([
          supabase.from('planos').select('nome, valor, ciclo, descricao')
            .eq('user_id', contextUserId).eq('ativo', true).order('valor', { ascending: true }),
          supabase.from('aulas').select('dia_semana, horario, descricao')
            .eq('user_id', contextUserId).eq('ativo', true)
            .order('dia_semana', { ascending: true }).order('horario', { ascending: true }),
          supabase.from('nps_respostas').select('nota, comentario, respondido_em, devedor_id')
            .eq('user_id', contextUserId).gte('nota', 9).not('comentario', 'is', null)
            .order('respondido_em', { ascending: false }).limit(12)
        ])
        if (cancelado) return
        setPreviewPlanos(planosR.data || [])
        setPreviewAulas(aulasR.data || [])

        // Busca nomes dos devedores pra mascarar
        const npsValidos = (npsR.data || []).filter(n => n.comentario && String(n.comentario).trim().length >= 10)
        const idsDev = [...new Set(npsValidos.map(n => n.devedor_id).filter(Boolean))]
        let nomesPorId = {}
        if (idsDev.length > 0) {
          const { data: devs } = await supabase.from('devedores').select('id, nome').in('id', idsDev)
          for (const d of devs || []) nomesPorId[d.id] = d.nome
        }
        if (cancelado) return
        setPreviewNpsDepoimentos(npsValidos.map(n => ({
          nota: n.nota,
          comentario: n.comentario,
          nome: mascararNomePreview(nomesPorId[n.devedor_id] || null)
        })))
        setPreviewDadosCarregados(true)
      } catch (err) {
        console.error('Erro ao carregar dados de preview:', err)
      }
    }
    carregarDadosPreview()
    return () => { cancelado = true }
  }, [abaAtiva, contextUserId, previewDadosCarregados])

  // Monta o objeto previewData (formato igual ao que a edge function retorna)
  // useMemo pra nao recalcular a cada render desnecessario
  const landingPreviewData = useMemo(() => {
    const manuais = (landingConfig.depoimentosManuais || [])
      .filter(d => d && (d.comentario || '').trim().length >= 5)
      .map(d => ({
        nota: d.nota || 10,
        comentario: String(d.comentario).trim(),
        nome: String(d.nome || 'Aluno(a)').trim()
      }))
    const depoimentos = [...manuais, ...previewNpsDepoimentos].slice(0, 8)

    const enderecoCompleto = [
      dadosEmpresa.endereco,
      dadosEmpresa.numero,
      dadosEmpresa.bairro,
      dadosEmpresa.cidade,
      dadosEmpresa.estado
    ].filter(Boolean).join(', ')

    return {
      empresa: {
        nome_empresa: dadosEmpresa.nomeEmpresa || 'Sua Academia',
        logo_url: dadosEmpresa.logoUrl,
        foto_capa_url: landingConfig.fotoCapaUrl,
        descricao: landingConfig.descricao,
        cor_primaria: landingConfig.corPrimaria || '#344848',
        telefone: dadosEmpresa.telefone,
        instagram_url: landingConfig.instagramUrl,
        facebook_url: landingConfig.facebookUrl,
        tiktok_url: landingConfig.tiktokUrl,
        rodape_texto: landingConfig.rodapeTexto,
        site: dadosEmpresa.site,
        endereco_completo: enderecoCompleto,
        cidade: dadosEmpresa.cidade,
        estado: dadosEmpresa.estado,
        agendamento_slug: agendamentoConfig.slug,
        agendamento_ativo: agendamentoConfig.ativo,
        hero_titulo: landingConfig.heroTitulo,
        hero_subtitulo: landingConfig.heroSubtitulo,
        cta_texto: landingConfig.ctaTexto,
        cta_final_titulo: landingConfig.ctaFinalTitulo,
        cta_final_subtitulo: landingConfig.ctaFinalSubtitulo,
        galeria: landingConfig.galeria || [],
        faq: (landingConfig.faq || []).filter(f => f && (f.pergunta || '').trim() && (f.resposta || '').trim()),
        ordem_secoes: landingConfig.ordemSecoes || ORDEM_PADRAO,
        mostrar_depoimentos: landingConfig.mostrarDepoimentos,
        mostrar_planos: landingConfig.mostrarPlanos,
        mostrar_horarios: landingConfig.mostrarHorarios,
        mostrar_galeria: landingConfig.mostrarGaleria,
        mostrar_faq: landingConfig.mostrarFaq,
        mostrar_cta_whatsapp: landingConfig.mostrarCtaWhatsapp,
        mostrar_cta_agendar: landingConfig.mostrarCtaAgendar,
        mostrar_cta_final: landingConfig.mostrarCtaFinal,
        cta_final_mostrar_botao: landingConfig.ctaFinalMostrarBotao
      },
      planos: previewPlanos,
      aulas: previewAulas,
      depoimentos
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landingConfig, dadosEmpresa, agendamentoConfig, previewPlanos, previewAulas, previewNpsDepoimentos])

  const moverSecao = (idx, delta) => {
    const novo = [...(landingConfig.ordemSecoes || ORDEM_PADRAO)]
    const destino = idx + delta
    if (destino < 0 || destino >= novo.length) return
    ;[novo[idx], novo[destino]] = [novo[destino], novo[idx]]
    setLandingConfig(prev => ({ ...prev, ordemSecoes: novo }))
  }

  // Galeria
  const handleGaleriaUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Selecione uma imagem', 'warning')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      showToast('Máximo 3MB por imagem', 'warning')
      return
    }
    if ((landingConfig.galeria || []).length >= 6) {
      showToast('Máximo de 6 fotos na galeria', 'warning')
      return
    }
    setUploadingGaleria(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${contextUserId}/galeria-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('logos').upload(fileName, file, { upsert: false })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
      setLandingConfig(prev => ({ ...prev, galeria: [...(prev.galeria || []), urlData.publicUrl] }))
      showToast('Foto adicionada! Lembre de salvar.', 'success')
    } catch (err) {
      console.error('Erro upload galeria:', err)
      showToast('Erro ao enviar foto: ' + err.message, 'error')
    } finally {
      setUploadingGaleria(false)
      // reset input pra permitir re-upload do mesmo arquivo
      if (e.target) e.target.value = ''
    }
  }

  const removerFotoGaleria = (idx) => {
    setLandingConfig(prev => ({
      ...prev,
      galeria: (prev.galeria || []).filter((_, i) => i !== idx)
    }))
  }

  // FAQ
  const addFaq = () => {
    setLandingConfig(prev => ({
      ...prev,
      faq: [...(prev.faq || []), { pergunta: '', resposta: '' }]
    }))
  }
  const atualizarFaq = (idx, campo, valor) => {
    setLandingConfig(prev => ({
      ...prev,
      faq: (prev.faq || []).map((f, i) => i === idx ? { ...f, [campo]: valor } : f)
    }))
  }
  const removerFaq = (idx) => {
    setLandingConfig(prev => ({
      ...prev,
      faq: (prev.faq || []).filter((_, i) => i !== idx)
    }))
  }

  // Depoimentos manuais
  const addDepoimento = () => {
    setLandingConfig(prev => ({
      ...prev,
      depoimentosManuais: [...(prev.depoimentosManuais || []), { nome: '', comentario: '', nota: 10 }]
    }))
  }
  const atualizarDepoimento = (idx, campo, valor) => {
    setLandingConfig(prev => ({
      ...prev,
      depoimentosManuais: (prev.depoimentosManuais || []).map((d, i) => i === idx ? { ...d, [campo]: valor } : d)
    }))
  }
  const removerDepoimento = (idx) => {
    setLandingConfig(prev => ({
      ...prev,
      depoimentosManuais: (prev.depoimentosManuais || []).filter((_, i) => i !== idx)
    }))
  }

  const renderLanding = () => {
    if (isLocked('pro')) {
      return (
        <div style={{
          backgroundColor: 'white', borderRadius: '12px', padding: '60px 40px',
          textAlign: 'center', border: '1px solid #e5e7eb', maxWidth: '500px', margin: '40px auto'
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#fff3e0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto'
          }}>
            <Icon icon="mdi:lock" width="32" style={{ color: '#ff9800' }} />
          </div>
          <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: '600', color: '#1a1a1a' }}>
            Seu site profissional
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: '15px', color: '#666', lineHeight: '1.6' }}>
            Tenha um site pronto pra sua empresa com planos, horários, depoimentos e botão direto pro WhatsApp.
            Disponível no plano <strong>Pro</strong>.
          </p>
          <button onClick={() => setAbaAtiva('upgrade')}
            style={{
              padding: '12px 32px', backgroundColor: '#ff9800', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer'
            }}>
            Fazer Upgrade
          </button>
        </div>
      )
    }

    const formContent = (
      <div style={{ maxWidth: '680px', width: '100%', boxSizing: 'border-box' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '600', color: '#344848' }}>
          Meu site
        </h3>
        <p style={{ margin: '0 0 24px', fontSize: '13px', color: '#888' }}>
          Monte o site da sua empresa: destaque, planos, horários, depoimentos, mapa e botão direto pro WhatsApp.
        </p>

        <CollapseCard
          open={landingSecoesAbertas.iniciais}
          onToggle={() => toggleLandingSecao('iniciais')}
          title="Configurações iniciais"
          icon="mdi:cog-outline">
        {/* Toggle Ativar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: isMobile ? '12px' : '16px',
          backgroundColor: landingConfig.ativo ? '#f0fdf4' : '#f9fafb',
          borderRadius: '10px', marginBottom: '20px',
          border: landingConfig.ativo ? '1px solid #bbf7d0' : '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', minWidth: 0, flex: 1 }}>
            <Icon icon={landingConfig.ativo ? 'mdi:web-check' : 'mdi:web-off'} width={isMobile ? 20 : 24}
              style={{ color: landingConfig.ativo ? '#16a34a' : '#999', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? '13px' : '14px', fontWeight: '600', color: '#1a1a1a' }}>
                {landingConfig.ativo ? 'Site ativo' : 'Site desativado'}
              </div>
              <div style={{ fontSize: '12px', color: '#888' }}>
                {landingConfig.ativo ? 'Seu site está no ar' : 'Ninguém consegue acessar ainda'}
              </div>
            </div>
          </div>
          <div
            onClick={() => setLandingConfig(prev => ({ ...prev, ativo: !prev.ativo }))}
            style={{
              width: '44px', minWidth: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer',
              backgroundColor: landingConfig.ativo ? '#16a34a' : '#d1d5db',
              position: 'relative', transition: 'background-color 0.2s', marginLeft: '8px'
            }}
          >
            <div style={{
              width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white',
              position: 'absolute', top: '2px',
              left: landingConfig.ativo ? '22px' : '2px',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
          </div>
        </div>

        {/* Slug */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Endereço da página
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <div style={{
              flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
              border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f9fafb'
            }}>
              <span style={{ padding: '10px 0 10px 12px', fontSize: '13px', color: '#888', whiteSpace: 'nowrap' }}>
                mensalli.com.br/
              </span>
              <input
                type="text"
                value={landingConfig.slug}
                onChange={e => setLandingConfig(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                placeholder="meunegocio"
                style={{
                  flex: 1, minWidth: 0, padding: '10px 12px 10px 0', border: 'none', outline: 'none',
                  fontSize: '14px', fontWeight: '500', backgroundColor: 'transparent', boxSizing: 'border-box'
                }}
              />
            </div>
            <button
              onClick={gerarLandingSlug}
              style={{
                padding: '10px 14px', backgroundColor: '#f3f4f6', border: '1px solid #ddd',
                borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '12px', fontWeight: '600', color: '#555', flexShrink: 0
              }}
            >
              <Icon icon="mdi:auto-fix" width="16" />
              Gerar
            </button>
          </div>
          {slugEhReservado(landingConfig.slug) && (
            <div style={{
              marginTop: '8px', padding: '8px 12px', backgroundColor: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px',
              color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px'
            }}>
              <Icon icon="mdi:alert-circle-outline" width="16" />
              "{landingConfig.slug}" é uma palavra reservada do sistema. Escolha outro endereço.
            </div>
          )}
          {landingConfig.slug && !slugEhReservado(landingConfig.slug) && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <code style={{
                flex: 1, minWidth: 0, fontSize: isMobile ? '11px' : '12px', padding: '8px 12px', backgroundColor: '#f1f5f9',
                borderRadius: '6px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', display: 'block', boxSizing: 'border-box',
                ...(isMobile ? { width: '100%' } : {})
              }}>
                {window.location.origin}/{landingConfig.slug}
              </code>
              <div style={{ display: 'flex', gap: '6px', ...(isMobile ? { width: '100%' } : {}) }}>
                <button onClick={copiarLinkLanding}
                  style={{
                    padding: '8px 12px', backgroundColor: '#344848', color: 'white',
                    border: 'none', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px',
                    flex: isMobile ? 1 : 'none', justifyContent: 'center'
                  }}>
                  <Icon icon="mdi:content-copy" width="14" /> Copiar
                </button>
                <button onClick={abrirLandingPreview}
                  style={{
                    padding: '8px 12px', backgroundColor: 'white', color: '#344848',
                    border: '1px solid #344848', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px',
                    flex: isMobile ? 1 : 'none', justifyContent: 'center'
                  }}>
                  <Icon icon="mdi:open-in-new" width="14" /> Abrir
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Cor primária */}
        <div style={{ marginBottom: '0' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Cor principal
          </label>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px' }}>
            Define a cor dos botões, títulos de seção e do bloco "Bora começar?".
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {CORES_PRESET.map(c => (
              <div key={c}
                onClick={() => setLandingConfig(prev => ({ ...prev, corPrimaria: c }))}
                style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  backgroundColor: c, cursor: 'pointer',
                  border: landingConfig.corPrimaria === c ? '3px solid #1a1a1a' : '3px solid transparent',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                }} />
            ))}
            <input
              type="color"
              value={landingConfig.corPrimaria}
              onChange={e => setLandingConfig(prev => ({ ...prev, corPrimaria: e.target.value }))}
              style={{ width: '40px', height: '40px', border: 'none', padding: 0, cursor: 'pointer', backgroundColor: 'transparent' }}
            />
          </div>
        </div>
        </CollapseCard>

        <CollapseCard
          open={landingSecoesAbertas.topo}
          onToggle={() => toggleLandingSecao('topo')}
          title="Topo da página (hero)"
          icon="mdi:view-headline">
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#888' }}>
          Título, subtítulo, texto do botão e quais CTAs aparecem no topo da página.
        </p>

        {/* HERO: Título, subtítulo e CTA customizáveis */}
        <div style={{ marginBottom: '20px' }}>

          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
            Título do hero
          </label>
          <input
            type="text"
            value={landingConfig.heroTitulo}
            onChange={e => setLandingConfig(prev => ({ ...prev, heroTitulo: e.target.value.slice(0, 80) }))}
            placeholder="Ex: Transforme seu corpo em 90 dias"
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #ddd',
              borderRadius: '8px', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box'
            }}
          />

          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
            Subtítulo do hero
          </label>
          <input
            type="text"
            value={landingConfig.heroSubtitulo}
            onChange={e => setLandingConfig(prev => ({ ...prev, heroSubtitulo: e.target.value.slice(0, 160) }))}
            placeholder="Ex: Treinos funcionais no coração de Goiânia"
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #ddd',
              borderRadius: '8px', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box'
            }}
          />

          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
            Texto do botão principal
          </label>
          <input
            type="text"
            value={landingConfig.ctaTexto}
            onChange={e => setLandingConfig(prev => ({ ...prev, ctaTexto: e.target.value.slice(0, 40) }))}
            placeholder="Ex: Quero minha aula grátis"
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #ddd',
              borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box'
            }}
          />
          <div style={{ fontSize: '11px', color: '#999', marginTop: '4px', marginBottom: '14px' }}>
            Padrão: "Agendar experimental"
          </div>

          {/* Toggles dos CTAs do hero */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
              Botões exibidos no hero
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', border: '1px solid #eee', borderRadius: '8px',
                cursor: 'pointer', backgroundColor: landingConfig.mostrarCtaWhatsapp ? '#f0fdf4' : '#fff'
              }}>
                <input
                  type="checkbox"
                  checked={landingConfig.mostrarCtaWhatsapp}
                  onChange={e => setLandingConfig(prev => ({ ...prev, mostrarCtaWhatsapp: e.target.checked }))}
                />
                <Icon icon="mdi:whatsapp" width="18" style={{ color: '#25d366' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: '#333', fontWeight: '500' }}>Botão WhatsApp</div>
                  <div style={{ fontSize: '11px', color: '#999' }}>Exibe o botão verde "Agendar experimental" no topo</div>
                </div>
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', border: '1px solid #eee', borderRadius: '8px',
                cursor: 'pointer', backgroundColor: landingConfig.mostrarCtaAgendar ? '#f0fdf4' : '#fff'
              }}>
                <input
                  type="checkbox"
                  checked={landingConfig.mostrarCtaAgendar}
                  onChange={e => setLandingConfig(prev => ({ ...prev, mostrarCtaAgendar: e.target.checked }))}
                />
                <Icon icon="mdi:calendar-check" width="18" style={{ color: '#666' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: '#333', fontWeight: '500' }}>Botão "Agendar online"</div>
                  <div style={{ fontSize: '11px', color: '#999' }}>Só aparece se o agendamento online estiver ativo</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Foto de capa (banner do hero) */}
        <div style={{ marginBottom: '0', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Foto de capa (banner do topo)
          </label>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px' }}>
            Recomendado: paisagem, 1600×900, até 3MB. Se não enviar, usa a cor principal como fundo.
          </p>
          {landingConfig.fotoCapaUrl ? (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <img src={landingConfig.fotoCapaUrl} alt="Capa"
                style={{ width: '120px', height: '68px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #ddd' }} />
              <button onClick={removerCapa}
                style={{
                  padding: '8px 14px', backgroundColor: '#fef2f2', color: '#dc2626',
                  border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px',
                  fontWeight: '600', cursor: 'pointer'
                }}>
                Remover
              </button>
            </div>
          ) : (
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '10px 16px', backgroundColor: '#f3f4f6', border: '1px dashed #aaa',
              borderRadius: '8px', cursor: uploadingCapa ? 'not-allowed' : 'pointer',
              fontSize: '13px', fontWeight: '600', color: '#555'
            }}>
              <Icon icon={uploadingCapa ? 'eos-icons:loading' : 'mdi:image-plus'} width="18" />
              {uploadingCapa ? 'Enviando...' : 'Enviar foto de capa'}
              <input type="file" accept="image/*" onChange={handleCapaUpload} disabled={uploadingCapa} style={{ display: 'none' }} />
            </label>
          )}
        </div>

        </CollapseCard>

        <CollapseCard
          open={landingSecoesAbertas.sobre}
          onToggle={() => toggleLandingSecao('sobre')}
          title="Sobre a academia"
          icon="mdi:information-outline">
        {/* Descrição */}
        <div style={{ marginBottom: '0' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Texto de apresentação
          </label>
          <textarea
            value={landingConfig.descricao}
            onChange={e => setLandingConfig(prev => ({ ...prev, descricao: e.target.value.slice(0, 500) }))}
            rows={4}
            placeholder="Conte em poucas palavras quem é sua academia, modalidades, diferenciais..."
            style={{
              width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd',
              fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
            }}
          />
          <div style={{ fontSize: '11px', color: '#999', textAlign: 'right', marginTop: '4px' }}>
            {(landingConfig.descricao || '').length}/500
          </div>
        </div>

        </CollapseCard>

        <CollapseCard
          open={landingSecoesAbertas.galeria}
          onToggle={() => toggleLandingSecao('galeria')}
          title="Galeria de fotos"
          icon="mdi:image-multiple-outline">
        {/* GALERIA DE FOTOS */}
        <div style={{ marginBottom: '0' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Até 6 fotos
          </label>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px' }}>
            Mostre o espaço da sua academia. Fotos 4:3 ficam melhores.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            gap: '10px'
          }}>
            {(landingConfig.galeria || []).map((url, i) => (
              <div key={i} style={{
                position: 'relative', aspectRatio: '4/3', borderRadius: '8px',
                overflow: 'hidden', border: '1px solid #ddd'
              }}>
                <img src={url} alt={`Foto ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  onClick={() => removerFotoGaleria(i)}
                  style={{
                    position: 'absolute', top: '6px', right: '6px',
                    width: '26px', height: '26px', borderRadius: '50%',
                    backgroundColor: 'rgba(220,38,38,0.92)', color: 'white',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                  <Icon icon="mdi:close" width="16" />
                </button>
              </div>
            ))}
            {(landingConfig.galeria || []).length < 6 && (
              <label style={{
                aspectRatio: '4/3', borderRadius: '8px', border: '2px dashed #aaa',
                backgroundColor: '#fafafa', cursor: uploadingGaleria ? 'not-allowed' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '4px', color: '#888', fontSize: '12px', fontWeight: '600'
              }}>
                <Icon icon={uploadingGaleria ? 'eos-icons:loading' : 'mdi:image-plus'} width="24" />
                {uploadingGaleria ? 'Enviando...' : 'Adicionar foto'}
                <input type="file" accept="image/*" onChange={handleGaleriaUpload} disabled={uploadingGaleria} style={{ display: 'none' }} />
              </label>
            )}
          </div>
        </div>

        </CollapseCard>

        <CollapseCard
          open={landingSecoesAbertas.depoimentos}
          onToggle={() => toggleLandingSecao('depoimentos')}
          title="Depoimentos"
          icon="mdi:star-outline">
        {/* DEPOIMENTOS MANUAIS */}
        <div style={{ marginBottom: '0' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Depoimentos manuais
          </label>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px' }}>
            Adicione depoimentos de alunos diretamente. Eles aparecem <strong>antes</strong> dos depoimentos automáticos vindos do NPS.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(landingConfig.depoimentosManuais || []).map((d, i) => (
              <div key={i} style={{
                padding: '14px', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fafafa'
              }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={d.nome || ''}
                    onChange={e => atualizarDepoimento(i, 'nome', e.target.value)}
                    placeholder="Nome do aluno"
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                  />
                  <button onClick={() => removerDepoimento(i)}
                    style={{
                      padding: '8px 10px', backgroundColor: '#fef2f2', color: '#dc2626',
                      border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center'
                    }}>
                    <Icon icon="mdi:delete-outline" width="16" />
                  </button>
                </div>
                <textarea
                  value={d.comentario || ''}
                  onChange={e => atualizarDepoimento(i, 'comentario', e.target.value.slice(0, 280))}
                  rows={2}
                  placeholder="O que o aluno disse sobre a academia..."
                  style={{
                    width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px',
                    fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
                  }}
                />
              </div>
            ))}
            <button onClick={addDepoimento}
              style={{
                padding: '10px', backgroundColor: 'white', border: '1px dashed #aaa',
                borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}>
              <Icon icon="mdi:plus" width="16" /> Adicionar depoimento
            </button>
          </div>
        </div>

        </CollapseCard>

        <CollapseCard
          open={landingSecoesAbertas.faq}
          onToggle={() => toggleLandingSecao('faq')}
          title="Perguntas frequentes (FAQ)"
          icon="mdi:help-circle-outline">
        {/* FAQ */}
        <div style={{ marginBottom: '0' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Lista de perguntas
          </label>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px' }}>
            Responda dúvidas comuns: contrato, experimental, horários, valores...
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(landingConfig.faq || []).map((f, i) => (
              <div key={i} style={{
                padding: '14px', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fafafa'
              }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={f.pergunta || ''}
                    onChange={e => atualizarFaq(i, 'pergunta', e.target.value.slice(0, 140))}
                    placeholder="Pergunta"
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '600' }}
                  />
                  <button onClick={() => removerFaq(i)}
                    style={{
                      padding: '8px 10px', backgroundColor: '#fef2f2', color: '#dc2626',
                      border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center'
                    }}>
                    <Icon icon="mdi:delete-outline" width="16" />
                  </button>
                </div>
                <textarea
                  value={f.resposta || ''}
                  onChange={e => atualizarFaq(i, 'resposta', e.target.value.slice(0, 400))}
                  rows={2}
                  placeholder="Resposta"
                  style={{
                    width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px',
                    fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
                  }}
                />
              </div>
            ))}
            <button onClick={addFaq}
              style={{
                padding: '10px', backgroundColor: 'white', border: '1px dashed #aaa',
                borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}>
              <Icon icon="mdi:plus" width="16" /> Adicionar pergunta
            </button>
          </div>
        </div>

        </CollapseCard>

        <CollapseCard
          open={landingSecoesAbertas.ctaFinal}
          onToggle={() => toggleLandingSecao('ctaFinal')}
          title={'Seção "Bora começar?"'}
          icon="mdi:bullhorn-outline">
        <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#888' }}>
          O bloco grande colorido com chamada final. O texto do botão é o mesmo do hero.
        </p>

          {/* Toggles de visibilidade */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', border: '1px solid #eee', borderRadius: '8px',
              cursor: 'pointer',
              backgroundColor: landingConfig.mostrarCtaFinal ? '#f0fdf4' : '#fff'
            }}>
              <input
                type="checkbox"
                checked={landingConfig.mostrarCtaFinal}
                onChange={e => setLandingConfig(prev => ({ ...prev, mostrarCtaFinal: e.target.checked }))}
              />
              <Icon icon="mdi:bullhorn" width="18" style={{ color: landingConfig.corPrimaria }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: '#333', fontWeight: '500' }}>Mostrar seção inteira</div>
                <div style={{ fontSize: '11px', color: '#999' }}>Título + subtítulo + botão</div>
              </div>
            </label>

            <label style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', border: '1px solid #eee', borderRadius: '8px',
              cursor: landingConfig.mostrarCtaFinal ? 'pointer' : 'not-allowed',
              opacity: landingConfig.mostrarCtaFinal ? 1 : 0.5,
              backgroundColor: (landingConfig.mostrarCtaFinal && landingConfig.ctaFinalMostrarBotao) ? '#f0fdf4' : '#fff'
            }}>
              <input
                type="checkbox"
                disabled={!landingConfig.mostrarCtaFinal}
                checked={landingConfig.ctaFinalMostrarBotao}
                onChange={e => setLandingConfig(prev => ({ ...prev, ctaFinalMostrarBotao: e.target.checked }))}
              />
              <Icon icon="mdi:whatsapp" width="18" style={{ color: '#25d366' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: '#333', fontWeight: '500' }}>Mostrar botão WhatsApp nessa seção</div>
                <div style={{ fontSize: '11px', color: '#999' }}>Desmarque se quer só o texto (sem CTA clicável)</div>
              </div>
            </label>
          </div>

          {/* Título */}
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
            Título
          </label>
          <input
            type="text"
            value={landingConfig.ctaFinalTitulo}
            onChange={e => setLandingConfig(prev => ({ ...prev, ctaFinalTitulo: e.target.value.slice(0, 60) }))}
            placeholder="Ex: Pronto pra começar?"
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #ddd',
              borderRadius: '8px', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box'
            }}
          />

          {/* Subtítulo */}
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
            Subtítulo
          </label>
          <textarea
            value={landingConfig.ctaFinalSubtitulo}
            onChange={e => setLandingConfig(prev => ({ ...prev, ctaFinalSubtitulo: e.target.value.slice(0, 200) }))}
            rows={2}
            placeholder="Ex: Chama a gente no WhatsApp e agende sua aula experimental gratuita."
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #ddd',
              borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit',
              resize: 'vertical', boxSizing: 'border-box'
            }}
          />
          <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
            Padrão: "Bora começar?" / "Sua primeira aula experimental é por nossa conta."
          </div>

        </CollapseCard>

        <CollapseCard
          open={landingSecoesAbertas.rodape}
          onToggle={() => toggleLandingSecao('rodape')}
          title="Rodapé da página"
          icon="mdi:page-layout-footer">
        <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#888' }}>
          Redes sociais e texto extra que aparecem no final da página.
        </p>

          {/* Redes sociais */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
              Redes sociais (aparecem no rodapé)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="mdi:instagram" width="18" style={{ color: '#E4405F', flexShrink: 0 }} />
                <input
                  type="url"
                  value={landingConfig.instagramUrl}
                  onChange={e => setLandingConfig(prev => ({ ...prev, instagramUrl: e.target.value }))}
                  placeholder="https://instagram.com/suaempresa"
                  style={{
                    flex: 1, padding: '9px 12px', border: '1px solid #ddd', borderRadius: '8px',
                    fontSize: '13px', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="mdi:facebook" width="18" style={{ color: '#1877F2', flexShrink: 0 }} />
                <input
                  type="url"
                  value={landingConfig.facebookUrl}
                  onChange={e => setLandingConfig(prev => ({ ...prev, facebookUrl: e.target.value }))}
                  placeholder="https://facebook.com/suaempresa"
                  style={{
                    flex: 1, padding: '9px 12px', border: '1px solid #ddd', borderRadius: '8px',
                    fontSize: '13px', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="simple-icons:tiktok" width="16" style={{ color: '#000', flexShrink: 0 }} />
                <input
                  type="url"
                  value={landingConfig.tiktokUrl}
                  onChange={e => setLandingConfig(prev => ({ ...prev, tiktokUrl: e.target.value }))}
                  placeholder="https://tiktok.com/@suaempresa"
                  style={{
                    flex: 1, padding: '9px 12px', border: '1px solid #ddd', borderRadius: '8px',
                    fontSize: '13px', boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Texto extra do rodapé */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
              Texto extra no rodapé
            </label>
            <p style={{ fontSize: '11px', color: '#888', margin: '0 0 6px' }}>
              Ex: CNPJ, endereço completo, horário de funcionamento. Aparece acima do copyright.
            </p>
            <textarea
              value={landingConfig.rodapeTexto}
              onChange={e => setLandingConfig(prev => ({ ...prev, rodapeTexto: e.target.value.slice(0, 300) }))}
              rows={3}
              placeholder="Ex: CNPJ 12.345.678/0001-00 — Rua X, 123, Centro — Funcionamento seg-sex 6h às 22h"
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
                fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
              }}
            />
            <div style={{ fontSize: '11px', color: '#999', textAlign: 'right', marginTop: '4px' }}>
              {(landingConfig.rodapeTexto || '').length}/300
            </div>
          </div>

        </CollapseCard>

        <CollapseCard
          open={landingSecoesAbertas.avancado}
          onToggle={() => toggleLandingSecao('avancado')}
          title="Ordem e visibilidade das seções"
          icon="mdi:sort">
        {/* ORDEM DAS SEÇÕES */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
            Ordem das seções
          </label>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px' }}>
            Reordene as seções da página. Use as setas para mover cada uma pra cima ou pra baixo.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(landingConfig.ordemSecoes || ORDEM_PADRAO).map((secao, idx) => (
              <div key={secao} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 14px', backgroundColor: 'white',
                border: '1px solid #e5e7eb', borderRadius: '8px'
              }}>
                <span style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  backgroundColor: '#f3f4f6', color: '#555',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: '700', flexShrink: 0
                }}>
                  {idx + 1}
                </span>
                <span style={{ flex: 1, fontSize: '14px', color: '#333' }}>
                  {LABELS_SECAO[secao] || secao}
                </span>
                <button
                  onClick={() => moverSecao(idx, -1)}
                  disabled={idx === 0}
                  title="Mover pra cima"
                  style={{
                    width: '30px', height: '30px', padding: 0, backgroundColor: 'white',
                    border: '1px solid #d1d5db', borderRadius: '6px',
                    cursor: idx === 0 ? 'not-allowed' : 'pointer',
                    opacity: idx === 0 ? 0.3 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#555', fontSize: '18px', lineHeight: 1
                  }}>
                  ▲
                </button>
                <button
                  onClick={() => moverSecao(idx, 1)}
                  disabled={idx === (landingConfig.ordemSecoes || ORDEM_PADRAO).length - 1}
                  title="Mover pra baixo"
                  style={{
                    width: '30px', height: '30px', padding: 0, backgroundColor: 'white',
                    border: '1px solid #d1d5db', borderRadius: '6px',
                    cursor: idx === (landingConfig.ordemSecoes || ORDEM_PADRAO).length - 1 ? 'not-allowed' : 'pointer',
                    opacity: idx === (landingConfig.ordemSecoes || ORDEM_PADRAO).length - 1 ? 0.3 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#555', fontSize: '18px', lineHeight: 1
                  }}>
                  ▼
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Seções visíveis */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '10px' }}>
            Seções visíveis na página
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { key: 'mostrarPlanos', label: 'Mostrar planos', icon: 'mdi:package-variant-closed' },
              { key: 'mostrarGaleria', label: 'Mostrar galeria de fotos', icon: 'mdi:image-multiple' },
              { key: 'mostrarHorarios', label: 'Mostrar horários das aulas', icon: 'mdi:calendar-clock' },
              { key: 'mostrarDepoimentos', label: 'Mostrar depoimentos', icon: 'mdi:star' },
              { key: 'mostrarFaq', label: 'Mostrar FAQ', icon: 'mdi:help-circle-outline' }
            ].map(opt => (
              <label key={opt.key} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', border: '1px solid #eee', borderRadius: '8px',
                cursor: 'pointer', backgroundColor: landingConfig[opt.key] ? '#f0fdf4' : '#fafafa'
              }}>
                <input
                  type="checkbox"
                  checked={landingConfig[opt.key]}
                  onChange={e => setLandingConfig(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                />
                <Icon icon={opt.icon} width="18" style={{ color: '#666' }} />
                <span style={{ fontSize: '14px', color: '#333' }}>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        </CollapseCard>

        {/* Botão salvar */}
        <button
          onClick={salvarLanding}
          disabled={salvandoLanding}
          style={{
            padding: '12px 28px',
            backgroundColor: salvandoLanding ? '#ccc' : '#344848',
            color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '14px', fontWeight: '600',
            cursor: salvandoLanding ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
            width: isMobile ? '100%' : 'auto', justifyContent: 'center'
          }}
        >
          {salvandoLanding ? (
            <><Icon icon="eos-icons:loading" width="18" /> Salvando...</>
          ) : (
            <><Icon icon="mdi:check" width="18" /> Salvar site</>
          )}
        </button>
      </div>
    )

    // Mobile: só o form (preview seria esmagado). Desktop: 2 colunas.
    if (isMobile || isTablet) {
      return formContent
    }

    return (
      <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', width: '100%' }}>
        {/* Form (lado esquerdo) */}
        <div style={{ flex: '0 0 680px', minWidth: 0 }}>
          {formContent}
        </div>

        {/* Preview (lado direito, sticky) */}
        <div style={{
          flex: 1,
          minWidth: 0,
          position: 'sticky',
          top: '20px',
          maxHeight: 'calc(100vh - 40px)'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '10px', padding: '0 4px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:eye-outline" width="18" style={{ color: '#666' }} />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#555' }}>
                Preview ao vivo
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#999' }}>
              atualiza enquanto você edita
            </span>
          </div>

          {/* Container que simula um browser com escala */}
          <div style={{
            width: '100%',
            height: 'calc(100vh - 100px)',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid #e5e7eb',
            boxShadow: '0 6px 24px rgba(0,0,0,0.08)',
            backgroundColor: '#f8f9fa',
            position: 'relative'
          }}>
            {/* Barra tipo browser */}
            <div style={{
              height: '28px',
              backgroundColor: '#f1f5f9',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              flexShrink: 0
            }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
              <div style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '10px',
                color: '#888',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                mensalli.com.br/{landingConfig.slug || 'meunegocio'}
              </div>
            </div>

            {/* Conteudo do preview (scroll interno) */}
            <div style={{
              height: 'calc(100% - 28px)',
              overflowY: 'auto',
              overflowX: 'hidden'
            }}>
              <Suspense fallback={
                <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
                  Carregando preview...
                </div>
              }>
                <LandingAcademia previewData={landingPreviewData} />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderAgendamento = () => {
    if (isLocked('premium')) {
      return (
        <div style={{
          backgroundColor: 'white', borderRadius: '12px', padding: '60px 40px',
          textAlign: 'center', border: '1px solid #e5e7eb', maxWidth: '500px', margin: '40px auto'
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#fff3e0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto'
          }}>
            <Icon icon="mdi:lock" width="32" style={{ color: '#ff9800' }} />
          </div>
          <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: '600', color: '#1a1a1a' }}>
            Agendamento Online
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: '15px', color: '#666', lineHeight: '1.6' }}>
            Permita que seus alunos agendem e cancelem aulas por um link público.
            Disponível no plano <strong>Premium</strong>.
          </p>
          <button onClick={() => setAbaAtiva('upgrade')}
            style={{
              padding: '12px 32px', backgroundColor: '#ff9800', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer'
            }}>
            Fazer Upgrade
          </button>
        </div>
      )
    }
    return (
    <div style={{ maxWidth: '600px', width: '100%', boxSizing: 'border-box' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '600', color: '#344848' }}>
        Agendamento Online
      </h3>
      <p style={{ margin: '0 0 24px', fontSize: '13px', color: '#888' }}>
        Permita que seus alunos agendem e cancelem aulas por um link público
      </p>

      {/* Toggle Ativar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: isMobile ? '12px' : '16px', backgroundColor: agendamentoConfig.ativo ? '#f0fdf4' : '#f9fafb',
        borderRadius: '10px', marginBottom: '20px',
        border: agendamentoConfig.ativo ? '1px solid #bbf7d0' : '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', minWidth: 0, flex: 1 }}>
          <Icon icon={agendamentoConfig.ativo ? 'mdi:calendar-check' : 'mdi:calendar-remove'} width={isMobile ? 20 : 24}
            style={{ color: agendamentoConfig.ativo ? '#16a34a' : '#999', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? '13px' : '14px', fontWeight: '600', color: '#1a1a1a' }}>
              {agendamentoConfig.ativo ? 'Agendamento ativo' : 'Agendamento desativado'}
            </div>
            <div style={{ fontSize: '12px', color: '#888' }}>
              {agendamentoConfig.ativo ? 'Alunos podem agendar pelo link' : 'Link de agendamento está offline'}
            </div>
          </div>
        </div>
        <div
          onClick={() => setAgendamentoConfig(prev => ({ ...prev, ativo: !prev.ativo }))}
          style={{
            width: '44px', minWidth: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer',
            backgroundColor: agendamentoConfig.ativo ? '#16a34a' : '#d1d5db',
            position: 'relative', transition: 'background-color 0.2s', marginLeft: '8px'
          }}
        >
          <div style={{
            width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white',
            position: 'absolute', top: '2px',
            left: agendamentoConfig.ativo ? '22px' : '2px',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
          }} />
        </div>
      </div>

      {/* Slug */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
          Link de agendamento
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <div style={{
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
            border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f9fafb'
          }}>
            <span style={{ padding: '10px 0 10px 12px', fontSize: '13px', color: '#888', whiteSpace: 'nowrap' }}>
              /agendar/
            </span>
            <input
              type="text"
              value={agendamentoConfig.slug}
              onChange={e => setAgendamentoConfig(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              placeholder="minha-empresa"
              style={{
                flex: 1, minWidth: 0, padding: '10px 12px 10px 0', border: 'none', outline: 'none',
                fontSize: '14px', fontWeight: '500', backgroundColor: 'transparent', boxSizing: 'border-box'
              }}
            />
          </div>
          <button
            onClick={gerarSlug}
            disabled={gerandoSlug}
            style={{
              padding: '10px 14px', backgroundColor: '#f3f4f6', border: '1px solid #ddd',
              borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '12px', fontWeight: '600', color: '#555', flexShrink: 0
            }}
          >
            <Icon icon="mdi:auto-fix" width="16" />
            {gerandoSlug ? '...' : 'Gerar'}
          </button>
        </div>
        {agendamentoConfig.slug && (
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <code style={{
              flex: 1, minWidth: 0, fontSize: isMobile ? '11px' : '12px', padding: '8px 12px', backgroundColor: '#f1f5f9',
              borderRadius: '6px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', display: 'block', boxSizing: 'border-box',
              ...(isMobile ? { width: '100%' } : {})
            }}>
              {window.location.origin}/agendar/{agendamentoConfig.slug}
            </code>
            <button
              onClick={copiarLinkAgendamento}
              style={{
                padding: '8px 12px', backgroundColor: '#344848', color: 'white',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px',
                flexShrink: 0, ...(isMobile ? { width: '100%', justifyContent: 'center' } : {})
              }}
            >
              <Icon icon="mdi:content-copy" width="14" />
              Copiar link
            </button>
          </div>
        )}
      </div>

      {/* Antecedência */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
          Prazo mínimo para cancelamento
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number"
            min="0"
            max="72"
            value={agendamentoConfig.antecedenciaHoras}
            onChange={e => setAgendamentoConfig(prev => ({ ...prev, antecedenciaHoras: parseInt(e.target.value) || 0 }))}
            style={{
              width: '80px', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
              fontSize: '16px', textAlign: 'center', boxSizing: 'border-box'
            }}
          />
          <span style={{ fontSize: '14px', color: '#555' }}>horas antes da aula</span>
        </div>
        <p style={{ fontSize: '12px', color: '#888', margin: '6px 0 0' }}>
          O aluno só pode cancelar se faltar mais que {agendamentoConfig.antecedenciaHoras}h para a aula
        </p>
      </div>

      {/* Botão Salvar */}
      <button
        onClick={salvarAgendamento}
        disabled={salvandoAgendamento}
        style={{
          padding: '12px 28px',
          backgroundColor: salvandoAgendamento ? '#ccc' : '#344848',
          color: 'white', border: 'none', borderRadius: '8px',
          fontSize: '14px', fontWeight: '600',
          cursor: salvandoAgendamento ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: '8px',
          width: isMobile ? '100%' : 'auto', justifyContent: 'center'
        }}
      >
        {salvandoAgendamento ? (
          <>
            <Icon icon="eos-icons:loading" width="18" />
            Salvando...
          </>
        ) : (
          <>
            <Icon icon="mdi:check" width="18" />
            Salvar configuração
          </>
        )}
      </button>

      {/* Info box */}
      <div style={{
        marginTop: '24px', padding: isMobile ? '12px' : '16px', backgroundColor: '#eef2ff',
        borderRadius: '10px', border: '1px solid #c7d2fe'
      }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Icon icon="mdi:information-outline" width="20" style={{ color: '#4338ca', flexShrink: 0, marginTop: '1px' }} />
          <div style={{ fontSize: '13px', color: '#4338ca', lineHeight: '1.5' }}>
            <strong>Como funciona:</strong> Crie as aulas na aba <strong>Horários → Agendamento</strong>,
            ative aqui e compartilhe o link. Alunos cadastrados se identificam pelo telefone.
            Novos alunos preenchem nome e telefone e entram como aula experimental.
          </div>
        </div>
      </div>
    </div>
    )
  }

  // ==========================================
  // MAIN RENDER
  // ==========================================

  // ==========================================
  // ANAMNESE - CAMPOS EXTRAS
  // ==========================================

  const TIPOS_CAMPO_EXTRA = [
    { value: 'texto', label: 'Texto curto' },
    { value: 'textarea', label: 'Texto longo' },
    { value: 'numero', label: 'Número' },
    { value: 'sim_nao', label: 'Sim/Não' },
    { value: 'select', label: 'Múltipla escolha' }
  ]

  const adicionarCampoExtra = () => {
    if (anamneseCamposExtras.length >= 10) {
      showToast('Máximo de 10 campos extras', 'warning')
      return
    }
    const novo = {
      id: `extra_${Date.now()}`,
      label: 'Nova pergunta',
      tipo: 'texto',
      opcoes: [],
      obrigatorio: false
    }
    setAnamneseCamposExtras([...anamneseCamposExtras, novo])
  }

  const removerCampoExtra = (id) => {
    setAnamneseCamposExtras(anamneseCamposExtras.filter(c => c.id !== id))
  }

  const atualizarCampoExtra = (id, patch) => {
    setAnamneseCamposExtras(anamneseCamposExtras.map(c =>
      c.id === id ? { ...c, ...patch } : c
    ))
  }

  const moverCampoExtra = (id, direcao) => {
    const idx = anamneseCamposExtras.findIndex(c => c.id === id)
    if (idx === -1) return
    const novoIdx = idx + direcao
    if (novoIdx < 0 || novoIdx >= anamneseCamposExtras.length) return
    const arr = [...anamneseCamposExtras]
    ;[arr[idx], arr[novoIdx]] = [arr[novoIdx], arr[idx]]
    setAnamneseCamposExtras(arr)
  }

  const salvarAnamneseCamposExtras = async () => {
    setAnamneseSalvando(true)
    try {
      // Validação básica
      for (const c of anamneseCamposExtras) {
        if (!c.label || c.label.trim().length < 2) {
          showToast('Cada pergunta precisa ter um título', 'warning')
          setAnamneseSalvando(false)
          return
        }
        if (c.tipo === 'select' && (!c.opcoes || c.opcoes.length < 2)) {
          showToast(`A pergunta "${c.label}" precisa ter pelo menos 2 opções`, 'warning')
          setAnamneseSalvando(false)
          return
        }
      }

      const { error } = await supabase
        .from('usuarios')
        .update({ anamnese_campos_extras: anamneseCamposExtras })
        .eq('id', contextUserId)

      if (error) throw error
      showToast('Campos da anamnese salvos!', 'success')
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error')
    } finally {
      setAnamneseSalvando(false)
    }
  }

  const renderAnamnese = () => {
    if (isLocked('pro')) {
      return (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '60px 40px', textAlign: 'center', border: '1px solid #e5e7eb', maxWidth: '500px', margin: '40px auto' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#fff3e0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
            <Icon icon="mdi:lock" width="32" style={{ color: '#ff9800' }} />
          </div>
          <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: '600', color: '#1a1a1a' }}>Anamnese</h2>
          <p style={{ margin: '0 0 24px', fontSize: '15px', color: '#666', lineHeight: '1.6' }}>
            Cadastre fichas de avaliação física dos seus alunos com histórico de evolução.
            Disponível no plano <strong>Pro</strong> ou superior.
          </p>
          <button onClick={() => setAbaAtiva('upgrade')}
            style={{ padding: '12px 32px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
            Fazer Upgrade
          </button>
        </div>
      )
    }

    return (
      <div style={{ maxWidth: '800px' }}>
        {/* Cabeçalho */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '600', color: '#1a1a1a' }}>Anamnese</h2>
          <p style={{ margin: 0, fontSize: '14px', color: '#666', lineHeight: '1.5' }}>
            A ficha de anamnese já vem com perguntas padrão (saúde, histórico, objetivo, medidas).
            Aqui você adiciona perguntas extras específicas da sua academia.
          </p>
        </div>

        {/* Box de info */}
        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 16px', display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <Icon icon="mdi:information-outline" width="22" style={{ color: '#2563eb', flexShrink: 0 }} />
          <div style={{ fontSize: '13px', color: '#1e40af', lineHeight: '1.5' }}>
            Os campos padrão (peso, altura, dores, objetivo, etc) já aparecem na ficha do aluno automaticamente.
            Use os campos extras pra coisas específicas como <em>"Faz uso de proteína?"</em> ou <em>"Já fez Pilates antes?"</em>
          </div>
        </div>

        {/* Lista de campos extras */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1a1a1a' }}>
              Perguntas extras ({anamneseCamposExtras.length}/10)
            </h3>
            <button
              onClick={adicionarCampoExtra}
              disabled={anamneseCamposExtras.length >= 10}
              style={{
                padding: '8px 16px',
                backgroundColor: '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: anamneseCamposExtras.length >= 10 ? 'not-allowed' : 'pointer',
                opacity: anamneseCamposExtras.length >= 10 ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Icon icon="mdi:plus" width="18" /> Adicionar pergunta
            </button>
          </div>

          {anamneseCamposExtras.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9ca3af' }}>
              <Icon icon="mdi:clipboard-text-outline" width="40" style={{ opacity: 0.5 }} />
              <p style={{ margin: '8px 0 0', fontSize: '14px' }}>Nenhuma pergunta extra cadastrada.</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Os campos padrão já são suficientes pra maioria dos casos.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {anamneseCamposExtras.map((campo, idx) => (
                <div key={campo.id} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', backgroundColor: '#fafafa' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {/* Botões de reorder */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                      <button onClick={() => moverCampoExtra(campo.id, -1)} disabled={idx === 0}
                        style={{ padding: '2px 6px', background: 'white', border: '1px solid #d1d5db', borderRadius: '4px', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1 }}>
                        <Icon icon="mdi:chevron-up" width="14" />
                      </button>
                      <button onClick={() => moverCampoExtra(campo.id, 1)} disabled={idx === anamneseCamposExtras.length - 1}
                        style={{ padding: '2px 6px', background: 'white', border: '1px solid #d1d5db', borderRadius: '4px', cursor: idx === anamneseCamposExtras.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === anamneseCamposExtras.length - 1 ? 0.4 : 1 }}>
                        <Icon icon="mdi:chevron-down" width="14" />
                      </button>
                    </div>

                    {/* Conteúdo do campo */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={campo.label}
                          onChange={(e) => atualizarCampoExtra(campo.id, { label: e.target.value })}
                          placeholder="Pergunta..."
                          style={{ flex: '2 1 200px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
                        />
                        <select
                          value={campo.tipo}
                          onChange={(e) => atualizarCampoExtra(campo.id, { tipo: e.target.value, opcoes: e.target.value === 'select' ? campo.opcoes || [] : [] })}
                          style={{ flex: '1 1 140px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px', backgroundColor: 'white' }}
                        >
                          {TIPOS_CAMPO_EXTRA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>

                      {campo.tipo === 'select' && (
                        <div style={{ marginTop: '8px' }}>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Opções (uma por linha):</div>
                          <textarea
                            value={(campo.opcoes || []).join('\n')}
                            onChange={(e) => atualizarCampoExtra(campo.id, { opcoes: e.target.value.split('\n').filter(x => x.trim()) })}
                            rows={3}
                            placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                            style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#666', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!campo.obrigatorio}
                            onChange={(e) => atualizarCampoExtra(campo.id, { obrigatorio: e.target.checked })}
                          />
                          Obrigatório
                        </label>
                        <button onClick={() => removerCampoExtra(campo.id)}
                          style={{ marginLeft: 'auto', padding: '4px 10px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Icon icon="mdi:delete-outline" width="14" /> Remover
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Botão salvar */}
          {anamneseCamposExtras.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <button
                onClick={salvarAnamneseCamposExtras}
                disabled={anamneseSalvando}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: anamneseSalvando ? 'not-allowed' : 'pointer',
                  opacity: anamneseSalvando ? 0.6 : 1
                }}
              >
                {anamneseSalvando ? 'Salvando...' : 'Salvar campos'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'empresa', label: 'Dados da Empresa', icon: 'mdi:office-building-outline' },
    { id: 'planos', label: 'Planos', icon: 'mdi:package-variant-closed' },
    { id: 'integracoes', label: 'Integrações', icon: 'mdi:connection' },
    { id: 'uso', label: 'Uso do Sistema', icon: 'mdi:chart-box-outline' },
    { id: 'upgrade', label: 'Upgrade de Plano', icon: 'mdi:rocket-launch-outline' },
    { id: 'agendamento', label: 'Agendamento Online', icon: 'mdi:calendar-cursor' },
    { id: 'landing', label: 'Site', icon: 'mdi:web' },
    { id: 'anamnese', label: 'Anamnese', icon: 'mdi:clipboard-text-outline' },
    { id: 'contratos', label: 'Contratos', icon: 'mdi:file-document-outline' }
  ]

  // Encontrar a aba atual para mostrar no header mobile
  const abaAtual = tabs.find(t => t.id === abaAtiva)

  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
      {/* Tabs - dropdown no mobile, segmented control no desktop */}
      {isMobile ? (
        <div style={{
          position: 'relative',
          marginBottom: '16px'
        }}>
          <select
            value={abaAtiva}
            onChange={(e) => setAbaAtiva(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 40px 12px 14px',
              backgroundColor: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '600',
              color: '#1a1a1a',
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24'%3E%3Cpath fill='%23666' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: '20px',
              boxSizing: 'border-box'
            }}
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>{tab.label}</option>
            ))}
          </select>
        </div>
      ) : (
        <div style={{
          display: 'inline-flex',
          gap: '4px',
          backgroundColor: '#f3f4f6',
          borderRadius: '10px',
          padding: '4px',
          marginBottom: '25px'
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setAbaAtiva(tab.id)}
              style={{
                padding: '8px 20px',
                backgroundColor: abaAtiva === tab.id ? 'white' : 'transparent',
                color: abaAtiva === tab.id ? '#1a1a1a' : '#555',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: abaAtiva === tab.id ? '600' : '400',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
                boxShadow: abaAtiva === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                opacity: abaAtiva === tab.id ? 1 : 0.75,
                flexShrink: 0
              }}
            >
              <Icon icon={tab.icon} width={18} />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content Area */}
      <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Icon icon="eos-icons:loading" width="48" style={{ color: '#666' }} />
              <p style={{ marginTop: '16px', color: '#666' }}>Carregando...</p>
            </div>
          ) : (
            <>
              {abaAtiva === 'empresa' && renderDadosEmpresa()}
              {abaAtiva === 'planos' && renderPlanos()}
              {abaAtiva === 'integracoes' && renderIntegracoes()}
              {abaAtiva === 'uso' && renderUsoSistema()}
              {abaAtiva === 'upgrade' && renderUpgrade()}
              {abaAtiva === 'agendamento' && renderAgendamento()}
              {abaAtiva === 'landing' && renderLanding()}
              {abaAtiva === 'anamnese' && renderAnamnese()}
              {abaAtiva === 'contratos' && (
                <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Carregando...</div>}>
                  <ContratosTemplates />
                </Suspense>
              )}
            </>
          )}
        </div>
    </div>
  )
}

export default Configuracao
