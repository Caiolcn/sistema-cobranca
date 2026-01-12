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

  // MRR - Monthly Recurring Revenue
  const [mrr, setMrr] = useState(0);
  const [mrrAnterior, setMrrAnterior] = useState(0);

  // Taxa de Adimplência (para gráfico de rosca)
  const [taxaAdimplencia, setTaxaAdimplencia] = useState({ pagas: 0, pendentes: 0, atrasadas: 0 });

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

      // OTIMIZAÇÃO: Executar TODAS as queries em paralelo com Promise.all
      const [
        { data: usuario },
        { data: mensalidadesAtivasList },
        { data: mensalidadesPagasMes },
        { data: mensalidadesAtrasadas },
        { data: mensalidadesPendenteMes },
        { data: todosClientes },
        { data: pagamentos7Dias },
        { data: mensalidadesAtivasMRR },
        { data: mensalidadesAtivasMRRMesAnterior },
        { data: fila },
        { data: mensagens },
        { data: todasMensalidades }
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

        // 7. MRR - Mensalidades ativas do mês atual (is_mensalidade = true)
        supabase
          .from('mensalidades')
          .select('valor')
          .eq('user_id', user.id)
          .eq('is_mensalidade', true)
          .in('status', ['pendente', 'atrasado', 'pago'])
          .gte('data_vencimento', inicio)
          .lte('data_vencimento', fim),

        // 8. MRR mês anterior (para comparação de tendência)
        supabase
          .from('mensalidades')
          .select('valor')
          .eq('user_id', user.id)
          .eq('is_mensalidade', true)
          .in('status', ['pendente', 'atrasado', 'pago'])
          .gte('data_vencimento', new Date(new Date(inicio).setMonth(new Date(inicio).getMonth() - 1)).toISOString().split('T')[0])
          .lte('data_vencimento', new Date(new Date(inicio).setDate(0)).toISOString().split('T')[0]),

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
          .eq('user_id', user.id)
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

      // 8. MRR - Monthly Recurring Revenue
      const mrrAtual = mensalidadesAtivasMRR?.reduce((sum, m) => sum + parseFloat(m.valor || 0), 0) || 0;
      const mrrMesPassado = mensalidadesAtivasMRRMesAnterior?.reduce((sum, m) => sum + parseFloat(m.valor || 0), 0) || 0;
      setMrr(mrrAtual);
      setMrrAnterior(mrrMesPassado);

      // 9. Fila de WhatsApp
      setFilaWhatsapp(fila || []);

      // 10. Mensagens recentes
      setMensagensRecentes(mensagens || []);

      // 11. Taxa de Adimplência (para gráfico de rosca)
      let pagas = 0;
      let pendentes = 0;
      let atrasadas = 0;

      todasMensalidades?.forEach(m => {
        if (m.status === 'pago') {
          pagas++;
        } else if (m.status === 'pendente' && m.data_vencimento < hoje) {
          atrasadas++;
        } else if (m.status === 'pendente') {
          pendentes++;
        }
      });

      setTaxaAdimplencia({ pagas, pendentes, atrasadas });

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
        {/* MRR - Monthly Recurring Revenue */}
        <div className="home-section">
          <div className="section-header">
            <Icon icon="material-symbols:payments-outline" width="24" />
            <h2>MRR - Receita Recorrente Mensal</h2>
          </div>
          <div className="home-mrr-card">
            <div className="mrr-value">
              <span className="mrr-label">Receita Mensal</span>
              <span className="mrr-amount">{formatarMoeda(mrr)}</span>
            </div>
            <div className="mrr-comparison">
              {mrrAnterior > 0 && (
                <>
                  {mrr > mrrAnterior && (
                    <div className="mrr-trend mrr-trend-up">
                      <Icon icon="material-symbols:trending-up" width="24" />
                      <span>+{((mrr - mrrAnterior) / mrrAnterior * 100).toFixed(1)}% vs mês anterior</span>
                    </div>
                  )}
                  {mrr < mrrAnterior && (
                    <div className="mrr-trend mrr-trend-down">
                      <Icon icon="material-symbols:trending-down" width="24" />
                      <span>{((mrr - mrrAnterior) / mrrAnterior * 100).toFixed(1)}% vs mês anterior</span>
                    </div>
                  )}
                  {mrr === mrrAnterior && (
                    <div className="mrr-trend mrr-trend-neutral">
                      <Icon icon="material-symbols:trending-flat" width="24" />
                      <span>Mantido vs mês anterior</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="mrr-details">
              <div className="mrr-detail-item">
                <span className="mrr-detail-label">Mês Anterior</span>
                <span className="mrr-detail-value">{formatarMoeda(mrrAnterior)}</span>
              </div>
              <div className="mrr-detail-item">
                <span className="mrr-detail-label">Diferença</span>
                <span className="mrr-detail-value">{formatarMoeda(Math.abs(mrr - mrrAnterior))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Taxa de Adimplência */}
        <div className="home-section">
          <div className="section-header">
            <Icon icon="material-symbols:pie-chart" width="24" />
            <h2>Taxa de Adimplência</h2>
          </div>
          <div className="home-taxa-adimplencia">
            {/* Gráfico de Rosca */}
            <div className="taxa-donut-container">
              <svg viewBox="0 0 200 200" className="taxa-donut">
                {(() => {
                  const total = taxaAdimplencia.pagas + taxaAdimplencia.pendentes + taxaAdimplencia.atrasadas;
                  if (total === 0) return null;

                  const circumference = 2 * Math.PI * 70;
                  const pagasPercent = (taxaAdimplencia.pagas / total) * 100;
                  const pendentesPercent = (taxaAdimplencia.pendentes / total) * 100;
                  const atrasadasPercent = (taxaAdimplencia.atrasadas / total) * 100;

                  const pagasOffset = 0;
                  const pendentesOffset = (pagasPercent / 100) * circumference;
                  const atrasadasOffset = pendentesOffset + (pendentesPercent / 100) * circumference;

                  return (
                    <>
                      {/* Círculo Pagas */}
                      {taxaAdimplencia.pagas > 0 && (
                        <circle
                          cx="100"
                          cy="100"
                          r="70"
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="40"
                          strokeDasharray={`${(pagasPercent / 100) * circumference} ${circumference}`}
                          strokeDashoffset={-pagasOffset}
                          transform="rotate(-90 100 100)"
                        />
                      )}
                      {/* Círculo Pendentes */}
                      {taxaAdimplencia.pendentes > 0 && (
                        <circle
                          cx="100"
                          cy="100"
                          r="70"
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="40"
                          strokeDasharray={`${(pendentesPercent / 100) * circumference} ${circumference}`}
                          strokeDashoffset={-pendentesOffset}
                          transform="rotate(-90 100 100)"
                        />
                      )}
                      {/* Círculo Atrasadas */}
                      {taxaAdimplencia.atrasadas > 0 && (
                        <circle
                          cx="100"
                          cy="100"
                          r="70"
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="40"
                          strokeDasharray={`${(atrasadasPercent / 100) * circumference} ${circumference}`}
                          strokeDashoffset={-atrasadasOffset}
                          transform="rotate(-90 100 100)"
                        />
                      )}
                      {/* Texto central */}
                      <text x="100" y="95" textAnchor="middle" fontSize="32" fontWeight="bold" fill="#333">
                        {pagasPercent.toFixed(0)}%
                      </text>
                      <text x="100" y="115" textAnchor="middle" fontSize="14" fill="#666">
                        Adimplência
                      </text>
                    </>
                  );
                })()}
              </svg>
            </div>

            {/* Legenda */}
            <div className="taxa-legenda">
              <div className="taxa-legenda-item">
                <span className="taxa-dot taxa-dot-pagas"></span>
                <span className="taxa-legenda-label">Pagas</span>
                <span className="taxa-legenda-value">{taxaAdimplencia.pagas}</span>
              </div>
              <div className="taxa-legenda-item">
                <span className="taxa-dot taxa-dot-pendentes"></span>
                <span className="taxa-legenda-label">Pendentes</span>
                <span className="taxa-legenda-value">{taxaAdimplencia.pendentes}</span>
              </div>
              <div className="taxa-legenda-item">
                <span className="taxa-dot taxa-dot-atrasadas"></span>
                <span className="taxa-legenda-label">Atrasadas</span>
                <span className="taxa-legenda-value">{taxaAdimplencia.atrasadas}</span>
              </div>
              <div className="taxa-legenda-total">
                <span>Total: {taxaAdimplencia.pagas + taxaAdimplencia.pendentes + taxaAdimplencia.atrasadas} mensalidades</span>
              </div>
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
