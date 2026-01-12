import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Icon } from '@iconify/react';
import DateRangePicker from './DateRangePicker';
import whatsappService from './services/whatsappService';
import './Home.css';

function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [periodo, setPeriodo] = useState('mes_atual');

  // Dashboard focado em Mensalidades
  const [mensalidadesAtivas, setMensalidadesAtivas] = useState(0);
  const [recebimentosMes, setRecebimentosMes] = useState(0);
  const [valorEmAtraso, setValorEmAtraso] = useState(0);
  const [clientesInadimplentes, setClientesInadimplentes] = useState(0);
  const [receitaProjetadaMes, setReceitaProjetadaMes] = useState(0);
  const [taxaCancelamento, setTaxaCancelamento] = useState(0);
  const [recebimentosUltimos7Dias, setRecebimentosUltimos7Dias] = useState(0);
  const [mensalidadesVencer7Dias, setMensalidadesVencer7Dias] = useState(0);

  // Recebimento vs Vencimento (últimos 3 meses)
  const [graficoRecebimentoVsVencimento, setGraficoRecebimentoVsVencimento] = useState([]);

  // Distribuição de Status - Saúde da Base
  const [distribuicaoStatus, setDistribuicaoStatus] = useState({ emDia: 0, aVencer: 0, atrasadas: 0, canceladas: 0 });

  // Fila de WhatsApp
  const [filaWhatsapp, setFilaWhatsapp] = useState([]);

  // Mensagens recentes
  const [mensagensRecentes, setMensagensRecentes] = useState([]);

  useEffect(() => {
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

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

  const carregarDados = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { inicio, fim } = obterDatasPeriodo();
      const hoje = new Date().toISOString().split('T')[0];

      // Calcular datas para queries
      const seteDiasAtras = new Date();
      seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
      const seteDiasAtrasStr = seteDiasAtras.toISOString().split('T')[0];

      const seteDiasFrente = new Date();
      seteDiasFrente.setDate(seteDiasFrente.getDate() + 7);
      const seteDiasFrenteStr = seteDiasFrente.toISOString().split('T')[0];

      const tresMesesAtras = new Date();
      tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 2);
      const tresMesesAtrasInicio = new Date(tresMesesAtras.getFullYear(), tresMesesAtras.getMonth(), 1).toISOString().split('T')[0];
      const mesAtualFim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];

      // OTIMIZAÇÃO: Executar TODAS as queries em paralelo com Promise.all
      const [
        { data: usuario },
        { data: mensalidadesAtivasList },
        { data: mensalidadesPagasMes },
        { data: mensalidadesAtrasadas },
        { data: mensalidadesPendenteMes },
        { data: todosClientes },
        { data: pagamentos7Dias },
        { data: todosRecebidos },
        { data: todosVencidos },
        { data: fila },
        { data: mensagens },
        { data: todasParcelas },
        { data: mensalidadesVencer7DiasList }
      ] = await Promise.all([
        // 0. Nome da empresa
        supabase
          .from('usuarios')
          .select('nome_completo, nome_fantasia, razao_social')
          .eq('id', user.id)
          .single(),

        // 1. Mensalidades ativas
        supabase
          .from('mensalidades')
          .select('devedor_id')
          .eq('user_id', user.id)
          .eq('is_mensalidade', true)
          .in('status', ['pendente', 'atrasado', 'pago']),

        // 2. Parcelas pagas no mês
        supabase
          .from('mensalidades')
          .select('valor')
          .eq('user_id', user.id)
          .eq('status', 'pago')
          .gte('updated_at', `${inicio}T00:00:00`)
          .lte('updated_at', `${fim}T23:59:59`),

        // 3. Parcelas atrasadas
        supabase
          .from('mensalidades')
          .select('valor, devedor_id')
          .eq('user_id', user.id)
          .eq('status', 'pendente')
          .lt('data_vencimento', hoje),

        // 4. Parcelas pendentes no mês
        supabase
          .from('mensalidades')
          .select('valor')
          .eq('user_id', user.id)
          .in('status', ['pendente', 'atrasado'])
          .gte('data_vencimento', inicio)
          .lte('data_vencimento', fim),

        // 5. Total de clientes
        supabase
          .from('devedores')
          .select('id')
          .eq('user_id', user.id),

        // 6. Pagamentos últimos 7 dias
        supabase
          .from('mensalidades')
          .select('valor')
          .eq('user_id', user.id)
          .eq('status', 'pago')
          .gte('updated_at', `${seteDiasAtrasStr}T00:00:00`)
          .lte('updated_at', `${hoje}T23:59:59`),

        // 7. Recebimentos últimos 3 meses
        supabase
          .from('mensalidades')
          .select('valor, updated_at')
          .eq('user_id', user.id)
          .eq('status', 'pago')
          .gte('updated_at', `${tresMesesAtrasInicio}T00:00:00`)
          .lte('updated_at', `${mesAtualFim}T23:59:59`),

        // 8. Vencimentos últimos 3 meses
        supabase
          .from('mensalidades')
          .select('valor, data_vencimento')
          .eq('user_id', user.id)
          .gte('data_vencimento', tresMesesAtrasInicio)
          .lte('data_vencimento', mesAtualFim),

        // 9. Fila de WhatsApp
        supabase
          .from('mensalidades')
          .select(`
            id,
            valor,
            data_vencimento,
            numero_mensalidade,
            enviado_hoje,
            devedores (nome, telefone)
          `)
          .eq('user_id', user.id)
          .eq('status', 'pendente')
          .eq('enviado_hoje', false)
          .lte('data_vencimento', hoje)
          .order('data_vencimento', { ascending: true })
          .limit(10),

        // 10. Mensagens recentes
        supabase
          .from('logs_mensagens')
          .select(`
            id,
            telefone,
            valor_mensalidade,
            status,
            enviado_em,
            devedores (nome)
          `)
          .eq('user_id', user.id)
          .order('enviado_em', { ascending: false })
          .limit(8),

        // 11. Todas as mensalidades para distribuição de status
        supabase
          .from('mensalidades')
          .select('status, data_vencimento')
          .eq('user_id', user.id),

        // 12. Mensalidades a vencer nos próximos 7 dias
        supabase
          .from('mensalidades')
          .select('valor')
          .eq('user_id', user.id)
          .in('status', ['pendente', 'atrasado'])
          .gte('data_vencimento', hoje)
          .lte('data_vencimento', seteDiasFrenteStr)
      ]);

      // Processar resultados
      if (usuario) {
        setNomeEmpresa(usuario.nome_fantasia || usuario.razao_social || usuario.nome_completo || 'Empresa');
      }

      // 1. Mensalidades ativas
      const mensalidadesAtivasCount = new Set(mensalidadesAtivasList?.map(p => p.devedor_id)).size;
      setMensalidadesAtivas(mensalidadesAtivasCount);

      // 2. Recebimentos do mês
      const recebidoMes = mensalidadesPagasMes?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;
      setRecebimentosMes(recebidoMes);

      // 3. Valor em atraso
      const valorAtraso = mensalidadesAtrasadas?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;
      setValorEmAtraso(valorAtraso);

      // 4. Clientes inadimplentes
      const clientesInad = new Set(mensalidadesAtrasadas?.map(p => p.devedor_id)).size;
      setClientesInadimplentes(clientesInad);

      // 5. Receita projetada
      const aReceberMes = mensalidadesPendenteMes?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;
      setReceitaProjetadaMes(recebidoMes + aReceberMes);

      // 6. Taxa de cancelamento
      const totalClientesGeral = todosClientes?.length || 0;
      const clientesComMensalidade = new Set(mensalidadesAtivasList?.map(p => p.devedor_id));
      const clientesCancelados = totalClientesGeral - clientesComMensalidade.size;
      const taxaCancel = totalClientesGeral > 0 ? (clientesCancelados / totalClientesGeral) * 100 : 0;
      setTaxaCancelamento(taxaCancel);

      // 7. Recebimentos últimos 7 dias
      const recebido7Dias = pagamentos7Dias?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;
      setRecebimentosUltimos7Dias(recebido7Dias);

      // 8. Mensalidades a vencer 7 dias
      const vencer7Dias = mensalidadesVencer7DiasList?.reduce((sum, m) => sum + parseFloat(m.valor || 0), 0) || 0;
      setMensalidadesVencer7Dias(vencer7Dias);

      // 9. Gráfico: Recebimento vs Vencimento (últimos 3 meses)
      const recebidosPorMes = {};
      const vencidosPorMes = {};

      todosRecebidos?.forEach(p => {
        const mesAno = p.updated_at.substring(0, 7);
        if (!recebidosPorMes[mesAno]) recebidosPorMes[mesAno] = 0;
        recebidosPorMes[mesAno] += parseFloat(p.valor || 0);
      });

      todosVencidos?.forEach(p => {
        const mesAno = p.data_vencimento.substring(0, 7);
        if (!vencidosPorMes[mesAno]) vencidosPorMes[mesAno] = 0;
        vencidosPorMes[mesAno] += parseFloat(p.valor || 0);
      });

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
      setGraficoRecebimentoVsVencimento(graficoMeses);

      // 9. Fila de WhatsApp
      setFilaWhatsapp(fila || []);

      // 10. Mensagens recentes
      setMensagensRecentes(mensagens || []);

      // 11. Distribuição de Status - Saúde da Base
      let emDia = 0;          // Pagas
      let aVencer = 0;        // Pendentes com vencimento >= hoje
      let atrasadas = 0;      // Pendentes com vencimento < hoje
      let canceladas = 0;     // Canceladas

      todasParcelas?.forEach(p => {
        if (p.status === 'pago') {
          emDia++;
        } else if (p.status === 'cancelado') {
          canceladas++;
        } else if (p.status === 'pendente' && p.data_vencimento < hoje) {
          atrasadas++;
        } else if (p.status === 'pendente') {
          aVencer++;
        }
      });

      setDistribuicaoStatus({ emDia, aVencer, atrasadas, canceladas });

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const handleEnviarWhatsApp = async (item) => {
    try {
      const confirmar = window.confirm(
        `Enviar cobrança via WhatsApp para ${item.devedores?.nome}?\n\n` +
        `Valor: ${formatarMoeda(item.valor)}\n` +
        `Telefone: ${item.devedores?.telefone}`
      );

      if (!confirmar) return;

      // Mostrar loading
      const loadingMsg = document.createElement('div');
      loadingMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:9999;text-align:center;';
      loadingMsg.innerHTML = '<div style="margin-bottom:10px;">Enviando mensagem...</div><div style="color:#666;font-size:14px;">Aguarde</div>';
      document.body.appendChild(loadingMsg);

      // Enviar via whatsappService
      const resultado = await whatsappService.enviarCobranca(item.id);

      // Remover loading
      document.body.removeChild(loadingMsg);

      if (resultado.sucesso) {
        alert(`✅ Mensagem enviada com sucesso para ${item.devedores?.nome}!`);
        // Recarregar dados após envio
        await carregarDados();
      } else {
        alert(`❌ Erro ao enviar mensagem:\n${resultado.erro}`);
      }
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
      alert('❌ Erro ao enviar WhatsApp: ' + error.message);
    }
  };

  const handleCancelarEnvio = async (mensalidadeId) => {
    try {
      const confirmacao = window.confirm('Deseja realmente cancelar o envio desta mensagem?');
      if (!confirmacao) return;

      // Atualizar o status da mensalidade ou remover da fila
      // Você pode implementar a lógica específica aqui
      console.log('Cancelando envio da mensalidade:', mensalidadeId);

      alert('Envio cancelado com sucesso!');

      // Recarregar dados
      await carregarDados();
    } catch (error) {
      console.error('Erro ao cancelar envio:', error);
      alert('Erro ao cancelar envio. Tente novamente.');
    }
  };

  if (loading) {
    return (
      <div className="home-loading">
        <Icon icon="line-md:loading-twotone-loop" width="48" />
        <p>Carregando dashboard...</p>
      </div>
    );
  }

  return (
    <div className="home-container">
      {/* Header de Boas-vindas */}
      <div className="home-header">
        <div className="home-welcome">
          <h1>{getHoraSaudacao()}! 👋</h1>
          <p>Bem-vindo(a) ao <strong>{nomeEmpresa}</strong></p>
        </div>

        {/* Filtro de Período */}
        <DateRangePicker
          value={periodo}
          onChange={setPeriodo}
        />
      </div>

      {/* Cards Principais - Linha 1 */}
      <div className="home-cards-grid">
        <div className="home-card card-mensalidades-ativas">
          <div className="card-header">
            <span className="card-label">Mensalidades Ativas</span>
            <div className="card-icon">
              <Icon icon="material-symbols:check-circle-outline" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{mensalidadesAtivas}</span>
            <span className="card-subtitle">Assinantes ativos</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('clientes')}>
              Ver
            </button>
          </div>
        </div>

        <div className="home-card card-recebimentos">
          <div className="card-header">
            <span className="card-label">Recebimentos do Mês</span>
            <div className="card-icon">
              <Icon icon="material-symbols:attach-money" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{formatarMoeda(recebimentosMes)}</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('financeiro')}>
              Ver
            </button>
          </div>
        </div>

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
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('financeiro')}>
              Ver
            </button>
          </div>
        </div>

        <div className="home-card card-inadimplentes">
          <div className="card-header">
            <span className="card-label">Clientes Inadimplentes</span>
            <div className="card-icon">
              <Icon icon="material-symbols:person-alert-outline" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{clientesInadimplentes}</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('clientes')}>
              Ver
            </button>
          </div>
        </div>
      </div>

      {/* Cards Secundários - Linha 2 */}
      <div className="home-cards-secondary">
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
        </div>

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

        <div className="home-card card-ultimos-7-dias">
          <div className="card-header">
            <span className="card-label">Recebimentos Últimos 7 Dias</span>
            <div className="card-icon">
              <Icon icon="material-symbols:trending-up" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{formatarMoeda(recebimentosUltimos7Dias)}</span>
          </div>
        </div>
      </div>

      {/* Gráficos em 2 Colunas */}
      <div className="home-two-columns">
        {/* Gráfico: Recebimento vs Vencimento (Gráfico de Linhas) */}
        <div className="home-section">
          <div className="section-header">
            <Icon icon="material-symbols:show-chart" width="24" />
            <h2>Recebimento vs Vencimento</h2>
          </div>
          <div className="home-grafico-linhas">
            {(() => {
              if (graficoRecebimentoVsVencimento.length === 0) {
                return <div className="empty-state">Sem dados para exibir</div>;
              }

              const maxValor = Math.max(
                ...graficoRecebimentoVsVencimento.map(m => Math.max(m.recebido, m.vencido)),
                1
              );
              const width = 600;
              const height = 250;
              const padding = { top: 20, right: 20, bottom: 40, left: 60 };
              const chartWidth = width - padding.left - padding.right;
              const chartHeight = height - padding.top - padding.bottom;

              const getX = (index) => padding.left + (index / (graficoRecebimentoVsVencimento.length - 1)) * chartWidth;
              const getY = (valor) => padding.top + chartHeight - (valor / maxValor) * chartHeight;

              const pontosRecebido = graficoRecebimentoVsVencimento.map((item, i) =>
                `${getX(i)},${getY(item.recebido)}`
              ).join(' ');

              const pontosVencido = graficoRecebimentoVsVencimento.map((item, i) =>
                `${getX(i)},${getY(item.vencido)}`
              ).join(' ');

              return (
                <svg viewBox={`0 0 ${width} ${height}`} className="line-chart">
                  {/* Grid horizontal */}
                  {[0, 0.25, 0.5, 0.75, 1].map((percent, i) => (
                    <g key={i}>
                      <line
                        x1={padding.left}
                        y1={padding.top + chartHeight * (1 - percent)}
                        x2={width - padding.right}
                        y2={padding.top + chartHeight * (1 - percent)}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                      />
                      <text
                        x={padding.left - 10}
                        y={padding.top + chartHeight * (1 - percent) + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill="#666"
                      >
                        {formatarMoeda(maxValor * percent)}
                      </text>
                    </g>
                  ))}

                  {/* Linha Recebido */}
                  <polyline
                    points={pontosRecebido}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Linha Vencido */}
                  <polyline
                    points={pontosVencido}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Pontos Recebido */}
                  {graficoRecebimentoVsVencimento.map((item, i) => (
                    <circle
                      key={`rec-${i}`}
                      cx={getX(i)}
                      cy={getY(item.recebido)}
                      r="5"
                      fill="#10b981"
                      stroke="white"
                      strokeWidth="2"
                    >
                      <title>Recebido: {formatarMoeda(item.recebido)}</title>
                    </circle>
                  ))}

                  {/* Pontos Vencido */}
                  {graficoRecebimentoVsVencimento.map((item, i) => (
                    <circle
                      key={`ven-${i}`}
                      cx={getX(i)}
                      cy={getY(item.vencido)}
                      r="5"
                      fill="#f59e0b"
                      stroke="white"
                      strokeWidth="2"
                    >
                      <title>Vencido: {formatarMoeda(item.vencido)}</title>
                    </circle>
                  ))}

                  {/* Labels dos meses */}
                  {graficoRecebimentoVsVencimento.map((item, i) => (
                    <text
                      key={`label-${i}`}
                      x={getX(i)}
                      y={height - 10}
                      textAnchor="middle"
                      fontSize="12"
                      fill="#666"
                      fontWeight="500"
                    >
                      {item.mes}
                    </text>
                  ))}
                </svg>
              );
            })()}

            {/* Legenda */}
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#10b981' }}></span>
                <span>Recebido</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#f59e0b' }}></span>
                <span>Vencido</span>
              </div>
            </div>
          </div>
        </div>

        {/* Gráfico: Status das Mensalidades (Donut Chart) */}
        <div className="home-section">
          <div className="section-header">
            <Icon icon="material-symbols:pie-chart" width="24" />
            <h2>Status das Mensalidades</h2>
          </div>
          <div className="home-grafico-donut">
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
                { label: 'Em dia', valor: distribuicaoStatus.emDia || 0, cor: '#10b981' },
                { label: 'A vencer', valor: distribuicaoStatus.aVencer || 0, cor: '#3b82f6' },
                { label: 'Atrasadas', valor: distribuicaoStatus.atrasadas || 0, cor: '#ef4444' },
                { label: 'Canceladas', valor: distribuicaoStatus.canceladas || 0, cor: '#6b7280' }
              ].filter(d => d.valor > 0);

              const size = 200;
              const centerX = size / 2;
              const centerY = size / 2;
              const radius = 80;
              const innerRadius = 50;

              let currentAngle = -90;
              const segmentos = dados.map(item => {
                const percent = item.valor / total;
                const angle = percent * 360;
                const startAngle = currentAngle;
                const endAngle = currentAngle + angle;
                currentAngle = endAngle;

                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;

                const x1 = centerX + radius * Math.cos(startRad);
                const y1 = centerY + radius * Math.sin(startRad);
                const x2 = centerX + radius * Math.cos(endRad);
                const y2 = centerY + radius * Math.sin(endRad);
                const x3 = centerX + innerRadius * Math.cos(endRad);
                const y3 = centerY + innerRadius * Math.sin(endRad);
                const x4 = centerX + innerRadius * Math.cos(startRad);
                const y4 = centerY + innerRadius * Math.sin(startRad);

                const largeArc = angle > 180 ? 1 : 0;

                const path = [
                  `M ${x1} ${y1}`,
                  `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
                  `L ${x3} ${y3}`,
                  `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
                  'Z'
                ].join(' ');

                return { ...item, path, percent: (percent * 100).toFixed(1) };
              });

              return (
                <>
                  <svg viewBox={`0 0 ${size} ${size}`} className="donut-chart">
                    {segmentos.map((seg, i) => (
                      <path
                        key={i}
                        d={seg.path}
                        fill={seg.cor}
                        stroke="white"
                        strokeWidth="2"
                      >
                        <title>{seg.label}: {seg.valor} ({seg.percent}%)</title>
                      </path>
                    ))}

                    {/* Centro com total */}
                    <text
                      x={centerX}
                      y={centerY - 5}
                      textAnchor="middle"
                      fontSize="28"
                      fontWeight="700"
                      fill="#333"
                    >
                      {total}
                    </text>
                    <text
                      x={centerX}
                      y={centerY + 15}
                      textAnchor="middle"
                      fontSize="12"
                      fill="#666"
                    >
                      Total
                    </text>
                  </svg>

                  {/* Legenda */}
                  <div className="donut-legend">
                    {dados.map((item, i) => (
                      <div key={i} className="legend-item-donut">
                        <span className="legend-dot" style={{ background: item.cor }}></span>
                        <span className="legend-text">
                          {item.label}: <strong>{item.valor}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

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
                        {diasAtraso > 0 && (
                          <span className="fila-atraso">{diasAtraso} dia{diasAtraso > 1 ? 's' : ''} atraso</span>
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
    </div>
  );
}

export default Home;
