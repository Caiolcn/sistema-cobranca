import React, { useState, useEffect } from 'react'
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

Se você já realizou o pagamento e foi um atraso na nossa baixa manual, basta me enviar o comprovante por aqui! Obrigado! 🙏`
}

function Configuracao() {
  const [searchParams] = useSearchParams()
  const { isMobile, isTablet, isSmallScreen } = useWindowSize()
  const [abaAtiva, setAbaAtiva] = useState(searchParams.get('aba') || 'empresa')
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)

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
    enviar3DiasDepois: false
  })

  // Plans
  const [planos, setPlanos] = useState([])
  const [mostrarModalPlano, setMostrarModalPlano] = useState(false)
  const [planoEditando, setPlanoEditando] = useState(null)
  const [formPlano, setFormPlano] = useState({
    nome: '',
    valor: '',
    ciclo: 'mensal',
    descricao: ''
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

  // Automação WhatsApp - REMOVIDO (movido para /whatsapp)
  // const [configAutomacao, setConfigAutomacao] = useState({...})
  // const [testando, setTestando] = useState(false)

  useEffect(() => {
    carregarDados()
  }, [])

  // Atualizar aba quando URL mudar (vindo do menu mobile)
  useEffect(() => {
    const abaUrl = searchParams.get('aba')
    if (abaUrl && ['empresa', 'planos', 'uso', 'upgrade', 'integracoes'].includes(abaUrl)) {
      setAbaAtiva(abaUrl)
    }
  }, [searchParams])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        await Promise.all([
          carregarDadosEmpresa(user.id),
          carregarConfigCobranca(user.id),
          carregarPlanos(user.id),
          carregarUsoSistema(user.id),
          carregarConfigAsaas()
        ])
      }
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
      const fileName = `${user.id}/logo.${ext}`

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
      await supabase.from('usuarios').update({ logo_url: logoUrl }).eq('id', user.id)
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
      await supabase.from('usuarios').update({ logo_url: null }).eq('id', user.id)
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
        .eq('id', user.id)

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
        enviar3DiasDepois: data.enviar_3_dias_depois || false
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
        .eq('user_id', user.id)
        .eq('tipo', tipo)
        .maybeSingle()

      const titulos = {
        pre_due_3days: 'Lembrete - 3 Dias Antes do Vencimento',
        due_day: 'Lembrete - Vencimento Hoje',
        overdue: 'Cobrança - 3 Dias Após o Vencimento'
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
          user_id: user.id,
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
          user_id: user.id,
          enviar_antes_vencimento: configCobranca.enviarAntes,
          enviar_3_dias_antes: configCobranca.enviar3DiasAntes,
          enviar_no_dia: configCobranca.enviarNoDia,
          enviar_3_dias_depois: configCobranca.enviar3DiasDepois,
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
    setFormPlano({ nome: '', valor: '', ciclo: 'mensal', descricao: '' })
    setAtualizarMensalidadesFuturas(false)
    setMostrarModalPlano(true)
  }

  const abrirModalEditarPlano = async (plano) => {
    setPlanoEditando(plano)
    setFormPlano({
      nome: plano.nome,
      valor: plano.valor,
      ciclo: plano.ciclo_cobranca || 'mensal',
      descricao: plano.descricao || ''
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

    try {
      const { error } = await supabase.from('planos').insert({
        user_id: user.id,
        nome: formPlano.nome.trim(),
        valor: parseFloat(formPlano.valor),
        ciclo_cobranca: formPlano.ciclo,
        descricao: formPlano.descricao?.trim() || null,
        ativo: true
      })

      if (error) throw error

      showToast('Plano criado!', 'success')
      setMostrarModalPlano(false)
      await carregarPlanos(user.id)
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

    try {
      // Update plan
      const { error } = await supabase.from('planos')
        .update({
          nome: formPlano.nome.trim(),
          valor: parseFloat(formPlano.valor),
          ciclo_cobranca: formPlano.ciclo,
          descricao: formPlano.descricao?.trim() || null,
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
      await carregarPlanos(user.id)
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
      await carregarPlanos(user.id)
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
      await carregarPlanos(user.id)
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
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isSmallScreen ? '16px' : '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
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
    <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isSmallScreen ? '16px' : '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#333' }}>
        Configurações de Cobrança
      </h3>
      <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#666' }}>
        Configure quando enviar mensagens de lembrete para seus clientes
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
                  Lembrete antecipado para o cliente se preparar
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
      <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isSmallScreen ? '16px' : '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
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
                  style={{ borderBottom: '1px solid #f0f0f0' }}
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
              borderBottom: '1px solid #e0e0e0',
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
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isSmallScreen ? '16px' : '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
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
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>Clientes</div>
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
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isSmallScreen ? '16px' : '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
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
      if (user) {
        const { data } = await supabase
          .from('usuarios')
          .select('plano')
          .eq('id', user.id)
          .single()
        if (data?.plano) {
          setPlanoAtual(data.plano)
        }
      }
    }
    carregarPlanoAtual()
  }, [user])

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
    window.open('https://wa.me/5562999999999?text=Olá! Preciso de ajuda com o MensalliZap', '_blank')
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
        .eq('id', user.id)

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
        .eq('id', user.id)

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
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
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
              Escolha como deseja receber pagamentos dos seus clientes
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
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
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
              border: modoIntegracao === 'asaas' ? '2px solid #2196F3' : '2px solid transparent',
              borderRadius: '16px',
              cursor: salvandoModo ? 'wait' : 'pointer',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: modoIntegracao === 'asaas' ? '0 4px 15px rgba(33, 150, 243, 0.2)' : '0 2px 8px rgba(0,0,0,0.04)'
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
              border: modoIntegracao === 'manual' ? '2px solid #FF9800' : '2px solid transparent',
              borderRadius: '16px',
              cursor: salvandoModo ? 'wait' : 'pointer',
              transition: 'all 0.3s ease',
              position: 'relative',
              boxShadow: modoIntegracao === 'manual' ? '0 4px 15px rgba(255, 152, 0, 0.2)' : '0 2px 8px rgba(0,0,0,0.04)'
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
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
                { icon: 'mdi:send', text: 'Você envia um link de pagamento para o cliente via WhatsApp' },
                { icon: 'mdi:qrcode-scan', text: 'O cliente acessa o link e vê o QR Code PIX + código copia e cola' },
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
  // MAIN RENDER
  // ==========================================

  const tabs = [
    { id: 'empresa', label: 'Dados da Empresa', icon: 'mdi:office-building-outline' },
    { id: 'planos', label: 'Planos', icon: 'mdi:package-variant-closed' },
    { id: 'integracoes', label: 'Integrações', icon: 'mdi:connection' },
    { id: 'uso', label: 'Uso do Sistema', icon: 'mdi:chart-box-outline' },
    { id: 'upgrade', label: 'Upgrade de Plano', icon: 'mdi:rocket-launch-outline' }
  ]

  // Encontrar a aba atual para mostrar no header mobile
  const abaAtual = tabs.find(t => t.id === abaAtiva)

  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header - No mobile mostra a aba atual, no desktop mostra "Configurações" */}
      {isMobile ? (
        <div style={{ marginBottom: '16px' }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Configurações
          </p>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon={abaAtual?.icon} width="22" />
            {abaAtual?.label}
          </h2>
        </div>
      ) : (
        <h2 style={{ margin: '0 0 24px 0', fontSize: '24px', fontWeight: '600', color: '#333' }}>
          Configurações
        </h2>
      )}

      {/* Tabs horizontais - apenas para tablet (não mobile, não desktop) */}
      {isSmallScreen && !isMobile && (
        <div style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '12px',
          marginBottom: '16px',
          WebkitOverflowScrolling: 'touch'
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setAbaAtiva(tab.id)}
              style={{
                padding: '10px 16px',
                borderRadius: '20px',
                cursor: 'pointer',
                backgroundColor: abaAtiva === tab.id ? '#333' : 'white',
                color: abaAtiva === tab.id ? 'white' : '#666',
                border: abaAtiva === tab.id ? 'none' : '1px solid #e0e0e0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                fontSize: '13px',
                fontWeight: '500',
                flexShrink: 0
              }}
            >
              <Icon icon={tab.icon} width="18" />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '24px', flexDirection: isSmallScreen ? 'column' : 'row' }}>
        {/* Tabs Sidebar - só para desktop/laptop */}
        {!isSmallScreen && (
          <div style={{ width: '220px', flexShrink: 0 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  onClick={() => setAbaAtiva(tab.id)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: abaAtiva === tab.id ? '#f9f9f9' : 'transparent',
                    borderLeft: abaAtiva === tab.id ? '3px solid #333' : '3px solid transparent',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (abaAtiva !== tab.id) e.currentTarget.style.backgroundColor = '#f5f5f5'
                  }}
                  onMouseLeave={(e) => {
                    if (abaAtiva !== tab.id) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <Icon
                    icon={tab.icon}
                    width="20"
                    style={{ color: abaAtiva === tab.id ? '#333' : '#666' }}
                  />
                  <span style={{
                    fontSize: '14px',
                    fontWeight: abaAtiva === tab.id ? '600' : '400',
                    color: abaAtiva === tab.id ? '#333' : '#666'
                  }}>
                    {tab.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content Area */}
        <div style={{ flex: 1 }}>
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Configuracao
