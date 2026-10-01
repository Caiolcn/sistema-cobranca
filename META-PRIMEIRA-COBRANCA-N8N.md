# Integrar Meta Ads com Cron de Cobranças (n8n)

## O que fazer

Ao final do workflow n8n "Cobranças Automatizadas (3 em 1)" (às 9h), adicione um nó que chama a edge function `meta-primeira-cobranca` para registrar cada cobrança bem-sucedida.

---

## Passo a Passo no n8n

### 1. Abrir o Workflow
- Dashboard n8n → Workflows
- Procure "Cobranças Automatizadas (3 em 1)" ou "cobrancas-3em1"
- Edite

### 2. Adicionar nó HTTP Request
No final do workflow (após validar que a cobrança saiu com sucesso):

**Nó tipo: HTTP Request**
```
Method: POST
URL: https://seu-project-id.supabase.co/functions/v1/meta-primeira-cobranca
Authentication: Bearer Token (seu anon key do Supabase)
Body (raw JSON):
{
  "account_id": "{{ $node.NOME_DO_NO.json.account_id }}",
  "valor": "{{ $node.NOME_DO_NO.json.valor }}"
}
```

### 3. Onde Colocar
Coloque DEPOIS dos nós que validam "envio_sucesso = true".

Estrutura aproximada:
```
Preparar lista de cobranças
  ↓
Loop: para cada conta
  ├─ Enviar cobrança
  ├─ Validar envio OK?
  └─ [NOVO] Chamar meta-primeira-cobranca ← AQUI
  ↓
Fim
```

### 4. Testar
- Dispare o workflow manualmente
- Vá em `/admin/meta-attribution`
- Você deve ver novos eventos "Purchase" aparecerem

---

## Alternativa: Chamar Diretamente (sem n8n)

Se preferir, pode chamar a função SQL direto:

```sql
SELECT registrar_primeira_cobranca_meta(
  account_id::uuid,
  valor::numeric
);
```

---

## Segredos Necessários

A edge function já está configurada e não precisa de segredos adicionais (usa o service_role que já existe).

---

## Troubleshooting

### "Error 404 na edge function"
- Verifique se a função foi deployada: `supabase functions deploy meta-primeira-cobranca`

### "Não aparece evento no dashboard"
- Aguarde 60s (auto-update) ou clique Atualizar
- Verifique se o account_id está correto (deve ser UUID)
- Confirme que o valor é > 0

---

## Após Integrar

✅ Meta Ads está completo:
- Rastreia Lead (CompleteSignup)
- Rastreia WhatsApp (AtivouWhatsApp)
- Rastreia Pagante (Purchase)
- CAC calculado automaticamente
