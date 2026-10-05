/* Regras de prazo: os modelos de cada tipo de processo e a tela para editá-los.
   As regras são de cada perfil. Os valores abaixo são o ponto de partida, para ajustar aos poucos. */
(function (A) {
  const passo = (id, nome, dias, quando, ref, coluna) => ({ id, nome, dias, quando, ref, coluna: coluna || null });
  const frente = (id, nome, fase, icone, coluna, passos, naPadrao) => ({ id, nome, fase, icone, coluna: coluna || null, naPadrao: !!naPadrao, passos });

  /* Modelos da versão 2 (out/2026), tirados de dois processos reais:
     - quem: 'faz' = tarefa do pedagógico; 'acompanha' = marco de outra unidade (só confere se chegou)
     - obrig: passo que não pode ser marcado "não se aplica" sem motivo */
  const ac = (id, nome, dias, quando, ref, extra) => Object.assign(passo(id, nome, dias, quando, ref), { quem: 'acompanha' }, extra || {});
  const ob = (id, nome, dias, quando, ref, extra) => Object.assign(passo(id, nome, dias, quando, ref), { obrig: true }, extra || {});
  const freqECertificados = (pre, emite) => [
    ob(pre + 'f1', 'Fechar a lista de frequência', 2, 'depois', 'fim'),
    emite === 'contratada' ? ob(pre + 'f2', 'Conferir os certificados entregues pela contratada', 10, 'depois', 'fim', { coluna: 'Certificados emitidos' })
      : ob(pre + 'f2', 'Emitir os certificados', 10, 'depois', 'fim', { coluna: 'Certificados emitidos' }),
    passo(pre + 'f3', 'Atualizar a planilha de exonerados', 5, 'depois', 'fim', 'Planilha de exonerados'),
  ];
  const apoioDasUnidades = pre => frente('local', 'Apoio das unidades (SEI de apoio)', 'prep', 'predio', null, [
    ob(pre + 'a1', 'Abrir o SEI de apoio das unidades', 40, 'antes', 'inicio'),
    ob(pre + 'a2', 'Reservar a sala ou o auditório', 35, 'antes', 'inicio'),
    passo(pre + 'a3', 'Pedir o apoio técnico (formulário)', 20, 'antes', 'inicio'),
    passo(pre + 'a4', 'Pedir o coffee break à GCI', 20, 'antes', 'inicio'),
  ]);
  const comunicacao = pre => frente('comunicacao', 'Comunicação e inscrições', 'prep', 'megafone', 'Setor de comunicação', [
    ob(pre + 'm1', 'Enviar o briefing à comunicação', 30, 'antes', 'inicio'),
    passo(pre + 'm2', 'Aprovar as artes', 21, 'antes', 'inicio'),
    ob(pre + 'm3', 'Abrir as inscrições', 14, 'antes', 'inicio'),
    passo(pre + 'm4', 'Fechar a lista de inscritos e avisar quem vai ministrar', 2, 'antes', 'inicio'),
  ]);
  const deslocamento = (pre, na) => frente('deslocamento', 'Deslocamento (formulário de deslocamento)', 'prep', 'aviao', 'Deslocamento / Portaria', [
    passo(pre + 'd1', 'Receber o formulário de deslocamento', 30, 'antes', 'inicio'),
    passo(pre + 'd2', 'Pedir a portaria ao DA', 25, 'antes', 'inicio'),
    ac(pre + 'd3', 'Portaria aprovada pelo DA', 20, 'antes', 'inicio', { setor: 'DA' }),
    passo(pre + 'd4', 'Enviar ao setor financeiro para passagens e diárias', 18, 'antes', 'inicio'),
    ac(pre + 'd5', 'Passagens e diárias compradas', 10, 'antes', 'inicio', { setor: 'Setor financeiro (EMPRO)' }),
  ], na);

  const MODELOS_V2 = () => [
    { id: 'capacitacao', nome: 'Capacitação com contratação externa', ref: 'evento', aprovacao: true, frentes: [
      frente('instrucao', 'Início', 'inicio', 'pasta', 'Instrução do processo', [
        ob('k1', 'Confirmar que está no Programa de Capacitação', 70, 'antes', 'inicio'),
        ob('k2', 'Receber a proposta (formato, turmas, datas, conteúdo)', 70, 'antes', 'inicio'),
      ]),
      frente('contratacao', 'Contratação (setor financeiro da EMPRO)', 'prep', 'contrato', null, [
        ob('k3', 'Pedir o DFD à unidade demandante', 65, 'antes', 'inicio'),
        ob('k4', 'Enviar a demanda ao setor financeiro da EMPRO', 60, 'antes', 'inicio'),
        ac('k5', 'DFD e TR prontos', 55, 'antes', 'inicio', { setor: 'Setor financeiro (EMPRO)' }),
        ac('k6', 'DAC analisou e lançou no THEMA', 50, 'antes', 'inicio', { setor: 'DAC' }),
        ac('k7', 'Reserva no FUNDIMPER e confirmação da DOF', 45, 'antes', 'inicio', { setor: 'DOF', coluna: 'FUNDIMPER' }),
        ac('k8', 'Autorização da DA', 40, 'antes', 'inicio', { setor: 'DA' }),
        ac('k9', 'Inexigibilidade publicada no PNCP', 30, 'antes', 'inicio', { setor: 'DAC' }),
        ac('k10', 'Nota de Empenho emitida', 20, 'antes', 'inicio', { setor: 'DA', obrig: true }),
        ob('k11', 'Avisar o fornecedor que está contratado', 15, 'antes', 'inicio'),
      ]),
      apoioDasUnidades('k'), comunicacao('k'), deslocamento('k', true),
      frente('pos', 'Pós-evento', 'pos', 'certificado', null, [
        ...freqECertificados('k', 'contratada'),
        ob('k12', 'Atestar a execução do curso', 5, 'depois', 'fim'),
        ac('k13', 'Liquidação e pagamento', 30, 'depois', 'fim', { setor: 'Setor financeiro (EMPRO)' }),
      ]),
      frente('encerramento', 'Encerramento', 'fim', 'arquivo', null, [
        passo('k14', 'Conferir se está tudo pago e arquivar', 40, 'depois', 'fim'),
      ]),
    ] },
    { id: 'acao-equipe', nome: 'Ação executada pela equipe', ref: 'evento', aprovacao: true, frentes: [
      frente('instrucao', 'Início', 'inicio', 'pasta', 'Instrução do processo', [
        ob('e1', 'Confirmar que está no planejamento', 60, 'antes', 'inicio'),
        ob('e2', 'Definir datas, locais e público', 50, 'antes', 'inicio'),
      ]),
      apoioDasUnidades('e'), comunicacao('e'), deslocamento('e', false),
      frente('pos', 'Pós-evento', 'pos', 'certificado', null, freqECertificados('e', 'escola')),
      frente('encerramento', 'Encerramento', 'fim', 'arquivo', null, [passo('e9', 'Arquivar o processo', 30, 'depois', 'fim')]),
    ] },
    { id: 'custeio-externo', nome: 'Custeio de curso externo (pedido de outra unidade)', ref: 'evento', aprovacao: false, frentes: [
      frente('instrucao', 'Pedido e análise', 'inicio', 'pasta', 'Instrução do processo', [
        ob('u1', 'Conferir o pedido: DFD da unidade, proposta e programação do curso', 60, 'antes', 'inicio'),
        ob('u2', 'Conferir o formulário de deslocamento (plano de viagem, fim de semana, bagagem)', 60, 'antes', 'inicio'),
        ob('u3', 'Analisar a pertinência do tema e se não dá para fazer in company', 55, 'antes', 'inicio'),
        passo('u4', 'Pedir à PGJ a alteração de escopo do Programa de Estudos (remanejamento)', 50, 'antes', 'inicio'),
        ac('u5', 'Decisão da PGJ (escopo e deslocamento)', 45, 'antes', 'inicio', { setor: 'PGJ' }),
        ob('u6', 'Encaminhar ao setor financeiro: inscrição, diárias e passagens', 40, 'antes', 'inicio'),
      ]),
      frente('deslocamento', 'Com o setor financeiro e a DA', 'prep', 'aviao', 'Deslocamento / Portaria', [
        ac('u7', 'Portaria de diárias e passagens (DA)', 35, 'antes', 'inicio', { setor: 'DA' }),
        ac('u8', 'Inscrição reservada e Nota de Empenho emitida', 30, 'antes', 'inicio', { setor: 'Setor financeiro (EMPRO)' }),
        ac('u9', 'Passagens compradas', 15, 'antes', 'inicio', { setor: 'Setor financeiro (EMPRO)' }),
      ]),
      frente('pos', 'Certificado', 'pos', 'certificado', null, [
        ob('u10', 'Avisar o servidor: o certificado será cobrado em 15 dias', 1, 'depois', 'fim'),
        ob('u11', 'Cobrar o certificado do servidor', 15, 'depois', 'fim'),
        ob('u12', 'Conferir o certificado apresentado', 20, 'depois', 'fim', { coluna: 'Certificados apresentados' }),
      ]),
    ] },
    { id: 'evento-externo', nome: 'Participação em evento externo', ref: 'evento', aprovacao: false, frentes: [
      frente('instrucao', 'Início', 'inicio', 'pasta', 'Instrução do processo', [
        ob('x1', 'Receber o pedido do servidor (evento, datas, local)', 45, 'antes', 'inicio'),
        ac('x2', 'Autorização da participação', 35, 'antes', 'inicio', { setor: 'PGJ' }),
      ]),
      frente('financeira', 'Inscrição', 'prep', 'moeda', 'Instrução financeira', [
        ob('x3', 'Enviar ao setor financeiro o pagamento da inscrição', 25, 'antes', 'inicio'),
        ac('x4', 'Inscrição paga', 15, 'antes', 'inicio', { setor: 'Setor financeiro (EMPRO)' }),
      ]),
      deslocamento('x', false),
      frente('pos', 'Certificado', 'pos', 'certificado', null, [
        ob('x5', 'Avisar o servidor: o certificado será cobrado em 15 dias', 1, 'depois', 'fim'),
        ob('x6', 'Cobrar o certificado do servidor', 15, 'depois', 'fim'),
        ob('x7', 'Conferir o certificado apresentado', 20, 'depois', 'fim', { coluna: 'Certificados apresentados' }),
      ]),
    ] },
  ];


  /* Modelos da versão 4 (out/2026): só dois tipos de evento, com checklist fixo.
     - semPrazo: itens do Início não têm prazo
     - para: 'servidores' | 'membros' — o item só vale para esse público
     - depAut: ao marcar com pedido à PGJ sem resposta (ou indeferido), o sistema pergunta antes
     - sob: grupo que só entra quando a pessoa pede (botão no processo) */
  const sp = (id, nome, extra) => Object.assign(passo(id, nome, 0, 'antes', 'inicio'), { semPrazo: true }, extra || {});
  const MODELOS_V4 = () => [
    { id: 'interno', nome: 'Evento interno', grupo: 'interno', ref: 'evento', aprovacao: false, frentes: [
      frente('instrucao', 'Início', 'inicio', 'pasta', 'Instrução do processo', [
        sp('i1', 'Verificar se está previsto no Programa de Estudos'),
        sp('i2', 'Pedir autorização à PGJ (quando não estiver previsto)'),
        sp('i3', 'Encaminhar à DOF (quando precisar de suplementação ou remanejamento)'),
      ]),
      Object.assign(frente('contratacao', 'Contratação (docente ou empresa)', 'prep', 'contrato', null, [
        ob('i4', 'Pedir o DFD à unidade demandante', 65, 'antes', 'inicio', { depAut: true }),
        ob('i5', 'Enviar a demanda ao setor financeiro da EMPRO', 60, 'antes', 'inicio', { depAut: true }),
        ac('i6', 'DFD e TR prontos', 55, 'antes', 'inicio', { setor: 'Setor financeiro (EMPRO)' }),
        ac('i7', 'Nota de Empenho emitida', 20, 'antes', 'inicio', { setor: 'Setor financeiro (EMPRO)', obrig: true }),
        ob('i8', 'Avisar o docente ou a empresa que está contratado', 15, 'antes', 'inicio'),
      ]), { sob: true }),
      apoioDasUnidades('i'), comunicacao('i'), deslocamento('i', true),
      frente('pos', 'Pós-evento', 'pos', 'certificado', null, freqECertificados('i', 'escola')),
      frente('encerramento', 'Encerramento', 'fim', 'arquivo', null, [passo('i9', 'Conferir se está tudo concluído e arquivar', 30, 'depois', 'fim')]),
    ] },
    { id: 'externo', nome: 'Evento externo', grupo: 'externo', ref: 'evento', aprovacao: false, frentes: [
      frente('instrucao', 'Início', 'inicio', 'pasta', 'Instrução do processo', [
        sp('x1', 'Receber o pedido (programação ou proposta e formulário de deslocamento)'),
        sp('x2', 'Verificar se está previsto no Programa de Estudos'),
        sp('x3', 'Pedir autorização à PGJ para participar'),
        sp('x4', 'Pedir a portaria e as diárias à DA', { para: 'servidores', depAut: true }),
        Object.assign(ac('x5', 'Portaria publicada pela PGJ', 0, 'antes', 'inicio', { setor: 'PGJ', para: 'membros' }), { semPrazo: true }),
        sp('x6', 'Encaminhar ao setor financeiro (inscrição e passagens)'),
        sp('x7', 'Encaminhar à DOF (só se precisar de suplementação ou remanejamento)'),
      ]),
      frente('pos', 'Certificado', 'pos', 'certificado', null, [
        ob('x8', 'Avisar quem participou: o certificado será cobrado em 15 dias', 1, 'depois', 'fim'),
        ob('x9', 'Cobrar o certificado', 15, 'depois', 'fim'),
        ob('x10', 'Conferir o certificado apresentado', 20, 'depois', 'fim', { coluna: 'Certificados apresentados' }),
      ]),
    ] },
  ];
  /* Tipos antigos ficam guardados (os processos já cadastrados dependem deles), mas não aparecem no cadastro */
  const ANTIGOS = { capacitacao: 'interno', 'acao-equipe': 'interno', curso: 'interno', 'evento-externo': 'externo', 'custeio-externo': 'externo' };
  A.TIPOS_ANTIGOS = ANTIGOS;
  A.atualizarModelos = r => {
    if ((r.versaoModelo || 1) >= 4) return false;
    const tem = new Set(r.tipos.map(t => t.id));
    r.tipos.unshift(...A.clonar(MODELOS_V4()).filter(t => !tem.has(t.id)));
    r.tipos.forEach(t => { if (ANTIGOS[t.id]) { t.oculto = true; t.grupo = ANTIGOS[t.id]; } });
    r.versaoModelo = 4;
    return true;
  };
  A.MODELOS_V2 = MODELOS_V2;
  A.regrasPadrao = () => { const r = A.clonar({
    versaoModelo: 3,
    limites: { critico: 7, atencao: 15, vencendo: 3 },
    tipos: [
      ...MODELOS_V2(),
      { id: 'curso', nome: 'Curso/Evento (modelo antigo)', ref: 'evento', aprovacao: true, frentes: [
        frente('instrucao', 'Instrução do processo', 'inicio', 'pasta', 'Instrução do processo', [
          passo('c1', 'Conferir se a ação está prevista no plano', 60, 'antes', 'inicio'),
          passo('c2', 'Abrir o processo no SEI e juntar a demanda', 60, 'antes', 'inicio'),
          passo('c3', 'Despacho de início dos trâmites', 55, 'antes', 'inicio')]),
        frente('financeira', 'Instrução financeira', 'prep', 'moeda', 'Instrução financeira', [
          passo('c4', 'Pedir disponibilidade ao setor de orçamento', 50, 'antes', 'inicio'),
          passo('c5', 'Receber a nota de empenho', 20, 'antes', 'inicio')]),
        frente('contratacao', 'Contratação', 'prep', 'contrato', null, [
          passo('c6', 'Elaborar o DFD', 50, 'antes', 'inicio'),
          passo('c7', 'Elaborar o TR', 45, 'antes', 'inicio'),
          passo('c8', 'Conferir a Nota de Empenho', 15, 'antes', 'inicio'),
          ac('c21', 'Lançado no THEMA', 50, 'antes', 'inicio', { setor: 'DAC', coluna: 'THEMA' }),
          ac('c22', 'Reserva no FUNDIMPER', 45, 'antes', 'inicio', { setor: 'DOF', coluna: 'FUNDIMPER' })]),
        frente('deslocamento', 'Deslocamento e portaria', 'prep', 'aviao', 'Deslocamento / Portaria', [
          passo('c9', 'Pedir passagens e diárias', 30, 'antes', 'inicio'),
          passo('c10', 'Conferir a publicação da portaria', 10, 'antes', 'inicio')]),
        frente('local', 'Local e estrutura', 'prep', 'predio', null, [
          passo('c11', 'Reservar o auditório ou a sala com a GCI', 45, 'antes', 'inicio'),
          passo('c12', 'Confirmar sala, equipamento e lista de inscritos', 7, 'antes', 'inicio')]),
        frente('comunicacao', 'Comunicação', 'prep', 'megafone', 'Setor de comunicação', [
          passo('c13', 'Enviar briefing à GCI', 30, 'antes', 'inicio'),
          passo('c14', 'Conferir se a arte foi publicada', 21, 'antes', 'inicio'),
          passo('c15', 'Conferir se as inscrições abriram', 14, 'antes', 'inicio'),
          passo('c16', 'Enviar a lista de inscritos ao instrutor', 2, 'antes', 'inicio')]),
        frente('pos', 'Certificados e pagamentos', 'pos', 'certificado', null, [
          passo('c17', 'Atualizar a planilha de exonerados', 5, 'depois', 'fim', 'Planilha de exonerados'),
          passo('c18', 'Conferir os certificados apresentados', 10, 'depois', 'fim', 'Certificados apresentados'),
          passo('c19', 'Emitir os certificados', 10, 'depois', 'fim', 'Certificados emitidos'),
          passo('c20', 'Conferir pagamento e liquidação do empenho', 20, 'depois', 'fim')]),
        frente('encerramento', 'Encerramento', 'fim', 'arquivo', null, [
          passo('c23', 'Conferir se está tudo pago e arquivar', 40, 'depois', 'fim')]),
      ] },
      { id: 'certificacao', nome: 'Certificação', ref: 'limite', aprovacao: false, frentes: [
        frente('instrucao', 'Instrução do processo', 'inicio', 'pasta', 'Instrução do processo', [passo('ce1', 'Instruir o processo', 10, 'antes', 'limite')]),
        frente('certificados', 'Certificados', 'prep', 'certificado', null, [
          passo('ce2', 'Conferir os certificados apresentados', 5, 'antes', 'limite', 'Certificados apresentados'),
          passo('ce3', 'Emitir os certificados', 2, 'antes', 'limite', 'Certificados emitidos')]),
      ] },
      { id: 'nomeacao', nome: 'Nomeação', ref: 'limite', aprovacao: false, frentes: [
        frente('instrucao', 'Instrução do processo', 'inicio', 'pasta', 'Instrução do processo', [passo('n1', 'Instruir o processo', 7, 'antes', 'limite')]),
        frente('certificados', 'Certificados', 'prep', 'certificado', null, [passo('n2', 'Emitir os certificados', 3, 'antes', 'limite', 'Certificados emitidos')]),
      ] },
      { id: 'gratificacao', nome: 'Gratificação de instrutoria', ref: 'limite', aprovacao: false, frentes: [
        frente('instrucao', 'Instrução do processo', 'inicio', 'pasta', 'Instrução do processo', [passo('g1', 'Instruir o processo', 10, 'antes', 'limite')]),
        frente('financeira', 'Instrução financeira', 'prep', 'moeda', 'Instrução financeira', [passo('g2', 'Pedir o pagamento ao setor financeiro', 5, 'antes', 'limite')]),
      ] },
      { id: 'reembolso', nome: 'Reembolso', ref: 'limite', aprovacao: false, frentes: [
        frente('instrucao', 'Instrução do processo', 'inicio', 'pasta', 'Instrução do processo', [passo('r1', 'Conferir os comprovantes e instruir', 10, 'antes', 'limite')]),
        frente('financeira', 'Instrução financeira', 'prep', 'moeda', 'Instrução financeira', [passo('r2', 'Pedir o reembolso ao setor financeiro', 5, 'antes', 'limite')]),
      ] },
      { id: 'exoneracao', nome: 'Exoneração', ref: 'limite', aprovacao: false, frentes: [
        frente('instrucao', 'Instrução do processo', 'inicio', 'pasta', 'Instrução do processo', [passo('e1', 'Instruir o processo', 7, 'antes', 'limite')]),
      ] },
      { id: 'outro', nome: 'Outro', ref: 'limite', aprovacao: false, frentes: [
        frente('instrucao', 'Instrução do processo', 'inicio', 'pasta', 'Instrução do processo', [passo('o1', 'Instruir o processo', 7, 'antes', 'limite')]),
      ] },
    ],
  }); A.atualizarModelos(r); return r; };

  /* Acha o tipo pelo nome que vem da planilha */
  A.tipoPorNome = (perfilId, nome) => {
    const tipos = A.regras(perfilId).tipos, n = A.semAcento(nome);
    return tipos.find(t => A.semAcento(t.nome) === n)
      || tipos.find(t => n && (A.semAcento(t.nome).includes(n) || n.includes(A.semAcento(t.nome))))
      || (/(exonera)/.test(n) && tipos.find(t => t.id === 'exoneracao'))
      || tipos.find(t => t.id === 'outro') || tipos[0];
  };

  /* Leva as regras novas para os processos em andamento: passos novos entram, prazos não editados à mão são atualizados */
  /* Leva o modelo para os processos em andamento daquele tipo (na equipe: de todo mundo).
     Passos novos entram; prazos e nomes não mexidos à mão se atualizam; passos que saíram do modelo
     somem só se ainda estavam abertos e ninguém mexeu neles. Nada que foi feito é desmarcado. */
  A.aplicarRegras = (perfilId, tipoId) => {
    const tipo = A.regras(perfilId).tipos.find(t => t.id === tipoId);
    if (!tipo) return { procs: 0, novos: 0, prazos: 0, tirados: 0 };
    let procs = 0, novos = 0, prazos = 0, tirados = 0;
    const alvo = A.semPlanilha() ? A.estado.processos : A.estado.processos.filter(p => p.dono === perfilId);
    alvo.filter(p => p.tipoId === tipoId && !p.arquivado).forEach(proc => {
      let mexeu = false;
      tipo.frentes.forEach(fm => {
        let f = proc.frentes.find(x => x.modeloId === fm.id);
        if (!f) {
          if (fm.sob) return; // grupo que só entra quando pedem
          f = { id: 'f' + A.uid(), modeloId: fm.id, nome: fm.nome, fase: fm.fase, icone: fm.icone, coluna: fm.coluna, na: !!fm.naPadrao, itens: [] }; proc.frentes.push(f); mexeu = true;
        }
        for (const pm of fm.passos) {
          const i = f.itens.find(x => x.modeloId === pm.id);
          if (!i) { const novo = A.itemDoModelo(pm); A.ajustarPublico(proc, novo); f.itens.push(novo); novos++; mexeu = true; continue; }
          i.quem = pm.quem || 'faz'; i.obrig = !!pm.obrig; i.depAut = !!pm.depAut; if (pm.setor) i.setor = pm.setor;
          const regra = { dias: +pm.dias, quando: pm.quando, ref: pm.ref, ...(pm.semPrazo ? { semPrazo: true } : {}) };
          if (!i.editado && (JSON.stringify(i.regra) !== JSON.stringify(regra) || i.nome !== pm.nome)) { i.regra = regra; i.nome = pm.nome; prazos++; mexeu = true; }
        }
        const ids = new Set(fm.passos.map(p => p.id));
        const antes = f.itens.length;
        f.itens = f.itens.filter(i => !i.modeloId || ids.has(i.modeloId) || i.estado !== 'aberta' || i.editado || A.despachoAberto(proc, i));
        if (f.itens.length !== antes) { tirados += antes - f.itens.length; mexeu = true; }
      });
      if (mexeu) { procs++; proc.atualizadoEm = new Date().toISOString(); A.anotar(proc, 'Sistema', 'Checklist atualizado pelas Regras de prazo.'); }
    });
    return { procs, novos, prazos, tirados };
  };

  /* ================= Tela: Regras de prazo ================= */
  let tipoSel = null, ultima = null;
  const FASES_OP = () => A.FASES.filter(f => f.id !== 'evento');
  const ICONES_OP = { pasta: 'Pasta', moeda: 'Dinheiro', contrato: 'Contrato', aviao: 'Viagem', predio: 'Local', megafone: 'Comunicação', certificado: 'Certificado', arquivo: 'Arquivo', pessoa: 'Pessoa', lista: 'Lista' };

  /* A régua: todos os prazos do tipo em ordem, do mais cedo ao mais tarde, com o dia do evento no meio */
  function reguaHTML(tipo, dis) {
    const ev = tipo.ref === 'evento';
    const todas = tipo.frentes.flatMap((f, fi) => f.passos.map((p, pi) => ({ f, fi, p, pi, off: p.ref === 'entrada' ? -999 : (p.quando === 'antes' ? -1 : 1) * (+p.dias || 0) + (p.ref === 'fim' ? 0.5 : 0) })));
    const semPrazo = todas.filter(x => x.p.semPrazo), linhas = todas.filter(x => !x.p.semPrazo).sort((a, b) => a.off - b.off);
    const tagsExtras = x => `${x.p.para ? `<span class="tag">só ${x.p.para}</span>` : ''}${x.p.depAut ? '<span class="tag">depende de autorização</span>' : ''}${x.f.sob ? '<span class="tag">só quando pedir</span>' : ''}`;
    const linha = x => `<li class="rg-l${x.p.quem === 'acompanha' ? ' acomp' : ''}${x.p.obrig ? ' obrig' : ''}">
        <span class="rg-d"><input class="cel numero" type="number" min="0" max="365" data-k="p:${x.fi}:${x.pi}:dias" value="${x.p.dias}" aria-label="Dias para ${A.esc(x.p.nome)}" ${dis}>
          <select class="cel" data-k="p:${x.fi}:${x.pi}:quando" aria-label="Antes ou depois" ${dis}><option value="antes" ${x.p.quando === 'antes' ? 'selected' : ''}>antes</option><option value="depois" ${x.p.quando === 'depois' ? 'selected' : ''}>depois</option></select></span>
        <span class="rg-n">${A.esc(x.p.nome)}<small>${A.esc(x.f.nome)}${x.p.ref === 'fim' ? ' · conta do fim' : x.p.ref === 'entrada' ? ' · conta da chegada ao setor' : ''}</small></span>
        <span class="rg-tags">${x.p.quem === 'acompanha' ? `<span class="tag tag-marco">acompanhar${x.p.setor ? ' · ' + A.esc(x.p.setor) : ''}</span>` : '<span class="tag tag-faz">você faz</span>'}${x.p.obrig ? '<span class="tag tag-obrig">obrigatório</span>' : ''}${tagsExtras(x)}</span></li>`;
    const antes = linhas.filter(x => x.off < 0), depois = linhas.filter(x => x.off >= 0);
    return `<section class="regua-prazos" aria-labelledby="rg-regua">
      <div class="rg-topo"><h2 id="rg-regua">Os prazos, em ordem</h2><p class="secundario">Mude os dias aqui mesmo: salva sozinho. Em azul o que você faz; em cinza o que você só acompanha.</p></div>
      ${semPrazo.length ? `<p class="rg-sem"><strong>Sem prazo</strong> (checklist do Início)</p><ul class="rg-sem-lista">${semPrazo.map(x => `<li><span class="rg-n">${A.esc(x.p.nome)}<small>${A.esc(x.f.nome)}</small></span><span class="rg-tags">${x.p.quem === 'acompanha' ? '<span class="tag tag-marco">acompanhar</span>' : '<span class="tag tag-faz">você faz</span>'}${tagsExtras(x)}</span></li>`).join('')}</ul>` : ''}
      <ol class="rg-lista">${antes.map(linha).join('')}
        <li class="rg-dia" aria-label="${ev ? 'Dia do evento' : 'Data limite'}"><span>${ev ? 'Dia do evento' : 'Data limite'}</span></li>
        ${depois.map(linha).join('')}</ol>
    </section>`;
  }

  A.telaRegras = vista => {
    const equipe = A.semPlanilha();
    const reg = A.regras(), pode = equipe ? !!(A.nuvem && A.nuvem.admin) : A.podeEditar() && A.sessao.acesso === 'dono';
    if (!tipoSel || !reg.tipos.find(t => t.id === tipoSel)) tipoSel = reg.tipos[0].id;
    const tipo = reg.tipos.find(t => t.id === tipoSel);
    const usados = (A.semPlanilha() ? A.estado.processos : A.meus()).filter(p => p.tipoId === tipo.id && !p.arquivado).length;
    const dis = pode ? '' : 'disabled';
    const refsOp = tipo.ref === 'evento' ? [['inicio', 'início do evento'], ['fim', 'fim do evento'], ['entrada', 'entrada no setor']] : [['limite', 'data limite'], ['entrada', 'entrada no setor']];
    vista.innerHTML = `<main>
      <div class="cabeca"><div><h1>Regras de prazo</h1><p class="secundario" style="margin-top:6px;max-width:64ch">Para cada tipo de processo: quais frentes existem, que passos cada uma tem e quantos dias antes ou depois da data de referência cada passo vence. Quando um processo é criado ou vem da planilha, ele recebe estes passos.</p></div>
        <div class="salvo-barra" role="status">${A.ic('feito')}${ultima ? `Salvo. Última mudança: ${A.esc(ultima.desc)}. <button type="button" class="btn-texto" id="rgDesfazer">Desfazer</button>` : 'Tudo salvo sozinho.'}</div></div>
      ${pode ? '' : `<p class="aviso-suave" style="margin-top:16px">${A.ic('olho')} ${equipe ? 'Os tipos e as regras valem para toda a equipe. Só a administração muda; no seu processo você pode acrescentar ou tirar itens.' : 'Só a pessoa dona do painel muda as regras.'}</p>`}
      <div class="regras-layout">
        <nav aria-label="Tipos de processo"><ul class="tipos-lista">
          ${reg.tipos.filter(t => !t.oculto).map(t => `<li><button type="button" data-tipo="${t.id}" ${t.id === tipoSel ? 'aria-current="true"' : ''}><span class="t">${A.esc(t.nome)}</span><span class="d">${(n => `${n} passo${n === 1 ? '' : 's'}`)(t.frentes.reduce((n, f) => n + f.passos.length, 0))} · ${t.ref === 'evento' ? 'conta do evento' : 'conta da data limite'}</span></button></li>`).join('')}
          ${reg.tipos.some(t => t.oculto) ? `<li class="antigos"><details ${reg.tipos.find(t => t.id === tipoSel && t.oculto) ? 'open' : ''}><summary>Tipos antigos <small>(só para processos já cadastrados)</small></summary><ul>${reg.tipos.filter(t => t.oculto).map(t => `<li><button type="button" data-tipo="${t.id}" ${t.id === tipoSel ? 'aria-current="true"' : ''}><span class="t">${A.esc(t.nome)}</span><span class="d">${t.grupo === 'externo' ? 'aparece como Evento externo' : 'aparece como Evento interno'}</span></button></li>`).join('')}</ul></details></li>` : ''}
          ${pode ? `<li class="novo"><button type="button" id="rgNovoTipo"><span class="t" style="color:var(--caneta)">${A.ic('mais', 'ic-sm')} Novo tipo</span></button></li>` : ''}
        </ul></nav>
        <div id="rgCorpo">
          <section class="bloco" aria-labelledby="rg-t">
            <div class="grade-campos">
              <div class="campo"><label for="rgNome">Nome do tipo <small>(igual ao da planilha)</small></label><input id="rgNome" class="cel" data-k="tipo:nome" value="${A.esc(tipo.nome)}" ${dis}></div>
              <div class="campo"><label for="rgRef">Os prazos contam a partir</label><select id="rgRef" class="cel" data-k="tipo:ref" ${dis}><option value="evento" ${tipo.ref === 'evento' ? 'selected' : ''}>das datas do evento</option><option value="limite" ${tipo.ref === 'limite' ? 'selected' : ''}>da data limite</option></select></div>
              <div class="campo"><label for="rgAprov">Pergunta "estava previsto no plano?"</label><select id="rgAprov" class="cel" data-k="tipo:aprovacao" ${dis}><option value="sim" ${tipo.aprovacao ? 'selected' : ''}>Sim, pode precisar de aprovação</option><option value="nao" ${tipo.aprovacao ? '' : 'selected'}>Não perguntar</option></select></div>
            </div>
            <h2 id="rg-t" class="sr">Frentes e passos de ${A.esc(tipo.nome)}</h2>
          </section>
          ${reguaHTML(tipo, dis)}
          <details class="rg-editar"${A.prefs().rgEditarAberto ? ' open' : ''}><summary>Editar grupos e passos: nomes, ordem, quem faz, obrigatório</summary>
          ${tipo.frentes.map((f, fi) => {
            const [c, bg] = A.ICONES[f.icone] || A.ICONES.lista;
            return `<section class="regra-frente" style="margin-top:12px" aria-label="Frente ${A.esc(f.nome)}">
              <div class="regra-frente-topo"><span class="ico-f" style="--c:${c};--cbg:${bg}">${A.ic('f-' + f.icone)}</span>
                <label class="sr" for="rf-${fi}">Nome da frente</label><input id="rf-${fi}" class="cel" data-k="f:${fi}:nome" value="${A.esc(f.nome)}" ${dis}>
                <span style="display:flex;gap:2px">${pode ? `<button type="button" class="btn-icone" data-mover-f="${fi}:-1" ${fi === 0 ? 'disabled' : ''} aria-label="Subir a frente ${A.esc(f.nome)}">${A.ic('cima')}</button><button type="button" class="btn-icone" data-mover-f="${fi}:1" ${fi === tipo.frentes.length - 1 ? 'disabled' : ''} aria-label="Descer a frente ${A.esc(f.nome)}">${A.ic('baixo')}</button><button type="button" class="btn-icone" data-tirar-f="${fi}" aria-label="Tirar a frente ${A.esc(f.nome)}">${A.ic('lixo')}</button>` : ''}</span></div>
              <div class="regra-frente-opcoes">
                <label>Fase <select data-k="f:${fi}:fase" ${dis}>${FASES_OP().map(x => `<option value="${x.id}" ${f.fase === x.id ? 'selected' : ''}>${x.n}</option>`).join('')}</select></label>
                <label>Coluna da planilha <select data-k="f:${fi}:coluna" ${dis}><option value="">Nenhuma (só no meu controle)</option>${A.COLUNAS.map(col => `<option ${f.coluna === col ? 'selected' : ''}>${col}</option>`).join('')}</select></label>
                <label>Ícone <select data-k="f:${fi}:icone" ${dis}>${Object.entries(ICONES_OP).map(([k, n]) => `<option value="${k}" ${f.icone === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
                <label class="chave"><input type="checkbox" data-k="f:${fi}:naPadrao" ${f.naPadrao ? 'checked' : ''} ${dis}> Começa como "não se aplica"</label>
                <label class="chave"><input type="checkbox" data-k="f:${fi}:sob" ${f.sob ? 'checked' : ''} ${dis}> Só entra quando pedir (botão no processo)</label>
              </div>
              <div class="passo-regra cabec" aria-hidden="true"><span>Passo</span><span>Dias</span><span>Antes ou depois</span><span>De quê</span><span>Quem</span><span></span></div>
              ${f.passos.map((p, pi) => `<div class="passo-regra">
                <input class="cel" data-k="p:${fi}:${pi}:nome" value="${A.esc(p.nome)}" aria-label="Nome do passo" ${dis}>
                <input class="cel numero" type="number" min="0" max="365" data-k="p:${fi}:${pi}:dias" value="${p.dias}" aria-label="Dias para ${A.esc(p.nome)}" ${dis}>
                <select class="cel" data-k="p:${fi}:${pi}:quando" aria-label="Antes ou depois" ${dis}><option value="antes" ${p.quando === 'antes' ? 'selected' : ''}>antes</option><option value="depois" ${p.quando === 'depois' ? 'selected' : ''}>depois</option></select>
                <select class="cel col-ref" data-k="p:${fi}:${pi}:ref" aria-label="A partir de" ${dis}>${refsOp.map(([v, n]) => `<option value="${v}" ${p.ref === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
                <span class="rg-quem"><select class="cel" data-k="p:${fi}:${pi}:quem" aria-label="Quem faz ${A.esc(p.nome)}" ${dis}><option value="faz" ${p.quem !== 'acompanha' ? 'selected' : ''}>você faz</option><option value="acompanha" ${p.quem === 'acompanha' ? 'selected' : ''}>acompanha</option></select>
                  <label class="chave"><input type="checkbox" data-k="p:${fi}:${pi}:obrig" ${p.obrig ? 'checked' : ''} ${dis}> obrigatório</label>
                  <label class="chave"><input type="checkbox" data-k="p:${fi}:${pi}:semPrazo" ${p.semPrazo ? 'checked' : ''} ${dis}> sem prazo</label>
                  <label class="chave"><input type="checkbox" data-k="p:${fi}:${pi}:depAut" ${p.depAut ? 'checked' : ''} ${dis}> depende de autorização</label>
                  <select class="cel" data-k="p:${fi}:${pi}:para" aria-label="Para quem vale ${A.esc(p.nome)}" ${dis}><option value="" ${!p.para ? 'selected' : ''}>todos</option><option value="servidores" ${p.para === 'servidores' ? 'selected' : ''}>só servidores</option><option value="membros" ${p.para === 'membros' ? 'selected' : ''}>só membros</option></select></span>
                ${pode ? `<button type="button" class="btn-icone" data-tirar-p="${fi}:${pi}" aria-label="Tirar o passo ${A.esc(p.nome)}">${A.ic('lixo')}</button>` : '<span></span>'}
              </div>`).join('')}
              ${pode ? `<button type="button" class="btn-texto" data-novo-p="${fi}" style="margin-top:6px">${A.ic('mais', 'ic-sm')}Adicionar passo</button>` : ''}
            </section>`;
          }).join('')}
          ${pode ? `<div class="form-botoes" style="margin-top:12px"><button type="button" class="btn" id="rgNovaFrente">${A.ic('mais')}Adicionar frente</button></div>` : ''}
          </details>

          <section class="bloco" style="margin-top:24px" aria-labelledby="rg-aplicar">
            <h2 id="rg-aplicar" style="font-size:18px">Processos em andamento</h2>
            <p class="secundario" style="margin:6px 0 12px;max-width:64ch">Toda mudança aqui vai sozinha para os ${usados} processo${usados === 1 ? '' : 's'} de ${A.esc(tipo.nome)} em andamento${equipe ? ', de toda a equipe' : ''}: itens novos entram, prazos não mexidos à mão se atualizam e itens tirados somem só se ainda estavam abertos. Nada que foi feito é desmarcado.</p>
            <div hidden>
            <p hidden>Processos novos já recebem estas regras. Os ${usados} processo${usados === 1 ? '' : 's'} de ${A.esc(tipo.nome)} em andamento só mudam se você pedir: passos novos entram e os prazos que você não mudou à mão são atualizados. Nada que já foi feito é desmarcado.</p>
            <div class="form-botoes"><button type="button" class="btn btn-primario" id="rgAplicar" ${pode && usados ? '' : 'disabled'}>${A.ic('atualizar')}Atualizar ${usados} processo${usados === 1 ? '' : 's'}</button>
            </div>
            ${pode ? `<button type="button" class="btn" id="rgPadrao">${A.ic('desfazer')}Voltar este tipo ao modelo inicial</button>${tipo.id.startsWith('t') ? `<button type="button" class="btn-texto btn-perigo" id="rgTirarTipo">${A.ic('lixo', 'ic-sm')}Tirar este tipo</button>` : ''}` : ''}</div>
          </section>

          <section class="bloco" style="margin-top:16px" aria-labelledby="rg-cores">
            <h2 id="rg-cores" style="font-size:18px">Quando cada cor aparece</h2>
            <p class="secundario" style="margin:6px 0 12px">Vale para todos os tipos.</p>
            <div class="limites">
              <label class="limite">${A.seloSit('critico')}<span>evento em até <input class="cel numero" type="number" min="1" max="60" data-k="lim:critico" value="${reg.limites.critico}" ${dis}> dias, com algo faltando</span></label>
              <label class="limite">${A.seloSit('atencao')}<span>evento em até <input class="cel numero" type="number" min="1" max="90" data-k="lim:atencao" value="${reg.limites.atencao}" ${dis}> dias, com algo faltando</span></label>
              <label class="limite">${A.seloSit('atencao')}<span>ou uma tarefa vence em até <input class="cel numero" type="number" min="0" max="30" data-k="lim:vencendo" value="${reg.limites.vencendo}" ${dis}> dias</span></label>
            </div>
          </section>
        </div>
      </div>
    </main>`;

    const corpo = vista.querySelector('#rgCorpo');
    const ed = corpo.querySelector('.rg-editar'); if (ed) ed.ontoggle = () => { A.prefs().rgEditarAberto = ed.open; A.salvar(); };
    vista.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { tipoSel = b.dataset.tipo; ultima = null; A.mudar(A.redesenhar); });
    if (!pode) return;
    let tLevar;
    const levar = () => { clearTimeout(tLevar); tLevar = setTimeout(() => {
      const r = A.aplicarRegras(A.sessao.perfilId, tipo.id);
      if (r.procs) { A.salvar(); A.avisar(`${r.procs} processo${r.procs > 1 ? 's' : ''} em andamento atualizado${r.procs > 1 ? 's' : ''}.`); }
    }, 1200); };
    const mudou = (desc, desfazer) => { ultima = { desc, desfazer }; A.salvar(); levar(); A.comFoco(A.redesenhar); };
    corpo.onchange = e => {
      const k = e.target.dataset.k; if (!k) return;
      const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      const partes = k.split(':');
      if (partes[0] === 'tipo') {
        const campo = partes[1], antes = tipo[campo];
        if (campo === 'nome' && !String(v).trim()) { e.target.value = antes; return A.avisar('O nome do tipo não pode ficar em branco.'); }
        tipo[campo] = campo === 'aprovacao' ? v === 'sim' : campo === 'nome' ? String(v).trim() : v;
        if (campo === 'ref') tipo.frentes.forEach(f => f.passos.forEach(p => { p.ref = v === 'evento' ? (p.quando === 'depois' ? 'fim' : 'inicio') : (p.ref === 'entrada' ? 'entrada' : 'limite'); }));
        return mudou(`tipo ${tipo.nome}`, () => { tipo[campo] = antes; });
      }
      if (partes[0] === 'lim') {
        const n = parseInt(v, 10), antes = reg.limites[partes[1]];
        if (isNaN(n) || n < 0) { e.target.value = antes; return A.avisar('Use um número de dias.'); }
        reg.limites[partes[1]] = n;
        return mudou('limites das cores', () => { reg.limites[partes[1]] = antes; });
      }
      if (partes[0] === 'f') {
        const f = tipo.frentes[+partes[1]], campo = partes[2], antes = f[campo];
        if (campo === 'nome' && !String(v).trim()) { e.target.value = antes; return A.avisar('A frente precisa de um nome.'); }
        f[campo] = campo === 'coluna' ? (v || null) : campo === 'nome' ? String(v).trim() : v;
        return mudou(`frente ${f.nome}`, () => { f[campo] = antes; });
      }
      if (partes[0] === 'p') {
        const f = tipo.frentes[+partes[1]], p = f.passos[+partes[2]], campo = partes[3], antes = p[campo];
        let novo = v;
        if (campo === 'nome' && !String(v).trim()) { e.target.value = antes; return A.avisar('O passo precisa de um nome.'); }
        if (campo === 'dias') { novo = parseInt(v, 10); if (isNaN(novo) || novo < 0) { e.target.value = antes; return A.avisar('Use um número de dias, de 0 para cima.'); } }
        if (campo === 'coluna') novo = v || null;
        if (campo === 'para') novo = v || undefined;
        p[campo] = campo === 'nome' ? String(novo).trim() : novo;
        return mudou(`passo "${p.nome}": ${A.regraTexto(p)}`, () => { p[campo] = antes; });
      }
    };
    corpo.querySelectorAll('[data-novo-p]').forEach(b => b.onclick = () => {
      const f = tipo.frentes[+b.dataset.novoP];
      const novo = { id: 'p' + A.uid(), nome: 'Novo passo', dias: 7, quando: 'antes', ref: tipo.ref === 'evento' ? 'inicio' : 'limite', coluna: null };
      f.passos.push(novo);
      mudou(`passo novo em ${f.nome}`, () => { f.passos = f.passos.filter(x => x !== novo); });
      const c = document.querySelector(`[data-k="p:${b.dataset.novoP}:${f.passos.length - 1}:nome"]`); if (c) { c.focus(); c.select(); }
    });
    corpo.querySelectorAll('[data-tirar-p]').forEach(b => b.onclick = () => {
      const [fi, pi] = b.dataset.tirarP.split(':').map(Number), f = tipo.frentes[fi], p = f.passos[pi];
      f.passos.splice(pi, 1);
      ultima = { desc: `passo "${p.nome}" tirado`, desfazer: () => f.passos.splice(pi, 0, p) };
      A.salvar(); A.mudar(A.redesenhar);
    });
    corpo.querySelectorAll('[data-tirar-f]').forEach(b => b.onclick = () => {
      const fi = +b.dataset.tirarF, f = tipo.frentes[fi];
      tipo.frentes.splice(fi, 1);
      ultima = { desc: `frente "${f.nome}" tirada`, desfazer: () => tipo.frentes.splice(fi, 0, f) };
      A.salvar(); A.mudar(A.redesenhar);
    });
    corpo.querySelectorAll('[data-mover-f]').forEach(b => b.onclick = () => {
      const [fi, dir] = b.dataset.moverF.split(':').map(Number), j = fi + dir;
      [tipo.frentes[fi], tipo.frentes[j]] = [tipo.frentes[j], tipo.frentes[fi]];
      ultima = { desc: 'ordem das frentes', desfazer: () => { [tipo.frentes[fi], tipo.frentes[j]] = [tipo.frentes[j], tipo.frentes[fi]]; } };
      A.salvar(); A.mudar(A.redesenhar);
    });
    const nf = corpo.querySelector('#rgNovaFrente');
    if (nf) nf.onclick = () => {
      const f = { id: 'fr' + A.uid(), nome: 'Nova frente', fase: 'prep', icone: 'lista', coluna: null, naPadrao: false, passos: [] };
      tipo.frentes.push(f);
      ultima = { desc: 'frente nova', desfazer: () => { tipo.frentes = tipo.frentes.filter(x => x !== f); } };
      A.salvar(); A.redesenhar();
      const c = document.getElementById('rf-' + (tipo.frentes.length - 1)); if (c) { c.focus(); c.select(); }
    };
    const apl = corpo.querySelector('#rgAplicar');
    if (apl) apl.onclick = () => {
      const antes = A.clonar(A.estado.processos);
      const r = A.aplicarRegras(A.sessao.perfilId, tipo.id);
      A.salvar(); A.redesenhar();
      A.avisar(r.procs ? `${r.procs} processo${r.procs > 1 ? 's' : ''} atualizado${r.procs > 1 ? 's' : ''}: ${r.novos} passo${r.novos === 1 ? '' : 's'} novo${r.novos === 1 ? '' : 's'}, ${r.prazos} prazo${r.prazos === 1 ? '' : 's'} ajustado${r.prazos === 1 ? '' : 's'}.` : 'Os processos já estavam com estas regras.', r.procs ? () => { A.estado.processos = antes; } : null);
    };
    const pad = corpo.querySelector('#rgPadrao');
    if (pad) pad.onclick = () => {
      const modelo = A.regrasPadrao().tipos.find(t => t.id === tipo.id);
      if (!modelo) return A.avisar('Este tipo foi criado por você; não tem modelo inicial.');
      const pos = reg.tipos.indexOf(tipo), antes = reg.tipos[pos];
      reg.tipos[pos] = modelo;
      ultima = { desc: `${tipo.nome} voltou ao modelo inicial`, desfazer: () => { reg.tipos[pos] = antes; } };
      A.salvar(); A.mudar(A.redesenhar);
    };
    const tt = corpo.querySelector('#rgTirarTipo');
    if (tt) tt.onclick = () => {
      if (usados) return A.avisar(`Há ${usados} processo${usados > 1 ? 's' : ''} deste tipo. Mude o tipo deles antes de tirar.`);
      const pos = reg.tipos.indexOf(tipo);
      reg.tipos.splice(pos, 1); tipoSel = null;
      ultima = { desc: `tipo ${tipo.nome} tirado`, desfazer: () => { reg.tipos.splice(pos, 0, tipo); tipoSel = tipo.id; } };
      A.salvar(); A.mudar(A.redesenhar);
    };
    const nt = vista.querySelector('#rgNovoTipo');
    if (nt) nt.onclick = () => {
      const t = { id: 't' + A.uid(), nome: 'Novo tipo', ref: 'limite', aprovacao: false, frentes: [frente('instrucao', 'Instrução do processo', 'inicio', 'pasta', 'Instrução do processo', [passo('p' + A.uid(), 'Instruir o processo', 7, 'antes', 'limite')])] };
      reg.tipos.push(t); tipoSel = t.id;
      ultima = { desc: 'tipo novo', desfazer: () => { reg.tipos = reg.tipos.filter(x => x !== t); tipoSel = null; } };
      A.salvar(); A.redesenhar();
      const c = document.getElementById('rgNome'); if (c) { c.focus(); c.select(); }
    };
    const desf = vista.querySelector('#rgDesfazer');
    if (desf) desf.onclick = () => { const u = ultima; ultima = null; u.desfazer(); A.salvar(); A.mudar(A.redesenhar); A.avisar('Desfeito.'); };
  };
})(window.App);
