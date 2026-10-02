/* Dados do sistema: onde ficam guardados e as contas de prazo e situação.
   Tudo fica neste computador, no armazenamento do navegador. Nada vai para a internet. */
(function (A) {
  const CHAVE = 'meus-processos-v1';

  /* As 9 colunas de acompanhamento da planilha do setor */
  A.COLUNAS = ['Instrução do processo', 'Instrução financeira', 'Deslocamento / Portaria', 'Setor de comunicação',
    'Planilha de exonerados', 'Certificados apresentados', 'Certificados emitidos', 'FUNDIMPER', 'THEMA'];

  A.FASES = [
    { id: 'inicio', n: 'Início', d: 'Instrução e aprovação' },
    { id: 'prep', n: 'Preparação', d: 'Frentes em paralelo' },
    { id: 'evento', n: 'Evento', d: '' },
    { id: 'pos', n: 'Pós-evento', d: 'Certificados e pagamentos' },
    { id: 'fim', n: 'Encerramento', d: 'Lançamentos finais' },
  ];
  A.ICONES = {
    pasta: ['#2446A8', '#E4EAF8'], moeda: ['#2B6B4E', '#DDEEE5'], contrato: ['#1F5E73', '#DDEEF3'], aviao: ['#7A2E5A', '#F4E1EC'],
    predio: ['#8A5E0E', '#F5EAD2'], megafone: ['#B3302A', '#F8E3E1'], certificado: ['#2446A8', '#E4EAF8'], arquivo: ['#4F5B66', '#E4E9E7'],
    pessoa: ['#1F5E73', '#DDEEF3'], lista: ['#4F5B66', '#E4E9E7'],
  };
  A.CORES_PERFIL = [['#2446A8', '#E4EAF8'], ['#2B6B4E', '#DDEEE5'], ['#8A5E0E', '#F5EAD2'], ['#7A2E5A', '#F4E1EC'], ['#1F5E73', '#DDEEF3'], ['#B3302A', '#F8E3E1'], ['#4F5B66', '#E4E9E7']];

  /* ---------- Guardar e carregar ---------- */
  const novoEstado = () => ({ versao: 1, criadoEm: new Date().toISOString(), perfis: [], regras: {}, processos: [], prefs: {}, leituras: {} });
  A.carregar = () => {
    try {
      const s = localStorage.getItem(CHAVE);
      A.estado = s ? JSON.parse(s) : novoEstado();
      A.armazenamentoOk = true;
    } catch (e) { A.estado = novoEstado(); A.armazenamentoOk = false; }
    A.migrar();
  };
  A.migrar = () => {
    const e = A.estado;
    ['perfis', 'processos'].forEach(k => { if (!Array.isArray(e[k])) e[k] = []; });
    ['regras', 'prefs', 'leituras', 'config'].forEach(k => { if (!e[k] || typeof e[k] !== 'object') e[k] = {}; });
    if (e.config.lgpd === undefined) e.config.lgpd = true;
    e.perfis.forEach(p => { if (!e.regras[p.id]) e.regras[p.id] = A.regrasPadrao(); });
  };
  A.modo = 'local';
  let timer = null;
  A.salvar = () => {
    if (A.modo === 'nuvem') { A.nuvem.agendar(); return; }
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(CHAVE, JSON.stringify(A.estado)); A.salvoEm = new Date(); A.armazenamentoOk = true; }
      catch (e) { A.armazenamentoOk = false; A.avisar('Não deu para salvar neste navegador. Baixe uma cópia de segurança na tela Planilha.'); }
    }, 250);
  };
  A.salvarJa = () => {
    if (!A.estado) return; // ainda na tela de entrada: nada para guardar
    if (A.modo === 'nuvem') { A.nuvem.gravar(); return; }
    clearTimeout(timer); try { localStorage.setItem(CHAVE, JSON.stringify(A.estado)); } catch (e) {}
  };
  A.exportar = () => JSON.stringify({ ...A.estado, exportadoEm: new Date().toISOString() }, null, 1);
  A.importar = texto => {
    const o = JSON.parse(texto);
    if (!o || !Array.isArray(o.processos) || !Array.isArray(o.perfis)) throw new Error('Este arquivo não é uma cópia de segurança do Meus processos.');
    A.estado = o; A.migrar(); A.salvarJa();
  };
  /* Traz uma cópia de segurança (por exemplo, da versão do arquivo) para o seu painel online.
     Os processos entram no seu painel; os que já existem (mesmo SEI) são atualizados. */
  A.importarNaNuvem = texto => {
    const o = JSON.parse(texto);
    if (!o || !Array.isArray(o.processos) || !Array.isArray(o.perfis)) throw new Error('Este arquivo não é uma cópia de segurança do Meus processos.');
    const eu = A.nuvem.eu, conta = id => o.processos.filter(p => p.dono === id).length;
    const origem = o.perfis.slice().sort((a, b) => conta(b.id) - conta(a.id))[0];
    if (!origem) throw new Error('A cópia não tem nenhum perfil.');
    const antes = { processos: A.estado.processos.slice(), conteudo: A.estado.processos.map(p => A.clonar(p)), regras: A.clonar(A.estado.regras[eu] || null), prefs: A.clonar(A.estado.prefs[eu] || null), leituras: A.clonar(A.estado.leituras[eu] || null), perfis: A.estado.perfis.slice() };
    let novos = 0, atualizados = 0;
    o.processos.filter(p => p.dono === origem.id).forEach(p => {
      const c = A.clonar(p);
      c.dono = eu; c.sei = A.seiLgpd(c.sei); c.apoio = A.iniciais(c.apoio); c.observacoes = '';
      const chave = A.seiChave(c.sei);
      const igual = A.estado.processos.find(x => x.id === c.id || (x.dono === eu && chave.length >= 11 && A.seiChave(x.sei) === chave));
      if (igual) { const id = igual.id; Object.keys(igual).forEach(k => delete igual[k]); Object.assign(igual, c, { id }); atualizados++; }
      else { A.estado.processos.push(c); novos++; }
    });
    if (o.regras && o.regras[origem.id]) A.estado.regras[eu] = A.clonar(o.regras[origem.id]);
    if (o.prefs && o.prefs[origem.id]) A.estado.prefs[eu] = A.clonar(o.prefs[origem.id]);
    if (o.leituras && o.leituras[origem.id]) A.estado.leituras[eu] = A.clonar(o.leituras[origem.id]);
    let meu = A.perfil(eu);
    if (!meu) { meu = { id: eu, ini: origem.ini, funcao: origem.funcao, cor: origem.cor, bg: origem.bg, aba: origem.aba || '', lembrete: origem.lembrete || { ativo: true, hora: '17:00' }, criadoEm: new Date().toISOString() }; A.estado.perfis.push(meu); }
    else if (origem.aba && !meu.aba) meu.aba = origem.aba;
    A.salvar();
    const desfazer = () => {
      A.estado.processos.splice(0, A.estado.processos.length, ...antes.processos);
      antes.processos.forEach((p, i) => { Object.keys(p).forEach(k => delete p[k]); Object.assign(p, antes.conteudo[i]); });
      if (antes.regras) A.estado.regras[eu] = antes.regras; if (antes.prefs) A.estado.prefs[eu] = antes.prefs; if (antes.leituras) A.estado.leituras[eu] = antes.leituras;
      A.estado.perfis.splice(0, A.estado.perfis.length, ...antes.perfis);
    };
    return { novos, atualizados, desfazer };
  };

  /* ---------- LGPD: guardar só o necessário ---------- */
  A.lgpd = () => A.estado.config.lgpd !== false;
  const digitos = s => String(s || '').replace(/\D/g, '');
  /* Chave para achar o processo: os últimos 11 dígitos do número SEI */
  A.seiChave = s => digitos(s).slice(-11);
  /* Número SEI reduzido aos últimos 11 dígitos: 00000/AAAA-DV */
  A.seiLgpd = s => { const d = digitos(s); if (d.length < 11) return String(s || '').trim(); const l = d.slice(-11); return `${l.slice(0, 5)}/${l.slice(5, 9)}-${l.slice(9)}`; };
  A.seiGuardar = s => A.lgpd() ? A.seiLgpd(s) : String(s || '').trim();

  /* ---------- Perfis e sessão ---------- */
  A.perfil = id => A.estado.perfis.find(p => p.id === id);
  A.sessao = null;
  try { A.sessao = JSON.parse(sessionStorage.getItem('mp-sessao') || 'null'); } catch (e) {}
  A.entrarComo = (perfilId, acesso) => { A.sessao = { perfilId, acesso }; try { sessionStorage.setItem('mp-sessao', JSON.stringify(A.sessao)); } catch (e) {} };
  A.sair = () => { A.sessao = null; try { sessionStorage.removeItem('mp-sessao'); } catch (e) {} };
  A.podeEditar = () => !!A.sessao && A.sessao.acesso !== 'leitura' && !(A.modo === 'nuvem' && A.nuvem.podeEscrever === false);
  /* Quem está usando agora (nuvem: a conta do Claude; arquivo: o perfil que entrou) */
  A.euId = () => A.modo === 'nuvem' ? A.nuvem.eu : (A.sessao && A.sessao.perfilId);
  /* Na versão publicada para a equipe não existe planilha: o sistema é a fonte */
  /* Regras de quem cria o perfil agora: o padrão da equipe (definido pela administração), ou o do sistema */
  A.regrasNovas = () => A.estado.equipe && A.estado.equipe.regras && A.estado.equipe.regras.tipos ? A.clonar(A.estado.equipe.regras) : A.regrasPadrao();
  /* ---------- Salas e conflitos ---------- */
  A.normSala = s => A.semAcento(s).replace(/\s+/g, ' ');
  const naoSala = s => !s || /on-?line|teams|meet|zoom|remot|a definir/.test(s);
  A.salas = () => {
    const fixas = (A.estado.equipe && A.estado.equipe.salas && A.estado.equipe.salas.lista) || [];
    const usadas = A.estado.processos.map(p => (p.local || '').trim()).filter(Boolean);
    const vistas = new Map();
    [...fixas, ...usadas].forEach(s => { const k = A.normSala(s); if (!naoSala(k) && !vistas.has(k)) vistas.set(k, s); });
    return [...vistas.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  };
  /* "08:30 às 12:00", "8h - 12h" → minutos de início e fim (null se não der para ler) */
  A.horasDe = txt => {
    const t = String(txt || '').toLowerCase().match(/(\d{1,2})\s*(?:[:h]\s*(\d{2}))?/g);
    if (!t) return null;
    const m = x => { const r = x.match(/(\d{1,2})\s*(?:[:h]\s*(\d{2}))?/); const h = +r[1], mm = +(r[2] || 0); return h < 24 && mm < 60 ? h * 60 + mm : null; };
    const a = m(t[0]), b = t[1] ? m(t[1]) : null;
    return a == null ? null : { ini: a, fim: b != null && b > a ? b : a + 120 };
  };
  /* Outros processos no mesmo local, em dias e horários que se cruzam */
  A.conflitosSala = p => {
    const local = A.normSala(p.local);
    if (naoSala(local) || !p.inicio) return [];
    const fim = p.fim || p.inicio, h = A.horasDe(p.horario);
    return A.estado.processos.filter(o => o.id !== p.id && !o.arquivado && o.inicio && A.normSala(o.local) === local
      && o.inicio <= fim && (o.fim || o.inicio) >= p.inicio
      && (() => { const ho = A.horasDe(o.horario); return !h || !ho || (h.ini < ho.fim && ho.ini < h.fim); })());
  };
  A.textoConflito = o => `${o.local} já está marcado para "${o.titulo}" (${(A.perfil(o.dono) || {}).ini || '?'}), ${A.fmt(o.inicio)}${o.fim && o.fim !== o.inicio ? ' a ' + A.fmt(o.fim) : ''}${o.horario ? ', ' + o.horario : ''}.`;
  A.semPlanilha = () => A.modo === 'nuvem' && A.nuvem && A.nuvem.tipo === 'supabase';
  A.dono = () => A.sessao ? A.perfil(A.sessao.perfilId) : null;
  A.prefs = () => {
    const id = A.sessao && A.sessao.perfilId;
    if (!A.estado.prefs[id]) A.estado.prefs[id] = {};
    return A.estado.prefs[id];
  };
  A.regras = (perfilId) => {
    const id = perfilId || (A.sessao && A.sessao.perfilId);
    if (!A.estado.regras[id]) A.estado.regras[id] = A.regrasPadrao();
    return A.estado.regras[id];
  };
  A.avatar = (p, cls = '') => p ? `<span class="avatar ${cls}" style="--c:${p.cor};--cbg:${p.bg}" aria-hidden="true">${A.esc(p.ini.replace(/\./g, ''))}</span>` : '';

  /* ---------- Processos ---------- */
  A.meus = () => A.estado.processos.filter(p => A.sessao && p.dono === A.sessao.perfilId);
  A.ativos = () => A.meus().filter(p => !p.arquivado);
  A.proc = id => A.estado.processos.find(p => p.id === id);
  A.tipo = proc => A.regras(proc.dono).tipos.find(t => t.id === proc.tipoId) || null;
  A.temEvento = proc => !!(proc.inicio) || (A.tipo(proc) || {}).ref === 'evento';
  A.dataRef = proc => proc.inicio || proc.limite || null;
  A.anotar = (proc, tipo, texto) => {
    const eu = A.perfil(A.euId());
    proc.diario.push({ data: A.hojeIso(), tipo, texto, autor: eu ? eu.ini : '' });
    if (proc.diario.length > 300) proc.diario.splice(0, proc.diario.length - 300);
    proc.atualizadoEm = new Date().toISOString();
  };

  /* Prazo de um passo: conta a partir da data de referência */
  A.prazo = (proc, item) => {
    const r = item.regra || {};
    const base = r.ref === 'fim' ? (proc.fim || proc.inicio) : r.ref === 'limite' ? (proc.limite || proc.inicio) : r.ref === 'entrada' ? proc.entrada : (proc.inicio || proc.limite);
    if (!base) return null;
    return A.somar(base, r.quando === 'depois' ? +r.dias : -r.dias);
  };
  A.REFS = { inicio: 'do início do evento', fim: 'do fim do evento', limite: 'da data limite', entrada: 'da entrada no setor' };
  A.regraTexto = r => {
    if (!r) return '';
    if (+r.dias === 0) return r.ref === 'entrada' ? 'no dia da entrada' : r.ref === 'limite' ? 'na data limite' : r.ref === 'fim' ? 'no último dia do evento' : 'no primeiro dia do evento';
    const ref = { inicio: 'do evento', fim: 'do fim do evento', limite: 'da data limite', entrada: 'da entrada no setor' }[r.ref] || '';
    return `${r.dias} dia${+r.dias === 1 ? '' : 's'} ${r.quando === 'depois' ? 'depois' : 'antes'} ${ref}`;
  };
  /* Transforma uma data escolhida de volta numa regra, mantendo a referência */
  A.regraDeData = (proc, item, dataIso) => {
    const ref = item.regra.ref;
    const base = ref === 'fim' ? (proc.fim || proc.inicio) : ref === 'limite' ? (proc.limite || proc.inicio) : ref === 'entrada' ? proc.entrada : (proc.inicio || proc.limite);
    if (!base) return item.regra;
    const n = A.entre(base, dataIso);
    return { ref, dias: Math.abs(n), quando: n > 0 ? 'depois' : 'antes' };
  };
  /* Só trava quando a pessoa disse que NÃO estava previsto; dá para destravar sem esperar */
  A.aprovado = proc => proc.previsto !== false || !!proc.destravado || (proc.portao || []).every(Boolean);

  /* Sugestões de passos: aparecem embaixo de cada frente e entram com um clique.
     Dependem do que já se sabe do processo (previsto? resposta do financeiro? externo?). */
  A.SUGESTOES = [
    // quando NÃO estava previsto, a autorização do PGJ e a origem do recurso ficam na pergunta do topo
    { f: 'instrucao', se: p => p.previsto !== false || A.aprovado(p), nome: 'Despachar ao setor financeiro para iniciar os trâmites', dias: 50 },
    { f: 'financeira', se: p => !p.financeiro, nome: 'Pedir a estimativa de custo ao setor financeiro', dias: 50 },
    { f: 'financeira', se: p => p.financeiro === 'remanejar' || p.recurso === 'remanejamento', nome: 'Avisar a DOF sobre o remanejamento', dias: 45 },
    { f: 'financeira', se: p => p.financeiro === 'suplementar' || p.recurso === 'suplementacao', nome: 'Pedir a suplementação orçamentária', dias: 45 },
    { f: 'contratacao', se: p => p.financeiro === 'tem', nome: 'Iniciar a contratação', dias: 45 },
    { f: 'deslocamento', se: p => p.ambito === 'externo', nome: 'Pagar as diárias', dias: 10 },
    { f: 'deslocamento', se: p => p.ambito === 'externo', nome: 'Emitir as passagens', dias: 20 },
  ];
  A.sugestoesDe = (p, f) => {
    const tem = new Set(f.itens.map(i => A.semAcento(i.nome)));
    return A.SUGESTOES.filter(s => s.f === f.modeloId && s.se(p) && !tem.has(A.semAcento(s.nome)));
  };
  A.RESPOSTA_FIN = { tem: 'Tem recurso', remanejar: 'Precisa remanejar', suplementar: 'Precisa suplementar' };
  A.travada = (proc, f) => f.fase !== 'inicio' && !A.aprovado(proc);
  A.itensAtivos = proc => proc.frentes.filter(f => !f.na && !A.travada(proc, f)).flatMap(f => f.itens.filter(i => !i.na).map(i => ({ proc, f, i })));
  A.despachoAberto = (proc, item) => proc.despachos.find(a => a.itemId === item.id && !a.resposta);

  A.estadoFrente = (proc, f) => {
    if (f.na) return 'na';
    if (A.travada(proc, f)) return 'travada';
    const it = f.itens.filter(i => !i.na);
    if (!it.length) return 'afazer';
    if (it.every(t => t.estado === 'feita')) return 'feito';
    if (it.some(t => t.estado === 'aberta' && A.prazo(proc, t) && A.dias(A.prazo(proc, t)) < 0)) return 'atrasada';
    if (it.some(t => t.estado === 'esperando')) return 'esperando';
    if (it.some(t => t.estado === 'feita')) return 'andamento';
    return 'afazer';
  };
  A.ESTADO_FRENTE = {
    feito: ['Feito', 'var(--ok)', 'var(--ok-bg)', 'check'],
    atrasada: ['Atrasada', 'var(--critico)', 'var(--critico-bg)', 'alerta'],
    esperando: ['Esperando resposta', 'var(--atencao)', 'var(--atencao-bg)', 'relogio'],
    andamento: ['Em andamento', 'var(--emdia)', 'var(--emdia-bg)', 'circulo'],
    afazer: ['A fazer', 'var(--neutro)', 'var(--neutro-bg)', 'circulo'],
    na: ['Não se aplica', 'var(--neutro)', 'var(--neutro-bg)', 'circulo'],
    travada: ['Espera a aprovação', 'var(--atencao)', 'var(--atencao-bg)', 'cadeado'],
  };
  A.seloFrente = e => `<span class="selo${e === 'feito' ? ' carimbo' : ''}" style="--c:${A.ESTADO_FRENTE[e][1]};--cbg:${A.ESTADO_FRENTE[e][2]}">${A.ic(A.ESTADO_FRENTE[e][3])}${A.ESTADO_FRENTE[e][0]}</span>`;

  /* Situação do processo: cruza a proximidade da data com o que falta */
  A.SIT = {
    critico: { c: 'var(--critico)', bg: 'var(--critico-bg)', nome: 'Crítico', ic: 'alerta' },
    atencao: { c: 'var(--atencao)', bg: 'var(--atencao-bg)', nome: 'Atenção', ic: 'relogio' },
    emdia: { c: 'var(--emdia)', bg: 'var(--emdia-bg)', nome: 'Em dia', ic: 'circulo' },
    ok: { c: 'var(--ok)', bg: 'var(--ok-bg)', nome: 'Tudo feito', ic: 'feito' },
    semdata: { c: 'var(--neutro)', bg: 'var(--neutro-bg)', nome: 'Sem data', ic: 'calendario' },
  };
  A.PESO = { critico: 4, atencao: 3, semdata: 2, emdia: 1, ok: 0 };
  A.situacao = proc => {
    const lim = A.regras(proc.dono).limites;
    const pend = A.itensAtivos(proc).filter(x => x.i.estado !== 'feita');
    if (!pend.length) return 'ok';
    const ref = A.dataRef(proc);
    if (!ref) return 'semdata';
    const ev = A.dias(ref);
    const abertas = pend.filter(x => x.i.estado === 'aberta');
    const prazos = abertas.map(x => A.prazo(proc, x.i)).filter(Boolean);
    if (prazos.some(p => A.dias(p) < 0) || (abertas.length && ev >= 0 && ev <= lim.critico)) return 'critico';
    if ((abertas.length && ev >= 0 && ev <= lim.atencao) || prazos.some(p => A.dias(p) <= lim.vencendo)) return 'atencao';
    return 'emdia';
  };
  A.seloSit = s => `<span class="selo${s === 'ok' ? ' carimbo' : ''}" style="--c:${A.SIT[s].c};--cbg:${A.SIT[s].bg}">${A.ic(A.SIT[s].ic)}${A.SIT[s].nome}</span>`;
  A.cores = s => `--c:${A.SIT[s].c};--cbg:${A.SIT[s].bg}`;
  A.pior = lista => lista.reduce((a, b) => A.PESO[b] > A.PESO[a] ? b : a, 'ok');

  /* ---------- Planilha: o que cada coluna deveria dizer ---------- */
  A.valorColuna = (proc, col) => {
    const frs = proc.frentes.filter(f => f.coluna === col);
    const itens = proc.frentes.flatMap(f => f.itens.filter(i => (i.coluna || f.coluna) === col).map(i => ({ f, i })));
    if (!frs.length && !itens.length) return null;
    const vivos = itens.filter(x => !x.f.na && !x.i.na);
    if (!vivos.length) return 'Não se aplica';
    return vivos.every(x => x.i.estado === 'feita') ? 'Feito' : 'Pendente';
  };
  A.mudancas = proc => A.COLUNAS.map(col => {
    const para = A.valorColuna(proc, col);
    const de = (proc.naPlanilha || {})[col] || 'Pendente';
    return { col, de, para };
  }).filter(m => m.para && m.de !== m.para);

  /* ---------- Criar um processo a partir de um tipo ---------- */
  /* ---------- Classificação: vem antes de tudo ----------
     Interno: a escola promove (e emite os certificados).
     Externo: o servidor vai a um evento de fora (e apresenta o certificado). */
  A.AMBITOS = { interno: ['Interno', 'A escola promove e atende'], externo: ['Externo', 'O servidor vai a um evento de fora'] };
  A.PUBLICOS = { membros: 'Membros', ambos: 'Membros e servidores', servidores: 'Servidores' };
  A.classeTexto = p => [p.ambito && A.AMBITOS[p.ambito][0], p.publico && A.PUBLICOS[p.publico]].filter(Boolean).join(' · ');
  const soNoInterno = f => ['local', 'comunicacao'].includes(f.modeloId); // a escola não sedia nem divulga evento de fora
  /* Passos que só existem no externo: entram sozinhos quando o processo é externo */
  const EXTRAS_EXTERNO = [
    ['financeira', 'ext-inscricao', 'Pagar a inscrição no evento', 20, 'antes', 'inicio'],
    ['pos', 'ext-avisar', 'Avisar o servidor: o certificado será cobrado em 15 dias', 1, 'depois', 'fim'],
    ['pos', 'ext-cobrar', 'Cobrar o certificado do servidor', 15, 'depois', 'fim'],
  ];
  const certApresentado = n => /certificad/.test(n) && /apresent/.test(n);
  const certEmitido = n => /certificad/.test(n) && /emit/.test(n);
  /* Liga e desliga o que não se aplica conforme interno/externo; não mexe no que a pessoa marcou à mão */
  A.aplicarAmbito = p => {
    if (!p.ambito) return;
    const ext = p.ambito === 'externo';
    const marcar = (o, na) => {
      if (na && !o.na) { o.na = true; o.naPor = 'ambito'; }
      else if (!na && o.na && o.naPor === 'ambito') { o.na = false; delete o.naPor; }
    };
    if (ext) EXTRAS_EXTERNO.forEach(([fr, chave, nome, dias, quando, ref]) => {
      const f = p.frentes.find(x => x.modeloId === fr);
      if (f && !f.itens.some(i => i.extra === chave)) f.itens.push({ id: 'i' + A.uid(), modeloId: null, extra: chave, so: 'externo', nome, regra: { dias, quando, ref }, estado: 'aberta', coluna: null, na: false, editado: false });
    });
    p.frentes.forEach(f => {
      if (soNoInterno(f)) marcar(f, ext);
      else if (f.na && f.naPor === 'ambito') marcar(f, false);
      f.itens.forEach(i => {
        const n = A.semAcento(i.nome);
        if (i.so) marcar(i, i.so !== p.ambito);
        else if (certApresentado(n)) marcar(i, !ext);
        else if (certEmitido(n)) marcar(i, ext);
      });
    });
  };

  /* Arquivar: sai do painel e da lista do dia a dia, mas continua em Processos > Arquivados, na busca e na Agenda */
  A.arquivar = (p, sim = true) => {
    const antes = !!p.arquivado;
    p.arquivado = sim;
    A.anotar(p, 'Sistema', sim ? 'Processo arquivado.' : 'Processo tirado do arquivo.');
    A.salvar();
    return () => { p.arquivado = antes; p.diario.pop(); A.salvar(); };
  };
  A.tudoFeito = p => { const it = A.itensAtivos(p); return it.length > 0 && it.every(x => x.i.estado === 'feita'); };

  A.novoProcesso = (dados, perfilId) => {
    const regras = A.regras(perfilId);
    const tipo = regras.tipos.find(t => t.id === dados.tipoId) || regras.tipos[0];
    const proc = {
      id: 'p' + A.uid(), dono: perfilId, sei: A.seiGuardar(dados.sei), titulo: dados.titulo || 'Sem título', tipoId: tipo.id, tipoNome: tipo.nome,
      unidade: dados.unidade || '', entrada: dados.entrada || A.hojeIso(), inicio: dados.inicio || '', fim: dados.fim || dados.inicio || '',
      limite: dados.limite || '', horario: dados.horario || '', modalidade: dados.modalidade || '', local: dados.local || '', apoio: A.lgpd() ? A.iniciais(dados.apoio) : (dados.apoio || ''),
      ambito: dados.ambito || '', publico: dados.publico || '',
      previsto: null, recurso: '', financeiro: '', portao: [false, false, false], situacaoPlanilha: '', arquivado: false, observacoes: dados.observacoes || '',
      frentes: [], despachos: [], seis: [], diario: [], naPlanilha: {}, origem: dados.origem || 'manual',
      criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
    };
    proc.frentes = tipo.frentes.map(fm => ({
      id: 'f' + A.uid(), modeloId: fm.id, nome: fm.nome, fase: fm.fase, icone: fm.icone, coluna: fm.coluna || null, na: !!fm.naPadrao,
      itens: fm.passos.map(pm => ({ id: 'i' + A.uid(), modeloId: pm.id, nome: pm.nome, regra: { dias: +pm.dias, quando: pm.quando, ref: pm.ref }, estado: 'aberta', coluna: pm.coluna || null, na: false, editado: false })),
    }));
    A.aplicarAmbito(proc);
    A.anotar(proc, 'Sistema', proc.origem === 'planilha' ? 'Processo trazido da planilha.' : 'Processo criado no sistema.');
    return proc;
  };

  /* Muda a situação de um passo e devolve a função que desfaz */
  A.setEstado = (proc, item, novo, setor) => {
    const antes = { estado: item.estado, feitoEm: item.feitoEm, despachos: proc.despachos.map(a => ({ ...a })) };
    const desp = A.despachoAberto(proc, item);
    if (novo === 'esperando' && !desp) proc.despachos.push({ id: 'a' + A.uid(), itemId: item.id, setor: setor || 'Não informado', texto: '', enviado: A.hojeIso() });
    if (novo !== 'esperando' && desp) { if (novo === 'feita') desp.resposta = A.hojeIso(); else proc.despachos = proc.despachos.filter(a => a !== desp); }
    item.estado = novo;
    item.feitoEm = novo === 'feita' ? A.hojeIso() : null;
    proc.atualizadoEm = new Date().toISOString();
    return () => { item.estado = antes.estado; item.feitoEm = antes.feitoEm; proc.despachos = antes.despachos; };
  };
  A.acharItem = (proc, itemId) => {
    for (const f of proc.frentes) { const i = f.itens.find(x => x.id === itemId); if (i) return { f, i }; }
    return null;
  };
})(window.App);
