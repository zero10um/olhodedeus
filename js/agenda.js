/* Agenda da equipe: calendário grande com os eventos de todos os servidores.
   Zoom em 4 níveis (Dia, Semana, 2 semanas, Mês); clique no evento abre a ficha. */
(function (A) {
  const NIVEIS = ['dia', 'semana', 'quinzena', 'mes'];
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const SEML = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const IC = {
    local: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    hora: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 4 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    porta: '<path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21M3 21h18"/><path d="M15 12.5h.01"/>',
  };
  const svg = (d, t = 14, extra = '') => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

  /* ---------- Datas (texto aaaa-mm-dd) ---------- */
  const dow = s => A.d(s).getDay();
  const fds = s => dow(s) === 0 || dow(s) === 6;
  const segunda = s => A.somar(s, -((dow(s) + 6) % 7));
  const curta = s => `${SEM[dow(s)]} ${A.d(s).getDate()} ${MES[A.d(s).getMonth()]}`;
  const longa = s => `${SEML[dow(s)]}, ${A.d(s).getDate()} de ${MESL[A.d(s).getMonth()]}`;
  const hm = s => { const [h, m] = s.split(':').map(Number); return h + (m || 0) / 60; };

  /* "08:30 às 12:00", "8h - 12h", "14h" → horário de início e fim */
  function horas(txt) {
    const t = String(txt || '').toLowerCase().match(/(\d{1,2})\s*(?:[:h]\s*(\d{2}))?\s*h?/g);
    if (!t) return null;
    const conv = x => { const m = x.match(/(\d{1,2})\s*(?:[:h]\s*(\d{2}))?/); const h = +m[1], mm = +(m[2] || 0); return h < 24 && mm < 60 ? `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}` : null; };
    const a = conv(t[0]), b = t[1] ? conv(t[1]) : null;
    if (!a) return null;
    return { h: a, hf: b && hm(b) > hm(a) ? b : `${String(Math.min(23, Math.floor(hm(a)) + 2)).padStart(2, '0')}:${a.slice(3)}`, aprox: !b };
  }

  /* Cada processo com data vira um evento da agenda */
  function eventos() {
    const hoje = A.hojeIso();
    return A.estado.processos.filter(p => !p.arquivado && p.inicio).map(p => {
      const quem = A.perfil(p.dono) || { ini: '?', cor: 'var(--neutro)', bg: 'var(--neutro-bg)' };
      const frentes = p.frentes.map(f => {
        const e = A.estadoFrente(p, f);
        return { id: f.modeloId, nome: f.nome, est: e === 'feito' ? 'ok' : e === 'na' ? 'na' : 'falta' };
      });
      const salaF = p.frentes.find(f => f.modeloId === 'local');
      const sala = salaF ? (A.estadoFrente(p, salaF) === 'feito' ? 'ok' : A.estadoFrente(p, salaF) === 'na' ? 'na' : 'falta') : 'na';
      const hr = horas(p.horario);
      const fim = p.fim && p.fim >= p.inicio ? p.fim : p.inicio;
      const n = frentes.filter(f => f.est === 'falta').length;
      let sit;
      if (fim < hoje) sit = { c: 'passou', txt: 'Já aconteceu', longo: 'Já aconteceu' };
      else if (!n) sit = { c: 'pronto', txt: 'Tudo pronto', longo: 'Tudo pronto para o evento' };
      else {
        const s = A.situacao(p);
        sit = { c: s === 'critico' ? 'critico' : s === 'atencao' ? 'atencao' : 'emdia', txt: `Falta${n > 1 ? 'm' : ''} ${n}`, longo: `Falta${n > 1 ? 'm' : ''} ${n} ite${n > 1 ? 'ns' : 'm'} da preparação` };
      }
      return { p, id: p.id, t: p.titulo, quem, ini: p.inicio, fim, h: hr ? hr.h : null, hf: hr ? hr.hf : null, aprox: hr && hr.aprox,
        local: p.local || (p.modalidade && /online|on-line|ead|remot/i.test(p.modalidade) ? 'On-line' : ''), frentes, sala, sit, conflitos: A.conflitosSala(p) };
    });
  }

  /* ---------- Estado da tela ---------- */
  const st = { nivel: null, ancora: A.hojeIso(), fds: false, quem: null, sel: null, visto: undefined };
  let cal, det, raiz, evs = [];
  const visiveis = () => evs.filter(e => !st.quem || st.quem.has(e.p.dono));
  const ocorre = (e, d) => d >= e.ini && d <= e.fim;
  const cor = e => `--pc:${e.quem.cor};--pbg:${e.quem.bg}`;
  const corAv = q => `--c:${q.cor};--cbg:${q.bg}`;
  const guardar = () => { if (A.sessao) { A.prefs().agenda = { nivel: st.nivel, fds: st.fds }; A.salvar(); } };

  function mudar(fn, dir) {
    document.documentElement.dataset.dir = dir || '';
    if (!document.startViewTransition || A.semMovimento() || !dir) return fn();
    const t = document.startViewTransition(fn);
    t.ready.catch(() => {}); t.finished.catch(() => {}).then(() => { delete document.documentElement.dataset.dir; });
  }

  function diasDaVista() {
    const a = st.ancora;
    if (st.nivel === 'dia') return [a];
    if (st.nivel === 'semana' || st.nivel === 'quinzena') {
      const ini = segunda(a), n = st.nivel === 'semana' ? 7 : 14;
      return Array.from({ length: n }, (_, k) => A.somar(ini, k)).filter(d => st.fds || !fds(d));
    }
    const da = A.d(a), prim = A.iso(new Date(da.getFullYear(), da.getMonth(), 1)), ult = A.iso(new Date(da.getFullYear(), da.getMonth() + 1, 0));
    const dias = [], fim = A.somar(segunda(ult), 6);
    for (let d = segunda(prim); d <= fim; d = A.somar(d, 1)) if (st.fds || !fds(d)) dias.push(d);
    return dias;
  }
  function rotulo(dias) {
    const a = A.d(st.ancora);
    if (st.nivel === 'dia') return longa(st.ancora);
    if (st.nivel === 'mes') return `${MESL[a.getMonth()]} de ${a.getFullYear()}`;
    const i = A.d(dias[0]), f = A.d(dias[dias.length - 1]);
    return `${i.getDate()}${i.getMonth() !== f.getMonth() ? ' ' + MES[i.getMonth()] : ''} a ${f.getDate()} de ${MESL[f.getMonth()]}`;
  }

  /* ---------- Tela ---------- */
  A.telaAgenda = vista => {
    const pr = A.prefs().agenda || {};
    if (!st.nivel) { st.nivel = pr.nivel || (innerWidth < 640 ? 'dia' : 'semana'); st.fds = !!pr.fds; }
    evs = eventos();
    // o que colegas cadastraram desde a sua última visita fica grifado "novo" (nesta visita inteira)
    if (st.visto === undefined) { st.visto = A.prefs().agendaVisto || null; A.prefs().agendaVisto = new Date().toISOString(); A.salvar(); }
    evs.forEach(e => { e.novo = !!st.visto && e.p.dono !== A.euId() && (e.p.criadoEm || '') > st.visto; });
    vista.innerHTML = `<main class="tela-agenda" id="telaAgenda">
      <div class="abarra">
        <h1>Agenda da equipe</h1>
        <span class="ag-periodo" id="agPeriodo" aria-live="polite"></span>
        <div class="ag-nav">
          <button class="btn-icone" id="agAnt" type="button" aria-label="Anterior">${A.ic('anterior')}</button>
          <button class="btn" id="agHoje" type="button">Hoje</button>
          <button class="btn-icone" id="agProx" type="button" aria-label="Próximo">${A.ic('proximo')}</button>
        </div>
      </div>
      <div class="ag-ferr">
        <div class="ag-zoom" role="group" aria-label="Aproximar ou afastar">
          <button class="btn-icone" id="agMenos" type="button" aria-label="Afastar (ver mais dias)" title="Afastar">${svg('<path d="M5 12h14"/>', 18, 'stroke-width="2.2"')}</button>
          <div class="segmento" id="agNiveis">
            <label><input type="radio" name="agNivel" value="dia"><span>Dia</span></label>
            <label><input type="radio" name="agNivel" value="semana"><span>Semana</span></label>
            <label><input type="radio" name="agNivel" value="quinzena"><span>2 semanas</span></label>
            <label><input type="radio" name="agNivel" value="mes"><span>Mês</span></label>
          </div>
          <button class="btn-icone" id="agMais" type="button" aria-label="Aproximar (ver mais detalhes)" title="Aproximar">${svg('<path d="M12 5v14M5 12h14"/>', 18, 'stroke-width="2.2"')}</button>
        </div>
        <label class="ag-marcar"><input type="checkbox" id="agFds"> Sábado e domingo</label>
        <div class="aquem"><span>Quem:</span><div class="ag-quem-lista" id="agQuem"></div><button class="btn-texto" id="agTodos" type="button">Todos</button><button class="btn-texto" id="agMeus" type="button">Só os meus</button></div>
        <button class="btn" id="agImprimir" type="button">${A.ic('arquivo-ic')} Imprimir a semana</button>
        <span class="ag-dica">Ctrl + rodinha do mouse também aproxima e afasta</span>
      </div>
      <div class="ag-cal" id="agCal"></div>
      <aside class="ag-detalhe" id="agDet" aria-labelledby="agDetT" hidden></aside>
    </main>`;
    raiz = vista.querySelector('#telaAgenda'); cal = raiz.querySelector('#agCal'); det = raiz.querySelector('#agDet');
    ajustarAltura();
    ligar();
    desenhar();
    if (st.sel && evs.some(e => e.id === st.sel)) abrir(st.sel, null, true); else st.sel = null;
  };

  function ajustarAltura() {
    if (!raiz) return;
    const topo = raiz.getBoundingClientRect().top + window.scrollY;
    raiz.style.height = Math.max(520, window.innerHeight - topo) + 'px';
  }

  function desenhar() {
    const dias = diasDaVista();
    raiz.querySelector('#agPeriodo').textContent = rotulo(dias);
    raiz.querySelectorAll('#agNiveis input').forEach(i => i.checked = i.value === st.nivel);
    raiz.querySelector('#agMais').disabled = st.nivel === 'dia';
    raiz.querySelector('#agMenos').disabled = st.nivel === 'mes';
    raiz.querySelector('#agFds').checked = st.fds;
    const pessoas = A.estado.perfis.filter(p => evs.some(e => e.p.dono === p.id));
    raiz.querySelector('#agQuem').innerHTML = pessoas.length ? pessoas.map(p => `<button class="ag-pessoa" type="button" data-quem="${p.id}" aria-pressed="${!st.quem || st.quem.has(p.id)}" style="${corAv(p)}" aria-label="Mostrar eventos de ${A.esc(p.ini)}" title="${A.esc(p.ini)}">${A.avatar(p)}</button>`).join('') : '<span class="secundario">ninguém com evento ainda</span>';
    if (!evs.length) {
      cal.innerHTML = `<div class="ag-vazio"><h2>Nenhum evento com data ainda</h2><p class="secundario">Quando alguém cadastrar um processo com data de início, ele aparece aqui para toda a equipe.</p><a class="btn btn-primario" href="#/processos/novo">${A.ic('mais')} Cadastrar um processo</a></div>`;
      return;
    }
    if (st.nivel === 'dia' || st.nivel === 'semana') grade(dias); else mes(dias);
  }

  function grade(dias) {
    const porDia = dias.map(d => visiveis().filter(e => ocorre(e, d)));
    let h0 = 8, h1 = 18;
    porDia.flat().filter(e => e.h).forEach(e => { h0 = Math.min(h0, Math.floor(hm(e.h))); h1 = Math.max(h1, Math.ceil(hm(e.hf))); });
    h0 = Math.max(0, h0 - 1); h1 = Math.min(24, h1 + 1);
    const horasN = h1 - h0, agora = new Date(), hAgora = agora.getHours() + agora.getMinutes() / 60, hoje = A.hojeIso();
    const semHora = porDia.map(l => l.filter(e => !e.h));
    const temSemHora = semHora.some(l => l.length);
    const colunas = dias.map((d, k) => {
      const lista = porDia[k].filter(e => e.h).sort((a, b) => hm(a.h) - hm(b.h) || hm(b.hf) - hm(a.hf)).map(e => ({ e }));
      // eventos que se cruzam ficam lado a lado
      const fimTrilha = [], grupos = []; let atual = [], fimGrupo = -1;
      lista.forEach(x => {
        if (hm(x.e.h) >= fimGrupo && atual.length) { grupos.push(atual); atual = []; fimTrilha.length = 0; }
        let t = fimTrilha.findIndex(f => f <= hm(x.e.h)); if (t < 0) t = fimTrilha.length;
        fimTrilha[t] = hm(x.e.hf); x.t = t; atual.push(x); fimGrupo = Math.max(fimGrupo, hm(x.e.hf));
      });
      if (atual.length) grupos.push(atual);
      grupos.forEach(g => { const n = Math.max(...g.map(x => x.t)) + 1; g.forEach(x => x.n = n); });
      const ehHoje = d === hoje;
      const linha = ehHoje && hAgora >= h0 && hAgora <= h1 ? `<div class="ag-agora" style="top:calc(var(--hora) * ${hAgora - h0})" aria-hidden="true"></div>` : '';
      return `<div class="ag-col${ehHoje ? ' hoje' : ''}${fds(d) ? ' fds' : ''}">${lista.map(x => bloco(x, d, h0)).join('')}${linha}</div>`;
    }).join('');
    cal.innerHTML = `<div class="ag-corpo" id="agCorpo" style="--cols:${dias.length};--horas:${horasN}">
      <div class="ag-cab"><div></div>${dias.map((d, k) => `<div class="${d === hoje ? 'hoje' : ''}"><button class="ag-dia-btn" type="button" data-dia="${d}" ${st.nivel === 'dia' ? 'disabled' : `aria-label="Aproximar em ${longa(d)}"`}><span>${st.nivel === 'dia' ? SEML[dow(d)] : SEM[dow(d)]}</span><span class="num">${A.d(d).getDate()}</span></button>
        ${temSemHora ? `<div class="ag-semhora">${semHora[k].map(e => pill(e, d, false)).join('')}</div>` : ''}</div>`).join('')}</div>
      <div class="ag-trilho"><div class="ag-horas">${Array.from({ length: horasN }, (_, k) => `<span style="top:calc(var(--hora) * ${k})">${h0 + k}h</span>`).join('')}</div>${colunas}</div>
    </div>`;
    ajustarHora(horasN);
  }

  function bloco(x, d, h0) {
    const e = x.e, s = e.sit, top = hm(e.h) - h0, alt = hm(e.hf) - hm(e.h);
    const total = A.entre(e.ini, e.fim) + 1, dia = A.entre(e.ini, d) + 1;
    const multi = total > 1 ? ` · dia ${dia} de ${total}` : '';
    const tam = alt <= 1.6 ? ' baixo' : st.nivel === 'dia' ? ' alto' : '';
    const salaIc = e.sala === 'falta' ? `<span style="color:var(--critico)">${svg(IC.porta, 13)}</span>` : svg(IC.local, 13);
    const extra = st.nivel === 'dia' ? `<span class="ag-prep-mini">${e.frentes.filter(f => f.est !== 'na').map(f => `<span class="${f.est}">${f.est === 'ok' ? svg(IC.check, 11) : '○'} ${A.esc(f.nome)}</span>`).join('')}</span>` : '';
    return `<button class="aev${tam}${s.c === 'passou' ? ' passou' : ''}${st.sel === e.id ? ' sel' : ''}" type="button" data-id="${e.id}"
      style="${cor(e)};top:calc(var(--hora) * ${top} + 1px);height:calc(var(--hora) * ${alt} - 3px);left:calc(${x.t} / ${x.n} * 100% + 3px);width:calc(100% / ${x.n} - 6px)"
      aria-label="${A.esc(e.t)}, ${e.h} às ${e.hf}${multi}${e.local ? ', ' + A.esc(e.local) : ''}, responsável ${A.esc(e.quem.ini)}. ${s.longo}.">
      <span class="aev-topo"><span>${e.h}${e.aprox ? '' : '–' + e.hf}${multi}</span><span class="avatar amini" style="${corAv(e.quem)}">${A.esc(e.quem.ini.replace(/\./g, ''))}</span></span>
      <span class="aev-t">${e.novo ? '<span class="novo">novo</span> ' : ''}${A.esc(e.t)}</span>
      ${e.local || e.sala === 'falta' ? `<span class="aev-l">${salaIc} ${A.esc(e.local || 'Local a definir')}${e.sala === 'falta' ? ' · sala a reservar' : ''}</span>` : ''}
      <span class="aselo ${s.c}">${s.txt}</span>${e.conflitos.length ? '<span class="aselo critico">Conflito de sala</span>' : ''}${extra}
    </button>`;
  }

  function ajustarHora(horasN) {
    const corpo = cal.querySelector('#agCorpo'); if (!corpo) return;
    const cab = corpo.querySelector('.ag-cab').offsetHeight;
    const min = st.nivel === 'dia' ? 64 : 46;
    corpo.style.setProperty('--hora', Math.max(min, (corpo.clientHeight - cab - 2) / horasN) + 'px');
  }

  function pill(e, d, largo) {
    const s = e.sit, total = A.entre(e.ini, e.fim) + 1;
    return `<button class="ag-pill${st.sel === e.id ? ' sel' : ''}" type="button" data-id="${e.id}" style="${cor(e)}" aria-label="${A.esc(e.t)}${e.h ? ', ' + e.h : ''}${e.local ? ', ' + A.esc(e.local) : ''}, responsável ${A.esc(e.quem.ini)}. ${s.longo}.">
      <span class="l1"><span class="ag-ponto ${s.c}"></span>${e.conflitos.length ? `<span class="ag-conf" title="Conflito de sala">${A.ic('alerta', 'ic-sm')}</span>` : ''}${e.h ? `<span>${e.h}</span>` : ''}${e.novo ? '<span class="novo">novo</span>' : ''}<b>${A.esc(e.t)}</b></span>
      ${largo ? `<span class="l2">${A.esc(e.quem.ini)}${e.local ? ' · ' + A.esc(e.local) : ''}${total > 1 ? ` · dia ${A.entre(e.ini, d) + 1} de ${total}` : ''}</span>` : ''}
    </button>`;
  }

  function mes(dias) {
    const cols = st.fds ? 7 : 5, largo = st.nivel === 'quinzena', hoje = A.hojeIso();
    const nomes = (st.fds ? [1, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5]).map(k => `<span>${SEML[k]}</span>`).join('');
    const m = A.d(st.ancora).getMonth();
    const celulas = dias.map(d => {
      const lista = visiveis().filter(e => ocorre(e, d)).sort((a, b) => (a.h || '00') < (b.h || '00') ? -1 : 1);
      const dd = A.d(d);
      const cls = [st.nivel === 'mes' && dd.getMonth() !== m ? 'fora' : '', d === hoje ? 'hoje' : '', d < hoje ? 'passado' : ''].join(' ');
      return `<div class="ag-dia ${cls}"><button class="ag-num" type="button" data-dia="${d}" aria-label="Aproximar em ${longa(d)}">${dd.getDate() === 1 ? '1 ' + MES[dd.getMonth()] : dd.getDate()}</button><div class="ag-lista">${lista.map(e => pill(e, d, largo)).join('')}</div><button class="ag-mais" type="button" data-dia="${d}" hidden></button></div>`;
    }).join('');
    cal.innerHTML = `<div class="ag-mcab" style="--cols:${cols}">${nomes}</div><div class="ag-mgrade" style="--cols:${cols}">${celulas}</div>`;
    caber();
  }
  function caber() {
    cal.querySelectorAll('.ag-dia').forEach(c => {
      const lista = c.querySelector('.ag-lista'), mais = c.querySelector('.ag-mais'), pills = [...lista.children];
      pills.forEach(p => p.hidden = false); mais.hidden = true;
      let k = pills.length;
      while (k > 0 && lista.scrollHeight > lista.clientHeight + 1) { k--; pills[k].hidden = true; mais.hidden = false; mais.textContent = `+${pills.length - k} mais`; }
    });
  }

  /* ---------- Ficha do evento ---------- */
  let voltarPara = null;
  function abrir(id, origem, semFoco) {
    const e = evs.find(x => x.id === id); if (!e) return;
    const p = e.p, s = e.sit;
    st.sel = id; if (origem) voltarPara = origem;
    cal.querySelectorAll('.sel').forEach(x => x.classList.remove('sel'));
    cal.querySelectorAll(`[data-id="${id}"]`).forEach(x => x.classList.add('sel'));
    const aplica = e.frentes.filter(f => f.est !== 'na'), prontos = aplica.filter(f => f.est === 'ok').length;
    const total = A.entre(e.ini, e.fim) + 1;
    const quando = total > 1 ? `${curta(e.ini)} a ${curta(e.fim)} (${total} dias)` : longa(e.ini);
    const sala = { ok: [IC.check, 'Sala reservada e preparada'], falta: [IC.porta, 'Sala ainda não reservada'], na: [IC.x, 'Não precisa de sala'] }[e.sala];
    const meu = p.dono === A.euId();
    det.innerHTML = `
      <div class="ag-det-topo">${A.avatar(e.quem, 'medio')}<div><p class="secundario">Responsável</p><strong>${A.esc(e.quem.ini)}</strong></div>
        <button class="btn-icone afechar" id="agFechar" type="button" aria-label="Fechar">${svg(IC.x, 20)}</button></div>
      <h2 id="agDetT">${A.esc(e.t)}</h2>
      <span class="aselo grande ${s.c}">${s.longo}</span>
      <dl class="ag-det-dados">
        <div>${svg(IC.hora, 18)}<dt>Quando</dt><dd>${quando}</dd><dd>${A.esc(p.horario || 'Horário não informado')}</dd></div>
        <div>${svg(IC.local, 18)}<dt>Onde</dt><dd>${A.esc(e.local || 'Local não informado')}${p.modalidade ? ` · ${A.esc(p.modalidade)}` : ''}</dd><dd><span class="ag-sala ${e.sala}">${svg(sala[0], 14)} ${sala[1]}</span></dd>${e.conflitos.length ? `<dd class="aviso-conflito">${A.ic('alerta')}<span><strong>Conflito de sala.</strong> ${e.conflitos.map(o => A.esc(A.textoConflito(o))).join(' ')}</span></dd>` : ''}</div>
        ${p.unidade || p.apoio ? `<div>${svg(IC.pessoas, 18)}<dt>Unidade e apoio</dt><dd>${A.esc([p.unidade, p.apoio ? 'apoio ' + p.apoio : ''].filter(Boolean).join(' · '))}</dd></div>` : ''}
      </dl>
      <h3>Preparação <span class="secundario">${aplica.length ? `${prontos} de ${aplica.length} prontas` : 'nada a preparar'}</span></h3>
      ${aplica.length ? `<div class="ag-barra-prog"><span style="width:${prontos / aplica.length * 100}%"></span></div>` : ''}
      <ul class="ag-prep">${e.frentes.map((f, i) => `<li class="${f.est}" style="--i:${i}"><span class="marca-p">${f.est === 'ok' ? svg(IC.check, 13, 'stroke-width="3"') : ''}</span><span class="nome-p">${A.esc(f.nome)}</span><span class="estado-p">${{ ok: 'Pronto', falta: 'Falta', na: 'Não se aplica' }[f.est]}</span></li>`).join('')}</ul>
      <h3>Processos SEI</h3>
      <ul class="ag-seis">
        ${p.sei ? `<li><span class="tipo-s">Principal</span><button class="ag-sei" type="button" data-copiar="${A.esc(p.sei)}">${A.esc(p.sei)} ${svg(IC.copiar, 13)}</button></li>` : ''}
        ${(p.seis || []).map(x => `<li><span class="tipo-s">${A.esc(x.tipo || 'Relacionado')}</span><button class="ag-sei" type="button" data-copiar="${A.esc(x.numero)}">${A.esc(x.numero)} ${svg(IC.copiar, 13)}</button></li>`).join('')}
        ${(p.seis || []).length ? '' : '<li class="secundario">Nenhum SEI relacionado.</li>'}
      </ul>
      <div class="form-botoes" style="margin-top:24px;justify-content:flex-start">
        ${meu ? `<a class="btn btn-primario" href="#/processo/${p.id}">Abrir o processo</a>` : ''}
        <button class="btn" id="agResumo" type="button">${svg(IC.copiar, 16)} Copiar resumo</button>
      </div>
      ${meu ? '' : `<p class="secundario" style="margin-top:12px">Este processo é de ${A.esc(e.quem.ini)}. Só a pessoa responsável pode alterá-lo.</p>`}`;
    det.hidden = false;
    requestAnimationFrame(() => det.classList.add('aberto'));
    if (!semFoco) det.querySelector('#agFechar').focus({ preventScroll: true });
    det.querySelector('#agFechar').onclick = fechar;
    det.querySelector('#agResumo').onclick = () => A.copiar(`${e.t}\n${quando}${p.horario ? ', ' + p.horario : ''}\nLocal: ${e.local || 'a definir'} (${sala[1].toLowerCase()})\nResponsável: ${e.quem.ini}${p.sei ? '\nSEI ' + p.sei : ''}`, 'Resumo copiado. Dá para colar no e-mail ou no Teams.');
    det.querySelectorAll('[data-copiar]').forEach(b => b.onclick = () => A.copiar(b.dataset.copiar, `SEI ${b.dataset.copiar} copiado.`));
  }
  function fechar() {
    if (!det || det.hidden) return;
    st.sel = null;
    cal.querySelectorAll('.sel').forEach(x => x.classList.remove('sel'));
    det.classList.remove('aberto');
    setTimeout(() => { if (!det.classList.contains('aberto')) det.hidden = true; }, A.semMovimento() ? 0 : 320);
    if (voltarPara && document.contains(voltarPara)) voltarPara.focus({ preventScroll: true });
  }

  /* ---------- Imprimir a semana: uma folha A4 deitada, com legenda e lista de horários ---------- */
  function imprimirSemana() {
    const seg = segunda(st.ancora), hoje = A.hojeIso();
    let dias = Array.from({ length: 7 }, (_, k) => A.somar(seg, k));
    const lista = visiveis();
    const temFds = dias.some(d => fds(d) && lista.some(e => ocorre(e, d)));
    if (!st.fds && !temFds) dias = dias.filter(d => !fds(d));
    const daSemana = lista.filter(e => dias.some(d => ocorre(e, d)));
    const ordem = (a, b) => (a.h || '99') < (b.h || '99') ? -1 : (a.h || '99') > (b.h || '99') ? 1 : a.t.localeCompare(b.t);
    const pessoas = A.estado.perfis.filter(p => daSemana.some(e => e.p.dono === p.id));
    const d0 = A.d(dias[0]), d1 = A.d(dias[dias.length - 1]);
    const titulo = `Semana de ${d0.getDate()}${d0.getMonth() !== d1.getMonth() ? ' de ' + MESL[d0.getMonth()] : ''} a ${d1.getDate()} de ${MESL[d1.getMonth()]} de ${d1.getFullYear()}`;
    const marcaSala = s => s === 'ok' ? `${svg(IC.check, 12, 'stroke-width="3"')} sala reservada` : s === 'falta' ? `${svg(IC.x, 12, 'stroke-width="3"')} sala a reservar` : '';
    const quem = !st.quem ? 'Toda a equipe' : [...st.quem].map(id => (A.perfil(id) || {}).ini).filter(Boolean).join(', ');
    const el = document.createElement('div');
    el.id = 'impressao';
    el.innerHTML = `<section class="fi-folha">
      <header class="fi-cab">
        <div><p class="fi-rot">Agenda da equipe · Setor pedagógico</p><h1>${titulo}</h1></div>
        <p class="fi-meta">${daSemana.length} evento${daSemana.length === 1 ? '' : 's'} · ${A.esc(quem)}<br>Impresso em ${A.fmtAno(hoje)}</p>
      </header>
      <div class="fi-grade" style="--cols:${dias.length}">
        ${dias.map(d => { const evd = daSemana.filter(e => ocorre(e, d)).sort(ordem); const dd = A.d(d); return `<section class="fi-dia${d === hoje ? ' hoje' : ''}${fds(d) ? ' fds' : ''}">
          <h2><span class="fi-dsem">${SEML[dow(d)]}</span><span class="fi-dnum">${String(dd.getDate()).padStart(2, '0')}/${String(dd.getMonth() + 1).padStart(2, '0')}</span></h2>
          ${evd.length ? evd.map(e => { const tot = A.entre(e.ini, e.fim) + 1; return `<article class="fi-ev" style="--pc:${e.quem.cor};--pbg:${e.quem.bg}">
            <p class="fi-hora"><span>${e.h ? `${e.h}${e.aprox ? '' : '–' + e.hf}` : 'Horário a definir'}</span></p>
            <h3>${A.esc(e.t)}</h3>
            <p class="fi-onde">${A.esc(e.local || 'Local a definir')}</p>
            <p class="fi-pe"><span class="fi-ini">${A.esc(e.quem.ini)}</span>${tot > 1 ? `<span>dia ${A.entre(e.ini, d) + 1} de ${tot}</span>` : ''}<span class="fi-sala ${e.sala}">${marcaSala(e.sala)}</span></p>
            ${e.conflitos.length ? `<p class="fi-conf">Conflito de sala</p>` : ''}
          </article>`; }).join('') : '<p class="fi-vazio">Sem eventos</p>'}
        </section>`; }).join('')}
      </div>
      <footer class="fi-legenda">
        <div><p class="fi-rot">Responsáveis</p><ul>${pessoas.map(p => `<li><span class="fi-chip" style="--pc:${p.cor};--pbg:${p.bg}"></span>${A.esc(p.ini)}</li>`).join('') || '<li>—</li>'}</ul></div>
        <div><p class="fi-rot">Sala</p><ul><li class="fi-sala ok">${svg(IC.check, 12, 'stroke-width="3"')} reservada</li><li class="fi-sala falta">${svg(IC.x, 12, 'stroke-width="3"')} a reservar</li><li>sem marca: não precisa</li></ul></div>
        <div><p class="fi-rot">Como ler</p><ul><li>O horário vem grifado na cor de quem cuida do evento.</li><li>Eventos de vários dias aparecem em cada dia, com "dia 1 de 3".</li></ul></div>
      </footer>
    </section>
    ${daSemana.length ? `<section class="fi-folha fi-lista">
      <header class="fi-cab"><div><p class="fi-rot">Lista de horários</p><h1>${titulo}</h1></div></header>
      <table><thead><tr><th>Dia</th><th>Horário</th><th>Evento</th><th>Local</th><th>Sala</th><th>Responsável</th><th>SEI</th></tr></thead>
      <tbody>${dias.flatMap(d => daSemana.filter(e => ocorre(e, d)).sort(ordem).map(e => `<tr><td>${curta(d)}</td><td>${e.h ? `${e.h}${e.aprox ? '' : '–' + e.hf}` : '—'}</td><td>${A.esc(e.t)}</td><td>${A.esc(e.local || '—')}</td><td>${{ ok: 'reservada', falta: 'a reservar', na: '—' }[e.sala]}</td><td>${A.esc(e.quem.ini)}</td><td>${A.esc(e.p.sei || '—')}</td></tr>`)).join('')}</tbody></table>
    </section>` : ''}`;
    document.querySelectorAll('#impressao').forEach(x => x.remove());
    document.body.appendChild(el);
    const limpar = () => { el.remove(); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    setTimeout(() => window.print(), 50);
  }

  /* ---------- Navegação e zoom ---------- */
  function irPara(nivel, dia, dir) {
    mudar(() => { st.nivel = nivel; if (dia) st.ancora = dia; desenhar(); guardar(); }, dir || (NIVEIS.indexOf(nivel) < NIVEIS.indexOf(st.nivel) ? 'in' : 'out'));
  }
  function zoom(passo, dia) {
    const k = NIVEIS.indexOf(st.nivel) + passo;
    if (k >= 0 && k < NIVEIS.length) irPara(NIVEIS[k], dia, passo < 0 ? 'in' : 'out');
  }
  function andar(s) {
    mudar(() => {
      const a = st.ancora;
      if (st.nivel === 'dia') { let d = A.somar(a, s); while (!st.fds && fds(d)) d = A.somar(d, s); st.ancora = d; }
      else if (st.nivel === 'semana') st.ancora = A.somar(a, 7 * s);
      else if (st.nivel === 'quinzena') st.ancora = A.somar(a, 14 * s);
      else { const da = A.d(a); st.ancora = A.iso(new Date(da.getFullYear(), da.getMonth() + s, 1)); }
      desenhar();
    }, s < 0 ? 'esq' : 'dir');
  }

  function ligar() {
    const $ = s => raiz.querySelector(s);
    $('#agMais').onclick = () => zoom(-1);
    $('#agMenos').onclick = () => zoom(1);
    $('#agAnt').onclick = () => andar(-1);
    $('#agProx').onclick = () => andar(1);
    $('#agHoje').onclick = () => mudar(() => { st.ancora = A.hojeIso(); desenhar(); }, 'in');
    $('#agNiveis').onchange = e => irPara(e.target.value);
    $('#agFds').onchange = e => mudar(() => { st.fds = e.target.checked; desenhar(); guardar(); }, 'in');
    $('#agTodos').onclick = () => { st.quem = null; desenhar(); };
    $('#agMeus').onclick = () => { st.quem = new Set([A.euId()]); desenhar(); };
    $('#agImprimir').onclick = imprimirSemana;
    $('#agQuem').onclick = e => {
      const b = e.target.closest('[data-quem]'); if (!b) return;
      const q = b.dataset.quem, todos = A.estado.perfis.map(p => p.id);
      if (!st.quem) st.quem = new Set([q]); // primeiro clique: só essa pessoa
      else if (st.quem.has(q)) { st.quem.delete(q); if (!st.quem.size) st.quem = null; }
      else { st.quem.add(q); if (todos.every(id => st.quem.has(id))) st.quem = null; }
      desenhar();
      const f = raiz.querySelector(`[data-quem="${q}"]`); if (f) f.focus();
    };
    cal.onclick = e => {
      const ev = e.target.closest('[data-id]');
      if (ev) return abrir(ev.dataset.id, ev);
      const d = e.target.closest('[data-dia]');
      if (d && !d.disabled) irPara('dia', d.dataset.dia);
    };
    let acumulado = 0, travado = false;
    cal.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (travado) return;
      acumulado += e.deltaY;
      if (Math.abs(acumulado) > 40) { zoom(acumulado > 0 ? 1 : -1); acumulado = 0; travado = true; setTimeout(() => travado = false, 380); }
    }, { passive: false });
  }

  document.addEventListener('keydown', e => {
    if (!raiz || !document.contains(raiz)) return;
    if (e.key === 'Escape') return fechar();
    if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') zoom(-1);
    else if (e.key === '-') zoom(1);
    else if (e.key === 'ArrowLeft' && !e.target.closest('.segmento')) andar(-1);
    else if (e.key === 'ArrowRight' && !e.target.closest('.segmento')) andar(1);
  });
  let tRes;
  window.addEventListener('resize', () => {
    clearTimeout(tRes);
    tRes = setTimeout(() => {
      if (!raiz || !document.contains(raiz)) return;
      ajustarAltura();
      const corpo = cal.querySelector('#agCorpo');
      if (corpo) ajustarHora(+corpo.style.getPropertyValue('--horas')); else caber();
    }, 80);
  });
})(window.App);
