-- ============================================================
-- Novidade "Link na bio" (aparece no pop-up "O que mudou no Mensalli")
--
-- O pop-up abre sozinho na PRIMEIRA entrada de cada pessoa depois da publicacao
-- (publicado_em = agora) e depois fica so na barra da Home. Destaque = vai como
-- primeiro slide.
--
-- RODE SO DEPOIS do deploy da edge landing-dados (e de a main estar no ar):
-- quem clicar no botao ja tem que encontrar o editor funcionando.
--
-- Publico: 'pagantes' (Starter, Pro e Premium). Quem esta no Starter ve o aviso e,
-- ao clicar, cai na tela de upgrade do editor. Para ficar so em quem tem acesso nao
-- existe filtro por plano hoje (o publico aceita: todos, pagantes, trial).
--
-- Tambem da pra criar pela tela /admin > Novidades com estes mesmos textos.
-- Tirar do ar: update novidades set ativo = false where titulo = 'Seu link na bio chegou';
-- ============================================================

insert into novidades (tag, titulo, resumo, descricao, icone, cta_label, cta_rota, destaque, publico, ativo)
select 'Novidade',
       'Seu link na bio chegou',
       'Uma página para a bio do Instagram, com WhatsApp, redes, fotos e vídeos, no ar em poucos minutos.',
       'O site virou link na bio: uma página curta, feita para o celular e para o Instagram. Escolha as cores e a fonte, coloque fotos e vídeos e ligue os botões de WhatsApp e redes sociais. Disponível a partir do plano Pro; o botão de agendar aula é do Premium. Quem já tinha site continua no mesmo endereço, agora como link na bio, com tudo que já tinha preenchido.',
       'mdi:link-variant',
       'Montar meu link na bio',
       '/app/marketing?aba=bio',
       true,
       'pagantes',
       true
where not exists (select 1 from novidades where titulo = 'Seu link na bio chegou');

select titulo, tag, publico, destaque, ativo, publicado_em, cta_rota from novidades where titulo = 'Seu link na bio chegou';
