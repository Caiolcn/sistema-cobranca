import { supabase } from '../supabaseClient';

/**
 * Serviço de Automação de Mensagens
 * Gerencia envio automático de lembretes e avisos via n8n + Evolution API
 */

/**
 * Busca todas as configurações do sistema
 */
export const buscarConfiguracoes = async () => {
  try {
    const { data, error } = await supabase
      .from('config')
      .select('chave, valor');

    if (error) throw error;

    // Converter array em objeto para fácil acesso
    const config = {};
    data.forEach(item => {
      config[item.chave] = item.valor;
    });

    return { data: config, error: null };
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    return { data: null, error };
  }
};

/**
 * Atualiza uma configuração específica
 */
export const atualizarConfiguracao = async (chave, valor) => {
  try {
    const { data, error } = await supabase
      .from('config')
      .update({ valor, updated_at: new Date().toISOString() })
      .eq('chave', chave)
      .select();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Erro ao atualizar configuração:', error);
    return { data: null, error };
  }
};

/**
 * Substitui variáveis no template de mensagem
 */
const processarTemplate = (template, dados) => {
  let mensagem = template;

  // Substituir cada variável
  Object.keys(dados).forEach(chave => {
    const regex = new RegExp(`{{${chave}}}`, 'g');
    mensagem = mensagem.replace(regex, dados[chave]);
  });

  return mensagem;
};

/**
 * Formata valor para BRL
 */
const formatarValor = (valor) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor);
};

/**
 * Formata data para pt-BR
 */
const formatarData = (data) => {
  return new Date(data).toLocaleDateString('pt-BR');
};

/**
 * Calcula dias entre duas datas
 */
const calcularDiasRestantes = (dataVencimento) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const vencimento = new Date(dataVencimento);
  vencimento.setHours(0, 0, 0, 0);

  const diffTime = vencimento - hoje;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
};

/**
 * Envia mensagem via webhook do n8n
 */
const enviarViaWebhook = async (webhookUrl, payload) => {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Erro ao enviar via webhook:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Busca mensalidades que precisam de lembrete (X dias antes do vencimento)
 */
export const buscarMensalidadesParaLembrete = async (userId, diasAntecipacao) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const dataAlvo = new Date(hoje);
    dataAlvo.setDate(dataAlvo.getDate() + diasAntecipacao);

    const dataAlvoStr = dataAlvo.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('mensalidades')
      .select(`
        id,
        valor,
        data_vencimento,
        devedores (
          id,
          nome,
          telefone
        )
      `)
      .eq('user_id', userId)
      .eq('is_mensalidade', true)
      .eq('status', 'pendente')
      .eq('data_vencimento', dataAlvoStr);

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Erro ao buscar mensalidades para lembrete:', error);
    return { data: null, error };
  }
};

/**
 * Busca mensalidades que vencem hoje
 */
export const buscarMensalidadesVencimentoHoje = async (userId) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeStr = hoje.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('mensalidades')
      .select(`
        id,
        valor,
        data_vencimento,
        devedores (
          id,
          nome,
          telefone
        )
      `)
      .eq('user_id', userId)
      .eq('is_mensalidade', true)
      .eq('status', 'pendente')
      .eq('data_vencimento', hojeStr);

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Erro ao buscar mensalidades vencimento hoje:', error);
    return { data: null, error };
  }
};

/**
 * Processa e envia lembretes automáticos
 */
export const processarLembretes = async (userId) => {
  try {
    // 1. Buscar configurações
    const { data: config, error: configError } = await buscarConfiguracoes();
    if (configError) throw configError;

    // Verificar se automação está habilitada
    if (config.automacao_habilitada !== 'true') {
      return {
        success: false,
        message: 'Automação não está habilitada',
        enviados: 0
      };
    }

    // 2. Buscar mensalidades que precisam de lembrete
    const diasAntecipacao = parseInt(config.dias_lembrete_antecipado || '3');
    const { data: mensalidades, error: mensalidadesError } =
      await buscarMensalidadesParaLembrete(userId, diasAntecipacao);

    if (mensalidadesError) throw mensalidadesError;

    if (!mensalidades || mensalidades.length === 0) {
      return {
        success: true,
        message: 'Nenhuma mensalidade para enviar lembrete hoje',
        enviados: 0
      };
    }

    // 3. Processar cada mensalidade
    const resultados = [];
    const template = config.msg_template_lembrete;

    for (const mensalidade of mensalidades) {
      const devedor = mensalidade.devedores;

      // Verificar se tem telefone
      if (!devedor.telefone) {
        console.warn(`Cliente ${devedor.nome} não tem telefone cadastrado`);
        continue;
      }

      // Calcular dias restantes
      const diasRestantes = calcularDiasRestantes(mensalidade.data_vencimento);

      // Preparar payload
      const payload = {
        nome: devedor.nome,
        telefone: devedor.telefone,
        valor: mensalidade.valor,
        data_vencimento: mensalidade.data_vencimento,
        dias_restantes: diasRestantes,
        template: template,
        evolution_api_key: config.evolution_api_key,
        evolution_api_url: config.evolution_api_url,
        evolution_instance_name: config.evolution_instance_name
      };

      // Enviar via webhook
      const resultado = await enviarViaWebhook(config.n8n_webhook_lembrete, payload);

      resultados.push({
        mensalidade_id: mensalidade.id,
        cliente: devedor.nome,
        telefone: devedor.telefone,
        sucesso: resultado.success,
        erro: resultado.error || null
      });

      // Aguardar 1 segundo entre envios para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const enviados = resultados.filter(r => r.sucesso).length;
    const falhas = resultados.filter(r => !r.sucesso).length;

    return {
      success: true,
      message: `Processamento concluído: ${enviados} enviados, ${falhas} falhas`,
      enviados,
      falhas,
      detalhes: resultados
    };

  } catch (error) {
    console.error('Erro ao processar lembretes:', error);
    return {
      success: false,
      message: error.message,
      enviados: 0
    };
  }
};

/**
 * Processa e envia avisos de vencimento hoje
 */
export const processarVencimentosHoje = async (userId) => {
  try {
    // 1. Buscar configurações
    const { data: config, error: configError } = await buscarConfiguracoes();
    if (configError) throw configError;

    // Verificar se automação está habilitada
    if (config.automacao_habilitada !== 'true') {
      return {
        success: false,
        message: 'Automação não está habilitada',
        enviados: 0
      };
    }

    // 2. Buscar mensalidades que vencem hoje
    const { data: mensalidades, error: mensalidadesError } =
      await buscarMensalidadesVencimentoHoje(userId);

    if (mensalidadesError) throw mensalidadesError;

    if (!mensalidades || mensalidades.length === 0) {
      return {
        success: true,
        message: 'Nenhuma mensalidade vence hoje',
        enviados: 0
      };
    }

    // 3. Processar cada mensalidade
    const resultados = [];
    const template = config.msg_template_vencimento_hoje;

    for (const mensalidade of mensalidades) {
      const devedor = mensalidade.devedores;

      // Verificar se tem telefone
      if (!devedor.telefone) {
        console.warn(`Cliente ${devedor.nome} não tem telefone cadastrado`);
        continue;
      }

      // Preparar payload
      const payload = {
        nome: devedor.nome,
        telefone: devedor.telefone,
        valor: mensalidade.valor,
        data_vencimento: mensalidade.data_vencimento,
        template: template,
        evolution_api_key: config.evolution_api_key,
        evolution_api_url: config.evolution_api_url,
        evolution_instance_name: config.evolution_instance_name
      };

      // Enviar via webhook
      const resultado = await enviarViaWebhook(config.n8n_webhook_vencimento_hoje, payload);

      resultados.push({
        mensalidade_id: mensalidade.id,
        cliente: devedor.nome,
        telefone: devedor.telefone,
        sucesso: resultado.success,
        erro: resultado.error || null
      });

      // Aguardar 1 segundo entre envios
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const enviados = resultados.filter(r => r.sucesso).length;
    const falhas = resultados.filter(r => !r.sucesso).length;

    return {
      success: true,
      message: `Processamento concluído: ${enviados} enviados, ${falhas} falhas`,
      enviados,
      falhas,
      detalhes: resultados
    };

  } catch (error) {
    console.error('Erro ao processar vencimentos hoje:', error);
    return {
      success: false,
      message: error.message,
      enviados: 0
    };
  }
};

/**
 * Executa todas as automações (lembretes + vencimentos)
 */
export const executarAutomacoes = async (userId) => {
  console.log('🤖 Iniciando processamento de automações...');

  // Processar lembretes
  const resultadoLembretes = await processarLembretes(userId);
  console.log('📨 Lembretes:', resultadoLembretes);

  // Processar vencimentos hoje
  const resultadoVencimentos = await processarVencimentosHoje(userId);
  console.log('⚠️ Vencimentos hoje:', resultadoVencimentos);

  return {
    lembretes: resultadoLembretes,
    vencimentos: resultadoVencimentos,
    total_enviados: resultadoLembretes.enviados + resultadoVencimentos.enviados
  };
};
