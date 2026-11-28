# Aba Recebimentos (antiga "Integrações") — proposta aprovada em 27/11/2026

## Problema

- A forma de o aluno pagar é escolhida em **dois lugares**:
  - em Configurações › Integrações, o modo Asaas ou PIX manual (`usuarios.modo_integracao`);
  - na tela do WhatsApp, junto dos modelos de mensagem, a escolha "Pix ou link do Asaas" (`config.<user>_metodo_pagamento_whatsapp`).
- A chave Pix também pode ser editada nas duas telas.
- A aba mistura escolha de modo, conexão do Asaas, formas aceitas no portal, um passo a passo longo do Asaas, a chave Pix e multa e juros.

## Dados (48 pagantes, leitura em 27/11/2026)

- 28 nunca mexeram na escolha do WhatsApp e ficam no padrão Pix. Estão corretos.
- 13 têm as duas escolhas iguais.
- 6 estão em combinações sem sentido:
  - 4 têm Asaas marcado sem chave do Asaas;
  - 1 tem Asaas, mas as mensagens mandam a chave Pix;
  - 1 tem Asaas e nenhuma chave Pix, com o WhatsApp no padrão Pix.
- 1 está em PIX manual sem chave Pix.

Esses 7 casos precisam ser revistos antes da etapa 2.

## Decisões do dono

1. A aba passa a se chamar **Recebimentos**.
2. A tela tem três blocos:
   - **Como seu aluno paga:** Asaas ou Pix manual.
   - **O que precisa para funcionar:** só o que vale para a opção escolhida. O passo a passo de criar conta no Asaas fica recolhido e só aparece antes de conectar.
   - **Regras de atraso:** multa e juros. Não ganham menu próprio.
3. A tela tem um resumo no topo, por exemplo: "Recebendo por Pix manual · Multa 2% e juros 1% ao mês".
4. A tela do WhatsApp perde o campo de chave Pix e a escolha de pagamento. No lugar entra uma linha só de leitura:
   - **Pix manual:** "Suas mensagens mandam: Pix (chave ••••1234)" e, logo abaixo, a menção ao Asaas: "Quer que o aluno pague por link, com Pix automático, cartão e boleto, e a baixa aconteça sozinha? Conheça o Asaas". O botão leva para Recebimentos.
   - **Asaas:** "Suas mensagens mandam: link de pagamento do Asaas (Pix, cartão e boleto)".
   - **Sem chave nenhuma:** um alerta "Suas cobranças estão saindo sem forma de pagamento. Cadastrar agora".
   - Nos três casos há um link "Alterar em Recebimentos".

## Situação em 27/11/2026

- **Etapa 1:** feita, falta commitar.
- **Etapa 2:**
  - código feito (`services/metodoPagamento.js`), falta commitar;
  - `sql-recebimentos-alinhar-modo.sql` rodado pelo dono;
  - conferido depois: nenhuma conta com Asaas sem chave, nenhuma em Asaas mandando Pix, nenhuma em manual mandando link;
  - 6 contas ficaram no modo Asaas.
- **Antes do SQL:** as mensagens dos últimos 60 dias confirmaram o modo de cada conta. As de Asaas mandavam link; as que foram para manual mandavam Pix.

## Etapas

1. **Tela Recebimentos.** Mexe só na aparência e na organização, sem mudar o que é gravado. Usa os componentes do DS: Card, Radio/Card de escolha, Input, Switch, Button, Alert/Banner (ainda não existe; criar o P1-4 aqui).
2. **Unificação com o WhatsApp.**
   - A mensagem de cobrança passa a ler só `modo_integracao` mais a chave correspondente.
   - Entra a linha só de leitura na tela do WhatsApp.
   - Entra uma migração dos 7 casos acima, com a regra de seguir Integrações quando a chave existir. A decisão é do dono.
   - Passa pelo revisor-codigo, porque mexe em cobrança e WhatsApp.
