/* Painel: o que fazer hoje, agenda e acompanhamento. */
(function (A) {
  const PADRAO = {
    blocos: { agenda: true, fazer: true, esperando: true, semEvento: true, planilha: true },
    ordem: ['esperando', 'semEvento', 'planilha'], posAgenda: 'cima', agendaAberta: true,
    modoAgenda: 'linha', modoFazer: 'cartoes', alcance: 60, seiCompleto: false,
  };
  const MODOS_AGENDA = [
    { v: 'linha', t: 'Linha do tempo', d: 'Os eventos pela distância em dias.', ic: 'linha' },
    { v: 'mes', t: 'Mês em folha', d: 'Um mês por vez, como a folha do calendário de mesa.', ic: 'mes' },
    { v: 'corrido', t: 'Semanas corridas', d: 'O mês termina e o próximo já começa, sem virar a folha.', ic: 'corrido' },
  ];
  const MODOS_FAZER = [
    { v: 'cartoes', t: 'Cartões por evento', d: 'Um cartão por curso, com a próxima tarefa.', ic: 'cartoes' },
    { v: 'quadro', t: 'Quadro em colunas', d: 'A fazer, esperando resposta e feito. Dá para arrastar.', ic: 'quadro' },
    { v: 'foco', t: 'Foco do dia', d: 'Uma tarefa de cada vez, com botões grandes.', ic: 'foco' },
  ];
  const REGRA_COR = () => {
    const l = A.regras().limites;
    return {
      critico: `Tem tarefa atrasada, ou a data do evento (ou limite) é em até ${l.critico} dias e ainda falta alguma coisa.`,
      atencao: `A data é em até ${l.atencao} dias e ainda falta alguma coisa, ou alguma tarefa vence nos próximos ${l.vencendo} dias.`,
      emdia: 'Ainda falta coisa, mas tudo dentro do prazo.',
      ok: 'Nada pendente.',
    };
  };
  const NOMES_LAT = { esperando: 'Esperando resposta', semEvento: 'Sem evento, com data limite', planilha: 'Alterações para a planilha' };
  const ID_LAT = { esperando: 'blocoEsperando', semEvento: 'blocoSemEvento', planilha: 'blocoPlanilha' };

  /* Estado da tela (não é salvo) */
  let busca = '', filtro = null, formAberto = null, quadroTudo = false, primeiraRegua = true, diaTrocou = false;
  let mes = null, diaSel = null, ultimoResumo = null, orgAberto = false;
  const expandidos = new Set(), detalhesAbertos = new Set();
  let pulados = [];
  let P = {}, procs = [], tarefas = [], despachos = [], vistaEl = null;

  function pf() {
    const p = A.prefs();
    if (!p.painel) p.painel = A.clonar(PADRAO);
    p.painel.blocos = { ...PADRAO.blocos, ...(p.painel.blocos || {}) };
    return p.painel;
  }

  /* Monta listas simples a partir dos processos guardados */
  function derivar() {
    const ativos = A.ativos();
    procs = ativos.map(p => ({ id: p.id, ref: p, titulo: p.titulo, sei: p.sei, evento: p.inicio || null, limite: p.inicio ? null : (p.limite || null), tipo: p.tipoNome, apoio: p.apoio }));
    P = Object.fromEntries(procs.map(x => [x.id, x]));
    tarefas = ativos.flatMap(p => A.itensAtivos(p).filter(x => x.i.quem !== 'acompanha').map(({ f, i }) => ({ id: p.id + '|' + i.id, p: p.id, proc: p, item: i, f, o: i.nome, regra: A.regraTexto(i.regra), prazo: A.prazo(p, i), estado: i.estado, planilha: i.coluna || f.coluna })));
    despachos = ativos.flatMap(p => p.despachos.filter(a => !a.resposta).map(a => { const x = A.acharItem(p, a.itemId); return { ...a, ref: a, p: p.id, proc: p, item: x && x.i }; }));
  }
  const T = id => tarefas.find(t => t.id === id);
  const visivel = x => (!busca || A.semAcento(x.titulo + ' ' + x.sei).includes(busca)) && (!filtro || x.id === filtro);
  const sit = x => A.situacao(x.ref);
  const dataRef = x => x.evento || x.limite;
  const linkProc = x => `#/processo/${x.id}`;
  const seiHTML = x => x.sei ? `<button type="button" class="sei" data-sei="${A.esc(x.sei)}" title="Copiar o número completo">${A.ic('copiar', 'ic-sm')}SEI ${A.esc(pf().seiCompleto ? x.sei : A.seiCurto(x.sei))}</button>` : '';
  const apoioHTML = x => x.apoio ? `<span class="iniciais" title="Apoio">apoio ${A.esc(A.iniciais(x.apoio))}</span>` : '';
  const rotuloD = n => n === 0 ? 'hoje' : n < 0 ? `D+${-n}` : `D-${n}`;
  const sitTarefa = t => !t.prazo ? sit(P[t.p]) : A.dias(t.prazo) < 0 ? 'critico' : A.dias(t.prazo) <= A.regras().limites.vencendo ? 'atencao' : sit(P[t.p]);
  function quando(t) {
    if (t.estado === 'feita') return 'feito';
    if (!t.prazo) return 'sem data';
    const n = A.dias(t.prazo);
    if (n < -1) return `atrasada há ${-n} dias`;
    if (n === -1) return 'venceu ontem';
    if (n === 0) return 'vence hoje';
    if (n === 1) return 'vence amanhã';
    return `até ${A.fmt(t.prazo)}`;
  }
  const classePrazo = t => t.estado === 'feita' || !t.prazo ? '' : A.dias(t.prazo) < 0 ? 'atrasado' : A.dias(t.prazo) === 0 ? 'hoje' : '';
  function distancia(x) {
    const r = dataRef(x); if (!r) return 'sem data cadastrada';
    const n = A.dias(r), o = x.evento ? 'evento' : 'data limite';
    if (n === 0) return `${o} hoje`;
    if (n > 0) return `${o} em ${n} dia${n > 1 ? 's' : ''} (${A.fmt(r)})`;
    return `${o} foi há ${-n} dias`;
  }

  /* ---------- Ações ---------- */
  const atualizar = () => A.mudar(desenharTudo);
  function marcarFeita(t, feita) {
    const desfaz = A.setEstado(t.proc, t.item, feita ? 'feita' : 'aberta');
    if (feita) A.anotar(t.proc, 'Feito', t.o + '.');
    A.salvar(); atualizar();
    if (feita) A.avisar(t.planilha && !A.semPlanilha() ? `Feito. "${t.planilha}" entrou na lista para a planilha.` : 'Marcado como feito.', () => { desfaz(); t.proc.diario.pop(); });
  }
  function salvarDespacho(t, setor, texto, enviado) {
    const desfaz = A.setEstado(t.proc, t.item, 'esperando', setor);
    const d = A.despachoAberto(t.proc, t.item); d.texto = texto; d.enviado = enviado;
    A.anotar(t.proc, 'Despacho', `${t.o}: enviado para ${setor}.${texto ? ' ' + texto : ''}`);
    formAberto = null; A.salvar(); atualizar();
    A.avisar(`Movido para Esperando resposta (${setor}).`, () => { desfaz(); t.proc.diario.pop(); });
  }
  function chegouResposta(d) {
    if (!d.item) { d.ref.resposta = A.hojeIso(); A.salvar(); atualizar(); return; }
    const desfaz = A.setEstado(d.proc, d.item, 'feita');
    A.anotar(d.proc, 'Resposta', `${d.setor} respondeu: ${d.item.nome}.`);
    A.salvar(); atualizar();
    A.avisar(`Resposta registrada: ${d.proc.titulo}, ${d.setor}.`, () => { desfaz(); d.proc.diario.pop(); });
  }
  function reabrir(t) {
    const desfaz = A.setEstado(t.proc, t.item, 'aberta');
    A.salvar(); atualizar();
    A.avisar('Voltou para A fazer.', desfaz);
  }
  function palpiteSetor(t) {
    const o = A.semAcento(t.o);
    if (/gci|comunica|arte|inscri|sala|audit|briefing/.test(o)) return 'GCI';
    if (/passage|deslocamento|viagem|diaria|portaria/.test(o)) return 'Setor de viagens';
    if (/orcament|financ|empenho|pagamento|reembolso/.test(o)) return 'Setor financeiro';
    return '';
  }

  /* ---------- Componentes ---------- */
  function linhaTarefa(t, { semEvento = false, vt = false } = {}) {
    const x = P[t.p], aberto = detalhesAbertos.has(t.id), pode = A.podeEditar();
    const chave = 'det-' + t.item.id;
    return `<li class="tarefa${t.estado === 'feita' ? ' feita' : ''}" data-t="${t.id}"${vt ? ` style="view-transition-name:vt-${t.item.id}"` : ''}>
      <input type="checkbox" id="cb-${t.item.id}-${Math.random().toString(36).slice(2, 6)}" ${t.estado === 'feita' ? 'checked' : ''} ${pode ? '' : 'disabled title="Só leitura"'}>
      <label class="o-que">${A.esc(t.o)}</label>
      <span class="prazo ${classePrazo(t)}">${quando(t)}</span>
      <div class="linha2">
        ${semEvento ? '' : `<a class="link-proc" href="${linkProc(x)}">${A.esc(x.titulo)}</a>`}
        ${t.estado === 'esperando' ? `<span style="color:var(--atencao)">${A.ic('relogio', 'ic-sm')} esperando resposta</span>` : ''}
        ${t.estado === 'aberta' ? `<button type="button" class="btn-texto" data-acao="despachar" data-editar>${A.ic('enviar', 'ic-sm')}Despachei</button>` : ''}
        <button type="button" class="btn-texto" data-acao="detalhes" aria-expanded="${aberto}" aria-controls="${chave}">${aberto ? 'Menos' : 'Detalhes'}</button>
      </div>
      <div class="detalhes" id="${chave}" ${aberto ? '' : 'hidden'}>
        <span>Regra: ${A.esc(t.regra)}</span>
        <span style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">${seiHTML(x)} ${apoioHTML(x)}</span>
        ${t.planilha && !A.semPlanilha() ? `<span>Coluna na planilha: ${t.planilha}</span>` : ''}
      </div>
      ${formAberto === t.id ? formDespacho(t) : ''}
    </li>`;
  }
  function formDespacho(t) {
    const k = t.item.id;
    return `<form class="form-mini" data-form="${t.id}" novalidate>
      <span class="titulo">${A.ic('enviar')} Registrar o despacho de "${A.esc(t.o)}"</span>
      <div class="campo"><label for="fs-${k}">Enviado para</label><input id="fs-${k}" name="setor" list="lista-setores" value="${A.esc(palpiteSetor(t))}" placeholder="GCI"><div class="erro" hidden>Diga para onde o despacho foi.</div></div>
      <div class="campo"><label for="ft-${k}">O que foi pedido ou combinado <small>(opcional)</small></label><textarea id="ft-${k}" name="texto" placeholder="Pedida a arte de divulgação. Inscrições de 01 a 14/10."></textarea></div>
      <div class="campo"><label for="fd-${k}">Enviado em</label><input id="fd-${k}" name="data" type="date" value="${A.hojeIso()}" max="${A.hojeIso()}"></div>
      <div class="form-botoes"><button class="btn btn-primario" type="submit">Salvar e esperar resposta</button><button class="btn" type="button" data-acao="cancelar-form">Cancelar</button></div>
    </form>`;
  }
  function focarForm(t) { const c = document.getElementById('fs-' + t.item.id); if (c) { c.focus(); c.select(); } }
  function ligar(raiz) {
    raiz.querySelectorAll('.tarefa[data-t]').forEach(li => {
      const t = T(li.dataset.t); if (!t) return;
      const cb = li.querySelector('input[type=checkbox]');
      li.querySelector('label.o-que').setAttribute('for', cb.id);
      cb.onchange = () => {
        if (!A.podeEditar()) { cb.checked = !cb.checked; return; }
        if (cb.checked && !A.semMovimento()) { cb.classList.add('recem'); li.classList.add('feita', 'recem'); setTimeout(() => marcarFeita(t, true), 380); }
        else marcarFeita(t, cb.checked);
      };
      li.querySelectorAll('[data-acao="despachar"]').forEach(b => b.onclick = () => { formAberto = t.id; desenharTudo(); focarForm(t); });
      li.querySelectorAll('[data-acao="detalhes"]').forEach(b => b.onclick = () => {
        detalhesAbertos.has(t.id) ? detalhesAbertos.delete(t.id) : detalhesAbertos.add(t.id);
        const det = li.querySelector('.detalhes'); det.hidden = !det.hidden;
        b.setAttribute('aria-expanded', !det.hidden); b.textContent = det.hidden ? 'Detalhes' : 'Menos';
      });
    });
    A.ligarCopiaSei(raiz);
    raiz.querySelectorAll('form[data-form]').forEach(f => {
      const t = T(f.dataset.form);
      const campo = f.elements.setor, erro = campo.parentElement.querySelector('.erro');
      campo.oninput = () => { campo.removeAttribute('aria-invalid'); erro.hidden = true; };
      f.querySelector('[data-acao="cancelar-form"]').onclick = () => { formAberto = null; desenharTudo(); };
      f.onsubmit = e => {
        e.preventDefault();
        const setor = campo.value.trim();
        if (!setor) { campo.setAttribute('aria-invalid', 'true'); erro.hidden = false; campo.focus(); return; }
        salvarDespacho(t, setor, f.elements.texto.value.trim(), f.elements.data.value || A.hojeIso());
      };
    });
  }

  /* ---------- Resumo ---------- */
  function desenharResumo() {
    const ab = tarefas.filter(t => t.estado === 'aberta' && t.prazo && visivel(P[t.p]));
    const atras = ab.filter(t => A.dias(t.prazo) < 0).length, hoje = ab.filter(t => A.dias(t.prazo) === 0).length;
    const semana = ab.filter(t => A.dias(t.prazo) > 0 && A.dias(t.prazo) <= 7).length;
    const esp = despachos.filter(a => visivel(P[a.p])).length;
    const alvoEsp = pf().modoFazer === 'quadro' || !pf().blocos.esperando ? 'blocoFazer' : 'blocoEsperando';
    const itens = [
      { n: atras, t: atras === 1 ? 'atrasada' : 'atrasadas', c: atras ? 'var(--critico)' : '', i: 'alerta', alvo: 'blocoFazer' },
      { n: hoje, t: 'para hoje', c: hoje ? 'var(--caneta)' : '', i: 'circulo', alvo: 'blocoFazer' },
      { n: semana, t: 'nos próximos 7 dias', c: '', i: 'mes', alvo: 'blocoFazer' },
      { n: esp, t: 'esperando resposta', c: esp ? 'var(--atencao)' : '', i: 'relogio', alvo: alvoEsp },
    ];
    const el = vistaEl.querySelector('#resumo');
    el.innerHTML = itens.map((x, i) => `<button type="button" data-alvo="${x.alvo}" style="${x.c ? '--c:' + x.c : ''}">${A.ic(x.i)}<span class="n${ultimoResumo && ultimoResumo[i] !== x.n ? ' mudou' : ''}">${x.n}</span> ${x.t}</button>`).join('');
    ultimoResumo = itens.map(x => x.n);
    el.querySelectorAll('button').forEach(b => b.onclick = () => irPara(b.dataset.alvo));
  }
  function irPara(id) {
    const el = document.getElementById(id); if (!el || el.hidden) return;
    A.rolarAte(el);
    const h = el.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  /* ---------- Legenda ---------- */
  let explicaAnim = null, dicaTempo = null;
  function posicao(el) {
    const b = document.getElementById('blocoAgenda').getBoundingClientRect(), r = el.getBoundingClientRect();
    return { top: r.bottom - b.top + 8, left: r.left - b.left, right: b.right - r.right };
  }
  function ligarLegenda() {
    const regras = REGRA_COR();
    vistaEl.querySelectorAll('.chave-btn').forEach(b => {
      const mostrar = () => {
        esconderDica();
        const d = document.createElement('div');
        d.className = 'dica'; d.id = 'dica-cor'; d.setAttribute('role', 'tooltip'); d.textContent = regras[b.dataset.chave];
        const p = posicao(b); d.style.top = p.top + 'px'; d.style.left = Math.max(8, p.left) + 'px';
        document.getElementById('blocoAgenda').appendChild(d);
        b.setAttribute('aria-describedby', 'dica-cor');
        clearTimeout(dicaTempo); dicaTempo = setTimeout(esconderDica, 5000);
      };
      b.onmouseenter = mostrar; b.onfocus = mostrar; b.onclick = mostrar; b.onmouseleave = esconderDica; b.onblur = esconderDica;
    });
    const be = vistaEl.querySelector('#btnExplica');
    if (be) be.onclick = () => document.getElementById('explica') ? fecharExplica() : abrirExplica();
  }
  function esconderDica() { document.getElementById('dica-cor')?.remove(); document.querySelectorAll('.chave-btn[aria-describedby]').forEach(b => b.removeAttribute('aria-describedby')); }
  function abrirExplica(sozinha) {
    const btn = document.getElementById('btnExplica');
    if (document.getElementById('explica') || !btn) return;
    const regras = REGRA_COR(), caixa = document.createElement('div');
    caixa.className = 'explica'; caixa.id = 'explica'; caixa.setAttribute('role', 'region'); caixa.setAttribute('aria-label', 'Como a cor é definida');
    caixa.innerHTML = `<h3>Como a cor de cada processo é definida</h3>
      <dl>${Object.entries(regras).map(([k, t], i) => `<dt style="animation-delay:${60 + i * 50}ms">${A.seloSit(k)}</dt><dd style="animation-delay:${60 + i * 50}ms">${t}</dd>`).join('')}</dl>
      <p class="pausa">${sozinha ? 'Aparece sozinha uma vez por dia. ' : ''}Some sozinha; deixar o mouse em cima segura a caixa. Os dias são ajustáveis em Regras de prazo.</p>
      <button type="button" class="btn-icone fechar" aria-label="Fechar explicação">${A.ic('fechar')}</button><span class="tempo" aria-hidden="true"></span>`;
    const p = posicao(btn); caixa.style.top = p.top + 'px'; caixa.style.right = Math.max(16, p.right) + 'px';
    document.getElementById('blocoAgenda').appendChild(caixa);
    btn.setAttribute('aria-expanded', 'true');
    const duracao = Math.min(20000, Math.max(7000, 1500 + caixa.textContent.split(/\s+/).length * 230));
    explicaAnim = caixa.querySelector('.tempo').animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: duracao, fill: 'forwards' });
    explicaAnim.onfinish = () => fecharExplica();
    const pausar = () => explicaAnim && explicaAnim.playState === 'running' && explicaAnim.pause();
    const seguir = () => explicaAnim && explicaAnim.playState === 'paused' && explicaAnim.play();
    caixa.addEventListener('mouseenter', pausar); caixa.addEventListener('mouseleave', seguir);
    caixa.addEventListener('focusin', pausar); caixa.addEventListener('focusout', seguir);
    caixa.querySelector('.fechar').onclick = () => { fecharExplica(); btn.focus(); };
  }
  function fecharExplica() {
    const caixa = document.getElementById('explica');
    if (!caixa || caixa.classList.contains('saindo')) return;
    if (explicaAnim) { explicaAnim.cancel(); explicaAnim = null; }
    document.getElementById('btnExplica')?.setAttribute('aria-expanded', 'false');
    if (A.semMovimento()) { caixa.remove(); return; }
    caixa.classList.add('saindo');
    caixa.addEventListener('animationend', () => caixa.remove(), { once: true });
  }
  A.fecharDicasPainel = () => { esconderDica(); const cx = document.getElementById('explica'); if (cx) { const dentro = cx.contains(document.activeElement); fecharExplica(); if (dentro) document.getElementById('btnExplica')?.focus(); } };

  /* ---------- Agenda ---------- */
  function desenharAgenda() {
    const P0 = pf();
    A.menuModo(vistaEl.querySelector('#modoAgenda'), 'Forma de ver a agenda', MODOS_AGENDA, P0.modoAgenda, v => { P0.modoAgenda = v; A.salvar(); desenharAgenda(); });
    vistaEl.querySelector('#legenda').innerHTML = `${['critico', 'atencao', 'emdia', 'ok'].map(k => `<button type="button" class="chave-btn" data-chave="${k}">${A.seloSit(k)}</button>`).join('')}
      <button type="button" class="btn-texto" id="btnExplica" aria-expanded="${!!document.getElementById('explica')}" aria-controls="explica" style="margin-left:auto">${A.ic('ajuda', 'ic-sm')}Como a cor é definida</button>`;
    ligarLegenda();
    const c = vistaEl.querySelector('#agendaConteudo');
    if (P0.modoAgenda === 'linha') desenharLinha(c); else desenharCalendario(c, P0.modoAgenda);
  }
  function desenharLinha(c) {
    const P0 = pf(), MAX = P0.alcance, MIN = -Math.round(MAX / 4);
    const pos = n => (n - MIN) / (MAX - MIN) * 100;
    const evs = procs.filter(p => p.evento && visivel(p)).sort((a, b) => A.dias(a.evento) - A.dias(b.evento));
    const dentro = evs.filter(p => A.dias(p.evento) >= MIN && A.dias(p.evento) <= MAX);
    const alem = evs.filter(p => A.dias(p.evento) > MAX).length, antes = evs.filter(p => A.dias(p.evento) < MIN).length;
    const marcas = [MIN, 0, 7, 15, 30, 45, 60, 90].filter(n => n <= MAX && (n === MIN || n >= 0));
    c.innerHTML = `
      <div class="regua-barra"><span class="secundario">${evs.length ? 'Clique num evento para ver só as tarefas dele.' : 'Nenhum evento com data. Os processos com data limite ficam no bloco ao lado.'}</span>
        <div class="alcance" role="group" aria-label="Quantos dias mostrar">${[30, 60, 90].map(n => `<button type="button" data-n="${n}" aria-pressed="${P0.alcance === n}">${n} dias</button>`).join('')}</div></div>
      <div class="regua"><div class="faixas"><div class="faixa passado" style="left:0;width:${pos(0)}%"></div><div class="faixa semana" style="left:${pos(0)}%;width:${pos(7) - pos(0)}%"></div><div class="faixa quinzena" style="left:${pos(7)}%;width:${pos(15) - pos(7)}%"></div><div class="linha-hoje" style="left:${pos(0)}%"></div></div>
        <div class="pinos" id="pinos"></div>
        <div class="eixo">${marcas.map((n, i) => `<span class="marca-eixo${n === 0 ? ' hoje' : ''}${i === 0 ? ' inicio' : ''}${i === marcas.length - 1 ? ' fim' : ''}" style="left:${pos(n)}%">${n === 0 ? 'hoje' : n < 0 ? `há ${-n} dias` : `+${n}`}</span>`).join('')}</div></div>
      <ul class="regua-lista">${dentro.map(p => { const n = A.dias(p.evento), s = sit(p); return `<li><button type="button" data-p="${p.id}" style="${A.cores(s)}" aria-pressed="${filtro === p.id}"><span class="d">${rotuloD(n)}</span>${A.seloSit(s)}<span>${A.esc(p.titulo)}</span></button></li>`; }).join('')}</ul>
      ${alem || antes ? `<p class="secundario" style="margin-top:8px">${alem ? `Mais ${alem} evento${alem > 1 ? 's' : ''} depois de ${MAX} dias. ` : ''}${antes ? `${antes} evento${antes > 1 ? 's' : ''} que já passaram há mais tempo.` : ''}</p>` : ''}`;
    c.querySelectorAll('.alcance button').forEach(b => b.onclick = () => { P0.alcance = +b.dataset.n; A.salvar(); A.mudar(desenharAgenda); });
    c.querySelectorAll('.regua-lista button').forEach(b => b.onclick = () => alternarFiltro(b.dataset.p));
    const pinos = c.querySelector('#pinos'), largura = pinos.getBoundingClientRect().width;
    if (!largura) return;
    const ocupado = [], colocados = [];
    dentro.forEach(p => {
      const n = A.dias(p.evento), s = sit(p), b = document.createElement('button');
      b.type = 'button'; b.className = 'pino'; b.setAttribute('style', A.cores(s)); b.setAttribute('aria-pressed', filtro === p.id);
      b.setAttribute('aria-label', `${p.titulo}, evento em ${A.extenso(p.evento)}, situação ${A.SIT[s].nome}`); b.title = p.titulo;
      b.innerHTML = `<span class="d">${s === 'critico' || s === 'atencao' ? A.ic(A.SIT[s].ic) : ''}${rotuloD(n)}</span><span>${A.esc(A.curto(p.titulo, 22))}</span>`;
      b.onclick = () => alternarFiltro(p.id);
      if (primeiraRegua && !A.semMovimento()) { b.classList.add('chegando'); b.style.animationDelay = (colocados.length * 45) + 'ms'; }
      pinos.appendChild(b);
      const w = b.getBoundingClientRect().width, x = pos(n) / 100 * largura;
      let esq = x; if (x + w > largura) { esq = x - w; b.classList.add('direita'); }
      let f = 0; while (ocupado[f] !== undefined && ocupado[f] > esq - 8) f++;
      ocupado[f] = esq + w; colocados.push({ b, esq, x, f, s });
    });
    primeiraRegua = false;
    const ALT = 36, total = Math.max(ocupado.length, 1), altura = total * ALT + 14;
    pinos.style.height = altura + 'px';
    colocados.forEach(({ b, esq, x, f, s }) => {
      const topo = (total - 1 - f) * ALT; b.style.left = esq + 'px'; b.style.top = topo + 'px';
      const h = document.createElement('span'); h.className = 'haste';
      h.setAttribute('style', `${A.cores(s)};left:${x}px;top:${topo + 30}px;height:${altura - topo - 30}px`); pinos.appendChild(h);
    });
  }
  function celulaDia(dt, { fora = false, mesB = false } = {}) {
    const k = A.iso(dt), hoje = A.hojeIso();
    const evs = procs.filter(p => dataRef(p) === k && visivel(p));
    const tars = tarefas.filter(t => t.prazo === k && t.estado === 'aberta' && visivel(P[t.p]));
    const fds = dt.getDay() === 0 || dt.getDay() === 6;
    const sitTar = tars.length ? A.pior(tars.map(sitTarefa)) : null;
    const sitDia = A.pior([...evs.map(sit), ...(sitTar ? [sitTar] : [])]);
    const total = evs.length + tars.length;
    const rotulo = [A.extenso(k), evs.map(p => `${p.evento ? 'evento' : 'data limite'} ${p.titulo}, ${A.SIT[sit(p)].nome}`).join('; '), tars.length ? `${tars.length} tarefa${tars.length > 1 ? 's' : ''} vencendo` : ''].filter(Boolean).join(', ');
    const primeiro = dt.getDate() === 1;
    return `<button type="button" role="gridcell" class="dia${fora ? ' fora' : ''}${mesB ? ' mes-b' : ''}${fds ? ' fim-semana' : ''}${k === hoje ? ' hoje' : ''}" data-dia="${k}" aria-selected="${k === diaSel}" tabindex="${k === diaSel ? 0 : -1}" aria-label="${A.esc(rotulo)}">
      <span class="num${primeiro && k !== hoje ? ' primeiro' : ''}">${primeiro ? dt.getDate() + ' ' + dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') : dt.getDate()}</span>
      ${evs.slice(0, 2).map(p => { const s = sit(p); return `<span class="ev" style="${A.cores(s)}" title="${A.esc(p.titulo)}">${s === 'critico' || s === 'atencao' ? A.ic(A.SIT[s].ic) : ''}<span>${A.esc(p.titulo)}</span></span>`; }).join('')}
      ${evs.length > 2 ? `<span class="tar">+${evs.length - 2} eventos</span>` : ''}
      ${tars.length ? `<span class="tar" style="${A.cores(sitTar)}">${A.ic(A.SIT[sitTar].ic)}${tars.length} tarefa${tars.length > 1 ? 's' : ''}</span>` : ''}
      ${total ? `<span class="mini" style="${A.cores(sitDia)}">${A.ic(A.SIT[sitDia].ic)}${total}</span>` : ''}
    </button>`;
  }
  function desenharCalendario(c, modo) {
    const hoje = A.d(A.hojeIso());
    if (!mes) mes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    if (!diaSel) diaSel = A.hojeIso();
    let grade = '', titulo = '';
    if (modo === 'mes') {
      titulo = A.maiusc(mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
      const inicio = new Date(mes); inicio.setDate(1 - mes.getDay());
      const fim = new Date(mes.getFullYear(), mes.getMonth() + 1, 0), n = Math.ceil((mes.getDay() + fim.getDate()) / 7) * 7;
      let linha = '';
      for (let i = 0; i < n; i++) { const dt = new Date(inicio); dt.setDate(inicio.getDate() + i); linha += celulaDia(dt, { fora: dt.getMonth() !== mes.getMonth() }); if (i % 7 === 6) { grade += `<div role="row" style="display:contents">${linha}</div>`; linha = ''; } }
    } else {
      const inicio = A.d(A.somar(A.hojeIso(), -7)); inicio.setDate(inicio.getDate() - inicio.getDay());
      const semanas = 11, fimDt = new Date(inicio); fimDt.setDate(inicio.getDate() + semanas * 7 - 1);
      titulo = `${A.maiusc(inicio.toLocaleDateString('pt-BR', { month: 'long' }))} a ${fimDt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
      for (let w = 0; w < semanas; w++) {
        let linha = '', rot = '';
        for (let i = 0; i < 7; i++) { const dt = new Date(inicio); dt.setDate(inicio.getDate() + w * 7 + i); if (dt.getDate() === 1 || (w === 0 && i === 0)) rot = A.maiusc(dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })); linha += celulaDia(dt, { mesB: dt.getMonth() % 2 === 1 }); }
        if (rot) grade += `<div class="mes-rotulo" role="row"><span role="rowheader">${rot}</span></div>`;
        grade += `<div role="row" style="display:contents">${linha}</div>`;
      }
    }
    c.innerHTML = `<div class="cal${modo === 'corrido' ? ' corrido' : ''}"><div>
      <div class="cal-nav">${modo === 'mes' ? `<button class="btn" type="button" data-nav="-1" aria-label="Mês anterior">${A.ic('anterior')}</button><button class="btn" type="button" data-nav="1" aria-label="Mês seguinte">${A.ic('proximo')}</button>` : ''}
        <h3 aria-live="polite">${titulo}</h3><button class="btn" type="button" data-nav="hoje">Hoje</button></div>
      <div class="semana-nomes" aria-hidden="true"><div>dom</div><div>seg</div><div>ter</div><div>qua</div><div>qui</div><div>sex</div><div>sáb</div></div>
      <div class="grade" role="grid" aria-label="${titulo}. Use as setas para andar entre os dias.">${grade}</div>
      <p class="secundario" style="margin-top:8px">Clique num dia para ver o que falta. No teclado, use as setas.</p></div>
      <div class="detalhe-dia" id="detalheDia" aria-live="polite"></div></div>`;
    c.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
      if (b.dataset.nav === 'hoje') { mes = new Date(hoje.getFullYear(), hoje.getMonth(), 1); diaSel = A.hojeIso(); }
      else mes = new Date(mes.getFullYear(), mes.getMonth() + +b.dataset.nav, 1);
      diaTrocou = true; A.mudar(desenharAgenda);
    });
    const g = c.querySelector('.grade');
    g.querySelectorAll('.dia').forEach(b => b.onclick = () => selecionarDia(b.dataset.dia, false));
    g.onkeydown = e => {
      const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!passo) return;
      e.preventDefault(); const novo = A.somar(diaSel, passo);
      if (modo === 'corrido' && !g.querySelector(`[data-dia="${novo}"]`)) return;
      selecionarDia(novo, true);
    };
    desenharDetalheDia();
  }
  function selecionarDia(k, focar) {
    diaSel = k; diaTrocou = true;
    const dt = A.d(k);
    if (pf().modoAgenda === 'mes' && dt.getMonth() !== mes.getMonth()) mes = new Date(dt.getFullYear(), dt.getMonth(), 1);
    desenharAgenda();
    if (focar) vistaEl.querySelector(`.grade [data-dia="${k}"]`)?.focus();
  }
  function desenharDetalheDia() {
    const el = vistaEl.querySelector('#detalheDia'); if (!el) return;
    const n = A.dias(diaSel), rel = n === 0 ? 'hoje' : n === 1 ? 'amanhã' : n === -1 ? 'ontem' : n > 0 ? `daqui a ${n} dias` : `há ${-n} dias`;
    const evs = procs.filter(p => dataRef(p) === diaSel && visivel(p));
    const tars = tarefas.filter(t => t.prazo === diaSel && visivel(P[t.p]));
    let html = `<h3>${A.extenso(diaSel)}</h3><p class="secundario sub">${A.maiusc(A.semana(diaSel))}, ${rel}</p>`;
    if (evs.length) html += `<h4>O que acontece neste dia</h4>` + evs.map(p => {
      const s = sit(p), pend = tarefas.filter(t => t.p === p.id && t.estado !== 'feita');
      return `<div class="ev-card" style="${A.cores(s)}"><div class="t"><a class="link-proc" href="${linkProc(p)}">${A.esc(p.titulo)}</a>${A.seloSit(s)}</div>
        <div class="secundario" style="margin-top:2px">${p.evento ? 'Evento' : 'Data limite'}. ${pend.length ? `Falta${pend.length > 1 ? 'm' : ''} ${pend.length} tarefa${pend.length > 1 ? 's' : ''}:` : ''}</div>
        ${pend.length ? `<ul>${pend.map(t => `<li>${A.esc(t.o)} <span class="secundario">(${t.estado === 'esperando' ? 'esperando resposta' : quando(t)})</span></li>`).join('')}</ul>` : `<p style="color:var(--ok);font-size:var(--t-sm);margin-top:4px">${A.ic('feito')} Nada faltando.</p>`}</div>`;
    }).join('');
    if (tars.length) html += `<h4>Tarefas com prazo neste dia</h4><ul class="tarefas">${tars.map(t => linhaTarefa(t)).join('')}</ul>`;
    if (!evs.length && !tars.length) html += `<p class="vazio">Nada marcado para este dia. Escolha outro dia no calendário.</p>`;
    el.innerHTML = html; el.classList.toggle('trocou', diaTrocou); diaTrocou = false;
    ligar(el);
  }

  /* ---------- O que fazer ---------- */
  function desenharFazer() {
    const P0 = pf();
    A.menuModo(vistaEl.querySelector('#modoFazer'), 'Forma de ver o que fazer', MODOS_FAZER, P0.modoFazer, v => { P0.modoFazer = v; A.salvar(); desenharTudo(); });
    const fa = vistaEl.querySelector('#filtroAtivo');
    if (filtro && P[filtro]) { fa.hidden = false; fa.innerHTML = `${A.ic('busca')} Só ${A.esc(P[filtro].titulo)}. <button type="button" class="btn-texto" id="limparFiltro">Mostrar todos</button>`; fa.querySelector('#limparFiltro').onclick = () => alternarFiltro(null); }
    else fa.hidden = true;
    const c = vistaEl.querySelector('#fazerConteudo');
    if (P0.modoFazer === 'quadro') desenharQuadro(c); else if (P0.modoFazer === 'foco') desenharFoco(c); else desenharCartoes(c);
    ligar(c);
  }
  function desenharCartoes(c) {
    const lista = procs.filter(visivel).sort((a, b) => A.PESO[sit(b)] - A.PESO[sit(a)] || ((dataRef(a) || '9') < (dataRef(b) || '9') ? -1 : 1));
    const comPend = lista.filter(p => sit(p) !== 'ok'), semPend = lista.filter(p => sit(p) === 'ok');
    if (!comPend.length) { c.innerHTML = `<p class="vazio">${busca || filtro ? 'Nenhum processo pendente com essa busca.' : 'Nenhuma pendência. Tudo em dia.'}</p>`; return; }
    c.innerHTML = `<div class="cartoes">${comPend.map(p => {
      const s = sit(p), todas = tarefas.filter(t => t.p === p.id), feitas = todas.filter(t => t.estado === 'feita').length;
      const ab = todas.filter(t => t.estado === 'aberta').sort((a, b) => (a.prazo || '9') < (b.prazo || '9') ? -1 : 1);
      const esp = despachos.filter(a => a.p === p.id), aberto = expandidos.has(p.id), resto = ab.slice(1);
      return `<article class="cartao ${s}" aria-labelledby="ct-${p.id}" style="view-transition-name:c-${p.id}">
        <div class="topo-cartao">${A.seloSit(s)}<span>${distancia(p)}</span></div>
        <h3 id="ct-${p.id}"><a class="link-proc" href="${linkProc(p)}">${A.esc(p.titulo)}</a></h3>
        <div class="progresso"><div class="barra" aria-hidden="true"><i style="width:${todas.length ? Math.round(feitas / todas.length * 100) : 0}%"></i></div><span>${feitas} de ${todas.length} feitas</span></div>
        ${esp.map(a => `<div class="esperando-mini">${A.ic('relogio')}<span>Esperando ${A.esc(a.setor)}, ${A.haDias(-A.dias(a.enviado))}</span></div>`).join('')}
        ${ab.length ? `<div class="rotulo-proxima">Próxima tarefa</div><ul class="tarefas">${linhaTarefa(ab[0], { semEvento: true, vt: true })}</ul>` : ''}
        ${resto.length ? `<button type="button" class="btn-texto" data-expandir="${p.id}" aria-expanded="${aberto}" aria-controls="resto-${p.id}">${aberto ? 'Esconder as outras' : `Ver mais ${resto.length} tarefa${resto.length > 1 ? 's' : ''}`}</button>
          <ul class="tarefas" id="resto-${p.id}" ${aberto ? '' : 'hidden'}>${resto.map(t => linhaTarefa(t, { semEvento: true, vt: true })).join('')}</ul>` : ''}
      </article>`;
    }).join('')}</div>
    ${semPend.length ? `<p class="secundario" style="margin-top:16px">${A.ic('feito')} ${semPend.length} processo${semPend.length > 1 ? 's' : ''} sem pendência: ${semPend.map(p => `<a class="link-proc" href="${linkProc(p)}">${A.esc(p.titulo)}</a>`).join(', ')}.</p>` : ''}`;
    c.querySelectorAll('[data-expandir]').forEach(b => b.onclick = () => {
      const id = b.dataset.expandir; expandidos.has(id) ? expandidos.delete(id) : expandidos.add(id);
      A.mudar(desenharFazer).then(() => vistaEl.querySelector(`[data-expandir="${id}"]`)?.focus());
    });
  }
  function desenharQuadro(c) {
    const pode = A.podeEditar();
    const todasAb = tarefas.filter(t => t.estado === 'aberta' && visivel(P[t.p])).sort((a, b) => (a.prazo || '9') < (b.prazo || '9') ? -1 : 1);
    const ab = quadroTudo ? todasAb : todasAb.filter(t => t.prazo && A.dias(t.prazo) <= 14), depois = todasAb.length - ab.length;
    const esp = despachos.filter(a => visivel(P[a.p])).sort((a, b) => a.enviado < b.enviado ? -1 : 1);
    const feitas = tarefas.filter(t => t.estado === 'feita' && visivel(P[t.p]) && t.item.feitoEm).sort((a, b) => a.item.feitoEm < b.item.feitoEm ? 1 : -1).slice(0, 8);
    const fichaT = t => {
      const s = sitTarefa(t);
      if (formAberto === t.id) return `<div class="ficha" style="cursor:default"><div class="t">${A.esc(t.o)}</div><div class="s">${A.esc(P[t.p].titulo)}</div><ul class="tarefas" style="display:none"></ul>${formDespacho(t)}</div>`;
      return `<div class="ficha" draggable="${pode}" data-tipo="t" data-id="${t.id}" style="view-transition-name:f-${t.item.id}">
        <div class="t">${A.esc(t.o)}</div><div class="s"><a class="link-proc" href="${linkProc(P[t.p])}">${A.esc(P[t.p].titulo)}</a></div>
        <div class="q" style="${A.cores(s)}">${s === 'critico' || s === 'atencao' ? A.ic(A.SIT[s].ic) : ''}${A.maiusc(quando(t))}</div>
        <div class="acoes-ficha" data-editar><button type="button" class="btn" data-q="feita" data-id="${t.id}">${A.ic('check', 'ic-sm')} Feito</button><button type="button" class="btn" data-q="despachar" data-id="${t.id}">${A.ic('enviar', 'ic-sm')} Despachei</button></div></div>`;
    };
    const fichaA = a => {
      const n = -A.dias(a.enviado), s = n > 15 ? 'critico' : n > 7 ? 'atencao' : 'emdia';
      return `<div class="ficha" draggable="${pode}" data-tipo="a" data-id="${a.id}" style="view-transition-name:${a.item ? 'f-' + a.item.id : 'a-' + a.id}">
        <div class="t">${A.esc(a.item ? a.item.nome : 'Despacho para ' + a.setor)}</div><div class="s">${A.esc(P[a.p].titulo)}</div>
        <div class="q" style="${A.cores(s)}">${A.ic('relogio')}${A.esc(a.setor)}, ${A.haDias(n)}</div>
        ${a.texto ? `<div class="combinado">${A.esc(a.texto)}</div>` : ''}
        <div class="acoes-ficha" data-editar><button type="button" class="btn" data-q="resposta" data-id="${a.id}">${A.ic('check', 'ic-sm')} Chegou resposta</button>${a.item ? `<button type="button" class="btn" data-q="voltar" data-id="${a.p}|${a.item.id}">Voltar para A fazer</button>` : ''}</div></div>`;
    };
    const fichaF = t => `<div class="ficha feita" draggable="${pode}" data-tipo="t" data-id="${t.id}" style="view-transition-name:f-${t.item.id}"><div class="t">${A.esc(t.o)}</div><div class="s">${A.esc(P[t.p].titulo)}, feito ${t.item.feitoEm === A.hojeIso() ? 'hoje' : 'em ' + A.fmt(t.item.feitoEm)}</div>
      <div class="acoes-ficha" data-editar><button type="button" class="btn" data-q="voltar" data-id="${t.id}">Reabrir</button></div></div>`;
    c.innerHTML = `<p class="secundario" style="margin-bottom:12px">${pode ? 'Arraste os cartões entre as colunas, ou use os botões de cada cartão.' : 'Só leitura: dá para ver, mas não mover os cartões.'}</p>
      <div class="quadro">
        <section class="coluna" data-col="fazer" aria-labelledby="col-fazer"><h3 id="col-fazer">${A.ic('circulo')} A fazer <span class="n">(${todasAb.length})</span></h3>${ab.map(fichaT).join('') || '<p class="vazio">Nada para as próximas 2 semanas.</p>'}
          ${depois ? `<button type="button" class="btn-texto" id="quadroMais">Mostrar mais ${depois} (depois de 2 semanas ou sem data)</button>` : quadroTudo && todasAb.length ? `<button type="button" class="btn-texto" id="quadroMais">Mostrar só as próximas 2 semanas</button>` : ''}</section>
        <section class="coluna" data-col="esperando" aria-labelledby="col-esp"><h3 id="col-esp">${A.ic('relogio')} Esperando resposta <span class="n">(${esp.length})</span></h3>${esp.map(fichaA).join('') || '<p class="vazio">Nenhum despacho esperando. Quando despachar uma tarefa, ela vem para cá.</p>'}</section>
        <section class="coluna" data-col="feito" aria-labelledby="col-feito"><h3 id="col-feito">${A.ic('feito')} Feito <span class="n">(recentes)</span></h3>${feitas.map(fichaF).join('') || '<p class="vazio">Nada marcado como feito ainda.</p>'}</section>
      </div>`;
    const mais = c.querySelector('#quadroMais'); if (mais) mais.onclick = () => { quadroTudo = !quadroTudo; A.mudar(desenharFazer); };
    c.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
      const q = b.dataset.q, id = b.dataset.id;
      if (q === 'feita') marcarFeita(T(id), true);
      if (q === 'despachar') { formAberto = id; desenharTudo(); focarForm(T(id)); }
      if (q === 'resposta') chegouResposta(despachos.find(a => a.id === id));
      if (q === 'voltar') reabrir(T(id));
    });
    if (!pode) return;
    let arrastado = null;
    c.querySelectorAll('.ficha[draggable=true]').forEach(f => {
      f.ondragstart = e => { arrastado = { tipo: f.dataset.tipo, id: f.dataset.id }; f.classList.add('arrastando'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.dataset.id); };
      f.ondragend = () => { f.classList.remove('arrastando'); c.querySelectorAll('.coluna').forEach(x => x.classList.remove('alvo')); };
    });
    c.querySelectorAll('.coluna').forEach(col => {
      col.ondragover = e => { e.preventDefault(); col.classList.add('alvo'); };
      col.ondragleave = e => { if (!col.contains(e.relatedTarget)) col.classList.remove('alvo'); };
      col.ondrop = e => {
        e.preventDefault(); col.classList.remove('alvo'); if (!arrastado) return;
        const destino = col.dataset.col;
        if (arrastado.tipo === 't') {
          const t = T(arrastado.id); if (!t) return;
          if (destino === 'feito' && t.estado !== 'feita') marcarFeita(t, true);
          else if (destino === 'esperando' && t.estado === 'aberta') { formAberto = t.id; desenharTudo(); focarForm(t); }
          else if (destino === 'fazer' && t.estado !== 'aberta') reabrir(t);
        } else {
          const a = despachos.find(x => x.id === arrastado.id); if (!a) return;
          if (destino === 'feito') chegouResposta(a);
          else if (destino === 'fazer' && a.item) reabrir(T(a.p + '|' + a.item.id));
        }
        arrastado = null;
      };
    });
  }
  function desenharFoco(c) {
    const base = tarefas.filter(t => t.estado === 'aberta' && t.prazo && visivel(P[t.p]) && A.dias(t.prazo) <= 7).sort((a, b) => a.prazo < b.prazo ? -1 : 1);
    const fila = [...base.filter(t => !pulados.includes(t.id)), ...pulados.map(T).filter(t => t && base.includes(t))];
    const atras = fila.filter(t => A.dias(t.prazo) < 0).length, hoje = fila.filter(t => A.dias(t.prazo) === 0).length;
    const partes = [];
    if (hoje) partes.push(`<strong>${hoje} tarefa${hoje > 1 ? 's' : ''} para hoje</strong>`);
    if (atras) partes.push(`<strong class="crit">${atras} atrasada${atras > 1 ? 's' : ''}</strong>`);
    if (!fila.length) {
      c.innerHTML = `<div class="foco"><div class="foco-card"><h3>${A.ic('feito')} Tudo em dia até ${A.fmt(A.somar(A.hojeIso(), 7))}</h3>
        <p class="secundario">Não há tarefas abertas para os próximos 7 dias${busca || filtro ? ' com essa busca' : ''}.</p>
        <div class="botoes"><button class="btn" type="button" id="verCartoes">${A.ic('cartoes')} Ver todos os processos</button></div></div></div>`;
      c.querySelector('#verCartoes').onclick = () => { pf().modoFazer = 'cartoes'; A.salvar(); A.mudar(desenharTudo); };
      return;
    }
    const t = fila[0], p = P[t.p], s = sitTarefa(t), prox = fila[1], pode = A.podeEditar();
    c.innerHTML = `<div class="foco"><p class="frase">${partes.length ? `Você tem ${partes.join(' e ')}.` : `Nada vence hoje. Há ${fila.length} tarefa${fila.length > 1 ? 's' : ''} para os próximos 7 dias.`}</p>
      <div class="foco-card" aria-live="polite" style="view-transition-name:foco-card">
        <span class="quando" style="${A.cores(s)}">${A.ic(A.SIT[s].ic)} ${A.maiusc(quando(t))}</span>
        <h3>${A.esc(t.o)}</h3>
        <p class="evento"><a class="link-proc" href="${linkProc(p)}">${A.esc(p.titulo)}</a>, ${distancia(p)}</p>
        <p class="por-que"><span>Regra: ${A.esc(t.regra)}.</span> ${seiHTML(p)}</p>
        ${!pode ? `<p class="secundario" style="margin-top:16px">${A.ic('olho')} Só leitura: as ações ficam com a pessoa dona do painel.</p>`
          : formAberto === t.id ? `<ul class="tarefas"><li class="tarefa" data-t="${t.id}" style="display:block"><input type="checkbox" hidden><label class="o-que" hidden></label>${formDespacho(t)}</li></ul>`
          : `<div class="botoes"><button class="btn btn-primario btn-grande" type="button" data-f="feita">${A.ic('check')} Feito</button><button class="btn btn-grande" type="button" data-f="despachar">${A.ic('enviar')} Despachei, esperar resposta</button><button class="btn btn-grande" type="button" data-f="pular">${A.ic('pular')} Pular por agora</button></div>`}
      </div>
      <div class="depois"><span>${prox ? `Depois desta: ${A.esc(prox.o)} (${A.esc(P[prox.p].titulo)})` : 'Esta é a última da semana.'}</span><span>1 de ${fila.length}</span></div></div>`;
    c.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
      const f = b.dataset.f;
      if (f === 'feita') marcarFeita(t, true);
      if (f === 'despachar') { formAberto = t.id; desenharTudo(); focarForm(t); }
      if (f === 'pular') { pulados = pulados.filter(x => x !== t.id); pulados.push(t.id); atualizar(); A.avisar('Pulada. Ela volta no fim da fila.'); }
    });
  }

  /* ---------- Lateral ---------- */
  function desenharLateral() {
    const pode = A.podeEditar();
    const el = vistaEl.querySelector('#aguardando');
    const lista = despachos.filter(a => visivel(P[a.p])).sort((a, b) => a.enviado < b.enviado ? -1 : 1);
    el.innerHTML = lista.length ? lista.map(a => {
      const n = -A.dias(a.enviado);
      return `<li><div class="linha1"><a class="link-proc t" href="${linkProc(P[a.p])}">${A.esc(P[a.p].titulo)}</a><span class="n ${n > 15 ? 'muito' : n > 7 ? 'alto' : ''}">${n > 7 ? A.ic(n > 15 ? 'alerta' : 'relogio', 'ic-sm') : ''} ${A.haDias(n)}</span></div>
        <div class="secundario">${a.item ? A.esc(a.item.nome) + '. ' : ''}${A.esc(a.setor)}, enviado em ${A.fmt(a.enviado)}</div>
        ${a.texto ? `<p class="combinado-lat">${A.esc(a.texto)}</p>` : ''}
        ${pode ? `<button type="button" class="btn-texto" data-resp="${a.id}">${A.ic('check', 'ic-sm')}Chegou resposta</button>` : ''}</li>`;
    }).join('') : '<li class="vazio">Nenhum despacho esperando. Use "Despachei" numa tarefa para acompanhar a resposta aqui.</li>';
    el.querySelectorAll('[data-resp]').forEach(b => b.onclick = () => chegouResposta(despachos.find(a => a.id === b.dataset.resp)));
    const se = vistaEl.querySelector('#semEvento');
    const limites = procs.filter(p => !p.evento && visivel(p)).sort((a, b) => (a.limite || '9') < (b.limite || '9') ? -1 : 1);
    se.innerHTML = limites.length ? limites.map(p => `<li><div class="linha1"><a class="link-proc t" href="${linkProc(p)}">${A.esc(p.titulo)}</a><span class="n">${p.limite ? 'até ' + A.fmt(p.limite) : 'sem data'}</span></div>
      <div class="secundario" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px">${A.esc(p.tipo || '')} ${A.seloSit(sit(p))} ${seiHTML(p)}</div></li>`).join('') : '<li class="vazio">Nenhum processo só com data limite.</li>';
    A.ligarCopiaSei(se);
    const n = A.ativos().reduce((s, p) => s + A.mudancas(p).length, 0);
    vistaEl.querySelector('#qtdPlanilha').textContent = n;
    vistaEl.querySelector('#txtPlanilha').textContent = n ? `${n === 1 ? 'alteração' : 'alterações'} para passar para a planilha do OneDrive` : 'A planilha está em dia com o sistema.';
  }

  /* ---------- Layout e organização ---------- */
  function aplicarLayout() {
    const P0 = pf(), b = P0.blocos, quadro = P0.modoFazer === 'quadro';
    const areas = vistaEl.querySelector('#areas'), agenda = vistaEl.querySelector('#blocoAgenda'), trabalho = vistaEl.querySelector('#trabalho');
    if (P0.posAgenda === 'cima') areas.prepend(agenda); else areas.append(agenda);
    agenda.hidden = !b.agenda;
    vistaEl.querySelector('#corpoAgenda').classList.toggle('fechado', !P0.agendaAberta);
    vistaEl.querySelector('#corpoAgendaDentro').inert = !P0.agendaAberta;
    const rec = vistaEl.querySelector('#btnRecolher');
    rec.setAttribute('aria-expanded', P0.agendaAberta); rec.title = P0.agendaAberta ? 'Recolher agenda' : 'Mostrar agenda';
    rec.querySelector('.sr').textContent = rec.title; rec.querySelector('svg').style.transform = P0.agendaAberta ? '' : 'rotate(180deg)';
    vistaEl.querySelector('#blocoFazer').hidden = !b.fazer;
    const lateral = vistaEl.querySelector('#lateral');
    P0.ordem.forEach(k => lateral.append(vistaEl.querySelector('#' + ID_LAT[k])));
    vistaEl.querySelector('#blocoEsperando').hidden = !b.esperando || quadro;
    vistaEl.querySelector('#blocoSemEvento').hidden = !b.semEvento;
    vistaEl.querySelector('#blocoPlanilha').hidden = !b.planilha || A.semPlanilha();
    const temLat = (b.esperando && !quadro) || b.semEvento || b.planilha;
    lateral.hidden = !temLat;
    trabalho.classList.toggle('largo', quadro || !b.fazer || !temLat);
    trabalho.hidden = !b.fazer && !temLat;
  }
  function desenharOrganizar() {
    const el = vistaEl.querySelector('#organizar'), P0 = pf();
    el.hidden = !orgAberto;
    vistaEl.querySelector('#btnOrganizar').setAttribute('aria-expanded', orgAberto);
    if (!orgAberto) { el.innerHTML = ''; return; }
    el.innerHTML = `<h2 id="t-organizar">Organizar painel <span class="secundario">As mudanças aparecem na hora e ficam salvas.</span></h2>
      <fieldset><legend>Blocos que aparecem</legend>
        ${[['agenda', 'Agenda'], ['fazer', 'O que fazer'], ['esperando', 'Esperando resposta'], ['semEvento', 'Sem evento, com data limite'], ['planilha', 'Alterações para a planilha']].filter(([k]) => k !== 'planilha' || !A.semPlanilha()).map(([k, n]) => `<label class="opcao"><input type="checkbox" data-bloco="${k}" ${P0.blocos[k] ? 'checked' : ''}> ${n}${k === 'esperando' && P0.modoFazer === 'quadro' ? ' <small>(no modo Quadro, fica dentro do quadro)</small>' : ''}</label>`).join('')}</fieldset>
      <fieldset><legend>Ordem da coluna ao lado</legend><ul class="ordem">${P0.ordem.map((k, i) => k === 'planilha' && A.semPlanilha() ? '' : `<li><span>${NOMES_LAT[k]}</span>
        <button class="btn-icone" type="button" data-mover="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir ${NOMES_LAT[k]}">${A.ic('cima')}</button>
        <button class="btn-icone" type="button" data-mover="${i}" data-dir="1" ${i === P0.ordem.length - 1 ? 'disabled' : ''} aria-label="Descer ${NOMES_LAT[k]}">${A.ic('baixo')}</button></li>`).join('')}</ul></fieldset>
      <fieldset><legend>A agenda fica</legend><label class="opcao"><input type="radio" name="posAgenda" value="cima" ${P0.posAgenda === 'cima' ? 'checked' : ''}> Em cima</label><label class="opcao"><input type="radio" name="posAgenda" value="baixo" ${P0.posAgenda === 'baixo' ? 'checked' : ''}> Embaixo</label></fieldset>
      <fieldset><legend>Número SEI</legend><label class="opcao"><input type="checkbox" id="optSei" ${P0.seiCompleto ? 'checked' : ''}> Mostrar o número completo</label></fieldset>
      <div class="rodape"><button class="btn" type="button" id="btnPadrao">${A.ic('desfazer')} Voltar ao padrão</button><button class="btn btn-primario" type="button" id="btnFecharOrg">Pronto</button></div>`;
    el.querySelectorAll('[data-bloco]').forEach(cb => cb.onchange = () => { P0.blocos[cb.dataset.bloco] = cb.checked; A.salvar(); desenharTudo(); });
    el.querySelectorAll('[name=posAgenda]').forEach(r => r.onchange = () => { P0.posAgenda = r.value; A.salvar(); aplicarLayout(); });
    el.querySelector('#optSei').onchange = e => { P0.seiCompleto = e.target.checked; A.salvar(); desenharTudo(); };
    el.querySelectorAll('[data-mover]').forEach(b => b.onclick = () => {
      const i = +b.dataset.mover, dir = +b.dataset.dir, j = i + dir;
      [P0.ordem[i], P0.ordem[j]] = [P0.ordem[j], P0.ordem[i]]; A.salvar(); desenharOrganizar(); aplicarLayout();
      const alvo = el.querySelector(`[data-mover="${j}"][data-dir="${dir}"]`); (alvo && !alvo.disabled ? alvo : el.querySelector(`[data-mover="${j}"]:not(:disabled)`))?.focus();
    });
    el.querySelector('#btnPadrao').onclick = () => {
      const antes = A.clonar(P0);
      A.prefs().painel = A.clonar(PADRAO); A.salvar(); desenharTudo();
      A.avisar('Painel voltou ao padrão.', () => { A.prefs().painel = antes; });
    };
    el.querySelector('#btnFecharOrg').onclick = () => { orgAberto = false; desenharOrganizar(); vistaEl.querySelector('#btnOrganizar').focus(); };
  }
  function alternarFiltro(pid) {
    filtro = pid && filtro !== pid ? pid : null;
    atualizar();
    if (filtro && pf().blocos.fazer) setTimeout(() => irPara('blocoFazer'), 50);
  }

  /* ---------- Tudo ---------- */
  function desenharTudo() {
    if (!vistaEl || !vistaEl.isConnected) return;
    derivar();
    aplicarLayout();
    desenharResumo();
    const av = vistaEl.querySelector('#avisoBusca');
    if (busca) { av.hidden = false; av.innerHTML = `${A.ic('busca')} Mostrando só o que tem "${A.esc(busca)}". <button type="button" class="btn-texto" id="limparBusca">Limpar busca</button>`; av.querySelector('#limparBusca').onclick = () => { busca = ''; const i = document.getElementById('buscaTopo'); if (i) i.value = ''; desenharTudo(); }; }
    else av.hidden = true;
    if (pf().blocos.agenda && pf().agendaAberta) desenharAgenda();
    if (pf().blocos.fazer) desenharFazer();
    desenharLateral();
    if (orgAberto) desenharOrganizar();
  }
  A.buscarNoPainel = texto => { busca = A.semAcento(texto); desenharTudo(); };

  A.telaPainel = vista => {
    vistaEl = vista;
    const dono = A.dono(), hoje = A.hojeIso(), leit = A.estado.leituras[dono.id];
    const nProc = A.ativos().length;
    vista.innerHTML = `<main>
      <section class="cabeca">
        <div><div class="dia-semana">${A.maiusc(A.semana(hoje))}</div><h1 class="data">${A.extenso(hoje)}</h1></div>
        <div class="cabeca-acoes">
          <div class="secundario"><strong style="color:var(--tinta)">${nProc} processo${nProc === 1 ? '' : 's'} ${A.sessao.acesso === 'dono' ? (nProc === 1 ? 'seu' : 'seus') : 'de ' + A.esc(dono.ini)}</strong>${leit ? `, pela planilha lida ${leit.em.slice(0, 10) === hoje ? 'hoje' : 'em ' + A.fmt(leit.em.slice(0, 10))} às ${leit.em.slice(11, 16)}` : ', planilha ainda não lida'}</div>
          <div class="botoes">
            <button class="btn" type="button" id="btnOrganizar" aria-expanded="false" aria-controls="organizar">${A.ic('ajustes')} Organizar painel</button>
            <a class="btn" href="#/planilha" data-editar>${A.ic('atualizar')} Ler planilha</a>
            <a class="btn" href="#/processos/novo" data-editar>${A.ic('mais')} Novo processo</a>
          </div>
        </div>
      </section>
      <section class="organizar" id="organizar" hidden aria-labelledby="t-organizar"></section>
      <nav class="resumo" id="resumo" aria-label="Resumo do dia"></nav>
      <p class="aviso-busca" id="avisoBusca" hidden></p>
      ${nProc ? '' : `<section class="bloco boas-vindas" style="margin-top:24px"><h2>Ainda não há processos aqui</h2>
        <p class="secundario">Para começar:</p><ol><li>Baixe a planilha de controle do OneDrive (Arquivo → Salvar como → Baixar uma cópia).</li><li>Em <strong>Ler planilha</strong>, escolha o arquivo e a sua aba.</li><li>Confira e confirme. Os processos aparecem aqui, já com os passos das Regras de prazo.</li></ol>
        <div class="form-botoes"><a class="btn btn-primario btn-grande" href="#/planilha" data-editar>${A.ic('atualizar')} Ler a planilha agora</a><a class="btn btn-grande" href="#/processos/novo" data-editar>${A.ic('mais')} Criar um processo à mão</a><a class="btn btn-grande" href="#/regras">${A.ic('regras')} Ver as regras de prazo</a></div></section>`}
      <div id="areas" ${nProc ? '' : 'hidden'}>
        <section class="bloco" id="blocoAgenda" aria-labelledby="t-agenda">
          <div class="bloco-topo"><h2 id="t-agenda">Agenda</h2><div class="acoes"><div class="modo" id="modoAgenda"></div>
            <button class="btn-icone" type="button" id="btnRecolher" aria-expanded="true" aria-controls="corpoAgenda">${A.ic('recolher')}<span class="sr">Recolher agenda</span></button></div></div>
          <div id="corpoAgenda" class="recolhivel"><div id="corpoAgendaDentro"><div class="legenda" id="legenda"></div><div id="agendaConteudo"></div></div></div>
        </section>
        <div id="trabalho">
          <section id="blocoFazer" aria-labelledby="t-fazer"><div class="secao-topo"><h2 id="t-fazer">O que fazer</h2><div class="modo" id="modoFazer"></div></div>
            <div class="filtro-ativo" id="filtroAtivo" hidden></div><div id="fazerConteudo"></div></section>
          <aside id="lateral" aria-label="Acompanhamento">
            <section id="blocoEsperando" aria-labelledby="t-esperando"><h2 id="t-esperando">Esperando resposta</h2><p class="secundario apoio-txt">Despachos enviados que ainda não voltaram.</p><ul class="lista-simples" id="aguardando"></ul></section>
            <section id="blocoSemEvento" aria-labelledby="t-semevento"><h2 id="t-semevento">Sem evento, com data limite</h2><p class="secundario apoio-txt">Certificações, gratificações e outros.</p><ul class="lista-simples" id="semEvento"></ul></section>
            <section id="blocoPlanilha" aria-labelledby="t-planilha"><h2 id="t-planilha" class="sr">Alterações para a planilha</h2>
              <div class="planilha-resumo"><div class="numero" id="qtdPlanilha">0</div><div><p id="txtPlanilha"></p><a class="btn" href="#/planilha">${A.ic('lista')} Ver o que mudar</a></div></div></section>
          </aside>
        </div>
      </div>
    </main>`;
    vista.querySelector('#btnOrganizar').onclick = () => { orgAberto = !orgAberto; desenharOrganizar(); if (orgAberto) vista.querySelector('#organizar input')?.focus(); };
    vista.querySelector('#btnRecolher').onclick = () => { const P0 = pf(); P0.agendaAberta = !P0.agendaAberta; A.salvar(); if (P0.agendaAberta) desenharAgenda(); else fecharExplica(); aplicarLayout(); };
    if (orgAberto) desenharOrganizar();
    if (!nProc) { derivar(); desenharResumo(); return; }
    desenharTudo();
    const P0 = A.prefs();
    if (P0.legendaVista !== hoje && pf().blocos.agenda && pf().agendaAberta) { P0.legendaVista = hoje; A.salvar(); setTimeout(() => abrirExplica(true), 900); }
  };
  A.redesenharLinhaPainel = () => { if (vistaEl && vistaEl.isConnected && pf().modoAgenda === 'linha' && pf().blocos.agenda && pf().agendaAberta && A.ativos().length) desenharAgenda(); };
})(window.App);
