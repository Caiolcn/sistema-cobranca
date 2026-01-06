# ✅ Atualização: Ordenação de Parcelas no Modal do Cliente

## 🎯 O que foi alterado:

A lista de parcelas no popup de detalhes do cliente agora é exibida em **ordem de prioridade**:

1. **🔴 Em atraso** (vencidas)
2. **🔵 Em aberto** (a vencer)
3. **🟢 Pagas**

---

## 📋 Lógica de ordenação:

### Primeira prioridade: Status
- **Atrasado (1)**: Parcelas vencidas e não pagas
- **Aberto (2)**: Parcelas dentro do prazo
- **Pago (3)**: Parcelas já quitadas

### Segunda prioridade: Data de vencimento
Dentro de cada grupo de status, as parcelas são ordenadas por **data de vencimento** (mais próximas primeiro).

---

## 🔧 Implementação:

### Função `carregarParcelasCliente` atualizada:

```javascript
const carregarParcelasCliente = async (clienteId) => {
  try {
    const { data, error } = await supabase
      .from('parcelas')
      .select('*')
      .eq('devedor_id', clienteId)
      .order('data_vencimento', { ascending: true })

    if (error) throw error

    // Calcular status e ordenar: atrasado > aberto > pago
    const parcelasComStatus = (data || []).map(parcela => {
      let status = parcela.status

      if (status === 'pendente') {
        const hoje = new Date()
        hoje.setHours(0, 0, 0, 0)
        const vencimento = new Date(parcela.data_vencimento)
        vencimento.setHours(0, 0, 0, 0)

        if (vencimento < hoje) {
          status = 'atrasado'
        } else {
          status = 'aberto'
        }
      }

      return { ...parcela, statusCalculado: status }
    })

    // Ordenar por prioridade: atrasado (1), aberto (2), pago (3)
    parcelasComStatus.sort((a, b) => {
      const prioridade = { atrasado: 1, aberto: 2, pago: 3 }
      if (prioridade[a.statusCalculado] !== prioridade[b.statusCalculado]) {
        return prioridade[a.statusCalculado] - prioridade[b.statusCalculado]
      }
      // Se mesmo status, ordenar por data de vencimento (mais próximo primeiro)
      return new Date(a.data_vencimento) - new Date(b.data_vencimento)
    })

    setParcelasCliente(parcelasComStatus)
  } catch (error) {
    console.error('Erro ao carregar parcelas:', error)
  }
}
```

---

## 📊 Exemplo de ordenação:

### Antes (ordem aleatória):
| Vencimento | Valor | Status |
|------------|-------|--------|
| 18/12/2025 | R$ 150,00 | Pago |
| 17/01/2026 | R$ 160,00 | Em aberto |
| 18/12/2025 | R$ 150,00 | Em atraso |
| 18/12/2025 | R$ 150,00 | Em atraso |
| 17/12/2025 | R$ 150,00 | Pago |

### Depois (ordem de prioridade):
| Vencimento | Valor | Status |
|------------|-------|--------|
| 18/12/2025 | R$ 150,00 | 🔴 Em atraso |
| 18/12/2025 | R$ 150,00 | 🔴 Em atraso |
| 17/01/2026 | R$ 160,00 | 🔵 Em aberto |
| 17/12/2025 | R$ 150,00 | 🟢 Pago |
| 18/12/2025 | R$ 150,00 | 🟢 Pago |

---

## ✅ Benefícios:

1. **Foco nas urgências**: Parcelas vencidas aparecem primeiro
2. **Melhor UX**: Cliente vê imediatamente o que precisa ser pago
3. **Organização lógica**: Segue a prioridade de atenção
4. **Consistente**: Mesma lógica da tela Financeiro

---

## 🎨 Visual:

As parcelas agora aparecem agrupadas visualmente por cor:
- 🔴 **Vermelho** no topo (urgente)
- 🔵 **Azul** no meio (a vencer)
- 🟢 **Verde** no final (quitado)

---

## 🚀 Como testar:

1. Vá para a tela de **Clientes**
2. Clique em um cliente que tenha **parcelas com status variados**
3. No popup, role até a **tabela de parcelas**
4. Observe a ordem:
   - Parcelas **em atraso** no topo
   - Parcelas **em aberto** no meio
   - Parcelas **pagas** no final

---

## 🎉 Pronto!

Agora a visualização de parcelas do cliente está otimizada para mostrar primeiro o que realmente importa: **as dívidas vencidas e urgentes**! 🚀

**Nota:** Essa mesma lógica de ordenação já existe na tela Financeiro, garantindo consistência em todo o sistema.
