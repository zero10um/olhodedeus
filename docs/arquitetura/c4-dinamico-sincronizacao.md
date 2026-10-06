# Fluxo: como uma alteração chega aos colegas

Exemplo: um servidor marca um passo como feito.

```mermaid
C4Dynamic
  title Sincronização de uma alteração

  Container(spaA, "Site do servidor A", "JavaScript", "Quem alterou")
  Container(proxy, "Repasse /sb", "Vercel", "Mesmo endereço do site")
  Container(api, "API de dados", "PostgREST", "")
  ContainerDb(pg, "Banco", "PostgreSQL", "Tabela docs + RLS")
  Container(rt, "Tempo real", "Supabase Realtime", "")
  Container(spaB, "Site do servidor B", "JavaScript", "Colega")

  Rel(spaA, proxy, "1. Grava o processo inteiro, 600 ms depois da última mudança", "upsert JSON")
  Rel(proxy, api, "2. Repassa com o token")
  Rel(api, pg, "3. RLS confere se A é dono ou admin")
  Rel(pg, rt, "4. Publica a mudança")
  Rel(rt, spaB, "5a. Entrega na hora, quando o websocket passa", "WSS")
  Rel(spaB, proxy, "5b. Sem websocket: a cada 30 s busca o que mudou", "HTTPS")
```

## Pontos de atenção do fluxo atual

- **A gravação é do documento inteiro.** Se duas pessoas mexerem no mesmo processo dentro da mesma janela, vale a última gravação, e a outra mudança se perde sem aviso. Na rede do MP essa janela é de até 30 segundos.
- **Plano B leve.** Sem websocket, a consulta a cada 30 s traz só os documentos mais novos que a última alteração vista (coluna `atualizado`). A cada 5 voltas, uma conferência só de ids e horários acha o que foi apagado ou escapou. A leitura é feita de mil em mil linhas, o limite da API. Para quando a aba fica escondida.
- **Comparação estável.** O site compara o JSON com as chaves em ordem para não regravar o que não mudou (`nuvem.js`).
