# Pedido para o dev-funcionalidades — histórico diário de números (daily)

**Para colar no agente:** "Leia docs/pedido-dev-historico-daily.md e me traga o plano."

## Por quê
A daily (agente `daily`) precisa responder todo dia se a empresa está crescendo. Hoje ela calcula tudo na hora e guarda uma linha em `Documents\Mensalli\Daily\historico.csv`. Isso funciona, mas depende do computador e do agente rodar. Queremos o histórico dentro do banco, gravado sozinho todo dia, e uma consulta única que a daily lê.

## O que criar
1. **Tabela `admin_kpis_diarios`** (uma linha por dia, BRT), com:
   pagantes, vencidos_sem_pagar, faturamento_mensal, novos_pagantes, cancelamentos, recebido_dia (Mercado Pago aprovado),
   contas_criadas, em_teste, grupo_a, grupo_b, grupo_c, grupo_d,
   leads, leads_anuncio, contas_de_anuncio, pagantes_de_anuncio,
   gasto_ads, seguidores, novos_seguidores, alcance_ig, reels, stories,
   pagantes_whatsapp_fora, envios_total, envios_erro.
2. **Função `admin_kpis_calcular(p_data date)`** que calcula e faz upsert da linha do dia (idempotente).
3. **Cron** às 07h30 BRT (depois do `meta-ads-sync` das 07h), calculando o dia anterior. Backfill dos últimos 60 dias onde der para reconstruir (`virou_pagante_em`, `cancelado_em`, `meta_ads_gasto`, `organico_conta_diaria`).
4. **Permissão de leitura** para o MCP usado pelos agentes: hoje `vw_admin_contas` e `admin_whatsapp_saude()` dão "permissão negada" na daily. Liberar leitura dessas duas e da tabela nova, sem abrir para clientes comuns.

## Regras de negócio
- Pagante ativo: plano pago e vencimento não passou. Usar `virou_pagante_em` / `cancelado_em` (ver `sql-ciclo-vida-conta.sql`), nunca `trial_ativo` nem `status_conta` (legados).
- Faturamento mensal: Starter 49,90 · Pro 99,90 · Premium 149,90 + loja ativa 69,00 (confirmar se há valor real gravado por conta).
- WhatsApp: `mensallizap` / `admin_whatsapp_saude()`; nunca `whatsapp_connections`.
- Somente leitura das fontes; RLS: só admin lê, só service_role escreve.

## Depois de pronto
Avisar para eu trocar a seção "Histórico" do agente `daily` para ler `admin_kpis_diarios` em vez do CSV.
