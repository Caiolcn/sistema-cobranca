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
import { validarCNPJ, validarTelefone } from './utils/validators'
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
    chavePix: ''
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

  // Automação WhatsApp - REMOVIDO (movido para /whatsapp)
  // const [configAutomacao, setConfigAutomacao] = useState({...})
  // const [testando, setTestando] = useState(false)

  useEffect(() => {
    carregarDados()
  }, [])

  // Atualizar aba quando URL mudar (vindo do menu mobile)
  useEffect(() => {
    const abaUrl = searchParams.get('aba')
    if (abaUrl && ['empresa', 'planos', 'uso', 'upgrade'].includes(abaUrl)) {
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
          carregarUsoSistema(user.id)
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
        chavePix: data.chave_pix || ''
      })
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

    // Validar CNPJ se preenchido
    if (dadosEmpresa.cnpj?.trim() && !validarCNPJ(dadosEmpresa.cnpj)) {
      showToast('CNPJ inválido', 'warning')
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

  const formatarCNPJ = (value) => {
    const numbers = value.replace(/\D/g, '')
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
      <h3 style={{ margin: '0 0 24px 0', fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#333' }}>
        Dados da Empresa
      </h3>

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
            CNPJ
          </label>
          <input
            type="text"
            value={dadosEmpresa.cnpj}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, cnpj: formatarCNPJ(e.target.value) })}
            placeholder="00.000.000/0000-00"
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

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#555' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:pix" width="18" style={{ color: '#32BCAD' }} />
              Chave PIX
            </span>
          </label>
          <input
            type="text"
            value={dadosEmpresa.chavePix}
            onChange={(e) => setDadosEmpresa({ ...dadosEmpresa, chavePix: e.target.value })}
            placeholder="CPF, CNPJ, E-mail, Telefone ou Chave Aleatória"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #32BCAD',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box',
              backgroundColor: '#f0faf9'
            }}
          />
          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#666' }}>
            Esta chave será usada nas mensagens automáticas de cobrança (variável {`{{chavePix}}`})
          </p>
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
      clientes: 50,
      mensagens: 200,
      recursos: [
        'Até 50 clientes ativos',
        '200 mensagens/mês',
        '1 template padrão',
        'Automação em atraso',
        'Dashboard básico'
      ],
      cor: '#4CAF50',
      popular: false
    },
    {
      id: 'pro',
      nome: 'Pro',
      preco: 99.90,
      clientes: 150,
      mensagens: 600,
      recursos: [
        'Até 150 clientes ativos',
        '600 mensagens/mês',
        '3 templates de mensagens personalizáveis',
        'Regra de cobrança (disparo de mensagens 3 dias, 5 dias e em atraso)',
        'Dashboard completa com gráficos',
        'Suporte via WhatsApp',
        'Aging Report (status dos clientes)',
        'Receita Projetada',
        'Histórico Completo de Mensalidades'
      ],
      cor: '#2196F3',
      popular: true
    },
    {
      id: 'premium',
      nome: 'Premium',
      preco: 149.90,
      clientes: 500,
      mensagens: 3000,
      recursos: [
        'Tudo do Pro',
        'Até 500 clientes ativos',
        '3.000 mensagens/mês',
        'Consultoria inicial (1h)',
        'Suporte prioritário via WhatsApp',
        'Acesso antecipado a novas features'
      ],
      cor: '#9c27b0',
      popular: false
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

  const renderUpgrade = () => (
    <div>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h3 style={{
          fontSize: isSmallScreen ? '24px' : '32px',
          fontWeight: '800',
          marginBottom: '12px',
          letterSpacing: '-0.5px',
          color: '#1a1a1a'
        }}>
          Escolha seu plano
        </h3>
        <p style={{ fontSize: '16px', color: '#666' }}>
          Comece a automatizar suas cobranças hoje mesmo
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, 1fr)',
        gap: '24px',
        alignItems: 'stretch'
      }}>
        {planosDisponiveis.map((plano) => {
          const isAtual = plano.id === planoAtual
          const isDowngrade = planosDisponiveis.findIndex(p => p.id === plano.id) < planosDisponiveis.findIndex(p => p.id === planoAtual)

          return (
            <div
              key={plano.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '32px 24px',
                boxShadow: plano.popular ? '0 8px 30px rgba(33, 150, 243, 0.2)' : '0 2px 12px rgba(0,0,0,0.08)',
                border: plano.id === 'premium' ? '2px solid #9c27b0' : plano.popular ? '2px solid #2196F3' : '1px solid #e0e0e0',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Badge Mais Popular */}
              {plano.popular && (
                <div style={{
                  position: 'absolute',
                  top: '-14px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  padding: '6px 20px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap'
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
                  backgroundColor: '#e8f5e9',
                  color: '#2e7d32',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  SEU PLANO
                </div>
              )}

              {/* Nome do Plano */}
              <h4 style={{
                margin: '0 0 16px 0',
                fontSize: '14px',
                fontWeight: '600',
                color: plano.id === 'premium' ? '#9c27b0' : '#666',
                letterSpacing: '1px',
                textTransform: 'uppercase'
              }}>
                {plano.nome}
              </h4>

              {/* Preço */}
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '48px', fontWeight: '700', color: '#333' }}>
                  R${plano.preco.toFixed(2).split('.')[0]}
                </span>
                <span style={{ fontSize: '18px', color: '#666' }}>
                  ,{plano.preco.toFixed(2).split('.')[1]}/mês
                </span>
              </div>

              {/* Limites resumidos */}
              <p style={{
                margin: '0 0 24px 0',
                fontSize: '14px',
                color: '#666'
              }}>
                {plano.clientes} clientes ativos • {plano.mensagens.toLocaleString('pt-BR')} mensagens/mês
              </p>

              {/* Recursos */}
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 24px 0',
                flex: 1
              }}>
                {plano.recursos.map((recurso, idx) => (
                  <li
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      marginBottom: '12px',
                      fontSize: '14px',
                      color: '#333',
                      lineHeight: '1.4'
                    }}
                  >
                    <Icon
                      icon="mdi:check"
                      width="20"
                      style={{
                        color: plano.cor,
                        flexShrink: 0,
                        marginTop: '2px'
                      }}
                    />
                    {recurso}
                  </li>
                ))}
              </ul>

              {/* Botão */}
              <button
                onClick={() => handleUpgrade(plano.id)}
                disabled={isAtual || processandoCheckout}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: isAtual ? 'default' : 'pointer',
                  border: isAtual ? 'none' : (plano.id === 'starter' ? '2px solid #333' : 'none'),
                  backgroundColor: isAtual ? '#e0e0e0' : (plano.id === 'starter' ? 'transparent' : plano.cor),
                  color: isAtual ? '#999' : (plano.id === 'starter' ? '#333' : 'white'),
                  transition: 'all 0.2s'
                }}
              >
                {processandoCheckout ? (
                  <Icon icon="eos-icons:loading" width="20" />
                ) : isAtual ? (
                  'Plano Atual'
                ) : plano.id === 'starter' ? (
                  'Começar agora'
                ) : plano.id === 'pro' ? (
                  'Escolher Pro'
                ) : (
                  'Escolher Premium'
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer - Informações de segurança */}
      <div style={{
        marginTop: '40px',
        textAlign: 'center',
        padding: '24px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e0e0e0'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: isSmallScreen ? '16px' : '32px',
          flexWrap: 'wrap',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="mdi:shield-check" width="20" style={{ color: '#4CAF50' }} />
            <span style={{ fontSize: '13px', color: '#666' }}>Pagamento seguro</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="mdi:lock-outline" width="20" style={{ color: '#4CAF50' }} />
            <span style={{ fontSize: '13px', color: '#666' }}>Dados criptografados</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="mdi:cancel" width="20" style={{ color: '#4CAF50' }} />
            <span style={{ fontSize: '13px', color: '#666' }}>Cancele quando quiser</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>
          Upgrade ou downgrade a qualquer momento. Sem multas, sem burocracia.
        </p>
      </div>
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
