/* Agenda da equipe (sistema novo): calendário em forma de folha impressa.
   Cada evento é um processo do sistema (mesmas contas, mesmos dados): título, interno/externo,
   público, datas, horário, local e um checklist que a própria pessoa escreve.
   Os processos antigos aparecem com todos os itens do checklist deles. */
(function () {
  const A = window.App;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const SEM = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const PUB = { membros: 'M', servidores: 'S', ambos: 'MS' }, PUB_INV = { M: 'membros', S: 'servidores', MS: 'ambos' };
  const NOME_PUB = { M: 'Membros', S: 'Servidores', MS: 'Membros e servidores' };
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dt = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  const soma = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
  const seg = s => { const d = dt(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
  const dif = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
  const curto = s => { const d = dt(s); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
  const esc = s => A.esc(s);
  const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const ehData = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  let HOJE = iso(new Date());

  /* ---------- processos vistos como eventos ---------- */
  let PESSOAS = {}, eventos = [];
  const pessoa = id => PESSOAS[id] || { ini: '?', cor: '#4F5B66' };
  function paraEvento(p) {
    const grupo = A.grupoDoTipo ? A.grupoDoTipo(p) : null;
    const itens = (p.frentes || []).filter(f => !f.na).flatMap(f => f.itens.filter(i => !i.na).map(i => ({
      id: i.id, txt: i.nome, feito: i.estado === 'feita', prazo: A.prazo(p, i) || '', cal: !!i.noCal, acomp: i.quem === 'acompanha',
    })));
    const dias = Array.isArray(p.dias) && p.dias.length ? p.dias.filter(ehData).slice().sort() : null;
    return { id: p.id, proc: p, dias, dono: p.dono, titulo: p.titulo, amb: p.ambito === 'externo' || (!p.ambito && grupo === 'externo') ? 'E' : 'I',
      pub: PUB[p.publico] || '', ini: p.inicio, fim: ehData(p.fim) && p.fim >= p.inicio ? p.fim : p.inicio, hora: p.horario || '', local: p.local || '', itens };
  }
  function carregar() {
    HOJE = iso(new Date());
    PESSOAS = {};
    A.estado.perfis.forEach(p => { PESSOAS[p.id] = { ini: p.ini, cor: p.cor || '#4F5B66' }; });
    eventos = A.estado.processos.filter(p => ehData(p.inicio)).map(paraEvento);
  }
  const eu = () => A.euId();
  const admin = () => !!(A.nuvem && A.nuvem.admin);
  const meu = e => e.dono === eu();
  const pode = e => meu(e) || admin();
  const sig = e => [e.amb, e.pub].filter(Boolean).join(' ');
  const pc = e => pessoa(e.dono).cor;
  const feitoTudo = e => e.itens.length > 0 && e.itens.every(i => i.feito);
  // dias separados viram trechos: "4–5 nov · 26–27 nov"
  function trechosDe(dias) {
    const out = [];
    dias.forEach(d => { const u = out[out.length - 1]; if (u && dif(u[1], d) === 1) u[1] = d; else out.push([d, d]); });
    return out;
  }
  const faixaTxt = ([a, b]) => a === b ? curto(a) : a.slice(0, 7) === b.slice(0, 7) ? `${dt(a).getDate()}–${curto(b)}` : `${curto(a)} – ${curto(b)}`;
  const intervalo = e => e.dias ? trechosDe(e.dias).map(faixaTxt).join(' · ') : e.ini === e.fim ? curto(e.ini) : `${curto(e.ini)} – ${curto(e.fim)}`;
  const ocorre = (e, d) => e.dias ? e.dias.includes(d) : e.ini <= d && d <= e.fim;
  const duracao = e => e.dias ? e.dias.length : dif(e.ini, e.fim) + 1;

  /* ---------- mudanças (gravam no processo e sincronizam) ---------- */
  const toque = p => { p.atualizadoEm = new Date().toISOString(); A.salvar(); };
  function achar(p, id) { for (const f of p.frentes) { const i = f.itens.find(x => x.id === id); if (i) return { f, i }; } return null; }
  function frenteLivre(p) {
    let f = p.frentes.find(x => x.modeloId === 'livre');
    if (!f) { f = { id: 'f' + A.uid(), modeloId: 'livre', nome: 'Checklist', fase: 'inicio', icone: 'lista', coluna: null, na: false, itens: [] }; p.frentes.push(f); }
    return f;
  }
  function marcar(e, id) {
    const a = achar(e.proc, id); if (!a) return;
    const feita = a.i.estado !== 'feita';
    a.i.estado = feita ? 'feita' : 'aberta'; a.i.feitoEm = feita ? HOJE : null;
    A.anotar(e.proc, 'Passo', `${feita ? 'Feito' : 'Desmarcado'}: ${a.i.nome}.`);
    toque(e.proc);
  }
  function acrescentar(e, txt, prazo, cal) {
    frenteLivre(e.proc).itens.push({ id: 'i' + A.uid(), modeloId: null, nome: txt,
      regra: prazo ? { dias: 0, quando: 'antes', ref: 'inicio' } : { dias: 0, quando: 'antes', ref: 'inicio', semPrazo: true },
      ...(prazo ? { prazoFixo: prazo } : {}), ...(prazo && cal ? { noCal: true } : {}),
      estado: 'aberta', coluna: null, na: false, editado: true, quem: 'faz', obrig: false });
    A.anotar(e.proc, 'Passo', `Item acrescentado: ${txt}.`);
    toque(e.proc);
  }
  function tirar(e, id) {
    const a = achar(e.proc, id); if (!a) return;
    a.f.itens = a.f.itens.filter(x => x !== a.i);
    A.anotar(e.proc, 'Passo', `Item tirado: ${a.i.nome}.`);
    toque(e.proc);
  }
  function salvarEvento(d, existente) {
    const campos = { titulo: d.titulo, inicio: d.ini, fim: d.fim, horario: d.hora, local: d.local, ambito: d.amb === 'E' ? 'externo' : 'interno', publico: PUB_INV[d.pub] };
    if (!existente) {
      const p = A.novoProcesso({ tipoId: d.amb === 'E' ? 'externo' : 'interno', ...campos }, eu());
      p.frentes = []; frenteLivre(p); // o checklist começa vazio
      if (d.dias) p.dias = d.dias;
      A.estado.processos.push(p); A.salvar();
      return p.id;
    }
    const p = existente.proc;
    if (p.inicio !== d.ini) A.anotar(p, 'Sistema', `Data do evento mudou de ${A.fmtAno(p.inicio)} para ${A.fmtAno(d.ini)}.`);
    Object.assign(p, campos);
    if (d.dias) p.dias = d.dias; else delete p.dias;
    if (A.aplicarPublico) A.aplicarPublico(p);
    toque(p);
    return p.id;
  }

  /* ---------- estado da tela ---------- */
  let vista = 'mes', ref = HOJE, aberto = null, formando = null, colando = null, soMeus = false, popDia = null, popMais = null;
  let tipoFiltro = 'todos';
  try { const v = sessionStorage.getItem('folha-vista'); if (['ano', 'mes', 'semana', 'lista'].includes(v)) vista = v; const f = sessionStorage.getItem('folha-tipo'); if (['todos', 'I', 'E'].includes(f)) tipoFiltro = f; } catch (e) {}
  // o que cada pessoa esconde do calendário e o jeito de ver o mês ficam nas preferências dela (os colegas não são afetados)
  const prefs = () => (A.prefs ? A.prefs() : {});
  const ocultos = () => { const p = prefs(); return Array.isArray(p.agendaOcultos) ? p.agendaOcultos : []; };
  const oculto = e => ocultos().includes(e.id);
  const modoMes = () => prefs().agendaModoMes === 'dia' ? 'dia' : 'faixas';
  const filtrados = () => eventos.filter(e => (!soMeus || meu(e)) && (tipoFiltro === 'todos' || e.amb === tipoFiltro));
  const visiveis = () => filtrados().filter(e => !oculto(e));
  function alternarOculto(id) {
    const p = prefs(), l = ocultos().slice(), k = l.indexOf(id);
    if (k >= 0) l.splice(k, 1); else l.push(id);
    p.agendaOcultos = l.filter(x => eventos.some(e => e.id === x));
    A.salvar();
  }
  const prazosDe = (a, b) => visiveis().flatMap(e => e.itens.filter(i => i.cal && i.prazo && !i.feito && i.prazo >= a && i.prazo <= b).map(i => ({ e, i })));
  const $ = s => document.querySelector(s);
  const folha = () => $('#folha'), lado = () => $('#lado');

  function periodo() {
    const d = dt(ref);
    if (vista === 'ano') return { a: `${d.getFullYear()}-01-01`, b: `${d.getFullYear()}-12-31`, nome: String(d.getFullYear()) };
    if (vista === 'semana') { const a = seg(ref), b = soma(a, 6); return { a, b, nome: `${curto(a)} – ${curto(b)}` }; }
    const a = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, b = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { a, b, nome: `${MESES[d.getMonth()]} ${d.getFullYear()}` };
  }
  const noPeriodo = (e, a, b) => e.dias ? e.dias.some(d => d >= a && d <= b) : e.fim >= a && e.ini <= b;
  function andar(n) {
    const d = dt(ref);
    if (vista === 'ano') d.setFullYear(d.getFullYear() + n);
    else if (vista === 'semana') d.setDate(d.getDate() + 7 * n);
    else { d.setDate(1); d.setMonth(d.getMonth() + n); }
    ref = iso(d); desenhar();
  }

  const legenda = () => `<div class="legenda" aria-label="Legenda">${A.estado.perfis.slice().sort((a, b) => a.ini.localeCompare(b.ini)).map(p => `<span><i style="--pc:${p.cor || '#4F5B66'}"></i><b>${esc(p.ini)}</b></span>`).join('')}<span><b>I</b> interno · <b>E</b> externo</span><span><b>M</b> membros · <b>S</b> servidores · <b>MS</b> ambos</span></div>`;
  const filtroTxt = () => [tipoFiltro === 'I' ? 'só eventos internos' : tipoFiltro === 'E' ? 'só eventos externos' : '', (() => { const n = filtrados().filter(oculto).length; return n ? `${n} oculto${n > 1 ? 's' : ''}` : ''; })(), soMeus ? 'só os de ' + pessoa(eu()).ini : ''].filter(Boolean).join(' · ');
  const cabeca = (titulo, sub) => `<header class="folha-cab"><h1><small>${sub}${filtroTxt() ? ' · ' + filtroTxt() : ''}</small>${titulo}</h1>${legenda()}</header>`;
  const rodape = () => `<p class="rodape-imp">Agenda da equipe · impressa em ${A.fmtAno(HOJE)}</p>`;

  /* ---------- mês ---------- */
  function pedacos(e, ws) { // trechos contínuos do evento dentro da semana
    const we = soma(ws, 6);
    if (!e.dias) return noPeriodo(e, ws, we) ? [{ c0: Math.max(0, dif(ws, e.ini)), c1: Math.min(6, dif(ws, e.fim)), esq: e.ini < ws, dir: e.fim > we }] : [];
    const out = [];
    e.dias.filter(d => d >= ws && d <= we).map(d => dif(ws, d)).forEach(c => { const u = out[out.length - 1]; if (u && c === u.c1 + 1) u.c1 = c; else out.push({ c0: c, c1: c }); });
    out.forEach(x => { x.esq = x.c0 === 0 && e.dias.includes(soma(ws, -1)); x.dir = x.c1 === 6 && e.dias.includes(soma(ws, 7)); });
    return out;
  }
  function faixas(ws, lista) {
    const lanes = [];
    lista.flatMap(e => pedacos(e, ws).map(x => ({ e, ...x })))
      .sort((x, y) => x.e.ini.localeCompare(y.e.ini) || (y.c1 - y.c0) - (x.c1 - x.c0) || x.c0 - y.c0)
      .forEach(x => {
        let l = lanes.findIndex(ln => ln.every(o => o.c1 < x.c0 || o.c0 > x.c1));
        if (l < 0) { lanes.push([]); l = lanes.length - 1; }
        lanes[l].push(x);
      });
    return lanes;
  }
  /* O mês cabe inteiro na tela (e numa folha A4 deitada ao imprimir): a altura de cada semana é
     calculada pelo espaço que sobra. Eventos de 7 dias ou mais viram uma faixa fina no alto da semana,
     para não roubar as linhas dos eventos curtos. */
  const LONGO = 7;
  let imprimindo = false, corrMes = 0;
  /* Na impressão, cada evento do mês ganha um número; embaixo do calendário, a legenda traz o nome
     inteiro, os dias, o local e o responsável. Assim o nome cortado no quadradinho não atrapalha. */
  let NUMS = new Map();
  function numerar(p) {
    const l = visiveis().filter(e => noPeriodo(e, p.a, p.b)).sort((x, y) => x.ini.localeCompare(y.ini) || x.titulo.localeCompare(y.titulo));
    NUMS = new Map(l.map((e, k) => [e.id, k + 1]));
    return l;
  }
  const nev = e => NUMS.has(e.id) ? `<span class="nev" aria-hidden="true">${NUMS.get(e.id)}</span>` : '';
  const legendaEventos = l => l.length ? `<section class="legenda-ev" aria-label="Legenda dos eventos"><h2>Eventos do mês</h2><ol>${l.map(e => `<li><span class="nev">${NUMS.get(e.id)}</span><span class="sig grifo" style="--pc:${pc(e)}">${sig(e)}</span><span class="le-t"><b>${esc(e.titulo)}</b> · ${intervalo(e)}${[e.local, e.hora].filter(Boolean).map(x => ' · ' + esc(x)).join('')} · ${esc(pessoa(e.dono).ini)}${soMeus && e.proc.sei ? ` · <b class="le-sei">SEI ${esc(A.seiCurto(e.proc.sei))}</b>` : ''}</span></li>`).join('')}</ol></section>` : '';
  // dois tipos de impressão: a folha da equipe é só o calendário; a folha individual ("Só os meus")
  // traz números e a legenda com nome inteiro, dias, local e SEI de cada evento
  // altura que a legenda vai ocupar na folha impressa (duas colunas, uma linha e meia por evento em média)
  const alturaLegenda = n => n ? 30 + Math.ceil(n / 2) * (soMeus ? 24 : 19) : 0;
  let nLegenda = 0;
  function medidasMes(semanas) {
    const fixo = imprimindo || matchMedia('(min-width: 1021px)').matches;
    const m = imprimindo ? { num: 22, linha: 20, faixa: 14 } : { num: 30, linha: 26, faixa: 16 };
    if (!fixo) return { ...m, altura: null, linhas: 3 };
    const util = imprimindo ? 570 - alturaLegenda(nLegenda) : folha().clientHeight - 18 - 70 - 28 - corrMes; // folha − margens − cabeçalho − dias da semana
    const altura = Math.max(imprimindo ? 58 : 72, Math.floor(util / semanas));
    return { ...m, altura, linhas: 0 };
  }
  /* Impressão: nenhum evento fica escondido e o mês cabe sempre numa folha só. Cada semana recebe a
     altura de que precisa; se não couber, linhas e letras encolhem um pouco (até 80%); se ainda assim
     não couber, a folha inteira é reduzida na proporção certa, como o "ajustar à página" da impressora. */
  const PAGINA = 590;
  function planoImpressao(alturaDe, n) {
    const util = PAGINA - alturaLegenda(nLegenda);
    let esc = 1, tot = 0;
    for (let i = 0; i < n; i++) tot += alturaDe(i, 1);
    if (tot > util) { esc = Math.max(0.8, util / tot); tot = 0; for (let i = 0; i < n; i++) tot += alturaDe(i, esc); }
    const zoom = tot > util ? Math.max(0.35, (util / tot) * 0.98) : 1;
    const folga = tot < util ? (util - tot) / n : 0, alturas = [];
    for (let i = 0; i < n; i++) alturas.push(Math.floor(alturaDe(i, esc) + folga));
    return { esc, zoom, alturas };
  }
  // "+N": lista de todos os eventos daquele dia, sem sair do mês
  function maisHTML(d, ws, extra) {
    if (!extra) return '';
    const doDia = visiveis().filter(e => ocorre(e, d)).sort((x, y) => x.ini.localeCompare(y.ini) || x.titulo.localeCompare(y.titulo));
    return `<span class="mais-w"><button type="button" class="mais" data-maisdia="${d}" aria-expanded="${popMais === d}" aria-label="Mais ${extra} evento${extra > 1 ? 's' : ''} neste dia: ver todos">+${extra}</button>${popMais === d ? `<div class="prazo-pop mais-pop" role="dialog" aria-label="Eventos de ${curto(d)}"><p class="mp-t">${dt(d).getDate()} de ${MESES[dt(d).getMonth()]} · ${doDia.length} eventos</p>${doDia.map(e => `<button type="button" data-abrir="${e.id}"><b><span class="sig grifo" style="--pc:${pc(e)}">${sig(e)}</span> ${esc(e.titulo)}</b><small>${intervalo(e)} · ${esc(pessoa(e.dono).ini)}</small></button>`).join('')}<button type="button" class="mp-semana" data-semana="${ws}">Ver a semana inteira</button></div>` : ''}</span>`;
  }
  function telaMesDia() {
    const p = periodo(), sems = [];
    for (let ws = seg(p.a); ws <= p.b; ws = soma(ws, 7)) sems.push(ws);
    const doMes = soMeus ? numerar(p) : (NUMS = new Map(), []); nLegenda = doMes.length; // números e legenda só na folha individual
    const md = medidasMes(sems.length), lista = visiveis().slice().sort((x, y) => x.ini.localeCompare(y.ini) || x.titulo.localeCompare(y.titulo));
    const chip = imprimindo ? 18 : 26;
    // na impressão: quantos eventos tem o dia mais cheio de cada semana
    const maxDia = sems.map(ws => Math.max(0, ...Array.from({ length: 7 }, (_, k) => lista.filter(e => ocorre(e, soma(ws, k))).length)));
    const plano = imprimindo ? planoImpressao((i, esc) => md.num + 6 + Math.max(1, maxDia[i]) * chip * esc, sems.length) : null;
    if (plano) { folha().style.setProperty('--esc', plano.esc); folha().style.setProperty('--zoom', plano.zoom); }
    let html = cabeca(MESES[dt(ref).getMonth()], `Agenda da equipe · ${dt(ref).getFullYear()}`);
    html += `<div class="dias-sem" aria-hidden="true">${SEM.map(s => `<span>${s}</span>`).join('')}</div>`;
    sems.forEach((ws, si) => {
      const alt = plano ? plano.alturas[si] : md.altura;
      const cabe = plano ? 999 : md.altura ? Math.max(1, Math.floor((md.altura - md.num - 4) / chip)) : 4;
      html += `<div class="semana semana-dia${popMais && popMais >= ws && popMais <= soma(ws, 6) ? ' com-pop' : ''}" data-ws="${ws}" style="${alt ? `height:${alt}px` : ''}">`;
      for (let k = 0; k < 7; k++) {
        const d = soma(ws, k), pz = prazosDe(d, d), doDia = lista.filter(e => ocorre(e, d));
        const mostra = doDia.slice(0, cabe), extra = doDia.length - mostra.length; // o +N fica na linha do número, não ocupa lugar
        html += `<div class="cel${d.slice(0, 7) !== p.a.slice(0, 7) ? ' fora' : ''}${k > 4 ? ' fds' : ''}${d === HOJE ? ' hoje' : ''}" style="grid-column:${k + 1}">
          <span class="num"${d === HOJE ? ' aria-label="hoje"' : ''}>${dt(d).getDate()}</span>
          <span class="cel-extra">${pz.length ? `<span class="prazos-dia"><button type="button" class="prazo-tag" data-dia="${d}" aria-expanded="${popDia === d}">${ic('flag')}${pz.length}<span> prazo${pz.length > 1 ? 's' : ''}</span></button>
            ${popDia === d ? `<div class="prazo-pop">${pz.map(({ e, i }) => `<button type="button" data-abrir="${e.id}"><b>${esc(i.txt)}</b><small>${sig(e)} · ${esc(e.titulo)}</small></button>`).join('')}</div>` : ''}</span>` : ''}
          ${maisHTML(d, ws, extra)}</span>
          <span class="dia-lista">${mostra.map(e => `<button type="button" class="barra-dia${feitoTudo(e) ? ' feito' : ''}" style="--pc:${pc(e)}" data-abrir="${e.id}" title="${esc(`${sig(e)} – ${e.titulo} (${intervalo(e)})`)}">${nev(e)}<span class="sig">${sig(e)}</span><span class="t">${esc(e.titulo)}</span></button>`).join('')}</span>
        </div>`;
      }
      html += `</div>`;
    });
    folha().innerHTML = html + legendaEventos(doMes) + rodape();
    if (md.altura && !imprimindo && !telaMesDia.ajustando) {
      const f = folha(), sobra = f.scrollHeight - f.clientHeight;
      if (sobra > 0 || sobra < -8) { corrMes = Math.max(-200, corrMes + sobra + 2); telaMesDia.ajustando = true; telaMesDia(); telaMesDia.ajustando = false; }
    }
  }
  function telaMes() {
    if (modoMes() === 'dia') return telaMesDia();
    const p = periodo(), sems = [];
    for (let ws = seg(p.a); ws <= p.b; ws = soma(ws, 7)) sems.push(ws);
    const doMes = soMeus ? numerar(p) : (NUMS = new Map(), []); nLegenda = doMes.length; // números e legenda só na folha individual
    const md = medidasMes(sems.length), lista = visiveis();
    const longos = lista.filter(e => duracao(e) >= LONGO), curtos = lista.filter(e => duracao(e) < LONGO);
    let html = cabeca(MESES[dt(ref).getMonth()], `Agenda da equipe · ${dt(ref).getFullYear()}`);
    html += `<div class="dias-sem" aria-hidden="true">${SEM.map(s => `<span>${s}</span>`).join('')}</div>`;
    const porSemana = sems.map(ws => ({ fl: faixas(ws, longos), fc: faixas(ws, curtos) }));
    const plano = imprimindo ? planoImpressao((i, esc) => md.num + 6 + porSemana[i].fl.length * md.faixa * esc + Math.max(1, porSemana[i].fc.length) * md.linha * esc, sems.length) : null;
    if (plano) { folha().style.setProperty('--esc', plano.esc); folha().style.setProperty('--zoom', plano.zoom); }
    sems.forEach((ws, si) => {
      const { fl, fc } = porSemana[si];
      const nFl = plano ? fl.length : Math.min(fl.length, 3);
      let nFc = md.linhas;
      if (plano) nFc = Math.max(1, fc.length);
      else if (md.altura) nFc = Math.max(1, Math.floor((md.altura - md.num - 4 - nFl * md.faixa) / md.linha));
      const faixaPx = plano ? +(md.faixa * plano.esc).toFixed(1) : md.faixa, linhaPx = plano ? +(md.linha * plano.esc).toFixed(1) : md.linha, altSem = plano ? plano.alturas[si] : md.altura;
      const escondidos = k => fl.slice(nFl).filter(ln => ln.some(x => x.c0 <= k && x.c1 >= k)).length + fc.slice(nFc).filter(ln => ln.some(x => x.c0 <= k && x.c1 >= k)).length;
      const linhas = `${md.num}px${nFl ? ` repeat(${nFl}, ${faixaPx}px)` : ''} repeat(${nFc}, ${linhaPx}px) minmax(4px, 1fr)`;
      html += `<div class="semana${popMais && popMais >= ws && popMais <= soma(ws, 6) ? ' com-pop' : ''}" data-ws="${ws}" style="grid-template-rows:${linhas}${altSem ? `;height:${altSem}px` : ''}">`;
      for (let k = 0; k < 7; k++) {
        const d = soma(ws, k), pz = prazosDe(d, d), extra = escondidos(k);
        html += `<div class="cel${d.slice(0, 7) !== p.a.slice(0, 7) ? ' fora' : ''}${k > 4 ? ' fds' : ''}${d === HOJE ? ' hoje' : ''}" style="grid-column:${k + 1}">
          <span class="num"${d === HOJE ? ' aria-label="hoje"' : ''}>${dt(d).getDate()}</span>
          <span class="cel-extra">${pz.length ? `<span class="prazos-dia"><button type="button" class="prazo-tag" data-dia="${d}" aria-expanded="${popDia === d}">${ic('flag')}${pz.length}<span> prazo${pz.length > 1 ? 's' : ''}</span></button>
            ${popDia === d ? `<div class="prazo-pop">${pz.map(({ e, i }) => `<button type="button" data-abrir="${e.id}"><b>${esc(i.txt)}</b><small>${sig(e)} · ${esc(e.titulo)}</small></button>`).join('')}</div>` : ''}</span>` : ''}
          ${maisHTML(d, ws, extra)}</span>
        </div>`;
      }
      fl.slice(0, nFl).forEach((ln, li) => ln.forEach(({ e, c0, c1, esq, dir }) => {
        html += `<button type="button" class="faixa-longa${esq ? ' continua-esq' : ''}${dir ? ' continua-dir' : ''}" style="--pc:${pc(e)};grid-column:${c0 + 1}/${c1 + 2};grid-row:${li + 2}" data-abrir="${e.id}" aria-label="${esc(`${sig(e)} – ${e.titulo}, ${intervalo(e)}, ${pessoa(e.dono).ini}`)}">${nev(e)}<span class="sig">${sig(e)}</span><span class="t">${esc(e.titulo)}</span><span class="ate">${dir ? 'até ' + curto(e.fim) : ''}</span></button>`;
      }));
      fc.slice(0, nFc).forEach((ln, li) => ln.forEach(({ e, c0, c1, esq, dir }) => {
        html += `<button type="button" class="barra${esq ? ' continua-esq' : ''}${dir ? ' continua-dir' : ''}${feitoTudo(e) ? ' feito' : ''}" style="--pc:${pc(e)};grid-column:${c0 + 1}/${c1 + 2};grid-row:${nFl + li + 2}" data-abrir="${e.id}" aria-label="${esc(`${sig(e)} – ${e.titulo}, ${intervalo(e)}, ${pessoa(e.dono).ini}`)}">${nev(e)}<span class="sig">${sig(e)}</span><span class="t">${esc(e.titulo)}</span></button>`;
      }));
      html += `</div>`;
    });
    folha().innerHTML = html + legendaEventos(doMes) + rodape();
    // mede o que sobrou (ou faltou) e acerta a altura das semanas numa segunda passada
    if (md.altura && !imprimindo && !telaMes.ajustando) {
      const f = folha(), sobra = f.scrollHeight - f.clientHeight;
      if (sobra > 0 || sobra < -8) { corrMes = Math.max(-200, corrMes + sobra + 2); telaMes.ajustando = true; telaMes(); telaMes.ajustando = false; }
    }
  }

  /* ---------- semana ---------- */
  function telaSemana() {
    const p = periodo(), lanes = faixas(p.a, visiveis());
    let html = cabeca(`${curto(p.a)} – ${curto(p.b)}`, 'Semana · agenda da equipe');
    html += `<div class="sem-grade">` + Array.from({ length: 7 }, (_, k) => `<div class="sem-fundo${k > 4 ? ' fds' : ''}" style="grid-column:${k + 1};grid-row:1/-1"></div>`).join('');
    html += Array.from({ length: 7 }, (_, k) => { const d = soma(p.a, k); return `<div class="sem-dia" style="grid-column:${k + 1};grid-row:1"><span>${SEM[k]}</span><b class="num${d === HOJE ? ' hj' : ''}">${dt(d).getDate()}</b></div>`; }).join('');
    lanes.forEach((ln, li) => ln.forEach(({ e, c0, c1, esq, dir }) => {
      const f = e.itens.filter(i => i.feito).length;
      html += `<button type="button" class="bloco" style="--pc:${pc(e)};grid-column:${c0 + 1}/${c1 + 2};grid-row:${li + 2};margin-top:8px" data-abrir="${e.id}"><span class="sig grifo">${sig(e)}</span><b>${esc(e.titulo)}</b><small>${[e.hora, e.local].filter(Boolean).map(esc).join(' · ') || 'sem horário'}</small><small><span class="ini">${esc(pessoa(e.dono).ini)}</span></small><small>${e.itens.length ? `${f} de ${e.itens.length} itens feitos` : 'checklist vazio'}</small></button>`;
    }));
    html += Array.from({ length: 7 }, (_, k) => { const d = soma(p.a, k), pz = prazosDe(d, d); return pz.length ? `<div class="sem-prazos" style="grid-column:${k + 1};grid-row:${lanes.length + 2}">${pz.map(({ e, i }) => `<button type="button" data-abrir="${e.id}"><b>prazo</b> ${esc(i.txt)}</button>`).join('')}</div>` : ''; }).join('');
    html += `</div>`;
    if (!lanes.length) html += `<p class="vazio">Nenhum evento nesta semana.</p>`;
    folha().innerHTML = html + rodape();
    folha().querySelector('.sem-grade').style.gridTemplateRows = `auto repeat(${lanes.length + 1}, auto) 1fr`;
  }

  /* ---------- ano ---------- */
  function telaAno() {
    const a = dt(ref).getFullYear(), lista = visiveis();
    let html = cabeca(String(a), 'O ano da escola') + `<div class="ano">`;
    for (let m = 0; m < 12; m++) {
      const p1 = `${a}-${pad(m + 1)}-01`, ult = iso(new Date(a, m + 1, 0));
      html += `<section class="mini" data-ym="${p1.slice(0, 7)}"><h2><button type="button" data-mes="${p1}">${MESES[m]}</button></h2><div class="mini-grade">${SEM.map(s => `<span class="d cab">${s[0].toUpperCase()}</span>`).join('')}`;
      for (let d = seg(p1); d <= ult || dt(d).getDay() !== 1; d = soma(d, 1)) {
        if (d > ult && dt(d).getDay() === 1) break;
        const dentro = d >= p1 && d <= ult, evs = dentro ? lista.filter(e => ocorre(e, d)) : [];
        html += `<span class="d"><span class="${d === HOJE ? 'hoje' : ''}" style="${dentro ? '' : 'visibility:hidden'};display:inline-block;min-width:20px">${dt(d).getDate()}</span>${evs.length ? `<span class="marcas">${evs.slice(0, 3).map(e => `<i style="--pc:${pc(e)}" title="${esc(sig(e) + ' – ' + e.titulo)}"></i>`).join('')}</span>` : ''}</span>`;
      }
      html += `</div></section>`;
    }
    folha().innerHTML = html + `</div>` + rodape();
  }

  /* ---------- lista ---------- */
  function telaLista() {
    const p = periodo(), lista = visiveis().filter(e => noPeriodo(e, p.a, p.b)).sort((x, y) => x.ini.localeCompare(y.ini));
    let html = cabeca(MESES[dt(ref).getMonth()], `Lista do período · ${dt(ref).getFullYear()}`);
    html += lista.length ? `<table class="lista"><thead><tr><th>Datas</th><th>Evento</th><th class="col-local">Local e horário</th><th>Responsável</th><th>Checklist</th></tr></thead><tbody>${lista.map(e => `<tr>
      <td class="datas">${intervalo(e)}</td>
      <td><span class="sig grifo" style="--pc:${pc(e)}">${sig(e)}</span><button type="button" data-abrir="${e.id}">${esc(e.titulo)}</button></td>
      <td class="col-local">${[e.local, e.hora].filter(Boolean).map(esc).join(' · ') || '—'}</td>
      <td><span class="ini" style="--pc:${pc(e)}">${esc(pessoa(e.dono).ini)}</span></td>
      <td>${e.itens.length ? `${e.itens.filter(i => i.feito).length}/${e.itens.length}` : '—'}</td></tr>`).join('')}</tbody></table>`
      : `<p class="vazio">Nenhum evento neste mês.</p>`;
    folha().innerHTML = html + rodape();
  }

  /* ---------- coluna: fichas, evento aberto, formulário ---------- */
  function ficha(e) {
    const f = e.itens.filter(i => i.feito).length;
    const oc = oculto(e);
    return `<div class="ficha-w${oc ? ' oculto' : ''}"><button type="button" class="papel bilhete" style="--pc:${pc(e)}" data-abrir="${e.id}">
      <span class="canhoto"><span class="sig grifo">${sig(e)}</span><span class="quando">${intervalo(e)}</span></span>
      <span class="bilhete-corpo"><b>${esc(e.titulo)}</b><span class="linha">${[e.local, e.hora].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}<span class="ini">${esc(pessoa(e.dono).ini)}</span></span>
        <span class="progresso-picote">${e.itens.length ? `<span class="furos" aria-hidden="true">${e.itens.slice(0, 24).map(i => `<i class="${i.feito ? 'f' : ''}"></i>`).join('')}</span>${f} de ${e.itens.length}` : 'checklist vazio'}</span></span>
      ${feitoTudo(e) ? '<span class="carimbo">Concluído</span>' : ''}
    </button>${oc ? '<span class="oculto-tag">fora do calendário</span>' : ''}<button type="button" class="ocultar" data-ocultar="${e.id}" aria-pressed="${oc}" aria-label="${oc ? 'Mostrar' : 'Ocultar'} ${esc(e.titulo)} ${oc ? 'no' : 'do'} calendário" title="${oc ? 'Mostrar no calendário' : 'Ocultar do calendário'}">${ic(oc ? 'mais' : 'menos')}</button></div>`;
  }
  function telaLado() {
    if (colando) return telaColar();
    if (formando) return formulario();
    if (aberto) { const e = eventos.find(x => x.id === aberto); if (e) return eventoAberto(e); aberto = null; }
    const p = periodo();
    const lista = (vista === 'ano' ? filtrados().filter(e => e.fim >= HOJE) : filtrados().filter(e => noPeriodo(e, p.a, p.b)))
      .sort((x, y) => x.ini.localeCompare(y.ini)).slice(0, vista === 'ano' ? 8 : 60);
    lado().innerHTML = `<h2 class="lado-t">${vista === 'ano' ? 'Próximos eventos' : 'Eventos do período'}</h2>` + (lista.map(ficha).join('') || `<div class="papel bilhete-corpo" style="padding:18px"><b>Nenhum evento neste período.</b><span class="linha">Use "Novo evento" para cadastrar.</span></div>`);
  }
  function eventoAberto(e) {
    const ok = pode(e), f = e.itens.filter(i => i.feito).length;
    lado().innerHTML = `<article class="papel aberto" style="--pc:${pc(e)}" aria-labelledby="ab-t">
      <div class="canhoto"><span class="sig grifo">${sig(e) || '—'}</span><span class="quando">${intervalo(e)}</span></div>
      <div class="aberto-corpo">
        <h2 id="ab-t" tabindex="-1">${esc(e.titulo)}</h2>
        <dl class="campos">
          <div><dt>Onde acontece</dt><dd>${e.amb === 'I' ? 'Interno (EMPRO)' : 'Externo'}</dd></div>
          <div><dt>Para quem</dt><dd>${NOME_PUB[e.pub] || 'Não informado'}</dd></div>
          <div><dt>Local</dt><dd>${esc(e.local) || '—'}</dd></div>
          <div><dt>Horário</dt><dd>${esc(e.hora) || '—'}</dd></div>
        </dl>
        ${ok ? '' : `<p class="so-ler">Evento de ${esc(pessoa(e.dono).ini)}. Você vê o checklist, mas só quem cadastrou pode mudar.</p>`}
        <h3>Checklist <small>${e.itens.length ? `${f} de ${e.itens.length} feitos` : 'vazio'}</small></h3>
        <ul class="check">${e.itens.map(i => {
          const atras = i.prazo && !i.feito && i.prazo < HOJE;
          return `<li class="${i.feito ? 'feito' : ''}"><button type="button" class="picote" role="checkbox" aria-checked="${i.feito}" aria-label="${esc(i.txt)}" data-picote="${i.id}" ${ok ? '' : 'disabled'}></button>
            <span class="txt">${esc(i.txt)}</span>
            ${ok ? `<button type="button" class="icone-btn" data-tirar="${i.id}" aria-label="Tirar ${esc(i.txt)}">${ic('lixo')}</button>` : '<span></span>'}
            ${i.prazo || i.acomp ? `<span class="meta">${i.prazo ? `<span class="${atras ? 'atraso' : ''}">${atras ? 'atrasado · ' : ''}prazo ${curto(i.prazo)}</span>` : ''}${i.cal ? '<span>no calendário</span>' : ''}${i.acomp ? '<span>acompanhar (outro setor faz)</span>' : ''}</span>` : ''}</li>`;
        }).join('') || '<li style="display:block;color:var(--tinta-2);font-size:14px">Nenhum item ainda. Escreva abaixo o que precisa ser feito.</li>'}</ul>
        ${ok ? `<form class="novo-item" id="fItem" novalidate>
          <label class="sr" for="iTxt">Novo item</label>
          <input class="campo" id="iTxt" placeholder="Escreva um item do checklist" autocomplete="off" maxlength="200">
          <div class="linha2"><label class="marca">Prazo <input type="date" class="campo campo-data" id="iPrazo"></label>
            <label class="marca"><input type="checkbox" id="iCal" disabled> Mostrar no calendário</label>
            <button type="submit" class="btn" style="margin-left:auto">${ic('mais')} Acrescentar</button></div>
        </form>` : ''}
        <div class="acoes-aberto">
          <button type="button" class="btn" id="fechar">${ic('x')} Fechar</button>
          ${ok ? `<button type="button" class="btn" id="editar">Editar dados</button><button type="button" class="btn perigo" id="apagar">${ic('lixo')} Apagar evento</button>` : ''}
        </div>
      </div></article>`;
    const fi = lado().querySelector('#fItem');
    if (fi) {
      const pr = fi.querySelector('#iPrazo'), cal = fi.querySelector('#iCal');
      pr.oninput = () => { cal.disabled = !pr.value; cal.checked = !!pr.value; };
      fi.onsubmit = ev => {
        ev.preventDefault();
        const t = fi.querySelector('#iTxt').value.trim(); if (!t) return fi.querySelector('#iTxt').focus();
        acrescentar(e, t, pr.value, cal.checked); desenhar(); const n = lado().querySelector('#iTxt'); if (n) n.focus();
      };
    }
  }
  function formulario() {
    const ed = formando === 'novo' ? null : eventos.find(x => x.id === formando);
    const e = ed || { titulo: '', amb: 'I', pub: 'MS', ini: ref >= HOJE ? ref : HOJE, fim: '', hora: '', local: '' };
    const pub = e.pub || 'MS';
    lado().innerHTML = `<form class="papel aberto" id="fEv" novalidate style="--pc:${pessoa(eu()).cor}" aria-labelledby="fe-t">
      <div class="canhoto"><span class="sig grifo" id="feSig">${e.amb} ${pub}</span><span class="quando">${ed ? 'editar' : 'novo evento'}</span></div>
      <div class="aberto-corpo form-ev">
        <h2 id="fe-t" tabindex="-1" style="margin:0">${ed ? 'Editar evento' : 'Novo evento'}</h2>
        <div><label class="r" for="fTit">Nome do evento</label><input class="campo" id="fTit" value="${esc(e.titulo)}" autocomplete="off" maxlength="200"></div>
        <div><span class="r rot" id="rAmb" style="display:block;margin-bottom:5px">Onde acontece</span>
          <div class="escolha" role="radiogroup" aria-labelledby="rAmb">${[['I', 'Interno', 'A EMPRO organiza'], ['E', 'Externo', 'Evento de fora']].map(([v, n, d]) => `<label><input type="radio" name="amb" value="${v}" ${e.amb === v ? 'checked' : ''}><span><b>${v}</b><small>${n}: ${d}</small></span></label>`).join('')}</div></div>
        <div><span class="r rot" id="rPub" style="display:block;margin-bottom:5px">Para quem</span>
          <div class="escolha" role="radiogroup" aria-labelledby="rPub" style="--n:3">${[['M', 'Membros'], ['S', 'Servidores'], ['MS', 'Os dois']].map(([v, n]) => `<label><input type="radio" name="pub" value="${v}" ${pub === v ? 'checked' : ''}><span><b>${v}</b><small>${n}</small></span></label>`).join('')}</div></div>
        <div><span class="r rot" id="rDatas" style="display:block;margin-bottom:5px">Datas</span>
          <div class="escolha" role="radiogroup" aria-labelledby="rDatas"><label><input type="radio" name="modoDatas" value="seguidos" ${e.dias ? '' : 'checked'}><span><b>Seguidos</b><small>Do início ao fim</small></span></label><label><input type="radio" name="modoDatas" value="separados" ${e.dias ? 'checked' : ''}><span><b>Separados</b><small>Escolher dia por dia</small></span></label></div></div>
        <div class="duas" id="dSeguidos" ${e.dias ? 'hidden' : ''}><div><label class="r" for="fIni">Início</label><input type="date" class="campo" id="fIni" value="${e.ini}"></div><div><label class="r" for="fFim">Fim</label><input type="date" class="campo" id="fFim" value="${e.fim || e.ini}"></div></div>
        <div id="dSeparados" ${e.dias ? '' : 'hidden'}><div class="seletor-dias" id="selDias" role="group" aria-label="Dias em que o evento acontece"></div><p class="dias-escolhidos" id="diasEsc" aria-live="polite"></p></div>
        <div class="duas"><div><label class="r" for="fHora">Horário <small style="text-transform:none;letter-spacing:0">(opcional)</small></label><input class="campo" id="fHora" value="${esc(e.hora)}" placeholder="Ex.: 08h às 12h" maxlength="60"></div>
          <div><label class="r" for="fLocal">Local ou sala</label><input class="campo" id="fLocal" list="salas" value="${esc(e.local)}" placeholder="Escolha ou escreva" maxlength="120"></div></div>
        <datalist id="salas">${(A.salas ? A.salas() : []).map(s => `<option value="${esc(s)}">`).join('')}</datalist>
        <p class="erro" id="feErro" role="alert" hidden></p>
        <div class="acoes-aberto"><button type="submit" class="btn primario">Salvar evento</button><button type="button" class="btn" id="cancelar">Cancelar</button></div>
      </div></form>`;
    const f = lado().querySelector('#fEv'), sg = () => { f.querySelector('#feSig').textContent = `${f.amb.value} ${f.pub.value}`; };
    f.querySelectorAll('[name=amb],[name=pub]').forEach(r => r.onchange = sg);
    f.querySelector('#fIni').onchange = ev => { const fim = f.querySelector('#fFim'); if (!fim.value || fim.value < ev.target.value) fim.value = ev.target.value; };
    f.querySelector('#cancelar').onclick = () => { formando = null; desenhar(); };
    // seletor de dias separados: clicar nos dias do mês
    const sel = new Set(e.dias || []);
    let mesSel = ((e.dias && e.dias[0]) || e.ini || HOJE).slice(0, 7) + '-01';
    function pintarDias() {
      const d0 = dt(mesSel), a = d0.getFullYear(), m = d0.getMonth(), ult = iso(new Date(a, m + 1, 0));
      let h = `<div class="sd-topo"><button type="button" class="sd-nav" data-sdmes="-1" aria-label="Mês anterior">${ic('esq')}</button><b>${MESES[m]} ${a}</b><button type="button" class="sd-nav" data-sdmes="1" aria-label="Próximo mês">${ic('dir')}</button></div><div class="sd-grade">${SEM.map(x => `<span class="sd-cab" aria-hidden="true">${x[0].toUpperCase()}</span>`).join('')}`;
      for (let d = seg(mesSel); ; d = soma(d, 1)) {
        if (d > ult && dt(d).getDay() === 1) break;
        h += d.slice(0, 7) === mesSel.slice(0, 7) ? `<button type="button" class="sd-dia${d === HOJE ? ' hoje' : ''}" data-sddia="${d}" aria-pressed="${sel.has(d)}" aria-label="${dt(d).getDate()} de ${MESES[m]}">${dt(d).getDate()}</button>` : '<span></span>';
      }
      f.querySelector('#selDias').innerHTML = h + '</div>';
      const l = [...sel].sort();
      f.querySelector('#diasEsc').innerHTML = l.length
        ? l.map(d => `<button type="button" class="dia-chip" data-tirardia="${d}" aria-label="Tirar ${curto(d)}">${curto(d)}${ic('x')}</button>`).join('') + `<span class="secundario">${l.length} dia${l.length > 1 ? 's' : ''}</span>`
        : '<span class="secundario">Clique nos dias em que o evento acontece.</span>';
    }
    f.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.sdmes) { const d = dt(mesSel); d.setMonth(d.getMonth() + +b.dataset.sdmes); mesSel = iso(d); pintarDias(); f.querySelector(`[data-sdmes="${b.dataset.sdmes}"]`).focus(); }
      else if (b.dataset.sddia) { const d = b.dataset.sddia; sel.has(d) ? sel.delete(d) : sel.add(d); pintarDias(); f.querySelector(`[data-sddia="${d}"]`).focus(); }
      else if (b.dataset.tirardia) { sel.delete(b.dataset.tirardia); pintarDias(); }
    });
    f.querySelectorAll('[name=modoDatas]').forEach(r => r.onchange = () => {
      const sep = f.modoDatas.value === 'separados', ini = f.querySelector('#fIni'), fim = f.querySelector('#fFim');
      if (sep && !sel.size && ini.value) { for (let d = ini.value; d <= (fim.value || ini.value) && sel.size < 62; d = soma(d, 1)) sel.add(d); mesSel = ini.value.slice(0, 7) + '-01'; }
      if (!sep && sel.size) { const l = [...sel].sort(); ini.value = l[0]; fim.value = l[l.length - 1]; }
      f.querySelector('#dSeguidos').hidden = sep; f.querySelector('#dSeparados').hidden = !sep;
      if (sep) pintarDias();
    });
    if (e.dias) pintarDias();
    f.onsubmit = ev => {
      ev.preventDefault();
      const er = f.querySelector('#feErro'), t = f.querySelector('#fTit').value.trim(), sep = f.modoDatas.value === 'separados', l = [...sel].sort();
      let ini = f.querySelector('#fIni').value, fim = f.querySelector('#fFim').value || ini, dias = null;
      if (sep) { ini = l[0] || ''; fim = l[l.length - 1] || ''; dias = l.every((d, k) => k === 0 || dif(l[k - 1], d) === 1) ? null : l; }
      const falha = (m, el) => { er.textContent = m; er.hidden = false; el.focus(); };
      if (!t) return falha('Escreva o nome do evento.', f.querySelector('#fTit'));
      if (sep && !l.length) return falha('Escolha pelo menos um dia no calendário.', f.querySelector('.sd-dia'));
      if (!ini) return falha('Escolha a data de início.', f.querySelector('#fIni'));
      if (fim < ini) return falha('O fim não pode ser antes do início.', f.querySelector('#fFim'));
      aberto = salvarEvento({ titulo: t, amb: f.amb.value, pub: f.pub.value, ini, fim, dias, hora: f.querySelector('#fHora').value.trim(), local: f.querySelector('#fLocal').value.trim() }, ed);
      ref = ini; formando = null; desenhar(); focar('#ab-t');
      A.avisar(ed ? 'Evento salvo.' : 'Evento criado.');
    };
  }

  /* ---------- transições entre as visões ----------
     A hierarquia Ano > Mês > Semana vira zoom: a parte do calendário que você escolheu cresce até
     virar a folha inteira (e encolhe de volta). ‹ › viram a página para o lado. A Lista entra como
     página nova. Quem pede menos movimento no sistema recebe só um esmaecer. */
  const NIVEL = { ano: 0, mes: 1, semana: 2 };
  const reduzir = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ancoraAno = () => folha().querySelector(`.mini[data-ym="${ref.slice(0, 7)}"]`);
  const ancoraSemana = () => folha().querySelector(`.semana[data-ws="${seg(ref)}"]`) || folha().querySelector('.semana');
  function ancoraDe(nivelDe, nivelPara) { // a parte da visão mais ampla que corresponde à mais detalhada
    const amplo = Math.min(nivelDe, nivelPara);
    return amplo === 0 ? ancoraAno() : ancoraSemana();
  }
  let emCurso = null;
  function transicao(tipo, mudar) {
    const html = document.documentElement, f = folha();
    if (emCurso) { try { emCurso.skipTransition(); } catch (e) {} }
    if (!document.startViewTransition) {
      mudar(); desenhar();
      if (!reduzir()) f.animate([{ opacity: 0, transform: tipo === 'ant' ? 'translateX(-24px)' : tipo === 'prox' ? 'translateX(24px)' : 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' });
      return;
    }
    const suave = reduzir();
    html.dataset.vt = suave ? 'suave' : tipo === 'mais' ? 'zoom-in' : tipo === 'menos' ? 'zoom-out' : tipo;
    let antes = null;
    const de = NIVEL[vista];
    if (!suave && (tipo === 'mais' || tipo === 'menos')) {
      // ao aproximar, a âncora está na visão atual (mais ampla); ao afastar, é a folha inteira
      antes = tipo === 'mais' ? (zoomAlvo || null) : f;
      if (antes) { f.style.viewTransitionName = antes === f ? 'zoom' : 'none'; if (antes !== f) antes.style.viewTransitionName = 'zoom'; }
    }
    emCurso = document.startViewTransition(() => {
      if (antes && antes !== f) antes.style.viewTransitionName = '';
      mudar(); desenhar();
      if (antes) {
        const para = NIVEL[vista];
        const depois = tipo === 'mais' ? f : ancoraDe(de, para);
        f.style.viewTransitionName = depois === f ? 'zoom' : 'none';
        if (depois && depois !== f) depois.style.viewTransitionName = 'zoom';
      }
    });
    zoomAlvo = null;
    emCurso.ready.catch(() => {}); emCurso.updateCallbackDone.catch(() => {});
    emCurso.finished.catch(() => {}).finally(() => {
      delete html.dataset.vt; emCurso = null;
      folha().style.viewTransitionName = '';
      folha().querySelectorAll('.mini, .semana').forEach(el => { el.style.viewTransitionName = ''; });
    });
  }
  let zoomAlvo = null;
  function irPara(nova, novaRef, alvo) {
    const de = vista;
    if (nova === de && (!novaRef || novaRef === ref)) return;
    let tipo;
    if (nova === 'lista' || de === 'lista') tipo = 'pagina';
    else if (nova === de) tipo = novaRef > ref ? 'prox' : 'ant';
    else tipo = NIVEL[nova] > NIVEL[de] ? 'mais' : 'menos';
    if (tipo === 'mais') zoomAlvo = alvo || (NIVEL[de] === 0 ? (() => { const r0 = ref; ref = novaRef || ref; const a = ancoraAno(); ref = r0; return a; })() : (() => { const r0 = ref; ref = novaRef || ref; const a = ancoraSemana(); ref = r0; return a; })());
    transicao(tipo, () => { vista = nova; if (novaRef) ref = novaRef; popDia = null; try { sessionStorage.setItem('folha-vista', vista); } catch (e) {} });
  }
  function andarAnimado(n) {
    transicao(n > 0 ? 'prox' : 'ant', () => {
      const d = dt(ref);
      if (vista === 'ano') d.setFullYear(d.getFullYear() + n);
      else if (vista === 'semana') d.setDate(d.getDate() + 7 * n);
      else { d.setDate(1); d.setMonth(d.getMonth() + n); }
      ref = iso(d); popDia = null;
    });
  }

  /* ---------- colar uma lista de eventos ----------
     Formato (um evento por bloco, blocos separados por linha em branco):
       Nome: ...   In/Ex: In | Ex   Quem?: M | S | MS   Data: 05 de novembro | 16 a 19 de novembro de 2026 |
       10, 11 e 12 de novembro | 30 de novembro a 4 de dezembro   SEI: 15411/2026-74   (Local e Horário são opcionais)
     O sistema mostra o que entendeu antes de cadastrar. */
  const NUM_MES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  function lerData(txt, anoPadrao) {
    let x = A.semAcento(txt).replace(/[º°ª]/g, '').replace(/\s+/g, ' ');
    const ano = +((x.match(/\b(20\d\d)\b/) || [])[1] || anoPadrao);
    x = x.replace(/\s*de\s+20\d\d\b/g, '').replace(/\b20\d\d\b/g, '').trim();
    const diaMes = (p, mesPadrao) => { const m = p.match(/(\d{1,2})(?:\s+de\s+([a-z]+))?/); if (!m) return null; const mes = m[2] ? NUM_MES[m[2]] : mesPadrao; return mes ? { dia: +m[1], mes } : null; };
    const fmt = (dia, mes, a) => `${a}-${pad(mes)}-${pad(dia)}`;
    const faixa = x.split(/\s+(?:a|ate)\s+(?=\d)/);
    if (faixa.length === 2) {
      const f = diaMes(faixa[1]); if (!f) return null;
      const i = diaMes(faixa[0], f.mes); if (!i) return null;
      const anoI = i.mes > f.mes ? ano - 1 : ano;
      return { ini: fmt(i.dia, i.mes, anoI), fim: fmt(f.dia, f.mes, ano), dias: null };
    }
    const m = x.match(/((?:\d{1,2}\s*(?:,|\be\b)\s*)*\d{1,2})\s+de\s+([a-z]+)/);
    if (!m || !NUM_MES[m[2]]) return null;
    const lista = [...new Set(m[1].split(/\s*(?:,|\be\b)\s*/).filter(Boolean).map(Number))].sort((a, b) => a - b).map(d => fmt(d, NUM_MES[m[2]], ano));
    const seguidos = lista.every((d, k) => k === 0 || dif(lista[k - 1], d) === 1);
    return { ini: lista[0], fim: lista[lista.length - 1], dias: seguidos ? null : lista };
  }
  const seiCurtoLista = v => { const m = String(v || '').match(/(\d{1,7})\s*\/\s*(\d{4})\s*-\s*(\d{2})/); return m ? `${m[1].slice(-5).padStart(5, '0')}/${m[2]}-${m[3]}` : String(v || '').trim(); };
  // cada bloco: linhas "Chave: valor" (aceita também "Quem? MS", sem dois-pontos)
  function lerLista(texto) {
    const anoPadrao = dt(HOJE).getFullYear();
    return texto.replace(/\r/g, '').split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean).map(bloco => {
      const c = {};
      bloco.split('\n').forEach(l => { const m = l.match(/^\s*([^:?]{1,20})[:?]\s*(.*)$/); if (m) c[A.semAcento(m[1]).replace(/[^a-z/]/g, '')] = m[2].trim(); });
      const nome0 = (c.nome || c.evento || c.titulo || '').trim(), nome = nome0.charAt(0).toUpperCase() + nome0.slice(1);
      const ie = A.semAcento(c['in/ex'] || c.inex || c.tipo || '');
      const amb = /^in$|interno/.test(ie) ? 'I' : /^ex$|externo/.test(ie) ? 'E' : '';
      const q = A.semAcento(c.quem || c.publico || '').replace(/[^a-z]/g, '');
      const pub = q === 'ms' || q === 'sm' || /ambos|membrosservidores/.test(q) ? 'MS' : q === 'm' || q === 'membros' ? 'M' : q === 's' || q === 'servidores' ? 'S' : '';
      const datas = c.data || c.datas ? lerData(c.data || c.datas, anoPadrao) : null;
      const avisos = [];
      if (!nome) avisos.push('sem nome');
      if (!amb) avisos.push(ie ? `"${c['in/ex'] || c.inex}": escolha interno ou externo` : 'falta In/Ex');
      if (!pub) avisos.push('falta o público (M, S ou MS)');
      if (!datas) avisos.push(c.data ? `não entendi a data "${c.data}"` : 'sem data');
      const sei = seiCurtoLista(c.sei);
      const repetido = eventos.some(e => e.titulo.trim().toLowerCase() === nome.toLowerCase() && (!sei || A.seiChave(e.proc.sei || '') === A.seiChave(sei)));
      if (repetido) avisos.push('já existe um evento com esse nome');
      return { nome, amb: amb || 'I', ambiguo: !amb, pub: pub || 'MS', datas, dataTxt: c.data || '', sei, local: c.local || '', hora: c.horario || c.hora || '',
        avisos, marcado: !!(nome && datas && !repetido) };
    });
  }
  function telaColar() {
    const c = colando;
    if (!c.itens) {
      lado().innerHTML = `<form class="papel aberto" id="fColar" novalidate aria-labelledby="cl-t" style="--pc:${pessoa(eu()).cor}">
        <div class="canhoto"><span class="sig grifo">lista</span><span class="quando">vários eventos</span></div>
        <div class="aberto-corpo form-ev">
          <h2 id="cl-t" style="margin:0">Colar lista de eventos</h2>
          <p class="secundario" style="margin:0">Um evento por bloco, separados por uma linha em branco. Linhas: <b>Nome</b>, <b>In/Ex</b>, <b>Quem?</b>, <b>Data</b> e <b>SEI</b> (Local e Horário, se quiser).</p>
          <label class="sr" for="clTxt">Lista de eventos</label>
          <textarea class="campo" id="clTxt" rows="12" spellcheck="false" placeholder="Nome: Curso de Investigação Digital\nIn/Ex: In\nQuem? MS\nData: 05 de novembro\nSEI: 15411/2026-74">${esc(c.texto)}</textarea>
          <div class="acoes-aberto"><button type="submit" class="btn primario">Ler a lista</button><button type="button" class="btn" id="clCancelar">Cancelar</button></div>
        </div></form>`;
      const f = lado().querySelector('#fColar');
      f.querySelector('#clCancelar').onclick = () => { colando = null; desenhar(); };
      f.onsubmit = ev => { ev.preventDefault(); c.texto = f.querySelector('#clTxt').value; c.itens = lerLista(c.texto); desenhar(); focar('#cl-t2'); };
      return;
    }
    const n = c.itens.filter(i => i.marcado).length;
    lado().innerHTML = `<form class="papel aberto" id="fColar2" novalidate aria-labelledby="cl-t2" style="--pc:${pessoa(eu()).cor}">
      <div class="canhoto"><span class="sig grifo">lista</span><span class="quando">${c.itens.length} encontrados</span></div>
      <div class="aberto-corpo">
        <h2 id="cl-t2" tabindex="-1" style="margin:0 0 6px">Confira antes de cadastrar</h2>
        <p class="secundario" style="margin:0 0 10px">Desmarque o que não quiser. O que precisa de atenção está grifado.</p>
        <ul class="cl-lista">${c.itens.map((i, k) => `<li class="${i.avisos.length ? 'atencao' : ''}">
          <label class="cl-marca"><input type="checkbox" data-clmarca="${k}" ${i.marcado ? 'checked' : ''} ${i.datas && i.nome ? '' : 'disabled'} aria-label="Cadastrar ${esc(i.nome || 'evento sem nome')}"></label>
          <div class="cl-corpo">
            <p class="cl-topo"><span class="sig grifo" style="--pc:${pessoa(eu()).cor}">${i.amb} ${i.pub}</span><span class="cl-datas">${i.datas ? intervalo({ ...i.datas, dias: i.datas.dias }) : '—'}</span>${i.sei ? `<span class="cl-sei">SEI ${esc(i.sei)}</span>` : ''}</p>
            <b>${esc(i.nome || '(sem nome)')}</b>
            ${i.ambiguo ? `<span class="cl-escolha">É <button type="button" class="btn-txt" data-clamb="${k}|I" aria-pressed="${i.amb === 'I'}">interno</button> ou <button type="button" class="btn-txt" data-clamb="${k}|E" aria-pressed="${i.amb === 'E'}">externo</button>?</span>` : ''}
            ${i.avisos.length ? `<span class="cl-aviso">${i.avisos.map(esc).join(' · ')}</span>` : ''}
          </div></li>`).join('')}</ul>
        <div class="acoes-aberto"><button type="submit" class="btn primario" ${n ? '' : 'disabled'}>Cadastrar ${n} evento${n === 1 ? '' : 's'}</button><button type="button" class="btn" id="clVoltar">Voltar ao texto</button><button type="button" class="btn" id="clCancelar">Cancelar</button></div>
      </div></form>`;
    const f = lado().querySelector('#fColar2');
    f.querySelectorAll('[data-clmarca]').forEach(cb => cb.onchange = () => { c.itens[+cb.dataset.clmarca].marcado = cb.checked; desenhar(); const x = lado().querySelector(`[data-clmarca="${cb.dataset.clmarca}"]`); if (x) x.focus(); });
    f.querySelectorAll('[data-clamb]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.clamb.split('|'); c.itens[+k].amb = v; desenhar(); });
    f.querySelector('#clVoltar').onclick = () => { c.itens = null; desenhar(); focar('#clTxt'); };
    f.querySelector('#clCancelar').onclick = () => { colando = null; desenhar(); };
    f.onsubmit = ev => {
      ev.preventDefault();
      const criados = [];
      c.itens.filter(i => i.marcado && i.datas && i.nome).forEach(i => {
        const p = A.novoProcesso({ tipoId: i.amb === 'E' ? 'externo' : 'interno', titulo: i.nome, sei: i.sei, inicio: i.datas.ini, fim: i.datas.fim, horario: i.hora, local: i.local,
          ambito: i.amb === 'E' ? 'externo' : 'interno', publico: PUB_INV[i.pub] }, eu());
        p.frentes = []; frenteLivre(p);
        if (i.datas.dias) p.dias = i.datas.dias;
        A.estado.processos.push(p); criados.push(p);
      });
      A.salvar();
      colando = null; ref = criados.length ? criados.map(p => p.inicio).sort()[0] : ref; desenhar();
      A.avisar(`${criados.length} evento${criados.length === 1 ? '' : 's'} cadastrado${criados.length === 1 ? '' : 's'}.`, () => { criados.forEach(p => A.apagarProcesso(p)); desenhar(); });
    };
  }

  /* ---------- desenho ---------- */
  const focar = s => requestAnimationFrame(() => { const el = document.querySelector(s); if (el) el.focus({ preventScroll: innerWidth > 1020 }); });
  function desenhar() {
    if (!A.estado) return;
    carregar();
    ({ ano: telaAno, mes: telaMes, semana: telaSemana, lista: telaLista })[vista]();
    telaLado();
    $('#periodo').textContent = periodo().nome;
    document.querySelectorAll('[data-vista]').forEach(b => b.setAttribute('aria-pressed', b.dataset.vista === vista));
    document.querySelectorAll('[data-tipo]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tipo === tipoFiltro));
    document.querySelectorAll('[data-modo]').forEach(b => b.setAttribute('aria-pressed', b.dataset.modo === modoMes()));
    const mm = document.querySelector('.modo-mes'); if (mm) mm.hidden = vista !== 'mes';
    document.title = `${periodo().nome} · Agenda da equipe`;
  }
  A.redesenhar = desenhar;
  A.mostrarStatus = () => {
    const el = $('#status'); if (!el || A.modo !== 'nuvem') return;
    const s = A.nuvem.status;
    el.textContent = s === 'salvando' ? 'Salvando…' : s === 'erro' ? 'Não salvou, tentando de novo' : s === 'sem acesso' ? 'Sem acesso' : 'Salvo';
    el.dataset.estado = s;
  };

  document.addEventListener('click', ev => {
    const t = ev.target.closest('button, a'); if (!t) { if (popDia || popMais) { popDia = null; popMais = null; desenhar(); } return; }
    if (t.dataset.vista) { irPara(t.dataset.vista); return; }
    if (t.dataset.ocultar) { const id = t.dataset.ocultar; transicao('suave', () => alternarOculto(id)); requestAnimationFrame(() => { const b = lado().querySelector(`[data-ocultar="${id}"]`); if (b) b.focus(); }); return; }
    if (t.dataset.modo) { if (t.dataset.modo !== modoMes()) transicao('suave', () => { prefs().agendaModoMes = t.dataset.modo; A.salvar(); }); return; }
    if (t.dataset.tipo) { if (t.dataset.tipo !== tipoFiltro) transicao('suave', () => { tipoFiltro = t.dataset.tipo; try { sessionStorage.setItem('folha-tipo', tipoFiltro); } catch (e) {} }); return; }
    if (t.dataset.abrir) {
      popDia = null; popMais = null; formando = null; colando = null; aberto = t.dataset.abrir;
      const e = eventos.find(x => x.id === aberto); if (e && vista !== 'ano' && !noPeriodo(e, periodo().a, periodo().b)) ref = e.ini;
      desenhar(); focar('#ab-t'); if (innerWidth <= 1020) lado().scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
    }
    if (t.dataset.maisdia) { popMais = popMais === t.dataset.maisdia ? null : t.dataset.maisdia; popDia = null; desenhar(); const b = folha().querySelector(`[data-maisdia="${t.dataset.maisdia}"]`); if (b) b.focus(); return; }
    if (t.dataset.dia) { popDia = popDia === t.dataset.dia ? null : t.dataset.dia; desenhar(); return; }
    if (t.dataset.mes) { irPara('mes', t.dataset.mes, t.closest('.mini')); return; }
    if (t.dataset.semana) { popMais = null; irPara('semana', t.dataset.semana, t.closest('.semana')); return; }
    if (t.dataset.picote) {
      const e = eventos.find(x => x.id === aberto); if (!e || !pode(e)) return;
      marcar(e, t.dataset.picote); desenhar();
      const n = lado().querySelector(`[data-picote="${t.dataset.picote}"]`); if (n) { n.classList.add('agora'); n.focus(); }
      return;
    }
    if (t.dataset.tirar) { const e = eventos.find(x => x.id === aberto); if (e && pode(e)) { tirar(e, t.dataset.tirar); desenhar(); } return; }
    switch (t.id) {
      case 'ant': andarAnimado(-1); break;
      case 'prox': andarAnimado(1); break;
      case 'hoje': { const p0 = periodo(); if (HOJE >= p0.a && HOJE <= p0.b) break; transicao(HOJE > ref ? 'prox' : 'ant', () => { ref = HOJE; popDia = null; }); break; }
      case 'colar': aberto = null; formando = null; colando = { texto: '', itens: null }; desenhar(); focar('#clTxt'); if (innerWidth <= 1020) lado().scrollIntoView({ behavior: 'smooth' }); break;
      case 'novo': aberto = null; colando = null; formando = 'novo'; desenhar(); focar('#fTit'); if (innerWidth <= 1020) lado().scrollIntoView({ behavior: 'smooth' }); break;
      case 'fechar': { const id = aberto; aberto = null; desenhar(); requestAnimationFrame(() => { const b = lado().querySelector(`[data-abrir="${id}"]`); if (b) b.focus(); }); break; }
      case 'editar': formando = aberto; desenhar(); focar('#fTit'); break;
      case 'apagar': {
        const e = eventos.find(x => x.id === aberto); if (!e || !pode(e)) break;
        if (!confirm(`Apagar "${e.titulo}"?\n\nO evento e o checklist dele somem para toda a equipe. Dá para desfazer logo depois.`)) break;
        const desfaz = A.apagarProcesso(e.proc); aberto = null; desenhar();
        A.avisar(`"${e.titulo}" apagado.`, () => { desfaz(); desenhar(); });
        break;
      }
      case 'imprimir': imprimir(); break;
      case 'sair': if (A.supa && A.modo === 'nuvem') A.supa.sairDaConta(); else { A.sair(); location.href = 'index.html'; } break;
    }
  });
  document.addEventListener('keydown', ev => {
    const el = document.activeElement, digitando = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    if (!digitando && !ev.altKey && !ev.ctrlKey && !ev.metaKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && !(el && el.closest('.vistas'))) { ev.preventDefault(); andarAnimado(ev.key === 'ArrowRight' ? 1 : -1); return; }
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { if (popDia || popMais) { const d = popMais; popDia = null; popMais = null; desenhar(); if (d) { const b = folha().querySelector(`[data-maisdia="${d}"]`); if (b) b.focus(); } } else if (aberto || formando) { aberto = null; formando = null; desenhar(); } } });
  function imprimir() {
    const st = document.createElement('style');
    st.textContent = `@page { size: A4 ${vista === 'lista' ? 'portrait' : 'landscape'}; margin: 9mm 10mm; }`;
    document.head.appendChild(st); popDia = null; imprimindo = true; desenhar();
    window.print(); imprimindo = false; folha().style.removeProperty('--esc'); folha().style.removeProperty('--zoom'); desenhar(); setTimeout(() => st.remove(), 500);
  }
  window.addEventListener('beforeunload', () => A.salvarJa && A.salvarJa());
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (A.estado && vista === 'mes') desenhar(); }, 150); });

  /* ---------- entrada: mesmas contas do sistema ---------- */
  function mostrarCabeca() {
    const me = A.perfil(eu()) || { ini: '?', cor: '#4F5B66' };
    $('#eu').textContent = me.ini; $('#eu').style.setProperty('--eu', me.cor);
    $('#sistemaAnterior').hidden = !(admin() || A.modo !== 'nuvem');
    $('#trocarSenha').hidden = A.modo !== 'nuvem';
    $('#soMeus').onchange = ev => transicao('suave', () => { soMeus = ev.target.checked; });
  }
  async function iniciar() {
    A.ligarAviso();
    $('#folha').innerHTML = '<p class="vazio" role="status">Abrindo a agenda…</p>';
    try {
      if (A.supa && A.supa.disponivel()) {
        const u = await A.supa.sessaoAtual();
        if (!u || !(await A.supa.liberado())) { location.replace('index.html'); return; }
        await A.nuvem.iniciarSupabase(u);
        if (!A.perfil(A.nuvem.eu)) { location.replace('index.html'); return; } // conta sem perfil: cria lá
        A.entrarComo(A.nuvem.eu, 'dono');
      } else {
        A.carregar();
        if (!A.sessao || !A.perfil(A.sessao.perfilId)) { location.replace('index.html'); return; }
      }
    } catch (e) {
      $('#folha').innerHTML = `<h1 style="margin:0 0 8px">Não deu para abrir a agenda</h1><p>${esc(e && e.message || 'Erro desconhecido')}</p><p class="vazio" style="padding:0">Confira a internet e recarregue a página.</p>`;
      return;
    }
    mostrarCabeca();
    A.mostrarStatus();
    desenhar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
