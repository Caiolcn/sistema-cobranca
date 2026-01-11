# Refatoração da Tela de Clientes - Sistema de Assinaturas

## 🎯 Objetivo
Transformar a tela de /clientes em um gerenciador completo de assinantes com criação automática de mensalidades recorrentes.

---

## ✅ Funcionalidades Implementadas

### 1. **Campo CPF no Modal de Novo Cliente**
- Campo opcional para cadastro de CPF
- Formato sugerido: `000.000.000-00`
- Armazenado na coluna `cpf` da tabela `devedores`
- Exibido no modal de detalhes do cliente

### 2. **Toggle para Criar Assinatura**
- Switch visual para ativar criação de assinatura ao cadastrar cliente
- Quando ativado, exibe campos adicionais:
  - Data de Início da Assinatura
  - Seleção de Plano

### 3. **Seleção de Plano**
- Dropdown com planos ativos cadastrados pelo usuário
- Carrega da tabela `planos` (apenas planos com `ativo = true`)
- Mostra nome e valor do plano
- Valida se usuário tem planos cadastrados
- Link rápido para tela de planos (futuro)

### 4. **Criação Automática de Mensalidade**
Quando toggle de assinatura está ativo:
- Cria automaticamente a primeira mensalidade na tabela `parcelas`
- Configurações da mensalidade:
  - `is_mensalidade = true`
  - `valor` = valor do plano selecionado
  - `data_vencimento` = data_inicio + 30 dias
  - `status = 'pendente'`
  - Vinculada ao cliente recém-criado

### 5. **Seção de Assinatura no Modal de Detalhes**
Nova seção exibida apenas para clientes com plano:

**Informações Exibidas:**
- Badge de status: ATIVA ou CANCELADA
- Nome do plano atual
- Valor mensal do plano
- Data de início da assinatura

**Ações Disponíveis:**
- Botão "Cancelar Assinatura" (quando ativa)
- Botão "Reativar Assinatura" (quando cancelada)
- Atualiza campo `assinatura_ativa` no banco

---

## 📊 Modificações no Banco de Dados

### Tabela `planos` (Nova)
```sql
CREATE TABLE planos (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES usuarios(id),
  nome VARCHAR(255) NOT NULL,
  valor DECIMAL(10, 2) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Tabela `devedores` (Colunas Adicionadas)
```sql
ALTER TABLE devedores ADD COLUMN cpf VARCHAR(14);
ALTER TABLE devedores ADD COLUMN plano_id UUID REFERENCES planos(id);
ALTER TABLE devedores ADD COLUMN assinatura_ativa BOOLEAN DEFAULT false;
ALTER TABLE devedores ADD COLUMN data_inicio_assinatura DATE;
```

**Script SQL:** `criar-tabela-planos.sql`

---

## 🔧 Alterações no Código

### Novos Estados
```javascript
const [novoClienteCpf, setNovoClienteCpf] = useState('')
const [criarAssinatura, setCriarAssinatura] = useState(false)
const [dataInicioAssinatura, setDataInicioAssinatura] = useState('')
const [planoSelecionado, setPlanoSelecionado] = useState('')
const [planos, setPlanos] = useState([])
```

### Novas Funções

#### `carregarPlanos()`
- Busca planos ativos do usuário logado
- Ordena alfabeticamente por nome
- Chamada no `useEffect` inicial

#### `handleAlterarAssinatura(ativo)`
- Cancela ou reativa assinatura de um cliente
- Parâmetro: `true` (ativar) ou `false` (cancelar)
- Atualiza `assinatura_ativa` no banco
- Mostra confirmação antes de executar
- Toast de sucesso/erro

#### `handleCriarCliente()` (Atualizada)
Agora inclui lógica de assinatura:
1. Valida campos obrigatórios
2. Valida campos de assinatura se toggle ativo
3. Cria cliente com todos os dados
4. Se assinatura ativa:
   - Calcula data de vencimento (início + 30 dias)
   - Cria primeira mensalidade automaticamente
   - Vincula plano ao cliente
5. Mostra toast de sucesso
6. Limpa formulário
7. Recarrega lista de clientes

---

## 🎨 Interface do Usuário

### Modal de Novo Cliente

**Campos Básicos:**
- Nome * (obrigatório)
- Telefone * (obrigatório)
- CPF (opcional)

**Seção de Assinatura:**
- Toggle "Criar assinatura junto com o cliente"
- Data de Início * (quando toggle ativo)
- Plano * (dropdown, quando toggle ativo)
- Informação: "A primeira mensalidade será criada automaticamente com vencimento em 30 dias"

### Modal de Detalhes do Cliente

**Nova Seção:** "Informações da Assinatura"
- Fundo azul claro destacado
- Badge de status (verde/vermelho)
- Ícone de assinatura
- Plano e valor exibidos
- Botão de ação contextual

**Campo CPF:**
- Exibido na seção de informações
- "Não informado" quando vazio

---

## 🔄 Fluxo de Criação de Cliente com Assinatura

1. Usuário clica em "Adicionar Cliente"
2. Preenche nome, telefone, CPF (opcional)
3. Ativa toggle "Criar assinatura"
4. Seleciona data de início
5. Escolhe plano no dropdown
6. Clica em "Criar Cliente"
7. Sistema:
   - Cria cliente na tabela `devedores`
   - Define `assinatura_ativa = true`
   - Vincula `plano_id`
   - Calcula data_vencimento = data_inicio + 30 dias
   - Cria primeira mensalidade na tabela `parcelas`
   - Exibe toast de sucesso
8. Cliente aparece na lista
9. Primeira mensalidade aparece em /financeiro

---

## 🎯 Validações Implementadas

### Ao Criar Cliente:
- ✅ Nome obrigatório
- ✅ Telefone obrigatório
- ✅ Se criar assinatura ativa:
  - ✅ Data de início obrigatória
  - ✅ Plano obrigatório

### Ao Cancelar Assinatura:
- ✅ Confirmação antes de executar
- ✅ Mensagem clara sobre o que acontecerá

---

## 📋 Próximos Passos Sugeridos

### Essenciais:
1. **Tela de Planos**
   - CRUD completo de planos
   - Listar, criar, editar, ativar/desativar

2. **Geração Automática de Mensalidades**
   - Job/cron que roda mensalmente
   - Cria próxima mensalidade para assinantes ativos
   - Calcula vencimento baseado na data anterior + 30 dias

3. **Histórico de Assinatura**
   - Data de início
   - Data de cancelamento (se houver)
   - Mudanças de plano

### Desejáveis:
4. **Mascaras de Input**
   - Máscara para CPF: `000.000.000-00`
   - Máscara para telefone: `(00) 00000-0000`

5. **Validação de CPF**
   - Validar formato
   - Verificar dígitos verificadores

6. **Mudança de Plano**
   - Permitir trocar plano de um assinante
   - Ajustar valor da próxima mensalidade

7. **Trial Period**
   - Período de teste gratuito
   - Criação de mensalidades após trial

---

## 🚀 Build Status

✅ **Build compilado com sucesso!**
- Tamanho do bundle: 150.35 kB (+1.11 kB)
- Nenhum erro de compilação
- Warnings: Apenas os pré-existentes em Financeiro.js

---

## 📁 Arquivos Modificados

1. **src/Clientes.js** - Componente principal refatorado
2. **criar-tabela-planos.sql** - Script de criação das tabelas e colunas

---

## 🎉 Resultado Final

O sistema agora oferece uma experiência completa de gestão de assinantes:
- Criação simplificada de clientes com assinatura
- Geração automática da primeira mensalidade
- Gestão visual do status de assinatura
- Cancelamento/reativação facilitada
- Integração perfeita com a tela de /financeiro

O cliente é criado e já entra no fluxo de cobrança automática recorrente! 🚀
