# 📋 Nova Funcionalidade: Tela de Clientes

## ✅ O que foi criado:

### 1. **Página de Clientes** ([Clientes.js](src/Clientes.js))

Uma tela completa para gerenciar todos os clientes cadastrados no sistema.

#### Funcionalidades:

**📊 Lista de Clientes:**
- Exibe todos os clientes cadastrados
- Mostra avatar com inicial do nome
- Telefone do cliente
- Contador de parcelas (pagas/pendentes)
- Valor total em aberto
- Botão de excluir cliente

**🔍 Resumo Geral:**
- Total de clientes cadastrados
- Soma de todos os valores em aberto

**✏️ Detalhes do Cliente (Modal):**
Ao clicar em um cliente, abre um popup com:
- Avatar e informações básicas
- Edição de nome e telefone
- Cards com resumo financeiro:
  - Total de parcelas
  - Parcelas pagas
  - Valor em aberto
- Lista completa de todas as parcelas do cliente
- Histórico de vencimentos e status

**🗑️ Exclusão de Cliente:**
- Botão para excluir cliente
- Confirmação antes de excluir
- Remove automaticamente todas as parcelas associadas

---

## 🎨 Layout e Design:

### Cores utilizadas:
- **Verde (#4CAF50)**: Parcelas pagas
- **Laranja (#ff9800)**: Parcelas pendentes
- **Vermelho (#f44336)**: Valores em aberto / Em atraso
- **Azul (#2196F3)**: Parcelas em aberto (dentro do prazo)
- **Cinza (#344848)**: Elementos principais

### Componentes:
- Tabela responsiva com hover
- Cards informativos coloridos
- Modal centralizado com scroll
- Botões com ícones do Iconify
- Estados de loading

---

## 🚀 Como usar:

### Acessar a tela de Clientes:
1. Faça login no sistema
2. No menu lateral esquerdo, clique no **ícone de pessoas** (segundo ícone)
3. A tela de clientes será exibida

### Ver detalhes de um cliente:
1. Clique em qualquer linha da tabela
2. Um modal será aberto com todas as informações
3. Você pode editar nome e telefone clicando em "Editar"

### Editar um cliente:
1. Abra o modal do cliente (clicando nele)
2. Clique no botão "Editar"
3. Altere nome ou telefone
4. Clique em "Salvar Alterações"

### Excluir um cliente:
1. Clique no ícone de lixeira (🗑️) na coluna "Ações"
2. Confirme a exclusão
3. **ATENÇÃO**: Todas as parcelas do cliente também serão excluídas!

---

## 🔧 Alterações no código:

### Arquivos criados:
- `src/Clientes.js` - Componente principal da tela de clientes

### Arquivos modificados:
- `src/Dashboard.js` - Adicionado menu lateral e navegação entre telas
- `src/Financeiro.js` - Removido menu lateral (agora está no Dashboard)

---

## 📊 Queries utilizadas:

### Buscar clientes:
```sql
SELECT id, nome, telefone, created_at
FROM devedores
WHERE user_id = :user_id
ORDER BY nome ASC
```

### Buscar parcelas para calcular valor devido:
```sql
SELECT devedor_id, valor, status
FROM parcelas
WHERE user_id = :user_id
```

### Buscar parcelas de um cliente específico:
```sql
SELECT *
FROM parcelas
WHERE devedor_id = :devedor_id
ORDER BY data_vencimento DESC
```

### Excluir cliente e parcelas:
```sql
-- 1. Excluir parcelas
DELETE FROM parcelas WHERE devedor_id = :devedor_id

-- 2. Excluir cliente
DELETE FROM devedores WHERE id = :devedor_id
```

---

## 📱 Navegação:

### Menu lateral atualizado:
- **Ícone 1 (Recibo)**: Financeiro (tela de parcelas)
- **Ícone 2 (Pessoas)**: Clientes (nova tela)
- **Ícone 3 (WhatsApp)**: Placeholder para futura funcionalidade
- **Perfil**: Abre modal de perfil do usuário
- **Sair**: Faz logout

---

## ✅ Checklist de funcionalidades:

- [x] Lista todos os clientes cadastrados
- [x] Mostra valor em aberto por cliente
- [x] Mostra total de parcelas (pagas/pendentes)
- [x] Permite editar nome e telefone
- [x] Permite excluir cliente
- [x] Exclui automaticamente parcelas ao excluir cliente
- [x] Modal com detalhes completos do cliente
- [x] Lista histórico de parcelas do cliente
- [x] Design responsivo e consistente
- [x] Estados de loading
- [x] Navegação entre Financeiro e Clientes

---

## 🎯 Próximas melhorias possíveis:

1. **Busca/Filtro**: Adicionar campo de busca por nome ou telefone
2. **Ordenação**: Permitir ordenar por nome, valor devido, etc.
3. **Exportação**: Exportar lista de clientes para CSV/Excel
4. **Paginação**: Para muitos clientes, adicionar paginação
5. **Estatísticas**: Gráficos de inadimplência por cliente
6. **Histórico de pagamentos**: Timeline visual dos pagamentos
7. **Notas**: Campo para adicionar observações sobre o cliente
8. **Tags/Categorias**: Organizar clientes por categorias

---

## 🐛 Solução de problemas:

### Clientes não aparecem:
- Verifique se há clientes cadastrados
- Clientes são criados automaticamente ao adicionar parcelas na tela Financeiro

### Erro ao excluir cliente:
- Verifique permissões no Supabase
- Certifique-se de que as políticas RLS estão corretas

### Modal não abre:
- Verifique se há erros no console
- Recarregue a página

---

## 🎉 Pronto!

A funcionalidade de Clientes está completa e funcionando! Agora você pode:
- Visualizar todos os clientes
- Ver valor devido de cada um
- Editar informações
- Excluir clientes
- Ver histórico completo de parcelas

Bom uso! 🚀
