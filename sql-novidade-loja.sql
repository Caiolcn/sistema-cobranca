-- ============================================================
-- Novidade "Mensalli Vendas" (pop-up "O que mudou no Mensalli" + barra da Home)
--
-- RODE SO DEPOIS de: sql-criar-loja.sql, deploy das edges loja-* e asaas-webhook,
-- e front no ar. Quem clicar no botao ja tem que encontrar a aba Loja funcionando.
--
-- Publico: 'pagantes'. Starter ve o aviso e cai na tela de upgrade; Pro/Premium
-- sem o add-on veem o card "Ativar Mensalli Vendas" dentro da aba.
-- Tirar do ar: update novidades set ativo = false where titulo = 'Sua loja chegou: venda planos e produtos 24h';
-- ============================================================

insert into novidades (tag, titulo, resumo, descricao, icone, cta_label, cta_rota, destaque, publico, ativo)
select 'Novidade',
       'Sua loja chegou: venda planos e produtos 24h',
       'Uma página onde o aluno escolhe o plano, se cadastra, paga por Pix ou cartão e já escolhe a turma. Sem ida e volta no WhatsApp.',
       'O Mensalli Vendas é a sua loja online: matrícula, pacotes, uniformes e inscrições em eventos num link só, para colocar na bio e mandar nos grupos. O aluno paga pelo seu Asaas, o dinheiro cai no seu Financeiro, o cadastro entra em Alunos já ativo e a turma aparece na Agenda. Você recebe a confirmação no WhatsApp. Disponível para Pro e Premium como add-on de R$ 69,90/mês, sem comissão sobre as vendas. As 10 primeiras academias ganham a implantação feita pela nossa equipe.',
       'mdi:storefront-outline',
       'Conhecer o Mensalli Vendas',
       '/app/marketing?aba=loja',
       true,
       'pagantes',
       true
where not exists (select 1 from novidades where titulo = 'Sua loja chegou: venda planos e produtos 24h');

select titulo, tag, publico, destaque, ativo, publicado_em, cta_rota from novidades where titulo = 'Sua loja chegou: venda planos e produtos 24h';
