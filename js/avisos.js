/* Avisos: o sininho do topo. Junta o que pede atenção nos seus processos (prazo vencido, certificado
   para cobrar, resposta que não volta, processo pronto para arquivar, conflito de sala) e o que
   colegas cadastraram de novo. Cada aviso some quando você marca "Visto" ou quando a situação muda. */
(function (A) {
  const SINO = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
  const TIPOS = {
    cobrar: { peso: 6, ic: 'alerta', cor: 'critico', rot: 'Cobrar certificado' },
    atrasado: { peso: 5, ic: 'alerta', cor: 'critico', rot: 'Atrasado' },
    conflito: { peso: 5, ic: 'alerta', cor: 'critico', rot: 'Conflito de sala' },
    hoje: { peso: 4, ic: 'relogio', cor: 'atencao', rot: 'Vence hoje' },
    resposta: { peso: 3, ic: 'relogio', cor: 'atencao', rot: 'Sem resposta' },
    classificar: { peso: 2, ic: 'alerta', cor: 'atencao', rot: 'Classificar' },
    arquivar: { peso: 2, ic: 'feito', cor: 'ok', rot: 'Pronto para arquivar' },
    novo: { peso: 1, ic: 'calendario', cor: 'emdia', rot: 'Novo na equipe' },
  };

  A.avisosLista = () => {
    if (!A.estado || !A.sessao) return [];
    const lista = [], eu = A.euId(), hoje = A.hojeIso();
    A.ativos().forEach(p => {
      const pend = A.itensAtivos(p).filter(x => x.i.estado !== 'feita');
      pend.forEach(({ i }) => {
        const prazo = A.prazo(p, i); if (!prazo || i.estado === 'esperando') return;
        const d = A.dias(prazo);
        if (/cobrar.*certificad/i.test(A.semAcento(i.nome)) && d <= 0)
          lista.push({ id: `cobrar:${p.id}:${i.id}`, tipo: 'cobrar', p, texto: `Já passaram 15 dias do evento e o certificado não foi marcado como apresentado. Cobre do servidor${p.apoio ? ' (' + p.apoio + ')' : ''}.` });
        else if (d < 0) lista.push({ id: `atraso:${p.id}:${i.id}`, tipo: 'atrasado', p, texto: `"${i.nome}" está atrasado há ${-d} dia${d === -1 ? '' : 's'}.` });
        else if (d === 0) lista.push({ id: `hoje:${p.id}:${i.id}:${hoje}`, tipo: 'hoje', p, texto: `"${i.nome}" vence hoje.` });
      });
      p.despachos.filter(a => !a.resposta && a.enviado && A.entre(a.enviado, hoje) >= 7).forEach(a => {
        const n = A.entre(a.enviado, hoje);
        lista.push({ id: `resp:${p.id}:${a.id}`, tipo: 'resposta', p, texto: `${a.setor} não respondeu o despacho enviado há ${n} dias.` });
      });
      if (A.tudoFeito(p)) lista.push({ id: `arq:${p.id}`, tipo: 'arquivar', p, texto: 'Tudo feito. Dá para arquivar: ele sai do painel, mas continua em Processos > Arquivados.' });
      A.conflitosSala(p).forEach(o => lista.push({ id: `conf:${p.id}:${o.id}`, tipo: 'conflito', p, texto: A.textoConflito(o) }));
      if (A.semPlanilha() && !p.ambito) lista.push({ id: `classe:${p.id}`, tipo: 'classificar', p, texto: 'Falta dizer se é interno ou externo e para quem é.' });
    });
    // o que colegas cadastraram desde que você começou a usar os avisos (últimos 14 dias)
    const desde = A.prefs().avisosDesde;
    if (A.semPlanilha() && desde) A.estado.processos.filter(p => p.dono !== eu && !p.arquivado && (p.criadoEm || '') > desde && A.entre((p.criadoEm || '').slice(0, 10) || hoje, hoje) <= 14)
      .forEach(p => lista.push({ id: `novo:${p.id}`, tipo: 'novo', p, texto: `${(A.perfil(p.dono) || {}).ini || 'Um colega'} cadastrou${p.inicio ? ` um evento para ${A.fmt(p.inicio)}` : ' um processo'}.` }));
    const vistos = A.prefs().avisosVistos || {};
    lista.forEach(a => { a.visto = !!vistos[a.id]; });
    return lista.sort((a, b) => (a.visto - b.visto) || (TIPOS[b.tipo].peso - TIPOS[a.tipo].peso));
  };

  const marcarVisto = ids => {
    const pr = A.prefs(), v = pr.avisosVistos || (pr.avisosVistos = {}), hoje = A.hojeIso();
    ids.forEach(id => { v[id] = hoje; });
    // esquece o que já não existe, para não crescer para sempre
    const vivos = new Set(A.avisosLista().map(a => a.id));
    Object.keys(v).forEach(id => { if (!vivos.has(id) && A.entre(v[id], hoje) > 30) delete v[id]; });
    A.salvar();
  };

  /* Botão do topo + painel */
  A.botaoAvisos = () => {
    if (!A.prefs().avisosDesde && A.sessao && A.sessao.acesso === 'dono') { A.prefs().avisosDesde = new Date().toISOString(); A.salvar(); }
    const n = A.avisosLista().filter(a => !a.visto).length;
    return `<div class="avisos"><button type="button" class="btn-icone avisos-btn" id="avisosBtn" aria-haspopup="dialog" aria-expanded="false" aria-controls="avisosPainel"
      aria-label="Avisos${n ? `: ${n} novo${n > 1 ? 's' : ''}` : ''}" title="Avisos">${SINO}${n ? `<span class="avisos-n" aria-hidden="true">${n > 99 ? '99+' : n}</span>` : ''}</button>
      <div class="avisos-painel" id="avisosPainel" role="dialog" aria-label="Avisos" hidden></div></div>`;
  };

  function desenharPainel(painel) {
    const lista = A.avisosLista(), novos = lista.filter(a => !a.visto), vistos = lista.filter(a => a.visto);
    const item = a => {
      const t = TIPOS[a.tipo], meu = a.p.dono === A.euId();
      return `<li class="aviso-item${a.visto ? ' visto' : ''}" data-aviso="${A.esc(a.id)}">
        <span class="selo" style="--c:var(--${t.cor});--cbg:var(--${t.cor}-bg)">${A.ic(t.ic)}${t.rot}</span>
        <a class="aviso-t" href="#/processo/${a.p.id}" data-dono="${a.p.dono}">${A.esc(a.p.titulo)}</a>
        <p class="aviso-x">${A.esc(a.texto)}</p>
        <div class="aviso-acoes">
          ${a.tipo === 'arquivar' && meu && A.podeEditar() ? `<button class="btn" type="button" data-arquivar="${a.p.id}">${A.ic('arquivo-ic')} Arquivar</button>` : ''}
          ${a.visto ? '' : `<button class="btn-texto" type="button" data-visto="${A.esc(a.id)}">Visto</button>`}
        </div></li>`;
    };
    painel.innerHTML = `<div class="avisos-cab"><h2>Avisos</h2>${novos.length ? '<button class="btn-texto" type="button" id="avisosTodos">Marcar todos como vistos</button>' : ''}</div>
      ${lista.length ? `${novos.length ? `<ul class="avisos-lista">${novos.map(item).join('')}</ul>` : '<p class="avisos-vazio">Nada novo. Tudo em dia por aqui.</p>'}
        ${vistos.length ? `<details class="avisos-vistos"><summary>Já vistos (${vistos.length})</summary><ul class="avisos-lista">${vistos.map(item).join('')}</ul></details>` : ''}`
        : '<p class="avisos-vazio">Nenhum aviso. Quando um prazo vencer, um certificado precisar ser cobrado ou um processo ficar pronto para arquivar, aparece aqui.</p>'}`;
  }

  A.ligarAvisos = () => {
    const btn = document.getElementById('avisosBtn'), painel = document.getElementById('avisosPainel');
    if (!btn) return;
    const fechar = () => { painel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.onclick = e => {
      e.stopPropagation();
      if (!painel.hidden) return fechar();
      desenharPainel(painel); painel.hidden = false; btn.setAttribute('aria-expanded', 'true');
      const f = painel.querySelector('a, button'); if (f) f.focus();
    };
    painel.onclick = e => {
      e.stopPropagation();
      const vis = e.target.closest('[data-visto]'), arq = e.target.closest('[data-arquivar]'), link = e.target.closest('a[data-dono]');
      if (vis) { marcarVisto([vis.dataset.visto]); desenharPainel(painel); atualizarContagem(); }
      if (e.target.closest('#avisosTodos')) { marcarVisto(A.avisosLista().filter(a => !a.visto).map(a => a.id)); desenharPainel(painel); atualizarContagem(); }
      if (arq) {
        const p = A.proc(arq.dataset.arquivar), desfaz = A.arquivar(p);
        desenharPainel(painel); atualizarContagem(); A.redesenhar();
        A.avisar(`"${p.titulo}" arquivado.`, () => { desfaz(); A.redesenhar(); });
      }
      if (link) {
        const id = link.closest('[data-aviso]').dataset.aviso; marcarVisto([id]);
        const dono = link.dataset.dono;
        if (A.sessao.perfilId !== dono) A.entrarComo(dono, dono === A.euId() ? 'dono' : (A.modo === 'nuvem' && A.nuvem.admin ? 'convidado' : 'leitura'));
        fechar();
      }
    };
    painel.onkeydown = e => { if (e.key === 'Escape') { fechar(); btn.focus(); } };
  };
  document.addEventListener('click', e => {
    const p = document.getElementById('avisosPainel');
    if (p && !p.hidden && !e.target.closest('.avisos')) { p.hidden = true; const b = document.getElementById('avisosBtn'); if (b) b.setAttribute('aria-expanded', 'false'); }
  });
  function atualizarContagem() {
    const btn = document.getElementById('avisosBtn'); if (!btn) return;
    const n = A.avisosLista().filter(a => !a.visto).length;
    let b = btn.querySelector('.avisos-n');
    if (!n) { if (b) b.remove(); }
    else { if (!b) { b = document.createElement('span'); b.className = 'avisos-n'; b.setAttribute('aria-hidden', 'true'); btn.appendChild(b); } b.textContent = n > 99 ? '99+' : n; }
    btn.setAttribute('aria-label', `Avisos${n ? `: ${n} novo${n > 1 ? 's' : ''}` : ''}`);
  }
})(window.App);
