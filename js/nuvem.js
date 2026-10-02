/* Nuvem: quando o sistema roda como página do Claude, os dados ficam no banco compartilhado
   da página (capability "db"). Cada pessoa entra com a própria conta do Claude.
   Aberto direto pelo arquivo, nada disso existe e o sistema guarda no navegador, como antes. */
(function (A) {
  const N = A.nuvem = { tipo: null, db: null, user: null, eu: null, dono: false, podeEscrever: null, salvo: {}, gravando: false, pendente: false, status: 'salvo', faltam: 0 };

  /* Onde cada parte dos dados mora no banco */
  function documentos() {
    const e = A.estado, m = {};
    e.perfis.forEach(p => { m['perfis/' + p.id] = p; });
    Object.entries(e.regras).forEach(([id, r]) => { if (A.perfil(id)) m['regras/' + id] = r; });
    Object.entries(e.leituras).forEach(([id, l]) => { if (A.perfil(id)) m['leituras/' + id] = l; });
    e.processos.forEach(p => { m['processos/' + p.id] = p; });
    if (N.eu) m['data/users/' + N.eu + '/prefs'] = e.prefs[N.eu] || {};
    return m;
  }
  /* Texto do objeto com as chaves em ordem: o banco pode devolver as chaves em outra ordem */
  const ordenar = o => Array.isArray(o) ? o.map(ordenar) : (o && typeof o === 'object') ? Object.keys(o).sort().reduce((r, k) => { r[k] = ordenar(o[k]); return r; }, {}) : o;
  const json = o => JSON.stringify(ordenar(o));
  /* Troca o conteúdo de um objeto sem trocar o objeto (as telas abertas continuam apontando para ele) */
  function substituir(alvo, dados) {
    Object.keys(alvo).forEach(k => delete alvo[k]);
    Object.assign(alvo, A.clonar(dados));
  }

  N.iniciar = async () => {
    if (!window.claude || typeof window.claude.use !== 'function') return false;
    const db = await window.claude.use('db');
    const user = await window.claude.use('user');
    const id = user ? await user.id() : null;
    if (!db || !id) return false;
    Object.assign(N, { tipo: 'claude', db, user, eu: id });
    N.dono = await user.isOwner();
    N.podeEscrever = await user.can('data.write');
    const dl = await window.claude.use('downloads');
    A.salvarArquivo = dl ? (nome, dados) => dl.save({ filename: nome, data: dados }) : null;
    return carregar(db, id);
  };

  /* Versão publicada na internet: banco do Supabase, cada um entra com usuário e senha */
  N.iniciarSupabase = async usuario => {
    Object.assign(N, { tipo: 'supabase', db: A.supa.db, user: usuario, eu: usuario.id, dono: true, podeEscrever: true });
    return carregar(A.supa.db, usuario.id);
  };

  async function carregar(db, id) {
    A.modo = 'nuvem';
    A.estado = { versao: 1, criadoEm: new Date().toISOString(), perfis: [], regras: {}, processos: [], prefs: {}, leituras: {}, config: { lgpd: true } };
    const [pf, rg, lt, pr, me] = await Promise.all(['perfis', 'regras', 'leituras', 'processos'].map(c => db.collection(c).get()).concat([db.doc('data/users/' + id + '/prefs').get()]));
    pf.docs.forEach(d => { A.estado.perfis.push(A.clonar(d.data())); N.salvo['perfis/' + d.id] = json(d.data()); });
    rg.docs.forEach(d => { A.estado.regras[d.id] = A.clonar(d.data()); N.salvo['regras/' + d.id] = json(d.data()); });
    lt.docs.forEach(d => { A.estado.leituras[d.id] = A.clonar(d.data()); N.salvo['leituras/' + d.id] = json(d.data()); });
    pr.docs.forEach(d => { A.estado.processos.push(A.clonar(d.data())); N.salvo['processos/' + d.id] = json(d.data()); });
    if (me.exists) { A.estado.prefs[id] = A.clonar(me.data()); N.salvo['data/users/' + id + '/prefs'] = json(me.data()); }
    A.migrar();
    A.estado.config.lgpd = true;

    ['perfis', 'regras', 'leituras', 'processos'].forEach(c => db.collection(c).onSnapshot(s => receber(c, s), erroAssinatura));
    return true;
  }

  /* Mudanças que chegam de outros computadores */
  let redesenhoPendente = false;
  function receber(col, snap) {
    let mudou = false;
    snap.docChanges().forEach(ch => {
      const caminho = col + '/' + ch.doc.id;
      if (ch.type === 'removed') {
        if (snap.metadata.hasPendingWrites) return;
        if (col === 'processos') { const i = A.estado.processos.findIndex(p => p.id === ch.doc.id); if (i >= 0) { A.estado.processos.splice(i, 1); mudou = true; } }
        delete N.salvo[caminho];
        return;
      }
      const dados = ch.doc.data(), j = json(dados);
      if (j === N.salvo[caminho]) return;
      N.salvo[caminho] = j;
      if (col === 'processos' || col === 'perfis') {
        const lista = col === 'processos' ? A.estado.processos : A.estado.perfis;
        const atual = lista.find(x => x.id === ch.doc.id);
        if (atual) substituir(atual, dados); else lista.push(A.clonar(dados));
      } else {
        const mapa = col === 'regras' ? A.estado.regras : A.estado.leituras;
        if (mapa[ch.doc.id]) substituir(mapa[ch.doc.id], dados); else mapa[ch.doc.id] = A.clonar(dados);
      }
      mudou = true;
    });
    if (mudou) redesenharDepois();
  }
  /* Não redesenha enquanto a pessoa está digitando: espera ela sair do campo */
  function redesenharDepois() {
    if (redesenhoPendente) return;
    const ativo = document.activeElement;
    const digitando = ativo && /^(INPUT|TEXTAREA|SELECT)$/.test(ativo.tagName) && ativo.closest('#vista');
    if (digitando) {
      redesenhoPendente = true;
      ativo.addEventListener('blur', () => { redesenhoPendente = false; setTimeout(redesenharDepois, 50); }, { once: true });
      return;
    }
    A.comFoco(A.redesenhar);
  }
  function erroAssinatura(e) {
    if (e && e.code === 'revoked') { N.status = 'sem acesso'; A.mostrarStatus && A.mostrarStatus(); }
  }

  /* Gravação: só o que mudou, um documento por vez */
  let timer = null;
  N.agendar = () => { clearTimeout(timer); timer = setTimeout(N.gravar, 600); N.status = 'salvando'; A.mostrarStatus && A.mostrarStatus(); };
  N.gravar = async () => {
    if (N.gravando) { N.pendente = true; return; }
    N.gravando = true;
    try {
      do {
        N.pendente = false;
        const docs = documentos();
        const mudados = Object.entries(docs).filter(([c, o]) => json(o) !== N.salvo[c] && meu(c, o));
        const apagados = Object.keys(N.salvo).filter(c => c.startsWith('processos/') && !docs[c]);
        N.faltam = mudados.length + apagados.length;
        for (const [caminho, obj] of mudados) {
          const j = json(obj);
          await tentar(() => N.db.doc(caminho).set(JSON.parse(j)));
          N.salvo[caminho] = j; N.faltam--; A.mostrarStatus && A.mostrarStatus();
        }
        for (const caminho of apagados) { await tentar(() => N.db.doc(caminho).delete()); delete N.salvo[caminho]; N.faltam--; }
      } while (N.pendente);
      N.status = 'salvo';
    } catch (e) {
      N.status = 'erro';
      const cod = e && e.code;
      if (cod === 'invalid_argument') { if (N.tipo === 'supabase') A.avisar('Essa mudança não foi salva: só quem cadastrou o processo pode alterá-lo.'); else { N.podeEscrever = false; A.avisar('Suas mudanças não foram salvas: este acesso é só para ver. Peça para ser convidado como Editor.'); } }
      else if (cod === 'quota_exceeded') A.avisar('O banco da página está cheio. Arquive ou tire processos antigos para liberar espaço.');
      else { A.avisar('Não deu para salvar agora. O sistema tenta de novo daqui a pouco.'); setTimeout(N.agendar, 8000); }
    } finally { N.gravando = false; A.mostrarStatus && A.mostrarStatus(); }
  };
  async function tentar(fn) {
    for (let i = 0; ; i++) {
      try { return await fn(); }
      catch (e) {
        const cod = e && e.code;
        if ((cod === 'unavailable' || cod === 'resource_exhausted') && i < 4) { await new Promise(r => setTimeout(r, 800 * (i + 1) + Math.random() * 600)); continue; }
        throw e;
      }
    }
  }
  /* No Supabase cada um só grava o que é seu; o que é dos colegas fica só para ver */
  function meu(caminho, o) {
    if (N.tipo !== 'supabase') return true;
    const [col, id] = caminho.split('/');
    if (col === 'processos') return o.dono === N.eu;
    if (col === 'data') return true;
    return id === N.eu;
  }
  N.pronto = () => !N.gravando && !N.pendente && Object.entries(documentos()).every(([c, o]) => !meu(c, o) || json(o) === N.salvo[c]);
})(window.App);
