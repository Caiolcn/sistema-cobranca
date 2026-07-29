-- Destino configuravel do botao da secao "Bora comecar?" (CTA final) da landing.
-- Antes o botao era sempre wa.me, com icone do WhatsApp fixo e texto herdado do hero.
-- Default 'whatsapp' preserva o comportamento atual de todas as contas.
-- Aplicado em producao em 29/07/2026.

alter table usuarios
  add column if not exists landing_cta_final_destino text not null default 'whatsapp',
  add column if not exists landing_cta_final_url text,
  add column if not exists landing_cta_final_texto text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'usuarios_landing_cta_final_destino_check'
  ) then
    alter table usuarios
      add constraint usuarios_landing_cta_final_destino_check
      check (landing_cta_final_destino in ('whatsapp', 'agendamento', 'custom'));
  end if;
end $$;

comment on column usuarios.landing_cta_final_destino is 'Para onde o botao do CTA final aponta: whatsapp | agendamento | custom';
comment on column usuarios.landing_cta_final_url is 'URL livre usada quando landing_cta_final_destino = custom';
comment on column usuarios.landing_cta_final_texto is 'Rotulo proprio do botao do CTA final; se nulo, cai no landing_cta_texto (hero)';
