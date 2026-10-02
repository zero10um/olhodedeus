/* Supabase: quando o sistema está publicado na internet (Vercel), os dados da equipe ficam
   num banco compartilhado. Cada servidor entra com usuário e senha.
   Aberto direto pelo arquivo (sem internet), nada disso é usado. */
(function (A) {
  const URL_BANCO = 'https://ssztpibrqqmvpfciccwp.supabase.co';
  const CHAVE_PUBLICA = 'sb_publishable_K3rvn6nZSP13uIkSbTH8tQ_hQ9QLqhh';
  const DOMINIO = '@olhodedeus.app'; // o e-mail é só por baixo dos panos: ninguém recebe nada

  const S = A.supa = { cliente: null, usuario: null };
  S.disponivel = () => !!window.supabase && /^https?:$/.test(location.protocol) && !/[?&]local/.test(location.search); // ?local = testar sem o banco

  function cliente() {
    if (!S.cliente) S.cliente = window.supabase.createClient(URL_BANCO, CHAVE_PUBLICA, { auth: { persistSession: true, autoRefreshToken: true } });
    return S.cliente;
  }
  S.usuarioDe = email => String(email || '').replace(DOMINIO, '');

  /* Erros do banco traduzidos para os códigos que a gravação já entende */
  function erro(e) {
    const msg = (e && e.message) || '';
    if (e && (e.code === '42501' || /row-level security|permission denied/i.test(msg))) return { code: 'invalid_argument', message: msg };
    if (/fetch|network|timeout|Failed/i.test(msg) || (e && /^5/.test(String(e.status || e.code || '')))) return { code: 'unavailable', message: msg };
    return { code: 'outro', message: msg };
  }
  const local = caminho => { const p = caminho.split('/'); return p[0] === 'data' ? { col: 'prefs', id: p[2] } : { col: p[0], id: p[1] }; };

  /* Banco com o mesmo jeito de usar do anterior: coleções, documentos e avisos de mudança */
  const ouvintes = {};
  let canal = null;
  function ouvir() {
    if (canal) return;
    canal = cliente().channel('docs-equipe')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, ev => {
        const apagado = ev.eventType === 'DELETE', r = apagado ? ev.old : ev.new;
        if (!r || !ouvintes[r.col]) return;
        const mudanca = { type: apagado ? 'removed' : 'modified', doc: { id: r.id, data: () => r.dados } };
        ouvintes[r.col].forEach(([fn]) => fn({ metadata: { hasPendingWrites: false }, docChanges: () => [mudanca] }));
      })
      .subscribe(estado => {
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') Object.values(ouvintes).flat().forEach(([, falha]) => falha && falha({ code: 'unavailable' }));
      });
  }
  S.db = {
    collection: col => ({
      get: async () => {
        const { data, error } = await cliente().from('docs').select('id,dados').eq('col', col);
        if (error) throw erro(error);
        return { docs: data.map(r => ({ id: r.id, data: () => r.dados })) };
      },
      onSnapshot: (fn, falha) => { (ouvintes[col] = ouvintes[col] || []).push([fn, falha]); ouvir(); },
    }),
    doc: caminho => {
      const { col, id } = local(caminho);
      return {
        get: async () => {
          const { data, error } = await cliente().from('docs').select('dados').eq('col', col).eq('id', id).maybeSingle();
          if (error) throw erro(error);
          return { exists: !!data, data: () => data && data.dados };
        },
        set: async dados => {
          const { error } = await cliente().from('docs').upsert({ col, id, dono: S.usuario.id, dados });
          if (error) throw erro(error);
        },
        delete: async () => {
          const { error } = await cliente().from('docs').delete().eq('col', col).eq('id', id);
          if (error) throw erro(error);
        },
      };
    },
  };

  /* ---------- Sessão ---------- */
  S.sessaoAtual = async () => {
    const { data } = await cliente().auth.getSession();
    S.usuario = data && data.session ? data.session.user : null;
    return S.usuario;
  };
  S.sairDaConta = async () => {
    try { await cliente().auth.signOut(); } catch (e) {}
    A.sair();
    location.hash = '';
    location.reload();
  };

  /* Tela de entrada: usuário e senha. Resolve quando a pessoa estiver dentro. */
  S.telaLogin = vista => new Promise(resolve => {
    let criando = false;
    const desenhar = () => {
      vista.innerHTML = `<div class="entrada"><h1>${criando ? 'Criar a sua conta' : 'Agenda pedagógica'}</h1>
        <p class="sub">${criando ? 'Escolha um nome de usuário e uma senha. Não precisa de e-mail, e o seu nome completo não é pedido.' : 'Entre com o seu usuário e senha.'}</p>
        <form class="cartao-form" id="fLogin" novalidate style="max-width:440px">
          <div class="campo"><label for="lUsu">Usuário</label><input id="lUsu" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ex.: lr.pedagogico"></div>
          <div class="campo" style="margin-top:12px"><label for="lSen">Senha${criando ? ' <small>(pelo menos 8 caracteres)</small>' : ''}</label><input id="lSen" type="password" autocomplete="${criando ? 'new-password' : 'current-password'}"></div>
          ${criando ? '<div class="campo" style="margin-top:12px"><label for="lSen2">Repita a senha</label><input id="lSen2" type="password" autocomplete="new-password"></div>' : ''}
          <p class="erro" id="lErro" role="alert" hidden></p>
          <div class="form-botoes" style="justify-content:space-between;flex-wrap:wrap">
            <button class="btn-texto" type="button" id="lTroca">${criando ? 'Já tenho conta' : 'Primeira vez? Criar conta'}</button>
            <button class="btn btn-primario btn-grande" type="submit">${criando ? 'Criar conta e entrar' : 'Entrar'}</button>
          </div>
        </form></div>`;
      const f = vista.querySelector('#fLogin'), er = vista.querySelector('#lErro');
      f.querySelector('#lUsu').focus();
      vista.querySelector('#lTroca').onclick = () => { criando = !criando; desenhar(); };
      f.oninput = () => { er.hidden = true; };
      f.onsubmit = async e => {
        e.preventDefault();
        const falha = t => { er.textContent = t; er.hidden = false; };
        const usu = f.querySelector('#lUsu').value.trim().toLowerCase(), sen = f.querySelector('#lSen').value;
        if (!/^[a-z0-9._-]{3,30}$/.test(usu)) return falha('O usuário precisa ter de 3 a 30 letras ou números, sem espaço e sem acento. Pode usar ponto.');
        if (criando && sen.length < 8) return falha('A senha precisa ter pelo menos 8 caracteres.');
        if (criando && sen !== f.querySelector('#lSen2').value) return falha('As duas senhas não são iguais.');
        const bt = f.querySelector('[type=submit]'); bt.disabled = true;
        const email = usu + DOMINIO;
        const r = criando ? await cliente().auth.signUp({ email, password: sen }) : await cliente().auth.signInWithPassword({ email, password: sen });
        bt.disabled = false;
        if (r.error) {
          const m = r.error.message || '';
          if (/already registered|already exists/i.test(m)) return falha('Esse usuário já existe. Escolha outro ou entre com ele.');
          if (/Invalid login/i.test(m)) return falha('Usuário ou senha não conferem.');
          if (/not confirmed/i.test(m)) return falha('A conta ainda não foi liberada. Avise quem administra o sistema.');
          if (/fetch|network/i.test(m)) return falha('Sem conexão com o banco. Confira a internet e tente de novo.');
          return falha('Não deu para entrar: ' + m);
        }
        if (!r.data.session) return falha('Conta criada, mas falta liberar a entrada sem confirmação de e-mail. Avise quem administra o sistema.');
        S.usuario = r.data.session.user;
        resolve(S.usuario);
      };
    };
    desenhar();
  });
})(window.App);
