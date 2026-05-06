# Roteiros — Vídeos Tutoriais Mensalli

---

## 1. Como criar sua conta no Mensalli
- Acessar mensalli.com.br
- Clicar em "Criar conta grátis"
- Preencher: nome completo, e-mail, telefone, senha
- Explicar que começa com 3 dias de trial gratuito
- Após criar, é redirecionado pro dashboard
- Mostrar o onboarding (primeiros passos)

---

## 2. Configuração inicial — nome da empresa, logo e dados
- Ir em Configurações → Dados da Empresa
- Preencher: nome da empresa, CNPJ/CPF, endereço, telefone
- Fazer upload da logo (aparece no portal do aluno e link de agendamento)
- Salvar
- Mostrar onde a logo aparece: portal do aluno, link de agendamento, cobranças

---

## 3. Como configurar sua chave PIX
- Ir em WhatsApp → Templates de Mensagens
- Encontrar o campo "Chave PIX"
- Explicar os tipos: CPF, CNPJ, telefone, e-mail, chave aleatória
- Colar a chave exatamente como está no app do banco
- Salvar
- Mostrar que a chave aparece nas mensagens automáticas de cobrança
- Dica: conferir no app do banco se a chave está ativa

---

## 4. Como conectar seu WhatsApp (QR Code e Código de Pareamento)
- Ir em WhatsApp → aba Conexão
- Método 1 — QR Code:
  - Clicar em "Conectar WhatsApp"
  - Abrir WhatsApp no celular → Dispositivos conectados → Conectar dispositivo
  - Escanear o QR Code
  - Aguardar status "Conectado" (verde)
- Método 2 — Código de Pareamento (pra celular):
  - Selecionar "Código de pareamento"
  - Digitar número com DDD
  - Clicar em "Conectar WhatsApp"
  - No celular: Dispositivos conectados → Conectar dispositivo → Conectar com número de telefone
  - Digitar o código exibido na tela
- Mostrar que o status fica verde "Conectado"
- Dica: manter o celular com internet pra mensagens funcionarem

---

## 5. Como cadastrar um aluno manualmente
- Ir em Alunos → + Adicionar
- Step 1 — Dados básicos:
  - Nome completo (obrigatório)
  - Telefone com DDD (obrigatório)
  - CPF, e-mail, data de nascimento (opcionais)
- Step 2 — Plano e datas:
  - Selecionar plano (se tiver criado)
  - Data de início
  - Data de vencimento da primeira mensalidade
  - Checkbox "Criar primeira mensalidade"
- Step 3 — Resumo:
  - Revisar dados
  - Opção de enviar mensagem de boas-vindas
  - Clicar em "Cadastrar"
- Mostrar que o aluno aparece na lista

---

## 6. Como cadastrar aluno menor de idade (com responsável)
- Mesmo fluxo do vídeo 5
- No Step 1, marcar "Aluno menor de idade / tem responsável"
- Preencher: nome do responsável, telefone do responsável
- Explicar que as cobranças e mensagens vão pro telefone do responsável
- O telefone do aluno pode ser igual ao do responsável (sistema permite)
- Mostrar que na ficha do aluno aparece "Responsável: Nome (telefone)"

---

## 7. Como importar alunos por planilha CSV
- Ir em Alunos → ícone de upload (ou botão importar)
- Baixar o modelo de planilha (botão "Baixar modelo")
- Explicar o formato: Nome;Telefone;CPF;Plano;Data_Inicio;Data_Vencimento
- Preencher a planilha no Excel/Google Sheets
- Salvar como .csv (separado por ponto e vírgula)
- Arrastar o arquivo ou clicar pra selecionar
- Mapear as colunas (sistema detecta automaticamente)
- Clicar em "Validar Dados"
- Revisar: verdes = prontos, vermelhos = erros
- Clicar em "Importar"
- Mostrar que alunos com mesmo telefone viram "irmãos" (responsável automático)
- Dica: se o plano não existir, criar antes na aba Configurações → Planos

---

## 8. Como editar dados de um aluno
- Clicar no aluno na lista
- Na ficha, clicar no ícone de edição (lápis)
- Alterar: nome, telefone, CPF, e-mail, data de nascimento, responsável
- Salvar
- Mostrar que o dia de vencimento pode ser alterado (atualiza mensalidades pendentes)

---

## 9. Como ativar e desativar assinatura de um aluno
- Na ficha do aluno, clicar no toggle de assinatura
- Ativar:
  - Selecionar plano
  - Definir data de início e vencimento
  - Sistema cria primeira mensalidade automaticamente
- Desativar:
  - Confirmar desativação
  - Sistema para de gerar novas mensalidades
  - Mensalidades pendentes continuam (não são canceladas)
- Dica: desativar não exclui o aluno, só para a cobrança recorrente

---

## 10. Como trocar o plano de um aluno
- Na ficha do aluno, clicar em "Alterar plano"
- Selecionar novo plano
- Próxima mensalidade será gerada com o valor do novo plano
- Mostrar que mensalidades anteriores não são afetadas

---

## 11. Como excluir um aluno (lixeira)
- Na lista de alunos, clicar no ícone de lixeira
- Confirmar exclusão
- O aluno vai pra lixeira (soft delete)
- Explicar que dados são preservados por segurança
- Agendamentos do aluno são cancelados automaticamente

---

## 12. Como usar os filtros de busca
- Barra de busca: digitar nome ou telefone
- Botão "Filtrar":
  - Status: ativo, inadimplente, cancelado
  - Plano: filtrar por plano específico
  - Assinatura: ativada ou desativada
  - Vencimento: período de/até
  - Aniversariantes: do mês atual
- Mostrar que filtros podem ser combinados
- Botão "Limpar" pra resetar

---

## 13. Como enviar o link do portal pro aluno pelo WhatsApp
- Na ficha do aluno, botões ao lado do telefone:
  - "Copiar portal" — copia o link pra área de transferência
  - "Enviar portal" — envia direto pelo WhatsApp com mensagem formatada
- Mostrar a mensagem que o aluno recebe
- Explicar que o link é único por aluno (token)
- Dica: o aluno pode instalar como app no celular (PWA)

---

## 14. Como criar planos de assinatura
- Ir em Configurações → Planos
- Clicar em "+ Novo Plano"
- Preencher:
  - Nome (ex: Mensal, Trimestral, Pacote 10 aulas)
  - Valor
  - Tipo: recorrente ou pacote de aulas
  - Ciclo: mensal, trimestral, anual
  - Se pacote: número de aulas
- Salvar
- Mostrar que o plano aparece na hora de cadastrar/ativar aluno

---

## 15. Como editar e desativar planos
- Em Configurações → Planos
- Clicar no plano pra editar
- Alterar nome, valor, tipo
- Desativar: plano não aparece mais nas opções mas alunos existentes mantêm
- Excluir: só se nenhum aluno está usando

---

## 16. Como pausar cobranças de um aluno
- Na ficha do aluno, opção "Pausar cobranças"
- Enquanto pausado, sistema não gera novas mensalidades
- Mensalidades pendentes continuam visíveis
- Despausar pra retomar cobranças automáticas

---

## 17. Visão geral da tela de Financeiro
- Mostrar os 4 cards no topo:
  - Em atraso (vermelho): valor total de mensalidades vencidas
  - Próximos vencimentos (laranja): quantos vencem nos próximos 7 dias
  - Recebido (verde): valor total recebido no mês
  - MRR (azul): receita mensal recorrente
- Lista de mensalidades com colunas: aluno, vencimento, valor, plano, status
- Filtros rápidos: vence hoje, 7 dias, 30 dias, período personalizado
- Ações: marcar pago, cancelar, ver detalhes

---

## 18. Como dar baixa manual em um pagamento
- Na lista do Financeiro, encontrar a mensalidade
- Clicar no ícone de check (✓)
- Selecionar forma de pagamento: PIX, cartão, dinheiro, transferência
- Confirmar
- Sistema marca como pago e cria a próxima mensalidade automaticamente
- Confirmação enviada pro aluno via WhatsApp (se ativado)

---

## 19. Como desfazer um pagamento
- Na lista do Financeiro, encontrar a mensalidade paga
- Clicar no ícone de desfazer
- Confirmar
- Volta pro status "pendente"
- Dica: se a próxima mensalidade já foi criada, ela permanece

---

## 20. Como usar os filtros do Financeiro
- Filtros por status: Pago, Em aberto, Em atraso
- Filtro por vencimento: Hoje, 7 dias, 30 dias
- Período personalizado: data de/até
- Filtros podem ser combinados
- Botão "Aplicar Filtros" e "Limpar"

---

## 21. Como exportar relatório financeiro em CSV
- Na tela de Financeiro, clicar no ícone de download
- Selecionar período
- Arquivo CSV é gerado com todas as mensalidades filtradas
- Abrir no Excel/Google Sheets

---

## 22. Entendendo os indicadores (em atraso, a vencer, recebido, MRR)
- Em atraso: soma de mensalidades vencidas e não pagas
- Próximos vencimentos: mensalidades que vencem nos próximos 7 dias
- Recebido: total pago no mês atual
- MRR (Monthly Recurring Revenue): soma dos planos ativos × valor
- Clicar em "Ver detalhes" nos cards pra ver lista detalhada

---

## 23. Como funcionam as automações de cobrança
- Ir em WhatsApp → Templates de Mensagens
- Automações disponíveis:
  - 3 dias antes: lembrete antes do vencimento
  - No dia: aviso no dia do vencimento
  - 3 dias depois: cobrança de atraso
- Cada uma tem toggle liga/desliga
- Mensagens são enviadas automaticamente pelo sistema (n8n)
- Rodham todos os dias às 9h da manhã
- Intervalo de ~45 segundos entre cada envio

---

## 24. Como ativar e desativar cada automação
- Em WhatsApp → Templates
- Seção "Automações"
- Clicar no toggle de cada automação
- Verde = ativo, cinza = desativado
- Primeira vez que ativa, cria a configuração automaticamente
- Dica: ativar pelo menos "No dia" pra começar

---

## 25. Como editar templates de mensagem
- Em WhatsApp → Templates
- Clicar na automação desejada (ex: "No Dia")
- Editar a mensagem no editor à direita
- Usar variáveis clicáveis abaixo do editor
- Clicar em "Preview" pra ver como fica
- Clicar em "Salvar"
- Botão "Restaurar Padrão" pra voltar ao template original

---

## 26. Como usar variáveis nos templates
- Variáveis disponíveis:
  - {{nomeCliente}} — nome do aluno
  - {{valorMensalidade}} — valor da mensalidade
  - {{dataVencimento}} — data de vencimento
  - {{nomeEmpresa}} — nome da empresa
  - {{chavePix}} — chave PIX cadastrada
  - {{linkPagamento}} — link do Asaas (se configurado)
  - {{diasAtraso}} — dias de atraso (só no template de vencido)
- Clicar na variável pra copiar
- Colar no texto do template
- No Preview, variáveis são substituídas por dados de exemplo

---

## 27. Como funciona a confirmação de pagamento automática
- Em Automações, toggle "Confirmação Pagamento"
- Quando admin marca mensalidade como paga, sistema envia WhatsApp pro aluno
- Mensagem: "Pagamento de R$ X confirmado! Obrigado!"
- Funciona com qualquer forma de pagamento

---

## 28. Como funciona o lembrete de aniversário
- Em Automações, toggle "Aniversário"
- Sistema envia mensagem de parabéns no dia do aniversário do aluno
- Roda às 8h da manhã
- Envia 1x por ano (não repete)
- Aluno precisa ter data de nascimento cadastrada

---

## 29. Como funciona o lembrete de aula
- Em Automações, toggle "Lembrete Aula"
- Sistema envia 1 hora antes da aula (grade de horários)
- Mensagem: "Sua aula de X é em 1 hora!"
- Roda a cada 15 minutos verificando próximas aulas

---

## 30. Como configurar o método de pagamento nas mensagens
- Em WhatsApp → Templates → seção de Chave PIX
- Dois modos:
  - PIX Manual: mensagem inclui a chave PIX pra copiar
  - Link Asaas: mensagem inclui link de pagamento do Asaas
- Ao trocar, templates são atualizados automaticamente
- Dica: PIX Manual é mais simples, Asaas permite boleto e cartão

---

## 31. Como criar uma campanha de disparo em massa
- Ir em WhatsApp → aba Campanhas (só Premium)
- Clicar em "Nova Campanha"
- Preencher título (ex: "Aviso de feriado")
- Escolher público: todos ativos, por plano, inadimplentes
- Escrever a mensagem (texto livre com emojis)
- Usar variáveis: {{nomeCliente}}, {{nomeEmpresa}}
- Ver preview da mensagem
- Conferir quantidade de destinatários
- Ler as regras de envio
- Clicar em "Enviar Campanha"

---

## 32. Como escolher o público-alvo da campanha
- Todos ativos: todos os alunos com assinatura ativa
- Por plano: só alunos de um plano específico
- Inadimplentes: alunos com mensalidade vencida
- Após escolher, sistema mostra quantos vão receber
- Expandir lista pra ver os nomes

---

## 33. Como selecionar/desmarcar alunos na campanha
- Clicar na seta pra expandir a lista de destinatários
- Todos vêm marcados por padrão
- Desmarcar quem não quer que receba
- "Desmarcar todos" / "Marcar todos" no topo
- Contadores atualizam em tempo real
- Tempo estimado atualiza conforme seleção

---

## 34. Como acompanhar o progresso de envio
- Após clicar em enviar, tela de progresso aparece
- Barra de progresso com contagem: X/Y
- Enviados (verde) e falhas (vermelho)
- Botão "Cancelar envio" pra parar no meio
- Ao finalizar, mostra resumo
- Intervalo de ~30 segundos entre cada mensagem

---

## 35. Como ver o histórico de campanhas
- Em WhatsApp → Campanhas → aba "Histórico"
- Lista de campanhas com: título, data, status, enviados/total
- Clicar pra expandir e ver:
  - Mensagem enviada
  - Lista de cada aluno: enviado (✓) ou falha (✗) com motivo
- Status: Concluída, Cancelada, Enviando

---

## 36. Como criar aulas na grade de horários (visão Semana)
- Ir em Horários → aba Semana
- Clicar em "+ Adicionar"
- Selecionar aluno
- Escolher dia(s) da semana (pode marcar vários)
- Definir horário
- Descrição da aula (ex: Pilates, Yoga)
- Salvar
- Aula aparece na grade no dia/horário escolhido

---

## 37. Como marcar presença na visão Hoje
- Ir em Horários → aba Hoje
- Ver lista de aulas do dia com alunos
- Clicar no botão circular ao lado do aluno:
  - 1 toque = marca presente (verde)
  - 2º toque = abre modal pra editar (falta, observação)
- Créditos de pacote são decrementados automaticamente
- Notificação WhatsApp enviada pro aluno (se ativado)

---

## 38. Como funciona o controle de créditos (pacote de aulas)
- Planos tipo "pacote" têm número de aulas (ex: 10 aulas)
- Ao ativar assinatura com pacote, aluno recebe os créditos
- Cada presença marcada desconta 1 crédito
- Falta não desconta
- Quando créditos acabam, aparece alerta
- Badge colorido na ficha: verde (>2), amarelo (<=2), vermelho (0)

---

## 39. Como a notificação de presença funciona via WhatsApp
- Toggle "Notificar aluno" no canto superior da grade
- Quando ligado, cada presença/falta envia WhatsApp pro aluno
- Presente: "✅ Presença confirmada! Aula X de Y"
- Falta: "❌ Falta registrada"
- Inclui créditos restantes se for pacote

---

## 40. Como ativar o agendamento online
- Ir em Configurações → aba Agendamento Online
- Ativar o toggle
- Definir slug (link personalizado): ex: /agendar/meu-studio
- Clicar em "Gerar" ou digitar manualmente
- Definir prazo mínimo de cancelamento (padrão: 2 horas)
- Salvar
- Copiar e compartilhar o link com os alunos

---

## 41. Como criar aulas com capacidade no menu Agendamento
- Ir em Horários → aba Agendamento
- Clicar em "+ Nova Aula"
- Selecionar dia(s) da semana
- Definir horário de início e fim + intervalo (gera em lote)
- Descrição da aula
- Capacidade (número de vagas)
- Salvar
- Preview mostra quantas aulas serão criadas

---

## 42. Como criar aulas em lote
- Em "+ Nova Aula"
- Selecionar múltiplos dias (ex: Seg, Qua, Sex)
- Definir horário início: 07:00, fim: 18:00, intervalo: 60min
- Preview: "11 horários × 3 dias = 33 aulas"
- Todos os horários são listados
- Clicar em "Criar"

---

## 43. Como adicionar alunos fixos numa aula
- Na aba Agendamento, encontrar a aula
- Clicar no ícone laranja (pessoa com +)
- Selecionar aluno da lista
- Confirmar
- Aluno aparece como "fixo" com ícone de pin
- Fixos ocupam vaga permanente (descontam da capacidade)
- Fixos não precisam agendar toda semana

---

## 44. Como funciona o link público de agendamento
- Aluno acessa: mensalli.com.br/agendar/seu-slug
- Digita o telefone
- Se tem mais de um cadastro: seleciona qual
- Vê os dias disponíveis (próximos 14 dias)
- Vê aulas com vagas
- Clica em "Agendar"
- Horários com menos de 1h de antecedência não aparecem
- Admin recebe notificação via WhatsApp

---

## 45. Como o aluno agenda e cancela pelo link
- Agendar: seleciona dia → clica "+ Agendar" no horário
- Cancelar: aba "Meus" → clica "Cancelar"
- Respeita prazo de antecedência (ex: 2h antes)
- Limite de 1 agendamento por dia
- Aluno fixo vê card roxo com "Cancelar presença" / "Irei nesta aula"

---

## 46. Como funciona a lista de espera
- Quando aula está lotada, aluno vê "Entrar na lista de espera"
- Clica e entra na fila com posição (ex: 1º, 2º)
- Se alguém cancela, primeiro da fila recebe WhatsApp com link pra confirmar
- Tem 1 hora pra confirmar, senão passa pro próximo
- Admin vê "X na fila" no card da aula

---

## 47. Como funciona o bloqueio por inadimplência
- Aluno com mensalidade vencida é bloqueado automaticamente
- No link de agendamento: não consegue agendar, vê mensagem de bloqueio
- No portal do aluno: aba "Agendar" mostra cadeado
- Ao regularizar (pagar), bloqueio é removido automaticamente

---

## 48. Como o aluno fixo cancela uma aula específica
- Aluno fixo acessa o link de agendamento
- Vê suas aulas com card roxo e badge "Fixo"
- Clica "Não irei nesta aula" pra avisar que não vai
- Admin recebe WhatsApp: "Aluno fixo cancelou aula"
- Vaga é liberada pra outro aluno
- Aluno pode clicar "Irei nesta aula" pra desfazer

---

## 49. Como funciona o Portal do Aluno (visão do admin)
- Cada aluno tem um link único: /portal/token
- Mostrar como enviar o link (botão "Enviar portal" na ficha)
- O que o aluno vê depende do plano do admin:
  - Starter: só a Home
  - Pro: Home + Avisos + Pagar + Aulas
  - Premium: tudo + Agendamento
- Mostrar o portal na visão do aluno

---

## 50. Como o aluno acessa e paga pelo portal
- Aluno abre o link recebido
- Vê dados do plano, próximo vencimento
- Aba "Pagar": lista de mensalidades pendentes
- Clica em "Pagar agora"
- Código PIX copia e cola é gerado com valor
- Aluno copia e cola no app do banco
- Ou usa link do Asaas (se configurado)

---

## 51. Como o aluno agenda aulas pelo portal
- No portal → aba "Aulas" → sub-aba "Agendar"
- Seleciona o dia
- Vê aulas disponíveis com vagas
- Clica "+ Agendar"
- Vê agendamentos na sub-aba "Aulas"
- Pode cancelar por ali também
- Funcionalidade só disponível no plano Premium do admin

---

## 52. Como o aluno vê frequência e histórico
- No portal → aba "Aulas" → sub-aba "Frequência"
- Círculo com percentual de aproveitamento
- Contadores: presenças, faltas, total
- Barra de progresso
- Histórico detalhado: data + presente/falta + observação

---

## 53. Como instalar o portal como app no celular (PWA)
- Aluno acessa o link do portal no navegador
- Banner aparece: "Adicionar à tela inicial"
- No Android: aceitar o banner ou Menu → "Adicionar à tela inicial"
- No iPhone: botão compartilhar → "Adicionar à Tela de Início"
- Ícone aparece na tela do celular como um app
- Abre direto no portal sem barra do navegador

---

## 54. Como editar dados da empresa
- Configurações → Dados da Empresa
- Nome, CNPJ/CPF, endereço completo, telefone
- Upload de logo
- Salvar
- Dados aparecem no portal do aluno e recibos

---

## 55. Como gerenciar planos
- Configurações → Planos
- Lista de planos com: nome, valor, tipo, status
- Criar novo, editar existente, desativar
- Tipos: recorrente (mensal/trimestral/anual) ou pacote de aulas
- Plano desativado não aparece mais nas opções

---

## 56. Como configurar integrações (Asaas)
- Configurações → Integrações
- Asaas: colar API Key
- Escolher ambiente: sandbox (teste) ou produção
- Modo de integração: PIX Manual ou Asaas
- Com Asaas: boletos e cartão disponíveis automaticamente

---

## 57. Como ver o uso do sistema
- Configurações → Uso do Sistema
- Mostra: mensagens enviadas no mês / limite do plano
- Número de alunos ativos / limite do plano
- Histórico de uso

---

## 58. Como configurar o agendamento online
- Configurações → Agendamento Online
- Toggle ativar/desativar
- Slug personalizado (link público)
- Prazo mínimo de cancelamento (horas)
- Botão copiar link
- Dica: compartilhar link nas redes sociais e grupos

---

## 59. Como criar e gerenciar avisos para os alunos
- Ir em Avisos no menu lateral
- Clicar em "+ Novo Aviso"
- Preencher: título, conteúdo, tipo (geral/importante/evento)
- Opção de fixar no topo
- Upload de imagem (opcional)
- Salvar
- Aviso aparece no portal do aluno na aba "Avisos"
- Badge de notificação mostra quantos não lidos

---

## 60. Como interpretar o dashboard
- Card MRR: receita mensal recorrente (soma dos planos ativos)
- Card Assinaturas: quantos alunos com assinatura ativa
- Card Recebido: valor total pago no mês
- Card Em Atraso: valor de mensalidades vencidas
- Fila de WhatsApp: próximas mensagens a enviar
- Mensagens recentes: últimos envios com status
- Alertas de falha: mensagens que não foram enviadas

---

## 61. Como usar a tela de relatórios
- Ir em Relatórios
- Cards de indicadores: pagamentos hoje, a vencer, inadimplentes, receita projetada
- Gráficos:
  - Recebimento vs Vencimento (últimos meses)
  - Status das mensalidades (pizza)
- Filtros por período: mês atual, 3 meses, 6 meses, ano
- Mensagens enviadas no período

---

## 62. Como usar o CRM
- Ir em CRM no menu lateral
- Visão de relacionamento com alunos
- Histórico de interações
- Filtros por status e engajamento

---

## 63. Como funciona a visão de admin
- Banner "ADMIN" no topo
- Dropdown pra selecionar conta de cliente
- Ao selecionar, vê o dashboard como se fosse o cliente
- Pode navegar em todas as telas na visão do cliente
- Útil pra suporte e configuração remota
- Clicar no ícone de olho pra sair da visão

---

## 64. Como fazer upgrade de plano
- Ir em Configurações → Upgrade de Plano
- Ver comparativo: Starter, Pro, Premium
- Selecionar plano desejado
- Pagar via PIX
- Plano é ativado automaticamente após confirmação
- Features desbloqueadas imediatamente

---

## 65. Diferenças entre planos Starter, Pro e Premium
- Starter:
  - Até 50 alunos
  - Cobrança no dia do vencimento
  - Portal do aluno (só Home)
- Pro:
  - Até 150 alunos
  - Todas as automações (3 dias antes, no dia, vencido, aniversário)
  - Portal completo (sem agendamento)
  - Relatórios
- Premium:
  - Até 500 alunos
  - Tudo do Pro
  - Agendamento online com link público
  - Lista de espera
  - Campanhas de WhatsApp
  - Portal com agendamento
