/* Equipe: tela só da administração. Ver todos os servidores, passar processos de um para outro,
   tirar quem saiu e definir as regras que cada servidor novo recebe. O banco confere quem é admin. */
(function (A) {
  let passando = null;

  A.telaEquipe = vista => {
    const eq = A.estado.equipe || (A.estado.equipe = {});
    const hoje = A.hojeIso(), em30 = A.somar(hoje, 30);
    const linhas = A.estado.perfis.slice().sort((a, b) => a.ini.localeCompare(b.ini)).map(p => {
      const procs = A.estado.processos.filter(x => x.dono === p.id);
      const ativos = procs.filter(x => !x.arquivado);
      const ultima = procs.map(x => x.atualizadoEm || x.criadoEm || '').sort().pop();
      return { p, procs, ativos, proximos: ativos.filter(x => x.inicio && x.inicio >= hoje && x.inicio <= em30).length,
        criticos: ativos.filter(x => A.situacao(x) === 'critico').length, ultima };
    });
    const padrao = eq.regras;
    vista.innerHTML = `<main>
      <h1>Equipe</h1>
      <p class="secundario" style="margin-top:6px;max-width:64ch">Só a administração vê esta tela. Para a equipe, todo mundo aparece como Servidor.</p>
      <section style="margin-top:24px" aria-labelledby="t-serv">
        <h2 id="t-serv">Servidores <span class="secundario" style="font-size:var(--t-base)">(${linhas.length})</span></h2>
        <div class="tabela-rolagem" style="margin-top:8px"><table class="tabela"><thead><tr>
          <th scope="col">Servidor</th><th scope="col">Processos ativos</th><th scope="col">Eventos nos próximos 30 dias</th><th scope="col">Críticos</th><th scope="col">Última mudança</th><th scope="col"><span class="sr">Ações</span></th>
        </tr></thead><tbody>
        ${linhas.map(l => `<tr>
          <td><span style="display:inline-flex;align-items:center;gap:8px">${A.avatar(l.p)}<strong>${A.esc(l.p.ini)}</strong>${l.p.id === A.euId() ? ' <span class="secundario">(você)</span>' : ''}</span></td>
          <td>${l.ativos.length}${l.procs.length > l.ativos.length ? ` <span class="secundario">+ ${l.procs.length - l.ativos.length} arquivado${l.procs.length - l.ativos.length > 1 ? 's' : ''}</span>` : ''}</td>
          <td>${l.proximos}</td>
          <td>${l.criticos ? `<span style="color:var(--critico);font-weight:700">${l.criticos}</span>` : '0'}</td>
          <td>${l.ultima ? A.fmtAno(l.ultima.slice(0, 10)) : '<span class="secundario">nada ainda</span>'}</td>
          <td style="white-space:nowrap;text-align:right">
            <button class="btn" type="button" data-abrir="${l.p.id}">Abrir painel</button>
            ${l.p.id !== A.euId() && l.procs.length ? `<button class="btn" type="button" data-passar="${l.p.id}">Passar processos</button>` : ''}
            ${l.p.id !== A.euId() && !l.procs.length ? `<button class="btn btn-perigo" type="button" data-tirar="${l.p.id}">Tirar da equipe</button>` : ''}
          </td></tr>
          ${passando === l.p.id ? `<tr><td colspan="6"><form class="cartao-form" id="fPassar" style="margin:4px 0 8px">
            <h3>Passar os ${l.procs.length} processo${l.procs.length > 1 ? 's' : ''} de ${A.esc(l.p.ini)} para</h3>
            <div class="form-botoes" style="justify-content:flex-start;flex-wrap:wrap;margin-top:8px">
              <select id="passarPara" class="btn" aria-label="Servidor que vai receber">${A.estado.perfis.filter(x => x.id !== l.p.id).map(x => `<option value="${x.id}">${A.esc(x.ini)}</option>`).join('')}</select>
              <button class="btn btn-primario" type="submit">Passar</button><button class="btn" type="button" id="passarCancelar">Cancelar</button>
            </div><p class="secundario" style="margin-top:8px">Fica anotado no diário de cada processo. Dá para desfazer logo depois.</p></form></td></tr>` : ''}`).join('')}
        </tbody></table></div>
        <p class="secundario" style="margin-top:8px;max-width:70ch">"Tirar da equipe" só aparece para quem não tem processos (passe os processos antes). Isso apaga o perfil; para bloquear a conta de vez, apague o usuário no Supabase, em Authentication → Users.</p>
      </section>
      <section class="cartao-form" aria-labelledby="t-padrao">
        <h2 id="t-padrao">Regras da equipe</h2>
        <p class="secundario" style="max-width:66ch">São as regras de prazo que cada servidor recebe ao criar o perfil. Depois, cada um pode ajustar as suas.
          ${padrao ? `Padrão atual: as suas regras, gravadas em ${A.fmtAno(padrao.gravadoEm || hoje)}.` : 'Padrão atual: as regras que vêm com o sistema.'}</p>
        <div class="form-botoes" style="justify-content:flex-start;flex-wrap:wrap">
          <button class="btn btn-primario" type="button" id="usarMinhas">Usar as minhas regras como padrão</button>
          <a class="btn" href="#/regras">Ver as minhas regras</a>
          ${padrao ? '<button class="btn" type="button" id="aplicarTodos">Copiar o padrão para todos os servidores</button>' : ''}
        </div>
      </section>
    </main>`;

    vista.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => {
      const id = b.dataset.abrir;
      A.entrarComo(id, id === A.euId() ? 'dono' : 'convidado');
      location.hash = '#/painel';
    });
    vista.querySelectorAll('[data-passar]').forEach(b => b.onclick = () => { passando = b.dataset.passar; A.redesenhar(); const s = vista.querySelector('#passarPara'); if (s) s.focus(); });
    const fp = vista.querySelector('#fPassar');
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
    vista.querySelector('#usarMinhas').onclick = () => {
      const antes = eq.regras;
      eq.regras = { ...A.clonar(A.regras(A.euId())), gravadoEm: hoje };
      A.salvar(); A.redesenhar();
      A.avisar('Pronto: quem criar perfil daqui para frente recebe as suas regras.', () => { if (antes) eq.regras = antes; else delete eq.regras; A.salvar(); A.redesenhar(); });
    };
    const at = vista.querySelector('#aplicarTodos');
    if (at) at.onclick = () => {
      const outros = A.estado.perfis.filter(p => p.id !== A.euId());
      if (!outros.length) return A.avisar('Ainda não há outros servidores.');
      if (!confirm(`Trocar as regras de ${outros.length} servidor${outros.length > 1 ? 'es' : ''} pelo padrão da equipe? Os processos já cadastrados não mudam.`)) return;
      const antes = outros.map(p => [p.id, A.estado.regras[p.id]]);
      outros.forEach(p => { const r = A.clonar(eq.regras); delete r.gravadoEm; A.estado.regras[p.id] = r; });
      A.salvar();
      A.avisar('Regras copiadas para todos.', () => { antes.forEach(([id, r]) => { A.estado.regras[id] = r; }); A.salvar(); });
    };
  };
})(window.App);
