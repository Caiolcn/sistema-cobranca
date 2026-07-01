import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Icon } from '@iconify/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useUser } from './contexts/UserContext';
import { SkeletonDashboard } from './components/Skeleton';
import OnboardingChecklist from './OnboardingChecklist';
import whatsappService from './services/whatsappService';
import { showToast } from './Toast';
import { useUserPlan } from './hooks/useUserPlan';
import FeatureLocked from './FeatureLocked';
import './Home.css';

// Tipos de log que representam uma cobrança/lembrete disparado pelo Mensalli
// (exclui confirmação de pagamento e boas-vindas). tipo nulo = envios diretos do CRM.
const TIPOS_COBRANCA = new Set(['overdue', 'due_day', 'pre_due_3days']);
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Fila "Precisam de você hoje": a mensalidade aparece a partir de N dias de atraso
// (3 dias da cobrança automática + 1 de folga) se ainda não estiver paga.
const DIAS_PARA_FILA = 4;

// Fila "Precisam de você hoje": itens que o gestor dispensou ficam guardados
// no navegador (por usuário), pra não voltarem a aparecer após recarregar.
const chaveDispensadas = (userId) => `mensalli_fila_dispensadas_${userId}`;

const lerDispensadas = (userId) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(chaveDispensadas(userId)) || '[]'));
  } catch {
    return new Set();
  }
};

const salvarDispensada = (userId, mensalidadeId) => {
  try {
    const set = lerDispensadas(userId);
    set.add(mensalidadeId);
    localStorage.setItem(chaveDispensadas(userId), JSON.stringify([...set]));
  } catch {
    /* localStorage indisponível — ignora */
  }
};

function Home() {
  const navigate = useNavigate();
  const { userId, nomeEmpresa: nomeEmpresaContext, nomeCompleto, chavePix, isAdmin, adminViewingAs, userData, loading: loadingUser } = useUser();
  // "Precisam de você hoje" (fila de ação + cobrança direta) é exclusivo do plano Pro
  const { isProOrAbove } = useUserPlan();
  const [loading, setLoading] = useState(true);

  // Estado unificado para todos os dados do dashboard
  const [dashboardData, setDashboardData] = useState({
    mrr: 0,
    assinaturasAtivas: 0,
    recebimentosMes: 0,
    recebimentosMesPassado: 0,
    valorEmAtraso: 0,
    alunosEmRisco: 0,
    aulasHoje: 0,
    taxaInadimplencia: 0,
    qtdInadimplentes: 0,
    recuperadoValor: 0,
    recuperadoQtd: 0,
    cobrancasEnviadas: 0,
    despesasMes: 0,
    lucroMes: 0
  });

  // Listas e séries derivadas (fila de ação, vitórias, tendência)
  const [acoesHoje, setAcoesHoje] = useState([]);
  const [ultimosPagamentos, setUltimosPagamentos] = useState([]);
  const [tendencia, setTendencia] = useState([]);

  // Agenda de hoje (aulas do dia) e aniversariantes da semana
  const [aulasHojeLista, setAulasHojeLista] = useState([]);
  const [aniversariantes, setAniversariantes] = useState([]);
  const [parabensEnviados, setParabensEnviados] = useState(() => new Set());

  // Modal de cobrança rápida (mensagem editável + envio direto pelo WhatsApp)
  const [modalCobranca, setModalCobranca] = useState(null); // { item, mensagem, carregando, enviando }

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

      // Janela de 6 meses atrás (1º dia) para a série de tendência
      const inicio6m = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1).toISOString().split('T')[0];
      // Mês passado (para comparação de momentum)
      const inicioMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString().split('T')[0];
      const fimMesPassado = new Date(hoje.getFullYear(), hoje.getMonth(), 0).toISOString().split('T')[0];

      // Queries essenciais do dashboard
      const [
        { data: todasMensalidades },
        { data: todosClientes },
        { data: whatsappConectado },
        { data: vendasData },
        { count: radarRiscoCount },
        { data: aulasHojeData },
        { data: logsCobranca },
        { data: despesasMesData },
        { data: fixosData }
      ] = await Promise.all([
        // 1. Mensalidades - para KPIs
        supabase
          .from('mensalidades')
          .select('id, valor, valor_pago, data_vencimento, data_pagamento, status, devedor_id, updated_at')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false'),

        // 2. Clientes com assinaturas, planos, telefone e nascimento (aniversariantes)
        supabase
          .from('devedores')
          .select('id, nome, responsavel_nome, telefone, data_nascimento, assinatura_ativa, lixo, plano:planos(valor)')
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

        // 6. Aulas de hoje - turmas/individuais ativas no dia da semana atual (com detalhes)
        supabase
          .from('aulas')
          .select('id, descricao, horario, capacidade, devedor_id, colaboradores(nome), devedores(nome, lixo), modalidades(nome, cor)')
          .eq('user_id', userId)
          .eq('ativo', true)
          .eq('dia_semana', hoje.getDay()),

        // 7. Logs de cobrança do mês - para o card "Recuperado pela cobrança automática"
        supabase
          .from('logs_mensagens')
          .select('mensalidade_id, tipo, status, enviado_em')
          .eq('user_id', userId)
          .eq('status', 'enviado')
          .gte('enviado_em', `${inicio}T00:00:00`),

        // 8. Despesas pagas no mês - para o card "Resultado do mês" (lucro)
        supabase
          .from('despesas')
          .select('valor, status, data_pagamento')
          .eq('user_id', userId)
          .eq('status', 'pago')
          .gte('data_pagamento', inicio)
          .lte('data_pagamento', fim),

        // 9. Roster das turmas (alunos fixos ativos) - para esconder turmas vazias da agenda
        supabase
          .from('aulas_fixos')
          .select('aula_id, devedores!inner(lixo)')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false', { referencedTable: 'devedores' })
      ]);

      // ========== PROCESSAMENTO LOCAL ==========

      const clientesAtivosSet = new Set(todosClientes?.map(c => c.id) || []);

      // Mapa devedor_id -> nome de exibição (aluno; fallback p/ responsável)
      const nomePorDevedor = {};
      // Aniversariantes: alunos que fazem aniversário de hoje até 7 dias à frente
      const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      const listaAniversariantes = [];
      todosClientes?.forEach(c => {
        const nome = (c.nome && c.nome.trim()) || (c.responsavel_nome && c.responsavel_nome.trim()) || 'Aluno';
        nomePorDevedor[c.id] = nome;

        if (!c.data_nascimento) return;
        const partes = c.data_nascimento.split('-'); // [YYYY, MM, DD]
        if (partes.length < 3) return;
        const mesNasc = parseInt(partes[1], 10) - 1;
        const diaNasc = parseInt(partes[2], 10);
        if (Number.isNaN(mesNasc) || Number.isNaN(diaNasc)) return;
        // Próxima ocorrência do aniversário (this year; se já passou, ano que vem)
        let prox = new Date(hoje.getFullYear(), mesNasc, diaNasc);
        if (prox < hojeZero) prox = new Date(hoje.getFullYear() + 1, mesNasc, diaNasc);
        const diffDias = Math.round((prox - hojeZero) / 86400000);
        if (diffDias >= 0 && diffDias <= 7) {
          listaAniversariantes.push({ id: c.id, nome, telefone: c.telefone, dia: diaNasc, mes: mesNasc + 1, diffDias });
        }
      });
      listaAniversariantes.sort((a, b) => a.diffDias - b.diffDias);
      setAniversariantes(listaAniversariantes);

      // Quantos alunos ativos cada turma tem hoje (para esconder turmas vazias)
      const fixosPorAula = {};
      (fixosData || []).forEach(f => {
        if (f.aula_id) fixosPorAula[f.aula_id] = (fixosPorAula[f.aula_id] || 0) + 1;
      });

      // Agenda de hoje: aulas individuais (aluno ativo) + turmas que têm ao menos 1 aluno
      const listaAulasHoje = (aulasHojeData || [])
        .filter(a => {
          if (a.devedor_id) return a.devedores && !a.devedores.lixo; // individual: aluno ativo
          return (fixosPorAula[a.id] || 0) > 0;                       // turma: precisa ter aluno
        })
        .map(a => {
          const prof = a.colaboradores?.nome || '';
          const alunos = a.devedor_id ? 1 : (fixosPorAula[a.id] || 0);
          const meta = a.devedor_id
            ? prof
            : `${alunos} ${alunos === 1 ? 'aluno' : 'alunos'}${prof ? ` · ${prof}` : ''}`;
          return {
            id: a.id,
            horario: (a.horario || '').substring(0, 5),
            titulo: a.devedor_id ? (a.devedores?.nome || 'Aluno') : (a.descricao || 'Turma'),
            meta,
            individual: !!a.devedor_id,
            cor: a.modalidades?.cor || null
          };
        })
        .sort((a, b) => a.horario.localeCompare(b.horario));
      setAulasHojeLista(listaAulasHoje);

      // Despesas pagas no mês → resultado (lucro) do mês
      const despesasMes = (despesasMesData || []).reduce((sum, d) => sum + parseFloat(d.valor || 0), 0);

      // Conjunto de mensalidades que receberam uma cobrança/lembrete neste mês.
      // Guarda também a data do 1º envio para garantir que o lembrete veio ANTES do pagamento.
      const cobrancaPorMensalidade = {}; // mensalidade_id -> data (YYYY-MM-DD) do envio mais antigo
      let cobrancasEnviadas = 0;
      (logsCobranca || []).forEach(l => {
        if (!l.mensalidade_id) return;
        const ehCobranca = l.tipo == null || TIPOS_COBRANCA.has(l.tipo);
        if (!ehCobranca) return;
        cobrancasEnviadas += 1;
        const dataEnvio = (l.enviado_em || '').split('T')[0];
        const atual = cobrancaPorMensalidade[l.mensalidade_id];
        if (!atual || (dataEnvio && dataEnvio < atual)) {
          cobrancaPorMensalidade[l.mensalidade_id] = dataEnvio;
        }
      });

      // Itens que o gestor já dispensou da fila (guardados no navegador)
      const dispensadas = lerDispensadas(userId);

      let recebidoMes = 0;
      let recebidoMesPassado = 0;
      let valorAtraso = 0;
      // Inadimplência: das mensalidades já vencidas (até hoje) de clientes ativos,
      // quantas seguem pendentes vs. o total que deveria ter sido pago.
      let venciasNaoPagas = 0;
      let venciasTotal = 0;
      // Recuperação pela cobrança: pagas no mês, no dia do venc. ou depois, que tiveram lembrete antes
      let recuperadoValor = 0;
      let recuperadoQtd = 0;
      // Tendência: recebido por mês nos últimos 6 meses (chave 'YYYY-M')
      const recebidoPorMes = {};
      // Fila de ação e feed de vitórias
      const atrasados = [];
      const pagamentos = [];

      todasMensalidades?.forEach(p => {
        const valor = parseFloat(p.valor || 0);
        const valorRecebido = parseFloat(p.valor_pago || p.valor || 0);
        const dataVenc = p.data_vencimento;
        const dataPag = p.data_pagamento || (p.status === 'pago' ? (p.updated_at || '').split('T')[0] : null);

        // Recebimentos do mês (status pago, updated_at no mês atual)
        if (p.status === 'pago' && p.updated_at >= `${inicio}T00:00:00` && p.updated_at <= `${fim}T23:59:59`) {
          recebidoMes += valor;
        }

        // Recebimentos do mês passado (momentum) - mesma base (updated_at)
        if (p.status === 'pago' && p.updated_at >= `${inicioMesPassado}T00:00:00` && p.updated_at <= `${fimMesPassado}T23:59:59`) {
          recebidoMesPassado += valor;
        }

        // Série de tendência (últimos 6 meses) por data de pagamento
        if (p.status === 'pago' && dataPag && dataPag >= inicio6m) {
          const [ano, mes] = dataPag.split('-');
          const chave = `${ano}-${parseInt(mes, 10) - 1}`;
          recebidoPorMes[chave] = (recebidoPorMes[chave] || 0) + valorRecebido;
        }

        // Recuperação pela cobrança automática (pagas neste mês)
        if (p.status === 'pago' && dataPag && dataPag >= inicio && dataPag <= fim) {
          // veio no dia do vencimento ou depois (precisou de empurrão) e teve lembrete antes do pgto
          const primeiraCobranca = cobrancaPorMensalidade[p.id];
          if (dataVenc && dataPag >= dataVenc && primeiraCobranca && primeiraCobranca <= dataPag) {
            recuperadoValor += valorRecebido;
            recuperadoQtd += 1;
          }
          // Feed de últimos pagamentos
          pagamentos.push({ id: p.id, nome: nomePorDevedor[p.devedor_id] || 'Aluno', valor: valorRecebido, data: dataPag });
        }

        // Valor em atraso (pendente com vencimento < hoje) - apenas clientes ativos
        if (p.status === 'pendente' && dataVenc < hojeStr && clientesAtivosSet.has(p.devedor_id)) {
          valorAtraso += valor;
          // Fila de ação: entra a partir de DIAS_PARA_FILA dias de atraso e enquanto
          // não estiver paga, salvo se o gestor dispensou.
          const dias = Math.floor((hoje - new Date(`${dataVenc}T00:00:00`)) / 86400000);
          if (dias >= DIAS_PARA_FILA && !dispensadas.has(p.id)) {
            atrasados.push({ id: p.id, devedorId: p.devedor_id, nome: nomePorDevedor[p.devedor_id] || 'Aluno', valor, dias });
          }
        }

        // Taxa de inadimplência (conta mensalidades vencidas de clientes ativos)
        if (dataVenc && dataVenc < hojeStr && (p.status === 'pago' || p.status === 'pendente') && clientesAtivosSet.has(p.devedor_id)) {
          venciasTotal += 1;
          if (p.status === 'pendente') venciasNaoPagas += 1;
        }
      });

      const taxaInadimplencia = venciasTotal > 0 ? (venciasNaoPagas / venciasTotal) * 100 : 0;

      // Monta a série dos últimos 6 meses (do mais antigo ao atual), preenchendo zeros
      const serieTendencia = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const chave = `${d.getFullYear()}-${d.getMonth()}`;
        serieTendencia.push({ mes: MESES_CURTOS[d.getMonth()], valor: Math.round(recebidoPorMes[chave] || 0) });
      }

      // Top 5 atrasados (mais antigos primeiro) e últimos 5 pagamentos
      const filaAcoes = atrasados.sort((a, b) => b.dias - a.dias).slice(0, 5);
      const feedPagamentos = pagamentos.sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 5);

      setAcoesHoje(filaAcoes);
      setUltimosPagamentos(feedPagamentos);
      setTendencia(serieTendencia);

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
        recebimentosMesPassado: recebidoMesPassado,
        valorEmAtraso: valorAtraso,
        alunosEmRisco: radarRiscoCount || 0,
        aulasHoje: listaAulasHoje.length,
        taxaInadimplencia,
        qtdInadimplentes: venciasNaoPagas,
        recuperadoValor,
        recuperadoQtd,
        cobrancasEnviadas,
        despesasMes,
        lucroMes: recebidoMes - despesasMes
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

  // Remove um item da fila "Precisam de você hoje" (apenas oculta; não mexe no aluno)
  const dispensarAcao = (item) => {
    salvarDispensada(userId, item.id);
    setAcoesHoje((prev) => prev.filter((a) => a.id !== item.id));
  };

  // Envia mensagem de parabéns pelo WhatsApp para o aniversariante (1 clique)
  const enviarParabens = async (aluno) => {
    if (!aluno.telefone) {
      showToast('Este aluno não tem telefone cadastrado', 'error');
      return;
    }
    if (parabensEnviados.has(aluno.id)) return;
    const primeiroNome = aluno.nome.split(' ')[0];
    const empresa = nomeEmpresaContext || 'nossa equipe';
    const mensagem = `🎉 Feliz aniversário, ${primeiroNome}! 🥳\n\nToda a equipe da ${empresa} deseja um dia incrível e cheio de alegria pra você. Conte com a gente sempre! 💜`;
    try {
      const resultado = await whatsappService.enviarMensagem(aluno.telefone, mensagem);
      if (resultado && resultado.sucesso === false) {
        showToast(resultado.erro || 'Não foi possível enviar', 'error');
        return;
      }
      setParabensEnviados((prev) => new Set(prev).add(aluno.id));
      showToast(`Parabéns enviado para ${primeiroNome}! 🎂`, 'success');
    } catch (e) {
      showToast('Erro ao enviar: ' + e.message, 'error');
    }
  };

  // Abre o modal de cobrança e carrega a prévia da mensagem (template do usuário já preenchido)
  const abrirModalCobranca = async (item) => {
    setModalCobranca({ item, mensagem: '', carregando: true, enviando: false });
    try {
      const { mensagem } = await whatsappService.gerarPreviewMensagem(item.id);
      setModalCobranca((prev) => (prev && prev.item.id === item.id
        ? { ...prev, mensagem: mensagem || '', carregando: false }
        : prev));
    } catch (e) {
      setModalCobranca((prev) => (prev && prev.item.id === item.id
        ? { ...prev, mensagem: '', carregando: false }
        : prev));
    }
  };

  const restaurarMensagemPadrao = async () => {
    if (!modalCobranca) return;
    const { item } = modalCobranca;
    setModalCobranca((prev) => ({ ...prev, carregando: true }));
    try {
      const { mensagem } = await whatsappService.gerarPreviewMensagem(item.id);
      setModalCobranca((prev) => (prev ? { ...prev, mensagem: mensagem || '', carregando: false } : prev));
    } catch {
      setModalCobranca((prev) => (prev ? { ...prev, carregando: false } : prev));
    }
  };

  const enviarCobrancaModal = async () => {
    if (!modalCobranca || !modalCobranca.mensagem.trim() || modalCobranca.enviando) return;
    const { item, mensagem } = modalCobranca;
    setModalCobranca((prev) => ({ ...prev, enviando: true }));
    try {
      const resultado = await whatsappService.enviarCobranca(item.id, mensagem);
      if (resultado.sucesso) {
        showToast('Cobrança enviada pelo WhatsApp! 🚀', 'success');
        setAcoesHoje((prev) => prev.filter((a) => a.id !== item.id));
        setModalCobranca(null);
      } else {
        showToast(resultado.erro || 'Não foi possível enviar a cobrança', 'error');
        setModalCobranca((prev) => (prev ? { ...prev, enviando: false } : prev));
      }
    } catch (e) {
      showToast('Erro ao enviar: ' + e.message, 'error');
      setModalCobranca((prev) => (prev ? { ...prev, enviando: false } : prev));
    }
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

  const { mrr, assinaturasAtivas, recebimentosMes, recebimentosMesPassado, valorEmAtraso, alunosEmRisco, aulasHoje, taxaInadimplencia, qtdInadimplentes, recuperadoValor, recuperadoQtd, cobrancasEnviadas, despesasMes, lucroMes } = dashboardData;

  const nomeEmpresa = nomeEmpresaContext || 'Empresa';

  // Destaca a próxima aula do dia (primeira cujo horário ainda não passou)
  const agoraHHMM = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const idxProximaAula = aulasHojeLista.findIndex((a) => a.horario && a.horario >= agoraHHMM);

  // Momentum: variação % dos recebimentos vs. mês passado
  const deltaRecebimentos = recebimentosMesPassado > 0
    ? ((recebimentosMes - recebimentosMesPassado) / recebimentosMesPassado) * 100
    : null;

  const formatarMoedaCurta = (valor) => {
    if (valor >= 1000) return `R$ ${(valor / 1000).toFixed(1).replace('.', ',')}k`;
    return `R$ ${Math.round(valor)}`;
  };

  const formatarDiaMes = (dataStr) => {
    if (!dataStr) return '';
    const [, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}`;
  };

  return (
    <div className="home-container">
      {/* Header de Boas-vindas */}
      <div className="home-header">
        <div className="home-welcome">
          <h1>{getHoraSaudacao()}! 👋</h1>
          <p>{subtitulo}, <strong>{nomeCompleto ? nomeCompleto.split(' ')[0] : nomeEmpresa}</strong></p>
        </div>
      </div>

      {/* Card-herói: prova de valor do Mensalli (dinheiro recuperado pela cobrança automática) */}
      <div className="home-hero-recuperado" onClick={() => navigate('/app/financeiro?status=pago')}>
        <div className="hero-recuperado-main">
          <div className="hero-recuperado-icon">
            <Icon icon="material-symbols:savings-outline-rounded" width="28" />
          </div>
          <div className="hero-recuperado-texto">
            <span className="hero-recuperado-label">Recuperado pela cobrança automática este mês</span>
            <span className="hero-recuperado-valor">{formatarMoeda(recuperadoValor)}</span>
            <span className="hero-recuperado-sub">
              {recuperadoQtd === 0
                ? 'Nenhuma mensalidade paga após lembrete ainda este mês'
                : `${recuperadoQtd} ${recuperadoQtd === 1 ? 'mensalidade paga' : 'mensalidades pagas'} depois do lembrete no WhatsApp`}
            </span>
          </div>
        </div>
        <div className="hero-recuperado-stat">
          <span className="hero-recuperado-stat-valor">{cobrancasEnviadas}</span>
          <span className="hero-recuperado-stat-label">
            {cobrancasEnviadas === 1 ? 'cobrança enviada' : 'cobranças enviadas'} no piloto automático
          </span>
        </div>
      </div>

      {/* KPIs financeiros */}
      <div className="home-cards-grid home-cards-3">
        {/* 1. MRR */}
        <div className="home-card card-mrr" onClick={() => navigate('/app/clientes?status=ativo')}>
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
        </div>

        {/* 2. Recebimentos do Mês */}
        <div className="home-card card-recebimentos" onClick={() => navigate('/app/financeiro?status=pago')}>
          <div className="card-header">
            <span className="card-label">Recebimentos do Mês</span>
            <div className="card-icon">
              <Icon icon="material-symbols:attach-money" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{formatarMoeda(recebimentosMes)}</span>
            <span className="card-subtitle">
              {deltaRecebimentos === null ? (
                <span className="card-trend neutro">Sem base do mês passado</span>
              ) : (
                <span className={`card-trend ${deltaRecebimentos >= 0 ? 'sobe' : 'desce'}`}>
                  <Icon icon={deltaRecebimentos >= 0 ? 'mdi:trending-up' : 'mdi:trending-down'} width="15" />
                  {`${deltaRecebimentos >= 0 ? '+' : ''}${deltaRecebimentos.toFixed(0)}% vs. mês passado`}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* 3. Resultado do Mês (lucro = recebido - despesas pagas) */}
        <div className="home-card card-lucro" onClick={() => navigate('/app/financeiro?aba=despesas')}>
          <div className="card-header">
            <span className="card-label">Resultado do Mês</span>
            <div className="card-icon">
              <Icon icon="material-symbols:account-balance-wallet-outline" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value" style={{ color: lucroMes > 0 ? '#16a34a' : lucroMes < 0 ? '#f44336' : '#374151' }}>
              {formatarMoeda(lucroMes)}
            </span>
            <span className="card-subtitle">
              {formatarMoeda(recebimentosMes)} recebido − {formatarMoeda(despesasMes)} despesas
            </span>
          </div>
        </div>

      </div>

      {/* Indicadores de risco/inadimplência — prioridade máxima, logo abaixo dos financeiros */}
      <div className="home-cards-grid home-cards-3">
        {/* 1. Valor em Atraso */}
        <div className="home-card card-atraso" onClick={() => navigate('/app/financeiro?status=atrasado')}>
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
        </div>

        {/* 2. Taxa de Inadimplência */}
        <div className="home-card card-inadimplencia" onClick={() => navigate('/app/financeiro?status=atrasado')}>
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
        </div>

        {/* 3. Alunos em Risco de Evasão */}
        <div className="home-card card-radar" onClick={() => navigate('/app/clientes?aba=radar')}>
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
        </div>
      </div>

      {/* Agenda de hoje + Aniversariantes da semana */}
      <div className="home-two-columns home-acao-vitoria">
        {/* Sua agenda de hoje */}
        <div className="home-section home-painel">
          <div className="section-header">
            <Icon icon="fluent:calendar-20-regular" width="22" />
            <div className="section-header-texto">
              <h2>Sua agenda de hoje</h2>
              <span className="section-header-sub">{aulasHoje} {aulasHoje === 1 ? 'aula na grade' : 'aulas na grade'}</span>
            </div>
          </div>
          {aulasHojeLista.length === 0 ? (
            <div className="empty-state compact">
              <Icon icon="material-symbols:free-cancellation-rounded" width="22" />
              <p>Nenhuma aula na grade de hoje.</p>
            </div>
          ) : (
            <div className="agenda-hoje-lista">
              {aulasHojeLista.map((a, idx) => (
                <div key={a.id} className={`agenda-hoje-item ${idx === idxProximaAula ? 'proxima' : ''}`}>
                  <span
                    className="agenda-hoje-hora"
                    style={a.cor ? { borderColor: a.cor, color: a.cor } : undefined}
                  >
                    {a.horario || '--:--'}
                  </span>
                  <div className="agenda-hoje-info">
                    <span className="agenda-hoje-titulo">
                      {a.individual && <Icon icon="material-symbols:person-outline" width="14" />}
                      {a.titulo}
                    </span>
                    {a.meta && <span className="agenda-hoje-prof">{a.meta}</span>}
                  </div>
                  {idx === idxProximaAula && <span className="agenda-hoje-badge">Próxima</span>}
                </div>
              ))}
            </div>
          )}
          <button className="painel-footer-link" onClick={() => navigate('/app/horarios')}>
            Ver agenda completa <Icon icon="mdi:arrow-right" width="15" />
          </button>
        </div>

        {/* Aniversariantes da semana */}
        <div className="home-section home-painel">
          <div className="section-header">
            <Icon icon="material-symbols:cake-outline" width="22" />
            <div className="section-header-texto">
              <h2>Aniversariantes da semana</h2>
              <span className="section-header-sub">Próximos 7 dias</span>
            </div>
            {aniversariantes.length > 0 && <span className="badge-count">{aniversariantes.length}</span>}
          </div>
          {aniversariantes.length === 0 ? (
            <div className="empty-state compact">
              <Icon icon="material-symbols:cake-outline" width="22" />
              <p>Nenhum aniversariante nos próximos 7 dias.</p>
            </div>
          ) : (
            <div className="painel-lista">
              {aniversariantes.map((a) => {
                const enviado = parabensEnviados.has(a.id);
                const quando = a.diffDias === 0
                  ? 'Hoje 🎉'
                  : a.diffDias === 1
                    ? 'Amanhã'
                    : `${String(a.dia).padStart(2, '0')}/${String(a.mes).padStart(2, '0')}`;
                return (
                  <div key={a.id} className="aniversario-item">
                    <div className="aniversario-icon">
                      <Icon icon="material-symbols:cake-rounded" width="16" />
                    </div>
                    <div className="aniversario-info">
                      <span className="aniversario-nome">{a.nome}</span>
                      <span className={`aniversario-data ${a.diffDias === 0 ? 'hoje' : ''}`}>{quando}</span>
                    </div>
                    <button
                      className={`aniversario-btn ${enviado ? 'enviado' : ''}`}
                      onClick={() => enviarParabens(a)}
                      disabled={enviado || !a.telefone}
                      title={!a.telefone ? 'Sem telefone cadastrado' : 'Enviar parabéns pelo WhatsApp'}
                    >
                      {enviado ? (
                        <><Icon icon="mdi:check" width="15" /> Enviado</>
                      ) : (
                        <><Icon icon="ic:baseline-whatsapp" width="15" /> Parabenizar</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Fila de ação + Feed de vitórias */}
      <div className="home-two-columns home-acao-vitoria">
        {/* Precisam de você hoje — exclusivo Pro */}
        <FeatureLocked locked={!isProOrAbove} requiredPlan="Pro" featureName='A fila "Precisam de você hoje"'>
          <div className="home-section home-painel">
            <div className="section-header">
              <Icon icon="material-symbols:notification-important-outline-rounded" width="22" />
              <div className="section-header-texto">
                <h2>Precisam de você hoje</h2>
                <span className="section-header-sub">Vencidas há {DIAS_PARA_FILA}+ dias e ainda sem pagamento</span>
              </div>
              {isProOrAbove && acoesHoje.length > 0 && <span className="badge-count">{acoesHoje.length}</span>}
            </div>
            {acoesHoje.length === 0 ? (
              <div className="empty-state compact">
                <Icon icon="material-symbols:check-circle-outline-rounded" width="22" />
                <p>Ninguém vencido há mais de {DIAS_PARA_FILA} dias. Tudo em dia! 🎉</p>
              </div>
            ) : (
              <div className="painel-lista">
                {acoesHoje.map((a) => (
                  <div key={a.id} className="acao-item" onClick={() => abrirModalCobranca(a)}>
                    <div className="acao-info">
                      <span className="acao-nome">{a.nome}</span>
                      <span className="acao-detalhe">{a.dias} {a.dias === 1 ? 'dia' : 'dias'} em atraso · {formatarMoeda(a.valor)}</span>
                    </div>
                    <div className="acao-acoes">
                      <button className="acao-btn" onClick={(e) => { e.stopPropagation(); abrirModalCobranca(a); }}>
                        <Icon icon="ic:baseline-whatsapp" width="16" /> Cobrar
                      </button>
                      <button
                        className="acao-dispensar"
                        title="Tirar da lista (não quero cobrar)"
                        onClick={(e) => { e.stopPropagation(); dispensarAcao(a); }}
                      >
                        <Icon icon="mdi:close" width="16" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </FeatureLocked>

        {/* Últimos pagamentos */}
        <div className="home-section home-painel">
          <div className="section-header">
            <Icon icon="material-symbols:celebration-outline-rounded" width="22" />
            <h2>Últimos pagamentos</h2>
          </div>
          {ultimosPagamentos.length === 0 ? (
            <div className="empty-state compact">
              <Icon icon="material-symbols:hourglass-empty-rounded" width="22" />
              <p>Nenhum pagamento recebido este mês ainda.</p>
            </div>
          ) : (
            <div className="painel-lista">
              {ultimosPagamentos.map((p) => (
                <div key={p.id} className="vitoria-item">
                  <div className="vitoria-icon">
                    <Icon icon="material-symbols:check-rounded" width="16" />
                  </div>
                  <div className="vitoria-info">
                    <span className="vitoria-nome">{p.nome}</span>
                    <span className="vitoria-data">{formatarDiaMes(p.data)}</span>
                  </div>
                  <span className="vitoria-valor">+{formatarMoeda(p.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tendência de recebimentos - últimos 6 meses */}
      <div className="home-section">
        <div className="section-header">
          <Icon icon="material-symbols:show-chart-rounded" width="22" />
          <h2>Recebimentos dos últimos 6 meses</h2>
        </div>
        <div className="home-grafico-recharts" style={{ minHeight: 280 }}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={tendencia} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRecebido" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8867A1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#8867A1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
              <YAxis tickFormatter={formatarMoedaCurta} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} width={56} />
              <Tooltip
                formatter={(v) => [formatarMoeda(v), 'Recebido']}
                labelStyle={{ color: '#374151', fontWeight: 600 }}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
              />
              <Area type="monotone" dataKey="valor" stroke="#8867A1" strokeWidth={2.5} fill="url(#gradRecebido)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Modal de cobrança rápida */}
      {modalCobranca && (
        <div className="modal-overlay" onClick={() => !modalCobranca.enviando && setModalCobranca(null)}>
          <div className="modal-content modal-cobranca" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-cobranca-titulo">
                <div className="modal-cobranca-avatar">
                  <Icon icon="ic:baseline-whatsapp" width="22" />
                </div>
                <div>
                  <h3>Cobrar {modalCobranca.item.nome}</h3>
                  <span className="modal-cobranca-sub">
                    {modalCobranca.item.dias} {modalCobranca.item.dias === 1 ? 'dia' : 'dias'} em atraso · {formatarMoeda(modalCobranca.item.valor)}
                  </span>
                </div>
              </div>
              <button
                className="modal-cobranca-fechar"
                onClick={() => !modalCobranca.enviando && setModalCobranca(null)}
                aria-label="Fechar"
              >
                <Icon icon="mdi:close" width="20" />
              </button>
            </div>

            <div className="modal-cobranca-body">
              <div className="modal-cobranca-label-row">
                <label>Mensagem</label>
                <button className="modal-cobranca-restaurar" onClick={restaurarMensagemPadrao} disabled={modalCobranca.carregando || modalCobranca.enviando}>
                  <Icon icon="mdi:restore" width="14" /> Restaurar texto padrão
                </button>
              </div>
              {modalCobranca.carregando ? (
                <div className="modal-cobranca-loading">
                  <Icon icon="mdi:loading" className="spin" width="22" />
                  <span>Montando a mensagem…</span>
                </div>
              ) : (
                <textarea
                  className="modal-cobranca-textarea"
                  value={modalCobranca.mensagem}
                  onChange={(e) => setModalCobranca((prev) => ({ ...prev, mensagem: e.target.value }))}
                  rows={10}
                  placeholder="Escreva a mensagem da cobrança…"
                  disabled={modalCobranca.enviando}
                />
              )}
              <span className="modal-cobranca-dica">
                Edite à vontade. O link de pagamento é inserido automaticamente no envio.
              </span>
            </div>

            <div className="modal-cobranca-footer">
              <button
                className="modal-cobranca-btn cancelar"
                onClick={() => setModalCobranca(null)}
                disabled={modalCobranca.enviando}
              >
                Cancelar
              </button>
              <button
                className="modal-cobranca-btn enviar"
                onClick={enviarCobrancaModal}
                disabled={modalCobranca.carregando || modalCobranca.enviando || !modalCobranca.mensagem.trim()}
              >
                {modalCobranca.enviando ? (
                  <><Icon icon="mdi:loading" className="spin" width="18" /> Enviando…</>
                ) : (
                  <><Icon icon="ic:baseline-whatsapp" width="18" /> Enviar pelo WhatsApp</>
                )}
              </button>
            </div>
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
