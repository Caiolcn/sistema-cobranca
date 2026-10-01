# 🎯 Meta Ads Attribution - Checklist Final

## Status: 95% PRONTO ✅

### Já Feito
- ✅ Segredos configurados (META_CAPI_ACCESS_TOKEN, META_PIXEL_ID)
- ✅ Edge function `/meta-capi` pronta
- ✅ Captura fbp/fbc no navegador (Signup.js)
- ✅ Envio de eventos (CompleteSignup do front + back)
- ✅ Dashboard `/admin/meta-attribution` montado

---

## Próximo Passo: Executar SQL (15 min)

### 1️⃣ Abrir Supabase SQL Editor
```
Dashboard Supabase → SQL Editor → New Query
```

### 2️⃣ Copiar e Executar o SQL
Abra o arquivo: `meta-capi-setup.sql`

Cole tudo e execute. Isso cria:
- Tabela `meta_atribuicao` (fbp/fbc do navegador)
- Tabela `meta_capi_eventos` (auditoria)
- Tabela `meta_capi_queue` (fila de retry)
- Triggers automáticos (CompleteSignup, AtivouWhatsApp)
- Função `registrar_primeira_cobranca_meta()`

### 3️⃣ Testar Dashboard
Após executar SQL:
```
Ir em: /admin/meta-attribution
```

Você deve ver:
- Cards: Leads, WhatsApp, Pagantes, CAC
- Funil de conversão
- Tabela de eventos recentes
- Status: ✅ OK ou ⚠️ Falha

---

## Próximos: Integrar com Cron (Primeira Cobrança)

No cron de cobranças (9h), adicionar ao final:

```sql
-- Registrar primeira cobrança no Meta (para atribuição)
SELECT registrar_primeira_cobranca_meta(c.id, m.valor)
FROM contas c
INNER JOIN (
  SELECT account_id, SUM(valor) as valor 
  FROM mensalidades 
  WHERE status = 'pago' 
    AND data_pagamento::date = CURRENT_DATE
  GROUP BY account_id
) m ON m.account_id = c.id;
```

---

## Checklist Resumido

- [ ] Executar `meta-capi-setup.sql` no Supabase
- [ ] Testar dashboard `/admin/meta-attribution`
- [ ] Verificar primeira conversão (Lead → WhatsApp → Pagante)
- [ ] Integrar trigger de primeira cobrança no cron 9h
- [ ] Montar worker/cron que dispara eventos pendentes (opcional: automação n8n)

---

## Dashboard: O que você vai ver

### Cards Principais
- **Leads (CompleteSignup):** Total de cadastros vindos de Meta Ads
- **WhatsApp Conectado:** Quantos ativaram WhatsApp (% de conversão)
- **Pagantes (Purchase):** Quantos fizeram primeira cobrança (% final)
- **CAC (R$):** Custo médio por cliente ativado (Gasto Meta ÷ Pagantes)

### Funil Visual
```
Leads (100%)
    ↓
WhatsApp (X%)
    ↓
Pagantes (Y%)
```

### Tabela de Eventos
Mostra cada evento enviado pro Meta CAPI com status ✅ ou ⚠️

---

## Troubleshooting

### "Nenhum evento registrado"
- Você ainda não criou nenhuma conta vindo de Meta Ads
- OU: As contas foram criadas antes do SQL ser executado
- Faça um teste: crie uma conta nova e veja aparecer

### Dashboard branco/vazio
- Supabase pode estar levando tempo
- Clique "Atualizar" ou aguarde 60s (auto-atualiza)

### "Eventos com status ⚠️ Falha"
- Check: META_CAPI_ACCESS_TOKEN está válido?
- Check: Pixel ID (1387142490186737) está certo?
- Ver logs da edge function: Supabase → Functions → meta-capi

---

## Próximas Automações (Fase 2)

1. **Worker que dispara eventos pendentes**
   - Cron a cada 5min lê `meta_capi_eventos` onde `resposta IS NULL`
   - Chama edge function `/meta-capi` para cada um
   - Retries automáticos com backoff

2. **Integração com n8n**
   - Webhook de primeira cobrança → dispara evento Purchase no Meta
   - Automação que vira mais dados = melhores otimizações de campanha

3. **Dashboard de ROI**
   - CAC por campanha (utm_campaign)
   - ROAS por plano (Purchase value ÷ Meta spend)
   - Coorte de cliente (quando capturou → quando virou pagante)

---

## Próximas Abas (Roadmap)

- ✅ Meta Ads (AGORA)
- ⏳ Google Ads
- ⏳ Outbound
- ⏳ Referral Program
