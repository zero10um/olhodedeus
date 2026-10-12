/* Lista de processos e criação de um processo à mão. */
(function (A) {
  let filtro = 'ativos', busca = '', ordem = 'situacao';
  const abrindo = new Set(); // etiquetas abertas nos cartões ("processo|marco")

  /* ---------- Visões por tipo: cartões de evento interno e trilha de evento externo ---------- */
  const ABAS = [['interno', 'Eventos internos'], ['externo', 'Eventos externos'], ['outro', 'Outros'], ['todos', 'Lista completa']];
  const grupoDe = p => A.grupoDoTipo(p) || 'outro';
  const hoje = () => A.hojeIso();
  // Preparação de evento interno: cada etiqueta junta os passos que falam daquela coisa
  const PREPARO = [
    ['Sala', /\bsala\b|audit[oó]rio/], ['Apoio técnico', /apoio t[eé]cnico/], ['Coffee break', /coffee|lanche/],
    ['Comunicação', /briefing|\bartes?\b|divulga/], ['Inscrições', /inscri[cç]/], ['Deslocamento', /desloca|passage|di[aá]ria|portaria/],
    ['Contratação', /\bdfd\b|empenho|contrat|setor financeiro|proposta/], ['Frequência', /frequ[eê]ncia|lista de presen/], ['Certificados', /certificad/],
  ];
  // Trilha de evento externo
  const TRILHA = [
    ['Pedido', /receber o pedido|pedido/], ['PGJ', /^(?!.*portaria).*pgj/], ['Portaria', /portaria/], ['Financeiro', /financeiro|passage|di[aá]ria/],
    ['DOF', /\bdof\b/], ['Certificado', /certificad/],
  ];
  const ROT = { feito: 'feito', esperando: 'esperando resposta', atrasado: 'atrasado', afazer: 'a fazer' };
  function estadoDe(proc, itens) {
    if (!itens.length) return null;
    if (itens.every(i => i.estado === 'feita')) return 'feito';
    if (itens.some(i => i.estado === 'aberta' && A.prazo(proc, i) && A.dias(A.prazo(proc, i)) < 0 && proc.ambito !== 'externo')) return 'atrasado';
    if (itens.some(i => i.estado === 'esperando')) return 'esperando';
    return 'afazer';
  }
  function agrupar(proc, regras, ja) {
    const itens = proc.frentes.filter(f => !f.na).flatMap(f => f.itens.filter(i => !i.na).map(i => ({ f, i })));
    return regras.map(([nome, re]) => {
      const m = itens.filter(x => !ja.has(x.i.id) && re.test(A.semAcento(x.i.nome).toLowerCase()));
      m.forEach(x => ja.add(x.i.id));
      return { nome, itens: m.map(x => x.i), est: estadoDe(proc, m.map(x => x.i)) };
    }).filter(g => g.est);
  }
  function proximo(proc) {
    const ab = A.itensAtivos(proc).filter(x => x.i.estado === 'aberta' && x.i.quem !== 'acompanha')
      .map(x => ({ ...x, d: A.prazo(proc, x.i) })).sort((a, b) => (a.d || '9') < (b.d || '9') ? -1 : 1);
    return ab[0] || null;
  }
  function esperas(proc) {
    return (proc.despachos || []).filter(d => !d.resposta).map(d => `${A.esc(d.setor || 'resposta')} há ${Math.max(0, A.entre(d.enviado || hoje(), hoje()))} dia${A.entre(d.enviado || hoje(), hoje()) === 1 ? '' : 's'}`);
  }
  const ic = e => ({ feito: A.ic('feito', 'ic-sm'), esperando: A.ic('relogio', 'ic-sm'), atrasado: A.ic('alerta', 'ic-sm'), afazer: '' }[e]);
  function quandoTxt(p) {
    const ref = A.dataRef(p); if (!ref) return 'sem data';
    const n = A.dias(ref), fim = p.fim && p.fim !== p.inicio ? A.dias(p.fim) : n;
    if (n > 1) return `em ${n} dias`; if (n === 1) return 'amanhã'; if (n === 0) return 'hoje';
    if (fim >= 0) return 'acontecendo agora';
    return `há ${-fim} dia${fim === -1 ? '' : 's'}`;
  }
  function blocoData(p) {
    const ref = A.dataRef(p);
    if (!ref) return `<div class="pc-data sem" aria-hidden="true"><b>—</b><small>sem data</small></div>`;
    const d = A.d(ref);
    return `<div class="pc-data" aria-hidden="true"><b>${String(d.getDate()).padStart(2, '0')}</b><small>${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></div>`;
  }
  // Grupos de tempo para os cartões
  function porTempo(lista) {
    const g = [['Nos próximos 30 dias', []], ['Mais adiante', []], ['Sem data', []], ['Já aconteceram: pós-evento', []]];
    lista.forEach(p => {
      const ref = A.dataRef(p), fim = p.fim || ref;
      if (!ref) g[2][1].push(p); else if (A.dias(fim) < 0) g[3][1].push(p); else if (A.dias(ref) <= 30) g[0][1].push(p); else g[1][1].push(p);
    });
    g.forEach(([, l]) => l.sort((a, b) => (A.dataRef(a) || '9') < (A.dataRef(b) || '9') ? -1 : 1));
    g[3][1].reverse();
    return g.filter(([, l]) => l.length);
  }
  function cartaoInterno(p, pode) {
    const grupos = agrupar(p, PREPARO, new Set()), prox = proximo(p), esp = esperas(p);
    const it = A.itensAtivos(p), feitas = it.filter(x => x.i.estado === 'feita').length;
    return `<article class="pc-cartao" aria-labelledby="pc-t-${p.id}">
      <header class="pc-topo">${blocoData(p)}
        <div class="pc-titulo"><h3 id="pc-t-${p.id}"><a href="#/processo/${p.id}">${A.esc(p.titulo)}</a></h3>
          <p class="secundario">${[quandoTxt(p), p.horario, p.local, p.sei ? 'SEI ' + A.seiCurto(p.sei) : ''].filter(Boolean).map(A.esc).join(' · ')}</p></div>
        ${p.arquivado ? '<span class="selo" style="--c:var(--neutro);--cbg:var(--neutro-bg)">Arquivado</span>' : A.seloSit(A.situacao(p))}
      </header>
      ${prox ? `<p class="pc-prox"><span>Próximo passo</span> ${A.esc(prox.i.nome)}${prox.d ? ` <em class="${A.dias(prox.d) < 0 ? 'atrasou' : ''}">até ${A.fmt(prox.d)}</em>` : ''}</p>` : (it.length && feitas === it.length ? '<p class="pc-prox feito"><span>Tudo feito</span> Pode arquivar.</p>' : '')}
      ${grupos.length ? `<div class="pc-etiquetas" role="list" aria-label="Preparação">${grupos.map(g => {
        const k = p.id + '|' + g.nome, aberto = abrindo.has(k);
        return `<span role="listitem"><button type="button" class="pc-et ${g.est}" data-et="${A.esc(k)}" aria-expanded="${aberto}" title="${A.esc(g.nome)}: ${ROT[g.est]}">${ic(g.est)}${A.esc(g.nome)}<span class="sr">: ${ROT[g.est]}</span>${g.itens.length > 1 ? ` <small>${g.itens.filter(i => i.estado === 'feita').length}/${g.itens.length}</small>` : ''}</button></span>`;
      }).join('')}</div>` : ''}
      ${grupos.filter(g => abrindo.has(p.id + '|' + g.nome)).map(g => `<div class="pc-itens"><p class="pc-itens-t">${A.esc(g.nome)}</p><ul>${g.itens.map(i => {
        const d = A.prazo(p, i);
        return `<li class="${i.estado}"><label><input type="checkbox" data-marca="${p.id}|${i.id}" ${i.estado === 'feita' ? 'checked' : ''} ${pode && i.quem !== 'acompanha' ? '' : 'disabled'}><span>${A.esc(i.nome)}</span></label><small>${i.estado === 'esperando' ? 'esperando resposta' : i.estado === 'feita' ? 'feito' + (i.feitoEm ? ' em ' + A.fmt(i.feitoEm) : '') : d ? 'até ' + A.fmt(d) : ''}${i.quem === 'acompanha' ? ' · acompanhar' : ''}</small></li>`;
      }).join('')}</ul></div>`).join('')}
      <footer class="pc-pe">
        <div class="progresso"><div class="barra" aria-hidden="true"><i style="width:${it.length ? Math.round(feitas / it.length * 100) : 0}%"></i></div><span>${feitas}/${it.length} passos</span></div>
        ${esp.length ? `<span class="pc-espera">${A.ic('relogio', 'ic-sm')} Esperando ${esp.join(', ')}</span>` : ''}
      </footer>
    </article>`;
  }
  function cartaoExterno(p) {
    const etapas = agrupar(p, TRILHA, new Set()), esp = esperas(p);
    return `<article class="pc-cartao pc-ext" aria-labelledby="pc-t-${p.id}">
      <header class="pc-topo">${blocoData(p)}
        <div class="pc-titulo"><h3 id="pc-t-${p.id}"><a href="#/processo/${p.id}">${A.esc(p.titulo)}</a></h3>
          <p class="secundario">${[quandoTxt(p), p.unidade ? 'pedido de ' + p.unidade : '', p.publico ? 'para ' + (A.PUBLICOS[p.publico] || p.publico).toLowerCase() : '', p.sei ? 'SEI ' + A.seiCurto(p.sei) : ''].filter(Boolean).map(A.esc).join(' · ')}</p></div>
        ${p.arquivado ? '<span class="selo" style="--c:var(--neutro);--cbg:var(--neutro-bg)">Arquivado</span>' : ''}
      </header>
      ${etapas.length ? `<ol class="pc-trilha" aria-label="Andamento">${etapas.map(e => `<li class="${e.est}" title="${A.esc(e.itens.map(i => i.nome).join(' / '))}">${ic(e.est) || '<i aria-hidden="true"></i>'}<span>${A.esc(e.nome)}<span class="sr">: ${ROT[e.est]}</span></span></li>`).join('')}</ol>` : ''}
      ${esp.length ? `<p class="pc-espera">${A.ic('relogio', 'ic-sm')} Esperando ${esp.join(', ')}</p>` : ''}
    </article>`;
  }
  function visaoCartoes(lista, tipo, pode) {
    if (!lista.length) return `<p class="vazio">${tipo === 'interno' ? 'Nenhum evento interno com esse filtro.' : 'Nenhum evento externo com esse filtro.'}</p>`;
    return porTempo(lista).map(([t, l]) => `<section class="pc-grupo" aria-label="${t}"><h2 class="pc-grupo-t">${t} <span class="secundario">(${l.length})</span></h2>
      <div class="pc-grade">${l.map(p => tipo === 'interno' ? cartaoInterno(p, pode) : cartaoExterno(p)).join('')}</div></section>`).join('');
  }

  A.telaProcessos = (vista, novo) => {
    const pode = A.podeEditar(), regras = A.regras();
    const todos = A.meus();
    const lista = todos.filter(p => filtro === 'todos' || (filtro === 'arquivados' ? p.arquivado : !p.arquivado))
      .filter(p => !busca || A.semAcento(`${p.titulo} ${p.sei} ${p.tipoNome} ${p.unidade}`).includes(busca))
      .sort((a, b) => ordem === 'situacao' ? (A.PESO[A.situacao(b)] - A.PESO[A.situacao(a)] || ((A.dataRef(a) || '9') < (A.dataRef(b) || '9') ? -1 : 1))
        : ordem === 'data' ? ((A.dataRef(a) || '9') < (A.dataRef(b) || '9') ? -1 : 1) : a.titulo.localeCompare(b.titulo, 'pt-BR'));
    const nArq = todos.filter(p => p.arquivado).length;
    const prefs = A.prefs(), conta = g => lista.filter(p => grupoDe(p) === g).length;
    let aba = prefs.abaProcessos || (conta('interno') || !conta('externo') ? 'interno' : 'externo');
    const daAba = aba === 'todos' ? lista : lista.filter(p => grupoDe(p) === aba);
    vista.innerHTML = `<main>
      <div class="cabeca"><div><h1>Processos</h1><p class="secundario" style="margin-top:6px">${todos.length - nArq} em andamento${nArq ? `, ${nArq} arquivado${nArq > 1 ? 's' : ''}` : ''}.</p></div>
        ${pode ? `<div class="cabeca-acoes"><div class="botoes">${A.semPlanilha() ? '' : `<a class="btn" href="#/planilha">${A.ic('atualizar')} Ler planilha</a>`}<button class="btn btn-primario" type="button" id="btnNovo" aria-expanded="${!!novo}" aria-controls="formNovo">${A.ic('mais')} Novo processo</button></div></div>` : ''}</div>
      <div id="formNovo"></div>
      <div class="pc-abas" role="tablist" aria-label="Tipo de processo">
        ${ABAS.map(([v, n]) => `<button type="button" role="tab" class="pc-aba" data-aba="${v}" aria-selected="${aba === v}" tabindex="${aba === v ? 0 : -1}">${n} <span class="pc-conta">${v === 'todos' ? lista.length : conta(v)}</span></button>`).join('')}
      </div>
      <div class="bloco" style="margin-top:16px">
        <div class="bloco-topo" style="margin-bottom:12px">
          <div class="segmento" role="radiogroup" aria-label="Quais processos">
            ${[['ativos', 'Em andamento'], ['arquivados', 'Arquivados'], ['todos', 'Todos']].map(([v, n]) => `<label><input type="radio" name="filtro" value="${v}" ${filtro === v ? 'checked' : ''}><span>${n}</span></label>`).join('')}
          </div>
          <div class="acoes">
            <div class="busca" style="margin:0"><svg class="ic" aria-hidden="true"><use href="#i-busca"/></svg><label class="sr" for="buscaLista">Buscar processo</label><input id="buscaLista" type="search" placeholder="Buscar nome, SEI ou tipo" value="${A.esc(busca)}"></div>
            <label class="secundario" style="display:inline-flex;gap:6px;align-items:center">Ordenar por <select id="ordem" class="cel" style="width:auto;border-color:var(--linha)"><option value="situacao" ${ordem === 'situacao' ? 'selected' : ''}>situação</option><option value="data" ${ordem === 'data' ? 'selected' : ''}>data</option><option value="nome" ${ordem === 'nome' ? 'selected' : ''}>nome</option></select></label>
          </div>
        </div>
        ${aba === 'interno' || aba === 'externo' ? visaoCartoes(daAba, aba, pode) : daAba.length ? `<div class="tabela-rolagem"><table class="tabela" style="min-width:820px">
          <thead><tr><th scope="col">Situação</th><th scope="col">Processo</th><th scope="col">Tipo</th><th scope="col">Data</th><th scope="col">Andamento</th><th scope="col">${A.semPlanilha() ? 'Classificação' : 'Planilha'}</th>${pode ? '<th scope="col"><span class="sr">Apagar</span></th>' : ''}</tr></thead>
          <tbody>${daAba.map(p => {
            const s = A.situacao(p), it = A.itensAtivos(p), feitas = it.filter(x => x.i.estado === 'feita').length, m = A.mudancas(p).length, ref = A.dataRef(p);
            return `<tr class="clicavel" data-ir="${p.id}">
              <td style="width:130px">${p.arquivado ? `<span class="selo" style="--c:var(--neutro);--cbg:var(--neutro-bg)">Arquivado</span>` : A.seloSit(s)}</td>
              <td><a class="link-proc" href="#/processo/${p.id}" style="font-weight:700">${A.esc(p.titulo)}</a><div class="secundario">${p.sei ? 'SEI ' + A.esc(A.seiCurto(p.sei)) : 'sem SEI'}${p.unidade ? ' · ' + A.esc(p.unidade) : ''}</div></td>
              <td>${A.esc(p.tipoNome || '')}</td>
              <td style="white-space:nowrap">${ref ? `${A.fmt(ref)} <span class="secundario">(${p.inicio ? 'evento' : 'limite'})</span>` : '<span class="secundario">sem data</span>'}</td>
              <td style="width:170px"><div class="progresso"><div class="barra" aria-hidden="true"><i style="width:${it.length ? Math.round(feitas / it.length * 100) : 0}%"></i></div><span>${feitas}/${it.length}</span></div></td>
              <td>${A.semPlanilha() ? (A.classeTexto(p) ? A.esc(A.classeTexto(p)) : '<span class="selo" style="--c:var(--atencao);--cbg:var(--atencao-bg)">Classificar</span>') : m ? `<span class="selo" style="--c:var(--ok);--cbg:var(--ok-bg)">${m} para atualizar</span>` : '<span class="secundario">em dia</span>'}</td>${pode ? `<td style="width:44px"><button type="button" class="btn-icone btn-apagar" data-apagar="${p.id}" aria-label="Apagar ${A.esc(p.titulo)}" title="Apagar processo">${A.ic('lixo')}</button></td>` : ''}</tr>`;
          }).join('')}</tbody></table></div>`
          : `<p class="vazio">${todos.length ? (aba === 'outro' ? 'Nenhum processo de outro tipo com esse filtro.' : 'Nenhum processo com esse filtro.') : (A.semPlanilha() ? 'Ainda não há processos. Crie o primeiro em "Novo processo".' : 'Ainda não há processos. Leia a planilha ou crie um processo novo.')}</p>`}
      </div>
    </main>`;
    const abas = [...vista.querySelectorAll('[data-aba]')];
    abas.forEach((b, k) => {
      b.onclick = () => { prefs.abaProcessos = b.dataset.aba; A.salvar(); A.mudar(A.redesenhar); };
      b.onkeydown = e => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
        e.preventDefault(); const n = abas[(k + d + abas.length) % abas.length]; n.focus(); n.click();
      };
    });
    vista.querySelectorAll('[data-et]').forEach(b => b.onclick = () => {
      const k = b.dataset.et; abrindo.has(k) ? abrindo.delete(k) : abrindo.add(k);
      A.comFoco(A.redesenhar);
    });
    vista.querySelectorAll('[data-marca]').forEach(cb => cb.onchange = () => {
      const [pid, iid] = cb.dataset.marca.split('|'), proc = A.proc(pid), achado = proc && A.acharItem(proc, iid);
      if (!achado) return;
      const i = achado.i, feita = cb.checked, antes = [i.estado, i.feitoEm];
      if (feita && i.depAut && A.semAutorizacao(proc) && !confirm(`Ainda não há autorização da PGJ registrada neste processo.\n\nMarcar "${i.nome}" como feito mesmo assim?`)) { cb.checked = false; return; }
      i.estado = feita ? 'feita' : 'aberta'; i.feitoEm = feita ? A.hojeIso() : null;
      A.anotar(proc, 'Passo', `${feita ? 'Feito' : 'Desmarcado'}: ${i.nome}.`);
      proc.atualizadoEm = new Date().toISOString();
      A.salvar(); A.comFoco(A.redesenhar);
      A.avisar(feita ? `"${i.nome}" feito.` : `"${i.nome}" voltou a ficar aberto.`, () => { [i.estado, i.feitoEm] = antes; proc.diario.pop(); A.salvar(); A.redesenhar(); });
    });
    vista.querySelectorAll('[name=filtro]').forEach(r => r.onchange = () => { filtro = r.value; A.mudar(A.redesenhar); });
    const bl = vista.querySelector('#buscaLista');
    bl.oninput = () => { busca = A.semAcento(bl.value); A.comFoco(A.redesenhar); const n = document.getElementById('buscaLista'); if (n) { n.setSelectionRange(n.value.length, n.value.length); } };
    vista.querySelector('#ordem').onchange = e => { ordem = e.target.value; A.mudar(A.redesenhar); };
    vista.querySelectorAll('tr[data-ir]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a, button')) location.hash = '#/processo/' + tr.dataset.ir; });
    vista.querySelectorAll('[data-apagar]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const p = A.proc(b.dataset.apagar);
      if (!p || !A.confirmarApagar(p)) return;
      const desfaz = A.apagarProcesso(p);
      A.redesenhar();
      A.avisar(`"${p.titulo}" apagado.`, () => { desfaz(); A.redesenhar(); });
    });
    const bn = vista.querySelector('#btnNovo');
    if (bn) bn.onclick = () => { location.hash = novo ? '#/processos' : '#/processos/novo'; };
    if (novo && pode) formNovo(vista, regras);
  };

  function formNovo(vista, regras) {
    const el = vista.querySelector('#formNovo');
    el.innerHTML = `<form class="cartao-form" id="fNovo" novalidate aria-labelledby="t-novo">
      <h2 id="t-novo">Novo processo</h2>
      <p class="secundario" style="margin-bottom:16px">Só o essencial agora. Os passos vêm das Regras de prazo do tipo escolhido, e dá para mudar tudo depois.</p>
      <fieldset class="classifica" id="nQue">
        <legend>O que é este processo?</legend>
        <div class="tipo-cartoes">
          ${[['interno', 'A EMPRO organiza'], ['externo', 'A EMPRO não organiza: servidor ou membro vai a evento de fora, ou outra unidade pede o custeio']]
            .filter(([id]) => regras.tipos.some(t => t.id === id)).map(([id, d], k) => `<label class="opcao-ficha"><input type="radio" name="nTipoC" value="${id}" ${k === 0 ? 'checked' : ''}><span><strong>${A.esc(regras.tipos.find(t => t.id === id).nome)}</strong><small>${d}</small></span></label>`).join('')}
        </div>
        <label class="tipo-outro">Outro tipo: <select id="nTipoOutro"><option value="">—</option>${regras.tipos.filter(t => !t.oculto && !['interno', 'externo'].includes(t.id)).map(t => `<option value="${t.id}">${A.esc(t.nome)}</option>`).join('')}</select></label>
        <input type="hidden" id="nTipo" value="">
      </fieldset>
      <fieldset class="classifica" id="nClasse">
        <legend>Classificação</legend>
        <div class="classifica-grupo" role="radiogroup" aria-labelledby="rAmb" id="nAmbGrupo">
          <p class="classifica-rot" id="rAmb">Onde acontece</p>
          ${Object.entries(A.AMBITOS).map(([k, [n, d]]) => `<label class="opcao-ficha"><input type="radio" name="nAmbito" value="${k}"><span><strong>${n}</strong><small>${d}</small></span></label>`).join('')}
        </div>
        <div class="classifica-grupo" role="radiogroup" aria-labelledby="rPub">
          <p class="classifica-rot" id="rPub">Para quem</p>
          ${Object.entries(A.PUBLICOS).map(([k, n]) => `<label class="opcao-ficha"><input type="radio" name="nPublico" value="${k}"><span><strong>${n}</strong></span></label>`).join('')}
        </div>
        <p class="classifica-dica secundario" id="nClasseDica">Interno: a escola emite os certificados. Externo: o servidor apresenta o certificado, e sala, divulgação e contratação ficam como "não se aplica".</p>
        <div class="erro" id="nClasseErro" hidden></div>
      </fieldset>
      <div class="grade-campos">
        <div class="campo largo"><label for="nTitulo">Nome do curso ou evento</label><input id="nTitulo"><div class="erro" hidden></div></div>
        <div class="campo"><label for="nSei">Número do processo SEI</label><input id="nSei" placeholder="19.25.000000000.0000000/2026-00" aria-describedby="nSeiVai"><div class="erro" hidden></div><p class="secundario" id="nSeiVai" style="font-size:var(--t-xs);margin-top:4px">Cole o número inteiro. ${A.lgpd() ? 'O sistema guarda só os últimos 11 dígitos.' : ''}</p></div>
        <div class="campo" data-so="evento"><label for="nInicio">Início do evento <small>(se já souber)</small></label><input id="nInicio" type="date"><div class="erro" hidden></div></div>
        <div class="campo" data-so="limite"><label for="nLimite">Data limite <small>(se houver)</small></label><input id="nLimite" type="date"></div>
      </div>
      <details class="mais-detalhes"><summary>Mais detalhes <small>(opcional: dá para preencher depois)</small></summary>
        <div class="grade-campos">
          <div class="campo largo"><label for="nUnidade">Quem pediu (unidade)</label><input id="nUnidade"></div>
          <div class="campo"><label for="nEntrada">Chegou ao setor em</label><input id="nEntrada" type="date" value="${A.hojeIso()}"></div>
          <div class="campo" data-so="evento"><label for="nFim">Fim do evento</label><input id="nFim" type="date"><div class="erro" hidden></div></div>
          <div class="campo" data-so="evento"><label for="nHorario">Horário</label><input id="nHorario" placeholder="08:00 às 12:00"></div>
          <div class="campo" data-so="evento"><label for="nModal">Modalidade</label><select id="nModal"><option value="">—</option><option>Presencial</option><option>Online</option><option>Híbrido</option></select></div>
          <div class="campo largo" data-so="evento"><label for="nLocal">Local</label><input id="nLocal" list="lista-salas" autocomplete="off"></div>
          <div class="campo largo"><label for="nApoio">Apoio <small>(nome; aparece só com as iniciais)</small></label><input id="nApoio"></div>
        </div>
      </details>
      <div class="form-botoes"><a class="btn btn-grande" href="#/processos">Cancelar</a><button class="btn btn-primario btn-grande" type="submit">Criar processo</button></div>
    </form>`;
    const f = el.querySelector('#fNovo');
    // o tipo escolhido decide o que aparece: externo e capacitação já sabem se são internos ou externos
    const AMB_DO_TIPO = { interno: 'interno', externo: 'externo' };
    const mostrar = () => {
      const outro = f.querySelector('#nTipoOutro').value, card = f.querySelector('[name=nTipoC]:checked');
      const id = outro || (card ? card.value : regras.tipos[0].id), t = regras.tipos.find(x => x.id === id) || regras.tipos[0];
      f.querySelector('#nTipo').value = t.id;
      f.querySelectorAll('[data-so]').forEach(c => c.hidden = c.dataset.so !== (t.ref === 'evento' ? 'evento' : 'limite'));
      const amb = AMB_DO_TIPO[t.id], grupo = f.querySelector('#nAmbGrupo'), soEvento = t.ref === 'evento';
      grupo.hidden = !!amb || !soEvento;
      f.querySelector('#nClasseDica').hidden = !!amb || !soEvento;
      if (amb) { const r = f.querySelector(`[name=nAmbito][value=${amb}]`); if (r) r.checked = true; }
      else if (!soEvento) f.querySelectorAll('[name=nAmbito]').forEach(r => { r.checked = false; });
      f.querySelector('#nTitulo').previousElementSibling.textContent = t.id === 'certificacao' ? 'Nome do curso dos certificados' : soEvento ? 'Nome do curso ou evento' : 'Nome do processo';
    };
    f.querySelectorAll('[name=nTipoC]').forEach(r => r.onchange = () => { f.querySelector('#nTipoOutro').value = ''; mostrar(); });
    f.querySelector('#nTipoOutro').onchange = () => { if (f.querySelector('#nTipoOutro').value) f.querySelectorAll('[name=nTipoC]').forEach(r => { r.checked = false; }); mostrar(); };
    mostrar();
    f.querySelectorAll('[name=nAmbito], [name=nPublico]').forEach(r => r.onchange = () => { f.querySelector('#nClasseErro').hidden = true; });
    const vai = f.querySelector('#nSeiVai');
    f.querySelector('#nSei').addEventListener('input', e => {
      const v = e.target.value.trim(), d = v.replace(/\D/g, '');
      vai.textContent = !v ? 'Cole o número inteiro.' + (A.lgpd() ? ' O sistema guarda só os últimos 11 dígitos.' : '')
        : A.lgpd() && d.length >= 11 ? `Vai ficar guardado assim: ${A.seiGuardar(v)}` : A.lgpd() ? `Faltam dígitos: o número SEI tem pelo menos 11 (tem ${d.length}).` : '';
    });
    f.querySelector('#nTitulo').focus();
    f.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { i.removeAttribute('aria-invalid'); const m = i.parentElement.querySelector('.erro'); if (m) m.hidden = true; }));
    let conflitoAceito = '';
    f.onsubmit = e => {
      e.preventDefault();
      const v = id => f.querySelector('#' + id).value.trim();
      const erro = (id, t) => { const c = f.querySelector('#' + id), m = c.parentElement.querySelector('.erro'); c.setAttribute('aria-invalid', 'true'); m.textContent = t; m.hidden = false; c.focus(); };
      const amb = (f.querySelector('[name=nAmbito]:checked') || {}).value, pub = (f.querySelector('[name=nPublico]:checked') || {}).value;
      const ec = f.querySelector('#nClasseErro');
      const precisaAmb = !f.querySelector('#nAmbGrupo').hidden;
      if ((precisaAmb && !amb) || !pub) { ec.textContent = precisaAmb && !amb ? 'Escolha se o processo é interno ou externo.' : 'Escolha para quem é: membros, membros e servidores, ou servidores.'; ec.hidden = false; f.querySelector('#nClasse').scrollIntoView({ block: 'center' }); (f.querySelector(!amb ? '[name=nAmbito]' : '[name=nPublico]')).focus(); return; }
      ec.hidden = true;
      const ambFinal = f.querySelector('#nAmbGrupo').hidden ? (({ interno: 'interno', externo: 'externo' })[v('nTipo')] || '') : amb;
      if (!v('nTitulo')) return erro('nTitulo', 'Escreva o nome do curso ou evento.');
      const sei = A.seiNormal(v('nSei'));
      const igual = sei && A.seiChave(sei).length >= 11 && (A.semPlanilha() ? A.estado.processos : A.meus()).find(p => A.seiChave(p.sei) === A.seiChave(sei));
      if (igual) return erro('nSei', igual.dono === A.sessao.perfilId ? 'Você já cadastrou um processo com este número SEI.' : `Este SEI já foi cadastrado por ${(A.perfil(igual.dono) || {}).ini || 'outra pessoa'}.`);
      const tipo = regras.tipos.find(x => x.id === v('nTipo')), ev = tipo.ref === 'evento';
      if (ev && v('nFim') && !v('nInicio')) return erro('nInicio', 'Escolha também a data de início.');
      if (ev && v('nFim') && v('nFim') < v('nInicio')) return erro('nFim', 'O fim não pode ser antes do início.');
      // sala já ocupada no mesmo dia e horário: avisa e pede um segundo clique
      if (ev && v('nLocal') && v('nInicio')) {
        const conf = A.conflitosSala({ id: null, local: v('nLocal'), inicio: v('nInicio'), fim: v('nFim') || v('nInicio'), horario: v('nHorario') });
        const chave = conf.map(o => o.id).join(',');
        let caixa = f.querySelector('#nConflito');
        if (conf.length && conflitoAceito !== chave) {
          if (!caixa) { caixa = document.createElement('div'); caixa.id = 'nConflito'; caixa.className = 'aviso-conflito'; caixa.setAttribute('role', 'alert'); f.querySelector('.form-botoes').before(caixa); }
          caixa.innerHTML = `${A.ic('alerta')}<div><strong>Conflito de sala.</strong> ${conf.map(o => A.esc(A.textoConflito(o))).join(' ')}<br>Troque o local ou o horário, ou clique de novo para salvar assim mesmo.</div>`;
          conflitoAceito = chave;
          f.querySelector('[type=submit]').textContent = 'Salvar assim mesmo';
          return;
        }
        if (!conf.length && caixa) caixa.remove();
      }
      const p = A.novoProcesso({ titulo: v('nTitulo'), tipoId: tipo.id, sei, unidade: v('nUnidade'), entrada: v('nEntrada') || A.hojeIso(),
        inicio: ev ? v('nInicio') : '', fim: ev ? (v('nFim') || v('nInicio')) : '', limite: ev ? '' : v('nLimite'), horario: ev ? v('nHorario') : '',
        modalidade: ev ? v('nModal') : '', local: ev ? v('nLocal') : '', apoio: v('nApoio'), ambito: ambFinal, publico: pub }, A.sessao.perfilId);
      p.naPlanilha = {};
      A.estado.processos.push(p);
      A.salvarJa();
      location.hash = '#/processo/' + p.id;
      A.avisar(`Processo criado com ${p.frentes.reduce((n, x) => n + x.itens.length, 0)} passos. Lembre de incluir na planilha do OneDrive também.`);
    };
  }
})(window.App);
