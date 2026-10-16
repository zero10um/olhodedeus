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
    return { id: p.id, proc: p, dono: p.dono, titulo: p.titulo, amb: p.ambito === 'externo' || (!p.ambito && grupo === 'externo') ? 'E' : 'I',
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
  const intervalo = e => e.ini === e.fim ? curto(e.ini) : `${curto(e.ini)} – ${curto(e.fim)}`;

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
      A.estado.processos.push(p); A.salvar();
      return p.id;
    }
    const p = existente.proc;
    if (p.inicio !== d.ini) A.anotar(p, 'Sistema', `Data do evento mudou de ${A.fmtAno(p.inicio)} para ${A.fmtAno(d.ini)}.`);
    Object.assign(p, campos);
    if (A.aplicarPublico) A.aplicarPublico(p);
    toque(p);
    return p.id;
  }

  /* ---------- estado da tela ---------- */
  let vista = 'mes', ref = HOJE, aberto = null, formando = null, soMeus = false, popDia = null;
  let tipoFiltro = 'todos';
  try { const v = sessionStorage.getItem('folha-vista'); if (['ano', 'mes', 'semana', 'lista'].includes(v)) vista = v; const f = sessionStorage.getItem('folha-tipo'); if (['todos', 'I', 'E'].includes(f)) tipoFiltro = f; } catch (e) {}
  const visiveis = () => eventos.filter(e => (!soMeus || meu(e)) && (tipoFiltro === 'todos' || e.amb === tipoFiltro));
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
  const noPeriodo = (e, a, b) => e.fim >= a && e.ini <= b;
  function andar(n) {
    const d = dt(ref);
    if (vista === 'ano') d.setFullYear(d.getFullYear() + n);
    else if (vista === 'semana') d.setDate(d.getDate() + 7 * n);
    else { d.setDate(1); d.setMonth(d.getMonth() + n); }
    ref = iso(d); desenhar();
  }

  const legenda = () => `<div class="legenda" aria-label="Legenda">${A.estado.perfis.slice().sort((a, b) => a.ini.localeCompare(b.ini)).map(p => `<span><i style="--pc:${p.cor || '#4F5B66'}"></i><b>${esc(p.ini)}</b></span>`).join('')}<span><b>I</b> interno · <b>E</b> externo</span><span><b>M</b> membros · <b>S</b> servidores · <b>MS</b> ambos</span></div>`;
  const filtroTxt = () => [tipoFiltro === 'I' ? 'só eventos internos' : tipoFiltro === 'E' ? 'só eventos externos' : '', soMeus ? 'só os de ' + pessoa(eu()).ini : ''].filter(Boolean).join(' · ');
  const cabeca = (titulo, sub) => `<header class="folha-cab"><h1><small>${sub}${filtroTxt() ? ' · ' + filtroTxt() : ''}</small>${titulo}</h1>${legenda()}</header>`;
  const rodape = () => `<p class="rodape-imp">Agenda da equipe · impressa em ${A.fmtAno(HOJE)}</p>`;

  /* ---------- mês ---------- */
  function faixas(ws, lista) {
    const we = soma(ws, 6), lanes = [];
    lista.filter(e => noPeriodo(e, ws, we)).sort((x, y) => x.ini.localeCompare(y.ini) || dif(y.ini, y.fim) - dif(x.ini, x.fim)).forEach(e => {
      const c0 = Math.max(0, dif(ws, e.ini)), c1 = Math.min(6, dif(ws, e.fim));
      let l = lanes.findIndex(ln => ln.every(s => s.c1 < c0 || s.c0 > c1));
      if (l < 0) { lanes.push([]); l = lanes.length - 1; }
      lanes[l].push({ e, c0, c1 });
    });
    return lanes;
  }
  function telaMes() {
    const p = periodo(), MAX = 3;
    let html = cabeca(MESES[dt(ref).getMonth()], `Agenda da equipe · ${dt(ref).getFullYear()}`);
    html += `<div class="dias-sem" aria-hidden="true">${SEM.map(s => `<span>${s}</span>`).join('')}</div>`;
    for (let ws = seg(p.a); ws <= p.b; ws = soma(ws, 7)) {
      const lanes = faixas(ws, visiveis());
      html += `<div class="semana" data-ws="${ws}">`;
      for (let k = 0; k < 7; k++) {
        const d = soma(ws, k), pz = prazosDe(d, d), extra = lanes.slice(MAX).filter(ln => ln.some(s => s.c0 <= k && s.c1 >= k)).length;
        html += `<div class="cel${d.slice(0, 7) !== p.a.slice(0, 7) ? ' fora' : ''}${k > 4 ? ' fds' : ''}${d === HOJE ? ' hoje' : ''}" style="grid-column:${k + 1}">
          <span class="num"${d === HOJE ? ' aria-label="hoje"' : ''}>${dt(d).getDate()}</span>
          ${pz.length ? `<span class="prazos-dia"><button type="button" class="prazo-tag" data-dia="${d}" aria-expanded="${popDia === d}">${ic('flag')}${pz.length}<span> prazo${pz.length > 1 ? 's' : ''}</span></button>
            ${popDia === d ? `<div class="prazo-pop">${pz.map(({ e, i }) => `<button type="button" data-abrir="${e.id}"><b>${esc(i.txt)}</b><small>${sig(e)} · ${esc(e.titulo)}</small></button>`).join('')}</div>` : ''}</span>` : ''}
          ${extra ? `<button type="button" class="mais" data-semana="${ws}" style="position:absolute;bottom:4px;right:4px">+${extra} mais</button>` : ''}
        </div>`;
      }
      lanes.slice(0, MAX).forEach((ln, li) => ln.forEach(({ e, c0, c1 }) => {
        html += `<button type="button" class="barra${e.ini < soma(ws, c0) ? ' continua-esq' : ''}${e.fim > soma(ws, c1) ? ' continua-dir' : ''}${feitoTudo(e) ? ' feito' : ''}" style="--pc:${pc(e)};grid-column:${c0 + 1}/${c1 + 2};grid-row:${li + 2}" data-abrir="${e.id}" aria-label="${esc(`${sig(e)} – ${e.titulo}, ${intervalo(e)}, ${pessoa(e.dono).ini}`)}"><span class="sig">${sig(e)}</span><span class="t">${esc(e.titulo)}</span></button>`;
      }));
      html += `</div>`;
    }
    folha().innerHTML = html + rodape();
  }

  /* ---------- semana ---------- */
  function telaSemana() {
    const p = periodo(), lanes = faixas(p.a, visiveis());
    let html = cabeca(`${curto(p.a)} – ${curto(p.b)}`, 'Semana · agenda da equipe');
    html += `<div class="sem-grade">` + Array.from({ length: 7 }, (_, k) => `<div class="sem-fundo${k > 4 ? ' fds' : ''}" style="grid-column:${k + 1};grid-row:1/-1"></div>`).join('');
    html += Array.from({ length: 7 }, (_, k) => { const d = soma(p.a, k); return `<div class="sem-dia" style="grid-column:${k + 1};grid-row:1"><span>${SEM[k]}</span><b class="num${d === HOJE ? ' hj' : ''}">${dt(d).getDate()}</b></div>`; }).join('');
    lanes.forEach((ln, li) => ln.forEach(({ e, c0, c1 }) => {
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
        const dentro = d >= p1 && d <= ult, evs = dentro ? lista.filter(e => e.ini <= d && e.fim >= d) : [];
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
    return `<button type="button" class="papel bilhete" style="--pc:${pc(e)}" data-abrir="${e.id}">
      <span class="canhoto"><span class="sig grifo">${sig(e)}</span><span class="quando">${intervalo(e)}</span></span>
      <span class="bilhete-corpo"><b>${esc(e.titulo)}</b><span class="linha">${[e.local, e.hora].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}<span class="ini">${esc(pessoa(e.dono).ini)}</span></span>
        <span class="progresso-picote">${e.itens.length ? `<span class="furos" aria-hidden="true">${e.itens.slice(0, 24).map(i => `<i class="${i.feito ? 'f' : ''}"></i>`).join('')}</span>${f} de ${e.itens.length}` : 'checklist vazio'}</span></span>
      ${feitoTudo(e) ? '<span class="carimbo">Concluído</span>' : ''}
    </button>`;
  }
  function telaLado() {
    if (formando) return formulario();
    if (aberto) { const e = eventos.find(x => x.id === aberto); if (e) return eventoAberto(e); aberto = null; }
    const p = periodo();
    const lista = (vista === 'ano' ? visiveis().filter(e => e.fim >= HOJE) : visiveis().filter(e => noPeriodo(e, p.a, p.b)))
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
        <div class="duas"><div><label class="r" for="fIni">Início</label><input type="date" class="campo" id="fIni" value="${e.ini}"></div><div><label class="r" for="fFim">Fim</label><input type="date" class="campo" id="fFim" value="${e.fim || e.ini}"></div></div>
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
    f.onsubmit = ev => {
      ev.preventDefault();
      const er = f.querySelector('#feErro'), t = f.querySelector('#fTit').value.trim(), ini = f.querySelector('#fIni').value, fim = f.querySelector('#fFim').value || ini;
      const falha = (m, el) => { er.textContent = m; er.hidden = false; el.focus(); };
      if (!t) return falha('Escreva o nome do evento.', f.querySelector('#fTit'));
      if (!ini) return falha('Escolha a data de início.', f.querySelector('#fIni'));
      if (fim < ini) return falha('O fim não pode ser antes do início.', f.querySelector('#fFim'));
      aberto = salvarEvento({ titulo: t, amb: f.amb.value, pub: f.pub.value, ini, fim, hora: f.querySelector('#fHora').value.trim(), local: f.querySelector('#fLocal').value.trim() }, ed);
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
    emCurso.finished.finally(() => {
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
    const t = ev.target.closest('button, a'); if (!t) { if (popDia) { popDia = null; desenhar(); } return; }
    if (t.dataset.vista) { irPara(t.dataset.vista); return; }
    if (t.dataset.tipo) { if (t.dataset.tipo !== tipoFiltro) transicao('suave', () => { tipoFiltro = t.dataset.tipo; try { sessionStorage.setItem('folha-tipo', tipoFiltro); } catch (e) {} }); return; }
    if (t.dataset.abrir) {
      popDia = null; formando = null; aberto = t.dataset.abrir;
      const e = eventos.find(x => x.id === aberto); if (e && vista !== 'ano' && !noPeriodo(e, periodo().a, periodo().b)) ref = e.ini;
      desenhar(); focar('#ab-t'); if (innerWidth <= 1020) lado().scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
    }
    if (t.dataset.dia) { popDia = popDia === t.dataset.dia ? null : t.dataset.dia; desenhar(); return; }
    if (t.dataset.mes) { irPara('mes', t.dataset.mes, t.closest('.mini')); return; }
    if (t.dataset.semana) { irPara('semana', t.dataset.semana, t.closest('.semana')); return; }
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
      case 'novo': aberto = null; formando = 'novo'; desenhar(); focar('#fTit'); if (innerWidth <= 1020) lado().scrollIntoView({ behavior: 'smooth' }); break;
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
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { if (popDia) { popDia = null; desenhar(); } else if (aberto || formando) { aberto = null; formando = null; desenhar(); } } });
  function imprimir() {
    const st = document.createElement('style');
    st.textContent = `@page { size: A4 ${vista === 'lista' ? 'portrait' : 'landscape'}; margin: 12mm; }`;
    document.head.appendChild(st); popDia = null; desenhar();
    window.print(); setTimeout(() => st.remove(), 500);
  }
  window.addEventListener('beforeunload', () => A.salvarJa && A.salvarJa());

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
