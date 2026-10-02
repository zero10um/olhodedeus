/* Início guiado: o começo do processo em etapas, uma tela por vez.
   Plano → (autorização do PGJ) → despacho ao financeiro → resposta → (DOF ou suplementação) → pronto.
   Cada etapa usa os passos e despachos normais do processo, então tudo aparece também no painel,
   em "Esperando resposta", nos avisos e no diário. */
(function (A) {
  const NOMES = {
    pgj: 'Pedir autorização ao PGJ',
    fin: 'Despachar ao setor financeiro para iniciar os trâmites',
    dof: 'Avisar a DOF sobre o remanejamento',
    sup: 'Pedir a suplementação orçamentária',
  };
  const G = p => { const g = p.guia || (p.guia = {}); g.pulos = g.pulos || {}; return g; };
  const achar = (p, nome) => p.frentes.flatMap(f => f.itens).find(i => A.semAcento(i.nome) === A.semAcento(nome));
  function garantir(p, frente, nome, dias) {
    const f = p.frentes.find(x => x.modeloId === frente) || p.frentes.find(x => x.fase === 'inicio') || p.frentes[0];
    let i = achar(p, nome);
    if (!i) { i = { id: 'i' + A.uid(), modeloId: null, nome, regra: { dias, quando: 'antes', ref: p.inicio ? 'inicio' : 'limite' }, estado: 'aberta', coluna: null, na: false, editado: true }; f.itens.push(i); }
    if (i.na) i.na = false;
    if (f.na) f.na = false;
    return i;
  }
  const desde = d => `desde ${A.fmt(d)}${A.dias(d) < 0 ? ` (${A.haDias(-A.dias(d))})` : ''}`;

  A.guiaAplica = p => { const t = A.tipo(p); return !!(t && t.aprovacao) && !p.arquivado; };

  /* As etapas que valem para este processo, e se cada uma já foi resolvida */
  A.guiaEtapas = p => {
    const g = G(p), l = [];
    l.push({ id: 'plano', t: 'Plano', feita: !!g.plano });
    if (p.previsto === false) {
      const it = achar(p, NOMES.pgj), sub = !it ? 'nada' : it.estado === 'feita' ? (g.pgj === 'indeferido' ? 'indeferido' : 'feita') : it.estado;
      l.push({ id: 'pgj', t: 'Autorização', sub, feita: sub === 'feita' || (sub === 'indeferido' && !!g.seguir) || !!g.pulos.pgj });
    }
    const f = achar(p, NOMES.fin);
    l.push({ id: 'fin', t: 'Financeiro', sub: f ? f.estado : 'nada', feita: (f && f.estado === 'feita') || !!p.financeiro || !!g.pulos.fin });
    if (!g.pulos.fin) l.push({ id: 'resposta', t: 'Resposta', feita: !!p.financeiro });
    if (p.financeiro === 'remanejar') { const d = achar(p, NOMES.dof); l.push({ id: 'dof', t: 'DOF', feita: (d && d.estado === 'feita') || !!g.pulos.dof }); }
    if (p.financeiro === 'suplementar') { const s = achar(p, NOMES.sup); l.push({ id: 'sup', t: 'Suplementação', sub: s ? s.estado : 'nada', feita: (s && s.estado === 'feita') || !!g.pulos.sup }); }
    l.push({ id: 'pronto', t: 'Pronto', feita: !!g.concluido });
    return l;
  };
  A.guiaConcluido = p => !!G(p).concluido;

  let vendo = null, procVisto = null, direcao = 1, animado = null;

  A.guiaHTML = (p, pode) => {
    if (procVisto !== p.id) { vendo = null; procVisto = p.id; }
    const ets = A.guiaEtapas(p), atual = ets.find(e => !e.feita) || ets[ets.length - 1];
    if (!vendo || !ets.some(e => e.id === vendo)) vendo = atual.id;
    const k = ets.findIndex(e => e.id === vendo), et = ets[k];
    const dis = pode ? '' : 'disabled';
    const g = G(p), feitas = ets.filter(e => e.feita).length;
    const op = (acao, titulo, desc, marcado) => `<button type="button" class="guia-op${marcado ? ' marcado' : ''}" data-g="${acao}" ${dis}><strong>${titulo}</strong>${desc ? `<small>${desc}</small>` : ''}</button>`;
    const espera = (texto, d, botoes) => `<div class="guia-espera">${A.ic('relogio')}<div><p class="guia-espera-t">${texto}</p><p class="secundario">${d ? desde(d) : ''}</p></div></div><div class="guia-botoes">${botoes}</div>`;
    let corpo = '';
    if (et.id === 'plano') corpo = `<h3>Este processo estava previsto no plano?</h3><p class="secundario">Se você não sabe agora, siga em frente e responda depois.</p>
      <div class="guia-ops">${op('plano:sim', 'Sim', 'Segue direto para o financeiro', g.plano && p.previsto === true)}${op('plano:nao', 'Não', 'Precisa da autorização do PGJ', g.plano && p.previsto === false)}${op('plano:nsei', 'Ainda não sei', 'Nada fica travado', g.plano && p.previsto == null)}</div>`;
    else if (et.id === 'pgj') {
      const it = achar(p, NOMES.pgj), d = it && A.despachoAberto(p, it);
      if (et.sub === 'esperando') corpo = `<h3>Autorização do PGJ</h3>` + espera('Esperando a resposta do PGJ', d && d.enviado, `${pode ? `<button class="btn btn-primario btn-grande" type="button" data-g="pgj:ok">${A.ic('check')} Autorizou</button><button class="btn btn-grande" type="button" data-g="pgj:nao">Indeferiu</button>` : ''}`);
      else if (et.sub === 'indeferido' && !g.seguir) corpo = `<h3>O pedido foi indeferido</h3><p class="secundario">Às vezes a unidade volta pedindo outra coisa. O que fazer agora?</p>
        <div class="guia-ops">${op('pgj:denovo', 'Pedir de novo', 'Com outra proposta')}${op('pgj:seguir', 'Seguir mesmo assim', 'Destrava as frentes')}${op('pgj:arquivar', 'Arquivar o processo', 'Ele continua em Arquivados')}</div>`;
      else if (et.sub === 'feita') corpo = `<h3>Autorizado pelo PGJ</h3><p class="secundario">As frentes da preparação estão liberadas.</p>`;
      else corpo = `<h3>Peça a autorização ao PGJ</h3><p class="secundario">Como não estava no plano, a autorização vem antes de tudo.</p>
        <div class="guia-campo"><span>De onde vem o recurso?</span><div class="segmento" role="radiogroup" aria-label="De onde vem o recurso?">${[['suplementacao', 'Suplementação'], ['remanejamento', 'Remanejamento'], ['', 'Ainda não sei']].map(([v, n]) => `<label><input type="radio" name="g-recurso" value="${v}" ${(p.recurso || '') === v ? 'checked' : ''} ${dis}><span>${n}</span></label>`).join('')}</div></div>
        <div class="guia-botoes">${pode ? `<button class="btn btn-primario btn-grande" type="button" data-g="pgj:despachei">${A.ic('enviar')} Despachei para o PGJ</button><button class="btn-texto" type="button" data-g="pular:pgj">Pular esta etapa</button>` : ''}</div>`;
    }
    else if (et.id === 'fin') {
      const it = achar(p, NOMES.fin), d = it && A.despachoAberto(p, it);
      if (et.sub === 'esperando') corpo = `<h3>Setor financeiro</h3>` + espera('Esperando a resposta do setor financeiro', d && d.enviado, pode ? `<button class="btn btn-primario btn-grande" type="button" data-g="fin:respondeu">${A.ic('check')} O financeiro respondeu</button>` : '');
      else if (et.feita) corpo = `<h3>Setor financeiro</h3><p class="secundario">${g.pulos.fin ? 'Etapa pulada: este processo não passa pelo financeiro.' : 'O financeiro já respondeu.'}</p>`;
      else corpo = `<h3>Despache ao setor financeiro</h3><p class="secundario">Para eles começarem os trâmites: estimativa e se tem dinheiro.</p>
        <div class="guia-botoes">${pode ? `<button class="btn btn-primario btn-grande" type="button" data-g="fin:despachei">${A.ic('enviar')} Despachei para o setor financeiro</button><button class="btn btn-grande" type="button" data-g="fin:jaresp">O financeiro já respondeu</button><button class="btn-texto" type="button" data-g="pular:fin">Não passa pelo financeiro</button>` : ''}</div>`;
    }
    else if (et.id === 'resposta') corpo = `<h3>O que o financeiro respondeu?</h3>
      <div class="guia-ops">${op('resp:tem', 'Tem recurso', 'Pode começar a contratação', p.financeiro === 'tem')}${op('resp:remanejar', 'Precisa remanejar', 'Tira de outro evento e avisa a DOF', p.financeiro === 'remanejar')}${op('resp:suplementar', 'Precisa suplementar', 'Pede a suplementação orçamentária', p.financeiro === 'suplementar')}</div>`;
    else if (et.id === 'dof') corpo = `<h3>Avise a DOF sobre o remanejamento</h3><p class="secundario">Basta avisar; não precisa esperar resposta.</p>
      <div class="guia-campo campo"><label for="g-remaneja">De qual evento sai o recurso? <small>(opcional)</small></label><input id="g-remaneja" value="${A.esc(g.remanejaDe || '')}" ${dis}></div>
      <div class="guia-botoes">${pode ? `<button class="btn btn-primario btn-grande" type="button" data-g="dof:avisei">${A.ic('check')} Avisei a DOF</button><button class="btn-texto" type="button" data-g="pular:dof">Pular esta etapa</button>` : ''}</div>`;
    else if (et.id === 'sup') {
      const it = achar(p, NOMES.sup), d = it && A.despachoAberto(p, it);
      if (et.sub === 'esperando') corpo = `<h3>Suplementação</h3>` + espera('Esperando a suplementação ser aprovada', d && d.enviado, pode ? `<button class="btn btn-primario btn-grande" type="button" data-g="sup:ok">${A.ic('check')} Foi aprovada</button><button class="btn btn-grande" type="button" data-g="sup:nao">Foi negada</button>` : '');
      else if (et.feita) corpo = `<h3>Suplementação aprovada</h3>`;
      else corpo = `<h3>Peça a suplementação orçamentária</h3>
        <div class="guia-botoes">${pode ? `<button class="btn btn-primario btn-grande" type="button" data-g="sup:pedi">${A.ic('enviar')} Pedi a suplementação</button><button class="btn-texto" type="button" data-g="pular:sup">Pular esta etapa</button>` : ''}</div>`;
    }
    else {
      const resumo = [
        ['Plano', p.previsto === true ? 'previsto' : p.previsto === false ? 'não previsto' : 'não informado'],
        p.previsto === false ? ['Autorização', g.pgj === 'indeferido' ? (g.seguir ? 'indeferida, seguimos assim mesmo' : 'indeferida') : ets.find(e => e.id === 'pgj').feita ? (g.pulos.pgj ? 'pulada' : 'autorizada') : 'pendente'] : null,
        p.previsto === false && p.recurso ? ['Recurso', p.recurso === 'suplementacao' ? 'suplementação' : 'remanejamento'] : null,
        ['Financeiro', g.pulos.fin ? 'não passa' : p.financeiro ? A.RESPOSTA_FIN[p.financeiro].toLowerCase() : 'sem resposta'],
        g.remanejaDe ? ['Remaneja de', g.remanejaDe] : null,
      ].filter(Boolean);
      const falta = ets.filter(e => e.id !== 'pronto' && !e.feita);
      corpo = `<h3>${falta.length ? 'Quase lá' : 'Início resolvido'}</h3>
        <dl class="guia-resumo">${resumo.map(([a, b]) => `<div><dt>${a}</dt><dd>${A.esc(b)}</dd></div>`).join('')}</dl>
        ${falta.length ? `<p class="secundario">Ainda falta: ${falta.map(e => e.t).join(', ')}. Você pode concluir assim mesmo.</p>` : ''}
        <div class="guia-botoes">${pode ? `<button class="btn btn-primario btn-grande" type="button" data-g="concluir">${g.concluido ? 'Ir para a Preparação' : 'Concluir o início e ir para a Preparação'} ${A.ic('seta-dir')}</button>` : ''}</div>`;
    }
    return `<section class="guia" aria-labelledby="guia-t">
      <div class="guia-topo"><h3 id="guia-t" class="guia-rot">Início guiado</h3><span class="secundario">${feitas} de ${ets.length} etapas</span></div>
      <ol class="guia-passos">${ets.map((e, j) => `<li class="${e.feita ? 'feita' : ''}${e.id === vendo ? ' vendo' : ''}${e.id === atual.id ? ' atual' : ''}">
        <button type="button" data-ver="${e.id}" ${j > ets.indexOf(atual) && !e.feita ? 'disabled' : ''} ${e.id === vendo ? 'aria-current="step"' : ''}><span class="guia-n">${e.feita ? A.ic('check', 'ic-sm') : j + 1}</span>${e.t}</button></li>`).join('')}</ol>
      <div class="guia-corpo" id="guiaCorpo" data-dir="${direcao}">${corpo}</div>
      <div class="guia-nav">
        ${k > 0 ? `<button class="btn" type="button" data-ver="${ets[k - 1].id}">${A.ic('anterior')} Voltar</button>` : '<span></span>'}
        ${k < ets.length - 1 && (et.feita || ets.indexOf(atual) > k) ? `<button class="btn" type="button" data-ver="${ets[k + 1].id}">Avançar ${A.ic('proximo')}</button>` : '<span></span>'}
      </div>
    </section>`;
  };

  A.guiaLigar = (el, p, ctx) => {
    const g = G(p);
    const ir = id => { const ets = A.guiaEtapas(p); direcao = ets.findIndex(e => e.id === id) >= ets.findIndex(e => e.id === vendo) ? 1 : -1; vendo = id; ctx.redesenhar(); };
    const proxima = () => { vendo = null; direcao = 1; };
    const feito = (texto, desfaz) => { A.salvar(); ctx.redesenhar(); if (texto) A.avisar(texto, desfaz ? () => { desfaz(); A.salvar(); ctx.redesenhar(); } : null); };
    el.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => ir(b.dataset.ver));
    el.querySelectorAll('[name=g-recurso]').forEach(r => r.onchange = () => { p.recurso = r.value; A.salvar(); });
    const rem = el.querySelector('#g-remaneja'); if (rem) rem.onchange = () => { g.remanejaDe = rem.value.trim(); A.salvar(); };
    el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      const [acao, v] = b.dataset.g.split(':');
      if (acao === 'plano') {
        p.previsto = v === 'sim' ? true : v === 'nao' ? false : null; g.plano = true;
        p.frentes.forEach(f => f.itens.forEach(i => { if (/prevista no plano/.test(A.semAcento(i.nome)) && !i.na) { i.estado = 'feita'; i.feitoEm = A.hojeIso(); } }));
        A.anotar(p, 'Início', v === 'sim' ? 'Estava previsto no plano.' : v === 'nao' ? 'Não estava previsto: precisa de autorização do PGJ.' : 'Previsão no plano ainda não sabida.');
        proxima(); return feito();
      }
      if (acao === 'pular') { g.pulos[v] = true; A.anotar(p, 'Início', 'Etapa pulada.'); proxima(); return feito('Etapa pulada.', () => { delete g.pulos[v]; p.diario.pop(); }); }
      if (acao === 'pgj') {
        const it = garantir(p, 'instrucao', NOMES.pgj, 55);
        if (v === 'despachei') { A.setEstado(p, it, 'esperando', 'PGJ'); A.anotar(p, 'Despacho', 'Pedido de autorização enviado ao PGJ.'); return feito('Despacho salvo. Agora esperando o PGJ.'); }
        if (v === 'ok') { A.setEstado(p, it, 'feita'); g.pgj = 'autorizado'; p.portao = [true, true, true]; A.anotar(p, 'Início', 'Autorizado pelo PGJ. Frentes liberadas.'); proxima(); return feito('Autorizado! As frentes da preparação foram liberadas.'); }
        if (v === 'nao') { A.setEstado(p, it, 'feita'); g.pgj = 'indeferido'; A.anotar(p, 'Início', 'Pedido indeferido pelo PGJ.'); return feito(); }
        if (v === 'denovo') { it.estado = 'aberta'; delete g.pgj; A.anotar(p, 'Início', 'Vai pedir a autorização de novo, com outra proposta.'); return feito(); }
        if (v === 'seguir') { g.seguir = true; p.destravado = true; A.anotar(p, 'Início', 'Indeferido, mas seguimos assim mesmo.'); proxima(); return feito(); }
        if (v === 'arquivar') { const d = A.arquivar(p); return feito('Processo arquivado.', d); }
      }
      if (acao === 'fin') {
        const it = garantir(p, 'instrucao', NOMES.fin, 50);
        if (v === 'despachei') { A.setEstado(p, it, 'esperando', 'Setor financeiro'); A.anotar(p, 'Despacho', 'Despachado ao setor financeiro para iniciar os trâmites.'); return feito('Despacho salvo. Agora esperando o setor financeiro.'); }
        if (v === 'respondeu' || v === 'jaresp') { A.setEstado(p, it, 'feita'); A.anotar(p, 'Início', 'O setor financeiro respondeu.'); vendo = 'resposta'; direcao = 1; return feito(); }
      }
      if (acao === 'resp') {
        p.financeiro = v;
        A.anotar(p, 'Início', `Resposta do financeiro: ${A.RESPOSTA_FIN[v].toLowerCase()}.`);
        if (v === 'tem') { const c = p.frentes.find(f => f.modeloId === 'contratacao'); if (c && c.na && c.naPor !== 'ambito') c.na = false; }
        proxima(); return feito();
      }
      if (acao === 'dof' && v === 'avisei') {
        const it = garantir(p, 'financeira', NOMES.dof, 45); A.setEstado(p, it, 'feita');
        A.anotar(p, 'Início', `DOF avisada do remanejamento${g.remanejaDe ? ' (recurso de: ' + g.remanejaDe + ')' : ''}.`);
        proxima(); return feito('Anotado: DOF avisada.');
      }
      if (acao === 'sup') {
        const it = garantir(p, 'financeira', NOMES.sup, 45);
        if (v === 'pedi') { A.setEstado(p, it, 'esperando', 'Unidade orçamentária'); A.anotar(p, 'Despacho', 'Suplementação orçamentária pedida.'); return feito('Pedido salvo. Agora esperando a suplementação.'); }
        if (v === 'ok') { A.setEstado(p, it, 'feita'); A.anotar(p, 'Início', 'Suplementação aprovada.'); proxima(); return feito('Suplementação aprovada.'); }
        if (v === 'nao') { A.setEstado(p, it, 'aberta'); p.financeiro = ''; A.anotar(p, 'Início', 'Suplementação negada. Rever a resposta do financeiro.'); vendo = 'resposta'; direcao = -1; return feito('Suplementação negada. Escolha outro caminho.'); }
      }
      if (acao === 'concluir') { g.concluido = true; A.anotar(p, 'Início', 'Início concluído.'); A.salvar(); ctx.irParaFase('prep'); }
    });
    // a etapa nova entra deslizando, na direção em que a pessoa andou
    const c = el.querySelector('#guiaCorpo');
    const mudou = animado !== p.id + vendo; animado = p.id + vendo;
    if (c && mudou && !A.semMovimento()) c.animate([{ opacity: 0, transform: `translateX(${direcao * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.16, 1, .3, 1)' });
  };
})(window.App);
