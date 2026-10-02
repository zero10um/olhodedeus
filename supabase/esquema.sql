-- Banco da Agenda pedagógica (olhodedeus)
-- Como usar: no Supabase, abra "SQL Editor", cole tudo isto e clique em "Run".
-- Pode rodar mais de uma vez sem problema.

-- Uma tabela só guarda tudo: perfis, regras, processos e preferências.
create table if not exists public.docs (
  col        text        not null,               -- perfis | regras | leituras | processos | prefs
  id         text        not null,
  dono       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  dados      jsonb       not null,
  atualizado timestamptz not null default now(),
  primary key (col, id)
);

-- Guarda a hora da última mudança
create or replace function public.docs_atualizado() returns trigger
language plpgsql set search_path = '' as $$
begin new.atualizado := now(); return new; end $$;
drop trigger if exists docs_atualizado on public.docs;
create trigger docs_atualizado before update on public.docs
  for each row execute function public.docs_atualizado();

-- Segurança (RLS):
--  * só quem entrou com usuário e senha enxerga alguma coisa;
--  * todo mundo da equipe VÊ os processos e perfis de todos;
--  * cada pessoa só CRIA, MUDA ou APAGA o que é dela;
--  * preferências pessoais só a própria pessoa vê.
alter table public.docs enable row level security;
alter table public.docs replica identity full;

revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;

drop policy if exists "equipe le" on public.docs;
drop policy if exists "cada um cria o seu" on public.docs;
drop policy if exists "cada um muda o seu" on public.docs;
drop policy if exists "cada um apaga o seu" on public.docs;

create policy "equipe le" on public.docs for select to authenticated
  using (col <> 'prefs' or dono = (select auth.uid()));

create policy "cada um cria o seu" on public.docs for insert to authenticated
  with check (
    dono = (select auth.uid())
    and (col not in ('perfis', 'regras', 'leituras', 'prefs') or id = (select auth.uid())::text)
    and (col <> 'processos' or dados ->> 'dono' = (select auth.uid())::text)
  );

create policy "cada um muda o seu" on public.docs for update to authenticated
  using (dono = (select auth.uid()))
  with check (
    dono = (select auth.uid())
    and (col <> 'processos' or dados ->> 'dono' = (select auth.uid())::text)
  );

create policy "cada um apaga o seu" on public.docs for delete to authenticated
  using (dono = (select auth.uid()));

-- Avisos em tempo real: quando alguém salva, a tela dos colegas atualiza sozinha
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;
