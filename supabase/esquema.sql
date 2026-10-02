-- Banco da Agenda pedagógica (olhodedeus)
-- Como usar: no Supabase, abra "SQL Editor", cole tudo isto e clique em "Run".
-- Pode rodar mais de uma vez sem problema (a versão nova substitui a antiga).

-- Uma tabela só guarda tudo: perfis, regras, processos, preferências e o padrão da equipe.
create table if not exists public.docs (
  col        text        not null,               -- perfis | regras | leituras | processos | prefs | equipe
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

-- Administração: quem está nesta tabela é admin. Ninguém consegue se colocar aqui pelo site;
-- só por este editor SQL (veja o arquivo tornar-admin.sql).
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
drop policy if exists "ver se sou admin" on public.admins;
create policy "ver se sou admin" on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;
revoke execute on function public.sou_admin() from public, anon;
grant execute on function public.sou_admin() to authenticated;

-- Segurança (RLS):
--  * só quem entrou com usuário e senha enxerga alguma coisa;
--  * todo mundo da equipe VÊ os processos e perfis de todos;
--  * cada servidor só CRIA, MUDA ou APAGA o que é dele;
--  * o admin pode mexer em tudo (menos nas preferências pessoais de cada um)
--    e é o único que grava o padrão da equipe;
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
    (col <> 'processos' or dados ->> 'dono' = dono::text)
    and (
      ((select public.sou_admin()) and col <> 'prefs')
      or (
        dono = (select auth.uid()) and col <> 'equipe'
        and (col not in ('perfis', 'regras', 'leituras', 'prefs') or id = (select auth.uid())::text)
      )
    )
  );

create policy "cada um muda o seu" on public.docs for update to authenticated
  using (dono = (select auth.uid()) or ((select public.sou_admin()) and col <> 'prefs'))
  with check (
    (col <> 'processos' or dados ->> 'dono' = dono::text)
    and (
      ((select public.sou_admin()) and col <> 'prefs')
      or (
        dono = (select auth.uid()) and col <> 'equipe'
        and (col not in ('perfis', 'regras', 'leituras', 'prefs') or id = (select auth.uid())::text)
      )
    )
  );

create policy "cada um apaga o seu" on public.docs for delete to authenticated
  using ((dono = (select auth.uid()) and col <> 'equipe') or ((select public.sou_admin()) and col <> 'prefs'));

-- Avisos em tempo real: quando alguém salva, a tela dos colegas atualiza sozinha
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;
