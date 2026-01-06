# ✅ Atualização: Toggle de Pagamento no Modal de Clientes

## 🎯 O que foi adicionado:

### Nova funcionalidade no popup de detalhes do cliente:

Agora você pode **marcar parcelas como pagas diretamente do popup do cliente**, sem precisar voltar para a tela de Financeiro!

---

## 📋 Funcionalidades adicionadas:

### 1. **Coluna "Pagou" na tabela de parcelas**
- Toggle switch igual ao da tela Financeiro
- Verde quando pago, cinza quando pendente
- Animação suave ao alternar

### 2. **Função `handleAlterarStatusParcela`**
- Atualiza status da parcela no banco
- Pede confirmação antes de alterar
- Atualiza automaticamente:
  - Lista de parcelas do modal
  - Resumo financeiro do cliente
  - Cards de totais
  - Lista geral de clientes

### 3. **Atualização em tempo real**
- Ao marcar como pago, os valores são recalculados instantaneamente
- Cards de resumo (Total de Parcelas, Pagas, Valor em Aberto) são atualizados
- Lista de clientes na tela principal também é atualizada

---

## 🎨 Layout:

A tabela de parcelas no modal agora tem **4 colunas**:

| Vencimento | Valor | Status | Pagou |
|------------|-------|--------|-------|
| 17/01/2026 | R$ 160,00 | Em aberto | 🔘 Toggle |
| 18/12/2025 | R$ 150,00 | Pago | ✅ Toggle |
| 18/12/2025 | R$ 150,00 | Em atraso | 🔘 Toggle |

---

## 🚀 Como usar:

### Marcar parcela como paga:
1. Clique em um cliente na lista
2. O popup será aberto com todas as parcelas
3. Role até a tabela de parcelas
4. Clique no **toggle "Pagou"** da parcela desejada
5. Confirme a ação
6. Os valores serão atualizados automaticamente!

### Desmarcar parcela (voltar para pendente):
1. No popup do cliente
2. Clique no toggle verde (pago) para desativar
3. Confirme a ação
4. A parcela volta para "pendente"

---

## 🔧 Código adicionado:

### Função de alteração de status:
```javascript
const handleAlterarStatusParcela = async (parcela, novoPago) => {
  const confirmar = window.confirm(
    novoPago
      ? `Confirmar pagamento de R$ ${parseFloat(parcela.valor).toFixed(2)}?`
      : 'Desfazer o pagamento desta parcela?'
  )

  if (!confirmar) return

  try {
    const { error } = await supabase
      .from('parcelas')
      .update({ status: novoPago ? 'pago' : 'pendente' })
      .eq('id', parcela.id)

    if (error) throw error

    // Atualizar parcelas do cliente no modal
    await carregarParcelasCliente(clienteSelecionado.id)

    // Recarregar lista de clientes para atualizar valores
    carregarClientes()
  } catch (error) {
    alert('Erro ao atualizar: ' + error.message)
  }
}
```

### Toggle na tabela:
```javascript
<td style={{ padding: '12px', textAlign: 'center' }}>
  <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '22px' }}>
    <input
      type="checkbox"
      checked={parcela.status === 'pago'}
      onChange={(e) => handleAlterarStatusParcela(parcela, e.target.checked)}
      style={{ opacity: 0, width: 0, height: 0 }}
    />
    <span style={{
      position: 'absolute',
      cursor: 'pointer',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: parcela.status === 'pago' ? '#4CAF50' : '#ccc',
      transition: '0.3s',
      borderRadius: '22px'
    }}>
      <span style={{
        position: 'absolute',
        height: '16px',
        width: '16px',
        left: parcela.status === 'pago' ? '25px' : '3px',
        bottom: '3px',
        backgroundColor: 'white',
        transition: '0.3s',
        borderRadius: '50%'
      }} />
    </span>
  </label>
</td>
```

---

## ✅ Benefícios:

1. **Mais rápido**: Não precisa sair da tela de clientes para marcar pagamentos
2. **Mais intuitivo**: Visualiza o histórico do cliente enquanto marca parcelas como pagas
3. **Atualização automática**: Todos os valores são recalculados em tempo real
4. **Consistente**: Mesmo comportamento da tela Financeiro

---

## 🎉 Pronto!

Agora você pode gerenciar pagamentos diretamente da tela de Clientes, tornando o fluxo de trabalho mais eficiente!

**Teste:**
1. Vá para a tela de Clientes
2. Clique em um cliente
3. Role até a tabela de parcelas
4. Clique no toggle "Pagou"
5. Veja os valores atualizarem automaticamente! ✨
