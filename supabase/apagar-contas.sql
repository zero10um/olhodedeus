-- Admin principal e "Apagar conta"
-- Como usar: no Supabase, abra "SQL Editor", cole tudo isto e clique em "Run".
-- Pode rodar mais de uma vez sem problema. A última linha mostra quem é o admin principal: confira se é você.
--
-- Regras:
--  * o admin principal é o admin mais antigo (a primeira pessoa que virou admin);
--  * só ele apaga contas; não apaga a própria nem a de outro principal;
--  * conta com processos não é apagada: passe os processos antes (tela Equipe);
--  * ninguém tira o principal da administração, e só ele troca a própria senha.

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

select replace(u.email, '@olhodedeus.app', '') as admin_principal
from public.admins a join auth.users u on u.id = a.user_id where a.principal;
