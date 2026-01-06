# 🔍 Nova Funcionalidade: Busca de Clientes

## ✅ O que foi adicionado:

Campo de busca em tempo real na tela de Clientes para filtrar por **nome** ou **telefone**.

---

## 🎯 Funcionalidades:

### 1. **Campo de busca com ícone**
- Ícone de lupa à esquerda
- Placeholder: "Buscar por nome ou telefone..."
- Botão X para limpar (aparece quando há texto)

### 2. **Busca em tempo real**
- Filtra enquanto você digita
- Busca por nome OU telefone
- Não diferencia maiúsculas/minúsculas
- Busca parcial (encontra "João" digitando "joa")

### 3. **Contador dinâmico**
- Mostra: "X de Y cliente(s)"
- X = clientes filtrados
- Y = total de clientes

### 4. **Mensagem quando não encontra**
- Ícone de busca vazia
- Mensagem: "Nenhum cliente encontrado"
- Sugestão: "Tente buscar por outro nome ou telefone"

---

## 🎨 Visual:

```
┌─────────────────────────────────────────────────────────┐
│ Clientes                        Total em aberto         │
│ 3 de 10 cliente(s)             R$ 760,00                │
│                                                          │
│ 🔍 [Buscar por nome ou telefone...]              ✕      │
└─────────────────────────────────────────────────────────┘
```

---

## 💡 Como usar:

### Buscar cliente:
1. Vá para a tela de **Clientes**
2. Digite no campo de busca:
   - Nome completo ou parcial
   - Telefone completo ou parcial
3. A lista filtra automaticamente

### Limpar busca:
- Clique no **X** ao lado do campo
- Ou apague todo o texto
- A lista volta a mostrar todos os clientes

---

## 🔧 Exemplos de busca:

| Digitar | Encontra |
|---------|----------|
| "João" | João Silva, João Pedro, Maria João |
| "silva" | João Silva, Pedro Silva |
| "62" | Todos com DDD 62 |
| "9824" | Telefones com essa sequência |
| "caio" | Caio Lucena |

---

## 📊 Lógica de filtro:

```javascript
const filtrados = clientes.filter(cliente =>
  cliente.nome.toLowerCase().includes(termo) ||
  cliente.telefone.toLowerCase().includes(termo)
)
```

**Características:**
- Busca parcial (substring)
- Case insensitive (não diferencia maiúscula/minúscula)
- Busca em nome E telefone simultaneamente
- Atualização em tempo real (useEffect)

---

## 🎨 Estados visuais:

### 1. Campo vazio (sem busca):
- Borda cinza (#ddd)
- Placeholder visível
- Sem botão X

### 2. Campo com texto:
- Borda cinza (#ddd)
- Texto digitado
- Botão X visível

### 3. Campo focado:
- Borda preta (#344848)
- Cursor piscando
- Outline removido

### 4. Nenhum resultado:
- Ícone de busca vazia
- Mensagem de "não encontrado"
- Sugestão para tentar outra busca

---

## ✅ Benefícios:

1. **Rápido**: Encontre clientes instantaneamente
2. **Flexível**: Busca por nome ou telefone
3. **Intuitivo**: Filtra enquanto digita
4. **Visual**: Feedback claro de quantos foram encontrados
5. **Limpo**: Botão X para limpar facilmente

---

## 🎯 Casos de uso:

### Cenário 1: Muitos clientes
Se você tem 100+ clientes, ao invés de rolar a lista, basta digitar parte do nome.

### Cenário 2: Lembrar apenas do telefone
Você lembra que o cliente tem telefone com "9824", digita e encontra.

### Cenário 3: Nomes parecidos
Tem 5 "João" diferentes? Digite "João Silva" para filtrar específico.

---

## 🚀 Próximas melhorias possíveis:

1. **Busca avançada**: Filtrar por status (devendo/pago)
2. **Busca por valor**: Filtrar por faixa de valor devido
3. **Ordenação**: Ordenar resultados por nome, valor, etc.
4. **Histórico**: Salvar últimas buscas
5. **Atalho**: Ctrl+F para focar no campo de busca

---

## 🎉 Pronto!

Agora você pode encontrar qualquer cliente rapidamente, seja por nome ou telefone!

**Teste:**
1. Vá para **Clientes**
2. Digite no campo de busca
3. Veja a lista filtrar automaticamente
4. Clique no **X** para limpar
5. Experimente buscar por telefone também! 🔍
