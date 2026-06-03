import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Icon } from '@iconify/react';
import { useUser } from './contexts/UserContext';
import { SkeletonDashboard } from './components/Skeleton';
import OnboardingChecklist from './OnboardingChecklist';
import './Home.css';

// 📢 Novas Atualizações exibidas no topo da Home.
// Para divulgar uma novidade, basta adicionar um item NO TOPO desta lista.
// Campos: data (livre), tag (opcional, ex: "Novo"), titulo e texto.
const NOVIDADES = [
  {
    data: '01/06',
    tag: 'Novo',
    titulo: 'Dashboard repaginada',
    texto: 'Reorganizamos a tela inicial pra deixar tudo mais direto. Fique de olho aqui — é por este espaço que vamos avisar as próximas novidades!'
  },
  {
    data: '28/05',
    tag: 'Melhoria',
    titulo: 'Busca de alunos mais rápida',
    texto: 'Agora você encontra qualquer aluno por nome ou telefone direto na barra de busca do topo.'
  },
  {
    data: '20/05',
    titulo: 'Agenda Nova no ar',
    texto: 'A grade de horários ganhou visões por Dia e Semana, mais leve e prática no celular.'
  },
];

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
    alunosEmRisco: 0,
    aulasHoje: 0,
    taxaInadimplencia: 0,
    qtdInadimplentes: 0
  });

  // Onboarding checklist
  const [mostrarChecklist, setMostrarChecklist] = useState(false);
  const [onboardingSteps, setOnboardingSteps] = useState({ empresa: false, pix: false, whatsapp: false, cliente: false });

  // Carrossel de Novas Atualizações
  const [novidadeAtual, setNovidadeAtual] = useState(0);

  // Carregar dados quando userId mudar
  useEffect(() => {
    if (userId) {
      carregarDados();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Auto-avanço do carrossel de novidades (a cada 12s)
  useEffect(() => {
    if (NOVIDADES.length <= 1) return;
    const timer = setInterval(() => {
      setNovidadeAtual((i) => (i + 1) % NOVIDADES.length);
    }, 12000);
    return () => clearInterval(timer);
  }, []);

  const carregarDados = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);

      const hoje = new Date();
      const hojeStr = hoje.toISOString().split('T')[0];

      // Período: mês atual
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

      // 6 queries essenciais
      const [
        { data: todasMensalidades },
        { data: todosClientes },
        { data: whatsappConectado },
        { data: vendasData },
        { count: radarRiscoCount },
        { count: aulasHojeCount }
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

        // 3. Status WhatsApp conectado (para onboarding checklist)
        supabase
          .from('mensallizap')
          .select('conectado')
          .eq('user_id', userId)
          .eq('conectado', true)
          .maybeSingle(),

        // 4. Vendas (cobranças avulsas) - para incluir nos KPIs financeiros
        supabase
          .from('cobrancas_avulsas')
          .select('id, valor, data_vencimento, status, data_pagamento')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false'),

        // 5. Radar de evasão - contagem de alunos em risco alto+critico (score >= 50)
        supabase
          .from('vw_radar_evasao')
          .select('devedor_id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('score_total', 50),

        // 6. Aulas de hoje - turmas/individuais ativas no dia da semana atual
        supabase
          .from('aulas')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('ativo', true)
          .eq('dia_semana', hoje.getDay())
      ]);

      // ========== PROCESSAMENTO LOCAL ==========

      const clientesAtivosSet = new Set(todosClientes?.map(c => c.id) || []);

      let recebidoMes = 0;
      let valorAtraso = 0;
      // Inadimplência: das mensalidades já vencidas (até hoje) de clientes ativos,
      // quantas seguem pendentes vs. o total que deveria ter sido pago.
      let venciasNaoPagas = 0;
      let venciasTotal = 0;

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

        // Taxa de inadimplência (conta mensalidades vencidas de clientes ativos)
        if (dataVenc && dataVenc < hojeStr && (p.status === 'pago' || p.status === 'pendente') && clientesAtivosSet.has(p.devedor_id)) {
          venciasTotal += 1;
          if (p.status === 'pendente') venciasNaoPagas += 1;
        }
      });

      const taxaInadimplencia = venciasTotal > 0 ? (venciasNaoPagas / venciasTotal) * 100 : 0;

      // Incluir vendas (cobranças avulsas) nos KPIs
      vendasData?.forEach(v => {
        const valor = parseFloat(v.valor || 0);
        const dataVenc = v.data_vencimento;

        if (v.status === 'pago' && v.data_pagamento >= inicio && v.data_pagamento <= fim) {
          recebidoMes += valor;
        }

        if (v.status === 'pendente' && dataVenc && dataVenc < hojeStr) {
          valorAtraso += valor;
        }
      });

      // MRR
      const assinaturasAtivasList = todosClientes?.filter(c => c.assinatura_ativa && c.plano?.valor) || [];
      const ativas = assinaturasAtivasList.length;
      const mrrCalculado = assinaturasAtivasList.reduce((sum, assin) => sum + (parseFloat(assin.plano?.valor) || 0), 0);

      // Onboarding checklist
      const steps = {
        empresa: !!(nomeEmpresaContext && nomeEmpresaContext.trim()),
        pix: !!(chavePix && chavePix.trim()),
        whatsapp: !!whatsappConectado,
        cliente: (todosClientes?.length || 0) > 0
      };
      setOnboardingSteps(steps);

      const todasCompletas = steps.empresa && steps.pix && steps.whatsapp && steps.cliente;

      // Se já completou onboarding antes, nunca mais mostrar
      if (!isAdmin && userData?.onboarding_completed === true) {
        setMostrarChecklist(false);
      } else if (isAdmin && adminViewingAs) {
        // Admin vendo cliente: mostrar se não completou
        setMostrarChecklist(!todasCompletas);
      } else if (!isAdmin && !todasCompletas) {
        setMostrarChecklist(true);
      } else {
        setMostrarChecklist(false);
      }

      // Marcar como completado quando todas as etapas forem concluídas
      if (todasCompletas && !isAdmin && userData?.onboarding_completed !== true) {
        supabase.from('usuarios').update({ onboarding_completed: true, onboarding_step: 4 }).eq('id', userId);
      }

      setDashboardData({
        mrr: mrrCalculado,
        assinaturasAtivas: ativas,
        recebimentosMes: recebidoMes,
        valorEmAtraso: valorAtraso,
        alunosEmRisco: radarRiscoCount || 0,
        aulasHoje: aulasHojeCount || 0,
        taxaInadimplencia,
        qtdInadimplentes: venciasNaoPagas
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

  if (loading || loadingUser) {
    return (
      <div className="home-container" style={{ padding: '24px' }}>
        <SkeletonDashboard />
      </div>
    );
  }

  const { mrr, assinaturasAtivas, recebimentosMes, valorEmAtraso, alunosEmRisco, aulasHoje, taxaInadimplencia, qtdInadimplentes } = dashboardData;

  const nomeEmpresa = nomeEmpresaContext || 'Empresa';

  return (
    <div className="home-container">
      {/* Linha do título: Boas-vindas + Novas Atualizações */}
      <div className="home-top-row">
        {/* Header de Boas-vindas */}
        <div className="home-header">
          <div className="home-welcome">
            <h1>{getHoraSaudacao()}! 👋</h1>
            <p>{subtitulo}, <strong>{nomeCompleto ? nomeCompleto.split(' ')[0] : nomeEmpresa}</strong></p>
          </div>
        </div>

        {/* Novas Atualizações */}
        <div className="home-novidades">
          <div className="novidades-header">
            <Icon icon="material-symbols:campaign-outline-rounded" width="20" />
            <h3>Novas Atualizações</h3>
          </div>
          {NOVIDADES.length === 0 ? (
            <div className="novidades-empty">
              <p>Nenhuma novidade por enquanto.</p>
            </div>
          ) : (
            <div className="novidades-carrossel">
              {(() => {
                const nov = NOVIDADES[novidadeAtual] || NOVIDADES[0];
                return (
                  <div key={novidadeAtual} className="novidade-item">
                    <div className="novidade-meta">
                      {nov.tag && <span className="novidade-tag">{nov.tag}</span>}
                      {nov.data && <span className="novidade-data">{nov.data}</span>}
                    </div>
                    <p className="novidade-titulo">{nov.titulo}</p>
                    <p className="novidade-texto">{nov.texto}</p>
                  </div>
                );
              })()}
              {NOVIDADES.length > 1 && (
                <div className="novidades-nav">
                  <button
                    className="novidades-seta"
                    onClick={() => setNovidadeAtual((i) => (i - 1 + NOVIDADES.length) % NOVIDADES.length)}
                    aria-label="Novidade anterior"
                  >
                    <Icon icon="mdi:chevron-left" width="18" />
                  </button>
                  <div className="novidades-dots">
                    {NOVIDADES.map((_, idx) => (
                      <button
                        key={idx}
                        className={`novidades-dot ${idx === novidadeAtual ? 'ativo' : ''}`}
                        onClick={() => setNovidadeAtual(idx)}
                        aria-label={`Ir para novidade ${idx + 1}`}
                      />
                    ))}
                  </div>
                  <button
                    className="novidades-seta"
                    onClick={() => setNovidadeAtual((i) => (i + 1) % NOVIDADES.length)}
                    aria-label="Próxima novidade"
                  >
                    <Icon icon="mdi:chevron-right" width="18" />
                  </button>
                </div>
              )}
            </div>
          )}
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

      {/* Indicadores de Gestão - 3 Cards */}
      <div className="home-cards-grid home-cards-3">
        {/* 1. Aulas de Hoje */}
        <div className="home-card card-aulas-hoje">
          <div className="card-header">
            <span className="card-label">Aulas de Hoje</span>
            <div className="card-icon">
              <Icon icon="fluent:calendar-20-regular" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{aulasHoje}</span>
            <span className="card-subtitle">
              {aulasHoje === 1 ? 'aula na grade de hoje' : 'aulas na grade de hoje'}
            </span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('/app/horarios')}>
              Ver agenda
            </button>
          </div>
        </div>

        {/* 2. Radar de Evasão */}
        <div className="home-card card-radar">
          <div className="card-header">
            <span className="card-label">Alunos em Risco de Evasão</span>
            <div className="card-icon">
              <Icon icon="material-symbols:radar" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value" style={{ color: alunosEmRisco > 0 ? '#f44336' : '#4CAF50' }}>
              {alunosEmRisco}
            </span>
            <span className="card-subtitle">
              {alunosEmRisco === 1 ? 'aluno com risco alto/crítico' : 'alunos com risco alto/crítico'}
            </span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('/app/clientes?aba=radar')}>
              Ver radar
            </button>
          </div>
        </div>

        {/* 3. Taxa de Inadimplência */}
        <div className="home-card card-inadimplencia">
          <div className="card-header">
            <span className="card-label">Taxa de Inadimplência</span>
            <div className="card-icon">
              <Icon icon="material-symbols:percent" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value" style={{ color: taxaInadimplencia >= 15 ? '#f44336' : taxaInadimplencia > 0 ? '#FF9800' : '#4CAF50' }}>
              {taxaInadimplencia.toFixed(1).replace('.', ',')}%
            </span>
            <span className="card-subtitle">
              {qtdInadimplentes === 1 ? '1 mensalidade vencida em aberto' : `${qtdInadimplentes} mensalidades vencidas em aberto`}
            </span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('/app/financeiro?status=atrasado')}>
              Ver atrasadas
            </button>
          </div>
        </div>
      </div>

      {/* Onboarding Checklist - painel flutuante */}
      {mostrarChecklist && (
        <OnboardingChecklist completedSteps={onboardingSteps} />
      )}
    </div>
  );
}

export default Home;
