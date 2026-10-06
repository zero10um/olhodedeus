/* Supabase: quando o sistema está publicado na internet (Vercel), os dados da equipe ficam
   num banco compartilhado. Cada servidor entra com usuário e senha.
   Aberto direto pelo arquivo (sem internet), nada disso é usado. */
(function (A) {
  const URL_DIRETA = 'https://ssztpibrqqmvpfciccwp.supabase.co';
  // Na Vercel, passa pelo próprio site (rede do MP bloqueia supabase.co)
  const URL_BANCO = /\.vercel\.app$/.test(location.hostname) ? location.origin + '/sb' : URL_DIRETA;
  const CHAVE_PUBLICA = 'sb_publishable_K3rvn6nZSP13uIkSbTH8tQ_hQ9QLqhh';
  // O e-mail é só por baixo dos panos: ninguém recebe nada. Fica num endereço da própria Vercel,
  // que ninguém mais consegue registrar (o domínio antigo, olhodedeus.app, foi registrado por terceiros).
  const DOMINIO = '@olhodedeus.vercel.app', DOMINIO_ANTIGO = '@olhodedeus.app';

  const S = A.supa = { cliente: null, usuario: null };
  S.disponivel = () => !!window.supabase && /^https?:$/.test(location.protocol) && !/[?&]local\b/.test(location.search); // ?local = testar sem o banco

  function cliente() {
    if (!S.cliente) S.cliente = window.supabase.createClient(URL_BANCO, CHAVE_PUBLICA, { auth: { persistSession: true, autoRefreshToken: true } });
    return S.cliente;
  }
  S.usuarioDe = email => String(email || '').split('@')[0];

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

  /* O banco entrega no máximo 1000 linhas por pedido: busca de mil em mil até acabar */
  async function tudo(montar) {
    const lista = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await montar().order('col').order('id').range(de, de + 999);
      if (error) throw error;
      lista.push(...data);
      if (data.length < 1000) return lista;
    }
  }

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
  /* Plano B do tempo real (a rede do MP bloqueia o websocket). A cada 30 s busca só o que é mais
     novo que a última alteração vista (coluna atualizado, comparada no banco com precisão total).
     A primeira volta traz tudo. A cada 5 voltas, uma conferência leve (só ids e horários) acha o que
     foi apagado e o que escapou. Para quando a aba fica escondida. */
  let consulta = null, conhecidos = null, ultimoTxt = null, ultimoMs = 0, voltas = 0;
  function entregar(col, mud) {
    if (mud.length && ouvintes[col]) ouvintes[col].forEach(([fn]) => fn({ metadata: { hasPendingWrites: false }, docChanges: () => mud }));
  }
  function receberLinhas(linhas) {
    const grupos = {};
    linhas.forEach(r => {
      (grupos[r.col] = grupos[r.col] || []).push({ type: 'modified', doc: { id: r.id, data: () => r.dados } });
      (conhecidos[r.col] = conhecidos[r.col] || new Map()).set(r.id, r.atualizado);
      const ms = Date.parse(r.atualizado) || 0;
      if (ms >= ultimoMs) { ultimoMs = ms; ultimoTxt = r.atualizado; }
    });
    Object.keys(ouvintes).forEach(col => entregar(col, grupos[col] || []));
  }
  async function passar() {
    if (document.hidden) return;
    try {
      const primeira = !conhecidos;
      if (primeira) conhecidos = {};
      receberLinhas(await tudo(() => {
        const q = cliente().from('docs').select('col,id,dados,atualizado');
        return primeira || !ultimoTxt ? q : q.gt('atualizado', ultimoTxt);
      }));
      if (primeira || ++voltas % 5) return;
      const agora = {}, escaparam = [];
      (await tudo(() => cliente().from('docs').select('col,id,atualizado'))).forEach(r => {
        (agora[r.col] = agora[r.col] || new Set()).add(r.id);
        if ((conhecidos[r.col] && conhecidos[r.col].get(r.id)) !== r.atualizado) escaparam.push(r.id);
      });
      Object.keys(conhecidos).forEach(col => {
        const sumiram = [...conhecidos[col].keys()].filter(id => !(agora[col] && agora[col].has(id)));
        sumiram.forEach(id => conhecidos[col].delete(id));
        entregar(col, sumiram.map(id => ({ type: 'removed', doc: { id, data: () => null } })));
      });
      for (let i = 0; i < escaparam.length; i += 100)
        receberLinhas(await tudo(() => cliente().from('docs').select('col,id,dados,atualizado').in('id', escaparam.slice(i, i + 100))));
    } catch (e) { /* sem rede agora: tenta de novo na próxima volta */ }
  }
  function comecarConsulta() {
    if (consulta) return;
    consulta = setInterval(passar, 30000);
    passar();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && consulta) passar(); });
  function pararConsulta() { if (consulta) { clearInterval(consulta); consulta = null; } }
  S.db = {
    collection: col => ({
      get: async () => {
        let data;
        try { data = await tudo(() => cliente().from('docs').select('id,dados').eq('col', col)); } catch (e) { throw erro(e); }
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
  /* Conta nova só entra depois que a administração libera. Quem decide é o banco (RLS);
     aqui é só para mostrar a tela certa. Se o banco ainda não tem a função, segue como antes. */
  S.liberado = async () => {
    try { const { data, error } = await cliente().rpc('liberado'); return error ? true : data === true; } catch (e) { return true; }
  };
  S.telaAguardando = vista => new Promise(resolve => {
    const usu = S.usuarioDe(S.usuario && S.usuario.email);
    vista.innerHTML = `<main class="estreito"><section class="cartao-form" aria-labelledby="agT">
      <h1 id="agT">Conta criada. Falta a liberação.</h1>
      <p style="margin-top:10px;max-width:56ch">Para proteger os dados da equipe, toda conta nova precisa ser liberada pela administração do sistema. Avise a administração que você criou a conta <strong>${A.esc(usu)}</strong>.</p>
      <p class="secundario" style="margin-top:8px">Esta tela confere sozinha de tempos em tempos. Se preferir, clique abaixo depois que avisarem.</p>
      <div class="form-botoes" style="justify-content:flex-start;margin-top:16px">
        <button class="btn btn-primario" type="button" id="agDeNovo">Já fui liberado</button>
        <button class="btn" type="button" id="agSair">Sair</button>
      </div>
      <p class="secundario" id="agMsg" role="status" style="margin-top:10px"></p>
    </section></main>`;
    const msg = vista.querySelector('#agMsg');
    let t = null;
    const conferir = async manual => {
      if (await S.liberado()) { clearInterval(t); resolve(); return; }
      if (manual) msg.textContent = 'Ainda não foi liberada. Confira com a administração.';
    };
    t = setInterval(() => conferir(false), 30000);
    vista.querySelector('#agDeNovo').onclick = () => conferir(true);
    vista.querySelector('#agSair').onclick = () => { clearInterval(t); S.sairDaConta(); };
  });

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
        // conta ainda no endereço antigo (antes do banco ser atualizado, ou se o nome já estava em uso)
        if (!criando && r.error && /Invalid login/i.test(r.error.message || '')) {
          const r2 = await cliente().auth.signInWithPassword({ email: u + DOMINIO_ANTIGO, password: s });
          if (!r2.error) r = r2;
        }
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
