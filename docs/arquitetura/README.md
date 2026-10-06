# Arquitetura: Agenda pedagógica (olhodedeus)

Sistema do setor pedagógico da EMPRO para acompanhar processos SEI e eventos: o que cada servidor cadastrou, o que falta fazer, o que está esperando resposta de outra unidade e a agenda da equipe.

Esta pasta descreve o sistema em diagramas C4 (Mermaid), do mais geral ao mais técnico.

| Arquivo | O que mostra | Para quem |
|---|---|---|
| [c4-contexto.md](c4-contexto.md) | Quem usa o sistema e com o que ele se relaciona | Todos |
| [c4-containers.md](c4-containers.md) | As partes que rodam (site, banco, login) | Equipe técnica |
| [c4-dinamico-sincronizacao.md](c4-dinamico-sincronizacao.md) | Como uma alteração chega aos colegas | Equipe técnica |
| [c4-implantacao-atual.md](c4-implantacao-atual.md) | Onde roda hoje (protótipo) | DTI |
| [c4-implantacao-alvo.md](c4-implantacao-alvo.md) | Onde poderia rodar dentro da DTI | DTI |
| [modelo-de-dados.md](modelo-de-dados.md) | Como os dados estão guardados hoje e o modelo relacional proposto | DTI, DBA |

## Resumo em cinco linhas

1. O site é estático (HTML, CSS e JavaScript puro, sem etapa de build). Abre até direto do arquivo, sem internet.
2. Na versão da equipe, os dados ficam num PostgreSQL gerenciado pelo Supabase. Quem pode ler e gravar o quê é decidido **no banco** (Row Level Security), não no site.
3. O login é usuário + senha (Supabase Auth). Conta nova só entra depois que a administração libera. Só as iniciais aparecem para a equipe.
4. Cada alteração grava o documento inteiro do processo. Os colegas recebem em tempo real ou, na rede do MP (que bloqueia o websocket), por uma consulta a cada 30 segundos que traz só o que mudou.
5. Proteção de dados desde o desenho: só iniciais, número SEI encurtado, nenhum valor em dinheiro, nenhum dado pessoal.
