# Atualizar Edge Functions para suportar Alunos Fixos

Depois de rodar o SQL `sql-criar-aulas-fixos.sql` no Supabase, atualize as edge functions:

---

## 1. agendamento-dados

Na parte que monta o retorno, adicionar a contagem de fixos por aula:

```js
// ADICIONAR: Buscar fixos por aula
const { data: fixosData } = await supabaseAdmin
  .from('aulas_fixos')
  .select('aula_id')
  .eq('user_id', usuario.id)

// Montar contagem de fixos por aula
const fixos_contagem = {}
if (fixosData) {
  fixosData.forEach(f => {
    fixos_contagem[f.aula_id] = (fixos_contagem[f.aula_id] || 0) + 1
  })
}

// No return, adicionar fixos_contagem:
return new Response(JSON.stringify({
  empresa: { ... },
  aulas: aulasAtivas,
  agendamentos_contagem,
  fixos_contagem  // <-- NOVO
}), { ... })
```

---

## 2. agendamento-agendar

Na verificacao de capacidade, descontar fixos:

```js
// ANTES (verificacao atual):
// const agendados = ... count de agendamentos confirmados
// if (agendados >= aula.capacidade) return erro

// DEPOIS:
// Contar fixos da aula
const { count: fixosCount } = await supabaseAdmin
  .from('aulas_fixos')
  .select('*', { count: 'exact', head: true })
  .eq('aula_id', aula_id)

const { count: agendadosCount } = await supabaseAdmin
  .from('agendamentos')
  .select('*', { count: 'exact', head: true })
  .eq('aula_id', aula_id)
  .eq('data', data)
  .eq('status', 'confirmado')

const totalOcupado = (fixosCount || 0) + (agendadosCount || 0)
if (totalOcupado >= aula.capacidade) {
  return new Response(JSON.stringify({ error: 'Aula lotada' }), { status: 400, ... })
}
```

---

## Resumo das mudancas

| Edge Function | Mudanca |
|--------------|---------|
| agendamento-dados | Retornar `fixos_contagem` no JSON |
| agendamento-agendar | Descontar fixos na verificacao de capacidade |
| agendamento-identificar | Sem mudanca |
| agendamento-cadastrar | Sem mudanca |
| agendamento-cancelar | Sem mudanca |
