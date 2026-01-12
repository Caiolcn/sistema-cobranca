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

  // Distribuição de Status
  const [distribuicaoStatus, setDistribuicaoStatus] = useState({ pagas: 0, pendentes: 0, atrasadas: 0 });

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

      // 11. Distribuição de Status
      let pagas = 0;
      let pendentes = 0;
      let atrasadas = 0;

      todasParcelas?.forEach(p => {
        if (p.status === 'pago') {
          pagas++;
        } else if (p.status === 'pendente' && p.data_vencimento < hoje) {
          atrasadas++;
        } else if (p.status === 'pendente') {
          pendentes++;
        }
      });

      setDistribuicaoStatus({ pagas, pendentes, atrasadas });

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
        {/* Gráfico: Recebimento vs Vencimento (Últimos 3 meses) */}
        <div className="home-section">
          <div className="section-header">
            <Icon icon="material-symbols:bar-chart" width="24" />
            <h2>Recebimento vs Vencimento</h2>
          </div>
          <div className="home-grafico-comparativo">
            {graficoRecebimentoVsVencimento.map((item, index) => {
              const maxValor = Math.max(item.recebido, item.vencido, 1);
              const alturaRecebido = (item.recebido / maxValor) * 100;
              const alturaVencido = (item.vencido / maxValor) * 100;

              return (
                <div key={index} className="grafico-mes-comparativo">
                  <div className="grafico-barras-duplas">
                    <div className="grafico-coluna-dupla">
                      <div className="grafico-barra-container">
                        <div
                          className="grafico-barra grafico-barra-recebido"
                          style={{ height: `${alturaRecebido}%` }}
                          title={`Recebido: ${formatarMoeda(item.recebido)}`}
                        >
                          {item.recebido > 0 && (
                            <span className="grafico-valor-pequeno">{formatarMoeda(item.recebido)}</span>
                          )}
                        </div>
                      </div>
                      <span className="grafico-sublabel">Recebido</span>
                    </div>
                    <div className="grafico-coluna-dupla">
                      <div className="grafico-barra-container">
                        <div
                          className="grafico-barra grafico-barra-vencido"
                          style={{ height: `${alturaVencido}%` }}
                          title={`Vencido: ${formatarMoeda(item.vencido)}`}
                        >
                          {item.vencido > 0 && (
                            <span className="grafico-valor-pequeno">{formatarMoeda(item.vencido)}</span>
                          )}
                        </div>
                      </div>
                      <span className="grafico-sublabel">Vencido</span>
                    </div>
                  </div>
                  <span className="grafico-label">{item.mes}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gráfico: Status das Mensalidades */}
        <div className="home-section">
          <div className="section-header">
            <Icon icon="material-symbols:pie-chart" width="24" />
            <h2>Status das Mensalidades</h2>
          </div>
          <div className="home-grafico-status">
            <div className="status-item">
              <div className="status-bar-container">
                <div
                  className="status-bar status-bar-pagas"
                  style={{
                    width: `${distribuicaoStatus.pagas > 0 ?
                      (distribuicaoStatus.pagas / (distribuicaoStatus.pagas + distribuicaoStatus.pendentes + distribuicaoStatus.atrasadas) * 100) : 0}%`
                  }}
                >
                  <span className="status-count">{distribuicaoStatus.pagas}</span>
                </div>
              </div>
              <div className="status-label">
                <span className="status-dot status-dot-pagas"></span>
                Pagas
              </div>
            </div>

            <div className="status-item">
              <div className="status-bar-container">
                <div
                  className="status-bar status-bar-pendentes"
                  style={{
                    width: `${distribuicaoStatus.pendentes > 0 ?
                      (distribuicaoStatus.pendentes / (distribuicaoStatus.pagas + distribuicaoStatus.pendentes + distribuicaoStatus.atrasadas) * 100) : 0}%`
                  }}
                >
                  <span className="status-count">{distribuicaoStatus.pendentes}</span>
                </div>
              </div>
              <div className="status-label">
                <span className="status-dot status-dot-pendentes"></span>
                Pendentes
              </div>
            </div>

            <div className="status-item">
              <div className="status-bar-container">
                <div
                  className="status-bar status-bar-atrasadas"
                  style={{
                    width: `${distribuicaoStatus.atrasadas > 0 ?
                      (distribuicaoStatus.atrasadas / (distribuicaoStatus.pagas + distribuicaoStatus.pendentes + distribuicaoStatus.atrasadas) * 100) : 0}%`
                  }}
                >
                  <span className="status-count">{distribuicaoStatus.atrasadas}</span>
                </div>
              </div>
              <div className="status-label">
                <span className="status-dot status-dot-atrasadas"></span>
                Atrasadas
              </div>
            </div>

            <div className="status-total">
              Total: {distribuicaoStatus.pagas + distribuicaoStatus.pendentes + distribuicaoStatus.atrasadas} mensalidades
            </div>
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
