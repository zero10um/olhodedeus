# Nível 1: Contexto

Quem usa o sistema e com o que ele se relaciona. Hoje nenhuma ligação com outros sistemas é automática: o número do SEI é digitado à mão e as cópias de segurança são baixadas e guardadas pela administração.

```mermaid
C4Context
  title Contexto: Agenda pedagógica da EMPRO

  Person(servidor, "Servidor do pedagógico", "Cadastra e acompanha os próprios processos e eventos")
  Person(admin, "Administração", "Mantém tipos, regras de prazo, contas e cópias")

  System(agenda, "Agenda pedagógica", "Checklists, prazos, encaminhamentos e agenda da equipe")

  System_Ext(sei, "SEI", "Processos eletrônicos do MPRO")
  System_Ext(unidades, "Unidades do MPRO", "PGJ, DOF, DA, GCI e setor financeiro")
  System_Ext(drive, "Pasta de cópias", "Drive ou pasta da rede, fora do banco")

  Rel(servidor, agenda, "Registra passos, despachos e respostas", "HTTPS")
  Rel(admin, agenda, "Configura regras e contas", "HTTPS")
  Rel(servidor, sei, "Despacha e consulta processos")
  Rel(sei, unidades, "Encaminha despachos")
  Rel(agenda, sei, "Guarda o número do SEI (digitado à mão)")
  Rel(admin, drive, "Guarda a cópia semanal", "JSON")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

**Fronteira do sistema:** a Agenda não substitui o SEI. Ela organiza o trabalho do pedagógico **em volta** do SEI: o que precisa ser feito, até quando, e o que está parado esperando outra unidade.
