/* Tela de um processo: fases, frentes, passos, despachos, SEIs relacionados, planilha e diário. */
(function (A) {
  const MODOS = [
    { v: 'frentes', t: 'Fases e frentes', d: 'Cada frente num cartão, com os passos dentro.', ic: 'cartoes' },
    { v: 'cronograma', t: 'Cronograma', d: 'O processo inteiro numa linha do tempo. Arraste um passo para mudar o prazo.', ic: 'v-crono' },
    { v: 'ficha', t: 'Ficha em tabela', d: 'Tudo numa tabela, como a planilha. Edite direto: salva sozinho.', ic: 'v-tabela' },
  ];
  const ESTADOS = [['aberta', 'A fazer'], ['esperando', 'Esperando resposta'], ['feita', 'Feito']];
  const TIPOS_SEI = ['Deslocamento', 'Portaria', 'DFD', 'TR', 'Apoio', 'Pagamento', 'Certificados', 'Outro'];
  const SUB_FASE = { inicio: 'Ver se estava previsto, abrir o processo e dar o primeiro despacho.', prep: 'Depois de aprovado, cada frente anda ao mesmo tempo, com seu próprio despacho.', evento: '', pos: 'Depois do evento: certificados, exonerados e pagamentos.', fim: 'Os últimos lançamentos antes de fechar o processo.' };

  let proc = null, vistaEl = null;
  let abertas = new Set(), formDespacho = null, editandoPasso = null, formSei = false, editandoDados = false, ultimaFicha = null, linhaBrilho = null, procAnterior = null;
  let CRONO = null;

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
    const p = prazo(i); if (!p) return 'sem data';
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
    if (!A.aprovado(proc)) return 'inicio';
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
    return `<li class="tarefa${i.estado === 'feita' ? ' feita' : ''}" data-i="${i.id}" style="view-transition-name:t-${i.id}">
      <input type="checkbox" id="cb-${i.id}" ${i.estado === 'feita' ? 'checked' : ''} ${bloqueada ? 'disabled' : ''}>
      <label class="o-que" for="cb-${i.id}">${A.esc(i.nome)}</label>
      <span class="prazo ${cls}" title="${A.esc(A.regraTexto(i.regra))}">${quando(i)}</span>
      ${bloqueada ? '' : `<div class="linha2">${i.estado === 'aberta' ? `<button type="button" class="btn-texto" data-despachar="${i.id}">${A.ic('enviar', 'ic-sm')}Despachei</button>` : ''}<button type="button" class="btn-texto" data-editar-passo="${i.id}" aria-expanded="${editandoPasso === i.id}">${A.ic('lapis', 'ic-sm')}Editar</button>${(i.coluna || f.coluna) && i.estado === 'aberta' ? `<span>Vai para a coluna "${i.coluna || f.coluna}"</span>` : ''}</div>`}
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

  /* ---------- Topo ---------- */
  function desenharTopo() {
    const s = A.situacao(proc), el = vistaEl;
    el.querySelector('#selos').innerHTML = `${proc.arquivado ? `<span class="selo carimbo" style="--c:var(--neutro);--cbg:var(--neutro-bg)">${A.ic('arquivo-ic')}Arquivado${proc.situacaoPlanilha ? ': ' + A.esc(proc.situacaoPlanilha) : ''}</span>` : A.seloSit(s)}${!proc.arquivado && A.conflitosSala(proc).length ? `<span class="selo" style="--c:var(--critico);--cbg:var(--critico-bg)" title="${A.esc(A.conflitosSala(proc).map(A.textoConflito).join(' '))}">${A.ic('alerta')}Conflito de sala</span>` : ''}${A.classeTexto(proc) ? `<span class="etiqueta etiqueta-classe">${A.esc(A.classeTexto(proc))}</span>` : `<button type="button" class="selo" id="classificar" style="--c:var(--atencao);--cbg:var(--atencao-bg)" data-editar>${A.ic('alerta')}Classificar: interno ou externo?</button>`}<span class="etiqueta">${A.esc(proc.tipoNome || '')}</span>${proc.modalidade ? `<span class="etiqueta">${A.esc(proc.modalidade)}</span>` : ''}`;
    el.querySelector('#titulo').textContent = proc.titulo;
    el.querySelector('#trilhaTitulo').textContent = proc.titulo;
    document.title = `${proc.titulo} — Meus processos`;
    el.querySelector('#meta').innerHTML = `${proc.sei ? `<button type="button" class="sei" data-sei="${A.esc(proc.sei)}" title="Copiar o número completo">${A.ic('copiar', 'ic-sm')}SEI ${A.esc(A.seiCurto(proc.sei))}</button>` : '<span>Sem número SEI</span>'}
      ${proc.unidade ? `<span>Pedido por ${A.esc(proc.unidade)}</span>` : ''}${proc.entrada ? `<span>Chegou ao setor em ${A.fmt(proc.entrada)}</span>` : ''}
      <button type="button" class="btn-texto" id="btnEditarDados" data-editar aria-expanded="${editandoDados}" aria-controls="editarDados">${A.ic('lapis', 'ic-sm')}Editar dados do processo</button>`;
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
    if (!el.dataset.classificar) el.dataset.classificar = '1', el.addEventListener('click', e => { if (e.target.closest('#classificar')) { editandoDados = true; desenharDados(); const c = vistaEl.querySelector('[name=ambito]'); if (c) { c.scrollIntoView({ block: 'center' }); c.focus(); } } });
    desenharDados();
  }

  /* ---------- Editar dados ---------- */
  const CAMPOS = () => [
    ['titulo', 'Nome do curso ou evento', 'text', 'largo'], ['sei', 'Número do processo SEI', 'text'],
    ['ambito', 'Onde acontece', 'select', '', [['', '— escolha —'], ['interno', 'Interno: a escola promove'], ['externo', 'Externo: o servidor vai a evento de fora']]],
    ['publico', 'Para quem', 'select', '', [['', '— escolha —'], ...Object.entries(A.PUBLICOS)]],
    ['tipoId', 'Tipo', 'select', '', A.regras(proc.dono).tipos.map(t => [t.id, t.nome])],
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
    el.querySelector('#edApagar').onclick = () => {
      const lista = A.estado.processos, pos = lista.indexOf(proc), p = proc;
      lista.splice(pos, 1); A.salvar();
      location.hash = '#/processos';
      A.avisar(`"${p.titulo}" tirado do sistema.`, () => { lista.splice(pos, 0, p); });
    };
    el.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const f = e.target, v = {};
      CAMPOS().forEach(([k]) => v[k] = f.elements[k].value.trim());
      if (v.inicio && !v.fim) v.fim = v.inicio;
      f.querySelectorAll('[aria-invalid]').forEach(x => { x.removeAttribute('aria-invalid'); x.parentElement.querySelector('.erro').hidden = true; });
      const er = validar(v);
      if (er) { const c = f.elements[er[0]]; c.setAttribute('aria-invalid', 'true'); const m = c.parentElement.querySelector('.erro'); m.textContent = er[1]; m.hidden = false; c.focus(); return; }
      const antes = A.clonar(proc);
      const mudouTipo = v.tipoId !== proc.tipoId, mudouAmbito = v.ambito !== (proc.ambito || '');
      v.sei = A.seiGuardar(v.sei);
      if (A.lgpd()) v.apoio = A.iniciais(v.apoio);
      Object.assign(proc, v);
      if (mudouTipo) completarComTipo();
      if (mudouTipo || mudouAmbito) A.aplicarAmbito(proc);
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
      if (fa.id === 'inicio' && proc.previsto === false) { total += 3; feitas += (proc.portao || []).filter(Boolean).length; }
      const pronta = total && feitas === total, cls = fa.id === atual ? 'atual' : pronta ? 'pronta' : '';
      const d = fa.id === 'evento' ? `${A.fmt(proc.inicio)}${proc.fim && proc.fim !== proc.inicio ? ' a ' + A.fmt(proc.fim) : ''}` : fa.d;
      const cont = fa.id === 'evento' ? (A.dias(proc.inicio) > 0 ? `em ${A.dias(proc.inicio)} dias` : A.dias(proc.fim || proc.inicio) >= 0 ? 'acontecendo' : 'aconteceu') : `${feitas} de ${total}`;
      return `<li class="${cls}"><button type="button" data-ir="${fa.id}" ${fa.id === atual ? 'aria-current="step"' : ''}>
        <span class="n"><span>${i + 1}. ${pronta ? A.ic('check', 'ic-sm') + 'pronta' : fa.id === atual ? 'agora' : ''}</span><span>${cont}</span></span>
        <span class="t">${fa.n}</span><span class="d">${d}</span>
        <span class="barra-c" aria-hidden="true"><i style="transform:scaleX(${total ? feitas / total : 0})"></i></span></button></li>`;
    }).join('');
    ol.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => {
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
        ${f.na ? `<p class="na-txt">Marcada como "não se aplica". Na planilha, fica cinza.</p>` : `<ul class="tarefas">${it.map(i => linhaTarefa(f, i)).join('') || '<li class="vazio">Nenhum passo. Use "Adicionar passo".</li>'}</ul>`}
        ${seisF.length ? `<div class="seis-frente">${seisF.map(s => `<span class="sei-chip">${A.esc(s.tipo)} ${A.esc(A.seiCurto(s.numero))}</span>`).join('')}</div>` : ''}
        <div class="frente-pe" data-editar>
          ${f.fase === 'inicio' ? '<span></span>' : `<label class="chave"><input type="checkbox" data-na="${f.id}" ${f.na ? 'checked' : ''} ${e === 'travada' && !f.na ? 'disabled' : ''}> Não se aplica a este processo</label>`}
          ${f.na || e === 'travada' ? '' : `<button type="button" class="btn-texto" data-novo="${f.id}">${A.ic('mais', 'ic-sm')}Adicionar passo</button>`}
        </div><div id="novo-${f.id}"></div>
      </div></div></div></article>`;
  }
  function portaoHTML() {
    const tipo = A.tipo(proc);
    if (tipo && !tipo.aprovacao && proc.previsto !== false) return '';
    const ok = A.aprovado(proc), dis = pode() ? '' : 'disabled';
    const passos = ['Fazer as estimativas de custo', 'Enviar para a unidade superior', 'Unidade orçamentária confirma que há dinheiro'];
    return `<div class="portao" style="view-transition-name:portao">
      <div class="pergunta"><div><h3>Estava previsto no plano?</h3><p class="secundario">Se não estava, precisa de aprovação antes de começar as outras frentes.</p></div>
        <div class="segmento" role="radiogroup" aria-label="Estava previsto no plano?">
          <label><input type="radio" name="previsto" value="sim" ${proc.previsto !== false ? 'checked' : ''} ${dis}><span>Sim</span></label>
          <label><input type="radio" name="previsto" value="nao" ${proc.previsto === false ? 'checked' : ''} ${dis}><span>Não</span></label></div></div>
      ${proc.previsto !== false ? '' : `<ul class="tarefas entra" style="margin-top:12px">${passos.map((p, i) => `<li class="tarefa${proc.portao[i] ? ' feita' : ''}"><input type="checkbox" id="pt-${i}" data-portao="${i}" ${proc.portao[i] ? 'checked' : ''} ${dis}><label class="o-que" for="pt-${i}">${p}</label><span class="prazo">${proc.portao[i] ? 'feito' : ''}</span></li>`).join('')}</ul>`}
      <p class="liberado${ok ? '' : ' nao'}">${ok ? A.ic('feito') + ' Liberado: as frentes da preparação podem andar ao mesmo tempo.' : A.ic('cadeado') + ' Esperando a aprovação. As frentes da preparação ficam travadas.'}</p></div>`;
  }
  function desenharFases(el) {
    el.innerHTML = fasesVisiveis().map((fa, i) => {
      const fr = proc.frentes.filter(f => f.fase === fa.id);
      let corpo = '';
      if (fa.id === 'evento') corpo = `<div class="portao"><p><strong>${A.fmt(proc.inicio)}${proc.fim && proc.fim !== proc.inicio ? ' a ' + A.fmt(proc.fim) : ''}</strong>${proc.horario ? ', ' + A.esc(proc.horario) : ''}${proc.local ? ', ' + A.esc(proc.local) : ''}.</p><p class="secundario" style="margin-top:4px">${A.dias(proc.inicio) > 0 ? `Faltam ${A.dias(proc.inicio)} dias. Os prazos das outras fases são contados a partir destas datas.` : 'O evento já começou.'}</p></div>`;
      else corpo = (fa.id === 'inicio' ? portaoHTML() : '') + `<div class="frentes">${fr.map(frenteHTML).join('')}</div>`;
      return `<section class="fase" id="fase-${fa.id}" aria-labelledby="h-${fa.id}"><div class="fase-topo"><h2 id="h-${fa.id}">${i + 1}. ${fa.n}</h2>${SUB_FASE[fa.id] ? `<p class="secundario">${SUB_FASE[fa.id]}</p>` : ''}</div>${corpo}</section>`;
    }).join('') + (pode() ? `<div class="form-botoes" style="margin-top:24px"><button type="button" class="btn" id="novaFrente">${A.ic('mais')}Adicionar uma frente a este processo</button></div>` : '');
    ligarFases(el);
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
        salvarDespacho(x.i, campo.value.trim(), f.elements.texto.value.trim(), f.elements.data.value || A.hojeIso());
      };
    });
    el.querySelectorAll('[data-na]').forEach(cb => cb.onchange = () => {
      const f = F(cb.dataset.na), antes = f.na;
      f.na = cb.checked; if (f.na) abertas.delete(f.id); else abertas.add(f.id);
      A.anotar(proc, 'Sistema', `${f.nome}: ${f.na ? 'marcada como não se aplica' : 'voltou a fazer parte do processo'}.`);
      salvarE();
      A.avisar(f.na ? `${f.nome} marcada como "não se aplica".` : `${f.nome} voltou para o processo.`, () => { f.na = antes; proc.diario.pop(); });
    });
    el.querySelectorAll('[name=previsto]').forEach(r => r.onchange = () => {
      proc.previsto = r.value === 'sim';
      A.anotar(proc, 'Sistema', proc.previsto ? 'Marcado como previsto no plano.' : 'Marcado como não previsto: precisa de aprovação.');
      salvarE();
    });
    el.querySelectorAll('[data-portao]').forEach(cb => cb.onchange = () => {
      const i = +cb.dataset.portao, antes = A.aprovado(proc);
      proc.portao[i] = cb.checked;
      if (!antes && A.aprovado(proc)) { A.anotar(proc, 'Sistema', 'Aprovado. As frentes da preparação foram liberadas.'); A.avisar('Aprovado! As frentes da preparação foram liberadas.'); }
      salvarE();
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
    if (modo() === 'cronograma') desenharCronograma(el); else if (modo() === 'ficha') desenharFicha(el); else desenharFases(el);
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
      abertas = new Set(proc.frentes.filter(f => !f.na && f.itens.some(i => !i.na && i.estado !== 'feita')).map(f => f.id));
      formDespacho = null; editandoPasso = null; formSei = false; editandoDados = false; ultimaFicha = null; procAnterior = id;
    }
    vista.innerHTML = `<main>
      <nav class="trilha" aria-label="Você está em"><a href="#/painel">${A.ic('anterior')}Painel</a><span aria-hidden="true">/</span><a href="#/processos">Processos</a><span aria-hidden="true">/</span><span aria-current="page" id="trilhaTitulo"></span></nav>
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
