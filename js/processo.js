/* Tela de um processo: fases, frentes, passos, despachos, SEIs relacionados, planilha e diário. */
(function (A) {
  const MODOS = [
    { v: 'frentes', t: 'Fases e frentes', d: 'Cada frente num cartão, com os passos dentro.', ic: 'cartoes' },
    { v: 'cronograma', t: 'Cronograma', d: 'O processo inteiro numa linha do tempo. Arraste um passo para mudar o prazo.', ic: 'v-crono' },
    { v: 'lista', t: 'Lista simples', d: 'Só o checklist, em ordem de prazo. Sem fases nem cartões.', ic: 'lista' },
    { v: 'ficha', t: 'Ficha em tabela', d: 'Tudo numa tabela, como a planilha. Edite direto: salva sozinho.', ic: 'v-tabela' },
  ];
  const ESTADOS = [['aberta', 'A fazer'], ['esperando', 'Esperando resposta'], ['feita', 'Feito']];
  const TIPOS_SEI = ['Apoio das unidades', 'Formulário de deslocamento', 'Deslocamento', 'Portaria', 'DFD', 'TR', 'Contratação', 'Coffee break', 'Comarcas', 'Apoio', 'Pagamento', 'Certificados', 'Outro'];
  const tipoSeiDe = nome => { const n = A.semAcento(nome); return /apoio das unidades|sei de apoio/.test(n) ? 'Apoio das unidades' : /formulario de deslocamento/.test(n) ? 'Formulário de deslocamento' : /coffee/.test(n) ? 'Coffee break' : /comarca/.test(n) ? 'Comarcas' : /dfd/.test(n) ? 'DFD' : /\btr\b/.test(n) ? 'TR' : /contrat/.test(n) ? 'Contratação' : /diaria|passag|desloc/.test(n) ? 'Deslocamento' : /portaria/.test(n) ? 'Portaria' : /certific/.test(n) ? 'Certificados' : /pagam|empenh/.test(n) ? 'Pagamento' : 'Outro'; };
  const SUB_FASE = { inicio: 'Checklist do início: plano, autorizações e encaminhamentos. Nada aqui trava o resto do processo.', prep: 'Depois de aprovado, cada frente anda ao mesmo tempo, com seu próprio despacho.', evento: '', pos: 'Depois do evento: certificados, exonerados e pagamentos.', fim: 'Os últimos lançamentos antes de fechar o processo.' };

  let proc = null, vistaEl = null;
  let abertas = new Set(), formDespacho = null, editandoPasso = null, formSei = false, editandoDados = false, ultimaFicha = null, linhaBrilho = null, procAnterior = null;
  let CRONO = null, faseVista = null;

  const pode = () => A.podeEditar();
  const I = id => A.acharItem(proc, id);
  const F = id => proc.frentes.find(f => f.id === id);
  const prazo = i => A.prazo(proc, i);
  const cor = f => A.ICONES[f.icone] || A.ICONES.lista;
  const fic = f => A.ic('f-' + (A.ICONES[f.icone] ? f.icone : 'lista'));
  const modo = () => A.prefs().modoProc || 'frentes';
  const salvarE = fn => { A.salvar(); return A.mudar(fn || desenhar); };
  function quando(i) {
    if (i.estado === 'feita') return 'feito';
    const p = prazo(i); if (!p) return i.regra && i.regra.semPrazo ? '' : 'sem data';
    if (i.estado === 'esperando') return `prazo ${A.fmt(p)}`;
    const n = A.dias(p);
    if (n < -1) return `atrasada há ${-n} dias`;
    if (n === -1) return 'venceu ontem';
    if (n === 0) return 'vence hoje';
    if (n === 1) return 'vence amanhã';
    return `até ${A.fmt(p)}`;
  }
  const fasesVisiveis = () => A.FASES.filter(fa => fa.id === 'evento' ? !!proc.inicio : proc.frentes.some(f => f.fase === fa.id));
  function faseAtual() {
    // enquanto o checklist do Início tiver item aberto e nada da Preparação andou, a tela abre no Início
    const iniAberto = proc.frentes.some(f => f.fase === 'inicio' && !f.na && f.itens.some(i => !i.na && i.estado !== 'feita'));
    if (iniAberto && !proc.frentes.some(f => f.fase !== 'inicio' && f.itens.some(i => i.estado === 'feita'))) return 'inicio';
    const fs = fasesVisiveis().map(f => f.id);
    if (proc.inicio) {
      if (A.dias(proc.inicio) > 0) return fs.includes('prep') ? 'prep' : 'inicio';
      if (A.dias(proc.fim || proc.inicio) >= 0) return 'evento';
    }
    for (const id of fs) { if (id === 'evento') continue; if (proc.frentes.filter(f => f.fase === id && !f.na).some(f => f.itens.some(i => !i.na && i.estado !== 'feita'))) return id; }
    return fs[fs.length - 1];
  }

  /* ---------- Ações ---------- */
  function marcar(f, i, feita) {
    if (feita && i.depAut && A.semAutorizacao(proc) && !confirm(`Ainda não há autorização da PGJ registrada neste processo.\n\nMarcar "${i.nome}" como feito mesmo assim?`)) { desenharConteudo(); return; }
    if (feita && /^abrir o sei/.test(A.semAcento(i.nome))) {
      const n = prompt(`Qual o número do SEI? (opcional)\n\n${i.nome}`);
      if (n && n.trim()) proc.seis.push({ id: 's' + A.uid(), tipo: tipoSeiDe(i.nome), numero: A.seiGuardar(n.trim()), desc: i.nome, f: f.id });
    }
    const desfaz = A.setEstado(proc, i, feita ? 'feita' : 'aberta');
    if (feita) A.anotar(proc, 'Feito', i.nome + '.');
    salvarE();
    if (feita) A.avisar((i.coluna || f.coluna) && !A.semPlanilha() ? `Feito. Confira a coluna "${i.coluna || f.coluna}" em "Para atualizar na planilha".` : 'Marcado como feito.', () => { desfaz(); proc.diario.pop(); });
  }
  function salvarDespacho(i, setor, texto, enviado) {
    const desfaz = A.setEstado(proc, i, 'esperando', setor);
    const d = A.despachoAberto(proc, i); d.texto = texto; d.enviado = enviado;
    formDespacho = null;
    A.anotar(proc, 'Despacho', `${i.nome}: enviado para ${setor}.${texto ? ' ' + texto : ''}`);
    salvarE();
    A.avisar(`Despacho salvo. Agora esperando ${setor}.`, () => { desfaz(); proc.diario.pop(); });
  }
  function chegouResposta(d) {
    const x = I(d.itemId); if (!x) return;
    const desfaz = A.setEstado(proc, x.i, 'feita');
    A.anotar(proc, 'Resposta', `${d.setor} respondeu: ${x.i.nome}.`);
    salvarE();
    A.avisar(`Resposta registrada. "${x.i.nome}" marcada como feita.`, () => { desfaz(); proc.diario.pop(); });
  }
  function aplicarPrazo(i, novaData) {
    if (novaData === prazo(i)) return;
    const antes = { ...i.regra }, antesEd = i.editado;
    i.regra = A.regraDeData(proc, i, novaData); i.editado = true;
    A.anotar(proc, 'Prazo', `${i.nome}: novo prazo ${A.fmt(prazo(i))}.`);
    salvarE().then(() => vistaEl.querySelector(`[data-marco="${i.id}"]`)?.focus());
    A.avisar(`Novo prazo de "${i.nome}": ${A.fmt(prazo(i))} (${A.regraTexto(i.regra)}).`, () => { i.regra = antes; i.editado = antesEd; proc.diario.pop(); });
  }
  function palpiteSetor(i) {
    const o = A.semAcento(i.nome);
    return /gci|arte|inscri|audit|briefing|sala/.test(o) ? 'GCI' : /passage|portaria|diaria/.test(o) ? 'Setor de viagens' : /empenho|orcament|pagamento|reembolso/.test(o) ? 'Setor financeiro' : '';
  }

  /* ---------- Componentes ---------- */
  function linhaTarefa(f, i) {
    const bloqueada = !pode() || A.travada(proc, f);
    const p = prazo(i), n = p ? A.dias(p) : null;
    const cls = i.estado !== 'aberta' || n === null ? '' : n < 0 ? 'atrasado' : n === 0 ? 'hoje' : '';
    const desp = A.despachoAberto(proc, i);
    const marco = i.quem === 'acompanha';
    const tags = `${marco ? `<span class="tag tag-marco">acompanhar${i.setor ? ' · ' + A.esc(i.setor) : ''}</span>` : ''}${i.obrig ? '<span class="tag tag-obrig">obrigatório</span>' : ''}`;
    return `<li class="tarefa${i.estado === 'feita' ? ' feita' : ''}${marco ? ' tarefa-marco' : ''}" data-i="${i.id}" style="view-transition-name:t-${i.id}">
      <input type="checkbox" id="cb-${i.id}" ${i.estado === 'feita' ? 'checked' : ''} ${bloqueada ? 'disabled' : ''} ${marco ? `aria-label="${A.esc(i.nome)}: já aconteceu?"` : ''}>
      <label class="o-que" for="cb-${i.id}">${A.esc(i.nome)}${tags ? ` <span class="tags">${tags}</span>` : ''}</label>
      <span class="prazo ${cls}" title="${A.esc(A.regraTexto(i.regra))}">${marco && i.estado !== 'feita' ? (p ? 'previsto até ' + A.fmt(p) : 'sem data') : quando(i)}</span>
      ${bloqueada ? '' : `<div class="linha2">${i.estado === 'aberta' && !marco ? `<button type="button" class="btn-texto" data-despachar="${i.id}">${A.ic('enviar', 'ic-sm')}Despachei</button>` : ''}<button type="button" class="btn-texto" data-editar-passo="${i.id}" aria-expanded="${editandoPasso === i.id}">${A.ic('lapis', 'ic-sm')}Editar</button>${(i.coluna || f.coluna) && i.estado === 'aberta' && !A.semPlanilha() ? `<span>Vai para a coluna "${i.coluna || f.coluna}"</span>` : ''}</div>`}
      ${desp ? `<div class="esperando-linha"><span>${A.ic('relogio', 'ic-sm')} Esperando <strong>${A.esc(desp.setor)}</strong> desde ${A.fmt(desp.enviado)} (${A.haDias(-A.dias(desp.enviado))})</span>${desp.texto ? `<span>${A.esc(desp.texto)}</span>` : ''}${pode() ? `<button type="button" class="btn-texto" data-resposta="${desp.id}">${A.ic('check', 'ic-sm')}Chegou resposta</button>` : ''}</div>` : ''}
      ${formDespacho === i.id ? formDespachoHTML(i) : ''}
      ${editandoPasso === i.id ? editorHTML(i) : ''}
    </li>`;
  }
  function formDespachoHTML(i) {
    return `<form class="form-mini" data-form="${i.id}" novalidate>
      <span class="titulo">${A.ic('enviar')} Registrar o despacho de "${A.esc(i.nome)}"</span>
      <div class="dois"><div class="campo"><label for="fs-${i.id}">Enviado para</label><input id="fs-${i.id}" name="setor" list="lista-setores" value="${A.esc(palpiteSetor(i))}" placeholder="GCI"><div class="erro" hidden>Diga para onde o despacho foi.</div></div>
        <div class="campo"><label for="fd-${i.id}">Enviado em</label><input id="fd-${i.id}" name="data" type="date" value="${A.hojeIso()}" max="${A.hojeIso()}"></div></div>
      <div class="campo"><label for="ft-${i.id}">O que foi pedido ou combinado <small>(opcional)</small></label><textarea id="ft-${i.id}" name="texto"></textarea></div>
      ${(() => { const fr = (I(i.id) || {}).f, ap = proc.seis.find(s => s.tipo === 'Apoio das unidades'); return ap && fr && ['local', 'comunicacao'].includes(fr.modeloId) ? `<p class="secundario">Este pedido vai no SEI de apoio das unidades: <strong>${A.esc(ap.numero)}</strong>.</p>` : ''; })()}
      <div class="campo"><label for="fsei-${i.id}">Abriu um SEI relacionado para isso? <small>(opcional: cole o número)</small></label><input id="fsei-${i.id}" name="seiRel" placeholder="19.25.000000000.0000000/2026-00"></div>
      <div class="form-botoes"><button class="btn btn-primario" type="submit">Salvar e esperar resposta</button><button class="btn" type="button" data-cancelar>Cancelar</button></div>
    </form>`;
  }
  function editorHTML(i) {
    const p = prazo(i);
    return `<form class="editor-passo" data-editor="${i.id}" novalidate>
      <div class="campo"><label for="ep-o-${i.id}">Passo</label><input id="ep-o-${i.id}" name="o" value="${A.esc(i.nome)}"><div class="erro" hidden>Escreva o nome do passo.</div></div>
      <div class="dois">
        <div class="campo"><label for="ep-p-${i.id}">Prazo</label><input id="ep-p-${i.id}" name="prazo" type="date" value="${p || ''}" ${p ? '' : 'disabled title="Cadastre a data do evento ou a data limite"'}><span class="secundario" style="font-size:var(--t-xs)">Hoje: ${A.esc(A.regraTexto(i.regra))}</span></div>
        <div class="campo"><label for="ep-e-${i.id}">Situação</label><select id="ep-e-${i.id}" name="estado">${ESTADOS.map(([v, n]) => `<option value="${v}" ${i.estado === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      </div>
      <div class="form-botoes"><span style="display:flex;gap:8px"><button class="btn btn-primario" type="submit">Salvar</button><button class="btn" type="button" data-cancelar-editor>Cancelar</button></span>
        <button class="btn-texto btn-perigo" type="button" data-tirar-passo>${A.ic('lixo', 'ic-sm')}Tirar este passo</button></div>
    </form>`;
  }
  function ligarEditor(form) {
    const x = I(form.dataset.editor); if (!x) return;
    const { f, i } = x;
    const fechar = () => { editandoPasso = null; fecharEditorCrono(); desenharConteudo(); };
    form.querySelector('[data-cancelar-editor]').onclick = fechar;
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } });
    form.querySelector('[data-tirar-passo]').onclick = () => {
      const pos = f.itens.indexOf(i);
      f.itens.splice(pos, 1); editandoPasso = null; fecharEditorCrono();
      A.anotar(proc, 'Sistema', `Passo tirado de ${f.nome}: ${i.nome}.`);
      salvarE();
      A.avisar(`Passo "${i.nome}" tirado.`, () => { f.itens.splice(pos, 0, i); proc.diario.pop(); });
    };
    form.onsubmit = e => {
      e.preventDefault();
      const nome = form.elements.o.value.trim();
      if (!nome) { form.elements.o.setAttribute('aria-invalid', 'true'); form.elements.o.parentElement.querySelector('.erro').hidden = false; form.elements.o.focus(); return; }
      const antes = { nome: i.nome, regra: { ...i.regra }, editado: i.editado };
      i.nome = nome;
      if (form.elements.prazo.value && form.elements.prazo.value !== prazo(i)) { i.regra = A.regraDeData(proc, i, form.elements.prazo.value); i.editado = true; }
      if (nome !== antes.nome) i.editado = true;
      const desfazE = form.elements.estado.value !== i.estado ? A.setEstado(proc, i, form.elements.estado.value) : null;
      editandoPasso = null; fecharEditorCrono();
      A.anotar(proc, 'Sistema', `Passo editado: ${i.nome}.`);
      salvarE();
      A.avisar('Passo salvo.', () => { Object.assign(i, antes); if (desfazE) desfazE(); proc.diario.pop(); });
    };
  }

  function apagarEste() {
    const p = proc;
    if (!A.confirmarApagar(p)) return;
    const desfaz = A.apagarProcesso(p);
    location.hash = '#/processos';
    A.avisar(`"${p.titulo}" apagado.`, () => { desfaz(); A.redesenhar(); });
  }

  /* ---------- Topo ---------- */
  function desenharTopo() {
    const s = A.situacao(proc), el = vistaEl;
    el.querySelector('#selos').innerHTML = `${proc.arquivado ? `<span class="selo carimbo" style="--c:var(--neutro);--cbg:var(--neutro-bg)">${A.ic('arquivo-ic')}Arquivado${proc.situacaoPlanilha ? ': ' + A.esc(proc.situacaoPlanilha) : ''}</span>` : A.seloSit(s)}${!proc.arquivado && A.conflitosSala(proc).length ? `<span class="selo" style="--c:var(--critico);--cbg:var(--critico-bg)" title="${A.esc(A.conflitosSala(proc).map(A.textoConflito).join(' '))}">${A.ic('alerta')}Conflito de sala</span>` : ''}${A.classeTexto(proc) ? `<span class="etiqueta etiqueta-classe">${A.esc(A.classeTexto(proc))}</span>` : `<button type="button" class="selo" id="classificar" style="--c:var(--atencao);--cbg:var(--atencao-bg)" data-editar>${A.ic('alerta')}Classificar: interno ou externo?</button>`}<span class="etiqueta">${A.esc(proc.tipoNome || '')}</span>${proc.modalidade ? `<span class="etiqueta">${A.esc(proc.modalidade)}</span>` : ''}`;
    const fa = el.querySelector('#faixaArquivar');
    if (fa) {
      fa.innerHTML = !proc.arquivado && A.tudoFeito(proc) && pode() ? `<div class="faixa-arquivar">${A.ic('feito')}<span><strong>Tudo feito neste processo.</strong> Quer arquivar? Ele sai do painel e continua em Processos &gt; Arquivados, na busca e na Agenda.</span><button class="btn btn-primario" type="button" id="arquivarJa">${A.ic('arquivo-ic')} Arquivar</button></div>` : '';
      const bj = fa.querySelector('#arquivarJa');
      if (bj) bj.onclick = () => { const desfaz = A.arquivar(proc); A.redesenhar(); A.avisar('Processo arquivado.', () => { desfaz(); A.redesenhar(); }); };
    }
    el.querySelector('#titulo').textContent = proc.titulo;
    el.querySelector('#trilhaTitulo').textContent = proc.titulo;
    document.title = `${proc.titulo} — Meus processos`;
    el.querySelector('#meta').innerHTML = `${proc.sei ? `<button type="button" class="sei" data-sei="${A.esc(proc.sei)}" title="Copiar o número completo">${A.ic('copiar', 'ic-sm')}SEI ${A.esc(A.seiCurto(proc.sei))}</button>` : '<span>Sem número SEI</span>'}
      ${proc.unidade ? `<span>Pedido por ${A.esc(proc.unidade)}</span>` : ''}${proc.entrada ? `<span>Chegou ao setor em ${A.fmt(proc.entrada)}</span>` : ''}
      <button type="button" class="btn-texto" id="btnEditarDados" data-editar aria-expanded="${editandoDados}" aria-controls="editarDados">${A.ic('lapis', 'ic-sm')}Editar dados do processo</button>
      ${pode() ? `<button type="button" class="btn-texto btn-perigo" id="btnApagarProc" data-editar>${A.ic('lixo', 'ic-sm')}Apagar processo</button>` : ''}`;
    const ref = A.dataRef(proc), n = ref ? A.dias(ref) : null, o = proc.inicio ? 'até o evento' : 'até a data limite';
    const lim = A.regras(proc.dono).limites;
    const c = n === null ? 'var(--tinta-2)' : n >= 0 && n <= lim.critico ? 'var(--critico)' : n <= lim.atencao ? 'var(--atencao)' : 'var(--tinta)';
    el.querySelector('#contagem').innerHTML = n === null ? `<div class="num" style="--c:${c};font-size:28px">Sem data</div><div class="txt">cadastre em "Editar dados"</div>`
      : n > 0 ? `<div class="num" style="--c:${c}">${n} dia${n > 1 ? 's' : ''}</div><div class="txt">${o} (${A.fmt(ref)})</div>`
      : n === 0 ? `<div class="num" style="--c:var(--caneta)">Hoje</div><div class="txt">${proc.inicio ? 'é o dia do evento' : 'é a data limite'}</div>`
      : `<div class="num">${-n} dias</div><div class="txt">desde ${proc.inicio ? 'o início do evento' : 'a data limite'}</div>`;
    const dono = A.perfil(proc.dono);
    el.querySelector('#fatos').innerHTML = (proc.inicio ? `<div><dt>Evento</dt><dd>${A.fmt(proc.inicio)}${proc.fim && proc.fim !== proc.inicio ? ' a ' + A.fmt(proc.fim) : ''}</dd></div>${proc.horario ? `<div><dt>Horário</dt><dd>${A.esc(proc.horario)}</dd></div>` : ''}${proc.local ? `<div><dt>Local</dt><dd>${A.esc(proc.local)}</dd></div>` : ''}`
      : `<div><dt>Data limite</dt><dd>${proc.limite ? A.fmtAno(proc.limite) : '—'}</dd></div>`)
      + `<div><dt>Responsável</dt><dd>${A.avatar(dono)}${A.esc(dono ? dono.ini : '')}</dd></div><div><dt>Apoio</dt><dd>${proc.apoio ? A.esc(A.iniciais(proc.apoio)) : '—'}</dd></div>`
      + (proc.observacoes ? `<div style="grid-column:1/-1"><dt>Observações</dt><dd style="font-weight:400">${A.esc(proc.observacoes)}</dd></div>` : '');
    A.ligarCopiaSei(el.querySelector('#meta'));
    el.querySelector('#btnEditarDados').onclick = () => { editandoDados = !editandoDados; desenharDados(); };
    const ap = el.querySelector('#btnApagarProc'); if (ap) ap.onclick = apagarEste;
    if (!el.dataset.classificar) el.dataset.classificar = '1', el.addEventListener('click', e => { if (e.target.closest('#classificar')) { editandoDados = true; desenharDados(); const c = vistaEl.querySelector('[name=ambito]'); if (c) { c.scrollIntoView({ block: 'center' }); c.focus(); } } });
    desenharDados();
  }

  /* ---------- Editar dados ---------- */
  const CAMPOS = () => [
    ['titulo', 'Nome do curso ou evento', 'text', 'largo'], ['sei', 'Número do processo SEI', 'text'],
    ['ambito', 'Onde acontece', 'select', '', [['', '— escolha —'], ['interno', 'Interno: a escola promove'], ['externo', 'Externo: o servidor vai a evento de fora']]],
    ['publico', 'Para quem', 'select', '', [['', '— escolha —'], ...Object.entries(A.PUBLICOS)]],
    ['tipoId', 'Tipo', 'select', '', A.regras(proc.dono).tipos.filter(t => !t.oculto || t.id === proc.tipoId).map(t => [t.id, t.nome + (t.oculto ? ' (antigo)' : '')])],
    ['unidade', 'Quem pediu (unidade)', 'text', 'largo'], ['entrada', 'Chegou ao setor em', 'date'],
    ['inicio', 'Início do evento', 'date'], ['fim', 'Fim do evento', 'date'], ['limite', 'Data limite (quando não há evento)', 'date'],
    ['horario', 'Horário', 'text'], ['modalidade', 'Modalidade', 'select', '', [['', '—'], ['Presencial', 'Presencial'], ['Online', 'Online'], ['Híbrido', 'Híbrido']]],
    ['local', 'Local', 'text', 'largo'], ['apoio', 'Apoio (nome; aparece só com as iniciais)', 'text', 'largo'], ['observacoes', 'Observações', 'textarea', 'largo'],
  ];
  function campoHTML([k, rot, tipo, cls, ops], prefixo, ficha) {
    const id = prefixo + k, at = `id="${id}" name="${k}" ${ficha ? `class="cel" data-k="dado:${k}"` : ''} ${k === 'local' ? 'list="lista-salas" autocomplete="off"' : ''} ${pode() ? '' : 'disabled'}`;
    const ctl = tipo === 'select' ? `<select ${at}>${ops.map(([v, n]) => `<option value="${A.esc(v)}" ${(proc[k] || '') === v ? 'selected' : ''}>${A.esc(n)}</option>`).join('')}</select>`
      : tipo === 'textarea' ? `<textarea ${at}>${A.esc(proc[k] || '')}</textarea>` : `<input ${at} type="${tipo}" value="${A.esc(proc[k] || '')}">`;
    return `<div class="campo ${cls || ''}"><label for="${id}">${rot}</label>${ctl}<div class="erro" hidden></div></div>`;
  }
  function validar(v) {
    if (!String(v.titulo || '').trim()) return ['titulo', 'O nome não pode ficar em branco.'];
    if (v.fim && v.inicio && v.fim < v.inicio) return ['fim', 'O fim não pode ser antes do início.'];
    if (v.fim && !v.inicio) return ['inicio', 'Escolha também a data de início.'];
    return null;
  }
  /* Ao mudar o tipo, entram as frentes e passos do novo tipo que ainda não existem */
  function completarComTipo() {
    const tipo = A.tipo(proc); if (!tipo) return;
    proc.tipoNome = tipo.nome;
    tipo.frentes.forEach(fm => {
      let f = proc.frentes.find(x => x.modeloId === fm.id || x.nome === fm.nome);
      if (!f) { f = { id: 'f' + A.uid(), modeloId: fm.id, nome: fm.nome, fase: fm.fase, icone: fm.icone, coluna: fm.coluna, na: !!fm.naPadrao, itens: [] }; proc.frentes.push(f); }
      fm.passos.forEach(pm => { if (!f.itens.some(i => i.modeloId === pm.id || i.nome === pm.nome)) f.itens.push({ id: 'i' + A.uid(), modeloId: pm.id, nome: pm.nome, regra: { dias: +pm.dias, quando: pm.quando, ref: pm.ref }, estado: 'aberta', coluna: pm.coluna, na: false, editado: false }); });
    });
  }
  function desenharDados() {
    const el = vistaEl.querySelector('#editarDados');
    el.hidden = !editandoDados;
    vistaEl.querySelector('#btnEditarDados')?.setAttribute('aria-expanded', editandoDados);
    if (!editandoDados) { el.innerHTML = ''; return; }
    el.innerHTML = `<h2 id="t-editar">Editar dados do processo</h2>
      <form id="fDados" novalidate><div class="grade-campos">${CAMPOS().map(c => campoHTML(c, 'ed-', false)).join('')}</div>
      <p class="secundario" style="margin-top:12px">Mudar as datas move todos os prazos junto, porque eles são contados a partir delas. Mudar o tipo acrescenta os passos do novo tipo.</p>
      <div class="form-botoes" style="justify-content:space-between">
        <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-texto" type="button" id="edArquivar">${A.ic('arquivo-ic', 'ic-sm')}${proc.arquivado ? 'Tirar do arquivo' : 'Arquivar (concluído ou passado adiante)'}</button><button class="btn-texto btn-perigo" type="button" id="edApagar">${A.ic('lixo', 'ic-sm')}Tirar do sistema</button></span>
        <span style="display:flex;gap:8px"><button class="btn" type="button" id="edCancelar">Cancelar</button><button class="btn btn-primario" type="submit">Salvar dados</button></span></div></form>`;
    el.querySelector('input,select').focus();
    el.querySelector('#edCancelar').onclick = () => { editandoDados = false; desenharDados(); vistaEl.querySelector('#btnEditarDados')?.focus(); };
    el.querySelector('#edArquivar').onclick = () => {
      const antes = proc.arquivado; proc.arquivado = !proc.arquivado;
      A.anotar(proc, 'Sistema', proc.arquivado ? 'Processo arquivado.' : 'Processo tirado do arquivo.');
      editandoDados = false; salvarE();
      A.avisar(proc.arquivado ? 'Processo arquivado. Ele sai do painel, mas continua na lista de processos.' : 'Processo voltou para o painel.', () => { proc.arquivado = antes; proc.diario.pop(); });
    };
    el.querySelector('#edApagar').onclick = apagarEste;
    el.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const f = e.target, v = {};
      CAMPOS().forEach(([k]) => v[k] = f.elements[k].value.trim());
      if (v.inicio && !v.fim) v.fim = v.inicio;
      f.querySelectorAll('[aria-invalid]').forEach(x => { x.removeAttribute('aria-invalid'); x.parentElement.querySelector('.erro').hidden = true; });
      const er = validar(v);
      if (er) { const c = f.elements[er[0]]; c.setAttribute('aria-invalid', 'true'); const m = c.parentElement.querySelector('.erro'); m.textContent = er[1]; m.hidden = false; c.focus(); return; }
      const antes = A.clonar(proc);
      const mudouTipo = v.tipoId !== proc.tipoId, mudouAmbito = v.ambito !== (proc.ambito || ''), dataAntes = [proc.inicio, proc.fim], pubAntes = proc.publico;
      v.sei = A.seiGuardar(v.sei);
      if (A.lgpd()) v.apoio = A.iniciais(v.apoio);
      Object.assign(proc, v);
      if (mudouTipo) completarComTipo();
      if (mudouTipo || mudouAmbito) A.aplicarAmbito(proc);
      if (pubAntes !== proc.publico) A.aplicarPublico(proc);
      if (dataAntes[0] !== proc.inicio || dataAntes[1] !== proc.fim) A.anotar(proc, 'Sistema', `Data do evento mudou de ${dataAntes[0] ? A.fmt(dataAntes[0]) + (dataAntes[1] && dataAntes[1] !== dataAntes[0] ? ' a ' + A.fmt(dataAntes[1]) : '') : 'sem data'} para ${proc.inicio ? A.fmt(proc.inicio) + (proc.fim && proc.fim !== proc.inicio ? ' a ' + A.fmt(proc.fim) : '') : 'sem data'}. Prazos recalculados.`);
      A.anotar(proc, 'Sistema', 'Dados do processo alterados.');
      editandoDados = false;
      salvarE();
      const conf = A.conflitosSala(proc);
      A.avisar(conf.length ? `Dados salvos, mas atenção: ${A.textoConflito(conf[0])}` : 'Dados salvos. Os prazos foram recalculados.', () => { Object.keys(proc).forEach(k => delete proc[k]); Object.assign(proc, antes); });
    };
  }

  /* ---------- Caminho ---------- */
  function desenharCaminho() {
    const fs = fasesVisiveis(), atual = faseAtual();
    const ol = vistaEl.querySelector('#caminho');
    ol.style.setProperty('--n', fs.length);
    ol.innerHTML = fs.map((fa, i) => {
      let feitas = 0, total = 0;
      if (fa.id === 'evento') { total = 1; feitas = A.dias(proc.fim || proc.inicio) < 0 ? 1 : 0; }
      else proc.frentes.filter(f => f.fase === fa.id && !f.na).forEach(f => f.itens.filter(x => !x.na).forEach(t => { total++; if (t.estado === 'feita') feitas++; }));
      const pronta = total && feitas === total, cls = (fa.id === atual ? 'atual' : pronta ? 'pronta' : '') + (umaPorVez() && fa.id === faseNaTela() ? ' vendo' : '');
      const d = fa.id === 'evento' ? `${A.fmt(proc.inicio)}${proc.fim && proc.fim !== proc.inicio ? ' a ' + A.fmt(proc.fim) : ''}` : fa.d;
      const cont = fa.id === 'evento' ? (A.dias(proc.inicio) > 0 ? `em ${A.dias(proc.inicio)} dias` : A.dias(proc.fim || proc.inicio) >= 0 ? 'acontecendo' : 'aconteceu') : `${feitas} de ${total}`;
      return `<li class="${cls}"><button type="button" data-ir="${fa.id}" ${fa.id === atual ? 'aria-current="step"' : ''}>
        <span class="n"><span>${i + 1}. ${pronta ? A.ic('check', 'ic-sm') + 'pronta' : fa.id === atual ? 'agora' : ''}</span><span>${cont}</span></span>
        <span class="t">${fa.n}</span><span class="d">${d}</span>
        <span class="barra-c" aria-hidden="true"><i style="transform:scaleX(${total ? feitas / total : 0})"></i></span></button></li>`;
    }).join('');
    ol.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => {
      if (modo() === 'frentes' && umaPorVez()) return irParaFase(b.dataset.ir);
      if (modo() !== 'frentes') { A.prefs().modoProc = 'frentes'; A.salvar(); desenhar(); }
      const alvo = vistaEl.querySelector('#fase-' + b.dataset.ir); if (!alvo) return;
      A.rolarAte(alvo); const h = alvo.querySelector('h2'); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true });
    });
  }

  /* ---------- Modo 1: fases e frentes ---------- */
  function frenteHTML(f) {
    const e = A.estadoFrente(proc, f), [c, bg] = cor(f), it = f.itens.filter(i => !i.na), feitas = it.filter(t => t.estado === 'feita').length;
    const aberta = abertas.has(f.id), seisF = proc.seis.filter(s => s.f === f.id);
    return `<article class="frente${f.na ? ' na' : ''}${e === 'travada' ? ' travada' : ''}" style="view-transition-name:fr-${f.id}" aria-labelledby="fn-${f.id}">
      <button type="button" class="frente-cab" aria-expanded="${aberta}" aria-controls="fc-${f.id}" data-abrir="${f.id}">
        <span class="ico-f" style="--c:${c};--cbg:${bg}">${fic(f)}</span>
        <span><span class="nome" id="fn-${f.id}">${A.esc(f.nome)}</span>
          <span class="sub" style="display:block">${f.na ? 'Não faz parte deste processo' : `${feitas} de ${it.length} feitas${f.coluna ? ` · coluna "${f.coluna}"` : ' · só no seu controle'}`}</span>
          ${f.na ? '' : `<span class="mini-barra" aria-hidden="true"><i style="transform:scaleX(${it.length ? feitas / it.length : 0})"></i></span>`}</span>
        ${A.seloFrente(e)}<svg class="ic seta" aria-hidden="true"><use href="#i-seta"/></svg></button>
      <div class="recolhivel${aberta ? '' : ' fechado'}" id="fc-${f.id}"><div ${aberta ? '' : 'inert'}><div class="frente-corpo">
        ${e === 'travada' ? `<p class="trava">${A.ic('cadeado')} Liberada depois da aprovação, na fase Início.</p>` : ''}
        ${f.modeloId === 'financeira' && !f.na && e !== 'travada' ? `<div class="pergunta pergunta-fin"><div><h3>O que o financeiro respondeu?</h3><p class="secundario">Muda as sugestões abaixo e na contratação.</p></div>
          <div class="segmento" role="radiogroup" aria-label="O que o financeiro respondeu?">${[['', 'Ainda não'], ...Object.entries(A.RESPOSTA_FIN)].map(([v, n]) => `<label><input type="radio" name="fin-${f.id}" value="${v}" ${(proc.financeiro || '') === v ? 'checked' : ''} ${pode() ? '' : 'disabled'}><span>${n}</span></label>`).join('')}</div></div>` : ''}
        ${f.na ? `<p class="na-txt">Marcada como "não se aplica". Na planilha, fica cinza.</p>` : `<ul class="tarefas">${it.map(i => linhaTarefa(f, i)).join('') || '<li class="vazio">Nenhum passo. Use "Adicionar passo".</li>'}</ul>`}
        ${seisF.length ? `<div class="seis-frente">${seisF.map(s => `<span class="sei-chip">${A.esc(s.tipo)} ${A.esc(A.seiCurto(s.numero))}</span>`).join('')}</div>` : ''}
        ${!f.na && e !== 'travada' && pode() && A.sugestoesDe(proc, f).length ? `<div class="sugestoes" data-editar><span class="sugestoes-rot">Sugestões</span>${A.sugestoesDe(proc, f).map((s, k) => `<button type="button" class="sugestao" data-sugestao="${f.id}|${k}">${A.ic('mais', 'ic-sm')}${A.esc(s.nome)}</button>`).join('')}</div>` : ''}
        <div class="frente-pe" data-editar>
          ${f.fase === 'inicio' ? '<span></span>' : `<label class="chave"><input type="checkbox" data-na="${f.id}" ${f.na ? 'checked' : ''} ${e === 'travada' && !f.na ? 'disabled' : ''}> Não se aplica a este processo</label>`}
          ${f.na || e === 'travada' ? '' : `<span style="display:inline-flex;gap:12px;flex-wrap:wrap">${it.some(t => t.estado !== 'feita') && it.length > 1 ? `<button type="button" class="btn-texto" data-tudo="${f.id}">${A.ic('check', 'ic-sm')}Marcar todos como feitos</button>` : ''}<button type="button" class="btn-texto" data-novo="${f.id}">${A.ic('mais', 'ic-sm')}Adicionar passo</button></span>`}
        </div><div id="novo-${f.id}"></div>
      </div></div></div></article>`;
  }
  /* ---------- Modo lista simples: um checklist só, em ordem de prazo ---------- */
  function desenharLista(el) {
    const verFeitos = !!A.prefs().listaFeitos;
    const todos = proc.frentes.filter(f => !f.na).flatMap(f => f.itens.filter(i => !i.na).map(i => ({ f, i, p: prazo(i) || '9999' })));
    const abertos = todos.filter(x => x.i.estado !== 'feita').sort((a, b) => a.p < b.p ? -1 : 1);
    const feitos = todos.filter(x => x.i.estado === 'feita');
    const alvo = proc.frentes.find(f => !f.na && f.fase === 'prep') || proc.frentes.find(f => !f.na) || proc.frentes[0];
    el.innerHTML = `<section class="lista-simples-proc" aria-labelledby="t-check">
      <div class="lista-topo"><h2 id="t-check">Checklist</h2><span class="secundario">${feitos.length} de ${todos.length} feitos</span>
        <label class="chave"><input type="checkbox" id="verFeitos" ${verFeitos ? 'checked' : ''}> Mostrar os feitos</label></div>
      <ul class="tarefas">${abertos.map(x => linhaTarefa(x.f, x.i)).join('') || '<li class="vazio">Tudo feito.</li>'}${verFeitos ? feitos.map(x => linhaTarefa(x.f, x.i)).join('') : ''}</ul>
      ${pode() && alvo ? `<button type="button" class="btn-texto" data-novo="${alvo.id}">${A.ic('mais', 'ic-sm')}Acrescentar item</button><div id="novo-${alvo.id}"></div>` : ''}
    </section>`;
    ligarFases(el);
    el.querySelector('#verFeitos').onchange = e => { A.prefs().listaFeitos = e.target.checked; A.salvar(); desenharConteudo(); };
  }


  /* ---------- Encaminhamentos do Início: um despacho, vários destinos, cada um com sua resposta ---------- */
  const DESTINOS = ['PGJ', 'DOF', 'DA', 'Setor financeiro (EMPRO)', 'GCI'];
  let formEnc = false, respondendo = null;
  function encaminhamentosHTML() {
    const ds = proc.despachos.filter(d => d.grupo || /pgj|dof|\bda\b|financeiro/i.test(d.setor || ''));
    const grupos = [];
    ds.forEach(d => { const k = d.grupo || d.id; let g = grupos.find(x => x.k === k); if (!g) grupos.push(g = { k, data: d.enviado, texto: d.texto, itens: [] }); g.itens.push(d); });
    grupos.sort((a, b) => (b.data || '') < (a.data || '') ? -1 : 1);
    const linha = d => {
      const situ = !d.resposta ? `<span class="enc-situ aguardando">${A.ic('relogio', 'ic-sm')} aguardando resposta${d.enviado ? ` · ${A.haDias(-A.dias(d.enviado))}` : ''}</span>`
        : `<span class="enc-situ ${d.resultado || 'respondido'}">${A.ic(d.resultado === 'indeferido' ? 'alerta' : 'check', 'ic-sm')} ${d.resultado ? A.RESULTADOS[d.resultado] : 'respondeu'} em ${A.fmt(d.resposta)}</span>${d.nota ? `<span class="secundario"> · ${A.esc(d.nota)}</span>` : ''}`;
      return `<li class="enc-dest"><strong>→ ${A.esc(d.setor)}</strong>${situ}
        ${!d.resposta && pode() ? (respondendo === d.id
          ? `<div class="enc-resp" data-resp-form="${d.id}"><span>Resposta de ${A.esc(d.setor)}:</span>${Object.entries(A.RESULTADOS).map(([k, n]) => `<button type="button" class="btn" data-resultado="${k}">${n}</button>`).join('')}
             <label>em <input type="date" name="respData" value="${A.hojeIso()}" max="${A.hojeIso()}"></label><input name="respNota" placeholder="observação (opcional)"><button type="button" class="btn-texto" data-resp-cancelar>Cancelar</button></div>`
          : `<button type="button" class="btn-texto" data-responder="${d.id}">Registrar resposta</button>`) : ''}</li>`;
    };
    return `<section class="encaminhamentos" aria-labelledby="t-enc">
      <div class="enc-topo"><h3 id="t-enc">Encaminhamentos</h3>${pode() && !formEnc ? `<button type="button" class="btn" id="encNovo">${A.ic('enviar')} Registrar encaminhamento</button>` : ''}</div>
      ${formEnc ? `<form class="form-mini" id="encForm" novalidate>
        <span class="titulo">Para quem foi o despacho? Pode marcar mais de um.</span>
        <div class="enc-destinos">${DESTINOS.map(s => `<label class="opcao"><input type="checkbox" name="dest" value="${s}"> ${s}</label>`).join('')}
          <label class="opcao">Outro: <input name="destOutro" list="lista-setores" placeholder="unidade" style="max-width:180px"></label></div>
        <div class="dois"><div class="campo"><label for="encData">Enviado em</label><input id="encData" name="data" type="date" value="${A.hojeIso()}" max="${A.hojeIso()}"></div>
          <div class="campo"><label for="encTexto">O que foi pedido <small>(opcional)</small></label><input id="encTexto" name="texto" placeholder="ex.: autorização e análise de remanejamento"></div></div>
        <p class="erro" id="encErro" hidden>Marque pelo menos um destino.</p>
        <div class="form-botoes"><button class="btn btn-primario" type="submit">Salvar: fica aguardando resposta</button><button class="btn" type="button" id="encCancelar">Cancelar</button></div>
      </form>` : ''}
      ${grupos.length ? `<ul class="enc-lista">${grupos.map(g => `<li class="enc-grupo"><p class="enc-data">Despacho de ${g.data ? A.fmt(g.data) : '—'}${g.texto ? ` · ${A.esc(g.texto)}` : ''}</p><ul>${g.itens.map(linha).join('')}</ul></li>`).join('')}</ul>`
        : (formEnc ? '' : '<p class="secundario">Nenhum encaminhamento ainda. Ao despachar à PGJ, à DOF ou a outra unidade, registre aqui: o pedido fica "aguardando" até a resposta chegar.</p>')}
    </section>`;
  }
  function ligarEncaminhamentos(el) {
    const n = el.querySelector('#encNovo'); if (n) n.onclick = () => { formEnc = true; desenharConteudo(); const c = vistaEl.querySelector('#encForm input'); if (c) c.focus(); };
    const f = el.querySelector('#encForm');
    if (f) {
      f.querySelector('#encCancelar').onclick = () => { formEnc = false; desenharConteudo(); };
      f.onsubmit = e => {
        e.preventDefault();
        const dest = [...f.querySelectorAll('[name=dest]:checked')].map(x => x.value);
        const outro = f.elements.destOutro.value.trim(); if (outro) dest.push(outro);
        if (!dest.length) { f.querySelector('#encErro').hidden = false; return; }
        const criados = A.registrarEncaminhamento(proc, dest, f.elements.data.value || A.hojeIso(), f.elements.texto.value.trim());
        formEnc = false; salvarE();
        A.avisar(`Encaminhamento salvo: aguardando ${dest.join(' e ')}.`, () => { proc.despachos = proc.despachos.filter(d => !criados.includes(d)); criados.forEach(d => { const it = d.itemId && A.acharItem(proc, d.itemId); if (it && it.i.estado === 'esperando') it.i.estado = 'aberta'; }); proc.diario.pop(); salvarE(); });
      };
    }
    el.querySelectorAll('[data-responder]').forEach(b => b.onclick = () => { respondendo = b.dataset.responder; desenharConteudo(); });
    el.querySelectorAll('[data-resp-cancelar]').forEach(b => b.onclick = () => { respondendo = null; desenharConteudo(); });
    el.querySelectorAll('[data-resp-form]').forEach(box => box.querySelectorAll('[data-resultado]').forEach(b => b.onclick = () => {
      const d = proc.despachos.find(x => x.id === box.dataset.respForm); if (!d) return;
      A.responderDespacho(proc, d, b.dataset.resultado, box.querySelector('[name=respData]').value || A.hojeIso(), box.querySelector('[name=respNota]').value.trim());
      respondendo = null; salvarE();
      A.avisar(b.dataset.resultado === 'indeferido' ? 'Negativa registrada. Entrou a pendência "Decidir o que fazer".' : 'Resposta registrada.');
    }));
  }
  /* Grupos que só entram quando a pessoa pede (ex.: contratação no evento interno) */
  function gruposSobHTML(fa) {
    const t = A.tipo(proc); if (!t || !pode()) return '';
    const faltam = t.frentes.filter(fm => fm.sob && fm.fase === fa.id && !proc.frentes.some(f => f.modeloId === fm.id));
    return faltam.map(fm => `<button type="button" class="sugestao sob" data-sob="${fm.id}">${A.ic('mais', 'ic-sm')}Acrescentar os itens de ${A.esc(fm.nome.split(' (')[0].toLowerCase())}</button>`).join('');
  }
  function ligarSob(el) {
    el.querySelectorAll('[data-sob]').forEach(b => b.onclick = () => {
      const fm = A.tipo(proc).frentes.find(x => x.id === b.dataset.sob);
      const f = { id: 'f' + A.uid(), modeloId: fm.id, nome: fm.nome, fase: fm.fase, icone: fm.icone, coluna: fm.coluna || null, na: false, itens: fm.passos.map(A.itemDoModelo) };
      f.itens.forEach(i => A.ajustarPublico(proc, i));
      proc.frentes.push(f); abertas.add(f.id);
      A.anotar(proc, 'Sistema', `Itens de ${fm.nome} acrescentados.`);
      salvarE();
      A.avisar(`${fm.nome}: ${f.itens.length} itens acrescentados.`, () => { proc.frentes = proc.frentes.filter(x => x !== f); proc.diario.pop(); salvarE(); });
    });
  }

  /* ---------- "Agora": o que está com você e o que espera outras unidades, nesta fase ---------- */
  function agoraHTML(fa) {
    const frs = proc.frentes.filter(f => f.fase === fa.id && !f.na);
    const pend = frs.filter(f => !A.travada(proc, f)).flatMap(f => f.itens.filter(i => !i.na && i.estado !== 'feita').map(i => ({ f, i, p: prazo(i) || '9999' })));
    const faz = pend.filter(x => x.i.quem !== 'acompanha').sort((a, b) => a.p < b.p ? -1 : 1).slice(0, 3);
    const marcos = frs.flatMap(f => f.itens.filter(i => !i.na && i.quem === 'acompanha'));
    if (!faz.length && !marcos.length) return '';
    const chegou = marcos.filter(i => i.estado === 'feita').length, prox = marcos.find(i => i.estado !== 'feita');
    return `<section class="agora" aria-label="Agora nesta fase">
      <div class="agora-col"><h3 class="agora-rot">Agora, com você</h3>
        ${faz.length ? `<ol>${faz.map(x => `<li><button type="button" class="link-proc" data-ir-passo="${x.f.id}|${x.i.id}">${A.esc(x.i.nome)}</button><span class="prazo">${quando(x.i)}</span></li>`).join('')}</ol>` : '<p class="secundario">Nada com você nesta fase.</p>'}</div>
      ${marcos.length ? `<div class="agora-col"><h3 class="agora-rot">Esperando outras unidades</h3>
        <p class="agora-n"><strong>${chegou} de ${marcos.length}</strong> marcos já aconteceram</p>
        <div class="agora-barra" aria-hidden="true"><i style="transform:scaleX(${chegou / marcos.length})"></i></div>
        ${prox ? `<p class="secundario">Próximo: <strong>${A.esc(prox.nome)}</strong>${prox.setor ? ` (${A.esc(prox.setor)})` : ''}</p>` : '<p class="secundario">Tudo chegou.</p>'}</div>` : ''}
    </section>`;
  }

  /* ---------- Roteiro: vários lugares e dias dentro do mesmo evento ---------- */
  function roteiroHTML() {
    const r = proc.roteiro || [], dis = pode() ? '' : 'disabled';
    return `<section class="roteiro" aria-labelledby="t-roteiro">
      <div class="roteiro-topo"><div><h3 id="t-roteiro">Roteiro</h3><p class="secundario">Quando o evento passa por vários lugares (por exemplo, comarcas do interior). Cada parada aparece na Agenda.</p></div>
        ${r.length ? `<button type="button" class="btn" id="rotTexto">${A.ic('copiar')} Copiar texto do despacho às comarcas</button>` : ''}</div>
      ${r.length ? `<div class="tabela-rolagem"><table class="tabela roteiro-tab"><thead><tr><th scope="col">Lugar</th><th scope="col">Dia</th><th scope="col">Horário</th><th scope="col">O que o local precisa preparar</th><th scope="col"><span class="sr">Tirar</span></th></tr></thead><tbody>
        ${r.map((x, k) => `<tr><td><input class="cel" data-rot="${k}:local" value="${A.esc(x.local || '')}" list="lista-salas" aria-label="Lugar da parada ${k + 1}" ${dis}></td>
          <td><input class="cel" type="date" data-rot="${k}:data" value="${A.esc(x.data || '')}" aria-label="Dia da parada ${k + 1}" ${dis}></td>
          <td><input class="cel" data-rot="${k}:horario" value="${A.esc(x.horario || '')}" placeholder="${A.esc(proc.horario || '14h às 17h')}" aria-label="Horário da parada ${k + 1}" ${dis}></td>
          <td><input class="cel" data-rot="${k}:preparar" value="${A.esc(x.preparar || '')}" placeholder="sala com projetor, lista de presença…" aria-label="O que preparar na parada ${k + 1}" ${dis}></td>
          <td>${pode() ? `<button type="button" class="btn-icone btn-apagar" data-rot-tirar="${k}" aria-label="Tirar a parada ${k + 1}">${A.ic('lixo')}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${pode() ? `<button type="button" class="btn-texto" id="rotMais">${A.ic('mais', 'ic-sm')}${r.length ? 'Mais uma parada' : 'Este evento passa por vários lugares'}</button>` : ''}
    </section>`;
  }
  function ligarRoteiro(el) {
    const r = () => proc.roteiro || (proc.roteiro = []);
    const mais = el.querySelector('#rotMais');
    if (mais) mais.onclick = () => {
      const ult = r()[r().length - 1];
      r().push({ id: 'r' + A.uid(), local: '', data: ult && ult.data ? A.somar(ult.data, 1) : (proc.inicio || ''), horario: ult ? ult.horario : (proc.horario || ''), preparar: ult ? ult.preparar : '' });
      A.anotar(proc, 'Sistema', 'Parada acrescentada ao roteiro.'); salvarE().then(() => { const c = vistaEl.querySelector(`[data-rot="${r().length - 1}:local"]`); if (c) c.focus(); });
    };
    el.querySelectorAll('[data-rot]').forEach(inp => inp.onchange = () => {
      const [k, campo] = inp.dataset.rot.split(':'); r()[+k][campo] = inp.value.trim();
      const datas = r().map(x => x.data).filter(Boolean).sort();
      if (datas.length && (!proc.inicio || datas[0] < proc.inicio)) proc.inicio = datas[0];
      if (datas.length && (!proc.fim || datas[datas.length - 1] > proc.fim)) proc.fim = datas[datas.length - 1];
      A.salvar();
    });
    el.querySelectorAll('[data-rot-tirar]').forEach(b => b.onclick = () => {
      const k = +b.dataset.rotTirar, x = r()[k]; r().splice(k, 1);
      salvarE(); A.avisar('Parada tirada do roteiro.', () => { r().splice(k, 0, x); salvarE(); });
    });
    const tx = el.querySelector('#rotTexto');
    if (tx) tx.onclick = () => {
      const linhas = r().filter(x => x.local || x.data).map(x => `- ${x.local || 'local a definir'}: ${x.data ? `${A.semana(x.data)}, ${A.fmtAno(x.data)}` : 'data a definir'}${x.horario || proc.horario ? `, ${x.horario || proc.horario}` : ''}${x.preparar ? `. Preparar: ${x.preparar}` : ''}.`);
      A.copiar(`Informamos que a equipe da EMPRO realizará "${proc.titulo}" nas datas e locais abaixo:\n\n${linhas.join('\n')}\n\nSolicitamos, por gentileza, que cada unidade providencie o que está indicado e confirme a disponibilidade do espaço.`, 'Texto do despacho copiado. É só colar no SEI.');
    };
  }
  const umaPorVez = () => !A.prefs().todasFases;
  function faseNaTela() {
    const fs = fasesVisiveis();
    return faseVista && fs.some(f => f.id === faseVista) ? faseVista : faseAtual();
  }
  let dirFase = 1;
  function irParaFase(id) {
    const fs = fasesVisiveis().map(f => f.id);
    dirFase = fs.indexOf(id) >= fs.indexOf(faseNaTela()) ? 1 : -1;
    faseVista = id;
    if (modo() !== 'frentes') { A.prefs().modoProc = 'frentes'; A.salvar(); }
    desenharCaminho(); desenharConteudo();
    const alvo = vistaEl.querySelector('#fase-' + id);
    if (alvo) {
      if (!A.semMovimento()) alvo.animate([{ opacity: 0, transform: `translateX(${dirFase * 24}px)` }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      const top = vistaEl.querySelector('#caminho').getBoundingClientRect().top + window.scrollY - 12;
      if (window.scrollY > top) window.scrollTo({ top, behavior: A.semMovimento() ? 'auto' : 'smooth' });
      const h = alvo.querySelector('h2'); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true });
    }
  }
  function desenharFases(el) {
    const fs = fasesVisiveis(), naTela = faseNaTela(), uma = umaPorVez();
    const pos = fs.findIndex(f => f.id === naTela);
    el.innerHTML = fs.map((fa, i) => {
      if (uma && fa.id !== naTela) return '';
      const fr = proc.frentes.filter(f => f.fase === fa.id);
      let corpo = '';
      if (fa.id === 'evento') corpo = roteiroHTML() + `<div class="portao"><p><strong>${A.fmt(proc.inicio)}${proc.fim && proc.fim !== proc.inicio ? ' a ' + A.fmt(proc.fim) : ''}</strong>${proc.horario ? ', ' + A.esc(proc.horario) : ''}${proc.local ? ', ' + A.esc(proc.local) : ''}.</p><p class="secundario" style="margin-top:4px">${A.dias(proc.inicio) > 0 ? `Faltam ${A.dias(proc.inicio)} dias. Os prazos das outras fases são contados a partir destas datas.` : 'O evento já começou.'}</p></div>`;
      else if (fa.id === 'inicio') corpo = encaminhamentosHTML() + `<div class="frentes">${fr.map(frenteHTML).join('')}</div>` + gruposSobHTML(fa);
      else corpo = agoraHTML(fa) + `<div class="frentes">${fr.map(frenteHTML).join('')}</div>` + gruposSobHTML(fa);
      return `<section class="fase" id="fase-${fa.id}" aria-labelledby="h-${fa.id}"><div class="fase-topo"><h2 id="h-${fa.id}">${i + 1}. ${fa.n}</h2>${SUB_FASE[fa.id] ? `<p class="secundario">${SUB_FASE[fa.id]}</p>` : ''}</div>${corpo}</section>`;
    }).join('')
      + (uma ? `<nav class="fase-nav" aria-label="Trocar de fase">
          ${pos > 0 ? `<button class="btn btn-grande" type="button" data-fase="${fs[pos - 1].id}">${A.ic('anterior')}<span><small>Voltar</small>${fs[pos - 1].n}</span></button>` : '<span></span>'}
          ${pos < fs.length - 1 ? `<button class="btn btn-grande fase-prox" type="button" data-fase="${fs[pos + 1].id}"><span><small>Avançar</small>${fs[pos + 1].n}</span>${A.ic('proximo')}</button>` : '<span></span>'}
        </nav>` : '')
      + `<div class="form-botoes fase-pe">${pode() ? `<button type="button" class="btn" id="novaFrente">${A.ic('mais')}Adicionar uma frente a este processo</button>` : ''}<button type="button" class="btn-texto" id="todasFases">${uma ? 'Ver todas as fases juntas' : 'Ver uma fase por vez'}</button></div>`;
    ligarFases(el);
    el.querySelectorAll('[data-fase]').forEach(b => b.onclick = () => irParaFase(b.dataset.fase));
    el.querySelector('#todasFases').onclick = () => { A.prefs().todasFases = !A.prefs().todasFases; A.salvar(); desenharCaminho(); desenharConteudo(); };
    ligarRoteiro(el);
    el.querySelectorAll('[data-ir-passo]').forEach(b => b.onclick = () => {
      const [fid, iid] = b.dataset.irPasso.split('|');
      abertas.add(fid); desenharConteudo();
      const li = vistaEl.querySelector(`[data-i="${iid}"]`);
      if (li) { A.rolarAte(li); li.classList.add('brilho'); setTimeout(() => li.classList.remove('brilho'), 1600); const cb = li.querySelector('input'); if (cb) cb.focus({ preventScroll: true }); }
    });
    ligarEncaminhamentos(el); ligarSob(el);
  }
  function ligarFases(el) {
    el.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => {
      const id = b.dataset.abrir, ab = abertas.has(id);
      ab ? abertas.delete(id) : abertas.add(id);
      b.setAttribute('aria-expanded', !ab);
      const c = el.querySelector('#fc-' + id); c.classList.toggle('fechado', ab); c.firstElementChild.inert = ab;
    });
    el.querySelectorAll('.tarefa[data-i] input[id^="cb-"]').forEach(cb => cb.onchange = () => {
      const x = I(cb.id.slice(3)), li = cb.closest('.tarefa');
      if (cb.checked && !A.semMovimento()) { cb.classList.add('recem'); li.classList.add('feita', 'recem'); setTimeout(() => marcar(x.f, x.i, true), 380); }
      else marcar(x.f, x.i, cb.checked);
    });
    el.querySelectorAll('[data-despachar]').forEach(b => b.onclick = () => { formDespacho = b.dataset.despachar; editandoPasso = null; desenharConteudo(); el.querySelector('#fs-' + formDespacho)?.focus(); });
    el.querySelectorAll('[data-editar-passo]').forEach(b => b.onclick = () => {
      editandoPasso = editandoPasso === b.dataset.editarPasso ? null : b.dataset.editarPasso; formDespacho = null;
      desenharConteudo();
      (el.querySelector('#ep-o-' + editandoPasso) || el.querySelector(`[data-editar-passo="${b.dataset.editarPasso}"]`))?.focus();
    });
    el.querySelectorAll('form[data-editor]').forEach(ligarEditor);
    el.querySelectorAll('[data-resposta]').forEach(b => b.onclick = () => chegouResposta(proc.despachos.find(a => a.id === b.dataset.resposta)));
    el.querySelectorAll('form[data-form]').forEach(f => {
      const x = I(f.dataset.form), campo = f.elements.setor, erro = campo.parentElement.querySelector('.erro');
      campo.oninput = () => { campo.removeAttribute('aria-invalid'); erro.hidden = true; };
      f.querySelector('[data-cancelar]').onclick = () => { formDespacho = null; desenharConteudo(); };
      f.onsubmit = e => {
        e.preventDefault();
        if (!campo.value.trim()) { campo.setAttribute('aria-invalid', 'true'); erro.hidden = false; campo.focus(); return; }
        const rel = (f.elements.seiRel.value || '').trim();
        if (rel) proc.seis.push({ id: 's' + A.uid(), tipo: tipoSeiDe(x.i.nome), numero: A.seiGuardar(rel), desc: x.i.nome, f: x.f.id });
        salvarDespacho(x.i, campo.value.trim(), f.elements.texto.value.trim(), f.elements.data.value || A.hojeIso());
      };
    });
    el.querySelectorAll('[data-na]').forEach(cb => cb.onchange = () => {
      const f = F(cb.dataset.na), antes = f.na;
      if (cb.checked && f.itens.some(i => i.obrig && !i.na)) {
        const motivo = prompt(`"${f.nome}" tem passo obrigatório. Por que não se aplica a este processo?`);
        if (!motivo || !motivo.trim()) { cb.checked = false; return; }
        A.anotar(proc, 'Sistema', `${f.nome}: não se aplica. Motivo: ${motivo.trim()}`);
      }
      f.na = cb.checked; if (f.na) abertas.delete(f.id); else abertas.add(f.id);
      A.anotar(proc, 'Sistema', `${f.nome}: ${f.na ? 'marcada como não se aplica' : 'voltou a fazer parte do processo'}.`);
      salvarE();
      A.avisar(f.na ? `${f.nome} marcada como "não se aplica".` : `${f.nome} voltou para o processo.`, () => { f.na = antes; proc.diario.pop(); });
    });
    el.querySelectorAll('[name^=fin-]').forEach(r => r.onchange = () => {
      proc.financeiro = r.value;
      A.anotar(proc, 'Sistema', r.value ? `Resposta do financeiro: ${A.RESPOSTA_FIN[r.value].toLowerCase()}.` : 'Resposta do financeiro ainda não chegou.');
      salvarE();
    });
    el.querySelectorAll('[data-sugestao]').forEach(b => b.onclick = () => {
      const [fid, k] = b.dataset.sugestao.split('|'), fr = F(fid), s = A.sugestoesDe(proc, fr)[+k]; if (!s) return;
      const novo = { id: 'i' + A.uid(), modeloId: null, nome: s.nome, regra: { dias: s.dias || 7, quando: 'antes', ref: proc.inicio ? 'inicio' : 'limite' }, estado: 'aberta', coluna: null, na: false, editado: true };
      fr.itens.push(novo);
      A.anotar(proc, 'Sistema', `Passo sugerido adicionado em ${fr.nome}: ${novo.nome}.`);
      salvarE();
      A.avisar(`"${novo.nome}" entrou na lista.`, () => { fr.itens = fr.itens.filter(t => t !== novo); proc.diario.pop(); salvarE(); });
    });
    el.querySelectorAll('[data-tudo]').forEach(b => b.onclick = () => {
      const fr = F(b.dataset.tudo), abertos = fr.itens.filter(i => !i.na && i.estado !== 'feita');
      const antes = abertos.map(i => [i, i.estado, i.feitoEm]);
      abertos.forEach(i => { i.estado = 'feita'; i.feitoEm = A.hojeIso(); });
      A.anotar(proc, 'Sistema', `${fr.nome}: todos os passos marcados como feitos.`);
      salvarE();
      const n = abertos.length, s = n > 1 ? 's' : '';
      A.avisar(`${fr.nome}: ${n} passo${s} marcado${s} como feito${s}.`, () => { antes.forEach(([i, e, d]) => { i.estado = e; i.feitoEm = d; }); proc.diario.pop(); salvarE(); });
    });
    el.querySelectorAll('[data-novo]').forEach(b => b.onclick = () => {
      const id = b.dataset.novo, alvo = el.querySelector('#novo-' + id);
      alvo.innerHTML = `<form class="novo-passo entra" novalidate><label class="sr" for="np-${id}">Novo passo</label><input id="np-${id}" placeholder="Ex.: Confirmar o coffee break"><button class="btn" type="submit">Adicionar</button></form>`;
      const f = alvo.querySelector('form'), inp = f.querySelector('input'); inp.focus();
      inp.onkeydown = e => { if (e.key === 'Escape') { alvo.innerHTML = ''; b.focus(); } };
      f.onsubmit = e => {
        e.preventDefault();
        if (!inp.value.trim()) { inp.setAttribute('aria-invalid', 'true'); inp.placeholder = 'Escreva o passo antes de adicionar'; inp.focus(); return; }
        const fr = F(id), ref = proc.inicio ? 'inicio' : 'limite';
        const novo = { id: 'i' + A.uid(), modeloId: null, nome: inp.value.trim(), regra: { dias: 7, quando: 'antes', ref }, estado: 'aberta', coluna: null, na: false, editado: true };
        fr.itens.push(novo);
        A.anotar(proc, 'Sistema', `Passo adicionado em ${fr.nome}: ${novo.nome}.`);
        salvarE();
        A.avisar('Passo adicionado, com prazo de 7 dias antes. Use "Editar" para mudar.', () => { fr.itens = fr.itens.filter(t => t !== novo); proc.diario.pop(); });
      };
    });
    const nf = el.querySelector('#novaFrente');
    if (nf) nf.onclick = () => {
      const f = { id: 'f' + A.uid(), modeloId: null, nome: 'Nova frente', fase: 'prep', icone: 'lista', coluna: null, na: false, itens: [] };
      proc.frentes.push(f); abertas.add(f.id);
      A.anotar(proc, 'Sistema', 'Frente nova adicionada.');
      salvarE();
      A.avisar('Frente nova adicionada na Preparação. Para mudar o nome dela, use a Ficha em tabela.', () => { proc.frentes = proc.frentes.filter(x => x !== f); proc.diario.pop(); });
    };
  }

  /* ---------- Modo 2: cronograma ---------- */
  function estadoMarco(i) {
    if (i.estado === 'feita') return { c: 'var(--ok)', f: 'var(--ok)', ic: 'var(--sobre-cor)', i: 'check', n: 'feito' };
    if (i.estado === 'esperando') return { c: 'var(--atencao)', f: 'var(--atencao-bg)', ic: 'var(--atencao)', i: 'relogio', n: 'esperando resposta' };
    const p = prazo(i);
    if (p && A.dias(p) < 0) return { c: 'var(--critico)', f: 'var(--critico-bg)', ic: 'var(--critico)', i: 'alerta', n: 'atrasado' };
    return { c: 'var(--emdia)', f: 'var(--folha)', ic: 'var(--emdia)', i: '', n: 'a fazer' };
  }
  function desenharCronograma(el) {
    const datas = proc.frentes.flatMap(f => f.itens.map(prazo)).filter(Boolean).concat([proc.entrada, proc.inicio, proc.fim, proc.limite, A.hojeIso()].filter(Boolean)).sort();
    if (!A.dataRef(proc)) { el.innerHTML = `<section class="crono"><p class="vazio">Para ver o cronograma, cadastre a data do evento ou a data limite em "Editar dados do processo".</p></section>`; return; }
    const ini = A.somar(datas[0], -4), fim = A.somar(datas[datas.length - 1], 6), N = Math.max(A.entre(ini, fim), 1);
    CRONO = { ini, N };
    const pos = s => A.entre(ini, s) / N * 100;
    let meses = `<span class="mes-marca" style="left:0;border-left:0">${A.maiusc(A.d(ini).toLocaleDateString('pt-BR', { month: 'long' }))}</span>`, semanas = '';
    for (let x = new Date(A.d(ini).getFullYear(), A.d(ini).getMonth() + 1, 1); x <= A.d(fim); x.setMonth(x.getMonth() + 1)) meses += `<span class="mes-marca" style="left:${pos(A.iso(x))}%">${A.maiusc(x.toLocaleDateString('pt-BR', { month: 'long' }))}</span>`;
    for (let k = 0; k <= N; k += 7) semanas += `<span class="semana-marca" style="left:${k / N * 100}%"></span>`;
    const linhas = fasesVisiveis().filter(fa => fa.id !== 'evento').map(fa => {
      const fr = proc.frentes.filter(f => f.fase === fa.id);
      return `<div class="crono-grupo"><span>${fa.n}</span><span></span></div>` + fr.map(f => {
        const [c, bg] = cor(f), e = A.estadoFrente(proc, f), fixa = !pode() || A.travada(proc, f) || f.na;
        const it = f.itens.filter(i => !i.na && prazo(i)), ps = it.map(prazo).sort();
        return `<div class="crono-linha${f.na ? ' na' : ''}">
          <div class="crono-rotulo"><span class="ico-f" style="--c:${c};--cbg:${bg}">${fic(f)}</span><span><span class="nome">${A.esc(f.nome)}</span><span class="sub" style="display:block">${A.ESTADO_FRENTE[e][0]}</span></span></div>
          <div class="trilho">${f.na ? '<span class="crono-na">Não se aplica a este processo</span>' : `
            ${ps.length ? `<span class="crono-faixa" style="--cbg:${bg};left:${pos(ps[0])}%;width:${Math.max(pos(ps[ps.length - 1]) - pos(ps[0]), 0.6)}%"></span>` : ''}
            ${it.map(i => { const m = estadoMarco(i); return `<button type="button" class="marco${fixa ? ' fixo' : ''}" data-marco="${i.id}" style="left:${pos(prazo(i))}%;--c:${m.c};--f:${m.f};--ic:${m.ic};view-transition-name:m-${i.id}" aria-label="${A.esc(i.nome)}, prazo ${A.fmt(prazo(i))}, ${m.n}.${fixa ? '' : ' Setas mudam a data; Enter edita.'}">${m.i ? A.ic(m.i) : ''}</button>`; }).join('')}`}
          </div></div>`;
      }).join('');
    }).join('');
    el.innerHTML = `<section class="crono" aria-labelledby="t-crono">
      <div class="crono-ajuda"><h2 id="t-crono" style="font-size:18px">Cronograma do processo</h2>
        <div class="crono-legenda" aria-label="Legenda"><span><i style="--c:var(--ok);--f:var(--ok)"></i>Feito</span><span><i style="--c:var(--emdia)"></i>A fazer</span><span><i style="--c:var(--atencao);--f:var(--atencao-bg)"></i>Esperando resposta</span><span><i style="--c:var(--critico);--f:var(--critico-bg)"></i>Atrasado</span></div></div>
      <p class="secundario" style="margin-bottom:8px">${pode() ? 'Passe o mouse num ponto para ver o passo. Arraste para mudar o prazo; clique para editar. No teclado: Tab até o ponto, setas mudam um dia (Shift + seta, uma semana).' : 'Só leitura: passe o mouse num ponto para ver o passo.'}</p>
      <div class="crono-rolagem"><div class="crono-grade" id="cronoGrade">
        <div class="crono-eixo"><span></span><div class="trilho">${meses}${semanas}</div></div>${linhas}
        <div class="crono-camada" aria-hidden="true">
          ${proc.inicio ? `<div class="evento-faixa" style="left:${pos(proc.inicio)}%;width:${Math.max(pos(A.somar(proc.fim || proc.inicio, 1)) - pos(proc.inicio), 0.5)}%"><span>Evento</span></div>` : proc.limite ? `<div class="evento-faixa" style="left:${pos(proc.limite)}%;width:${Math.max(pos(A.somar(proc.limite, 1)) - pos(proc.limite), 0.5)}%"><span>Data limite</span></div>` : ''}
          <div class="hoje-linha" style="left:${pos(A.hojeIso())}%"><span>hoje</span></div></div>
      </div></div></section>`;
    ligarCronograma(el);
  }
  function mostrarDica(m, i, txt) {
    esconderDicaMarco();
    const g = vistaEl.querySelector('#cronoGrade'), r = m.getBoundingClientRect(), gr = g.getBoundingClientRect();
    const d = document.createElement('div'); d.className = 'marco-dica'; d.id = 'marcoDica';
    d.innerHTML = `<strong>${A.esc(i.nome)}</strong>${txt || `Prazo ${A.fmt(prazo(i))} · ${estadoMarco(i).n}`}`;
    d.style.left = (r.left - gr.left + r.width / 2) + 'px'; d.style.top = (r.top - gr.top) + 'px';
    g.appendChild(d);
  }
  const esconderDicaMarco = () => document.getElementById('marcoDica')?.remove();
  const fecharEditorCrono = () => document.getElementById('cronoEditor')?.remove();
  A.fecharEditorCrono = fecharEditorCrono;
  function abrirEditorCrono(i, m) {
    fecharEditorCrono(); esconderDicaMarco();
    const g = vistaEl.querySelector('#cronoGrade'), r = m.getBoundingClientRect(), gr = g.getBoundingClientRect();
    const box = document.createElement('div'); box.className = 'crono-editor'; box.id = 'cronoEditor';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Editar passo');
    box.innerHTML = editorHTML(i);
    box.style.top = (r.bottom - gr.top + 8) + 'px'; box.style.left = Math.min(Math.max(r.left - gr.left - 170, 0), gr.width - 350) + 'px';
    g.appendChild(box);
    ligarEditor(box.querySelector('form'));
    box.querySelector('[data-cancelar-editor]').onclick = () => { fecharEditorCrono(); m.focus(); };
    box.querySelector('input').focus();
  }
  function ligarCronograma(el) {
    el.querySelectorAll('.marco').forEach(m => {
      const i = I(m.dataset.marco).i, fixo = m.classList.contains('fixo');
      m.onpointerenter = () => { if (!m.classList.contains('arrastando')) mostrarDica(m, i); };
      m.onpointerleave = () => { if (!m.classList.contains('arrastando')) esconderDicaMarco(); };
      m.onfocus = () => mostrarDica(m, i); m.onblur = esconderDicaMarco;
      m.onclick = e => { if (e.detail === 0 && !fixo) abrirEditorCrono(i, m); };
      m.onkeydown = e => {
        if (fixo || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault(); aplicarPrazo(i, A.somar(prazo(i), (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 7 : 1)));
      };
      if (fixo) return;
      let x0 = null, movendo = false, nova = null, rect = null;
      m.onpointerdown = e => { if (e.button !== 0) return; x0 = e.clientX; movendo = false; nova = null; rect = m.parentElement.getBoundingClientRect(); try { m.setPointerCapture(e.pointerId); } catch (x) {} };
      m.onpointermove = e => {
        if (x0 === null) return;
        if (!movendo && Math.abs(e.clientX - x0) > 4) { movendo = true; m.classList.add('arrastando'); fecharEditorCrono(); }
        if (!movendo) return;
        const idx = Math.min(Math.max(Math.round((e.clientX - rect.left) / rect.width * CRONO.N), 0), CRONO.N);
        nova = A.somar(CRONO.ini, idx); m.style.left = (idx / CRONO.N * 100) + '%';
        mostrarDica(m, i, `Novo prazo: ${A.fmt(nova)} (${A.maiusc(A.semana(nova))})`);
      };
      m.onpointerup = e => {
        if (x0 === null) return; x0 = null;
        try { m.releasePointerCapture(e.pointerId); } catch (x) {}
        if (movendo) { m.classList.remove('arrastando'); esconderDicaMarco(); if (nova) aplicarPrazo(i, nova); }
        else abrirEditorCrono(i, m);
      };
    });
  }

  /* ---------- Modo 3: ficha em tabela ---------- */
  function desenharFicha(el) {
    const linha = (f, i) => {
      const p = prazo(i), n = p ? A.dias(p) : null, trav = !pode() || A.travada(proc, f), desp = A.despachoAberto(proc, i);
      return `<tr data-i="${i.id}" class="${i.estado === 'feita' ? 'feita-linha' : ''}${linhaBrilho === i.id ? ' brilho' : ''}">
        <td class="col-feito"><input type="checkbox" data-k="${i.id}:feita" aria-label="Feito: ${A.esc(i.nome)}" ${i.estado === 'feita' ? 'checked' : ''} ${trav ? 'disabled' : ''}></td>
        <td class="col-passo"><input class="cel cel-passo" data-k="${i.id}:nome" value="${A.esc(i.nome)}" aria-label="Nome do passo" ${trav ? 'disabled' : ''}></td>
        <td style="width:150px"><input class="cel" type="date" data-k="${i.id}:prazo" value="${p || ''}" aria-label="Prazo de ${A.esc(i.nome)}" ${trav || !p ? 'disabled' : ''}>
          <span class="regra-dica ${i.estado === 'aberta' && n !== null && n < 0 ? 'atrasado-txt' : ''}">${i.estado === 'aberta' && n !== null && n < 0 ? `atrasado há ${-n} dias` : A.esc(A.regraTexto(i.regra))}</span></td>
        <td style="width:150px"><select class="cel" data-k="${i.id}:estado" aria-label="Situação de ${A.esc(i.nome)}" ${trav ? 'disabled' : ''}>${ESTADOS.map(([v, nm]) => `<option value="${v}" ${i.estado === v ? 'selected' : ''}>${nm}</option>`).join('')}</select></td>
        <td style="width:160px">${desp ? `<input class="cel" data-k="${i.id}:setor" value="${A.esc(desp.setor)}" list="lista-setores" aria-label="Com quem está: ${A.esc(i.nome)}" ${trav ? 'disabled' : ''}><span class="regra-dica">desde ${A.fmt(desp.enviado)}</span>` : '<span class="secundario" style="padding:0 8px">—</span>'}</td>
        <td class="col-coluna">${A.esc(i.coluna || f.coluna || 'só no seu controle')}</td></tr>`;
    };
    const corpo = fasesVisiveis().filter(fa => fa.id !== 'evento').map(fa => `<tbody><tr class="fase-linha"><th colspan="6" scope="rowgroup">${fa.n}</th></tr>` + proc.frentes.filter(f => f.fase === fa.id).map(f => {
      const [c, bg] = cor(f), e = A.estadoFrente(proc, f);
      return `<tr class="frente-linha"><th colspan="6" scope="colgroup"><div class="cab"><span class="ico-f" style="--c:${c};--cbg:${bg}">${fic(f)}</span>
          <input class="cel nome" style="max-width:280px;font-weight:800" data-k="frente:${f.id}" value="${A.esc(f.nome)}" aria-label="Nome da frente" ${pode() ? '' : 'disabled'}>${A.seloFrente(e)}
          <span class="direita" data-editar>${f.fase === 'inicio' ? '' : `<label class="chave"><input type="checkbox" data-k="na:${f.id}" ${f.na ? 'checked' : ''} ${e === 'travada' && !f.na ? 'disabled' : ''}> Não se aplica</label>`}
          ${f.na || e === 'travada' ? '' : `<button type="button" class="btn-texto" data-novo-ficha="${f.id}">${A.ic('mais', 'ic-sm')}Passo</button>`}</span></div></th></tr>` + (f.na ? '' : f.itens.filter(i => !i.na).map(i => linha(f, i)).join(''));
    }).join('') + '</tbody>').join('');
    el.innerHTML = `<section class="ficha-bloco" aria-labelledby="t-fdados">
        <div class="ficha-topo"><h2 id="t-fdados" style="font-size:18px">Dados do processo</h2><span class="salvo-barra" role="status">${A.ic('feito')}${ultimaFicha ? `Salvo. Última mudança: ${A.esc(ultimaFicha.desc)}. <button type="button" class="btn-texto" data-desfazer-ficha>Desfazer</button>` : 'Tudo salvo. Não precisa clicar em salvar.'}</span></div>
        <div class="grade-campos ficha-dados">${CAMPOS().filter(c => c[2] !== 'textarea').map(c => campoHTML(c, 'fd-', true)).join('')}</div></section>
      <section class="ficha-bloco" aria-labelledby="t-fpassos"><div class="ficha-topo"><h2 id="t-fpassos" style="font-size:18px">Passos de todas as frentes</h2><span class="secundario">Mude qualquer campo: salva sozinho quando você sai dele.</span></div>
        <div class="tabela-rolagem"><table class="tabela" style="min-width:900px"><thead><tr><th scope="col">Feito</th><th scope="col">Passo</th><th scope="col">Prazo</th><th scope="col">Situação</th><th scope="col">Com quem está</th><th scope="col">Coluna na planilha</th></tr></thead>${corpo}</table></div></section>`;
    linhaBrilho = null;
    el.onchange = e => { const k = e.target.dataset.k; if (k) aplicarFicha(k, e.target); };
    el.querySelectorAll('[data-novo-ficha]').forEach(b => b.onclick = () => {
      const f = F(b.dataset.novoFicha), novo = { id: 'i' + A.uid(), modeloId: null, nome: 'Novo passo', regra: { dias: 7, quando: 'antes', ref: proc.inicio ? 'inicio' : 'limite' }, estado: 'aberta', coluna: null, na: false, editado: true };
      f.itens.push(novo); linhaBrilho = novo.id;
      ultimaFicha = { desc: `passo novo em ${f.nome}`, desfazer: () => { f.itens = f.itens.filter(x => x !== novo); } };
      A.anotar(proc, 'Sistema', `Passo adicionado em ${f.nome}.`); A.salvar(); desenhar();
      const c = vistaEl.querySelector(`[data-k="${novo.id}:nome"]`); if (c) { c.focus(); c.select(); }
    });
    const df = el.querySelector('[data-desfazer-ficha]');
    if (df) df.onclick = () => { const u = ultimaFicha; ultimaFicha = null; u.desfazer(); A.salvar(); A.comFoco(desenhar); A.avisar(`Desfeito: ${u.desc}.`); };
  }
  function aplicarFicha(k, inp) {
    const [id, campo] = k.split(':');
    const erro = msg => { inp.setAttribute('aria-invalid', 'true'); A.avisar(msg); };
    let desc = '';
    if (id === 'dado') {
      const v = {}; CAMPOS().forEach(([c]) => v[c] = proc[c]); v[campo] = inp.value.trim();
      if (campo === 'inicio' && v.inicio && v.fim && v.fim < v.inicio) v.fim = A.somar(v.inicio, Math.max(A.entre(proc.inicio || v.inicio, proc.fim || v.inicio), 0));
      if (campo === 'inicio' && v.inicio && !v.fim) v.fim = v.inicio;
      const er = validar(v); if (er) { inp.value = proc[campo] || ''; return erro(er[1]); }
      const antes = A.clonar(proc);
      if (campo === 'sei') v.sei = A.seiGuardar(v.sei);
      if (campo === 'apoio' && A.lgpd()) v.apoio = A.iniciais(v.apoio);
      Object.assign(proc, v); if (campo === 'tipoId') completarComTipo();
      ultimaFicha = { desc: CAMPOS().find(c => c[0] === campo)[1].split(' (')[0].toLowerCase(), desfazer: () => { Object.keys(proc).forEach(x => delete proc[x]); Object.assign(proc, antes); } };
      desc = ultimaFicha.desc;
    } else if (id === 'na') {
      const f = F(campo), antes = f.na; f.na = inp.checked;
      ultimaFicha = { desc: `${f.nome} ${f.na ? 'marcada' : 'desmarcada'} como "não se aplica"`, desfazer: () => { f.na = antes; } };
    } else if (id === 'frente') {
      const f = F(campo), antes = f.nome;
      if (!inp.value.trim()) { inp.value = antes; return erro('A frente precisa de um nome.'); }
      f.nome = inp.value.trim();
      ultimaFicha = { desc: `nome da frente "${f.nome}"`, desfazer: () => { f.nome = antes; } };
    } else {
      const x = I(id); if (!x) return; const i = x.i; linhaBrilho = id;
      if (campo === 'nome') {
        if (!inp.value.trim()) { inp.value = i.nome; return erro('O nome do passo não pode ficar em branco.'); }
        const antes = i.nome; i.nome = inp.value.trim(); i.editado = true;
        ultimaFicha = { desc: `nome do passo "${i.nome}"`, desfazer: () => { i.nome = antes; } };
      } else if (campo === 'prazo') {
        if (!inp.value) { inp.value = prazo(i) || ''; return erro('Escolha uma data para o prazo.'); }
        const antes = { ...i.regra }; i.regra = A.regraDeData(proc, i, inp.value); i.editado = true;
        ultimaFicha = { desc: `prazo de "${i.nome}" para ${A.fmt(prazo(i))}`, desfazer: () => { i.regra = antes; } };
      } else if (campo === 'estado' || campo === 'feita') {
        const novo = campo === 'feita' ? (inp.checked ? 'feita' : 'aberta') : inp.value;
        const desfaz = A.setEstado(proc, i, novo);
        ultimaFicha = { desc: `"${i.nome}" agora está ${ESTADOS.find(e => e[0] === novo)[1].toLowerCase()}`, desfazer: desfaz };
      } else if (campo === 'setor') {
        const d = A.despachoAberto(proc, i), antes = d.setor; d.setor = inp.value.trim() || 'Não informado';
        ultimaFicha = { desc: `"${i.nome}" está com ${d.setor}`, desfazer: () => { d.setor = antes; } };
      }
    }
    A.anotar(proc, 'Sistema', `Ficha: ${desc || ultimaFicha.desc}.`);
    A.salvar(); A.comFoco(desenhar);
  }

  /* ---------- Lateral ---------- */
  function desenharLateral() {
    const el = vistaEl;
    const ls = el.querySelector('#listaSeis');
    ls.innerHTML = proc.seis.length ? proc.seis.map(s => `<li class="sei-item" style="view-transition-name:s-${s.id}"><span class="tipo">${A.esc(s.tipo)}</span>
        <span><button type="button" class="sei" data-sei="${A.esc(s.numero)}" title="Copiar o número completo">${A.ic('copiar', 'ic-sm')}${A.esc(/^\d{2}\./.test(s.numero) ? 'SEI ' + A.seiCurto(s.numero) : s.numero)}</button><span style="display:block;font-size:var(--t-sm)">${A.esc(s.desc || '')}</span></span>
        ${pode() ? `<button type="button" class="btn-icone" data-tirar="${s.id}" aria-label="Tirar ${A.esc(s.numero)} da lista">${A.ic('lixo')}</button>` : '<span></span>'}
        <span class="onde">${s.f && F(s.f) ? 'Frente: ' + A.esc(F(s.f).nome) : 'Processo inteiro'}</span></li>`).join('') : '<li class="secundario">Nenhum SEI relacionado ainda.</li>';
    A.ligarCopiaSei(ls);
    ls.querySelectorAll('[data-tirar]').forEach(b => b.onclick = () => {
      const s = proc.seis.find(x => x.id === b.dataset.tirar), pos = proc.seis.indexOf(s);
      proc.seis.splice(pos, 1); salvarE();
      A.avisar(`${s.tipo} ${A.seiCurto(s.numero)} tirado da lista.`, () => proc.seis.splice(pos, 0, s));
    });
    const fs = el.querySelector('#formSei');
    fs.innerHTML = formSei ? `<form class="form-mini" id="fSei" novalidate style="margin-top:8px">
        <div class="dois"><div class="campo"><label for="sTipo">Tipo</label><select id="sTipo">${TIPOS_SEI.map(t => `<option>${t}</option>`).join('')}</select></div>
          <div class="campo"><label for="sFrente">Ligado a</label><select id="sFrente"><option value="">Processo inteiro</option>${proc.frentes.map(f => `<option value="${f.id}">${A.esc(f.nome)}</option>`).join('')}</select></div></div>
        <div class="campo"><label for="sNum">Número</label><input id="sNum" placeholder="19.25.000000000.0000000/2026-00"><div class="erro" id="eNum" hidden>Escreva o número do SEI.</div></div>
        <div class="campo"><label for="sDesc">Para que serve <small>(opcional)</small></label><input id="sDesc" placeholder="Passagens do instrutor"></div>
        <div class="form-botoes"><button class="btn btn-primario" type="submit">Ligar este SEI</button><button class="btn" type="button" id="sCancelar">Cancelar</button></div></form>` : '';
    if (formSei) {
      const f = fs.querySelector('#fSei'), num = f.querySelector('#sNum'), er = f.querySelector('#eNum');
      num.oninput = () => { num.removeAttribute('aria-invalid'); er.hidden = true; };
      f.querySelector('#sCancelar').onclick = () => { formSei = false; desenharLateral(); el.querySelector('#addSei').focus(); };
      f.onsubmit = e => {
        e.preventDefault();
        const n = A.seiGuardar(num.value.trim());
        if (n.length < 3) { num.setAttribute('aria-invalid', 'true'); er.hidden = false; num.focus(); return; }
        const novo = { id: 's' + A.uid(), tipo: f.querySelector('#sTipo').value, numero: n, desc: f.querySelector('#sDesc').value.trim(), f: f.querySelector('#sFrente').value || null };
        proc.seis.unshift(novo); formSei = false;
        A.anotar(proc, 'Sistema', `${novo.tipo} ${A.seiCurto(n)} ligado ao processo.`);
        salvarE();
        A.avisar(`${novo.tipo} ${A.seiCurto(n)} ligado ao processo.`, () => { proc.seis = proc.seis.filter(x => x !== novo); proc.diario.pop(); });
      };
    }
    const pl = el.querySelector('#planilhaProc'), m = A.semPlanilha() ? [] : A.mudancas(proc);
    pl.innerHTML = !m.length ? `<p class="planilha-ok">${A.ic('feito')} A planilha já está igual ao que foi marcado aqui.</p>`
      : `<ul class="lista">${m.map(x => `<li class="mudanca entra"><span class="col">${x.col}</span><span class="de-para"><span class="de">${x.de}</span>${A.ic('seta-dir', 'ic-sm')}<span class="para">${x.para}</span></span></li>`).join('')}</ul>
        <div class="lat-botoes"><button class="btn" type="button" id="copiarMud">${A.ic('copiar')} Copiar a lista</button>${pode() ? `<button class="btn btn-primario" type="button" id="jaAtualizei">${A.ic('check')} Já atualizei a planilha</button>` : ''}</div>`;
    if (m.length) {
      pl.querySelector('#copiarMud').onclick = () => A.copiar(`Processo SEI ${proc.sei} (${proc.titulo})\n` + m.map(x => `- ${x.col}: ${x.de} -> ${x.para}`).join('\n'), 'Lista copiada. É só colar onde quiser.');
      const ja = pl.querySelector('#jaAtualizei');
      if (ja) ja.onclick = () => {
        const antes = { ...proc.naPlanilha };
        m.forEach(x => proc.naPlanilha[x.col] = x.para);
        A.anotar(proc, 'Planilha', `Planilha atualizada: ${m.map(x => x.col).join(', ')}.`);
        salvarE();
        A.avisar('Anotado: a planilha está em dia com este processo.', () => { proc.naPlanilha = antes; proc.diario.pop(); });
      };
    }
    el.querySelector('#diario').innerHTML = proc.diario.slice().reverse().slice(0, 30).map(x => `<li><span class="quando">${x.data === A.hojeIso() ? 'hoje' : A.fmt(x.data)}</span><span><span class="tipo-d">${A.esc(x.tipo)}</span><br>${A.esc(x.texto)}</span></li>`).join('');
  }

  /* ---------- Tudo ---------- */
  function desenharConteudo() {
    const el = vistaEl.querySelector('#fases');
    vistaEl.querySelector('#corpo').classList.toggle('largo', modo() !== 'frentes');
    if (modo() === 'cronograma') desenharCronograma(el); else if (modo() === 'ficha') desenharFicha(el); else if (modo() === 'lista') desenharLista(el); else desenharFases(el);
  }
  function desenhar() {
    if (!vistaEl || !vistaEl.isConnected || !A.estado.processos.includes(proc)) return;
    desenharTopo();
    desenharCaminho();
    A.menuModo(vistaEl.querySelector('#modoProc'), 'Forma de ver o processo', MODOS, modo(), v => { A.prefs().modoProc = v; editandoPasso = null; ultimaFicha = null; A.salvar(); desenhar(); });
    desenharConteudo();
    desenharLateral();
  }

  A.telaProcesso = (vista, id) => {
    proc = A.proc(id);
    vistaEl = vista;
    if (!proc || (proc.dono !== A.sessao.perfilId)) {
      vista.innerHTML = `<main class="estreito"><h1>Processo não encontrado</h1><p class="secundario" style="margin-top:8px">Ele pode ter sido tirado do sistema ou ser de outro painel.</p><p style="margin-top:16px"><a class="btn" href="#/painel">${A.ic('anterior')} Voltar ao painel</a></p></main>`;
      return;
    }
    if (procAnterior !== id) {
      // abre só o grupo da próxima tarefa sua, para não mostrar checklist demais de uma vez
      const prox = proc.frentes.filter(f => !f.na && !A.travada(proc, f)).flatMap(f => f.itens.filter(i => !i.na && i.estado !== 'feita' && i.quem !== 'acompanha').map(i => ({ f, p: A.prazo(proc, i) || '9999' }))).sort((a, b) => a.p < b.p ? -1 : 1)[0];
      abertas = new Set([...(prox ? [prox.f.id] : []), ...proc.frentes.filter(f => f.fase === 'inicio' && !f.na).map(f => f.id)]); // o checklist do Início fica sempre à vista
      formDespacho = null; editandoPasso = null; formSei = false; editandoDados = false; ultimaFicha = null; procAnterior = id; faseVista = null; formEnc = false; respondendo = null;
    }
    vista.innerHTML = `<main>
      <nav class="trilha" aria-label="Você está em"><a href="#/painel">${A.ic('anterior')}Painel</a><span aria-hidden="true">/</span><a href="#/processos">Processos</a><span aria-hidden="true">/</span><span aria-current="page" id="trilhaTitulo"></span></nav>
      <div id="faixaArquivar"></div>
      <section class="proc-topo" aria-labelledby="titulo"><div><div class="selos" id="selos"></div><h1 id="titulo"></h1><div class="meta" id="meta"></div></div><div class="contagem" id="contagem"></div></section>
      <dl class="fatos" id="fatos"></dl>
      <section class="editar-dados" id="editarDados" hidden aria-labelledby="t-editar"></section>
      <nav aria-label="Caminho do processo"><ol class="caminho" id="caminho"></ol></nav>
      <div class="barra-ver"><p class="secundario">Três jeitos de ver o mesmo processo.</p><div class="modo" id="modoProc"></div></div>
      <div class="corpo" id="corpo"><div id="fases"></div>
        <aside class="lado" aria-label="Informações do processo">
          <section aria-labelledby="t-seis"><div class="lat-topo"><h2 id="t-seis">SEIs relacionados</h2>${pode() ? `<button class="btn-texto" type="button" id="addSei">${A.ic('mais', 'ic-sm')}Adicionar</button>` : ''}</div>
            <p class="secundario">Processos ligados a este: deslocamento, DFD, pagamento…</p><div id="formSei"></div><ul class="lista" id="listaSeis" style="margin-top:8px"></ul></section>
          <section aria-labelledby="t-planilha" ${A.semPlanilha() ? 'hidden' : ''}><div class="lat-topo"><h2 id="t-planilha">Para atualizar na planilha</h2></div>
            <p class="secundario">O que mudou aqui e ainda não foi passado para a planilha do OneDrive.</p><div id="planilhaProc" style="margin-top:8px"></div></section>
          <section aria-labelledby="t-diario"><div class="lat-topo"><h2 id="t-diario">Diário do processo</h2></div>
            ${pode() ? `<form class="nota" id="formNota" novalidate><label class="sr" for="txtNota">Escrever uma anotação</label><textarea id="txtNota" placeholder="Anotar algo: um telefonema, um combinado, uma pendência…"></textarea><button class="btn" type="submit">${A.ic('mais')}Anotar</button></form>` : ''}
            <ul class="lista diario" id="diario"></ul></section>
        </aside></div>
    </main>`;
    const add = vista.querySelector('#addSei');
    if (add) add.onclick = () => { formSei = !formSei; desenharLateral(); if (formSei) vista.querySelector('#sTipo').focus(); };
    const fn = vista.querySelector('#formNota');
    if (fn) fn.onsubmit = e => {
      e.preventDefault();
      const ta = vista.querySelector('#txtNota');
      if (!ta.value.trim()) { ta.setAttribute('aria-invalid', 'true'); ta.placeholder = 'Escreva a anotação antes de salvar.'; ta.focus(); return; }
      ta.removeAttribute('aria-invalid');
      A.anotar(proc, 'Anotação', ta.value.trim()); ta.value = '';
      salvarE(desenharLateral);
      A.avisar('Anotação salva no diário.');
    };
    desenhar();
  };
})(window.App);
