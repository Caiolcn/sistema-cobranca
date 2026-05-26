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

  // Usar ; como separador — padrão do Excel em pt-BR (vírgula é decimal)
  const csvContent = [
    headers.join(';'),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        if (typeof value === 'string' && (value.includes(';') || value.includes('\n') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? '';
      }).join(';')
    )
  ].join('\r\n');

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
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const dados = clientes.map(cliente => {
    let diasAtraso = '';
    if (cliente.proxima_mensalidade) {
      const venc = new Date(cliente.proxima_mensalidade + 'T00:00:00');
      const diffDias = Math.floor((hoje - venc) / (1000 * 60 * 60 * 24));
      diasAtraso = diffDias > 0 ? diffDias : 0;
    }

    return {
      'Nome': cliente.nome || '',
      'Telefone': cliente.telefone || '',
      'CPF': cliente.cpf || '',
      'Plano': cliente.plano_nome || 'Sem plano',
      'Tags': Array.isArray(cliente.tags) ? cliente.tags.join(', ') : '',
      'Status': cliente.status || '',
      'Assinatura Ativa': cliente.assinatura_ativa ? 'Sim' : 'Não',
      'Próximo Vencimento': cliente.proxima_mensalidade ? formatarDataExport(cliente.proxima_mensalidade) : '',
      'Dias em Atraso': diasAtraso,
      'Data Cadastro': formatarDataExport(cliente.created_at)
    };
  });

  exportToCSV(dados, 'clientes');
};

/**
 * Exporta lista de clientes em PDF (formato relatório/turma)
 */
export const exportarClientesPDF = async (clientes, { titulo = 'Lista de Alunos', subtitulo = '' } = {}) => {
  if (!clientes || clientes.length === 0) {
    alert('Não há dados para exportar');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  let y = 50;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(titulo, marginX, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110);
  const dataExport = new Date().toLocaleDateString('pt-BR');
  doc.text(`${subtitulo ? subtitulo + '  •  ' : ''}${clientes.length} aluno${clientes.length > 1 ? 's' : ''}  •  Gerado em ${dataExport}`, marginX, y);
  y += 20;

  doc.setDrawColor(220);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 18;

  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.setFont('helvetica', 'bold');
  const colNome = marginX;
  const colTel = marginX + 180;
  const colPlano = marginX + 300;
  const colVenc = marginX + 430;
  doc.text('Aluno', colNome, y);
  doc.text('Telefone', colTel, y);
  doc.text('Plano', colPlano, y);
  doc.text('Próx. Venc.', colVenc, y);
  y += 8;
  doc.setDrawColor(230);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  clientes.forEach((cliente) => {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 50;
    }
    const nome = (cliente.nome || '').substring(0, 30);
    const tel = (cliente.telefone || '').substring(0, 16);
    const plano = (cliente.plano_nome || 'Sem plano').substring(0, 20);
    let vencTxt = '-';
    let atrasado = false;
    if (cliente.proxima_mensalidade) {
      const venc = new Date(cliente.proxima_mensalidade + 'T00:00:00');
      vencTxt = venc.toLocaleDateString('pt-BR');
      atrasado = venc < hoje;
    }
    doc.text(nome, colNome, y);
    doc.text(tel, colTel, y);
    doc.text(plano, colPlano, y);
    if (atrasado) doc.setTextColor(200, 50, 50);
    doc.text(vencTxt, colVenc, y);
    if (atrasado) doc.setTextColor(40);

    if (Array.isArray(cliente.tags) && cliente.tags.length > 0) {
      y += 12;
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text(`Tags: ${cliente.tags.join(', ').substring(0, 90)}`, colNome + 10, y);
      doc.setFontSize(10);
      doc.setTextColor(40);
    }
    y += 18;
  });

  const filename = `alunos_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
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
    'Forma Pagamento': m.forma_pagamento || '',
    'Data Pagamento': m.data_pagamento ? formatarDataExport(m.data_pagamento) : '',
    'Descrição': m.descricao || '',
    'Telefone': m.devedores?.telefone || ''
  }));

  exportToCSV(dados, 'mensalidades');
};

/**
 * Exporta lista de despesas
 */
export const exportarDespesas = (despesas) => {
  const dados = despesas.map(d => ({
    'Descrição': d.descricao || '',
    'Categoria': d.categorias_despesas?.nome || 'Sem categoria',
    'Valor': formatarMoedaExport(d.valor),
    'Status': d.status === 'pago' ? 'Pago' : d.status === 'pendente' ? 'Pendente' : 'Cancelado',
    'Data Vencimento': formatarDataExport(d.data_vencimento),
    'Forma Pagamento': d.forma_pagamento || '',
    'Data Pagamento': d.data_pagamento ? formatarDataExport(d.data_pagamento) : '',
    'Recorrente': d.is_recorrente ? 'Sim' : 'Não',
    'Observações': d.observacoes || ''
  }));

  exportToCSV(dados, 'despesas');
};

/**
 * Exporta lista de cobranças avulsas
 */
export const exportarCobrancasAvulsas = (cobrancas) => {
  const dados = cobrancas.map(c => ({
    'Descrição': c.descricao || '',
    'Aluno': c.devedores?.nome || '',
    'Categoria': c.categoria || 'Outros',
    'Valor': formatarMoedaExport(c.valor),
    'Status': c.status === 'pago' ? 'Pago' : c.status === 'pendente' ? 'Pendente' : 'Cancelado',
    'Data Vencimento': formatarDataExport(c.data_vencimento),
    'Forma Pagamento': c.forma_pagamento || '',
    'Data Pagamento': c.data_pagamento ? formatarDataExport(c.data_pagamento) : '',
    'Observações': c.observacoes || ''
  }));

  exportToCSV(dados, 'cobrancas_avulsas');
};

/**
 * Exporta presenças em CSV
 * Espera array já normalizado: { data, diaSemana, horario, turma, professor, aluno, telefone, presente, observacao }
 */
export const exportarPresencas = (presencas) => {
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dados = presencas.map(p => ({
    'Data': formatarDataExport(p.data),
    'Dia da semana': dias[p.diaSemana] || '',
    'Horário': (p.horario || '').substring(0, 5),
    'Turma': p.turma || '',
    'Professor': p.professor || '',
    'Aluno': p.aluno || '',
    'Telefone': p.telefone || '',
    'Status': p.presente ? 'Presente' : 'Falta',
    'Observação': p.observacao || ''
  }));
  exportToCSV(dados, 'presencas');
};

/**
 * Exporta presenças em PDF (paisagem, com cabeçalho/resumo)
 */
export const exportarPresencasPDF = async (presencas, { subtitulo = '' } = {}) => {
  if (!presencas || presencas.length === 0) {
    alert('Não há dados para exportar');
    return;
  }

  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  let y = 50;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Relatório de Presenças', marginX, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110);
  const dataExport = new Date().toLocaleDateString('pt-BR');
  const totalP = presencas.filter(p => p.presente).length;
  const totalF = presencas.length - totalP;
  doc.text(
    `${subtitulo ? subtitulo + '  •  ' : ''}${presencas.length} registro${presencas.length !== 1 ? 's' : ''} (${totalP} presença${totalP !== 1 ? 's' : ''}, ${totalF} falta${totalF !== 1 ? 's' : ''})  •  Gerado em ${dataExport}`,
    marginX, y
  );
  y += 20;

  doc.setDrawColor(220);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 18;

  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.setFont('helvetica', 'bold');
  const colData   = marginX;
  const colHora   = marginX + 75;
  const colTurma  = marginX + 125;
  const colProf   = marginX + 280;
  const colAluno  = marginX + 430;
  const colStatus = marginX + 600;
  const colObs    = marginX + 670;

  doc.text('Data', colData, y);
  doc.text('Hora', colHora, y);
  doc.text('Turma', colTurma, y);
  doc.text('Professor', colProf, y);
  doc.text('Aluno', colAluno, y);
  doc.text('Status', colStatus, y);
  doc.text('Obs.', colObs, y);
  y += 8;
  doc.setDrawColor(230);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40);

  presencas.forEach((p) => {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 50;
    }
    doc.text((formatarDataExport(p.data) || '').substring(0, 12), colData, y);
    doc.text((p.horario || '').substring(0, 5), colHora, y);
    doc.text((p.turma || '').substring(0, 24), colTurma, y);
    doc.text((p.professor || '').substring(0, 24), colProf, y);
    doc.text((p.aluno || '').substring(0, 26), colAluno, y);

    if (p.presente) doc.setTextColor(22, 163, 74);
    else doc.setTextColor(220, 38, 38);
    doc.text(p.presente ? 'Presente' : 'Falta', colStatus, y);
    doc.setTextColor(40);

    doc.text((p.observacao || '').substring(0, 24), colObs, y);
    y += 16;
  });

  doc.save(`presencas_${new Date().toISOString().split('T')[0]}.pdf`);
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
