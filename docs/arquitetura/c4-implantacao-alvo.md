# Implantação proposta na DTI

**Proposta:** levar o mesmo código para servidores da DTI, sem reescrever o site.
- O Supabase é software livre: dá para rodar Auth, PostgREST e Realtime em contêineres dentro da rede, apontando para um PostgreSQL da DTI.
- O site só troca o endereço do banco: hoje ele está fixo em `js/supabase-db.js`.

```mermaid
C4Deployment
  title Implantação proposta: infraestrutura da DTI

  Deployment_Node(pc, "Estação do MPRO", "Navegador na rede interna") {
    Container(spa, "Site", "HTML, CSS, JS", "")
  }

  Deployment_Node(dc, "Datacenter da DTI", "Rede interna") {
    Deployment_Node(web, "Servidor web", "nginx ou IIS") {
      Container(estatico, "Arquivos do site", "Estático", "")
      Container(rproxy, "Proxy reverso /sb", "nginx", "Também repassa o websocket")
    }
    Deployment_Node(cont, "Contêineres", "Docker ou Kubernetes") {
      Container(auth, "Auth", "GoTrue", "Login pela conta de rede")
      Container(api, "PostgREST", "", "")
      Container(rt, "Realtime", "", "Funciona na rede interna")
      Container(int, "Integração SEI", "Função de servidor", "Consulta andamentos")
    }
    Deployment_Node(dbn, "Servidor de banco", "PostgreSQL da DTI") {
      ContainerDb(pg, "PostgreSQL", "", "Backup e retenção da política da DTI")
    }
    System_Ext(idp, "Diretório institucional", "AD/LDAP via Keycloak (SAML ou OIDC)")
    System_Ext(sei, "SEI do MPRO", "Web services SOAP (SeiWS)")
  }

  Rel(spa, estatico, "Carrega", "HTTPS")
  Rel(spa, rproxy, "Chama o banco", "HTTPS e WSS")
  Rel(rproxy, auth, "Repassa")
  Rel(rproxy, api, "Repassa")
  Rel(rproxy, rt, "Repassa", "WSS")
  Rel(auth, idp, "Autentica", "SAML/OIDC")
  Rel(api, pg, "SQL + RLS")
  Rel(int, sei, "consultarProcedimento, listarAndamentos", "SOAP")
  Rel(int, pg, "Grava andamentos")
```

## O que muda em relação a hoje

| Hoje | Na DTI |
|---|---|
| Senha própria do sistema | Login com a conta de rede: quem sai do MPRO perde o acesso sozinho |
| Websocket bloqueado, consulta a cada 30 s | Tempo real funcionando na rede interna |
| Número do SEI digitado; despacho e resposta marcados à mão | O sistema consulta o SEI e mostra o andamento. A DTI precisa cadastrar o sistema no SEI. |
| Cópia diária no próprio banco + download manual | Backup e retenção da DTI |
| Dados em nuvem pública, fora do MPRO | Dados no datacenter do MPRO |

Se a DTI tiver uma plataforma padrão própria (Java, .NET ou PHP), outro caminho é **reescrever** nessa plataforma usando o protótipo como especificação viva. As telas, as regras de prazo e o [modelo de dados proposto](modelo-de-dados.md) já descrevem o que o sistema faz.
