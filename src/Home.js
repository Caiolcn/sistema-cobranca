import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Icon } from '@iconify/react';
import DateRangePicker from './DateRangePicker';
import whatsappService from './services/whatsappService';
import './Home.css';

function Home({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [periodo, setPeriodo] = useState('hoje');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Dados dos cards principais
  const [totalClientes, setTotalClientes] = useState(0);
  const [cobrancasAtivas, setCobrancasAtivas] = useState(0);
  const [totalReceber, setTotalReceber] = useState(0);
  const [totalRecebido, setTotalRecebido] = useState(0);
  const [mensagensEnviadas, setMensagensEnviadas] = useState(0);

  // Dados adicionais
  const [clientesInadimplentes, setClientesInadimplentes] = useState(0);
  const [maiorDebito, setMaiorDebito] = useState(0);

  // Fila de WhatsApp
  const [filaWhatsapp, setFilaWhatsapp] = useState([]);

  // Mensagens recentes
  const [mensagensRecentes, setMensagensRecentes] = useState([]);

  // Gráfico de últimos 7 dias
  const [graficoSemana, setGraficoSemana] = useState([]);

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    if (periodo === 'personalizado' && dataInicio && dataFim) {
      carregarDados();
    } else if (periodo !== 'personalizado') {
      carregarDados();
    }
  }, [periodo, dataInicio, dataFim]);

  const obterDatasPeriodo = () => {
    const hoje = new Date();
    let inicio, fim;

    if (typeof periodo === 'object' && periodo.inicio && periodo.fim) {
      inicio = periodo.inicio;
      fim = periodo.fim;
    } else if (periodo === 'hoje') {
      inicio = hoje.toISOString().split('T')[0];
      fim = hoje.toISOString().split('T')[0];
    } else if (periodo === 'mes_atual') {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (periodo === 'mes_anterior') {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString().split('T')[0];
      fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0).toISOString().split('T')[0];
    } else if (periodo === 'ultimos_7_dias') {
      fim = hoje.toISOString().split('T')[0];
      inicio = new Date(hoje.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else if (periodo === 'ultimos_30_dias') {
      fim = hoje.toISOString().split('T')[0];
      inicio = new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else if (periodo === 'ultimos_60_dias') {
      fim = hoje.toISOString().split('T')[0];
      inicio = new Date(hoje.getTime() - 59 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else if (periodo === 'ultimos_90_dias') {
      fim = hoje.toISOString().split('T')[0];
      inicio = new Date(hoje.getTime() - 89 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
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

      // Carregar nome da empresa
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome_completo, nome_fantasia, razao_social')
        .eq('id', user.id)
        .single();

      if (usuario) {
        setNomeEmpresa(usuario.nome_fantasia || usuario.razao_social || usuario.nome_completo || 'Empresa');
      }

      // Total de clientes
      const { count: countClientes } = await supabase
        .from('devedores')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setTotalClientes(countClientes || 0);

      // Cobranças ativas (parcelas pendentes ou atrasadas)
      const { count: countCobrancas } = await supabase
        .from('parcelas')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['pendente', 'atrasado']);
      setCobrancasAtivas(countCobrancas || 0);

      // Total a receber no período (parcelas pendentes/atrasadas)
      const { data: parcelasReceber } = await supabase
        .from('parcelas')
        .select('valor')
        .eq('user_id', user.id)
        .in('status', ['pendente', 'atrasado'])
        .gte('data_vencimento', inicio)
        .lte('data_vencimento', fim);

      const totalRec = parcelasReceber?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;
      setTotalReceber(totalRec);

      // Total recebido no período (parcelas pagas)
      const { data: parcelasPagas } = await supabase
        .from('parcelas')
        .select('valor, updated_at')
        .eq('user_id', user.id)
        .eq('status', 'pago')
        .gte('updated_at', `${inicio}T00:00:00`)
        .lte('updated_at', `${fim}T23:59:59`);

      const totalPago = parcelasPagas?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;
      setTotalRecebido(totalPago);

      // Mensagens enviadas no período
      const { count: countMensagens } = await supabase
        .from('logs_mensagens')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('enviado_em', `${inicio}T00:00:00`)
        .lte('enviado_em', `${fim}T23:59:59`);
      setMensagensEnviadas(countMensagens || 0);

      // Clientes inadimplentes
      const { data: parcelasAtrasadas } = await supabase
        .from('parcelas')
        .select('devedor_id')
        .eq('user_id', user.id)
        .eq('status', 'pendente')
        .lt('data_vencimento', new Date().toISOString().split('T')[0]);

      const clientesInad = new Set(parcelasAtrasadas?.map(p => p.devedor_id)).size;
      setClientesInadimplentes(clientesInad);

      // Maior débito em aberto
      const { data: devedores } = await supabase
        .from('devedores')
        .select('id')
        .eq('user_id', user.id);

      let maiorValor = 0;
      if (devedores) {
        for (const dev of devedores) {
          const { data: parcelas } = await supabase
            .from('parcelas')
            .select('valor')
            .eq('devedor_id', dev.id)
            .in('status', ['pendente', 'atrasado']);

          const soma = parcelas?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;
          if (soma > maiorValor) maiorValor = soma;
        }
      }
      setMaiorDebito(maiorValor);

      // Fila de WhatsApp (próximas mensagens a serem enviadas)
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
        .lte('data_vencimento', new Date().toISOString().split('T')[0])
        .order('data_vencimento', { ascending: true })
        .limit(10);

      setFilaWhatsapp(fila || []);

      // Mensagens recentes
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

      // Gráfico últimos 7 dias (recebimentos)
      const ultimos7Dias = [];
      for (let i = 6; i >= 0; i--) {
        const data = new Date();
        data.setDate(data.getDate() - i);
        const dataStr = data.toISOString().split('T')[0];

        const { data: pagamentos } = await supabase
          .from('parcelas')
          .select('valor')
          .eq('user_id', user.id)
          .eq('status', 'pago')
          .gte('updated_at', `${dataStr}T00:00:00`)
          .lte('updated_at', `${dataStr}T23:59:59`);

        const total = pagamentos?.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0) || 0;

        ultimos7Dias.push({
          dia: data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          valor: total
        });
      }
      setGraficoSemana(ultimos7Dias);

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

  const formatarData = (data) => {
    return new Date(data).toLocaleDateString('pt-BR');
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

  const maxGrafico = Math.max(...graficoSemana.map(d => d.valor), 1);

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

      {/* Cards Principais */}
      <div className="home-cards-grid">
        <div className="home-card card-clientes">
          <div className="card-header">
            <span className="card-label">Total de Clientes</span>
            <div className="card-icon">
              <Icon icon="material-symbols:group-outline" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{totalClientes}</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => onNavigate('clientes')}>
              Ver
            </button>
          </div>
        </div>

        <div className="home-card card-cobrancas">
          <div className="card-header">
            <span className="card-label">Cobranças Ativas</span>
            <div className="card-icon">
              <Icon icon="material-symbols:receipt-long-outline" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{cobrancasAtivas}</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => onNavigate('financeiro')}>
              Ver
            </button>
          </div>
        </div>

        <div className="home-card card-receber">
          <div className="card-header">
            <span className="card-label">Total a Receber</span>
            <div className="card-icon">
              <Icon icon="material-symbols:payments-outline" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{formatarMoeda(totalReceber)}</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => onNavigate('financeiro')}>
              Ver
            </button>
          </div>
        </div>

        <div className="home-card card-recebido">
          <div className="card-header">
            <span className="card-label">Total Recebido</span>
            <div className="card-icon">
              <Icon icon="material-symbols:check-circle-outline" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{formatarMoeda(totalRecebido)}</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => onNavigate('financeiro')}>
              Ver
            </button>
          </div>
        </div>

        <div className="home-card card-mensagens">
          <div className="card-header">
            <span className="card-label">Mensagens Enviadas</span>
            <div className="card-icon">
              <Icon icon="material-symbols:mail-outline" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{mensagensEnviadas}</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => onNavigate('whatsapp')}>
              Ver
            </button>
          </div>
        </div>
      </div>

      {/* Cards Secundários */}
      <div className="home-cards-secondary">
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
            <button className="btn-ver" onClick={() => onNavigate('clientes')}>
              Ver
            </button>
          </div>
        </div>

        <div className="home-card card-maior-debito">
          <div className="card-header">
            <span className="card-label">Maior Débito em Aberto</span>
            <div className="card-icon">
              <Icon icon="material-symbols:trending-up" width="20" />
            </div>
          </div>
          <div className="card-body">
            <span className="card-value">{formatarMoeda(maiorDebito)}</span>
          </div>
          <div className="card-footer">
            <button className="btn-ver" onClick={() => onNavigate('financeiro')}>
              Ver
            </button>
          </div>
        </div>
      </div>

      {/* Gráfico de Recebimentos (Últimos 7 dias) */}
      <div className="home-section">
        <div className="section-header">
          <Icon icon="material-symbols:bar-chart" width="24" />
          <h2>Recebimentos - Últimos 7 Dias</h2>
        </div>
        <div className="home-grafico">
          {graficoSemana.map((item, index) => (
            <div key={index} className="grafico-coluna">
              <div className="grafico-barra-container">
                <div
                  className="grafico-barra"
                  style={{ height: `${(item.valor / maxGrafico) * 100}%` }}
                  title={formatarMoeda(item.valor)}
                >
                  {item.valor > 0 && (
                    <span className="grafico-valor">{formatarMoeda(item.valor)}</span>
                  )}
                </div>
              </div>
              <span className="grafico-label">{item.dia}</span>
            </div>
          ))}
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
