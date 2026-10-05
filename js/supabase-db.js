/* Supabase: quando o sistema está publicado na internet (Vercel), os dados da equipe ficam
   num banco compartilhado. Cada servidor entra com usuário e senha.
   Aberto direto pelo arquivo (sem internet), nada disso é usado. */
(function (A) {
  const URL_DIRETA = 'https://ssztpibrqqmvpfciccwp.supabase.co';
  // Na Vercel, passa pelo próprio site (rede do MP bloqueia supabase.co)
  const URL_BANCO = /\.vercel\.app$/.test(location.hostname) ? location.origin + '/sb' : URL_DIRETA;
  const CHAVE_PUBLICA = 'sb_publishable_K3rvn6nZSP13uIkSbTH8tQ_hQ9QLqhh';
  const DOMINIO = '@olhodedeus.app'; // o e-mail é só por baixo dos panos: ninguém recebe nada

  const S = A.supa = { cliente: null, usuario: null };
  S.disponivel = () => !!window.supabase && /^https?:$/.test(location.protocol) && !/[?&]local\b/.test(location.search); // ?local = testar sem o banco

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
  /* De quem é cada documento: o processo é de quem o cadastrou, o perfil e as regras são da própria pessoa */
  const donoDe = (col, id, dados) => col === 'processos' ? dados.dono : ['perfis', 'regras', 'leituras'].includes(col) ? id : S.usuario.id;

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
        // sem atualização ao vivo (o websocket não passa pelo rewrite da Vercel): consulta o banco de tempos em tempos, sem avisar ninguém
        if (estado === 'SUBSCRIBED') pararConsulta();
        else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') comecarConsulta();
      });
  }
  /* Plano B do tempo real: a cada 30 s busca o que mudou e entrega do mesmo jeito que o tempo real entregaria */
  let consulta = null, conhecidos = null;
  function comecarConsulta() {
    if (consulta) return;
    const passar = async () => {
      if (document.hidden) return;
      try {
        const { data, error } = await cliente().from('docs').select('col,id,dados');
        if (error || !data) return;
        const agora = {};
        data.forEach(r => { (agora[r.col] = agora[r.col] || new Set()).add(r.id); });
        Object.keys(ouvintes).forEach(col => {
          const mud = data.filter(r => r.col === col).map(r => ({ type: 'modified', doc: { id: r.id, data: () => r.dados } }));
          if (conhecidos && conhecidos[col]) conhecidos[col].forEach(id => { if (!(agora[col] && agora[col].has(id))) mud.push({ type: 'removed', doc: { id, data: () => null } }); });
          if (mud.length) ouvintes[col].forEach(([fn]) => fn({ metadata: { hasPendingWrites: false }, docChanges: () => mud }));
        });
        conhecidos = agora;
      } catch (e) { /* sem rede agora: tenta de novo na próxima volta */ }
    };
    consulta = setInterval(passar, 30000);
    passar();
  }
  function pararConsulta() { if (consulta) { clearInterval(consulta); consulta = null; } }
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
          const { error } = await cliente().from('docs').upsert({ col, id, dono: donoDe(col, id, dados), dados });
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
  /* Admin é decidido pelo banco (tabela admins), não pelo site */
  S.souAdmin = async () => {
    try { const { data, error } = await cliente().rpc('sou_admin'); return !error && data === true; } catch (e) { return false; }
  };
  /* Funções do banco (as de administração conferem lá dentro se quem chamou é admin) */
  S.rpc = async (nome, args) => {
    const { data, error } = await cliente().rpc(nome, args || {});
    if (error) throw new Error(/Could not find the function/i.test(error.message) ? 'O banco ainda não tem esta função. Rode o esquema.sql atualizado no Supabase.' : error.message);
    return data;
  };
  S.trocarSenha = async nova => {
    const { error } = await cliente().auth.updateUser({ password: nova });
    if (error) throw new Error(/same/i.test(error.message) ? 'A senha nova é igual à atual.' : error.message);
  };
  S.sairDaConta = async () => {
    try { await cliente().auth.signOut(); } catch (e) {}
    A.sair();
    location.hash = '';
    location.reload();
  };

  /* ---------- Tela de entrada ---------- */
  const SEMANA = [ // [topo %, altura %, intensidade] de cada evento desenhado na arte
    ['seg', [[8, 22, .32], [42, 30, .5]]],
    ['ter', [[14, 40, .42], [64, 18, .28]]],
    ['qua', [[6, 16, .3], [30, 34, .55], [72, 14, .3]]],
    ['qui', [[20, 50, .48]]],
    ['sex', [[10, 20, .38], [40, 14, .28], [62, 24, .45]]],
  ];
  const GRIFOS = ['--emdia-bg', '--atencao-bg', '--ok-bg', '--grifo-aqui', '--emdia-bg', '--critico-bg', '--atencao-bg'];
  const LOGO = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14.5h3M8 17h6" stroke-width="1.8"/></svg>';

  /* Resolve quando a pessoa estiver dentro */
  S.telaLogin = vista => new Promise(resolve => {
    const hoje = Math.min(4, Math.max(0, new Date().getDay() - 1));
    let i = 0;
    vista.innerHTML = `<div class="login" id="login">
      <section class="login-arte" aria-hidden="true">
        <div class="login-marca">${LOGO}<span>Agenda pedagógica</span></div>
        <div class="login-semana">
          ${SEMANA.map(([d, blocos], k) => `<div class="ls-col${k === hoje ? ' hoje' : ''}"><span class="ls-dia">${d}</span><div class="ls-trilho">${blocos.map(([t, h]) => `<span class="ls-bloco" style="--t:${t};--h:${h};--g:var(${GRIFOS[i % GRIFOS.length]});--i:${i++}"></span>`).join('')}</div></div>`).join('')}
          <span class="ls-agora"></span>
        </div>
        <p class="login-frase">Os eventos da equipe, o que falta preparar e os SEIs de cada um, num lugar só.</p>
      </section>
      <section class="login-lado">
        <form class="login-form" id="fLogin" novalidate aria-labelledby="lTitulo">
          <h1 id="lTitulo">Entrar</h1>
          <p class="secundario" id="lSub">Use o usuário e a senha que você criou.</p>
          <div class="campo"><label for="lUsu">Usuário</label><input id="lUsu" autocomplete="username" autocapitalize="none" spellcheck="false" aria-describedby="lErro"></div>
          <div class="campo"><label for="lSen">Senha</label>
            <div class="login-senha"><input id="lSen" type="password" autocomplete="current-password" aria-describedby="lErro lCaps">
              <button class="btn-icone" type="button" id="lVer" aria-label="Mostrar a senha" aria-pressed="false">${A.ic('olho')}</button></div>
            <p class="login-caps" id="lCaps" hidden>${A.ic('alerta', 'ic-sm')} O Caps Lock está ligado.</p></div>
          <div class="login-extra" id="lExtra"><div><div class="campo"><label for="lSen2">Repita a senha</label><input id="lSen2" type="password" autocomplete="new-password" disabled></div>
            <p class="secundario login-regra">Usuário: de 3 a 30 letras ou números, sem espaço e sem acento (pode usar ponto). Senha: pelo menos 8 caracteres.</p></div></div>
          <p class="erro login-erro" id="lErro" role="alert" hidden></p>
          <button class="btn btn-primario btn-grande login-entrar" type="submit" id="lBtn">Entrar</button>
          <p class="login-troca"><span id="lPerg">Primeira vez aqui?</span> <button class="btn-texto" type="button" id="lTroca">Criar a minha conta</button></p>
        </form>
        <p class="login-rodape">Só as suas iniciais aparecem para a equipe. Ninguém pede o seu nome completo.</p>
      </section>
    </div>`;
    const $ = s => vista.querySelector(s);
    const f = $('#fLogin'), er = $('#lErro'), usu = $('#lUsu'), sen = $('#lSen'), sen2 = $('#lSen2'), bt = $('#lBtn');
    let criando = false;
    usu.focus();

    const modo = c => {
      criando = c;
      f.classList.toggle('criando', c);
      $('#lTitulo').textContent = c ? 'Criar a sua conta' : 'Entrar';
      $('#lSub').textContent = c ? 'Escolha um usuário e uma senha. Não precisa de e-mail.' : 'Use o usuário e a senha que você criou.';
      $('#lPerg').textContent = c ? 'Já tem conta?' : 'Primeira vez aqui?';
      $('#lTroca').textContent = c ? 'Entrar com ela' : 'Criar a minha conta';
      bt.textContent = c ? 'Criar conta e entrar' : 'Entrar';
      sen.autocomplete = c ? 'new-password' : 'current-password';
      sen2.disabled = !c; sen2.value = '';
      limpar(); usu.focus();
    };
    const limpar = () => { er.hidden = true; [usu, sen, sen2].forEach(x => x.removeAttribute('aria-invalid')); };
    const falha = (t, campo) => {
      er.textContent = t; er.hidden = false;
      if (campo) { campo.setAttribute('aria-invalid', 'true'); campo.focus(); }
      f.classList.remove('treme'); void f.offsetWidth; f.classList.add('treme');
    };
    $('#lTroca').onclick = () => modo(!criando);
    $('#lVer').onclick = e => {
      const ver = sen.type === 'password';
      [sen, sen2].forEach(x => x.type = ver ? 'text' : 'password');
      e.currentTarget.setAttribute('aria-pressed', ver);
      e.currentTarget.setAttribute('aria-label', ver ? 'Esconder a senha' : 'Mostrar a senha');
    };
    const caps = e => { if (e.getModifierState) $('#lCaps').hidden = !e.getModifierState('CapsLock'); };
    [sen, sen2].forEach(x => { x.addEventListener('keyup', caps); x.addEventListener('keydown', caps); });
    f.oninput = limpar;

    f.onsubmit = async e => {
      e.preventDefault();
      const u = usu.value.trim().toLowerCase(), s = sen.value;
      if (!u) return falha('Escreva o seu usuário.', usu);
      if (!/^[a-z0-9._-]{3,30}$/.test(u)) return falha('O usuário precisa ter de 3 a 30 letras ou números, sem espaço e sem acento. Pode usar ponto.', usu);
      if (!s) return falha('Escreva a sua senha.', sen);
      if (criando && s.length < 8) return falha('A senha precisa ter pelo menos 8 caracteres.', sen);
      if (criando && s !== sen2.value) return falha('As duas senhas não são iguais.', sen2);
      bt.disabled = true; bt.classList.add('carregando'); bt.textContent = criando ? 'Criando a conta…' : 'Entrando…';
      let r;
      try {
        const email = u + DOMINIO;
        r = criando ? await cliente().auth.signUp({ email, password: s }) : await cliente().auth.signInWithPassword({ email, password: s });
      } catch (x) { r = { error: x }; }
      bt.disabled = false; bt.classList.remove('carregando'); bt.textContent = criando ? 'Criar conta e entrar' : 'Entrar';
      if (r.error) {
        const m = r.error.message || '';
        if (/already registered|already exists/i.test(m)) return falha('Esse usuário já existe. Escolha outro, ou entre com ele.', usu);
        if (/Invalid login/i.test(m)) return falha('Usuário ou senha não conferem. Confira e tente de novo.', sen);
        if (/not confirmed/i.test(m)) return falha('A conta ainda não foi liberada. Avise a administração do sistema.');
        if (/rate limit|too many/i.test(m)) return falha('Muitas tentativas seguidas. Espere um minuto e tente de novo.');
        if (/weak|password/i.test(m)) return falha('Essa senha é fraca demais. Use uma mais longa, misturando letras e números.', sen);
        if (/fetch|network/i.test(m)) return falha('Sem conexão com o banco. Confira a internet e tente de novo.');
        return falha('Não deu para entrar: ' + m);
      }
      if (!r.data.session) return falha('A conta foi criada, mas a entrada ainda precisa ser liberada. Avise a administração do sistema.');
      S.usuario = r.data.session.user;
      $('#login').classList.add('saindo');
      setTimeout(() => resolve(S.usuario), A.semMovimento() ? 0 : 260);
    };
  });
})(window.App);
