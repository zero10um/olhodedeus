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

-- =====================================================================
-- Administração: contas, senha esquecida, quem mais pode ser admin e apagar contas
-- (o admin principal é o mais antigo; só ele apaga contas)
-- (tudo confere no banco se quem pediu é admin)
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

alter table public.admins add column if not exists principal boolean not null default false;

update public.admins set principal = true
where user_id = (select a.user_id from public.admins a join auth.users u on u.id = a.user_id order by u.created_at limit 1)
  and not exists (select 1 from public.admins where principal);

create or replace function public.sou_principal() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and principal)
$$;
revoke execute on function public.sou_principal() from public, anon;
grant execute on function public.sou_principal() to authenticated;

-- Lista de contas agora diz quem é o principal e quantos processos cada conta tem
drop function if exists public.contas_equipe();
create function public.contas_equipe()
returns table (id uuid, usuario text, admin boolean, principal boolean, processos int, criada_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Só a administração pode ver as contas.' using errcode = '42501'; end if;
  return query
    select u.id, replace(u.email, '@olhodedeus.app', '')::text,
           exists (select 1 from public.admins a where a.user_id = u.id),
           exists (select 1 from public.admins a where a.user_id = u.id and a.principal),
           (select count(*)::int from public.docs d where d.dono = u.id and d.col = 'processos'),
           u.created_at
    from auth.users u order by u.created_at;
end $$;
revoke execute on function public.contas_equipe() from public, anon;
grant execute on function public.contas_equipe() to authenticated;

create or replace function public.redefinir_senha(alvo uuid, nova text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Só a administração pode redefinir senhas.' using errcode = '42501'; end if;
  if alvo <> auth.uid() and exists (select 1 from public.admins where user_id = alvo and principal) then
    raise exception 'A senha do admin principal só ele mesmo troca.' using errcode = '42501';
  end if;
  if length(coalesce(nova, '')) < 8 then raise exception 'A senha precisa ter pelo menos 8 caracteres.'; end if;
  update auth.users set encrypted_password = extensions.crypt(nova, extensions.gen_salt('bf')), updated_at = now() where id = alvo;
  if not found then raise exception 'Conta não encontrada.'; end if;
end $$;

create or replace function public.definir_admin(alvo uuid, ligar boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Só a administração pode mudar quem é admin.' using errcode = '42501'; end if;
  if ligar then
    insert into public.admins (user_id) values (alvo) on conflict do nothing;
  else
    if exists (select 1 from public.admins where user_id = alvo and principal) then
      raise exception 'O admin principal não sai da administração.';
    end if;
    if (select count(*) from public.admins) <= 1 and exists (select 1 from public.admins where user_id = alvo) then
      raise exception 'Precisa ficar pelo menos uma pessoa na administração.';
    end if;
    delete from public.admins where user_id = alvo;
  end if;
end $$;

-- Apaga a conta de acesso. Perfil, regras pessoais e preferências da pessoa saem junto.
-- O que é da equipe (tipos, regras, salas) passa para quem apagou, para não sumir.
create or replace function public.apagar_conta(alvo uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.sou_principal() then raise exception 'Só o admin principal pode apagar contas.' using errcode = '42501'; end if;
  if alvo = auth.uid() then raise exception 'Você não pode apagar a sua própria conta.'; end if;
  if exists (select 1 from public.admins where user_id = alvo and principal) then raise exception 'Não dá para apagar outro admin principal.'; end if;
  if not exists (select 1 from auth.users where id = alvo) then raise exception 'Conta não encontrada.'; end if;
  select count(*) into n from public.docs where dono = alvo and col = 'processos';
  if n > 0 then raise exception 'Esta conta ainda tem % processo(s). Passe os processos para outra pessoa antes de apagar.', n; end if;
  update public.docs set dono = auth.uid() where dono = alvo and col not in ('perfis', 'regras', 'leituras', 'prefs');
  delete from auth.users where id = alvo;
end $$;
revoke execute on function public.apagar_conta(uuid) from public, anon;
grant execute on function public.apagar_conta(uuid) to authenticated;
revoke execute on function public.redefinir_senha(uuid, text) from public, anon;
revoke execute on function public.definir_admin(uuid, boolean) from public, anon;
grant execute on function public.redefinir_senha(uuid, text) to authenticated;
grant execute on function public.definir_admin(uuid, boolean) to authenticated;

-- =====================================================================
-- Cópia de segurança automática: todo dia às 6h (Brasília) o banco guarda
-- um retrato de tudo; ficam as 30 últimas. Só a administração baixa.
-- =====================================================================
create table if not exists public.copias (
  id       bigserial primary key,
  feita_em timestamptz not null default now(),
  itens    int not null,
  dados    jsonb not null
);
alter table public.copias enable row level security;
revoke all on public.copias from anon, authenticated;

create or replace function public.fazer_copia()
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.copias (itens, dados)
    select count(*), coalesce(jsonb_agg(jsonb_build_object('col', col, 'id', id, 'dados', dados)), '[]'::jsonb)
    from public.docs where col <> 'prefs';
  delete from public.copias where id not in (select id from public.copias order by feita_em desc limit 30);
end $$;
revoke execute on function public.fazer_copia() from public, anon, authenticated;

create or replace function public.lista_copias()
returns table (id bigint, feita_em timestamptz, itens int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Só a administração.' using errcode = '42501'; end if;
  return query select c.id, c.feita_em, c.itens from public.copias c order by c.feita_em desc;
end $$;

create or replace function public.baixar_copia(qual bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.sou_admin() then raise exception 'Só a administração.' using errcode = '42501'; end if;
  select dados into r from public.copias where id = qual;
  return r;
end $$;

create or replace function public.copiar_agora()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Só a administração.' using errcode = '42501'; end if;
  perform public.fazer_copia();
end $$;

revoke execute on function public.lista_copias() from public, anon;
revoke execute on function public.baixar_copia(bigint) from public, anon;
revoke execute on function public.copiar_agora() from public, anon;
grant execute on function public.lista_copias() to authenticated;
grant execute on function public.baixar_copia(bigint) to authenticated;
grant execute on function public.copiar_agora() to authenticated;

-- Agendamento diário (09:00 UTC = 06:00 em Brasília).
-- Se esta parte der erro, ligue a extensão "pg_cron" em Database > Extensions e rode de novo.
create extension if not exists pg_cron;
select cron.schedule('copia-diaria', '0 9 * * *', 'select public.fazer_copia()');
