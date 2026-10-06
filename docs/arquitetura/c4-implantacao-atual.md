# Implantação atual (protótipo)

Tudo em serviços gratuitos, fora da infraestrutura do MPRO.

```mermaid
C4Deployment
  title Implantação atual: protótipo

  Deployment_Node(pc, "PC do trabalho ou celular", "Navegador") {
    Container(spa, "Site", "HTML, CSS, JS", "Baixado da Vercel")
  }

  Deployment_Node(vercel, "Vercel", "Plano Hobby, CDN global") {
    Container(estatico, "Arquivos do site", "Estático", "Publicados a cada push na main")
    Container(proxy, "Rewrite /sb", "Edge", "Contorna o bloqueio de *.supabase.co na rede do MP")
  }

  Deployment_Node(supa, "Supabase Cloud", "Plano gratuito, região a confirmar") {
    Container(auth, "Auth", "GoTrue", "")
    Container(api, "PostgREST", "", "")
    ContainerDb(pg, "PostgreSQL", "500 MB", "Dados, RLS, pg_cron")
  }

  Deployment_Node(gh, "GitHub", "Repositório público zero10um/olhodedeus") {
    Container(repo, "Código", "git", "")
  }

  Rel(spa, estatico, "Carrega", "HTTPS")
  Rel(spa, proxy, "Chama o banco", "HTTPS")
  Rel(proxy, auth, "Repassa", "HTTPS")
  Rel(proxy, api, "Repassa", "HTTPS")
  Rel(api, pg, "SQL")
  Rel(repo, estatico, "Publica", "Webhook")
```

## Limites que valem para um protótipo, mas não para produção

| Serviço | Limite |
|---|---|
| Supabase gratuito | Pausa o projeto depois de 7 dias sem uso (o recesso de fim de ano passa disso); 500 MB de banco; 5 GB de tráfego por mês; sem backup gerenciado (por isso existe a cópia diária própria) |
| Vercel Hobby | Destinado a uso pessoal e não comercial; o tráfego para o banco também passa por ela |
| Os dois | Contas pessoais, fora da gestão da DTI; dados fora da rede do MPRO |
