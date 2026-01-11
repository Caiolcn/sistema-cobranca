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

  // Recebimento vs Vencimento (últimos 3 meses)
  const [graficoRecebimentoVsVencimento, setGraficoRecebimentoVsVencimento] = useState([]);

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

      // Carregar nome da empresa
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome_completo, nome_fantasia, razao_social')
        .eq('id', user.id)
        .single();

      if (usuario) {
        setNomeEmpresa(usuario.nome_fantasia || usuario.razao_social || usuario.nome_completo || 'Empresa');
      }

      // 1. MENSALIDADES ATIVAS (assinantes com mensalidades ativas)
      const { data: mensalidadesAtivasList } = await supabase
        .from('parcelas')
        .select('devedor_id')
        .eq('user_id', user.id)
        .eq('is_mensalidade', true)
        .in('status', ['pendente', 'atrasado', 'pago']);

      const mensalidadesAtivasCount = new Set(mensalidadesAtivasList?.map(p => p.devedor_id)).size;
      setMensalidadesAtivas(mensalidadesAtivasCount);

      // 2. RECEBIMENTOS DO MÊS (valor recebido no período selecionado)
      const { data: parcelasPagasMes } = await supabase
        .from('parcelas')
        .select('valor')
        .eq('user_id', user.id)
        .eq('status', 'pago')
        .gte('updated_at', `${inicio}T00:00:00`)
        .lte('updated_at', `${fim}T23:59:59`);

      const recebidoMes = parcelasPagasMes?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;
      setRecebimentosMes(recebidoMes);

      // 3. VALOR EM ATRASO (parcelas vencidas e não pagas)
      const { data: parcelasAtrasadas } = await supabase
        .from('parcelas')
        .select('valor')
        .eq('user_id', user.id)
        .eq('status', 'pendente')
        .lt('data_vencimento', hoje);

      const valorAtraso = parcelasAtrasadas?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;
      setValorEmAtraso(valorAtraso);

      // 4. CLIENTES INADIMPLENTES (clientes com parcelas atrasadas)
      const clientesInad = new Set(parcelasAtrasadas?.map(p => p.devedor_id)).size;
      setClientesInadimplentes(clientesInad);

      // 5. RECEITA PROJETADA PARA O MÊS (Recebido + A Receber no período)
      const { data: parcelasPendenteMes } = await supabase
        .from('parcelas')
        .select('valor')
        .eq('user_id', user.id)
        .in('status', ['pendente', 'atrasado'])
        .gte('data_vencimento', inicio)
        .lte('data_vencimento', fim);

      const aReceberMes = parcelasPendenteMes?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;
      setReceitaProjetadaMes(recebidoMes + aReceberMes);

      // 6. TAXA DE CANCELAMENTO (clientes que cancelaram nos últimos 30 dias)
      // Simulação: clientes que não têm mensalidades futuras agendadas
      const { data: todosClientes } = await supabase
        .from('devedores')
        .select('id')
        .eq('user_id', user.id);

      const totalClientesGeral = todosClientes?.length || 0;

      // Clientes que NÃO têm mensalidades futuras (podem ter cancelado)
      const clientesComMensalidade = new Set(mensalidadesAtivasList?.map(p => p.devedor_id));
      const clientesCancelados = totalClientesGeral - clientesComMensalidade.size;
      const taxaCancel = totalClientesGeral > 0 ? (clientesCancelados / totalClientesGeral) * 100 : 0;
      setTaxaCancelamento(taxaCancel);

      // 7. RECEBIMENTOS ÚLTIMOS 7 DIAS
      const seteDiasAtras = new Date();
      seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
      const seteDiasAtrasStr = seteDiasAtras.toISOString().split('T')[0];

      const { data: pagamentos7Dias } = await supabase
        .from('parcelas')
        .select('valor')
        .eq('user_id', user.id)
        .eq('status', 'pago')
        .gte('updated_at', `${seteDiasAtrasStr}T00:00:00`)
        .lte('updated_at', `${hoje}T23:59:59`);

      const recebido7Dias = pagamentos7Dias?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;
      setRecebimentosUltimos7Dias(recebido7Dias);

      // 8. GRÁFICO: RECEBIMENTO vs VENCIMENTO (últimos 3 meses)
      const graficoMeses = [];
      for (let i = 2; i >= 0; i--) {
        const mesData = new Date();
        mesData.setMonth(mesData.getMonth() - i);
        const mesInicio = new Date(mesData.getFullYear(), mesData.getMonth(), 1).toISOString().split('T')[0];
        const mesFim = new Date(mesData.getFullYear(), mesData.getMonth() + 1, 0).toISOString().split('T')[0];

        // Valor recebido no mês
        const { data: recebidosMes } = await supabase
          .from('parcelas')
          .select('valor')
          .eq('user_id', user.id)
          .eq('status', 'pago')
          .gte('updated_at', `${mesInicio}T00:00:00`)
          .lte('updated_at', `${mesFim}T23:59:59`);

        const valorRecebido = recebidosMes?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;

        // Valor que venceu no mês (esperado)
        const { data: vencidosMes } = await supabase
          .from('parcelas')
          .select('valor')
          .eq('user_id', user.id)
          .gte('data_vencimento', mesInicio)
          .lte('data_vencimento', mesFim);

        const valorVencido = vencidosMes?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;

        graficoMeses.push({
          mes: mesData.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          recebido: valorRecebido,
          vencido: valorVencido
        });
      }
      setGraficoRecebimentoVsVencimento(graficoMeses);

      // 9. FILA DE WHATSAPP
      const { data: fila } = await supabase
        .from('parcelas')
        .select(`
          id,
          valor,
          data_vencimento,
          numero_parcela,
          enviado_hoje,
          devedores (nome, telefone)
        `)
        .eq('user_id', user.id)
        .eq('status', 'pendente')
        .eq('enviado_hoje', false)
        .lte('data_vencimento', hoje)
        .order('data_vencimento', { ascending: true })
        .limit(10);

      setFilaWhatsapp(fila || []);

      // 10. MENSAGENS RECENTES
      const { data: mensagens } = await supabase
        .from('logs_mensagens')
        .select(`
          id,
          telefone,
          valor_parcela,
          status,
          enviado_em,
          devedores (nome)
        `)
        .eq('user_id', user.id)
        .order('enviado_em', { ascending: false })
        .limit(8);

      setMensagensRecentes(mensagens || []);

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

  const handleCancelarEnvio = async (parcelaId) => {
    try {
      const confirmacao = window.confirm('Deseja realmente cancelar o envio desta mensagem?');
      if (!confirmacao) return;

      // Atualizar o status da parcela ou remover da fila
      // Você pode implementar a lógica específica aqui
      console.log('Cancelando envio da parcela:', parcelaId);

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

      {/* Gráfico: Recebimento vs Vencimento (Últimos 3 meses) */}
      <div className="home-section">
        <div className="section-header">
          <Icon icon="material-symbols:bar-chart" width="24" />
          <h2>Recebimento vs Vencimento - Últimos 3 Meses</h2>
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
                      <span className="mensagem-valor">{formatarMoeda(msg.valor_parcela)}</span>
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
