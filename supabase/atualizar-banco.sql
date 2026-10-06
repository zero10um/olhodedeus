-- Atualização do banco (outubro/2026)
-- Como usar: no Supabase, abra "SQL Editor", cole tudo isto e clique em "Run".
-- Pode rodar mais de uma vez sem problema. Já inclui o antigo apagar-contas.sql.
--
-- O que muda:
--  1. Admin principal (o admin mais antigo): só ele apaga contas.
--  2. Conta nova só lê e grava depois que a administração liberar (tela Equipe).
--     Quem já tem conta hoje continua entrando normalmente.
--  3. O e-mail interno das contas passa para @olhodedeus.vercel.app
--     (o domínio antigo, olhodedeus.app, foi registrado por outra pessoa). Usuário e senha não mudam.
--  4. Redefinir a senha de alguém derruba as sessões abertas dessa pessoa.
--  5. O banco só aceita os tipos de documento do sistema, com tamanho limitado.
-- A consulta do fim mostra todas as contas: confira se são todas da equipe e quem é o admin principal.

-- ---------- 1. Admin principal ----------
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

-- ---------- 2. Contas liberadas ----------
create table if not exists public.liberados (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  liberado_em  timestamptz not null default now(),
  liberado_por uuid references auth.users (id) on delete set null
);
alter table public.liberados enable row level security;
revoke all on public.liberados from anon, authenticated;
-- Na primeira vez, todas as contas que já existem ficam liberadas
insert into public.liberados (user_id)
select id from auth.users where not exists (select 1 from public.liberados)
on conflict do nothing;

create or replace function public.liberado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.liberados where user_id = auth.uid())
      or exists (select 1 from public.admins where user_id = auth.uid())
$$;
revoke execute on function public.liberado() from public, anon;
grant execute on function public.liberado() to authenticated;

create or replace function public.liberar_conta(alvo uuid, ligar boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Só a administração libera contas.' using errcode = '42501'; end if;
  if ligar then
    if not exists (select 1 from auth.users where id = alvo) then raise exception 'Conta não encontrada.'; end if;
    insert into public.liberados (user_id, liberado_por) values (alvo, auth.uid()) on conflict do nothing;
  else
    if alvo = auth.uid() then raise exception 'Você não pode bloquear a sua própria conta.'; end if;
    if exists (select 1 from public.admins where user_id = alvo) then raise exception 'Tire a pessoa da administração antes de bloquear.'; end if;
    delete from public.liberados where user_id = alvo;
    delete from auth.sessions where user_id = alvo;
  end if;
end $$;
revoke execute on function public.liberar_conta(uuid, boolean) from public, anon;
grant execute on function public.liberar_conta(uuid, boolean) to authenticated;

-- Regras de acesso: as mesmas de antes, agora só para contas liberadas
drop policy if exists "equipe le" on public.docs;
drop policy if exists "cada um cria o seu" on public.docs;
drop policy if exists "cada um muda o seu" on public.docs;
drop policy if exists "cada um apaga o seu" on public.docs;

create policy "equipe le" on public.docs for select to authenticated
  using ((select public.liberado()) and (col <> 'prefs' or dono = (select auth.uid())));

create policy "cada um cria o seu" on public.docs for insert to authenticated
  with check (
    (select public.liberado())
    and (col <> 'processos' or dados ->> 'dono' = dono::text)
    and (
      ((select public.sou_admin()) and col <> 'prefs')
      or (
        dono = (select auth.uid()) and col <> 'equipe'
        and (col not in ('perfis', 'regras', 'leituras', 'prefs') or id = (select auth.uid())::text)
      )
    )
  );

create policy "cada um muda o seu" on public.docs for update to authenticated
  using ((select public.liberado()) and (dono = (select auth.uid()) or ((select public.sou_admin()) and col <> 'prefs')))
  with check (
    (select public.liberado())
    and (col <> 'processos' or dados ->> 'dono' = dono::text)
    and (
      ((select public.sou_admin()) and col <> 'prefs')
      or (
        dono = (select auth.uid()) and col <> 'equipe'
        and (col not in ('perfis', 'regras', 'leituras', 'prefs') or id = (select auth.uid())::text)
      )
    )
  );

create policy "cada um apaga o seu" on public.docs for delete to authenticated
  using ((select public.liberado()) and ((dono = (select auth.uid()) and col <> 'equipe') or ((select public.sou_admin()) and col <> 'prefs')));

-- ---------- 3. E-mail interno das contas ----------
update auth.users
   set email = split_part(email, '@', 1) || '@olhodedeus.vercel.app', updated_at = now()
 where email like '%@olhodedeus.app';
update auth.identities
   set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(split_part(identity_data ->> 'email', '@', 1) || '@olhodedeus.vercel.app')),
       updated_at = now()
 where provider = 'email' and identity_data ->> 'email' like '%@olhodedeus.app';

-- ---------- Funções da administração ----------
drop function if exists public.contas_equipe();
create function public.contas_equipe()
returns table (id uuid, usuario text, admin boolean, principal boolean, liberada boolean, processos int, criada_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Só a administração pode ver as contas.' using errcode = '42501'; end if;
  return query
    select u.id, split_part(u.email, '@', 1)::text,
           exists (select 1 from public.admins a where a.user_id = u.id),
           exists (select 1 from public.admins a where a.user_id = u.id and a.principal),
           exists (select 1 from public.liberados l where l.user_id = u.id) or exists (select 1 from public.admins a where a.user_id = u.id),
           (select count(*)::int from public.docs d where d.dono = u.id and d.col = 'processos'),
           u.created_at
    from auth.users u order by u.created_at;
end $$;
revoke execute on function public.contas_equipe() from public, anon;
grant execute on function public.contas_equipe() to authenticated;

-- ---------- 4. Redefinir senha derruba as sessões abertas ----------
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
  if alvo <> auth.uid() then delete from auth.sessions where user_id = alvo; end if;
end $$;

create or replace function public.definir_admin(alvo uuid, ligar boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Só a administração pode mudar quem é admin.' using errcode = '42501'; end if;
  if ligar then
    insert into public.admins (user_id) values (alvo) on conflict do nothing;
    insert into public.liberados (user_id, liberado_por) values (alvo, auth.uid()) on conflict do nothing;
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
  -- o que é da equipe (tipos, regras, salas) passa para quem apagou, para não sumir junto
  update public.docs set dono = auth.uid() where dono = alvo and col not in ('perfis', 'regras', 'leituras', 'prefs');
  delete from auth.users where id = alvo;
end $$;
revoke execute on function public.apagar_conta(uuid) from public, anon;
grant execute on function public.apagar_conta(uuid) to authenticated;

-- ---------- 5. Só os documentos do sistema, de tamanho razoável ----------
alter table public.docs drop constraint if exists docs_col_valida;
alter table public.docs add constraint docs_col_valida
  check (col in ('perfis', 'regras', 'leituras', 'processos', 'prefs', 'equipe')) not valid;
alter table public.docs drop constraint if exists docs_tamanho;
alter table public.docs add constraint docs_tamanho check (pg_column_size(dados) < 1000000) not valid;
-- a consulta periódica busca só o que mudou: este índice deixa isso rápido
create index if not exists docs_atualizado on public.docs (atualizado);

-- ---------- Conferência ----------
select split_part(u.email, '@', 1) as usuario, u.email as email_interno, u.created_at as criada_em,
       exists (select 1 from public.liberados l where l.user_id = u.id) as liberada,
       coalesce(a.principal, false) as admin_principal, a.user_id is not null as admin
from auth.users u left join public.admins a on a.user_id = u.id
order by u.created_at;
