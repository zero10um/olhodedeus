/* Utilidades compartilhadas por todas as telas. */
window.App = window.App || {};
(function (A) {
  const DIA = 86400000;

  /* ---------- Datas (sempre em texto AAAA-MM-DD, no horário local) ---------- */
  A.hojeIso = () => A.iso(new Date());
  A.d = s => { const [a, m, dd] = s.split('-').map(Number); return new Date(a, m - 1, dd); };
  A.iso = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  A.somar = (s, n) => { const x = A.d(s); x.setDate(x.getDate() + Number(n)); return A.iso(x); };
  A.dias = s => Math.round((A.d(s) - A.d(A.hojeIso())) / DIA);
  A.entre = (a, b) => Math.round((A.d(b) - A.d(a)) / DIA);
  A.fmt = s => s ? A.d(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
  A.fmtAno = s => s ? A.d(s).toLocaleDateString('pt-BR') : '—';
  A.extenso = s => A.d(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  A.semana = s => A.d(s).toLocaleDateString('pt-BR', { weekday: 'long' });
  A.haDias = n => n <= 0 ? 'hoje' : n === 1 ? 'há 1 dia' : `há ${n} dias`;

  /* ---------- Texto ---------- */
  A.maiusc = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  A.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  A.iniciais = nome => {
    const t = String(nome || '').trim();
    if (/^([A-ZÀ-Ú]\.\s?)+$/.test(t)) return t.replace(/\s+/g, '');
    const partes = String(nome || '').trim().split(/\s+/).filter(p => p.length > 2 || /^[A-ZÀ-Ú]/.test(p) && p.length > 1);
    return partes.length ? partes.map(p => p[0].toUpperCase() + '.').join('') : '';
  };
  A.curto = (s, n = 24) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  A.semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  A.seiCurto = n => n ? String(n).split('.').pop().replace(/^0+/, '') : '';
  A.seiNormal = n => String(n || '').replace(/\s+/g, '').trim();
  A.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  A.clonar = o => JSON.parse(JSON.stringify(o));

  /* ---------- Ícones (desenhados em index.html) ---------- */
  A.ic = (nome, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${nome}"/></svg>`;

  /* ---------- Movimento ---------- */
  A.semMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  A.mudar = fn => {
    if (!document.startViewTransition || A.semMovimento()) { fn(); return Promise.resolve(); }
    try {
      const t = document.startViewTransition(fn);
      t.ready.catch(() => {}); t.finished.catch(() => {});
      return t.updateCallbackDone.catch(() => {});
    }
    catch (e) { fn(); return Promise.resolve(); }
  };
  A.rolarAte = el => el && el.scrollIntoView({ behavior: A.semMovimento() ? 'auto' : 'smooth', block: 'start' });
  A.comFoco = fn => {
    const a = document.activeElement, k = a && a.dataset ? a.dataset.k : null;
    fn();
    if (k) { const n = document.querySelector(`[data-k="${CSS.escape(k)}"]`); if (n) n.focus(); }
  };

  /* ---------- Aviso com desfazer ---------- */
  let anim = null, desfazer = null;
  A.avisar = (msg, fnDesfazer) => {
    const el = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    const b = document.getElementById('toastDesfazer');
    desfazer = fnDesfazer || null;
    b.hidden = !fnDesfazer;
    el.classList.add('visivel');
    let barra = el.querySelector('.tempo');
    if (!barra) { barra = document.createElement('span'); barra.className = 'tempo'; barra.setAttribute('aria-hidden', 'true'); el.appendChild(barra); }
    if (anim) anim.cancel();
    anim = barra.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: fnDesfazer ? 7000 : 3600, fill: 'forwards' });
    anim.onfinish = () => el.classList.remove('visivel');
  };
  A.ligarAviso = () => {
    const el = document.getElementById('toast');
    const pausar = () => anim && anim.playState === 'running' && anim.pause();
    const seguir = () => anim && anim.playState === 'paused' && anim.play();
    el.addEventListener('mouseenter', pausar); el.addEventListener('mouseleave', seguir);
    el.addEventListener('focusin', pausar); el.addEventListener('focusout', seguir);
    document.getElementById('toastDesfazer').onclick = () => {
      el.classList.remove('visivel');
      if (!desfazer) return;
      const f = desfazer; desfazer = null;
      A.mudar(() => { f(); A.salvar(); A.redesenhar(); });
    };
  };

  /* ---------- Copiar ---------- */
  A.copiar = (texto, msg) => {
    const fim = () => A.avisar(msg || 'Copiado.');
    const antigo = () => { const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); fim(); };
    try { navigator.clipboard.writeText(texto).then(fim, antigo); } catch (e) { antigo(); }
  };
  A.ligarCopiaSei = raiz => raiz.querySelectorAll('[data-sei]').forEach(b => b.onclick = e => { e.stopPropagation(); A.copiar(b.dataset.sei, `Número copiado: ${b.dataset.sei}`); });

  /* ---------- Baixar arquivo ---------- */
  A.baixar = async (nome, conteudo, tipo) => {
    if (A.salvarArquivo) {
      try { await A.salvarArquivo(nome, conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo || 'application/json' })); return true; }
      catch (e) { if (e && e.code === 'declined') return false; throw new Error('Não deu para baixar o arquivo aqui.'); }
    }
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo || 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
    return true;
  };

  /* ---------- Código de acesso (embaralhado antes de guardar) ---------- */
  A.embaralhar = async texto => {
    const dado = 'meus-processos:' + texto;
    try {
      if (crypto && crypto.subtle) {
        const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dado));
        return 'sha256:' + [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {}
    let h = 2166136261;
    for (let i = 0; i < dado.length; i++) { h ^= dado.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'fnv:' + (h >>> 0).toString(16);
  };

  /* ---------- Menu "Ver como" ---------- */
  A.menuModo = (el, titulo, opcoes, atual, aoEscolher) => {
    const at = opcoes.find(o => o.v === atual) || opcoes[0];
    const id = el.id + '-btn';
    el.innerHTML = `<button type="button" class="btn modo-btn" aria-haspopup="menu" aria-expanded="false" id="${id}">${A.ic('modo')}<span class="rotulo">Ver como:</span> <strong>${at.t}</strong>${A.ic('seta')}</button>
      <div class="modo-menu" role="menu" aria-label="${titulo}" hidden>${opcoes.map(o => `<button type="button" role="menuitemradio" aria-checked="${o.v === at.v}" data-v="${o.v}" tabindex="-1">${A.ic(o.ic)}<span class="t">${o.t}</span>${A.ic('check', 'marcado')}<span class="d">${o.d}</span></button>`).join('')}</div>`;
    A.ligarMenu(el, el.querySelector('.modo-btn'), el.querySelector('.modo-menu'), '[role=menuitemradio]', b => {
      A.mudar(() => aoEscolher(b.dataset.v)).then(() => document.getElementById(id)?.focus());
    });
  };
  /* Abre e fecha um menu flutuante, com teclado */
  A.ligarMenu = (caixa, btn, menu, seletor, aoEscolher) => {
    const itens = [...menu.querySelectorAll(seletor)];
    const fora = e => { if (!caixa.contains(e.target)) fechar(false); };
    function fechar(focar) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', fora); if (focar) btn.focus(); }
    function abrir() { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); (itens.find(i => i.getAttribute('aria-checked') === 'true') || itens[0])?.focus(); document.addEventListener('pointerdown', fora); }
    btn.onclick = () => menu.hidden ? abrir() : fechar(true);
    btn.onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); abrir(); } };
    menu.onkeydown = e => {
      const i = itens.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); itens[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); itens[itens.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); fechar(true); }
      else if (e.key === 'Tab') fechar(false);
    };
    if (aoEscolher) itens.forEach(b => b.onclick = () => { fechar(false); aoEscolher(b); });
    return { fechar };
  };
})(window.App);
