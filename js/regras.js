/* Regras de prazo: os modelos de cada tipo de processo e a tela para editá-los.
   As regras são de cada perfil. Os valores abaixo são o ponto de partida, para ajustar aos poucos. */
(function (A) {
  const passo = (id, nome, dias, quando, ref, coluna) => ({ id, nome, dias, quando, ref, coluna: coluna || null });
  const frente = (id, nome, fase, icone, coluna, passos, naPadrao) => ({ id, nome, fase, icone, coluna: coluna || null, naPadrao: !!naPadrao, passos });

  A.regrasPadrao = () => A.clonar({
    versaoModelo: 1,
    limites: { critico: 7, atencao: 15, vencendo: 3 },
    tipos: [
      { id: 'curso', nome: 'Curso/Evento', ref: 'evento', aprovacao: true, frentes: [
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
          passo('c8', 'Conferir o contrato assinado', 15, 'antes', 'inicio')]),
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
        frente('encerramento', 'Lançamentos finais', 'fim', 'arquivo', null, [
          passo('c21', 'Lançar no FUNDIMPER', 25, 'depois', 'fim', 'FUNDIMPER'),
          passo('c22', 'Lançar no THEMA', 30, 'depois', 'fim', 'THEMA')]),
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
  });

  /* Acha o tipo pelo nome que vem da planilha */
  A.tipoPorNome = (perfilId, nome) => {
    const tipos = A.regras(perfilId).tipos, n = A.semAcento(nome);
    return tipos.find(t => A.semAcento(t.nome) === n)
      || tipos.find(t => n && (A.semAcento(t.nome).includes(n) || n.includes(A.semAcento(t.nome))))
      || (/(exonera)/.test(n) && tipos.find(t => t.id === 'exoneracao'))
      || tipos.find(t => t.id === 'outro') || tipos[0];
  };

  /* Leva as regras novas para os processos em andamento: passos novos entram, prazos não editados à mão são atualizados */
  A.aplicarRegras = (perfilId, tipoId) => {
    const tipo = A.regras(perfilId).tipos.find(t => t.id === tipoId);
    let procs = 0, novos = 0, prazos = 0;
    A.estado.processos.filter(p => p.dono === perfilId && p.tipoId === tipoId && !p.arquivado).forEach(proc => {
      let mexeu = false;
      tipo.frentes.forEach(fm => {
        let f = proc.frentes.find(x => x.modeloId === fm.id);
        if (!f) { f = { id: 'f' + A.uid(), modeloId: fm.id, nome: fm.nome, fase: fm.fase, icone: fm.icone, coluna: fm.coluna, na: !!fm.naPadrao, itens: [] }; proc.frentes.push(f); mexeu = true; }
        fm.passos.forEach(pm => {
          const i = f.itens.find(x => x.modeloId === pm.id);
          if (!i) { f.itens.push({ id: 'i' + A.uid(), modeloId: pm.id, nome: pm.nome, regra: { dias: +pm.dias, quando: pm.quando, ref: pm.ref }, estado: 'aberta', coluna: pm.coluna, na: false, editado: false }); novos++; mexeu = true; }
          else if (!i.editado && (i.regra.dias !== +pm.dias || i.regra.quando !== pm.quando || i.regra.ref !== pm.ref || i.nome !== pm.nome)) {
            i.regra = { dias: +pm.dias, quando: pm.quando, ref: pm.ref }; i.nome = pm.nome; prazos++; mexeu = true;
          }
        });
      });
      if (mexeu) { procs++; A.anotar(proc, 'Sistema', 'Regras de prazo atualizadas.'); }
    });
    return { procs, novos, prazos };
  };

  /* ================= Tela: Regras de prazo ================= */
  let tipoSel = null, ultima = null;
  const FASES_OP = () => A.FASES.filter(f => f.id !== 'evento');
  const ICONES_OP = { pasta: 'Pasta', moeda: 'Dinheiro', contrato: 'Contrato', aviao: 'Viagem', predio: 'Local', megafone: 'Comunicação', certificado: 'Certificado', arquivo: 'Arquivo', pessoa: 'Pessoa', lista: 'Lista' };

  A.telaRegras = vista => {
    const reg = A.regras(), pode = A.podeEditar() && A.sessao.acesso === 'dono';
    if (!tipoSel || !reg.tipos.find(t => t.id === tipoSel)) tipoSel = reg.tipos[0].id;
    const tipo = reg.tipos.find(t => t.id === tipoSel);
    const usados = A.meus().filter(p => p.tipoId === tipo.id && !p.arquivado).length;
    const dis = pode ? '' : 'disabled';
    const refsOp = tipo.ref === 'evento' ? [['inicio', 'início do evento'], ['fim', 'fim do evento'], ['entrada', 'entrada no setor']] : [['limite', 'data limite'], ['entrada', 'entrada no setor']];
    vista.innerHTML = `<main>
      <div class="cabeca"><div><h1>Regras de prazo</h1><p class="secundario" style="margin-top:6px;max-width:64ch">Para cada tipo de processo: quais frentes existem, que passos cada uma tem e quantos dias antes ou depois da data de referência cada passo vence. Quando um processo é criado ou vem da planilha, ele recebe estes passos.</p></div>
        <div class="salvo-barra" role="status">${A.ic('feito')}${ultima ? `Salvo. Última mudança: ${A.esc(ultima.desc)}. <button type="button" class="btn-texto" id="rgDesfazer">Desfazer</button>` : 'Tudo salvo sozinho.'}</div></div>
      ${pode ? '' : `<p class="aviso-suave" style="margin-top:16px">${A.ic('olho')} Só a pessoa dona do painel muda as regras.</p>`}
      <div class="regras-layout">
        <nav aria-label="Tipos de processo"><ul class="tipos-lista">
          ${reg.tipos.map(t => `<li><button type="button" data-tipo="${t.id}" ${t.id === tipoSel ? 'aria-current="true"' : ''}><span class="t">${A.esc(t.nome)}</span><span class="d">${(n => `${n} passo${n === 1 ? '' : 's'}`)(t.frentes.reduce((n, f) => n + f.passos.length, 0))} · ${t.ref === 'evento' ? 'conta do evento' : 'conta da data limite'}</span></button></li>`).join('')}
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
              </div>
              <div class="passo-regra cabec" aria-hidden="true"><span>Passo</span><span>Dias</span><span>Antes ou depois</span><span>De quê</span><span>Coluna própria</span><span></span></div>
              ${f.passos.map((p, pi) => `<div class="passo-regra">
                <input class="cel" data-k="p:${fi}:${pi}:nome" value="${A.esc(p.nome)}" aria-label="Nome do passo" ${dis}>
                <input class="cel numero" type="number" min="0" max="365" data-k="p:${fi}:${pi}:dias" value="${p.dias}" aria-label="Dias para ${A.esc(p.nome)}" ${dis}>
                <select class="cel" data-k="p:${fi}:${pi}:quando" aria-label="Antes ou depois" ${dis}><option value="antes" ${p.quando === 'antes' ? 'selected' : ''}>antes</option><option value="depois" ${p.quando === 'depois' ? 'selected' : ''}>depois</option></select>
                <select class="cel col-ref" data-k="p:${fi}:${pi}:ref" aria-label="A partir de" ${dis}>${refsOp.map(([v, n]) => `<option value="${v}" ${p.ref === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
                <select class="cel col-col" data-k="p:${fi}:${pi}:coluna" aria-label="Coluna própria na planilha" ${dis}><option value="">a da frente</option>${A.COLUNAS.map(col => `<option ${p.coluna === col ? 'selected' : ''}>${col}</option>`).join('')}</select>
                ${pode ? `<button type="button" class="btn-icone" data-tirar-p="${fi}:${pi}" aria-label="Tirar o passo ${A.esc(p.nome)}">${A.ic('lixo')}</button>` : '<span></span>'}
              </div>`).join('')}
              ${pode ? `<button type="button" class="btn-texto" data-novo-p="${fi}" style="margin-top:6px">${A.ic('mais', 'ic-sm')}Adicionar passo</button>` : ''}
            </section>`;
          }).join('')}
          ${pode ? `<div class="form-botoes" style="margin-top:12px"><button type="button" class="btn" id="rgNovaFrente">${A.ic('mais')}Adicionar frente</button></div>` : ''}

          <section class="bloco" style="margin-top:24px" aria-labelledby="rg-aplicar">
            <h2 id="rg-aplicar" style="font-size:18px">Levar para os processos em andamento</h2>
            <p class="secundario" style="margin:6px 0 12px;max-width:64ch">Processos novos já recebem estas regras. Os ${usados} processo${usados === 1 ? '' : 's'} de ${A.esc(tipo.nome)} em andamento só mudam se você pedir: passos novos entram e os prazos que você não mudou à mão são atualizados. Nada que já foi feito é desmarcado.</p>
            <div class="form-botoes"><button type="button" class="btn btn-primario" id="rgAplicar" ${pode && usados ? '' : 'disabled'}>${A.ic('atualizar')}Atualizar ${usados} processo${usados === 1 ? '' : 's'}</button>
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
    vista.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { tipoSel = b.dataset.tipo; ultima = null; A.mudar(A.redesenhar); });
    if (!pode) return;
    const mudou = (desc, desfazer) => { ultima = { desc, desfazer }; A.salvar(); A.comFoco(A.redesenhar); };
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
