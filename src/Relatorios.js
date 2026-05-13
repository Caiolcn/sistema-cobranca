import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Icon } from '@iconify/react';
import DateRangePicker from './DateRangePicker';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useUserPlan } from './hooks/useUserPlan';
import { useUser } from './contexts/UserContext';
import FeatureLocked from './FeatureLocked';
import NpsRelatorio from './components/NpsRelatorio';
import { SkeletonDashboard } from './components/Skeleton';
import { showToast } from './Toast';
import './Home.css';
import './Relatorios.css';

function Relatorios() {
  const navigate = useNavigate();
  const { userId } = useUser();
  const { isLocked, loading: loadingPlan } = useUserPlan();
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('mes_atual');

  const [dados, setDados] = useState({
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
    pagamentosHoje: 0,
    valorPagamentosHoje: 0,
    despesasPagoMes: 0,
    despesasPendenteMes: 0,
    despesasTotalMes: 0,
    saldoAtual: 0,
    saldoInicial: 0,
    saldoInicialData: null,
    saldoEntradas: 0,
    saldoSaidas: 0
  });

  // Modal de ajuste de saldo
  const [mostrarModalSaldo, setMostrarModalSaldo] = useState(false);
  const [formSaldoValor, setFormSaldoValor] = useState('');
  const [salvandoSaldo, setSalvandoSaldo] = useState(false);

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

      const seteDiasFrente = new Date();
      seteDiasFrente.setDate(seteDiasFrente.getDate() + 7);
      const seteDiasFrenteStr = seteDiasFrente.toISOString().split('T')[0];

      const tresMesesAtras = new Date();
      tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 2);
      const tresMesesAtrasInicio = new Date(tresMesesAtras.getFullYear(), tresMesesAtras.getMonth(), 1).toISOString().split('T')[0];
      const mesAtualFim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];

      const [
        { data: todasMensalidades },
        { data: todosClientes },
        { count: countMensagensEnviadas },
        { data: todasDespesas, error: erroDespesas },
        { data: todasVendas },
        { data: dadosUsuario }
      ] = await Promise.all([
        supabase
          .from('mensalidades')
          .select('id, valor, data_vencimento, status, devedor_id, is_mensalidade, updated_at')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false'),

        supabase
          .from('devedores')
          .select('id, assinatura_ativa, lixo, plano:planos(valor)')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false'),

        supabase
          .from('logs_mensagens')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'enviado'),

        supabase
          .from('despesas')
          .select('id, valor, status, data_vencimento, data_pagamento')
          .eq('user_id', userId),

        supabase
          .from('cobrancas_avulsas')
          .select('id, valor, data_vencimento, status, data_pagamento')
          .eq('user_id', userId)
          .or('lixo.is.null,lixo.eq.false'),

        supabase
          .from('usuarios')
          .select('saldo_inicial, saldo_inicial_data')
          .eq('id', userId)
          .maybeSingle()
      ]);

      // ========== PROCESSAMENTO ==========
      const clientesAtivosSet = new Set(todosClientes?.map(c => c.id) || []);

      let recebidoMes = 0;
      let valorAtraso = 0;
      const clientesAtrasadosSet = new Set();
      let aReceberMes = 0;
      let vencer7Dias = 0;
      const recebidosPorMes = {};
      const vencidosPorMes = {};
      let emDia = 0, aVencer = 0, atrasadas = 0, canceladas = 0;
      let pagamentosHojeCount = 0, valorPagamentosHojeTotal = 0;
      const mensalidadesPorCliente = {};

      todasMensalidades?.forEach(p => {
        const valor = parseFloat(p.valor || 0);
        const dataVenc = p.data_vencimento;
        const mesAnoVenc = dataVenc?.substring(0, 7);
        const mesAnoUpdate = p.updated_at?.substring(0, 7);

        if (p.status === 'pago' && p.updated_at >= `${inicio}T00:00:00` && p.updated_at <= `${fim}T23:59:59`) {
          recebidoMes += valor;
        }

        if (p.status === 'pendente' && dataVenc < hoje && clientesAtivosSet.has(p.devedor_id)) {
          valorAtraso += valor;
          clientesAtrasadosSet.add(p.devedor_id);
        }

        if (['pendente', 'atrasado'].includes(p.status) && dataVenc >= inicio && dataVenc <= fim) {
          aReceberMes += valor;
        }

        if (['pendente', 'atrasado'].includes(p.status) && dataVenc >= hoje && dataVenc <= seteDiasFrenteStr) {
          vencer7Dias += valor;
        }

        if (p.status === 'pago' && p.updated_at >= `${tresMesesAtrasInicio}T00:00:00` && p.updated_at <= `${mesAtualFim}T23:59:59`) {
          if (!recebidosPorMes[mesAnoUpdate]) recebidosPorMes[mesAnoUpdate] = 0;
          recebidosPorMes[mesAnoUpdate] += valor;
        }

        if (dataVenc >= tresMesesAtrasInicio && dataVenc <= mesAtualFim) {
          if (!vencidosPorMes[mesAnoVenc]) vencidosPorMes[mesAnoVenc] = 0;
          vencidosPorMes[mesAnoVenc] += valor;
        }

        if (p.status === 'pago') {
          emDia++;
        } else if (p.status === 'cancelado') {
          canceladas++;
        } else if (p.status === 'pendente' && dataVenc < hoje) {
          atrasadas++;
        } else if (p.status === 'pendente') {
          aVencer++;
        }

        if (p.status === 'pago' && p.updated_at?.substring(0, 10) === hoje) {
          pagamentosHojeCount++;
          valorPagamentosHojeTotal += valor;
        }

        if (p.is_mensalidade) {
          if (!mensalidadesPorCliente[p.devedor_id] ||
              new Date(dataVenc) > new Date(mensalidadesPorCliente[p.devedor_id].data_vencimento)) {
            mensalidadesPorCliente[p.devedor_id] = p;
          }
        }
      });

      // Incluir vendas (cobranças avulsas) nos KPIs
      (todasVendas || []).forEach(v => {
        const valor = parseFloat(v.valor || 0);
        const dataVenc = v.data_vencimento;
        const dataPgto = v.data_pagamento;
        const mesAnoVenc = dataVenc?.substring(0, 7);
        const mesAnoPgto = dataPgto?.substring(0, 7);

        if (v.status === 'pago' && dataPgto >= inicio && dataPgto <= fim) {
          recebidoMes += valor;
        }

        if (v.status === 'pendente' && dataVenc && dataVenc < hoje) {
          valorAtraso += valor;
        }

        if (v.status === 'pendente' && dataVenc >= inicio && dataVenc <= fim) {
          aReceberMes += valor;
        }

        if (v.status === 'pendente' && dataVenc >= hoje && dataVenc <= seteDiasFrenteStr) {
          vencer7Dias += valor;
        }

        if (v.status === 'pago' && dataPgto >= tresMesesAtrasInicio && dataPgto <= mesAtualFim) {
          if (!recebidosPorMes[mesAnoPgto]) recebidosPorMes[mesAnoPgto] = 0;
          recebidosPorMes[mesAnoPgto] += valor;
        }

        if (dataVenc && dataVenc >= tresMesesAtrasInicio && dataVenc <= mesAtualFim) {
          if (!vencidosPorMes[mesAnoVenc]) vencidosPorMes[mesAnoVenc] = 0;
          vencidosPorMes[mesAnoVenc] += valor;
        }

        if (v.status === 'pago') emDia++;
        else if (v.status === 'cancelado') canceladas++;
        else if (v.status === 'pendente' && dataVenc && dataVenc < hoje) atrasadas++;
        else if (v.status === 'pendente') aVencer++;

        if (v.status === 'pago' && dataPgto === hoje) {
          pagamentosHojeCount++;
          valorPagamentosHojeTotal += valor;
        }
      });

      // Despesas
      if (erroDespesas) console.error('Erro ao buscar despesas:', erroDespesas);
      let despPagoMes = 0, despPendenteMes = 0, despTotalMes = 0;
      (todasDespesas || []).forEach(d => {
        const valor = parseFloat(d.valor || 0);
        const dataRef = d.status === 'pago' && d.data_pagamento ? d.data_pagamento : d.data_vencimento;
        if (dataRef >= inicio && dataRef <= fim) {
          despTotalMes += valor;
          if (d.status === 'pago') despPagoMes += valor;
          if (d.status === 'pendente') despPendenteMes += valor;
        }
      });

      // Gráfico últimos 3 meses
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
      const clientesCancelados = todosClientes?.filter(c => c.assinatura_ativa === false).length || 0;
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

      // Saldo em conta = (total entradas pagas − total saídas pagas) + ajuste manual.
      // O ajuste é só um delta de correção pra bater com o saldo real do banco.
      // Qualquer receita/despesa paga (passada ou futura) sempre influencia o saldo.
      const saldoAjuste = Number(dadosUsuario?.saldo_inicial) || 0;
      const saldoInicialData = dadosUsuario?.saldo_inicial_data || null;

      let entradasTotal = 0;
      let saidasTotal = 0;

      todasMensalidades?.forEach(p => {
        if (p.status === 'pago') entradasTotal += Number(p.valor) || 0;
      });

      (todasVendas || []).forEach(v => {
        if (v.status === 'pago') entradasTotal += Number(v.valor) || 0;
      });

      (todasDespesas || []).forEach(d => {
        if (d.status === 'pago') saidasTotal += Number(d.valor) || 0;
      });

      const saldoAtual = entradasTotal - saidasTotal + saldoAjuste;

      setDados({
        mrr: mrrCalculado,
        assinaturasAtivas: ativas,
        recebimentosMes: recebidoMes,
        valorEmAtraso: valorAtraso,
        clientesInadimplentes: clientesAtrasadosSet.size,
        receitaProjetadaMes: recebidoMes + aReceberMes,
        taxaCancelamento: taxaCancel,
        mensalidadesVencer7Dias: vencer7Dias,
        mensagensEnviadasAuto: countMensagensEnviadas || 0,
        statusAcesso: {
          emDia: { valor: statusData.emDia.valor, clientes: statusData.emDia.clientes.size },
          atrasoRecente: { valor: statusData.atrasoRecente.valor, clientes: statusData.atrasoRecente.clientes.size },
          bloqueado: { valor: statusData.bloqueado.valor, clientes: statusData.bloqueado.clientes.size },
          inativo: { valor: statusData.inativo.valor, clientes: statusData.inativo.clientes.size }
        },
        graficoRecebimentoVsVencimento: graficoMeses,
        distribuicaoStatus: { emDia, aVencer, atrasadas, canceladas },
        pagamentosHoje: pagamentosHojeCount,
        valorPagamentosHoje: valorPagamentosHojeTotal,
        despesasPagoMes: despPagoMes,
        despesasPendenteMes: despPendenteMes,
        despesasTotalMes: despTotalMes,
        saldoAtual,
        saldoInicial: saldoAjuste,
        saldoInicialData,
        saldoEntradas: entradasTotal,
        saldoSaidas: saidasTotal
      });

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, periodo]);

  const formatarMoeda = (valor) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  };

  const calcularDiasAtraso = (dataVencimento) => {
    const hoje = new Date();
    const vencimento = new Date(dataVencimento);
    const diff = Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  if (loading || loadingPlan) {
    return (
      <div className="relatorios-container">
        <SkeletonDashboard />
      </div>
    );
  }

  const {
    mrr, assinaturasAtivas, recebimentosMes, valorEmAtraso, clientesInadimplentes,
    receitaProjetadaMes, taxaCancelamento, mensalidadesVencer7Dias, mensagensEnviadasAuto,
    statusAcesso, graficoRecebimentoVsVencimento, distribuicaoStatus,
    pagamentosHoje, valorPagamentosHoje,
    despesasPagoMes, despesasPendenteMes,
    saldoAtual, saldoInicial, saldoInicialData, saldoEntradas, saldoSaidas
  } = dados;

  const proLocked = isLocked('pro');

  const abrirModalSaldo = () => {
    setFormSaldoValor(saldoAtual ? String(saldoAtual.toFixed(2)) : '');
    setMostrarModalSaldo(true);
  };

  const fecharModalSaldo = () => {
    setMostrarModalSaldo(false);
    setFormSaldoValor('');
  };

  const salvarSaldo = async () => {
    const valorReal = parseFloat(formSaldoValor);
    if (isNaN(valorReal)) {
      showToast('Informe um valor válido', 'erro');
      return;
    }
    setSalvandoSaldo(true);
    try {
      // Delta = saldo real informado − saldo que o sistema calcula só pelas movimentações.
      // Assim, o ajuste corrige a defasagem e qualquer movimento futuro/passado continua somando.
      const delta = valorReal - (saldoEntradas - saldoSaidas);
      const hoje = new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('usuarios')
        .update({ saldo_inicial: delta, saldo_inicial_data: hoje })
        .eq('id', userId);
      if (error) throw error;
      showToast('Saldo atualizado', 'sucesso');
      fecharModalSaldo();
      await carregarDados();
    } catch (err) {
      console.error('Erro ao salvar saldo:', err);
      showToast('Erro ao salvar saldo', 'erro');
    } finally {
      setSalvandoSaldo(false);
    }
  };

  const formatarDataExtensa = (iso) => {
    if (!iso) return null;
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="relatorios-container">
      {/* Header */}
      <div className="relatorios-header">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>Relatórios</h2>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>Analise o desempenho do seu negócio</p>
        </div>
        <DateRangePicker value={periodo} onChange={setPeriodo} />
      </div>

      {/* Saldo em conta */}
      <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Saldo em conta">
        <div className="home-section" style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '20px 24px',
            background: 'linear-gradient(135deg, #344848 0%, #4a6363 100%)',
            borderRadius: '12px',
            color: 'white',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Icon icon="mdi:wallet-outline" width="26" height="26" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', opacity: 0.85, marginBottom: '4px' }}>
                  Saldo em conta
                </div>
                <div style={{ fontSize: '28px', fontWeight: '700', lineHeight: 1.1 }}>
                  {formatarMoeda(saldoAtual)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.75, marginTop: '6px' }}>
                  +{formatarMoeda(saldoEntradas)} recebido · −{formatarMoeda(saldoSaidas)} despesas pagas
                  {saldoInicial !== 0 && (
                    <> · {saldoInicial > 0 ? '+' : '−'}{formatarMoeda(Math.abs(saldoInicial))} ajuste</>
                  )}
                  {saldoInicialData && (
                    <> · ajustado em {formatarDataExtensa(saldoInicialData)}</>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={abrirModalSaldo}
              style={{
                background: 'white',
                color: '#344848',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon icon="mdi:pencil-outline" width="18" height="18" />
              {saldoInicialData ? 'Ajustar saldo' : 'Configurar saldo'}
            </button>
          </div>
        </div>
      </FeatureLocked>

      {/* Resultado Financeiro */}
      <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Resultado Financeiro">
        <div className="home-section" style={{ marginBottom: '24px' }}>
          <div className="section-header">
            <Icon icon="material-symbols:account-balance-wallet-outline" width="24" />
            <h2>Resultado Financeiro</h2>
          </div>
          <div className="home-cards-tertiary">
            <div className="home-card" style={{ borderLeft: '4px solid #2196F3' }}>
              <div className="card-header">
                <span className="card-label">Receita</span>
                <div className="card-icon" style={{ background: '#E3F2FD', color: '#2196F3' }}>
                  <Icon icon="material-symbols:trending-up" width="20" />
                </div>
              </div>
              <div className="card-body">
                <span className="card-value" style={{ color: '#2196F3' }}>{formatarMoeda(recebimentosMes)}</span>
                <span className="card-subtitle">Pagamentos recebidos</span>
              </div>
            </div>

            <div className="home-card" style={{ borderLeft: '4px solid #f44336' }}>
              <div className="card-header">
                <span className="card-label">Despesas</span>
                <div className="card-icon" style={{ background: '#FFEBEE', color: '#f44336' }}>
                  <Icon icon="material-symbols:receipt-long-outline" width="20" />
                </div>
              </div>
              <div className="card-body">
                <span className="card-value" style={{ color: '#f44336' }}>{formatarMoeda(despesasPagoMes)}</span>
                <span className="card-subtitle">
                  {despesasPendenteMes > 0
                    ? `+ ${formatarMoeda(despesasPendenteMes)} pendente`
                    : 'Despesas pagas no periodo'}
                </span>
              </div>
            </div>

            <div className="home-card" style={{
              borderLeft: `4px solid ${(recebimentosMes - despesasPagoMes) >= 0 ? '#4CAF50' : '#f44336'}`
            }}>
              <div className="card-header">
                <span className="card-label">Resultado</span>
                <div className="card-icon" style={{
                  background: (recebimentosMes - despesasPagoMes) >= 0 ? '#E8F5E9' : '#FFEBEE',
                  color: (recebimentosMes - despesasPagoMes) >= 0 ? '#4CAF50' : '#f44336'
                }}>
                  <Icon icon={(recebimentosMes - despesasPagoMes) >= 0
                    ? 'material-symbols:thumb-up-outline'
                    : 'material-symbols:thumb-down-outline'}
                    width="20" />
                </div>
              </div>
              <div className="card-body">
                <span className="card-value" style={{
                  color: (recebimentosMes - despesasPagoMes) >= 0 ? '#4CAF50' : '#f44336'
                }}>
                  {formatarMoeda(recebimentosMes - despesasPagoMes)}
                </span>
                <span className="card-subtitle">
                  {(recebimentosMes - despesasPagoMes) >= 0 ? 'Lucro no periodo' : 'Prejuizo no periodo'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </FeatureLocked>

      {/* Cards Principais */}
      <div className="home-cards-grid">
        <div className="home-card card-mrr">
          <div className="card-header">
            <span className="card-label">Receita Mensal Recorrente</span>
            <div className="card-icon"><Icon icon="material-symbols:trending-up" width="20" /></div>
          </div>
          <div className="card-body">
            <span className="card-value">{formatarMoeda(mrr)}</span>
            <span className="card-subtitle">{assinaturasAtivas} assinaturas ativas</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('/app/clientes?status=ativo')}>Ver</button>
          </div>
        </div>

        <div className="home-card card-recebimentos">
          <div className="card-header">
            <span className="card-label">Recebimentos do Mes</span>
            <div className="card-icon"><Icon icon="material-symbols:attach-money" width="20" /></div>
          </div>
          <div className="card-body">
            <span className="card-value">{formatarMoeda(recebimentosMes)}</span>
            <span className="card-subtitle">&nbsp;</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('/app/financeiro?status=pago')}>Ver</button>
          </div>
        </div>

        <div className="home-card card-atraso">
          <div className="card-header">
            <span className="card-label">Valor em Atraso</span>
            <div className="card-icon"><Icon icon="material-symbols:warning-outline" width="20" /></div>
          </div>
          <div className="card-body">
            <span className="card-value" style={{ color: valorEmAtraso > 0 ? '#f44336' : '#4CAF50' }}>
              {formatarMoeda(valorEmAtraso)}
            </span>
            <span className="card-subtitle">&nbsp;</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('/app/financeiro?status=atrasado')}>Ver</button>
          </div>
        </div>

        <div className="home-card card-taxa-cancelamento">
          <div className="card-header">
            <span className="card-label">Taxa de Cancelamento</span>
            <div className="card-icon"><Icon icon="material-symbols:cancel-outline" width="20" /></div>
          </div>
          <div className="card-body">
            <span className="card-value" style={{ color: taxaCancelamento > 10 ? '#f44336' : '#4CAF50' }}>
              {taxaCancelamento.toFixed(1)}%
            </span>
            <span className={`card-status ${taxaCancelamento < 5 ? 'success' : taxaCancelamento < 10 ? 'warning' : 'danger'}`}>
              {taxaCancelamento < 5 ? 'Excelente' : taxaCancelamento < 10 ? 'Atencao' : 'Critico'}
            </span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => navigate('/app/clientes?assinatura=desativada')}>Ver</button>
          </div>
        </div>

        <div className="home-card card-ticket-medio">
          <div className="card-header">
            <span className="card-label">Ticket Medio</span>
            <div className="card-icon"><Icon icon="material-symbols:person-pin-circle-outline" width="20" /></div>
          </div>
          <div className="card-body">
            <span className="card-value">{formatarMoeda(assinaturasAtivas > 0 ? mrr / assinaturasAtivas : 0)}</span>
            <span className="card-subtitle">Por aluno ativo</span>
          </div>
        </div>
      </div>

      {/* Cards Secundarios */}
      <div className="home-cards-secondary">
        <div className="home-card card-pagamentos-hoje">
          <div className="card-header">
            <span className="card-label">Pagamentos de Hoje</span>
            <div className="card-icon"><Icon icon="material-symbols:payments-outline" width="20" /></div>
          </div>
          <div className="card-body">
            <span className="card-value positive">{formatarMoeda(valorPagamentosHoje)}</span>
            <span className="card-subtitle">{pagamentosHoje} pagamento{pagamentosHoje !== 1 ? 's' : ''} confirmado{pagamentosHoje !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Mensalidades a Vencer">
          <div className="home-card card-vencer-7-dias">
            <div className="card-header">
              <span className="card-label">Mensalidades a Vencer</span>
              <div className="card-icon"><Icon icon="material-symbols:calendar-clock" width="20" /></div>
            </div>
            <div className="card-body">
              <span className="card-value">{formatarMoeda(mensalidadesVencer7Dias)}</span>
              <span className="card-subtitle">Proximos 7 dias</span>
            </div>
          </div>
        </FeatureLocked>

        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Alunos Inadimplentes">
          <div className="home-card card-inadimplentes">
            <div className="card-header">
              <span className="card-label">Alunos Inadimplentes</span>
              <div className="card-icon"><Icon icon="material-symbols:person-alert-outline" width="20" /></div>
            </div>
            <div className="card-body">
              <span className="card-value">{clientesInadimplentes}</span>
              <span className="card-subtitle">Com mensalidades atrasadas</span>
            </div>
            <div className="card-footer">
              <button className="btn-ver" onClick={() => navigate('/app/clientes?inadimplente=true')}>Ver</button>
            </div>
          </div>
        </FeatureLocked>

        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Receita Projetada">
          <div className="home-card card-receita-projetada">
            <div className="card-header">
              <span className="card-label">Receita Projetada do Mes</span>
              <div className="card-icon"><Icon icon="material-symbols:analytics-outline" width="20" /></div>
            </div>
            <div className="card-body">
              <span className="card-value">{formatarMoeda(receitaProjetadaMes)}</span>
              <span className="card-subtitle">Recebido + A receber</span>
            </div>
          </div>
        </FeatureLocked>

        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Mensagens Enviadas">
          <div className="home-card card-mensagens-auto">
            <div className="card-header">
              <span className="card-label">Mensagens Enviadas</span>
              <div className="card-icon"><Icon icon="material-symbols:send-outline" width="20" /></div>
            </div>
            <div className="card-body">
              <span className="card-value">{mensagensEnviadasAuto}</span>
              <span className="card-subtitle">Automaticas pelo sistema</span>
            </div>
          </div>
        </FeatureLocked>
      </div>

      {/* Graficos em 2 Colunas */}
      <div className="home-two-columns">
        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Grafico de Recebimento vs Vencimento">
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
                    <XAxis dataKey="mes" tick={{ fill: '#666', fontSize: 12 }} stroke="#d1d5db" />
                    <YAxis tick={{ fill: '#666', fontSize: 12 }} stroke="#d1d5db" tickFormatter={(value) => formatarMoeda(value)} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                      formatter={(value) => formatarMoeda(value)}
                      labelStyle={{ color: '#333', fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
                    <Line type="monotone" dataKey="recebido" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 5 }} activeDot={{ r: 7 }} name="Recebido" />
                    <Line type="monotone" dataKey="vencido" stroke="#f59e0b" strokeWidth={3} dot={{ fill: '#f59e0b', r: 5 }} activeDot={{ r: 7 }} name="Vencido" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </FeatureLocked>

        <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Grafico de Status das Mensalidades">
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
                  return <div className="empty-state"><p>Nenhuma mensalidade no periodo</p></div>;
                }

                const dadosGrafico = [
                  { name: 'Em dia', value: distribuicaoStatus.emDia || 0, color: '#10b981' },
                  { name: 'A vencer', value: distribuicaoStatus.aVencer || 0, color: '#3b82f6' },
                  { name: 'Atrasadas', value: distribuicaoStatus.atrasadas || 0, color: '#ef4444' },
                  { name: 'Canceladas', value: distribuicaoStatus.canceladas || 0, color: '#6b7280' }
                ].filter(d => d.value > 0);

                const COLORS = dadosGrafico.map(d => d.color);

                const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                  const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
                  const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
                  if (percent < 0.05) return null;
                  return (
                    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="600">
                      {`${(percent * 100).toFixed(0)}%`}
                    </text>
                  );
                };

                return (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={dadosGrafico} cx="50%" cy="50%" labelLine={false} label={renderCustomLabel}
                        outerRadius={100} innerRadius={60} fill="#8884d8" dataKey="value" paddingAngle={2}>
                        {dadosGrafico.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                        formatter={(value, name) => [`${value} mensalidades`, name]}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>
        </FeatureLocked>
      </div>

      {/* Status de Acesso */}
      <FeatureLocked locked={proLocked} requiredPlan="Pro" featureName="Status de Acesso dos Alunos">
        <div className="home-section aging-section">
          <div className="section-header">
            <Icon icon="material-symbols:lock-person-outline" width="24" />
            <h2>Status de Acesso dos Alunos</h2>
          </div>
          <div className="aging-container">
            <div className="aging-card status-em-dia">
              <div className="aging-header">
                <span className="aging-label">Em dia</span>
                <div className="card-icon"><Icon icon="material-symbols:check-circle-outline" width="20" /></div>
              </div>
              <div className="aging-body">
                <span className="aging-value">{formatarMoeda(statusAcesso.emDia.valor)}</span>
                <span className="aging-clientes">{statusAcesso.emDia.clientes} aluno{statusAcesso.emDia.clientes !== 1 ? 's' : ''}</span>
                <span className="aging-status-desc">Acesso liberado</span>
              </div>
            </div>

            <div className="aging-card status-atraso-recente">
              <div className="aging-header">
                <span className="aging-label">Atraso recente</span>
                <div className="card-icon"><Icon icon="material-symbols:schedule" width="20" /></div>
              </div>
              <div className="aging-body">
                <span className="aging-value">{formatarMoeda(statusAcesso.atrasoRecente.valor)}</span>
                <span className="aging-clientes">{statusAcesso.atrasoRecente.clientes} aluno{statusAcesso.atrasoRecente.clientes !== 1 ? 's' : ''}</span>
                <span className="aging-status-desc">1-7 dias</span>
              </div>
            </div>

            <div className="aging-card status-bloqueado">
              <div className="aging-header">
                <span className="aging-label">Bloqueado</span>
                <div className="card-icon"><Icon icon="material-symbols:block" width="20" /></div>
              </div>
              <div className="aging-body">
                <span className="aging-value">{formatarMoeda(statusAcesso.bloqueado.valor)}</span>
                <span className="aging-clientes">{statusAcesso.bloqueado.clientes} aluno{statusAcesso.bloqueado.clientes !== 1 ? 's' : ''}</span>
                <span className="aging-status-desc">7-30 dias</span>
              </div>
            </div>

            <div className="aging-card status-inativo">
              <div className="aging-header">
                <span className="aging-label">Inativo</span>
                <div className="card-icon"><Icon icon="material-symbols:person-off-outline" width="20" /></div>
              </div>
              <div className="aging-body">
                <span className="aging-value">{formatarMoeda(statusAcesso.inativo.valor)}</span>
                <span className="aging-clientes">{statusAcesso.inativo.clientes} aluno{statusAcesso.inativo.clientes !== 1 ? 's' : ''}</span>
                <span className="aging-status-desc">+30 dias</span>
              </div>
            </div>
          </div>
        </div>
      </FeatureLocked>

      {/* NPS - Satisfação dos alunos (Premium) */}
      <NpsRelatorio userId={userId} isLocked={isLocked} />

      {/* Modal Ajustar Saldo */}
      {mostrarModalSaldo && (
        <div
          onClick={fecharModalSaldo}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white', borderRadius: '12px',
              padding: '28px',
              maxWidth: '440px', width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)', animation: 'slideUp 0.3s ease-out'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#1a1a1a' }}>
                Ajustar saldo em conta
              </h3>
              <button onClick={fecharModalSaldo} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Icon icon="mdi:close" width="24" height="24" color="#666" />
              </button>
            </div>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#666' }}>
              Informe o saldo real da sua conta hoje. As receitas e despesas pagas a partir de agora serão somadas/subtraídas automaticamente.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#344848', display: 'block', marginBottom: '6px' }}>
                Saldo atual (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                value={formSaldoValor}
                onChange={(e) => setFormSaldoValor(e.target.value)}
                placeholder="0,00"
                autoFocus
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
                  borderRadius: '6px', fontSize: '16px', outline: 'none', boxSizing: 'border-box'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#344848'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#ddd'}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={fecharModalSaldo}
                disabled={salvandoSaldo}
                style={{
                  padding: '10px 16px', background: 'white', border: '1px solid #ddd',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '14px', color: '#666'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvarSaldo}
                disabled={salvandoSaldo}
                style={{
                  padding: '10px 16px', background: '#344848', border: 'none',
                  borderRadius: '6px', cursor: salvandoSaldo ? 'not-allowed' : 'pointer',
                  fontSize: '14px', color: 'white', fontWeight: '600',
                  opacity: salvandoSaldo ? 0.6 : 1
                }}
              >
                {salvandoSaldo ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Relatorios;
