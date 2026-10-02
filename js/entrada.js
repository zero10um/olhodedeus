/* Entrada: escolher a pessoa e digitar o código. Também cria perfis e troca códigos.
   O código é uma tranca de armário: evita mexer sem querer, mas não é segurança forte. */
(function (A) {
  let escolhido = null, erros = 0, travadoAte = 0, relogio = null, criando = false;
  const FUNCOES = ['Pedagogo(a)', 'Técnico(a)', 'Chefe de seção', 'Residente', 'Estagiário(a)', 'Outra função'];

  A.telaEntrada = vista => {
    if (A.modo === 'nuvem') return entradaNuvem(vista);
    const perfis = A.estado.perfis;
    if (!perfis.length) criando = true;
    vista.innerHTML = `<div class="entrada">
      ${perfis.length ? `<h1>Quem vai usar o painel?</h1><p class="sub">Escolha a pessoa e digite o código dela. Cada servidor tem o seu painel.</p>`
        : `<h1>Boas-vindas ao Meus processos</h1><p class="sub">Primeiro, crie o seu perfil. Ele guarda os seus processos, as suas regras de prazo e o jeito que você gosta de ver o painel. Tudo fica só neste computador.</p>`}
      ${perfis.length ? `<ul class="pessoas" id="pessoas" aria-label="Pessoas">
        ${perfis.map((p, i) => `<li style="animation-delay:${i * 50}ms"><button type="button" class="pessoa" data-id="${p.id}" aria-pressed="false" style="--c:${p.cor};--cbg:${p.bg}">${A.avatar(p, 'grande')}<span class="ini">${A.esc(p.ini)}</span><span class="funcao">${A.esc(p.funcao || '')}</span></button></li>`).join('')}
        <li style="animation-delay:${perfis.length * 50}ms"><button type="button" class="pessoa nova" id="novaPessoa">${`<span class="avatar grande">${A.ic('mais')}</span>`}<span class="ini">Nova pessoa</span><span class="funcao">Criar um perfil</span></button></li>
      </ul>` : ''}
      <div id="entradaCaixa"></div>
    </div>`;
    vista.querySelectorAll('.pessoa[data-id]').forEach(b => b.onclick = () => escolher(vista, b.dataset.id));
    const nova = vista.querySelector('#novaPessoa');
    if (nova) nova.onclick = () => { criando = true; escolhido = null; mostrarCriar(vista); };
    if (criando) mostrarCriar(vista);
  };

  function escolher(vista, id) {
    criando = false;
    escolhido = A.perfil(id);
    if (!escolhido.hashPessoal) return definirCodigos(vista);
    const lista = vista.querySelector('#pessoas');
    lista.classList.add('escolhendo');
    lista.querySelectorAll('.pessoa').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
    const cx = vista.querySelector('#entradaCaixa');
    cx.innerHTML = `<section class="codigo-caixa" aria-labelledby="t-codigo">
      ${A.avatar(escolhido, 'medio')}
      <div><h2 id="t-codigo">Painel de ${A.esc(escolhido.ini)}</h2><p class="secundario">${A.esc(escolhido.funcao || '')}</p></div>
      <form class="form" id="formPin" novalidate>
        <div class="campo"><label for="pin">Código de 4 números</label>${pinHTML('pin')}</div>
        <button class="btn btn-primario btn-grande" type="submit" id="entrar">Entrar</button>
        <button class="btn-texto" type="button" id="trocar">Escolher outra pessoa</button>
      </form>
      <p class="msg" id="msg" role="status" aria-live="polite"></p>
      <div class="tipos-codigo">
        <div class="tipo-codigo">${A.ic('lapis')}<span><strong>Código pessoal</strong>A própria pessoa entra e pode mexer em tudo.</span></div>
        <div class="tipo-codigo">${A.ic('olho')}<span><strong>Código de consulta</strong>Quem recebe da pessoa só vê. Editar, só se ela permitir.</span></div>
      </div>
    </section>`;
    const pin = ligarPin(cx, 'pin', () => cx.querySelector('#formPin').requestSubmit());
    pin.focus();
    cx.querySelector('#trocar').onclick = () => { escolhido = null; A.redesenhar(); };
    cx.querySelector('#formPin').onsubmit = async e => {
      e.preventDefault();
      const msg = cx.querySelector('#msg'), btn = cx.querySelector('#entrar');
      if (Date.now() < travadoAte) return;
      if (pin.value.length < 4) return errar(cx, 'Digite os 4 números do código.');
      const h = await A.embaralhar(pin.value);
      let acesso = null;
      if (h === escolhido.hashPessoal) acesso = 'dono';
      else if (h === escolhido.hashConsulta) acesso = escolhido.consultaEdita ? 'convidado' : 'leitura';
      if (!acesso) {
        erros++;
        if (erros >= 5) return travar(cx);
        return errar(cx, `Código não confere. Tente de novo (${5 - erros} tentativa${5 - erros > 1 ? 's' : ''} antes de esperar um pouco).`);
      }
      erros = 0;
      msg.className = 'msg ok';
      msg.textContent = { dono: 'Bem-vindo ao seu painel.', leitura: `Abrindo o painel de ${escolhido.ini} só para ver.`, convidado: `Abrindo o painel de ${escolhido.ini}. Você tem permissão para editar.` }[acesso];
      btn.classList.add('certo'); btn.disabled = true; btn.innerHTML = `${A.ic('check')} Entrando`;
      A.entrarComo(escolhido.id, acesso);
      setTimeout(() => { location.hash = '#/painel'; }, A.semMovimento() ? 0 : 450);
    };
    cx.scrollIntoView({ behavior: A.semMovimento() ? 'auto' : 'smooth', block: 'nearest' });
  }

  /* Perfil vindo da versão online ainda não tem código: cria na primeira entrada */
  function definirCodigos(vista) {
    const lista = vista.querySelector('#pessoas');
    lista.classList.add('escolhendo');
    lista.querySelectorAll('.pessoa').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === escolhido.id));
    const cx = vista.querySelector('#entradaCaixa');
    cx.innerHTML = `<form class="cartao-form" id="fCodigos" novalidate aria-labelledby="t-cod">
      <h2 id="t-cod">Crie os códigos de ${A.esc(escolhido.ini)}</h2>
      <p class="secundario" style="margin-bottom:16px">Este perfil veio da versão online, onde não se usa código. Aqui, sem internet, ele precisa de um.</p>
      <div class="grade-campos">
        <div class="campo"><label for="dP1">Código pessoal <small>(4 números)</small></label><input id="dP1" inputmode="numeric" maxlength="4" type="password" autocomplete="new-password"></div>
        <div class="campo"><label for="dP2">Repita o código pessoal</label><input id="dP2" inputmode="numeric" maxlength="4" type="password" autocomplete="new-password"></div>
        <div class="campo"><label for="dC">Código de consulta <small>(4 números)</small></label><input id="dC" inputmode="numeric" maxlength="4" autocomplete="off"></div>
      </div>
      <p class="erro" id="dErro" role="alert" hidden></p>
      <div class="form-botoes"><button class="btn btn-grande" type="button" id="dCancelar">Cancelar</button><button class="btn btn-primario btn-grande" type="submit">Salvar e entrar</button></div>
    </form>`;
    const f = cx.querySelector('#fCodigos');
    f.querySelector('#dP1').focus();
    f.querySelectorAll('input').forEach(i => i.oninput = () => { i.value = i.value.replace(/\D/g, ''); f.querySelector('#dErro').hidden = true; });
    f.querySelector('#dCancelar').onclick = () => { escolhido = null; A.redesenhar(); };
    f.onsubmit = async e => {
      e.preventDefault();
      const v = id => f.querySelector('#' + id).value, er = f.querySelector('#dErro');
      const falha = t => { er.textContent = t; er.hidden = false; };
      if (!/^\d{4}$/.test(v('dP1'))) return falha('O código pessoal precisa ter 4 números.');
      if (v('dP1') !== v('dP2')) return falha('Os dois códigos pessoais não são iguais.');
      if (!/^\d{4}$/.test(v('dC'))) return falha('O código de consulta precisa ter 4 números.');
      if (v('dC') === v('dP1')) return falha('Use um código de consulta diferente do pessoal.');
      escolhido.hashPessoal = await A.embaralhar(v('dP1'));
      escolhido.hashConsulta = await A.embaralhar(v('dC'));
      escolhido.consultaEdita = false;
      A.salvarJa();
      A.entrarComo(escolhido.id, 'dono');
      location.hash = '#/painel';
      A.avisar('Códigos criados.');
    };
  }

  function errar(cx, texto) {
    const pin = cx.querySelector('#pin'), caixa = pin.parentElement, msg = cx.querySelector('#msg');
    pin.setAttribute('aria-invalid', 'true'); caixa.classList.add('invalido');
    msg.className = 'msg erro'; msg.textContent = texto;
    caixa.classList.remove('errou'); void caixa.offsetWidth; caixa.classList.add('errou');
    pin.value = ''; pin.dispatchEvent(new Event('pin-limpo')); pin.focus();
  }
  function travar(cx) {
    travadoAte = Date.now() + 30000;
    const pin = cx.querySelector('#pin'), btn = cx.querySelector('#entrar'), msg = cx.querySelector('#msg');
    btn.disabled = true; pin.disabled = true;
    const tique = () => {
      const falta = Math.ceil((travadoAte - Date.now()) / 1000);
      if (falta <= 0) { clearInterval(relogio); erros = 0; btn.disabled = false; pin.disabled = false; msg.className = 'msg'; msg.textContent = 'Pode tentar de novo.'; pin.focus(); return; }
      msg.className = 'msg erro'; msg.textContent = `Muitas tentativas erradas. Espere ${falta} segundos para tentar de novo.`;
    };
    tique(); relogio = setInterval(tique, 1000);
  }

  /* Campo de código com 4 caixinhas */
  function pinHTML(id) {
    return `<div class="pin-caixa"><input class="pin" id="${id}" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}">
      <span class="cel-pin" aria-hidden="true"></span><span class="cel-pin" aria-hidden="true"></span><span class="cel-pin" aria-hidden="true"></span><span class="cel-pin" aria-hidden="true"></span></div>`;
  }
  function ligarPin(raiz, id, aoCompletar) {
    const pin = raiz.querySelector('#' + id), caixa = pin.parentElement, cels = [...caixa.querySelectorAll('.cel-pin')];
    let anterior = 0;
    const mostrar = () => {
      const n = pin.value.length;
      cels.forEach((c, i) => {
        c.classList.toggle('ativa', i === Math.min(n, 3)); c.classList.toggle('cheia', i < n);
        if (i < n && i >= anterior) c.innerHTML = '<span>•</span>';
        if (i >= n) c.innerHTML = '';
      });
      anterior = n;
    };
    pin.addEventListener('focus', mostrar);
    pin.addEventListener('pin-limpo', () => { anterior = 0; mostrar(); });
    pin.addEventListener('input', () => {
      pin.value = pin.value.replace(/\D/g, '').slice(0, 4);
      pin.removeAttribute('aria-invalid'); caixa.classList.remove('invalido');
      mostrar();
      if (pin.value.length === 4 && aoCompletar) aoCompletar();
    });
    mostrar();
    return pin;
  }

  /* ---------- Entrada na versão online (página do Claude) ---------- */
  function entradaNuvem(vista) {
    const N = A.nuvem, meu = A.perfil(N.eu), perfis = A.estado.perfis;
    const podeCriar = N.podeEscrever !== false;
    if (!meu && podeCriar && (criando || !perfis.length)) {
      vista.innerHTML = `<div class="entrada"><h1>Boas-vindas ao Meus processos</h1>
        <p class="sub">Crie o seu perfil para ter o seu painel. ${N.tipo === 'supabase' ? 'Você já entrou com o seu usuário e senha' : 'Você já entrou com a sua conta do Claude'}, então não precisa de código.</p><div id="entradaCaixa"></div></div>`;
      return mostrarCriarNuvem(vista);
    }
    const acessoDe = id => id === N.eu ? 'dono' : N.tipo === 'supabase' ? (N.admin ? 'convidado' : 'leitura') : (N.podeEscrever === false ? 'leitura' : 'convidado');
    vista.innerHTML = `<div class="entrada">
      <h1>${perfis.length ? 'Qual painel você quer abrir?' : 'Ainda não há painéis'}</h1>
      <p class="sub">${perfis.length ? (N.podeEscrever === false ? 'Seu acesso é só para ver. Escolha um painel.' : N.tipo === 'supabase' ? (N.admin ? 'O seu painel e os dos colegas. Como administração, você também pode alterar os dos colegas.' : 'O seu painel e os dos colegas. Os dos colegas abrem só para ver.') : 'O seu painel e os dos colegas. Nos dos colegas você pode ajudar, e tudo fica registrado no diário de cada processo.')
        : 'Quem tiver acesso para editar cria o primeiro perfil. Peça para a pessoa dona da página criar o dela.'}</p>
      <ul class="pessoas" aria-label="Painéis">
        ${perfis.map((p, i) => `<li style="animation-delay:${i * 50}ms"><button type="button" class="pessoa" data-id="${p.id}" style="--c:${p.cor};--cbg:${p.bg}">${A.avatar(p, 'grande')}<span class="ini">${A.esc(p.ini)}${p.id === N.eu ? ' (você)' : ''}</span><span class="funcao">${N.tipo === 'supabase' ? 'Servidor' : A.esc(p.funcao || '')}</span></button></li>`).join('')}
        ${!meu && podeCriar ? `<li><button type="button" class="pessoa nova" id="novaPessoa"><span class="avatar grande">${A.ic('mais')}</span><span class="ini">Criar o meu</span><span class="funcao">Perfil novo</span></button></li>` : ''}
      </ul></div>`;
    vista.querySelectorAll('.pessoa[data-id]').forEach(b => b.onclick = () => { A.entrarComo(b.dataset.id, acessoDe(b.dataset.id)); location.hash = '#/painel'; });
    const nova = vista.querySelector('#novaPessoa');
    if (nova) nova.onclick = () => { criando = true; A.redesenhar(); };
  }
  function mostrarCriarNuvem(vista) {
    const cx = vista.querySelector('#entradaCaixa');
    const usadas = A.estado.perfis.map(p => p.cor);
    const cor = A.CORES_PERFIL.find(c => !usadas.includes(c[0])) || A.CORES_PERFIL[A.estado.perfis.length % A.CORES_PERFIL.length];
    cx.innerHTML = `<form class="cartao-form" id="fCriar" novalidate aria-labelledby="t-criar">
      <h2 id="t-criar">Seu perfil</h2>
      <p class="secundario" style="margin-bottom:16px">Só as iniciais aparecem para os colegas. O nome completo não é pedido.</p>
      <div class="grade-campos">
        <div class="campo"><label for="cIni">Iniciais</label><input id="cIni" maxlength="8" placeholder="L.R." autocomplete="off"><div class="erro" hidden></div></div>
        ${A.nuvem.tipo === 'supabase' ? '' : `<div class="campo"><label for="cFun">Função</label><select id="cFun">${FUNCOES.map(f => `<option>${f}</option>`).join('')}</select></div>`}
      </div>
      <div class="form-botoes">${A.estado.perfis.length ? '<button class="btn btn-grande" type="button" id="cCancelar">Cancelar</button>' : ''}<button class="btn btn-primario btn-grande" type="submit">Criar meu perfil e entrar</button></div>
    </form>`;
    const f = cx.querySelector('#fCriar');
    f.querySelector('#cIni').focus();
    const can = f.querySelector('#cCancelar'); if (can) can.onclick = () => { criando = false; A.redesenhar(); };
    f.querySelector('#cIni').oninput = e => { e.target.removeAttribute('aria-invalid'); e.target.parentElement.querySelector('.erro').hidden = true; };
    f.onsubmit = e => {
      e.preventDefault();
      const c = f.querySelector('#cIni'), m = c.parentElement.querySelector('.erro');
      let ini = c.value.trim().toUpperCase().replace(/\s+/g, '');
      const erro = t => { c.setAttribute('aria-invalid', 'true'); m.textContent = t; m.hidden = false; c.focus(); };
      if (!ini) return erro('Escreva as suas iniciais.');
      if (!ini.includes('.')) ini = ini.split('').join('.') + '.';
      if (A.estado.perfis.some(p => p.ini === ini)) return erro('Já existe alguém com essas iniciais. Acrescente uma letra.');
      const equipe = A.nuvem.tipo === 'supabase';
      const p = { id: A.nuvem.eu, ini, funcao: equipe ? 'Servidor' : f.querySelector('#cFun').value, cor: cor[0], bg: cor[1], lembrete: { ativo: !equipe && !!A.nuvem.dono, hora: '17:00' }, criadoEm: new Date().toISOString() };
      A.estado.perfis.push(p);
      A.estado.regras[p.id] = A.regrasNovas();
      A.salvarJa();
      criando = false;
      A.entrarComo(p.id, 'dono');
      location.hash = '#/painel';
      A.avisar(A.nuvem.tipo === 'supabase' ? 'Perfil criado. Agora cadastre os seus processos em Processos.' : 'Perfil criado. Agora leia a planilha para trazer os seus processos.');
    };
  }

  /* Criar um perfil */
  function mostrarCriar(vista) {
    const cx = vista.querySelector('#entradaCaixa');
    const lista = vista.querySelector('#pessoas');
    if (lista) { lista.classList.remove('escolhendo'); lista.querySelectorAll('.pessoa').forEach(b => b.setAttribute('aria-pressed', 'false')); }
    const usadas = A.estado.perfis.map(p => p.cor);
    const cor = A.CORES_PERFIL.find(c => !usadas.includes(c[0])) || A.CORES_PERFIL[A.estado.perfis.length % A.CORES_PERFIL.length];
    cx.innerHTML = `<form class="cartao-form" id="fCriar" novalidate aria-labelledby="t-criar">
      <h2 id="t-criar">${A.estado.perfis.length ? 'Nova pessoa' : 'Seu perfil'}</h2>
      <p class="secundario" style="margin-bottom:16px">Só as iniciais aparecem nas telas. O nome completo não é pedido.</p>
      <div class="grade-campos">
        <div class="campo"><label for="cIni">Iniciais</label><input id="cIni" maxlength="8" placeholder="L.R." autocomplete="off"><div class="erro" hidden></div></div>
        <div class="campo"><label for="cFun">Função</label><select id="cFun">${FUNCOES.map(f => `<option>${f}</option>`).join('')}</select></div>
        <div class="campo"><label for="cP1">Código pessoal <small>(4 números, só seu)</small></label><input id="cP1" inputmode="numeric" maxlength="4" autocomplete="new-password" type="password"><div class="erro" hidden></div></div>
        <div class="campo"><label for="cP2">Repita o código pessoal</label><input id="cP2" inputmode="numeric" maxlength="4" autocomplete="new-password" type="password"><div class="erro" hidden></div></div>
        <div class="campo"><label for="cC">Código de consulta <small>(4 números, para passar a quem quiser)</small></label><input id="cC" inputmode="numeric" maxlength="4" autocomplete="off"><div class="erro" hidden></div></div>
        <div class="campo"><label for="cEd">Quem usa o código de consulta pode</label><select id="cEd"><option value="nao">Só ver</option><option value="sim">Ver e editar</option></select></div>
      </div>
      <div class="form-botoes">${A.estado.perfis.length ? '<button class="btn btn-grande" type="button" id="cCancelar">Cancelar</button>' : ''}<button class="btn btn-primario btn-grande" type="submit">${A.estado.perfis.length ? 'Criar perfil' : 'Criar meu perfil e entrar'}</button></div>
    </form>`;
    const f = cx.querySelector('#fCriar');
    f.querySelector('#cIni').focus();
    const can = f.querySelector('#cCancelar'); if (can) can.onclick = () => { criando = false; A.redesenhar(); };
    f.querySelectorAll('input').forEach(i => i.oninput = () => { i.removeAttribute('aria-invalid'); i.parentElement.querySelector('.erro')?.setAttribute('hidden', ''); if (i.inputMode === 'numeric') i.value = i.value.replace(/\D/g, ''); });
    f.onsubmit = async e => {
      e.preventDefault();
      const v = id => f.querySelector('#' + id).value.trim();
      const erro = (id, t) => { const c = f.querySelector('#' + id), m = c.parentElement.querySelector('.erro'); c.setAttribute('aria-invalid', 'true'); m.textContent = t; m.hidden = false; c.focus(); };
      let ini = v('cIni').toUpperCase().replace(/\s+/g, '');
      if (!ini) return erro('cIni', 'Escreva as suas iniciais.');
      if (!ini.includes('.')) ini = ini.split('').join('.') + '.';
      if (A.estado.perfis.some(p => p.ini === ini)) return erro('cIni', 'Já existe alguém com essas iniciais. Acrescente uma letra.');
      if (!/^\d{4}$/.test(v('cP1'))) return erro('cP1', 'O código pessoal precisa ter 4 números.');
      if (v('cP1') !== v('cP2')) return erro('cP2', 'Os dois códigos pessoais não são iguais.');
      if (!/^\d{4}$/.test(v('cC'))) return erro('cC', 'O código de consulta precisa ter 4 números.');
      if (v('cC') === v('cP1')) return erro('cC', 'Use um código de consulta diferente do pessoal.');
      const p = { id: 'u' + A.uid(), ini, funcao: v('cFun'), cor: cor[0], bg: cor[1], hashPessoal: await A.embaralhar(v('cP1')), hashConsulta: await A.embaralhar(v('cC')), consultaEdita: v('cEd') === 'sim', criadoEm: new Date().toISOString() };
      const primeiro = !A.estado.perfis.length;
      A.estado.perfis.push(p);
      A.estado.regras[p.id] = A.regrasPadrao();
      A.salvarJa();
      criando = false;
      if (primeiro) { A.entrarComo(p.id, 'dono'); location.hash = '#/painel'; A.avisar('Perfil criado. Agora leia a planilha para trazer os seus processos.'); }
      else { A.redesenhar(); A.avisar(`Perfil de ${ini} criado. A pessoa já pode entrar com o código pessoal.`); }
    };
  }

  /* ================= Tela: Meu perfil ================= */
  A.telaPerfil = vista => {
    const p = A.dono();
    if (A.sessao.acesso !== 'dono') { vista.innerHTML = `<main class="estreito"><h1>Perfil</h1><p class="aviso-suave" style="margin-top:16px">${A.ic('olho')} Só a pessoa dona do painel mexe no perfil.</p></main>`; return; }
    vista.innerHTML = `<main class="estreito">
      <h1>${A.semPlanilha() ? 'Meu perfil' : 'Meu perfil e códigos'}</h1>
      <form class="meu-perfil" id="fPerfil" novalidate style="margin-top:24px">
        <fieldset><legend>Como você aparece</legend>
          <div class="quem">${A.avatar(p, 'medio')}<div class="campo" style="flex:1"><label for="pIni">Iniciais</label><input id="pIni" value="${A.esc(p.ini)}" maxlength="8"></div></div>
          ${A.semPlanilha() ? `<p class="secundario" style="margin-top:12px">Para a equipe você aparece como <strong>Servidor</strong>.</p>` : ''}
          <div class="campo" style="margin-top:12px" ${A.semPlanilha() ? 'hidden' : ''}><label for="pFun">Função</label><select id="pFun">${FUNCOES.map(f => `<option ${p.funcao === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <p class="secundario" style="margin-top:12px">Em breve: escolher um desenho ou colocar uma foto pequena no lugar das iniciais.</p>
        </fieldset>
        <fieldset ${A.semPlanilha() ? 'hidden' : ''}><legend>Lembrete de fim de expediente</legend>
          <label class="opcao"><input type="checkbox" id="pLemb" ${p.lembrete && p.lembrete.ativo ? 'checked' : ''}> Avisar para atualizar a planilha</label>
          <div class="campo" style="margin-top:8px"><label for="pHora">Horário (dias úteis)</label><input id="pHora" type="time" value="${A.esc((p.lembrete && p.lembrete.hora) || '17:00')}" style="max-width:140px"></div>
          <p class="secundario" style="margin-top:8px">O aviso aparece no topo do sistema, se ele estiver aberto, com quantas mudanças estão esperando.</p>
        </fieldset>
        ${A.modo === 'nuvem' ? '' : `<fieldset><legend>Trocar códigos</legend>
          <p class="secundario" style="margin-bottom:8px">Deixe em branco o que não quiser trocar.</p>
          <div class="campo codigo-linha"><label for="pP">Novo código pessoal</label><input id="pP" inputmode="numeric" maxlength="4" type="password" autocomplete="new-password"></div>
          <div class="campo codigo-linha" style="margin-top:8px"><label for="pC">Novo código de consulta</label><input id="pC" inputmode="numeric" maxlength="4" autocomplete="off"></div>
        </fieldset>
        <fieldset><legend>Quem entra com o código de consulta pode</legend>
          <label class="opcao"><input type="radio" name="ed" value="nao" ${p.consultaEdita ? '' : 'checked'}> Só ver</label>
          <label class="opcao"><input type="radio" name="ed" value="sim" ${p.consultaEdita ? 'checked' : ''}> Ver e editar</label>
          <p class="secundario" style="margin-top:8px">Trocar o código de consulta tira o acesso de quem tinha o antigo.</p>
        </fieldset>`}
        <div class="erro" id="pErro" role="alert" hidden style="grid-column:1/-1"></div>
        <div class="rodape"><a class="btn" href="#/painel">Cancelar</a><button class="btn btn-primario" type="submit">Salvar</button></div>
      </form>
    </main>`;
    const f = vista.querySelector('#fPerfil');
    f.querySelectorAll('input[inputmode=numeric]').forEach(i => i.oninput = () => { i.value = i.value.replace(/\D/g, ''); });
    f.onsubmit = async e => {
      e.preventDefault();
      const er = f.querySelector('#pErro'), pp = f.querySelector('#pP')?.value || '', pc = f.querySelector('#pC')?.value || '';
      let ini = f.querySelector('#pIni').value.trim().toUpperCase().replace(/\s+/g, '');
      const falha = t => { er.textContent = t; er.hidden = false; };
      if (!ini) return falha('As iniciais não podem ficar em branco.');
      if (!ini.includes('.')) ini = ini.split('').join('.') + '.';
      if (A.estado.perfis.some(x => x.ini === ini && x.id !== p.id)) return falha('Já existe alguém com essas iniciais.');
      if (pp && !/^\d{4}$/.test(pp)) return falha('O código pessoal precisa ter 4 números.');
      if (pc && !/^\d{4}$/.test(pc)) return falha('O código de consulta precisa ter 4 números.');
      if (pp && pc && pp === pc) return falha('Os dois códigos precisam ser diferentes.');
      const hp = pp ? await A.embaralhar(pp) : p.hashPessoal, hc = pc ? await A.embaralhar(pc) : p.hashConsulta;
      if (hp === hc) return falha('Os dois códigos precisam ser diferentes.');
      Object.assign(p, { ini, funcao: f.querySelector('#pFun').value, lembrete: { ativo: f.querySelector('#pLemb').checked, hora: f.querySelector('#pHora').value || '17:00' } });
      if (A.modo !== 'nuvem') Object.assign(p, { hashPessoal: hp, hashConsulta: hc, consultaEdita: f.querySelector('[name=ed]:checked').value === 'sim' });
      A.salvarJa();
      location.hash = '#/painel';
      A.avisar('Perfil salvo.');
    };
  };
})(window.App);
