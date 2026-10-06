/* Equipe: tela só da administração. Servidores e contas, senha esquecida, quem é admin,
   apagar contas (só o admin principal), passar processos, salas, regras da equipe e cópias de segurança. O banco confere quem é admin. */
(function (A) {
  let passando = null, senhaDe = null, contas = null, copias = null, carregando = false;
  const S = () => A.supa;

  async function carregar() {
    if (carregando) return; carregando = true;
    try { contas = await S().rpc('contas_equipe'); A.nuvem.pendentes = contas.filter(c => c.liberada === false).length; } catch (e) { contas = { erro: e.message }; }
    try { copias = await S().rpc('lista_copias'); } catch (e) { copias = { erro: e.message }; }
    carregando = false;
    if (location.hash === '#/equipe') A.redesenhar();
  }
  const conta = id => Array.isArray(contas) ? contas.find(c => c.id === id) : null;
  const senhaSugerida = () => 'pedag-' + Math.random().toString(36).slice(2, 6) + '-' + (1000 + Math.floor(Math.random() * 9000));

  A.telaEquipe = vista => {
    const eq = A.estado.equipe || (A.estado.equipe = {});
    if (contas === null && copias === null) carregar();
    const hoje = A.hojeIso(), em30 = A.somar(hoje, 30);
    const linhas = A.estado.perfis.slice().sort((a, b) => a.ini.localeCompare(b.ini)).map(p => {
      const procs = A.estado.processos.filter(x => x.dono === p.id);
      const ativos = procs.filter(x => !x.arquivado);
      const ultima = procs.map(x => x.atualizadoEm || x.criadoEm || '').sort().pop();
      return { p, c: conta(p.id), procs, ativos, proximos: ativos.filter(x => x.inicio && x.inicio >= hoje && x.inicio <= em30).length,
        criticos: ativos.filter(x => A.situacao(x) === 'critico').length, ultima };
    });
    const semPerfil = Array.isArray(contas) ? contas.filter(c => !A.perfil(c.id) && c.liberada !== false) : [];
    const pendentes = Array.isArray(contas) ? contas.filter(c => c.liberada === false) : [];
    const salas = (eq.salas && eq.salas.lista) || [];
    const padrao = eq.regras;
    const ultimaBaixada = A.prefs().ultimaCopiaEquipe;
    const euPrincipal = !!(conta(A.euId()) || {}).principal;
    const podeApagar = c => euPrincipal && c && c.id !== A.euId() && !c.principal;

    vista.innerHTML = `<main>
      <h1>Equipe</h1>
      <p class="secundario" style="margin-top:6px;max-width:64ch">Só a administração vê esta tela. Para a equipe, todo mundo aparece como Servidor.</p>
      ${contas && contas.erro ? `<p class="aviso-conflito" style="max-width:70ch">${A.ic('alerta')}<span>${A.esc(contas.erro)}</span></p>` : ''}

      ${pendentes.length ? `<section class="cartao-form" aria-labelledby="t-pend" style="margin-top:24px">
        <h2 id="t-pend">Esperando liberação <span class="secundario" style="font-size:var(--t-base)">(${pendentes.length})</span></h2>
        <p class="secundario" style="max-width:66ch">Contas criadas que ainda não veem nada do sistema. Libere só quem você sabe que é da equipe. ${euPrincipal ? 'Se não reconhecer a conta, apague.' : 'Se não reconhecer a conta, avise o admin principal para apagar.'}</p>
        <ul class="eq-salas">${pendentes.map(c => `<li><span>${A.esc(c.usuario)} <span class="secundario" style="font-weight:400">criada em ${A.fmtAno(String(c.criada_em).slice(0, 10))}</span></span><button class="btn btn-primario" type="button" data-liberar="${c.id}">Liberar</button>${podeApagar(c) && !c.processos ? `<button class="btn btn-perigo" type="button" data-apagar="${c.id}">Apagar conta</button>` : ''}</li>`).join('')}</ul>
      </section>` : ''}

      <section style="margin-top:24px" aria-labelledby="t-serv">
        <h2 id="t-serv">Servidores <span class="secundario" style="font-size:var(--t-base)">(${linhas.length})</span></h2>
        <div class="tabela-rolagem" style="margin-top:8px"><table class="tabela"><thead><tr>
          <th scope="col">Servidor</th><th scope="col">Usuário</th><th scope="col">Ativos</th><th scope="col">Eventos em 30 dias</th><th scope="col">Críticos</th><th scope="col">Última mudança</th><th scope="col"><span class="sr">Ações</span></th>
        </tr></thead><tbody>
        ${linhas.map(l => `<tr>
          <td><span style="display:inline-flex;align-items:center;gap:8px">${A.avatar(l.p)}<strong>${A.esc(l.p.ini)}</strong>${l.p.id === A.euId() ? ' <span class="secundario">(você)</span>' : ''}${l.c && l.c.admin ? ` <span class="novo" style="animation:none">${l.c.principal ? 'admin principal' : 'admin'}</span>` : ''}</span></td>
          <td>${l.c ? A.esc(l.c.usuario) : '<span class="secundario">…</span>'}</td>
          <td>${l.ativos.length}${l.procs.length > l.ativos.length ? ` <span class="secundario">+ ${l.procs.length - l.ativos.length} arq.</span>` : ''}</td>
          <td>${l.proximos}</td>
          <td>${l.criticos ? `<span style="color:var(--critico);font-weight:700">${l.criticos}</span>` : '0'}</td>
          <td>${l.ultima ? A.fmtAno(l.ultima.slice(0, 10)) : '<span class="secundario">nada ainda</span>'}</td>
          <td class="eq-acoes">
            <button class="btn" type="button" data-abrir="${l.p.id}">Abrir painel</button>
            ${l.c && (!l.c.principal || l.p.id === A.euId()) ? `<button class="btn" type="button" data-senha="${l.p.id}">Redefinir senha</button>` : ''}
            ${l.c && l.p.id !== A.euId() && !l.c.principal ? `<button class="btn" type="button" data-admin="${l.p.id}" data-ligar="${!l.c.admin}">${l.c.admin ? 'Tirar da administração' : 'Tornar admin'}</button>` : ''}
            ${l.p.id !== A.euId() && l.procs.length ? `<button class="btn" type="button" data-passar="${l.p.id}">Passar processos</button>` : ''}
            ${podeApagar(l.c) && !l.procs.length ? `<button class="btn btn-perigo" type="button" data-apagar="${l.p.id}">Apagar conta</button>`
              : l.p.id !== A.euId() && !l.procs.length && !(l.c && l.c.principal) ? `<button class="btn btn-perigo" type="button" data-tirar="${l.p.id}">Tirar da equipe</button>` : ''}
          </td></tr>
          ${senhaDe === l.p.id ? `<tr><td colspan="7"><form class="cartao-form" id="fSenha" style="margin:4px 0 8px">
            <h3>Senha nova para ${A.esc(l.p.ini)}${l.c ? ` (usuário ${A.esc(l.c.usuario)})` : ''}</h3>
            <p class="secundario" style="margin:4px 0 10px;max-width:64ch">Passe a senha para a pessoa pessoalmente ou por mensagem, e peça para ela trocar em Meu perfil logo que entrar.</p>
            <div class="form-botoes" style="justify-content:flex-start;flex-wrap:wrap;align-items:flex-end">
              <div class="campo" style="min-width:240px"><label for="novaSenha">Senha nova</label><input id="novaSenha" value="${senhaSugerida()}" autocomplete="off" spellcheck="false"></div>
              <button class="btn btn-primario" type="submit">Trocar a senha</button><button class="btn" type="button" id="senhaCancelar">Cancelar</button>
            </div></form></td></tr>` : ''}
          ${passando === l.p.id ? `<tr><td colspan="7"><form class="cartao-form" id="fPassar" style="margin:4px 0 8px">
            <h3>Passar os ${l.procs.length} processo${l.procs.length > 1 ? 's' : ''} de ${A.esc(l.p.ini)} para</h3>
            <div class="form-botoes" style="justify-content:flex-start;flex-wrap:wrap;margin-top:8px">
              <select id="passarPara" class="btn" aria-label="Servidor que vai receber">${A.estado.perfis.filter(x => x.id !== l.p.id).map(x => `<option value="${x.id}">${A.esc(x.ini)}</option>`).join('')}</select>
              <button class="btn btn-primario" type="submit">Passar</button><button class="btn" type="button" id="passarCancelar">Cancelar</button>
            </div><p class="secundario" style="margin-top:8px">Fica anotado no diário de cada processo. Dá para desfazer logo depois.</p></form></td></tr>` : ''}`).join('')}
        </tbody></table></div>
        ${semPerfil.length ? (euPrincipal
          ? `<div style="margin-top:10px"><p class="secundario">Contas criadas que ainda não fizeram o perfil:</p><ul class="eq-salas">${semPerfil.map(c => `<li><span><strong>${A.esc(c.usuario)}</strong> <span class="secundario">criada em ${A.fmtAno(String(c.criada_em).slice(0, 10))}</span></span>${podeApagar(c) && !c.processos ? `<button class="btn btn-perigo" type="button" data-apagar="${c.id}">Apagar conta</button>` : ''}</li>`).join('')}</ul></div>`
          : `<p class="secundario" style="margin-top:10px">Contas criadas que ainda não fizeram o perfil: ${semPerfil.map(c => `<strong>${A.esc(c.usuario)}</strong>`).join(', ')}.</p>`) : ''}
        <p class="secundario" style="margin-top:8px;max-width:72ch">${euPrincipal
          ? '"Apagar conta" tira o acesso de vez: a pessoa não entra mais e o perfil some. Só aparece para quem não tem processos (passe os processos antes). Não dá para desfazer.'
          : '"Tirar da equipe" só aparece para quem não tem processos (passe os processos antes). Apagar a conta de acesso é só com o admin principal.'}</p>
      </section>

      <section class="cartao-form" aria-labelledby="t-salas">
        <h2 id="t-salas">Salas e auditórios</h2>
        <p class="secundario" style="max-width:66ch">Aparecem como opção no campo Local. Quando duas pessoas marcam a mesma sala no mesmo dia e horário, o sistema avisa.</p>
        <ul class="eq-salas">${salas.map((s, i) => `<li><span>${A.esc(s)}</span><button class="btn-icone" type="button" data-sala-tirar="${i}" aria-label="Tirar ${A.esc(s)}">${A.ic('lixo')}</button></li>`).join('') || '<li class="secundario">Nenhuma sala cadastrada ainda.</li>'}</ul>
        <form id="fSala" class="form-botoes" style="justify-content:flex-start;margin-top:10px;align-items:flex-end">
          <div class="campo" style="min-width:260px"><label for="novaSala">Nova sala</label><input id="novaSala" placeholder="Ex.: Auditório (térreo)" autocomplete="off"></div>
          <button class="btn" type="submit">${A.ic('mais')} Acrescentar</button>
        </form>
      </section>

      <section class="cartao-form" aria-labelledby="t-padrao">
        <h2 id="t-padrao">Tipos e regras da equipe</h2>
        <p class="secundario" style="max-width:66ch">Os tipos de processo, os checklists e os prazos agora são um só conjunto para toda a equipe, e só a administração muda. Toda mudança vai sozinha para os processos em andamento.</p>
        <div class="form-botoes" style="justify-content:flex-start"><a class="btn btn-primario" href="#/regras">Abrir Regras de prazo</a></div>
      </section>

      <section class="cartao-form" id="copias" aria-labelledby="t-copias">
        <h2 id="t-copias">Cópias de segurança</h2>
        <p class="secundario" style="max-width:66ch">Todo dia às 6h o banco guarda sozinho um retrato de tudo, e fica com os 30 últimos. Uma vez por semana, baixe a cópia mais nova e guarde no Drive: assim ela fica fora do banco também.
          ${ultimaBaixada ? `Última cópia que você baixou: ${A.fmtAno(ultimaBaixada)}.` : 'Você ainda não baixou nenhuma.'}</p>
        ${copias && copias.erro ? `<p class="aviso-conflito">${A.ic('alerta')}<span>${A.esc(copias.erro)}</span></p>` : ''}
        ${Array.isArray(copias) ? (copias.length ? `<ul class="eq-copias">${copias.slice(0, 7).map((c, i) => `<li><span>${new Date(c.feita_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span><span class="secundario">${c.itens} itens</span><button class="btn${i === 0 ? ' btn-primario' : ''}" type="button" data-copia="${c.id}">${A.ic('baixar')} Baixar</button></li>`).join('')}</ul>` : '<p class="secundario" style="margin-top:8px">Ainda não há cópias no banco. A primeira sai amanhã às 6h, ou faça uma agora.</p>') : '<p class="secundario" style="margin-top:8px">Carregando…</p>'}
        <div class="form-botoes" style="justify-content:flex-start;margin-top:10px"><button class="btn" type="button" id="copiarAgora">Fazer uma cópia agora</button></div>
      </section>
    </main>`;

    const $ = s => vista.querySelector(s);
    vista.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => {
      const id = b.dataset.abrir;
      A.entrarComo(id, id === A.euId() ? 'dono' : 'convidado');
      location.hash = '#/painel';
    });
    vista.querySelectorAll('[data-passar]').forEach(b => b.onclick = () => { passando = b.dataset.passar; senhaDe = null; A.redesenhar(); const s = $('#passarPara'); if (s) s.focus(); });
    vista.querySelectorAll('[data-senha]').forEach(b => b.onclick = () => { senhaDe = b.dataset.senha; passando = null; A.redesenhar(); const s = $('#novaSenha'); if (s) { s.focus(); s.select(); } });
    vista.querySelectorAll('[data-admin]').forEach(b => b.onclick = async () => {
      const p = A.perfil(b.dataset.admin), ligar = b.dataset.ligar === 'true';
      if (!confirm(ligar ? `Dar acesso de administração para ${p.ini}? A pessoa vai poder mexer nos processos de todos, ver esta tela e redefinir senhas.` : `Tirar ${p.ini} da administração?`)) return;
      try { await S().rpc('definir_admin', { alvo: p.id, ligar }); A.avisar(ligar ? `${p.ini} agora é admin. Peça para a pessoa sair e entrar de novo.` : `${p.ini} saiu da administração.`); contas = null; copias = null; carregar(); }
      catch (e) { A.avisar(e.message); }
    });
    const fs = $('#fSenha');
    if (fs) {
      fs.querySelector('#senhaCancelar').onclick = () => { senhaDe = null; A.redesenhar(); };
      fs.onsubmit = async e => {
        e.preventDefault();
        const nova = fs.querySelector('#novaSenha').value.trim(), p = A.perfil(senhaDe);
        if (nova.length < 8) return A.avisar('A senha precisa ter pelo menos 8 caracteres.');
        try { await S().rpc('redefinir_senha', { alvo: senhaDe, nova }); senhaDe = null; A.redesenhar(); A.avisar(`Senha de ${p.ini} trocada para: ${nova}`); }
        catch (x) { A.avisar(x.message); }
      };
    }
    const fp = $('#fPassar');
    if (fp) {
      fp.querySelector('#passarCancelar').onclick = () => { passando = null; A.redesenhar(); };
      fp.onsubmit = e => {
        e.preventDefault();
        const de = A.perfil(passando), para = A.perfil(fp.querySelector('#passarPara').value);
        const procs = A.estado.processos.filter(x => x.dono === de.id);
        procs.forEach(x => { x.dono = para.id; A.anotar(x, 'Sistema', `Processo passado de ${de.ini} para ${para.ini} pela administração.`); });
        passando = null; A.salvar(); A.redesenhar();
        A.avisar(`${procs.length} processo${procs.length > 1 ? 's' : ''} passado${procs.length > 1 ? 's' : ''} para ${para.ini}.`, () => {
          procs.forEach(x => { x.dono = de.id; x.diario.pop(); }); A.salvar(); A.redesenhar();
        });
      };
    }
    vista.querySelectorAll('[data-liberar]').forEach(b => b.onclick = async () => {
      const c = conta(b.dataset.liberar); if (!c) return;
      b.disabled = true;
      try { await S().rpc('liberar_conta', { alvo: c.id, ligar: true }); A.avisar(`Conta ${c.usuario} liberada. A pessoa já pode entrar e criar o perfil.`); contas = null; copias = null; carregar(); }
      catch (e) { b.disabled = false; A.avisar(e.message); }
    });
    vista.querySelectorAll('[data-apagar]').forEach(b => b.onclick = async () => {
      const id = b.dataset.apagar, c = conta(id), p = A.perfil(id);
      if (!c) return;
      const nome = p ? `${p.ini} (usuário ${c.usuario})` : `a conta ${c.usuario}`;
      const digitado = prompt(`Apagar ${nome}? A pessoa não vai mais conseguir entrar, e o perfil dela some. Não dá para desfazer.

Para confirmar, digite o usuário: ${c.usuario}`);
      if (digitado === null) return;
      if (digitado.trim().toLowerCase() !== c.usuario.toLowerCase()) return A.avisar('O usuário digitado não confere. Nada foi apagado.');
      b.disabled = true;
      try {
        await S().rpc('apagar_conta', { alvo: id });
        const i = A.estado.perfis.findIndex(x => x.id === id);
        if (i >= 0) A.estado.perfis.splice(i, 1);
        delete A.estado.regras[id]; delete A.estado.leituras[id];
        if (A.nuvem && A.nuvem.salvo) ['perfis', 'regras', 'leituras'].forEach(col => delete A.nuvem.salvo[col + '/' + id]);
        if (passando === id) passando = null; if (senhaDe === id) senhaDe = null;
        contas = null; copias = null; A.redesenhar(); carregar();
        A.avisar(`Conta ${c.usuario} apagada.`);
      } catch (e) { b.disabled = false; A.avisar(e.message); }
    });
    vista.querySelectorAll('[data-tirar]').forEach(b => b.onclick = () => {
      const p = A.perfil(b.dataset.tirar);
      if (!confirm(`Tirar ${p.ini} da equipe? O perfil some da lista. A conta de acesso continua existindo até ser apagada no Supabase.`)) return;
      const i = A.estado.perfis.indexOf(p), regras = A.estado.regras[p.id], leit = A.estado.leituras[p.id];
      A.estado.perfis.splice(i, 1); delete A.estado.regras[p.id]; delete A.estado.leituras[p.id];
      A.salvar(); A.redesenhar();
      A.avisar(`${p.ini} saiu da equipe.`, () => {
        A.estado.perfis.splice(i, 0, p); if (regras) A.estado.regras[p.id] = regras; if (leit) A.estado.leituras[p.id] = leit;
        A.salvar(); A.redesenhar();
      });
    });

    // salas
    const guardarSalas = lista => { eq.salas = { lista }; A.salvar(); A.redesenhar(); };
    $('#fSala').onsubmit = e => {
      e.preventDefault();
      const nome = $('#novaSala').value.trim(); if (!nome) return;
      if (salas.some(s => A.normSala(s) === A.normSala(nome))) return A.avisar('Essa sala já está na lista.');
      guardarSalas([...salas, nome].sort((a, b) => a.localeCompare(b, 'pt-BR')));
      const ns = vista.querySelector('#novaSala'); if (ns) ns.focus();
    };
    vista.querySelectorAll('[data-sala-tirar]').forEach(b => b.onclick = () => {
      const antes = salas.slice(), nome = salas[+b.dataset.salaTirar];
      guardarSalas(salas.filter((_, i) => i !== +b.dataset.salaTirar));
      A.avisar(`"${nome}" saiu da lista.`, () => guardarSalas(antes));
    });


    // cópias
    vista.querySelectorAll('[data-copia]').forEach(b => b.onclick = async () => {
      try {
        const linhas = await S().rpc('baixar_copia', { qual: +b.dataset.copia });
        const c = (copias || []).find(x => String(x.id) === b.dataset.copia);
        const o = { versao: 1, exportadoEm: new Date().toISOString(), copiaDoBanco: c ? c.feita_em : null, perfis: [], regras: {}, leituras: {}, processos: [], prefs: {}, equipe: {}, config: { lgpd: true } };
        (linhas || []).forEach(r => {
          if (r.col === 'perfis') o.perfis.push(r.dados); else if (r.col === 'processos') o.processos.push(r.dados);
          else if (o[r.col]) o[r.col][r.id] = r.dados;
        });
        const dia = c ? c.feita_em.slice(0, 10) : hoje;
        if (await A.baixar(`copia-equipe-${dia}.json`, JSON.stringify(o, null, 1))) {
          A.prefs().ultimaCopiaEquipe = hoje; A.salvar(); A.redesenhar();
          A.avisar('Cópia baixada. Guarde no Drive, numa pasta só para isso.');
        }
      } catch (e) { A.avisar(e.message); }
    });
    $('#copiarAgora').onclick = async () => {
      try { await S().rpc('copiar_agora'); A.avisar('Cópia feita no banco.'); copias = null; contas = null; carregar(); }
      catch (e) { A.avisar(e.message); }
    };
  };
  /* Quando a tela abre de novo, busca contas e cópias atualizadas */
  window.addEventListener('hashchange', () => { if (location.hash === '#/equipe') { contas = null; copias = null; } });
})(window.App);
