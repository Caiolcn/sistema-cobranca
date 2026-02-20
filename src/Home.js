import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Icon } from '@iconify/react';
import whatsappService from './services/whatsappService';
import { useUser } from './contexts/UserContext';
import ConfirmModal from './ConfirmModal';
import { SkeletonDashboard } from './components/Skeleton';
import OnboardingChecklist from './OnboardingChecklist';
import './Home.css';

function Home() {
  const navigate = useNavigate();
  const { userId, nomeEmpresa: nomeEmpresaContext, nomeCompleto, chavePix, isAdmin, adminViewingAs, userData, loading: loadingUser } = useUser();
  const [loading, setLoading] = useState(true);

  // Estado unificado para todos os dados do dashboard
  const [dashboardData, setDashboardData] = useState({
    mrr: 0,
    assinaturasAtivas: 0,
    recebimentosMes: 0,
    valorEmAtraso: 0,
    filaWhatsapp: [],
    mensagensRecentes: []
  });

  // Estado para mensagens não enviadas (falhas de automação)
  const [mensagensNaoEnviadas, setMensagensNaoEnviadas] = useState([]);
  const [alertaExpandido, setAlertaExpandido] = useState(false);
  const [confirmDescarte, setConfirmDescarte] = useState({ isOpen: false, item: null });

  // Estados para modais de confirmação da Fila de WhatsApp
  const [confirmModalWhatsapp, setConfirmModalWhatsapp] = useState({ isOpen: false, item: null });
  const [confirmModalCancelar, setConfirmModalCancelar] = useState({ isOpen: false, mensalidadeId: null });
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: 'success', title: '', message: '' });
  const [enviandoWhatsapp, setEnviandoWhatsapp] = useState(false);

  // Estado para mensagem editável no modal de envio
  const [mensagemEditavel, setMensagemEditavel] = useState('');
  const [carregandoPreview, setCarregandoPreview] = useState(false);

  // Onboarding checklist
  const [mostrarChecklist, setMostrarChecklist] = useState(false);
  const [onboardingSteps, setOnboardingSteps] = useState({ empresa: false, pix: false, whatsapp: false, cliente: false });

  // Carregar dados quando userId mudar
  useEffect(() => {
    if (userId) {
      carregarDados();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const carregarDados = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);

      const hoje = new Date();
      const hojeStr = hoje.toISOString().split('T')[0];

      // Período: mês atual
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

      // Data de 3 dias à frente para fila de WhatsApp (alinhado com automação)
      const tresDiasFrente = new Date();
      tresDiasFrente.setDate(tresDiasFrente.getDate() + 3);
      const tresDiasFrenteStr = tresDiasFrente.toISOString().split('T')[0];

      // 6 queries essenciais (reduzido de 8)
      const [
        { data: todasMensalidades },
        { data: todosClientes },
        { data: fila },
        { data: mensagens },
        { data: falhasEnvio },
        { data: whatsappConectado }
      ] = await Promise.all([
        // 1. Mensalidades - para KPIs
        supabase
          .from('mensalidades')
          .select('id, valor, data_vencimento, status, devedor_id, updated_at')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false'),

        // 2. Clientes com assinaturas e planos
        supabase
          .from('devedores')
          .select('id, assinatura_ativa, lixo, plano:planos(valor)')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false'),

        // 3. Fila de WhatsApp
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
          .or('lixo.is.null,lixo.eq.false')
          .lte('data_vencimento', tresDiasFrenteStr)
          .order('data_vencimento', { ascending: true })
          .limit(20),

        // 4. Mensagens recentes
        supabase
          .from('logs_mensagens')
          .select(`
            id, telefone, valor_mensalidade, status, enviado_em,
            devedores (nome)
          `)
          .eq('user_id', userId)
          .order('enviado_em', { ascending: false })
          .limit(8),

        // 5. Mensagens não enviadas (falhas de automação)
        supabase
          .from('vw_mensagens_nao_enviadas')
          .select('mensalidade_id, nome_cliente, telefone, valor, data_vencimento, tipo_mensagem_pendente, descricao_pendencia, dias_desde_falha')
          .eq('user_id', userId)
          .order('data_vencimento', { ascending: false })
          .limit(50),

        // 6. Status WhatsApp conectado (para onboarding checklist)
        supabase
          .from('mensallizap')
          .select('conectado')
          .eq('user_id', userId)
          .eq('conectado', true)
          .maybeSingle()
      ]);

      // ========== PROCESSAMENTO LOCAL ==========

      const clientesAtivosSet = new Set(todosClientes?.map(c => c.id) || []);

      let recebidoMes = 0;
      let valorAtraso = 0;

      todasMensalidades?.forEach(p => {
        const valor = parseFloat(p.valor || 0);
        const dataVenc = p.data_vencimento;

        // Recebimentos do mês (status pago, updated_at no mês atual)
        if (p.status === 'pago' && p.updated_at >= `${inicio}T00:00:00` && p.updated_at <= `${fim}T23:59:59`) {
          recebidoMes += valor;
        }

        // Valor em atraso (pendente com vencimento < hoje) - apenas clientes ativos
        if (p.status === 'pendente' && dataVenc < hojeStr && clientesAtivosSet.has(p.devedor_id)) {
          valorAtraso += valor;
        }
      });

      // MRR
      const assinaturasAtivasList = todosClientes?.filter(c => c.assinatura_ativa && c.plano?.valor) || [];
      const ativas = assinaturasAtivasList.length;
      const mrrCalculado = assinaturasAtivasList.reduce((sum, assin) => sum + (parseFloat(assin.plano?.valor) || 0), 0);

      // Mensagens não enviadas
      setMensagensNaoEnviadas(
        (falhasEnvio || []).filter(f => f.tipo_mensagem_pendente !== null)
      );

      // Onboarding checklist
      const steps = {
        empresa: !!(nomeEmpresaContext && nomeEmpresaContext.trim()),
        pix: !!(chavePix && chavePix.trim()),
        whatsapp: !!whatsappConectado,
        cliente: (todosClientes?.length || 0) > 0
      };
      setOnboardingSteps(steps);

      const todasCompletas = steps.empresa && steps.pix && steps.whatsapp && steps.cliente;
      const isViewingAsClient = isAdmin && adminViewingAs;
      if (!todasCompletas && (isViewingAsClient || (!isAdmin && userData?.onboarding_completed !== true))) {
        setMostrarChecklist(true);
      } else {
        setMostrarChecklist(false);
      }
      if (todasCompletas && !isAdmin && userData?.onboarding_completed !== true) {
        supabase.from('usuarios').update({ onboarding_completed: true, onboarding_step: 4 }).eq('id', userId);
      }

      setDashboardData({
        mrr: mrrCalculado,
        assinaturasAtivas: ativas,
        recebimentosMes: recebidoMes,
        valorEmAtraso: valorAtraso,
        filaWhatsapp: fila || [],
        mensagensRecentes: mensagens || []
      });

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const formatarMoeda = (valor) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor);
  };

  const getHoraSaudacao = () => {
    const hora = new Date().getHours();
    if (hora < 12) return 'Bom dia';
    if (hora < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const getSubtitulo = () => {
    const agora = new Date();
    const diaSemana = agora.getDay();

    const frases = [
      'Mais um dia produtivo',
      'Bora trabalhar',
      'Tudo certo por aí',
      'Vamos nessa',
      'Pronto pra mais um dia',
      'Hora do café',
      'Tudo nos trilhos',
      'Como vão os negócios',
      'Que bom te ver',
      'De volta ao comando'
    ];

    const diasSemana = ['Bom domingo', 'Boa segunda-feira', 'Boa terça-feira', 'Boa quarta-feira', 'Boa quinta-feira', 'Boa sexta-feira', 'Bom sábado'];
    frases.push(diasSemana[diaSemana]);

    if (diaSemana === 1) frases.push('Bom início de semana');
    if (diaSemana === 4) frases.push('Quase lá, sexta tá chegando');
    if (diaSemana === 5) frases.push('Sextou');

    return frases[Math.floor(Math.random() * frases.length)];
  };

  const [subtitulo] = useState(getSubtitulo);

  // Reenviar mensagem que falhou
  const handleReenviarFalha = (item) => {
    handleEnviarWhatsApp({
      id: item.mensalidade_id,
      valor: item.valor,
      devedores: { nome: item.nome_cliente, telefone: item.telefone }
    });
  };

  // Descartar falha
  const confirmarDescarteFalha = async () => {
    const item = confirmDescarte.item;
    if (!item) return;
    setConfirmDescarte({ isOpen: false, item: null });

    try {
      const { error } = await supabase
        .from('mensalidades')
        .update({
          enviado_3dias: true,
          enviado_no_dia: true,
          enviado_vencimento: true
        })
        .eq('id', item.mensalidade_id);

      if (error) throw error;

      setMensagensNaoEnviadas(prev =>
        prev.filter(f => f.mensalidade_id !== item.mensalidade_id)
      );
    } catch (error) {
      console.error('Erro ao descartar falha:', error);
      setFeedbackModal({
        isOpen: true,
        type: 'danger',
        title: 'Erro',
        message: 'Erro ao descartar. Tente novamente.'
      });
    }
  };

  // Abre modal de confirmação para envio de WhatsApp
  const handleEnviarWhatsApp = async (item) => {
    setConfirmModalWhatsapp({ isOpen: true, item });
    setCarregandoPreview(true);
    setMensagemEditavel('');

    try {
      const { mensagem } = await whatsappService.gerarPreviewMensagem(item.id);
      setMensagemEditavel(mensagem);
    } catch (error) {
      console.error('Erro ao gerar preview:', error);
    } finally {
      setCarregandoPreview(false);
    }
  };

  // Confirma e executa o envio de WhatsApp
  const confirmarEnvioWhatsApp = async () => {
    const item = confirmModalWhatsapp.item;
    if (!item) return;

    const mensagemParaEnviar = mensagemEditavel.trim();
    setConfirmModalWhatsapp({ isOpen: false, item: null });
    setMensagemEditavel('');
    setEnviandoWhatsapp(true);

    try {
      const resultado = await whatsappService.enviarCobranca(item.id, mensagemParaEnviar);

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
      const { error } = await supabase
        .from('mensalidades')
        .update({ cancelado_envio: true })
        .eq('id', mensalidadeId);

      if (error) throw error;

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

  if (loading || loadingUser) {
    return (
      <div className="home-container" style={{ padding: '24px' }}>
        <SkeletonDashboard />
      </div>
    );
  }

  const { mrr, assinaturasAtivas, recebimentosMes, valorEmAtraso, filaWhatsapp, mensagensRecentes } = dashboardData;

  const nomeEmpresa = nomeEmpresaContext || 'Empresa';

  return (
    <div className="home-container">
      {/* Header de Boas-vindas */}
      <div className="home-header">
        <div className="home-welcome">
          <h1>{getHoraSaudacao()}! 👋</h1>
          <p>{subtitulo}, <strong>{nomeCompleto ? nomeCompleto.split(' ')[0] : nomeEmpresa}</strong></p>
        </div>
      </div>

      {/* KPIs Principais - 3 Cards */}
      <div className="home-cards-grid home-cards-3">
        {/* 1. MRR */}
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
      </div>

      {/* Ações Rápidas */}
      <div className="home-quick-actions home-quick-actions-3">
        {/* Card destaque: Criar Aluno e Mensalidade */}
        <div className="quick-action-card highlighted" onClick={() => navigate('/app/clientes?novo=true')}>
          <div className="quick-action-card-top">
            <div className="quick-action-icon" style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>
              <Icon icon="material-symbols:person-add-outline" width="24" />
            </div>
            <div className="quick-action-card-info">
              <p className="quick-action-card-title">Criar Aluno e Mensalidade</p>
              <p className="quick-action-card-desc">Cadastre um novo aluno e crie sua mensalidade</p>
            </div>
          </div>
          <button className="quick-action-card-btn primary" onClick={(e) => { e.stopPropagation(); navigate('/app/clientes?novo=true'); }}>
            <Icon icon="material-symbols:add" width="16" /> Adicionar Aluno
          </button>
        </div>

        {/* Gerenciar Alunos */}
        <div className="quick-action-card" onClick={() => navigate('/app/clientes')}>
          <div className="quick-action-card-top">
            <div className="quick-action-icon" style={{ backgroundColor: '#EEF2FF', color: '#4F46E5' }}>
              <Icon icon="fluent:people-24-regular" width="24" />
            </div>
            <div className="quick-action-card-info">
              <p className="quick-action-card-title">Gerenciar Alunos</p>
              <p className="quick-action-card-desc">Visualizar, editar e gerenciar seus alunos</p>
            </div>
          </div>
          <button className="quick-action-card-btn outline" onClick={(e) => { e.stopPropagation(); navigate('/app/clientes'); }}>
            Ver Alunos <Icon icon="mdi:arrow-right" width="16" />
          </button>
        </div>

        {/* Mensalidades e Despesas */}
        <div className="quick-action-card" onClick={() => navigate('/app/financeiro')}>
          <div className="quick-action-card-top">
            <div className="quick-action-icon" style={{ backgroundColor: '#F0F9FF', color: '#0284C7' }}>
              <Icon icon="material-symbols:receipt-outline" width="24" />
            </div>
            <div className="quick-action-card-info">
              <p className="quick-action-card-title">Mensalidades e Despesas</p>
              <p className="quick-action-card-desc">Gerencie cobranças, pagamentos e despesas</p>
            </div>
          </div>
          <button className="quick-action-card-btn outline" onClick={(e) => { e.stopPropagation(); navigate('/app/financeiro'); }}>
            Ver Financeiro <Icon icon="mdi:arrow-right" width="16" />
          </button>
        </div>
      </div>

      {/* Alerta: Mensagens Não Enviadas */}
      {mensagensNaoEnviadas.length > 0 && (
        <div style={{
          marginBottom: '24px',
          border: '1px solid #fbbf24',
          borderRadius: '12px',
          backgroundColor: '#fffbeb',
          overflow: 'hidden'
        }}>
          {/* Header do alerta */}
          <div
            onClick={() => setAlertaExpandido(!alertaExpandido)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon icon="material-symbols:warning-outline-rounded" width="22" style={{ color: '#d97706' }} />
              </div>
              <div>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#92400e' }}>
                  {mensagensNaoEnviadas.length} {mensagensNaoEnviadas.length !== 1 ? 'mensagens não enviadas' : 'mensagem não enviada'}
                </span>
                <span style={{ fontSize: '12px', color: '#b45309', display: 'block', marginTop: '2px' }}>
                  Clique para ver detalhes
                </span>
              </div>
            </div>
            <Icon
              icon={alertaExpandido ? 'material-symbols:expand-less' : 'material-symbols:expand-more'}
              width="24"
              style={{ color: '#d97706' }}
            />
          </div>

          {/* Lista expandida */}
          {alertaExpandido && (
            <div style={{
              borderTop: '1px solid #fde68a',
              padding: '0',
              maxHeight: '320px',
              overflowY: 'auto'
            }}>
              {mensagensNaoEnviadas.map((item, index) => (
                <div
                  key={`${item.mensalidade_id}-${item.tipo_mensagem_pendente}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 20px',
                    borderBottom: index < mensagensNaoEnviadas.length - 1 ? '1px solid #fef3c7' : 'none',
                    gap: '12px'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                        {item.nome_cliente}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: item.tipo_mensagem_pendente === 'overdue' ? '#fee2e2' :
                                        item.tipo_mensagem_pendente === 'due_day' ? '#fff7ed' : '#eff6ff',
                        color: item.tipo_mensagem_pendente === 'overdue' ? '#dc2626' :
                              item.tipo_mensagem_pendente === 'due_day' ? '#ea580c' : '#2563eb',
                        fontWeight: '500'
                      }}>
                        {item.descricao_pendencia}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '12px', color: '#6b7280' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Icon icon="mdi:phone-outline" width="13" />
                        {item.telefone}
                      </span>
                      <span>Venc. {new Date(item.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                      <span style={{ color: '#d97706' }}>há {item.dias_desde_falha} dia{item.dias_desde_falha !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', whiteSpace: 'nowrap' }}>
                      {formatarMoeda(item.valor)}
                    </span>
                    <button
                      onClick={() => handleReenviarFalha(item)}
                      title="Reenviar via WhatsApp"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#dcfce7',
                        color: '#16a34a',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s'
                      }}
                      onMouseOver={e => e.currentTarget.style.backgroundColor = '#bbf7d0'}
                      onMouseOut={e => e.currentTarget.style.backgroundColor = '#dcfce7'}
                    >
                      <Icon icon="mdi:whatsapp" width="18" />
                    </button>
                    <button
                      onClick={() => setConfirmDescarte({ isOpen: true, item })}
                      title="Descartar (não enviar)"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#fee2e2',
                        color: '#dc2626',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s'
                      }}
                      onMouseOver={e => e.currentTarget.style.backgroundColor = '#fecaca'}
                      onMouseOut={e => e.currentTarget.style.backgroundColor = '#fee2e2'}
                    >
                      <Icon icon="material-symbols:close" width="18" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Layout em 2 Colunas: Fila de WhatsApp + Mensagens Recentes */}
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
                  const hoje = new Date();
                  hoje.setHours(0, 0, 0, 0);
                  const vencimento = new Date(item.data_vencimento + 'T00:00:00');
                  const diffMs = vencimento - hoje;
                  const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

                  let statusVencimento = null;
                  let statusClass = '';
                  if (diffDias < 0) {
                    const diasAtraso = Math.abs(diffDias);
                    statusVencimento = `${diasAtraso} dia${diasAtraso > 1 ? 's' : ''} atraso`;
                    statusClass = 'fila-atraso';
                  } else if (diffDias === 0) {
                    statusVencimento = 'Hoje';
                    statusClass = 'fila-hoje';
                  } else if (diffDias === 1) {
                    statusVencimento = 'Amanhã';
                    statusClass = 'fila-amanha';
                  } else if (diffDias <= 3) {
                    statusVencimento = `Em ${diffDias} dias`;
                    statusClass = 'fila-futuro';
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

      {/* Modal de Envio WhatsApp com Editor de Mensagem */}
      {confirmModalWhatsapp.isOpen && (
        <div className="modal-overlay" onClick={() => { setConfirmModalWhatsapp({ isOpen: false, item: null }); setMensagemEditavel(''); }}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '480px',
              width: '95%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: '16px',
              borderBottom: '1px solid #e5e7eb',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon icon="mdi:whatsapp" width="22" style={{ color: 'white' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                    Enviar Cobrança
                  </h3>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>Via WhatsApp</span>
                </div>
              </div>
              <button
                onClick={() => { setConfirmModalWhatsapp({ isOpen: false, item: null }); setMensagemEditavel(''); }}
                style={{
                  background: '#f3f4f6',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = '#e5e7eb'}
                onMouseOut={e => e.currentTarget.style.background = '#f3f4f6'}
              >
                <Icon icon="mdi:close" width="20" style={{ color: '#6b7280' }} />
              </button>
            </div>

            {confirmModalWhatsapp.item && (
              <>
                {/* Info do Cliente */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '10px',
                  marginBottom: '16px',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: '#e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#64748b'
                    }}>
                      {confirmModalWhatsapp.item.devedores?.nome?.charAt(0)?.toUpperCase() || 'C'}
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '15px', color: '#1e293b' }}>
                        {confirmModalWhatsapp.item.devedores?.nome}
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <Icon icon="mdi:phone-outline" width="14" />
                        {confirmModalWhatsapp.item.devedores?.telefone}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#16a34a' }}>
                      {formatarMoeda(confirmModalWhatsapp.item.valor)}
                    </div>
                  </div>
                </div>

                {/* Área da Mensagem */}
                <div style={{ flex: 1, minHeight: 0, marginBottom: '16px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '10px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    <Icon icon="mdi:message-text-outline" width="16" />
                    Mensagem
                    <span style={{
                      fontSize: '11px',
                      color: '#9ca3af',
                      fontWeight: 'normal',
                      marginLeft: '4px',
                      padding: '2px 6px',
                      background: '#f3f4f6',
                      borderRadius: '4px'
                    }}>
                      editável
                    </span>
                  </label>
                  {carregandoPreview ? (
                    <div style={{
                      padding: '60px 20px',
                      textAlign: 'center',
                      color: '#9ca3af',
                      background: '#f9fafb',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <Icon icon="mdi:loading" width="28" style={{ animation: 'spin 1s linear infinite' }} />
                      <p style={{ margin: '12px 0 0', fontSize: '14px' }}>Carregando mensagem...</p>
                    </div>
                  ) : (
                    <textarea
                      value={mensagemEditavel}
                      onChange={(e) => setMensagemEditavel(e.target.value)}
                      style={{
                        width: '100%',
                        height: '220px',
                        padding: '14px',
                        border: '1px solid #d1d5db',
                        borderRadius: '10px',
                        fontSize: '14px',
                        lineHeight: '1.6',
                        resize: 'none',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                        outline: 'none',
                        transition: 'border-color 0.2s, box-shadow 0.2s'
                      }}
                      onFocus={e => {
                        e.target.style.borderColor = '#25D366'
                        e.target.style.boxShadow = '0 0 0 3px rgba(37, 211, 102, 0.1)'
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = '#d1d5db'
                        e.target.style.boxShadow = 'none'
                      }}
                      placeholder="Digite sua mensagem..."
                    />
                  )}
                </div>

                {/* Botões */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  paddingTop: '16px',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  <button
                    onClick={() => { setConfirmModalWhatsapp({ isOpen: false, item: null }); setMensagemEditavel(''); }}
                    style={{
                      padding: '11px 24px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = '#f9fafb'
                      e.currentTarget.style.borderColor = '#9ca3af'
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = '#fff'
                      e.currentTarget.style.borderColor = '#d1d5db'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarEnvioWhatsApp}
                    disabled={carregandoPreview || !mensagemEditavel.trim()}
                    style={{
                      padding: '11px 28px',
                      border: 'none',
                      borderRadius: '8px',
                      background: carregandoPreview || !mensagemEditavel.trim()
                        ? '#9ca3af'
                        : 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                      color: '#fff',
                      cursor: carregandoPreview || !mensagemEditavel.trim() ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                      boxShadow: carregandoPreview || !mensagemEditavel.trim()
                        ? 'none'
                        : '0 2px 8px rgba(37, 211, 102, 0.3)'
                    }}
                  >
                    <Icon icon="mdi:send" width="18" />
                    Enviar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de Confirmação - Descartar Falha de Envio */}
      <ConfirmModal
        isOpen={confirmDescarte.isOpen}
        onClose={() => setConfirmDescarte({ isOpen: false, item: null })}
        onConfirm={confirmarDescarteFalha}
        title="Descartar Pendência"
        message={confirmDescarte.item ? `Descartar "${confirmDescarte.item.descricao_pendencia}" de ${confirmDescarte.item.nome_cliente}? A mensagem não será mais exibida como pendente.` : ''}
        confirmText="Sim, Descartar"
        cancelText="Cancelar"
        type="warning"
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

      {/* Onboarding Checklist - painel flutuante */}
      {mostrarChecklist && (
        <OnboardingChecklist completedSteps={onboardingSteps} />
      )}
    </div>
  );
}

export default Home;
