import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Icon } from '@iconify/react';
import DateRangePicker from './DateRangePicker';
import whatsappService from './services/whatsappService';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useUserPlan } from './hooks/useUserPlan';
import { useUser } from './contexts/UserContext';
import FeatureLocked from './FeatureLocked';
import ConfirmModal from './ConfirmModal';
import { SkeletonDashboard } from './components/Skeleton';
import './Home.css';

function Home() {
  const navigate = useNavigate();
  const { userId, nomeEmpresa: nomeEmpresaContext, loading: loadingUser } = useUser();
  const { isLocked, loading: loadingPlan } = useUserPlan();
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('mes_atual');

  // Estado unificado para todos os dados do dashboard
  const [dashboardData, setDashboardData] = useState({
    mrr: 0,
    assinaturasAtivas: 0,
    recebimentosMes: 0,
    valorEmAtraso: 0,
    clientesInadimplentes: 0,
    receitaProjetadaMes: 0,
    taxaCancelamento: 0,
    mensalidadesVencer7Dias: 0,
    mensagensEnviadasAuto: 0,
    statusAcesso: {
      emDia: { valor: 0, clientes: 0 },
      atrasoRecente: { valor: 0, clientes: 0 },
      bloqueado: { valor: 0, clientes: 0 },
      inativo: { valor: 0, clientes: 0 }
    },
    graficoRecebimentoVsVencimento: [],
    distribuicaoStatus: { emDia: 0, aVencer: 0, atrasadas: 0, canceladas: 0 },
    filaWhatsapp: [],
    mensagensRecentes: []
  });

  // Estados para modais de confirmação da Fila de WhatsApp
  const [confirmModalWhatsapp, setConfirmModalWhatsapp] = useState({ isOpen: false, item: null });
  const [confirmModalCancelar, setConfirmModalCancelar] = useState({ isOpen: false, mensalidadeId: null });
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: 'success', title: '', message: '' });
  const [enviandoWhatsapp, setEnviandoWhatsapp] = useState(false);

  // Um único useEffect para carregar dados quando userId ou periodo mudam
  useEffect(() => {
    if (userId) {
      carregarDados();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, periodo]);

  const obterDatasPeriodo = () => {
    const hoje = new Date();
    let inicio, fim;

    if (periodo === 'mes_atual') {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (periodo === 'mes_anterior') {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString().split('T')[0];
      fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0).toISOString().split('T')[0];
    } else if (periodo === 'ultimos_3_meses') {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1).toISOString().split('T')[0];
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (periodo === 'ultimos_6_meses') {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1).toISOString().split('T')[0];
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (periodo === 'este_ano') {
      inicio = new Date(hoje.getFullYear(), 0, 1).toISOString().split('T')[0];
      fim = new Date(hoje.getFullYear(), 11, 31).toISOString().split('T')[0];
    } else {
      // Default: mês atual
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
    }

    return { inicio, fim };
  };

  const carregarDados = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);

      const { inicio, fim } = obterDatasPeriodo();
      const hoje = new Date().toISOString().split('T')[0];

      // Data de amanhã para incluir na fila de WhatsApp
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      const amanhaStr = amanha.toISOString().split('T')[0];

      // Calcular datas para queries
      const seteDiasFrente = new Date();
      seteDiasFrente.setDate(seteDiasFrente.getDate() + 7);
      const seteDiasFrenteStr = seteDiasFrente.toISOString().split('T')[0];

      const tresMesesAtras = new Date();
      tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 2);
      const tresMesesAtrasInicio = new Date(tresMesesAtras.getFullYear(), tresMesesAtras.getMonth(), 1).toISOString().split('T')[0];
      const mesAtualFim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];

      // OTIMIZAÇÃO: Reduzido de 15 para 8 queries essenciais
      // Consolidamos queries que buscavam dados similares
      const [
        { data: todasMensalidades },      // Query única para todas as métricas de mensalidades
        { data: todosClientes },          // Clientes e assinaturas
        { data: fila },                   // Fila WhatsApp
        { data: mensagens },              // Mensagens recentes
        { data: mensagensAutomaticas }    // Count de mensagens
      ] = await Promise.all([
        // 1. TODAS as mensalidades - processamos tudo no cliente
        supabase
          .from('mensalidades')
          .select('id, valor, data_vencimento, status, devedor_id, is_mensalidade, updated_at')
          .eq('user_id', userId),

        // 2. Todos os clientes com assinaturas e planos
        supabase
          .from('devedores')
          .select('id, assinatura_ativa, plano:planos(valor)')
          .eq('user_id', userId),

        // 3. Fila de WhatsApp (inclui vencidas + vencendo hoje + vencendo amanhã)
        supabase
          .from('mensalidades')
          .select(`
            id, valor, data_vencimento, numero_mensalidade, enviado_hoje,
            devedores (nome, telefone)
          `)
          .eq('user_id', userId)
          .eq('status', 'pendente')
          .eq('enviado_hoje', false)
          .neq('cancelado_envio', true)
          .lte('data_vencimento', amanhaStr)
          .order('data_vencimento', { ascending: true })
          .limit(15),

        // 4. Mensagens recentes (precisa de join com devedores)
        supabase
          .from('logs_mensagens')
          .select(`
            id, telefone, valor_mensalidade, status, enviado_em,
            devedores (nome)
          `)
          .eq('user_id', userId)
          .order('enviado_em', { ascending: false })
          .limit(8),

        // 5. Count de mensagens enviadas
        supabase
          .from('logs_mensagens')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'enviado')
      ]);

      // ========== PROCESSAMENTO LOCAL (mais eficiente) ==========

      // Métricas de mensalidades - tudo processado de uma vez
      let recebidoMes = 0;
      let valorAtraso = 0;
      const clientesAtrasadosSet = new Set();
      let aReceberMes = 0;
      const clientesComMensalidadeSet = new Set();
      let vencer7Dias = 0;
      const recebidosPorMes = {};
      const vencidosPorMes = {};
      let emDia = 0, aVencer = 0, atrasadas = 0, canceladas = 0;
      const mensalidadesPorCliente = {};

      todasMensalidades?.forEach(p => {
        const valor = parseFloat(p.valor || 0);
        const dataVenc = p.data_vencimento;
        const mesAnoVenc = dataVenc?.substring(0, 7);
        const mesAnoUpdate = p.updated_at?.substring(0, 7);

        // Recebimentos do mês (status pago, updated_at no período)
        if (p.status === 'pago' && p.updated_at >= `${inicio}T00:00:00` && p.updated_at <= `${fim}T23:59:59`) {
          recebidoMes += valor;
        }

        // Valor em atraso (pendente com vencimento < hoje)
        if (p.status === 'pendente' && dataVenc < hoje) {
          valorAtraso += valor;
          clientesAtrasadosSet.add(p.devedor_id);
        }

        // Pendentes no mês para receita projetada
        if (['pendente', 'atrasado'].includes(p.status) && dataVenc >= inicio && dataVenc <= fim) {
          aReceberMes += valor;
        }

        // Clientes com mensalidades ativas
        if (p.is_mensalidade && ['pendente', 'atrasado', 'pago'].includes(p.status)) {
          clientesComMensalidadeSet.add(p.devedor_id);
        }

        // Mensalidades a vencer 7 dias
        if (['pendente', 'atrasado'].includes(p.status) && dataVenc >= hoje && dataVenc <= seteDiasFrenteStr) {
          vencer7Dias += valor;
        }

        // Gráfico recebidos (últimos 3 meses)
        if (p.status === 'pago' && p.updated_at >= `${tresMesesAtrasInicio}T00:00:00` && p.updated_at <= `${mesAtualFim}T23:59:59`) {
          if (!recebidosPorMes[mesAnoUpdate]) recebidosPorMes[mesAnoUpdate] = 0;
          recebidosPorMes[mesAnoUpdate] += valor;
        }

        // Gráfico vencidos (últimos 3 meses)
        if (dataVenc >= tresMesesAtrasInicio && dataVenc <= mesAtualFim) {
          if (!vencidosPorMes[mesAnoVenc]) vencidosPorMes[mesAnoVenc] = 0;
          vencidosPorMes[mesAnoVenc] += valor;
        }

        // Distribuição de status
        if (p.status === 'pago') {
          emDia++;
        } else if (p.status === 'cancelado') {
          canceladas++;
        } else if (p.status === 'pendente' && dataVenc < hoje) {
          atrasadas++;
        } else if (p.status === 'pendente') {
          aVencer++;
        }

        // Status de acesso (mensalidades mais recentes por cliente)
        if (p.is_mensalidade) {
          if (!mensalidadesPorCliente[p.devedor_id] ||
              new Date(dataVenc) > new Date(mensalidadesPorCliente[p.devedor_id].data_vencimento)) {
            mensalidadesPorCliente[p.devedor_id] = p;
          }
        }
      });

      // Calcular gráfico dos últimos 3 meses
      const graficoMeses = [];
      for (let i = 2; i >= 0; i--) {
        const mesData = new Date();
        mesData.setMonth(mesData.getMonth() - i);
        const mesAno = `${mesData.getFullYear()}-${String(mesData.getMonth() + 1).padStart(2, '0')}`;
        graficoMeses.push({
          mes: mesData.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          recebido: recebidosPorMes[mesAno] || 0,
          vencido: vencidosPorMes[mesAno] || 0
        });
      }

      // Taxa de cancelamento
      const totalClientesGeral = todosClientes?.length || 0;
      const clientesCancelados = totalClientesGeral - clientesComMensalidadeSet.size;
      const taxaCancel = totalClientesGeral > 0 ? (clientesCancelados / totalClientesGeral) * 100 : 0;

      // MRR
      const assinaturasAtivasList = todosClientes?.filter(c => c.assinatura_ativa && c.plano?.valor) || [];
      const ativas = assinaturasAtivasList.length;
      const mrrCalculado = assinaturasAtivasList.reduce((sum, assin) => sum + (parseFloat(assin.plano?.valor) || 0), 0);

      // Status Operacional de Acesso
      const statusData = {
        emDia: { valor: 0, clientes: new Set() },
        atrasoRecente: { valor: 0, clientes: new Set() },
        bloqueado: { valor: 0, clientes: new Set() },
        inativo: { valor: 0, clientes: new Set() }
      };

      Object.values(mensalidadesPorCliente).forEach(m => {
        const valor = parseFloat(m.valor || 0);

        if (m.status === 'pago') {
          statusData.emDia.valor += valor;
          statusData.emDia.clientes.add(m.devedor_id);
        } else {
          const diasAtraso = calcularDiasAtraso(m.data_vencimento);

          if (diasAtraso >= 1 && diasAtraso <= 7) {
            statusData.atrasoRecente.valor += valor;
            statusData.atrasoRecente.clientes.add(m.devedor_id);
          } else if (diasAtraso > 7 && diasAtraso <= 30) {
            statusData.bloqueado.valor += valor;
            statusData.bloqueado.clientes.add(m.devedor_id);
          } else if (diasAtraso > 30) {
            statusData.inativo.valor += valor;
            statusData.inativo.clientes.add(m.devedor_id);
          }
        }
      });

      // UM ÚNICO setState com todos os dados
      setDashboardData({
        mrr: mrrCalculado,
        assinaturasAtivas: ativas,
        recebimentosMes: recebidoMes,
        valorEmAtraso: valorAtraso,
        clientesInadimplentes: clientesAtrasadosSet.size,
        receitaProjetadaMes: recebidoMes + aReceberMes,
        taxaCancelamento: taxaCancel,
        mensalidadesVencer7Dias: vencer7Dias,
        mensagensEnviadasAuto: mensagensAutomaticas?.count || 0,
        statusAcesso: {
          emDia: { valor: statusData.emDia.valor, clientes: statusData.emDia.clientes.size },
          atrasoRecente: { valor: statusData.atrasoRecente.valor, clientes: statusData.atrasoRecente.clientes.size },
          bloqueado: { valor: statusData.bloqueado.valor, clientes: statusData.bloqueado.clientes.size },
          inativo: { valor: statusData.inativo.valor, clientes: statusData.inativo.clientes.size }
        },
        graficoRecebimentoVsVencimento: graficoMeses,
        distribuicaoStatus: { emDia, aVencer, atrasadas, canceladas },
        filaWhatsapp: fila || [],
        mensagensRecentes: mensagens || []
      });

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, periodo]);

  const formatarMoeda = (valor) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor);
  };

  const calcularDiasAtraso = (dataVencimento) => {
    const hoje = new Date();
    const vencimento = new Date(dataVencimento);
    const diff = Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const getHoraSaudacao = () => {
    const hora = new Date().getHours();
    if (hora < 12) return 'Bom dia';
    if (hora < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  // Abre modal de confirmação para envio de WhatsApp
  const handleEnviarWhatsApp = (item) => {
    setConfirmModalWhatsapp({ isOpen: true, item });
  };

  // Confirma e executa o envio de WhatsApp
  const confirmarEnvioWhatsApp = async () => {
    const item = confirmModalWhatsapp.item;
    if (!item) return;

    setConfirmModalWhatsapp({ isOpen: false, item: null });
    setEnviandoWhatsapp(true);

    try {
      const resultado = await whatsappService.enviarCobranca(item.id);

      setEnviandoWhatsapp(false);

      if (resultado.sucesso) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Mensagem Enviada',
          message: `Mensagem enviada com sucesso para ${item.devedores?.nome}!`
        });
        await carregarDados();
      } else {
        // Verifica se é bloqueio (config desativada ou plano) ou erro técnico
        const isBloqueio = resultado.bloqueado === true;
        setFeedbackModal({
          isOpen: true,
          type: isBloqueio ? 'warning' : 'danger',
          title: isBloqueio ? 'Envio Bloqueado' : 'Erro ao Enviar',
          message: resultado.erro || 'Erro desconhecido ao enviar mensagem.'
        });
      }
    } catch (error) {
      setEnviandoWhatsapp(false);
      console.error('Erro ao enviar WhatsApp:', error);
      setFeedbackModal({
        isOpen: true,
        type: 'danger',
        title: 'Erro ao Enviar',
        message: error.message || 'Erro desconhecido ao enviar WhatsApp.'
      });
    }
  };

  // Abre modal de confirmação para cancelar envio
  const handleCancelarEnvio = (mensalidadeId) => {
    setConfirmModalCancelar({ isOpen: true, mensalidadeId });
  };

  // Confirma e executa o cancelamento do envio
  const confirmarCancelarEnvio = async () => {
    const mensalidadeId = confirmModalCancelar.mensalidadeId;
    if (!mensalidadeId) return;

    setConfirmModalCancelar({ isOpen: false, mensalidadeId: null });

    try {
      // Marcar cancelado_envio = true para remover permanentemente da fila
      const { error } = await supabase
        .from('mensalidades')
        .update({ cancelado_envio: true })
        .eq('id', mensalidadeId);

      if (error) throw error;

      // Atualizar lista local removendo o item
      setDashboardData(prev => ({
        ...prev,
        filaWhatsapp: prev.filaWhatsapp.filter(item => item.id !== mensalidadeId)
      }));

      setFeedbackModal({
        isOpen: true,
        type: 'success',
        title: 'Envio Cancelado',
        message: 'Esta cobrança não será mais enviada automaticamente.'
      });
    } catch (error) {
      console.error('Erro ao cancelar envio:', error);
      setFeedbackModal({
        isOpen: true,
        type: 'danger',
        title: 'Erro',
        message: 'Erro ao cancelar envio. Tente novamente.'
      });
    }
  };

  if (loading || loadingPlan || loadingUser) {
    return (
      <div className="home-container" style={{ padding: '24px' }}>
        <SkeletonDashboard />
      </div>
    );
  }

  // Desestruturar dados do dashboard para uso no JSX
  const {
    mrr, assinaturasAtivas, recebimentosMes, valorEmAtraso, clientesInadimplentes,
    receitaProjetadaMes, taxaCancelamento, mensalidadesVencer7Dias, mensagensEnviadasAuto,
    statusAcesso, graficoRecebimentoVsVencimento, distribuicaoStatus, filaWhatsapp, mensagensRecentes
  } = dashboardData;

  // Usar nome da empresa do contexto
  const nomeEmpresa = nomeEmpresaContext || 'Empresa';

  // Verificar se features estão bloqueadas para plano Starter
  const proLocked = isLocked('pro');

  return (
    <div className="home-container">
      {/* Header de Boas-vindas */}
      <div className="home-header">
        <div className="home-welcome">
          <h1>{getHoraSaudacao()}! 👋</h1>
          <p>Bem-vindo(a) <strong>{nomeEmpresa}</strong></p>
        </div>

        {/* Filtro de Período */}
        <DateRangePicker
          value={periodo}
          onChange={setPeriodo}
        />
      </div>

      {/* Cards Principais - Linha 1 */}
      <div className="home-cards-grid">
        {/* 1. MRR (Receita Mensal Recorrente) */}
        <div className="home-card card-mrr">
          <div className="card-header">
            <span className="card-label">Receita Mensal Recorrente</span>
            <div className="card-icon">
              <Icon icon="material-symbols:trending-up" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{formatarMoeda(mrr)}</span>
            <span className="card-subtitle">{assinaturasAtivas} assinaturas ativas</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('/app/clientes?status=ativo')}>
              Ver
            </button>
          </div>
        </div>

        {/* 2. Recebimentos do Mês */}
        <div className="home-card card-recebimentos">
          <div className="card-header">
            <span className="card-label">Recebimentos do Mês</span>
            <div className="card-icon">
              <Icon icon="material-symbols:attach-money" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{formatarMoeda(recebimentosMes)}</span>
            <span className="card-subtitle">&nbsp;</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('/app/financeiro?status=pago')}>
              Ver
            </button>
          </div>
        </div>

        {/* 3. Valor em Atraso */}
        <div className="home-card card-atraso">
          <div className="card-header">
            <span className="card-label">Valor em Atraso</span>
            <div className="card-icon">
              <Icon icon="material-symbols:warning-outline" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value" style={{ color: valorEmAtraso > 0 ? '#f44336' : '#4CAF50' }}>
              {formatarMoeda(valorEmAtraso)}
            </span>
            <span className="card-subtitle">&nbsp;</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('/app/financeiro?status=atrasado')}>
              Ver
            </button>
          </div>
        </div>

        {/* 4. Taxa de Cancelamento */}
        <div className="home-card card-taxa-cancelamento">
          <div className="card-header">
            <span className="card-label">Taxa de Cancelamento</span>
            <div className="card-icon">
              <Icon icon="material-symbols:cancel-outline" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value" style={{ color: taxaCancelamento > 10 ? '#f44336' : '#4CAF50' }}>
              {taxaCancelamento.toFixed(1)}%
            </span>
            <span className={`card-status ${taxaCancelamento < 5 ? 'success' : taxaCancelamento < 10 ? 'warning' : 'danger'}`}>
              {taxaCancelamento < 5 ? 'Excelente' : taxaCancelamento < 10 ? 'Atenção' : 'Crítico'}
            </span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('/app/clientes?assinatura=desativada')}>
              Ver
            </button>
          </div>
        </div>
      </div>

      {/* Cards Secundários - Linha 2 */}
      <div className="home-cards-secondary">
        {/* 1. Receita Projetada do Mês */}
        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Receita Projetada">
          <div className="home-card card-receita-projetada">
            <div className="card-header">
              <span className="card-label">Receita Projetada do Mês</span>
              <div className="card-icon">
                <Icon icon="material-symbols:analytics-outline" width="20" />
              </div>
            </div>
            <div className="card-body">
              <span className="card-value">{formatarMoeda(receitaProjetadaMes)}</span>
              <span className="card-subtitle">Recebido + A receber</span>
            </div>
          </div>
        </FeatureLocked>

        {/* 2. Mensalidades a Vencer */}
        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Mensalidades a Vencer">
          <div className="home-card card-vencer-7-dias">
            <div className="card-header">
              <span className="card-label">Mensalidades a Vencer</span>
              <div className="card-icon">
                <Icon icon="material-symbols:calendar-clock" width="20" />
              </div>
            </div>
            <div className="card-body">
              <span className="card-value">{formatarMoeda(mensalidadesVencer7Dias)}</span>
              <span className="card-subtitle">Próximos 7 dias</span>
            </div>
          </div>
        </FeatureLocked>

        {/* 3. Clientes Inadimplentes */}
        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Clientes Inadimplentes">
          <div className="home-card card-inadimplentes">
            <div className="card-header">
              <span className="card-label">Clientes Inadimplentes</span>
              <div className="card-icon">
                <Icon icon="material-symbols:person-alert-outline" width="20" />
              </div>
            </div>
            <div className="card-body">
              <span className="card-value">{clientesInadimplentes}</span>
              <span className="card-subtitle">Com mensalidades atrasadas</span>
            </div>
            <div className="card-footer">
              <button className="btn-ver" onClick={() => navigate('/app/clientes?inadimplente=true')}>
                Ver
              </button>
            </div>
          </div>
        </FeatureLocked>

        {/* 4. Mensagens Enviadas Automaticamente */}
        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Mensagens Enviadas">
          <div className="home-card card-mensagens-auto">
            <div className="card-header">
              <span className="card-label">Mensagens Enviadas</span>
              <div className="card-icon">
                <Icon icon="material-symbols:send-outline" width="20" />
              </div>
            </div>
            <div className="card-body">
              <span className="card-value">{mensagensEnviadasAuto}</span>
              <span className="card-subtitle">Automáticas pelo sistema</span>
            </div>
          </div>
        </FeatureLocked>
      </div>

      {/* Gráficos em 2 Colunas */}
      <div className="home-two-columns">
        {/* Gráfico: Recebimento vs Vencimento (Gráfico de Linhas) */}
        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Gráfico de Recebimento vs Vencimento">
          <div className="home-section">
            <div className="section-header">
              <Icon icon="material-symbols:show-chart" width="24" />
              <h2>Recebimento vs Vencimento</h2>
            </div>
            <div className="home-grafico-recharts">
              {graficoRecebimentoVsVencimento.length === 0 ? (
                <div className="empty-state">Sem dados para exibir</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={graficoRecebimentoVsVencimento} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="mes"
                      tick={{ fill: '#666', fontSize: 12 }}
                      stroke="#d1d5db"
                    />
                    <YAxis
                      tick={{ fill: '#666', fontSize: 12 }}
                      stroke="#d1d5db"
                      tickFormatter={(value) => formatarMoeda(value)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                      }}
                      formatter={(value) => formatarMoeda(value)}
                      labelStyle={{ color: '#333', fontWeight: 600 }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '10px' }}
                      iconType="circle"
                    />
                    <Line
                      type="monotone"
                      dataKey="recebido"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ fill: '#10b981', r: 5 }}
                      activeDot={{ r: 7 }}
                      name="Recebido"
                    />
                    <Line
                      type="monotone"
                      dataKey="vencido"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      dot={{ fill: '#f59e0b', r: 5 }}
                      activeDot={{ r: 7 }}
                      name="Vencido"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </FeatureLocked>

        {/* Gráfico: Status das Mensalidades (Donut Chart) */}
        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Gráfico de Status das Mensalidades">
          <div className="home-section">
          <div className="section-header">
            <Icon icon="material-symbols:pie-chart" width="24" />
            <h2>Status das Mensalidades</h2>
          </div>
          <div className="home-grafico-recharts">
            {(() => {
              const total = (distribuicaoStatus.emDia || 0) + (distribuicaoStatus.aVencer || 0) +
                           (distribuicaoStatus.atrasadas || 0) + (distribuicaoStatus.canceladas || 0);

              if (total === 0) {
                return (
                  <div className="empty-state">
                    <p>Nenhuma mensalidade no período</p>
                  </div>
                );
              }

              const dados = [
                { name: 'Em dia', value: distribuicaoStatus.emDia || 0, color: '#10b981' },
                { name: 'A vencer', value: distribuicaoStatus.aVencer || 0, color: '#3b82f6' },
                { name: 'Atrasadas', value: distribuicaoStatus.atrasadas || 0, color: '#ef4444' },
                { name: 'Canceladas', value: distribuicaoStatus.canceladas || 0, color: '#6b7280' }
              ].filter(d => d.value > 0);

              const COLORS = dados.map(d => d.color);

              const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
                const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);

                if (percent < 0.05) return null; // Não mostrar label para segmentos muito pequenos

                return (
                  <text
                    x={x}
                    y={y}
                    fill="white"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {`${(percent * 100).toFixed(0)}%`}
                  </text>
                );
              };

              return (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={dados}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderCustomLabel}
                      outerRadius={100}
                      innerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {dados.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                      }}
                      formatter={(value, name) => [`${value} mensalidades`, name]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
          </div>
        </FeatureLocked>
      </div>

      {/* Status Operacional de Acesso */}
      <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Status de Acesso dos Clientes">
        <div className="home-section aging-section">
          <div className="section-header">
            <Icon icon="material-symbols:lock-person-outline" width="24" />
            <h2>Status de Acesso dos Clientes</h2>
          </div>
          <div className="aging-container">
            <div className="aging-card status-em-dia">
              <div className="aging-header">
                <span className="aging-label">Em dia</span>
                <div className="card-icon">
                  <Icon icon="material-symbols:check-circle-outline" width="20" />
                </div>
              </div>
              <div className="aging-body">
                <span className="aging-value">{formatarMoeda(statusAcesso.emDia.valor)}</span>
                <span className="aging-clientes">{statusAcesso.emDia.clientes} cliente{statusAcesso.emDia.clientes !== 1 ? 's' : ''}</span>
                <span className="aging-status-desc">Acesso liberado</span>
              </div>
            </div>

            <div className="aging-card status-atraso-recente">
              <div className="aging-header">
                <span className="aging-label">Atraso recente</span>
                <div className="card-icon">
                  <Icon icon="material-symbols:schedule" width="20" />
                </div>
              </div>
              <div className="aging-body">
                <span className="aging-value">{formatarMoeda(statusAcesso.atrasoRecente.valor)}</span>
                <span className="aging-clientes">{statusAcesso.atrasoRecente.clientes} cliente{statusAcesso.atrasoRecente.clientes !== 1 ? 's' : ''}</span>
                <span className="aging-status-desc">1-7 dias • Enviar mensagem</span>
              </div>
            </div>

            <div className="aging-card status-bloqueado">
              <div className="aging-header">
                <span className="aging-label">Bloqueado</span>
                <div className="card-icon">
                  <Icon icon="material-symbols:block" width="20" />
                </div>
              </div>
              <div className="aging-body">
                <span className="aging-value">{formatarMoeda(statusAcesso.bloqueado.valor)}</span>
                <span className="aging-clientes">{statusAcesso.bloqueado.clientes} cliente{statusAcesso.bloqueado.clientes !== 1 ? 's' : ''}</span>
                <span className="aging-status-desc">7-30 dias • Acesso suspenso</span>
              </div>
            </div>

            <div className="aging-card status-inativo">
              <div className="aging-header">
                <span className="aging-label">Inativo</span>
                <div className="card-icon">
                  <Icon icon="material-symbols:person-off-outline" width="20" />
                </div>
              </div>
              <div className="aging-body">
                <span className="aging-value">{formatarMoeda(statusAcesso.inativo.valor)}</span>
                <span className="aging-clientes">{statusAcesso.inativo.clientes} cliente{statusAcesso.inativo.clientes !== 1 ? 's' : ''}</span>
                <span className="aging-status-desc">+30 dias • Abandono</span>
              </div>
            </div>
          </div>
        </div>
      </FeatureLocked>

      {/* Layout em 2 Colunas */}
      <div className="home-two-columns">
        {/* Fila de WhatsApp */}
        <div className="home-section">
          <div className="section-header">
            <Icon icon="logos:whatsapp-icon" width="24" />
            <h2>Fila de WhatsApp</h2>
            <span className="badge-count">{filaWhatsapp.length}</span>
          </div>
          <div className="home-fila-whatsapp">
            {filaWhatsapp.length === 0 ? (
              <div className="empty-state">
                <Icon icon="material-symbols:check-circle-outline" width="48" />
                <p>Nenhuma mensagem pendente!</p>
              </div>
            ) : (
              <div className="fila-lista">
                {filaWhatsapp.map((item) => {
                  const diasAtraso = calcularDiasAtraso(item.data_vencimento);
                  const hoje = new Date().toISOString().split('T')[0];
                  const amanha = new Date();
                  amanha.setDate(amanha.getDate() + 1);
                  const amanhaStr = amanha.toISOString().split('T')[0];

                  // Determinar status do vencimento
                  let statusVencimento = null;
                  let statusClass = '';
                  if (item.data_vencimento === amanhaStr) {
                    statusVencimento = 'Amanhã';
                    statusClass = 'fila-amanha';
                  } else if (item.data_vencimento === hoje) {
                    statusVencimento = 'Hoje';
                    statusClass = 'fila-hoje';
                  } else if (diasAtraso > 0) {
                    statusVencimento = `${diasAtraso} dia${diasAtraso > 1 ? 's' : ''} atraso`;
                    statusClass = 'fila-atraso';
                  }

                  return (
                    <div key={item.id} className="fila-item">
                      <div className="fila-icon">
                        <Icon icon="material-symbols:schedule-send-outline" width="20" />
                      </div>
                      <div className="fila-info">
                        <span className="fila-nome">{item.devedores?.nome}</span>
                        <span className="fila-telefone">{item.devedores?.telefone}</span>
                      </div>
                      <div className="fila-detalhes">
                        <span className="fila-valor">{formatarMoeda(item.valor)}</span>
                        {statusVencimento && (
                          <span className={statusClass}>{statusVencimento}</span>
                        )}
                      </div>
                      <div className="fila-acoes">
                        <button
                          className="fila-btn fila-btn-enviar"
                          onClick={() => handleEnviarWhatsApp(item)}
                          title="Enviar WhatsApp agora"
                        >
                          <Icon icon="mdi:whatsapp" width="16" />
                        </button>
                        <button
                          className="fila-btn fila-btn-cancelar"
                          onClick={() => handleCancelarEnvio(item.id)}
                          title="Cancelar envio"
                        >
                          <Icon icon="material-symbols:close" width="16" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Mensagens Recentes */}
        <div className="home-section">
          <div className="section-header">
            <Icon icon="material-symbols:history" width="24" />
            <h2>Mensagens Recentes</h2>
          </div>
          <div className="home-mensagens-recentes">
            {mensagensRecentes.length === 0 ? (
              <div className="empty-state">
                <Icon icon="material-symbols:inbox-outline" width="48" />
                <p>Nenhuma mensagem enviada ainda</p>
              </div>
            ) : (
              <div className="mensagens-lista">
                {mensagensRecentes.map((msg) => (
                  <div key={msg.id} className="mensagem-item">
                    <div className={`mensagem-status ${msg.status}`}>
                      <Icon
                        icon={msg.status === 'enviado'
                          ? 'material-symbols:check-circle'
                          : 'material-symbols:error-outline'}
                        width="16"
                      />
                    </div>
                    <div className="mensagem-info">
                      <span className="mensagem-nome">{msg.devedores?.nome}</span>
                      <span className="mensagem-telefone">{msg.telefone}</span>
                    </div>
                    <div className="mensagem-detalhes">
                      <span className="mensagem-valor">{formatarMoeda(msg.valor_mensalidade)}</span>
                      <span className="mensagem-data">
                        {new Date(msg.enviado_em).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Confirmação - Enviar WhatsApp */}
      <ConfirmModal
        isOpen={confirmModalWhatsapp.isOpen}
        onClose={() => setConfirmModalWhatsapp({ isOpen: false, item: null })}
        onConfirm={confirmarEnvioWhatsApp}
        title="Enviar Cobrança"
        message={confirmModalWhatsapp.item ?
          `Enviar cobrança via WhatsApp para ${confirmModalWhatsapp.item.devedores?.nome}?\n\nValor: ${formatarMoeda(confirmModalWhatsapp.item.valor)}\nTelefone: ${confirmModalWhatsapp.item.devedores?.telefone}` :
          ''
        }
        confirmText="Enviar"
        cancelText="Cancelar"
        type="info"
      />

      {/* Modal de Confirmação - Cancelar Envio */}
      <ConfirmModal
        isOpen={confirmModalCancelar.isOpen}
        onClose={() => setConfirmModalCancelar({ isOpen: false, mensalidadeId: null })}
        onConfirm={confirmarCancelarEnvio}
        title="Cancelar Envio"
        message="Deseja realmente cancelar o envio desta mensagem?"
        confirmText="Sim, Cancelar"
        cancelText="Não"
        type="warning"
      />

      {/* Modal de Feedback (Sucesso/Erro) */}
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

      {/* Loading overlay para envio de WhatsApp */}
      {enviandoWhatsapp && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px 32px',
            borderRadius: '12px',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <Icon icon="line-md:loading-twotone-loop" width="40" style={{ color: '#25D366', marginBottom: '12px' }} />
            <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>Enviando mensagem...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
