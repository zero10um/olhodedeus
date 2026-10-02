/* Liga tudo: navegação entre telas, topo, perfil e avisos gerais. */
(function (A) {
  const vista = () => document.getElementById('vista');
  const rota = () => (location.hash || '#/painel').replace(/^#\/?/, '').split('/');

  function topo(r) {
    const el = document.getElementById('topo'), dono = A.dono(), pagina = r[0];
    if (pagina === 'entrar' || !dono) { el.innerHTML = ''; el.hidden = true; document.getElementById('faixas').innerHTML = ''; return; }
    el.hidden = false;
    const supa = A.modo === 'nuvem' && A.nuvem.tipo === 'supabase';
    const modoTxt = { dono: 'Seu painel', leitura: 'Só leitura', convidado: 'Editando com permissão' }[A.sessao.acesso];
    const link = (h, n, ativo) => `<a href="#/${h}" ${ativo ? 'aria-current="page"' : ''}>${n}</a>`;
    el.innerHTML = `<a class="marca" href="#/painel">Meus processos</a>
      ${pagina === 'painel' ? `<div class="busca" role="search">${A.ic('busca')}<label class="sr" for="buscaTopo">Buscar curso ou número SEI</label><input id="buscaTopo" type="search" placeholder="Buscar curso ou SEI" autocomplete="off"></div>` : '<span style="margin-left:auto"></span>'}
      ${A.modo === 'nuvem' ? '<span class="status-nuvem" id="statusNuvem" role="status" aria-live="polite"></span>' : ''}
      <nav class="menu" aria-label="Principal">${link('painel', 'Painel', pagina === 'painel')}${link('processos', 'Processos', pagina === 'processos' || pagina === 'processo')}${link('agenda', 'Agenda da equipe', pagina === 'agenda')}${link('regras', 'Regras de prazo', pagina === 'regras')}${supa ? link('relatorio', 'Relatório', pagina === 'relatorio') : link('planilha', 'Planilha', pagina === 'planilha')}${supa && A.nuvem.admin ? link('equipe', 'Equipe', pagina === 'equipe') : ''}</nav>
      <div class="perfil"><button type="button" class="perfil-btn" aria-haspopup="menu" aria-expanded="false" id="perfilBtn">${A.avatar(dono)}<span>${A.esc(dono.ini)}</span>${A.ic('seta')}<span class="sr">, ${modoTxt}. Abrir menu do perfil</span></button>
        <div class="menu-flutuante" role="menu" hidden>
          <div class="quem" role="none"><strong>Painel de ${A.esc(dono.ini)}</strong><span class="secundario">${supa ? 'Servidor' : A.esc(dono.funcao || '')}. ${modoTxt}.</span></div>
          ${A.sessao.acesso === 'dono' ? `<a role="menuitem" href="#/perfil">${A.ic('pessoa')} ${supa ? 'Meu perfil' : 'Meu perfil e códigos'}</a>` : ''}
          <a role="menuitem" href="#/${supa ? 'relatorio' : 'planilha'}">${A.ic('baixar')} ${supa ? 'Relatório e cópia' : 'Cópia de segurança'}</a>
          <button type="button" role="menuitem" id="trocarPessoa">${A.ic('sair')} ${A.modo === 'nuvem' ? 'Ver outro painel' : 'Trocar de pessoa'}</button>
          ${supa ? `<button type="button" role="menuitem" id="sairConta">${A.ic('cadeado')} Sair da conta (${A.esc(A.supa.usuarioDe(A.supa.usuario.email))})</button>` : ''}
        </div></div>`;
    const bt = document.getElementById('buscaTopo');
    if (bt) bt.oninput = () => A.buscarNoPainel(bt.value);
    const caixa = el.querySelector('.perfil');
    A.ligarMenu(caixa, caixa.querySelector('#perfilBtn'), caixa.querySelector('.menu-flutuante'), '[role=menuitem]');
    caixa.querySelector('#trocarPessoa').onclick = () => { A.sair(); location.hash = '#/entrar'; };
    const sc = caixa.querySelector('#sairConta'); if (sc) sc.onclick = () => A.supa.sairDaConta();
    document.body.classList.toggle('leitura', !A.podeEditar());

    const faixas = [];
    if (A.sessao.acesso === 'leitura') faixas.push(`<div class="faixa-acesso">${A.ic('olho')} Você está vendo o painel de <strong>${A.esc(dono.ini)}</strong> só para ler. Nada aqui pode ser alterado. <a href="#/entrar" id="sairFaixa">Voltar à tela inicial</a></div>`);
    if (A.sessao.acesso === 'convidado') faixas.push(`<div class="faixa-acesso">${A.ic('pessoa')} Você está no painel de <strong>${A.esc(dono.ini)}</strong> e pode editar, ${supa ? 'como administração' : 'porque a pessoa permitiu'}. <a href="#/entrar" id="sairFaixa">Voltar à tela inicial</a></div>`);
    const lemb = lembreteAgora();
    if (lemb) faixas.push(`<div class="faixa-aviso faixa-lembrete">${A.ic('relogio')} São ${A.esc(lemb.hora)}: hora de atualizar a planilha. ${lemb.n ? `${lemb.n} mudança${lemb.n > 1 ? 's' : ''} esperando.` : 'Nada esperando hoje.'} <a href="#/planilha" id="lembIr">Abrir a planilha</a> <button type="button" class="btn-texto" id="lembOk">Hoje não</button></div>`);
    if (A.modo === 'nuvem') { /* online não depende de cópia de segurança */ }
    else if (!A.armazenamentoOk) faixas.push(`<div class="faixa-aviso">Este navegador não está guardando os dados. Antes de fechar, baixe a cópia de segurança em <a href="#/planilha">Planilha</a>.</div>`);
    else if (A.sessao.acesso === 'dono' && A.estado.processos.length && (!A.estado.ultimaCopia || A.entre(A.estado.ultimaCopia, A.hojeIso()) > 7) && pagina !== 'planilha')
      faixas.push(`<div class="faixa-aviso">${A.estado.ultimaCopia ? 'Faz mais de uma semana desde a última cópia de segurança.' : 'Você ainda não baixou uma cópia de segurança.'} <a href="#/planilha">Baixar agora</a></div>`);
    document.getElementById('faixas').innerHTML = faixas.join('');
    const sf = document.getElementById('sairFaixa'); if (sf) sf.onclick = () => A.sair();
    const visto = () => { A.prefs().lembreteVisto = A.hojeIso(); A.salvar(); topo(rota()); };
    const li = document.getElementById('lembIr'); if (li) li.addEventListener('click', visto);
    const lo = document.getElementById('lembOk'); if (lo) lo.onclick = visto;
    A.mostrarStatus();
  }

  /* Lembrete de fim de expediente: só no próprio painel, em dias úteis, depois do horário escolhido */
  function lembreteAgora() {
    if (!A.estado) return null;
    const eu = A.perfil(A.euId());
    if (A.modo === 'nuvem' && A.nuvem.tipo === 'supabase') return null;
    if (!eu || !eu.lembrete || !eu.lembrete.ativo || !A.sessao || A.sessao.perfilId !== eu.id || A.sessao.acesso !== 'dono') return null;
    const agora = new Date(), dia = agora.getDay();
    if (dia === 0 || dia === 6) return null;
    const [h, m] = String(eu.lembrete.hora || '17:00').split(':').map(Number);
    if (agora.getHours() * 60 + agora.getMinutes() < h * 60 + (m || 0)) return null;
    if (A.prefs().lembreteVisto === A.hojeIso()) return null;
    const n = (A.paraPlanilha ? A.paraPlanilha() : []).reduce((s, x) => s + x.m.length, 0);
    return { hora: eu.lembrete.hora || '17:00', n };
  }
  let lembreteMostrado = false;
  setInterval(() => { const l = !!lembreteAgora(); if (l !== lembreteMostrado) { lembreteMostrado = l; topo(rota()); } }, 60000);

  A.mostrarStatus = () => {
    const el = document.getElementById('statusNuvem'); if (!el || A.modo !== 'nuvem') return;
    const N = A.nuvem;
    el.dataset.estado = N.status;
    el.innerHTML = N.status === 'salvando' ? `${A.ic('atualizar', 'ic-sm')} Salvando${N.faltam > 1 ? ` (${N.faltam})` : '…'}`
      : N.status === 'erro' ? `${A.ic('alerta', 'ic-sm')} Não salvou` : N.status === 'sem acesso' ? `${A.ic('cadeado', 'ic-sm')} Sem acesso`
      : `${A.ic('check', 'ic-sm')} ${N.podeEscrever === false ? 'Só leitura' : 'Salvo'}`;
  };

  function desenhar() {
    const r = rota(), pagina = r[0] || 'painel';
    if (!A.estado.perfis.length || !A.sessao || !A.dono()) {
      if (pagina !== 'entrar') { location.replace('#/entrar'); return; }
    }
    if (pagina === 'entrar' && A.sessao && A.dono() && !A.estado.perfis.length) A.sair();
    topo(r);
    const v = vista();
    document.title = 'Meus processos';
    if (pagina === 'entrar') A.telaEntrada(v);
    else if (pagina === 'processos') A.telaProcessos(v, r[1] === 'novo');
    else if (pagina === 'processo') A.telaProcesso(v, r[1]);
    else if (pagina === 'regras') A.telaRegras(v);
    else if (pagina === 'planilha' && A.semPlanilha()) { location.replace('#/relatorio'); return; }
    else if (pagina === 'planilha') A.telaPlanilha(v);
    else if (pagina === 'equipe') { if (A.nuvem.admin) A.telaEquipe(v); else { location.replace('#/painel'); return; } }
    else if (pagina === 'agenda') A.telaAgenda(v);
    else if (pagina === 'relatorio') A.telaRelatorio(v);
    else if (pagina === 'perfil') A.telaPerfil(v);
    else A.telaPainel(v);
  }
  A.redesenhar = () => desenhar();

  /* O marca-texto só "passa" quando a tela abre, não a cada clique */
  let tGrifo;
  const grifar = () => { document.body.classList.add('animar-grifos'); clearTimeout(tGrifo); tGrifo = setTimeout(() => document.body.classList.remove('animar-grifos'), 1400); };
  A.grifar = grifar;
  window.addEventListener('hashchange', () => {
    grifar();
    if (rota()[0] === 'entrar' && A.sessao) A.sair();
    const v = vista(); v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
    A.mudar(desenhar).then(() => { window.scrollTo(0, 0); const h = v.querySelector('h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } });
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (A.fecharDicasPainel) A.fecharDicasPainel();
    if (document.getElementById('cronoEditor') && A.fecharEditorCrono) A.fecharEditorCrono();
  });
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => A.redesenharLinhaPainel && A.redesenharLinhaPainel(), 150); });
  window.addEventListener('beforeunload', () => A.salvarJa());
  window.addEventListener('storage', e => { if (A.modo === 'local' && e.key === 'meus-processos-v1') { A.carregar(); desenhar(); } });

  async function iniciar() {
    A.ligarAviso();
    document.getElementById('lista-setores').innerHTML = ['GCI', 'Unidade orçamentária', 'Setor financeiro', 'Setor de viagens', 'Unidade superior', 'Gabinete'].map(s => `<option value="${s}">`).join('');
    let online = false;
    if (A.supa && A.supa.disponivel()) {
      vista().innerHTML = `<main class="estreito"><p class="secundario" role="status">Conectando…</p></main>`;
      try {
        const u = (await A.supa.sessaoAtual()) || (await A.supa.telaLogin(vista()));
        vista().innerHTML = `<main class="estreito"><p class="secundario" role="status">Abrindo os dados da equipe…</p></main>`;
        online = await A.nuvem.iniciarSupabase(u);
      } catch (e) {
        vista().innerHTML = `<main class="estreito"><h1>Não deu para abrir os dados</h1><p>${A.esc(e && e.message || 'Erro desconhecido')}</p><p class="secundario">Confira a internet e recarregue a página. Se continuar, avise quem administra o sistema.</p><button class="btn" onclick="App.supa.sairDaConta()">Sair e entrar de novo</button></main>`;
        return;
      }
    }
    else if (window.claude && typeof window.claude.use === 'function') {
      vista().innerHTML = `<main class="estreito"><p class="secundario" role="status">Abrindo os dados compartilhados…</p></main>`;
      try { online = await A.nuvem.iniciar(); } catch (e) { online = false; }
    }
    if (online) {
      const N = A.nuvem, s = A.sessao;
      if (!(s && A.perfil(s.perfilId))) { if (A.perfil(N.eu)) A.entrarComo(N.eu, N.podeEscrever === false ? 'leitura' : 'dono'); else A.sair(); }
    } else A.carregar();
    if (!location.hash || (A.sessao && A.dono() && rota()[0] === 'entrar' && A.modo === 'nuvem')) location.replace(A.sessao && A.dono() ? '#/painel' : '#/entrar');
    grifar();
    desenhar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window.App);
