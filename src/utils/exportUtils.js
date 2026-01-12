// Utilitários para exportação de dados

/**
 * Converte array de objetos para CSV
 */
export const exportToCSV = (data, filename) => {
  if (!data || data.length === 0) {
    alert('Não há dados para exportar');
    return;
  }

  // Extrair headers
  const headers = Object.keys(data[0]);

  // Criar linhas CSV
  const csvContent = [
    headers.join(','), // Header
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        // Escapar valores que contêm vírgula ou quebra de linha
        if (typeof value === 'string' && (value.includes(',') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? '';
      }).join(',')
    )
  ].join('\n');

  // Adicionar BOM para UTF-8 (corrige acentos no Excel)
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  // Download
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Formata data para exibição
 */
export const formatarDataExport = (data) => {
  if (!data) return '';
  const d = new Date(data);
  return d.toLocaleDateString('pt-BR');
};

/**
 * Formata valor monetário para exibição
 */
export const formatarMoedaExport = (valor) => {
  if (valor === null || valor === undefined) return 'R$ 0,00';
  return `R$ ${parseFloat(valor).toFixed(2).replace('.', ',')}`;
};

/**
 * Exporta lista de clientes
 */
export const exportarClientes = (clientes) => {
  const dados = clientes.map(cliente => ({
    'Nome': cliente.nome,
    'Telefone': cliente.telefone,
    'Email': cliente.email || '',
    'Plano': cliente.plano_nome || 'Sem plano',
    'Valor Plano': formatarMoedaExport(cliente.plano_valor),
    'Status': cliente.status,
    'Assinatura Ativa': cliente.assinatura_ativa ? 'Sim' : 'Não',
    'Data Cadastro': formatarDataExport(cliente.created_at)
  }));

  exportToCSV(dados, 'clientes');
};

/**
 * Exporta lista de mensalidades/financeiro
 */
export const exportarMensalidades = (mensalidades) => {
  const dados = mensalidades.map(m => ({
    'Cliente': m.devedor_nome || m.devedores?.nome,
    'Valor': formatarMoedaExport(m.valor),
    'Status': m.status === 'pago' ? 'Pago' : m.status === 'pendente' ? 'Pendente' : 'Cancelado',
    'Data Vencimento': formatarDataExport(m.data_vencimento),
    'Data Pagamento': m.data_pagamento ? formatarDataExport(m.data_pagamento) : '',
    'Descrição': m.descricao || '',
    'Telefone': m.devedores?.telefone || ''
  }));

  exportToCSV(dados, 'mensalidades');
};

/**
 * Exporta resumo do dashboard
 */
export const exportarResumoDashboard = (dados) => {
  const resumo = [
    {
      'Métrica': 'MRR (Receita Mensal Recorrente)',
      'Valor': formatarMoedaExport(dados.mrr),
      'Observação': `${dados.assinaturasAtivas} assinaturas ativas`
    },
    {
      'Métrica': 'Recebimentos do Mês',
      'Valor': formatarMoedaExport(dados.recebimentosMes),
      'Observação': ''
    },
    {
      'Métrica': 'Valor em Atraso',
      'Valor': formatarMoedaExport(dados.valorEmAtraso),
      'Observação': `${dados.clientesInadimplentes} clientes inadimplentes`
    },
    {
      'Métrica': 'Taxa de Cancelamento',
      'Valor': `${dados.taxaCancelamento.toFixed(1)}%`,
      'Observação': dados.taxaCancelamento < 5 ? 'Excelente' : dados.taxaCancelamento < 10 ? 'Atenção' : 'Crítico'
    },
    {
      'Métrica': 'Receita Projetada do Mês',
      'Valor': formatarMoedaExport(dados.receitaProjetadaMes),
      'Observação': 'Recebido + A receber'
    },
    {
      'Métrica': 'Mensalidades a Vencer (7 dias)',
      'Valor': formatarMoedaExport(dados.mensalidadesVencer7Dias),
      'Observação': 'Próximos 7 dias'
    },
    {
      'Métrica': 'Mensagens Enviadas',
      'Valor': dados.mensagensEnviadasAuto.toString(),
      'Observação': 'Automáticas pelo sistema'
    }
  ];

  exportToCSV(resumo, 'resumo_dashboard');
};
