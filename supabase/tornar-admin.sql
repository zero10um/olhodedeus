-- Torna administrador o usuário indicado.
-- 1. Troque SEU_USUARIO pelo usuário com que você entra no site (o mesmo da tela de login).
-- 2. Rode no SQL Editor do Supabase.
-- 3. A última linha mostra quem é admin agora. Confira se é você.
-- Não lembra o usuário? Rode só esta linha para ver todas as contas criadas no site:
--   select split_part(email, '@', 1) as usuario, created_at from auth.users order by created_at;

insert into public.admins (user_id)
select id from auth.users where email = lower('SEU_USUARIO') || '@olhodedeus.vercel.app'
on conflict do nothing;

select split_part(u.email, '@', 1) as admin, u.created_at as conta_criada_em
from public.admins a join auth.users u on u.id = a.user_id;

-- Para tirar alguém da administração:
-- delete from public.admins where user_id = (select id from auth.users where email = 'usuario@olhodedeus.vercel.app');
