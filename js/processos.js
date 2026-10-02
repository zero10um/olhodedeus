/* Lista de processos e criação de um processo à mão. */
(function (A) {
  let filtro = 'ativos', busca = '', ordem = 'situacao';

  A.telaProcessos = (vista, novo) => {
    const pode = A.podeEditar(), regras = A.regras();
    const todos = A.meus();
    const lista = todos.filter(p => filtro === 'todos' || (filtro === 'arquivados' ? p.arquivado : !p.arquivado))
      .filter(p => !busca || A.semAcento(`${p.titulo} ${p.sei} ${p.tipoNome} ${p.unidade}`).includes(busca))
      .sort((a, b) => ordem === 'situacao' ? (A.PESO[A.situacao(b)] - A.PESO[A.situacao(a)] || ((A.dataRef(a) || '9') < (A.dataRef(b) || '9') ? -1 : 1))
        : ordem === 'data' ? ((A.dataRef(a) || '9') < (A.dataRef(b) || '9') ? -1 : 1) : a.titulo.localeCompare(b.titulo, 'pt-BR'));
    const nArq = todos.filter(p => p.arquivado).length;
    vista.innerHTML = `<main>
      <div class="cabeca"><div><h1>Processos</h1><p class="secundario" style="margin-top:6px">${todos.length - nArq} em andamento${nArq ? `, ${nArq} arquivado${nArq > 1 ? 's' : ''}` : ''}.</p></div>
        ${pode ? `<div class="cabeca-acoes"><div class="botoes"><a class="btn" href="#/planilha">${A.ic('atualizar')} Ler planilha</a><button class="btn btn-primario" type="button" id="btnNovo" aria-expanded="${!!novo}" aria-controls="formNovo">${A.ic('mais')} Novo processo</button></div></div>` : ''}</div>
      <div id="formNovo"></div>
      <div class="bloco" style="margin-top:24px">
        <div class="bloco-topo" style="margin-bottom:12px">
          <div class="segmento" role="radiogroup" aria-label="Quais processos">
            ${[['ativos', 'Em andamento'], ['arquivados', 'Arquivados'], ['todos', 'Todos']].map(([v, n]) => `<label><input type="radio" name="filtro" value="${v}" ${filtro === v ? 'checked' : ''}><span>${n}</span></label>`).join('')}
          </div>
          <div class="acoes">
            <div class="busca" style="margin:0"><svg class="ic" aria-hidden="true"><use href="#i-busca"/></svg><label class="sr" for="buscaLista">Buscar processo</label><input id="buscaLista" type="search" placeholder="Buscar nome, SEI ou tipo" value="${A.esc(busca)}"></div>
            <label class="secundario" style="display:inline-flex;gap:6px;align-items:center">Ordenar por <select id="ordem" class="cel" style="width:auto;border-color:var(--linha)"><option value="situacao" ${ordem === 'situacao' ? 'selected' : ''}>situação</option><option value="data" ${ordem === 'data' ? 'selected' : ''}>data</option><option value="nome" ${ordem === 'nome' ? 'selected' : ''}>nome</option></select></label>
          </div>
        </div>
        ${lista.length ? `<div class="tabela-rolagem"><table class="tabela" style="min-width:820px">
          <thead><tr><th scope="col">Situação</th><th scope="col">Processo</th><th scope="col">Tipo</th><th scope="col">Data</th><th scope="col">Andamento</th><th scope="col">Planilha</th></tr></thead>
          <tbody>${lista.map(p => {
            const s = A.situacao(p), it = A.itensAtivos(p), feitas = it.filter(x => x.i.estado === 'feita').length, m = A.mudancas(p).length, ref = A.dataRef(p);
            return `<tr class="clicavel" data-ir="${p.id}">
              <td style="width:130px">${p.arquivado ? `<span class="selo" style="--c:var(--neutro);--cbg:var(--neutro-bg)">Arquivado</span>` : A.seloSit(s)}</td>
              <td><a class="link-proc" href="#/processo/${p.id}" style="font-weight:700">${A.esc(p.titulo)}</a><div class="secundario">${p.sei ? 'SEI ' + A.esc(A.seiCurto(p.sei)) : 'sem SEI'}${p.unidade ? ' · ' + A.esc(p.unidade) : ''}</div></td>
              <td>${A.esc(p.tipoNome || '')}</td>
              <td style="white-space:nowrap">${ref ? `${A.fmt(ref)} <span class="secundario">(${p.inicio ? 'evento' : 'limite'})</span>` : '<span class="secundario">sem data</span>'}</td>
              <td style="width:170px"><div class="progresso"><div class="barra" aria-hidden="true"><i style="width:${it.length ? Math.round(feitas / it.length * 100) : 0}%"></i></div><span>${feitas}/${it.length}</span></div></td>
              <td>${m ? `<span class="selo" style="--c:var(--ok);--cbg:var(--ok-bg)">${m} para atualizar</span>` : '<span class="secundario">em dia</span>'}</td></tr>`;
          }).join('')}</tbody></table></div>`
          : `<p class="vazio">${todos.length ? 'Nenhum processo com esse filtro.' : 'Ainda não há processos. Leia a planilha ou crie um processo novo.'}</p>`}
      </div>
    </main>`;
    vista.querySelectorAll('[name=filtro]').forEach(r => r.onchange = () => { filtro = r.value; A.mudar(A.redesenhar); });
    const bl = vista.querySelector('#buscaLista');
    bl.oninput = () => { busca = A.semAcento(bl.value); A.comFoco(A.redesenhar); const n = document.getElementById('buscaLista'); if (n) { n.setSelectionRange(n.value.length, n.value.length); } };
    vista.querySelector('#ordem').onchange = e => { ordem = e.target.value; A.mudar(A.redesenhar); };
    vista.querySelectorAll('tr[data-ir]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a')) location.hash = '#/processo/' + tr.dataset.ir; });
    const bn = vista.querySelector('#btnNovo');
    if (bn) bn.onclick = () => { location.hash = novo ? '#/processos' : '#/processos/novo'; };
    if (novo && pode) formNovo(vista, regras);
  };

  function formNovo(vista, regras) {
    const el = vista.querySelector('#formNovo');
    el.innerHTML = `<form class="cartao-form" id="fNovo" novalidate aria-labelledby="t-novo">
      <h2 id="t-novo">Novo processo</h2>
      <p class="secundario" style="margin-bottom:16px">Os passos vêm das Regras de prazo do tipo escolhido. Dá para mudar tudo depois.</p>
      <div class="grade-campos">
        <div class="campo largo"><label for="nTitulo">Nome do curso ou evento</label><input id="nTitulo"><div class="erro" hidden></div></div>
        <div class="campo"><label for="nTipo">Tipo</label><select id="nTipo">${regras.tipos.map(t => `<option value="${t.id}">${A.esc(t.nome)}</option>`).join('')}</select></div>
        <div class="campo"><label for="nSei">Número do processo SEI</label><input id="nSei" placeholder="19.25.000000000.0000000/2026-00" aria-describedby="nSeiVai"><div class="erro" hidden></div><p class="secundario" id="nSeiVai" style="font-size:var(--t-xs);margin-top:4px">Cole o número inteiro. ${A.lgpd() ? 'O sistema guarda só os últimos 11 dígitos.' : ''}</p></div>
        <div class="campo largo"><label for="nUnidade">Quem pediu (unidade)</label><input id="nUnidade"></div>
        <div class="campo"><label for="nEntrada">Chegou ao setor em</label><input id="nEntrada" type="date" value="${A.hojeIso()}"></div>
        <div class="campo" data-so="evento"><label for="nInicio">Início do evento</label><input id="nInicio" type="date"><div class="erro" hidden></div></div>
        <div class="campo" data-so="evento"><label for="nFim">Fim do evento</label><input id="nFim" type="date"><div class="erro" hidden></div></div>
        <div class="campo" data-so="limite"><label for="nLimite">Data limite</label><input id="nLimite" type="date"></div>
        <div class="campo" data-so="evento"><label for="nHorario">Horário</label><input id="nHorario" placeholder="08:00 às 12:00"></div>
        <div class="campo" data-so="evento"><label for="nModal">Modalidade</label><select id="nModal"><option value="">—</option><option>Presencial</option><option>Online</option><option>Híbrido</option></select></div>
        <div class="campo largo" data-so="evento"><label for="nLocal">Local</label><input id="nLocal"></div>
        <div class="campo largo"><label for="nApoio">Apoio <small>(nome; aparece só com as iniciais)</small></label><input id="nApoio"></div>
      </div>
      <div class="form-botoes"><a class="btn btn-grande" href="#/processos">Cancelar</a><button class="btn btn-primario btn-grande" type="submit">Criar processo</button></div>
    </form>`;
    const f = el.querySelector('#fNovo');
    const mostrar = () => { const t = regras.tipos.find(x => x.id === f.querySelector('#nTipo').value); f.querySelectorAll('[data-so]').forEach(c => c.hidden = c.dataset.so !== (t.ref === 'evento' ? 'evento' : 'limite')); };
    f.querySelector('#nTipo').onchange = mostrar; mostrar();
    const vai = f.querySelector('#nSeiVai');
    f.querySelector('#nSei').addEventListener('input', e => {
      const v = e.target.value.trim(), d = v.replace(/\D/g, '');
      vai.textContent = !v ? 'Cole o número inteiro.' + (A.lgpd() ? ' O sistema guarda só os últimos 11 dígitos.' : '')
        : A.lgpd() && d.length >= 11 ? `Vai ficar guardado assim: ${A.seiGuardar(v)}` : A.lgpd() ? `Faltam dígitos: o número SEI tem pelo menos 11 (tem ${d.length}).` : '';
    });
    f.querySelector('#nTitulo').focus();
    f.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { i.removeAttribute('aria-invalid'); const m = i.parentElement.querySelector('.erro'); if (m) m.hidden = true; }));
    f.onsubmit = e => {
      e.preventDefault();
      const v = id => f.querySelector('#' + id).value.trim();
      const erro = (id, t) => { const c = f.querySelector('#' + id), m = c.parentElement.querySelector('.erro'); c.setAttribute('aria-invalid', 'true'); m.textContent = t; m.hidden = false; c.focus(); };
      if (!v('nTitulo')) return erro('nTitulo', 'Escreva o nome do curso ou evento.');
      const sei = A.seiNormal(v('nSei'));
      const igual = sei && A.seiChave(sei).length >= 11 && (A.semPlanilha() ? A.estado.processos : A.meus()).find(p => A.seiChave(p.sei) === A.seiChave(sei));
      if (igual) return erro('nSei', igual.dono === A.sessao.perfilId ? 'Você já cadastrou um processo com este número SEI.' : `Este SEI já foi cadastrado por ${(A.perfil(igual.dono) || {}).ini || 'outra pessoa'}.`);
      const tipo = regras.tipos.find(x => x.id === v('nTipo')), ev = tipo.ref === 'evento';
      if (ev && v('nFim') && !v('nInicio')) return erro('nInicio', 'Escolha também a data de início.');
      if (ev && v('nFim') && v('nFim') < v('nInicio')) return erro('nFim', 'O fim não pode ser antes do início.');
      const p = A.novoProcesso({ titulo: v('nTitulo'), tipoId: tipo.id, sei, unidade: v('nUnidade'), entrada: v('nEntrada') || A.hojeIso(),
        inicio: ev ? v('nInicio') : '', fim: ev ? (v('nFim') || v('nInicio')) : '', limite: ev ? '' : v('nLimite'), horario: ev ? v('nHorario') : '',
        modalidade: ev ? v('nModal') : '', local: ev ? v('nLocal') : '', apoio: v('nApoio') }, A.sessao.perfilId);
      p.naPlanilha = {};
      A.estado.processos.push(p);
      A.salvarJa();
      location.hash = '#/processo/' + p.id;
      A.avisar(`Processo criado com ${p.frentes.reduce((n, x) => n + x.itens.length, 0)} passos. Lembre de incluir na planilha do OneDrive também.`);
    };
  }
})(window.App);
