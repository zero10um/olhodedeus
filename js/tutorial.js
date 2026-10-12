/* Como funciona: a ficha de boas-vindas do painel vazio e a página #/como-funciona.
   Quatro passos do fluxo, cada um com uma miniatura feita com as mesmas peças das telas de verdade.
   Nada aqui grava processo: é só demonstração. */
(function (A) {
  let passo = 0;
  const PASSOS = [
    { t: 'Cadastre o processo', d: 'Evento interno ou externo, a data e o número do SEI. Dois minutos.' },
    { t: 'O sistema monta os passos', d: 'O checklist já vem com os prazos contados a partir da data do evento.' },
    { t: 'Despache e acompanhe', d: 'Um despacho pode ir a vários setores. Cada resposta fica registrada.' },
    { t: 'A equipe vê na agenda', d: 'Os eventos da semana, a sala e o que falta, para todo mundo.' },
  ];

  const linha = (txt, prazo, est, rot) => `<li class="cf-linha ${est}"><span class="cf-caixa" aria-hidden="true">${est === 'feito' ? A.ic('feito', 'ic-sm') : ''}</span><span class="cf-nome">${txt}</span><span class="cf-prazo">${prazo}</span>${rot ? `<span class="cf-rot">${rot}</span>` : ''}</li>`;

  const DEMOS = [
    () => `<div class="cf-demo-cad">
        <p class="cf-rotulo">O que é este processo?</p>
        <div class="cf-opcoes"><span class="cf-opcao marcada"><b>Evento interno</b><small>A EMPRO organiza</small></span><span class="cf-opcao"><b>Evento externo</b><small>Alguém vai a evento de fora</small></span></div>
        <p class="cf-rotulo">Número do processo SEI</p>
        <div class="cf-campo">19.25.110001010.0011128/2026-96</div>
        <p class="cf-guarda">${A.ic('cadeado', 'ic-sm')} guardado como <mark class="cf-grifo emdia">11128/2026-96</mark></p>
      </div>`,
    () => `<div class="cf-demo-prazos">
        <p class="cf-evento"><span class="cf-rotulo">Evento</span> <strong>30 de outubro</strong></p>
        <ul class="cf-lista">
          ${linha('Reservar a sala', 'D-35 · 25/09', 'feito', 'feito')}
          ${linha('Enviar o briefing à comunicação', 'D-30 · 30/09', 'atencao', 'esta semana')}
          ${linha('Pedir o coffee break à GCI', 'D-20 · 10/10', 'aberta')}
          ${linha('Abrir as inscrições', 'D-14 · 16/10', 'aberta')}
        </ul>
      </div>`,
    () => `<div class="cf-demo-enc">
        <p class="cf-rotulo">Despacho de 29/09 · pedido de autorização e remanejamento</p>
        <ul class="cf-lista">
          <li class="cf-dest"><strong>PGJ</strong><span class="selo" style="--c:var(--emdia);--cbg:var(--emdia-bg)">${A.ic('relogio')} aguardando há 6 dias</span></li>
          <li class="cf-dest"><strong>DOF</strong><span class="selo" style="--c:var(--ok);--cbg:var(--ok-bg)">${A.ic('feito')} autorizado em 02/10</span></li>
        </ul>
        <p class="cf-nota">Enviar não é resolver: o item só fica feito quando todas as respostas chegam.</p>
      </div>`,
    () => `<div class="cf-demo-ag" aria-hidden="true">
        ${[['seg', []], ['ter', [['L.I.', 'Oficina IA', 'Auditório · 08h', 0, 2]]], ['qua', [['M.S.', 'Curso de oratória', 'Sala 2 · 14h', 1, 1]]], ['qui', [['L.I.', 'Oficina IA', 'Auditório · 08h', 0, 2]]], ['sex', [['R.A.', 'Reunião de alinhamento', 'Sala 1 · 09h', 2, 0]]]]
          .map(([d, evs]) => `<div class="cf-dia"><span class="cf-dia-n">${d}</span>${evs.map(([q, t, l, c, s]) => `<span class="cf-ev" style="--pc:${A.CORES_PERFIL[c][0]};--pbg:${A.CORES_PERFIL[c][1]}"><b>${t}</b><small>${l}</small><i>${q}</i>${s === 2 ? `<em>${A.ic('feito', 'ic-sm')} sala pronta</em>` : s === 1 ? `<em class="falta">falta o coffee</em>` : ''}</span>`).join('')}</div>`).join('')}
      </div>`,
  ];

  A.tutorialHTML = (opts = {}) => `<section class="cf" aria-labelledby="cf-t" data-cf>
      <div class="cf-cabeca">
        <h2 id="cf-t">${opts.titulo || 'Como o sistema trabalha com você'}</h2>
        <p>Você cadastra o processo uma vez. O sistema conta os prazos, lembra o que falta e mostra tudo na agenda da equipe.</p>
      </div>
      <div class="cf-corpo">
        <ol class="cf-passos" role="tablist" aria-orientation="vertical" aria-label="Passos">
          ${PASSOS.map((p, k) => `<li role="presentation"><button type="button" role="tab" id="cf-tab-${k}" aria-controls="cf-painel" aria-selected="${k === passo}" tabindex="${k === passo ? 0 : -1}" data-cf-passo="${k}">
            <span class="cf-n" aria-hidden="true">${k + 1}</span><span class="cf-txt"><strong>${p.t}</strong><small>${p.d}</small></span></button></li>`).join('')}
        </ol>
        <div class="cf-folha" id="cf-painel" role="tabpanel" aria-labelledby="cf-tab-${passo}" tabindex="0">
          <div class="cf-demo" data-cf-demo>${DEMOS[passo]()}</div>
          <div class="cf-nav">
            <button type="button" class="btn" data-cf-ir="-1" ${passo === 0 ? 'disabled' : ''}>${A.ic('anterior')} Anterior</button>
            <span class="secundario">${passo + 1} de ${PASSOS.length}</span>
            <button type="button" class="btn" data-cf-ir="1" ${passo === PASSOS.length - 1 ? 'disabled' : ''}>Próximo ${A.ic('proximo')}</button>
          </div>
        </div>
      </div>
      <div class="cf-acoes">
        ${opts.semAcoes ? '' : `<a class="btn btn-primario btn-grande" href="#/processos/novo" data-editar>${A.ic('mais')} Cadastrar meu primeiro processo</a>
        <a class="btn btn-grande" href="#/regras">${A.ic('regras')} Ver as regras de prazo</a>`}
        ${opts.ocultavel ? '<button type="button" class="btn-texto" data-cf-ocultar>Já sei usar, esconder esta ficha</button>' : ''}
        ${opts.planilha ? '<a class="btn-texto" href="#/planilha" data-editar>Prefiro começar pela planilha</a>' : ''}
      </div>
    </section>`;

  A.ligarTutorial = (raiz, aoOcultar) => {
    const el = raiz.querySelector('[data-cf]'); if (!el) return;
    const ir = k => {
      passo = Math.max(0, Math.min(PASSOS.length - 1, k));
      el.querySelectorAll('[data-cf-passo]').forEach((b, i) => { b.setAttribute('aria-selected', i === passo); b.tabIndex = i === passo ? 0 : -1; });
      const demo = el.querySelector('[data-cf-demo]');
      demo.innerHTML = DEMOS[passo]();
      demo.classList.remove('passa'); void demo.offsetWidth; demo.classList.add('passa');
      el.querySelector('#cf-painel').setAttribute('aria-labelledby', 'cf-tab-' + passo);
      el.querySelector('.cf-nav .secundario').textContent = `${passo + 1} de ${PASSOS.length}`;
      el.querySelector('[data-cf-ir="-1"]').disabled = passo === 0;
      el.querySelector('[data-cf-ir="1"]').disabled = passo === PASSOS.length - 1;
    };
    const tabs = [...el.querySelectorAll('[data-cf-passo]')];
    tabs.forEach((b, i) => {
      b.onclick = () => ir(i);
      b.onkeydown = e => {
        const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (e.key === 'Home' || e.key === 'End' || d) { e.preventDefault(); const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + d + tabs.length) % tabs.length; ir(n); tabs[n].focus(); }
      };
    });
    el.querySelectorAll('[data-cf-ir]').forEach(b => b.onclick = () => ir(passo + +b.dataset.cfIr));
    const oc = el.querySelector('[data-cf-ocultar]');
    if (oc) oc.onclick = () => { A.prefs().tutorialOculto = true; A.salvar(); if (aoOcultar) aoOcultar(); };
  };

  A.telaComoFunciona = vista => {
    vista.innerHTML = `<main><h1>Como funciona</h1>
      <p class="secundario" style="margin-top:6px;max-width:64ch">O caminho de um processo no sistema, do cadastro à agenda da equipe.</p>
      <div style="margin-top:24px">${A.tutorialHTML({ titulo: 'Os quatro passos', semAcoes: !A.podeEditar() })}</div></main>`;
    A.ligarTutorial(vista);
  };
})(window.App);
