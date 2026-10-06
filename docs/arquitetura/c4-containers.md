# Nível 2: Containers

As partes que rodam separadas. O site é um só conjunto de arquivos estáticos que funciona de dois jeitos:

- **versão da equipe**, publicada na internet, com os dados no Supabase;
- **versão local**, aberta pelo arquivo, com os dados no navegador.

```mermaid
C4Container
  title Containers: Agenda pedagógica

  Person(usuario, "Servidor ou administração", "Usa pelo navegador do PC do trabalho ou do celular")

  System_Boundary(agenda, "Agenda pedagógica") {
    Container(spa, "Site", "HTML, CSS, JavaScript puro", "Telas, regras de prazo e checklists; roteador por hash")
    ContainerDb(local, "Armazenamento do navegador", "localStorage", "Só na versão local, sem internet")
    Container(proxy, "Repasse /sb", "Rewrite da Vercel", "Faz as chamadas ao banco passarem pelo próprio site")
    Container(auth, "Login", "Supabase Auth (GoTrue)", "Usuário e senha; emite o token de sessão")
    Container(api, "API de dados", "PostgREST", "Lê e grava a tabela docs e chama as funções")
    Container(rt, "Tempo real", "Supabase Realtime", "Avisa os colegas quando algo muda")
    ContainerDb(pg, "Banco", "PostgreSQL 15", "Tabela docs (JSON) com RLS, admins, cópias diárias via pg_cron")
  }

  Rel(usuario, spa, "Usa", "HTTPS")
  Rel(spa, local, "Grava e lê, na versão local")
  Rel(spa, proxy, "Chama o banco", "HTTPS + token de sessão")
  Rel(proxy, auth, "Repassa login e renovação do token", "HTTPS")
  Rel(proxy, api, "Repassa leituras, gravações e funções", "HTTPS/JSON")
  Rel(spa, rt, "Assina mudanças, quando o websocket passa", "WSS")
  Rel(api, pg, "Consulta com o usuário logado", "SQL + RLS")
  Rel(rt, pg, "Lê as mudanças", "Replicação lógica")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## Dentro do site (componentes principais)

Todos os arquivos ficam em `js/` e compartilham um único objeto global, `window.App`. Eles são carregados nesta ordem pelo `index.html`:

| Arquivo | Papel |
|---|---|
| `util.js` | Funções gerais: datas, escape de HTML, avisos, ícones |
| `dados.js` | Modelo: processos, prazos, situação, encaminhamentos, migração de formatos antigos |
| `regras.js` | Modelos de checklist por tipo de processo e a tela Regras de prazo |
| `entrada.js` | Perfis e escolha de painel |
| `painel.js`, `processos.js`, `processo.js` | Telas principais |
| `agenda.js` | Agenda da equipe, salas, impressão da semana |
| `relatorio.js` | Exportação em planilha (SheetJS) |
| `equipe.js` | Tela da administração: contas, senhas, salas, cópias |
| `avisos.js` | Sino de avisos (atrasos, respostas pendentes, certificados) |
| `supabase-db.js` | Adaptador do banco: login, leitura, gravação, tempo real e plano B por consulta periódica |
| `nuvem.js` | Sincroniza o estado da tela com o banco (só grava o que mudou) |
| `app.js` | Inicialização e roteamento |

**Onde está a segurança:** no banco. Conta nova não lê nem grava nada até a administração liberar (tabela `liberados`). O site esconde botões que a pessoa não pode usar, mas quem decide é o PostgreSQL, pelas políticas RLS e pelas funções `security definer` que conferem `sou_admin()` ou `sou_principal()`.
