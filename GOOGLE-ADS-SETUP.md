# 🔍 Google Ads Setup - Guia Prático

## ✅ Pronto

- ✅ Landing pages criadas (/pilates, /luta, /natacao, /multi)
- ✅ Tracking de gclid automático
- ✅ Dashboard /admin/google-metrics
- ✅ Banco de dados configurado (google_lead_source)

---

## 🚀 Próximos Passos

### 1. Criar Campanhas no Google Ads

#### Campanha 1: Pilates
```
Nome: Pilates - Estúdios (Search)
Tipo: Search Campaign
Keywords:
  - sistema para estúdio de pilates
  - software academia pilates
  - gerenciar alunos pilates
  - cobrança automática pilates
  
Landing Page: mensalli.com.br/pilates
Bid: $8-12 por lead (CPA)
Budget: $200-300/mês inicial
```

#### Campanha 2: Academia de Luta
```
Nome: Luta - CTs e Academias (Search)
Keywords:
  - sistema para academia de luta
  - software CT jiu-jitsu
  - gerenciar academia boxe
  - cobrança automática academia
  
Landing Page: mensalli.com.br/luta
Bid: $8-12 por lead
Budget: $200-300/mês
```

#### Campanha 3: Natação
```
Nome: Natação - Escolas (Search)
Keywords:
  - sistema escola de natação
  - software aula de natação
  - gerenciar turmas natação
  - cobrança automática alunos
  
Landing Page: mensalli.com.br/natacao
Bid: $8-12 por lead
Budget: $200-300/mês
```

#### Campanha 4: Genérica (Catch-all)
```
Nome: Mensalidades - Genérica (Search)
Keywords:
  - sistema para cobrar alunos
  - software de mensalidades
  - cobrança via WhatsApp
  
Landing Page: mensalli.com.br/multi
Bid: $8-12 por lead
Budget: $200-300/mês
```

---

### 2. Conectar Google Analytics

Link Google Ads → Google Analytics (opcional, mas recomendado):
```
Google Ads → Ferramentas → Linked Accounts → Google Analytics
Isso mostra conversões direto no GA
```

---

### 3. Rastrear Conversões no Dashboard

Após criar campanhas:
1. Acesse `/admin/google-metrics`
2. Você verá: Total de Contas, por Nicho, CAC estimado
3. Cada landing page mostra taxa de conversão

---

## 📊 Como Funciona o Rastreamento

1. **Google Ads manda o usuário para /pilates?gclid=ABC123**
2. **LandingPilates.js captura o gclid**
3. **Ao criar conta, gclid é salvo em usuarios.metadata**
4. **Dashboard agrupa por google_lead_source (nicho)**
5. **CAC é calculado: (gasto Google) ÷ (contas daquele nicho)**

---

## 🎯 Métricas Importantes

- **Total de Contas**: Soma de todos os signups
- **Por Nicho**: Quantas contas vieram de cada landing
- **CAC por Nicho**: Custo médio por cliente (quanto gastou ÷ quantas contas)
- **Taxa de Conversão**: % de cliques que viraram conta

---

## 💡 Dicas

1. **Comece pequeno**: $200/mês por campanha (total $800)
2. **Ajuste keywords**: O Google Ads sugerirá palavras-chave relevantes
3. **Monitorar**: Checá dashboard 2x por semana no início
4. **Escalas o que funciona**: Identifique qual nicho tem melhor ROI
5. **A/B Testing**: Teste headlines diferentes nas landing pages

---

## Troubleshooting

### "Contas aparecendo mas sem gclid"
- Alguns clientes entram direto na /pilates sem Google (marketing)
- Pode ser tráfego orgânico, direto, ou de outras fontes
- Normal! O dashboard agrupa tudo.

### "Dashboard zerado"
- Teste criando uma conta e vendo se aparece
- Clique "Atualizar" ou aguarde 60s (auto-update)

### "Não consigo bater o CPA target"
- Aumente o bid (preço máximo por clique)
- Melhore a landing page (mais benefícios, less friction)
- Afine as keywords (mais específicas = menos concorrência)

---

## Próxima: Outbound ou Referral?

Google Ads está **100% pronto para usar**!

Qual é a próxima?
- 📲 **Outbound**: Prospecção manual
- 🎁 **Referral**: Programa de indicação
