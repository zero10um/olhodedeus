/* Planilha: ler a cópia baixada do OneDrive, mostrar o que muda e trazer para o sistema.
   Também guarda a cópia de segurança dos dados. Nada sai deste computador. */
(function (A) {
  let leitura = null; /* { arquivo, livro, abas, aba, previa } */

  const norm = s => A.semAcento(s).replace(/\s+/g, ' ');
  const ACHAR = {
    sei: h => h === 'processo sei', tipo: h => h === 'tipo', titulo: h => h.startsWith('assunto'),
    responsavel: h => h === 'responsavel', apoio: h => h.startsWith('apoio'), unidade: h => h.startsWith('unidade demandante'),
    entrada: h => h.startsWith('data de entrada'), limite: h => h.startsWith('data limite'), inicio: h => h.includes('evento inicio'),
    fim: h => h.includes('evento termino'), horario: h => h === 'horario', modalidade: h => h === 'modalidade', local: h => h === 'local',
    deslocamento: h => h.startsWith('deslocamento'), portaria: h => h.includes('portaria') && h.startsWith('n'),
    cancelar: h => h.startsWith('cancelar'), observacoes: h => h.startsWith('observa'),
  };
  A.COLUNAS.forEach(col => { if (col !== 'Deslocamento / Portaria') ACHAR['col:' + col] = h => h === norm(col); });

  /* Procura a linha de cabeçalho (onde está "Processo SEI") e mapeia as colunas */
  function lerAba(ws) {
    const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    const iCab = linhas.findIndex(l => l && l.some(c => typeof c === 'string' && norm(c) === 'processo sei'));
    if (iCab < 0) return null;
    const cab = linhas[iCab].map(c => norm(c || ''));
    const mapa = {};
    Object.entries(ACHAR).forEach(([k, teste]) => { const i = cab.findIndex(h => h && teste(h)); if (i >= 0) mapa[k] = i; });
    if (mapa.sei === undefined || mapa['col:Instrução do processo'] === undefined) return null;
    const regs = [];
    for (let r = iCab + 1; r < linhas.length; r++) {
      const l = linhas[r]; if (!l) continue;
      const sei = l[mapa.sei]; if (!sei || !String(sei).trim()) continue;
      regs.push({ linha: r + 1, l, mapa });
    }
    return { regs, mapa };
  }
  const texto = v => v == null ? '' : String(v).trim();
  function data(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return A.iso(v);
    if (typeof v === 'number' && v > 20000 && v < 80000) { const p = XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : ''; }
    const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { const ano = m[3].length === 2 ? '20' + m[3] : m[3]; return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    const m2 = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m2 ? m2[0] : '';
  }
  function hora(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v < 1) { const min = Math.round(v * 1440); return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }
    if (v instanceof Date) return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`;
    return texto(v);
  }
  function status(v) {
    const s = A.semAcento(v);
    if (s.startsWith('feito')) return 'Feito';
    if (s.startsWith('nao se aplica')) return 'Não se aplica';
    return 'Pendente';
  }
  /* Uma linha da planilha vira um objeto simples */
  function registro({ l, mapa, linha }) {
    const g = k => mapa[k] !== undefined ? l[mapa[k]] : null;
    const r = {
      linha, sei: A.seiNormal(texto(g('sei'))), tipo: texto(g('tipo')), titulo: texto(g('titulo')), apoio: texto(g('apoio')), responsavel: texto(g('responsavel')),
      unidade: texto(g('unidade')), entrada: data(g('entrada')), limite: data(g('limite')), inicio: data(g('inicio')), fim: data(g('fim')),
      horario: hora(g('horario')), modalidade: texto(g('modalidade')), local: texto(g('local')), observacoes: texto(g('observacoes')),
      cancelado: texto(g('cancelar')), colunas: {},
    };
    A.COLUNAS.forEach(col => { if (mapa['col:' + col] !== undefined) r.colunas[col] = status(g('col:' + col)); });
    const desl = A.semAcento(g('deslocamento')), port = texto(g('portaria'));
    r.colunas['Deslocamento / Portaria'] = desl.startsWith('nao') ? 'Não se aplica' : (desl.startsWith('sim') && port ? 'Feito' : 'Pendente');
    r.portaria = port;
    return r;
  }

  const CAMPOS_DADOS = [['titulo', 'Nome'], ['unidade', 'Unidade'], ['entrada', 'Entrada'], ['limite', 'Data limite'], ['inicio', 'Início'], ['fim', 'Fim'], ['horario', 'Horário'], ['modalidade', 'Modalidade'], ['local', 'Local'], ['apoio', 'Apoio']];

  /* Compara a aba com o que já está no sistema */
  function comparar(regs) {
    const meus = A.meus();
    const porSei = new Map(meus.map(p => [A.seiChave(p.sei), p]));
    const vistos = new Set();
    const novos = [], alterados = [], iguais = [];
    regs.forEach(r => {
      const p = porSei.get(A.seiChave(r.sei));
      if (!p) { novos.push(r); return; }
      vistos.add(p.id);
      const mud = [];
      CAMPOS_DADOS.forEach(([k, n]) => { const v = k === 'fim' && !r.fim ? r.inicio : r[k]; if ((v || '') !== (p[k] || '') && (v || p[k])) mud.push(`${n}: ${p[k] || '—'} → ${v || '—'}`); });
      A.COLUNAS.forEach(col => { const v = r.colunas[col]; if (v && v !== (p.naPlanilha[col] || 'Pendente')) mud.push(`${col}: ${p.naPlanilha[col] || 'Pendente'} → ${v}`); });
      if (!!r.cancelado !== !!p.situacaoPlanilha) mud.push(r.cancelado ? `Marcado como ${r.cancelado.toLowerCase()}` : 'Voltou a ficar ativo');
      (mud.length ? alterados : iguais).push({ r, p, mud });
    });
    const sumiram = meus.filter(p => !vistos.has(p.id) && p.origem === 'planilha' && !p.arquivado);
    return { novos, alterados, iguais, sumiram };
  }

  /* Leva os valores da planilha para um processo: datas e dados vêm da planilha;
     status "Feito" ou "Não se aplica" da planilha marcam os passos daquela coluna */
  function aplicarRegistro(p, r) {
    CAMPOS_DADOS.forEach(([k]) => { const v = k === 'fim' && !r.fim ? r.inicio : r[k]; if (v || k === 'apoio') p[k] = v || ''; });
    p.sei = A.seiGuardar(r.sei);
    if (r.observacoes && r.observacoes !== p.observacoes) p.observacoes = r.observacoes;
    p.situacaoPlanilha = r.cancelado || '';
    p.arquivado = !!r.cancelado;
    A.COLUNAS.forEach(col => {
      const v = r.colunas[col]; if (!v) return;
      p.naPlanilha[col] = v;
      p.frentes.forEach(f => {
        const daFrente = f.coluna === col;
        if (daFrente && v === 'Não se aplica') f.na = true;
        if (daFrente && v !== 'Não se aplica' && f.na && (p.naPlanilhaAntes || {})[col] === 'Não se aplica') f.na = false;
        f.itens.forEach(i => {
          if ((i.coluna || f.coluna) !== col) return;
          if (v === 'Não se aplica' && !daFrente) i.na = true;
          if (v === 'Feito' && i.estado !== 'feita') { A.setEstado(p, i, 'feita'); i.feitoEm = null; }
        });
      });
    });
    if (r.portaria) { const f = p.frentes.find(x => x.coluna === 'Deslocamento / Portaria'); if (f && !p.seis.some(s => s.tipo === 'Portaria')) p.seis.push({ id: 's' + A.uid(), tipo: 'Portaria', numero: r.portaria, desc: 'Nº da portaria', f: f.id }); }
    p.naPlanilhaAntes = { ...p.naPlanilha };
    p.atualizadoEm = new Date().toISOString();
  }

  /* ---------- Limpeza (LGPD) ---------- */
  /* Nomes completos da equipe: aba "Equipe", responsáveis, apoios e títulos das abas */
  function nomesDaEquipe(livro, abas) {
    const nomes = new Set();
    const eq = livro.Sheets[livro.SheetNames.find(n => A.semAcento(n) === 'equipe')];
    if (eq) XLSX.utils.sheet_to_json(eq, { header: 1, defval: null }).forEach(l => (l || []).forEach(c => { if (typeof c === 'string' && /^[A-ZÀ-Ú][a-zà-ú]+(\s+(d[aeo]s?\s+)?[A-ZÀ-Ú][a-zà-ú]+)+$/.test(c.trim())) nomes.add(c.trim()); }));
    abas.forEach(a => a.regs.forEach(r => [r.responsavel, r.apoio].forEach(n => { if (n && n.trim().includes(' ')) nomes.add(n.trim()); })));
    return [...nomes].sort((a, b) => b.length - a.length);
  }
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* Troca nomes de pessoas da equipe por iniciais dentro de um texto */
  function tirarNomes(texto, nomes) {
    let t = texto || '';
    nomes.forEach(n => { t = t.replace(new RegExp(escRe(n), 'gi'), A.iniciais(n)); });
    return t;
  }
  function limpar(r, nomes) {
    r.seiOriginal = r.sei;
    if (!A.lgpd()) return;
    r.sei = A.seiLgpd(r.sei);
    r.apoio = A.iniciais(r.apoio);
    r.responsavel = A.iniciais(r.responsavel);
    r.titulo = tirarNomes(r.titulo, nomes);
    r.observacoes = '';
  }

  /* Gera uma cópia da planilha só com o necessário */
  A.copiaLimpa = leitura => {
    const wb = XLSX.utils.book_new();
    const COLS = ['Processo SEI (últimos 11 dígitos)', 'Tipo', 'Assunto / Curso', 'Responsável', 'Apoio', 'Unidade demandante', 'Data de entrada no setor pedagógico', 'Data limite', 'Data do Evento Início', 'Data do Evento Término', 'Horário', 'Modalidade', 'Local', ...A.COLUNAS, 'Cancelar / suspender'];
    const usados = new Set();
    const abas = leitura.abas.filter(a => !/^(base|processos sei)$/.test(A.semAcento(a.nome)));
    abas.forEach((a, i) => {
      let nome = a.rotulo ? `Processos de ${a.rotulo}` : /distribuir/i.test(a.nome) ? 'A distribuir' : `Aba ${i + 1}`;
      while (usados.has(nome)) nome += '+';
      usados.add(nome);
      const linhas = [COLS, ...a.regs.map(r => [A.seiLgpd(r.seiOriginal || r.sei), r.tipo, r.titulo, A.iniciais(r.responsavel), A.iniciais(r.apoio), r.unidade, r.entrada, r.limite, r.inicio, r.fim || r.inicio, r.horario, r.modalidade, r.local, ...A.COLUNAS.map(c => r.colunas[c] || ''), r.cancelado])];
      const ws = XLSX.utils.aoa_to_sheet(linhas);
      ws['!cols'] = COLS.map((c, j) => ({ wch: j === 2 ? 44 : Math.max(12, Math.min(28, c.length + 2)) }));
      XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
    });
    const leia = [['Cópia limpa da planilha de controle, gerada pelo Meus processos em ' + A.fmtAno(A.hojeIso()) + '.'], [''],
      ['O que foi feito:'], ['- Número SEI reduzido aos últimos 11 dígitos.'], ['- Nomes de pessoas (responsável, apoio, abas e nomes da equipe no título do curso) trocados por iniciais.'],
      ['- Observações retiradas (texto livre pode ter dados pessoais).'], ['- Abas de controle interno (Painel, Equipe, Base, Listas) retiradas.'], [''],
      ['Confira o título dos cursos: nomes de pessoas de fora da equipe (palestrantes, por exemplo) não são reconhecidos automaticamente.']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leia), 'Leia');
    return A.baixar(`planilha-limpa-${A.hojeIso()}.xlsx`, new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]));
  };

  /* ---------- Fila para a planilha ---------- */
  /* Online: as mudanças de todos os painéis. No arquivo: só as do painel aberto. */
  A.paraPlanilha = () => (A.modo === 'nuvem' ? A.estado.processos.filter(p => !p.arquivado) : A.ativos())
    .map(p => ({ p, m: A.mudancas(p) })).filter(x => x.m.length);
  A.abaDe = p => p.aba || (A.perfil(p.dono) || {}).aba || '';

  /* ---------- Script do Excel (aba Automatizar) ---------- */
  A.scriptExcel = () => {
    const linhas = [], lista = A.paraPlanilha();
    lista.forEach(({ p, m }) => {
      const chave = A.seiChave(p.sei), aba = A.abaDe(p);
      if (chave.length < 11) return;
      m.forEach(x => {
        if (x.col === 'Deslocamento / Portaria') {
          linhas.push([aba, chave, 'Deslocamento?', x.para === 'Não se aplica' ? 'Não' : 'Sim', p.titulo]);
          if (x.para === 'Feito') { const port = p.seis.find(s => s.tipo === 'Portaria'); if (port) linhas.push([aba, chave, 'Nº da Portaria', port.numero, p.titulo]); }
        } else linhas.push([aba, chave, x.col, x.para, p.titulo]);
      });
    });
    const semSei = lista.filter(({ p }) => A.seiChave(p.sei).length < 11).map(({ p }) => p.titulo);
    const abas = [...new Set(linhas.map(l => l[0]).filter(Boolean))];
    const js = s => JSON.stringify(String(s));
    const codigo = `// Gerado pelo Meus processos em ${A.fmtAno(A.hojeIso())}.
// Atualiza só as colunas de acompanhamento (Feito, Pendente, Não se aplica).
// Cada linha diz em que aba procurar; o processo é achado pelos últimos 11 dígitos do número SEI.
function main(workbook: ExcelScript.Workbook) {
  // [aba, final do SEI, coluna, valor novo, processo]
  const MUDANCAS: string[][] = [
${linhas.map(l => '    [' + l.map(js).join(', ') + ']').join(',\n')}
  ];
  const digitos = (s: string): string => s.replace(/\\D/g, "");
  const igual = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
  const feitas: string[] = [];
  const avisos: string[] = [];
  const achados: boolean[] = MUDANCAS.map(() => false);
  const todas = workbook.getWorksheets().filter(w => !["Processos SEI", "Base", "Painel", "Equipe", "Tipos", "Listas"].includes(w.getName()) && !/apoio/i.test(w.getName()));
  for (const ws of todas) {
    const usado = ws.getUsedRange(true);
    if (!usado) continue;
    const valores = usado.getValues();
    let cab = -1;
    for (let r = 0; r < Math.min(valores.length, 15); r++) { if (valores[r].some(v => igual(String(v), "Processo SEI"))) { cab = r; break; } }
    if (cab < 0) continue;
    const titulos = valores[cab].map(v => String(v));
    const colSei = titulos.findIndex(t => igual(t, "Processo SEI"));
    const linha0 = usado.getRowIndex(), coluna0 = usado.getColumnIndex();
    const protegida = ws.getProtection().getProtected();
    MUDANCAS.forEach((m, i) => {
      if (achados[i]) return;
      const abaCerta = m[0] === "" || igual(m[0], ws.getName()) || !todas.some(w => igual(w.getName(), m[0]));
      if (!abaCerta) return;
      const col = titulos.findIndex(t => igual(t, m[2]));
      if (col < 0) return;
      for (let r = cab + 1; r < valores.length; r++) {
        if (digitos(String(valores[r][colSei])).slice(-11) !== m[1]) continue;
        achados[i] = true;
        if (String(valores[r][col]) === m[3]) { feitas.push("Já estava certo: " + m[4] + " | " + m[2] + " = " + m[3]); break; }
        if (protegida) { avisos.push("A aba " + ws.getName() + " está protegida. Desproteja (Revisão > Desproteger planilha) e rode de novo."); achados[i] = true; break; }
        ws.getCell(linha0 + r, coluna0 + col).setValue(m[3]);
        feitas.push("Mudou (" + ws.getName() + "): " + m[4] + " | " + m[2] + ": " + String(valores[r][col] || "vazio") + " -> " + m[3]);
        break;
      }
    });
  }
  MUDANCAS.forEach((m, i) => { if (!achados[i]) avisos.push("Não encontrei na planilha: " + m[4] + " (SEI final " + m[1] + "). Inclua o processo na planilha e gere o script de novo."); });
  console.log("Feito: " + feitas.length + " | Avisos: " + avisos.length);
  feitas.forEach(t => console.log(t));
  avisos.filter((t, i) => avisos.indexOf(t) === i).forEach(t => console.log("ATENÇÃO: " + t));
}
`;
    return { codigo, total: linhas.length, semSei, abas, processos: lista.filter(({ p }) => A.seiChave(p.sei).length >= 11).map(({ p }) => p) };
  };

  A.lerArquivo = async arquivo => {
    if (typeof XLSX === 'undefined') throw new Error('A peça que lê planilhas não carregou. Confira se a pasta "lib" está junto do sistema.');
    const buf = await arquivo.arrayBuffer();
    const livro = XLSX.read(buf, { type: 'array', cellDates: true });
    const abas = [];
    livro.SheetNames.forEach(nome => {
      const r = lerAba(livro.Sheets[nome]);
      if (r && r.regs.length) abas.push({ nome, total: r.regs.length, regs: r.regs.map(registro) });
    });
    if (!abas.length) throw new Error('Não achei nenhuma aba com a coluna "Processo SEI". Confira se é a planilha de controle do setor.');
    const nomes = nomesDaEquipe(livro, abas);
    abas.forEach(a => {
      const t = XLSX.utils.sheet_to_json(livro.Sheets[a.nome], { header: 1, range: 0, defval: null })[0];
      const m = t && typeof t[0] === 'string' && t[0].match(/^Processos (?:de|atribu[ií]dos a|em apoio a)\s+(.+)$/i);
      a.pessoa = m ? m[1].trim() : '';
      a.rotulo = a.pessoa ? A.iniciais(a.pessoa) : '';
      a.regs.forEach(r => limpar(r, nomes));
    });
    return { arquivo: arquivo.name, abas, livro };
  };

  /* ================= Tela: Planilha ================= */
  A.telaPlanilha = vista => {
    const dono = A.dono(), pode = A.sessao.acesso === 'dono';
    const ult = A.estado.leituras[dono.id];
    const comMudanca = A.paraPlanilha();
    const nuvem = A.modo === 'nuvem';
    vista.innerHTML = `<main class="estreito">
      <h1>Planilha</h1>
      <p class="secundario" style="margin-top:6px">${ult ? `Última leitura: ${A.fmtAno(ult.em.slice(0, 10))} às ${ult.em.slice(11, 16)}, aba "${A.esc(ult.aba)}" do arquivo ${A.esc(ult.arquivo)}.` : 'A planilha ainda não foi lida.'}</p>

      <section class="bloco" style="margin-top:24px" aria-labelledby="pl-ler">
        <h2 id="pl-ler">Ler a planilha do OneDrive</h2>
        <ol class="passos-guia">
          <li>No OneDrive, abra a planilha de controle e vá em Arquivo → Salvar como → Baixar uma cópia.</li>
          <li>Escolha o arquivo baixado aqui embaixo, ou arraste ele para a caixa.</li>
          <li>Confira o que vai mudar e confirme. Nada muda antes disso.</li>
        </ol>
        ${pode ? `<label class="opcao" style="margin-top:12px;align-items:flex-start"><input type="checkbox" id="optLgpd" ${A.lgpd() ? 'checked' : ''} style="margin-top:3px"> <span><strong>Guardar só o necessário (recomendado para a LGPD)</strong><br><small>SEI só com os últimos 11 dígitos, pessoas só pelas iniciais, nomes da equipe no título do curso trocados por iniciais, observações não vêm.</small></span></label>
        <div class="solta" id="solta" style="margin-top:16px">${A.ic('subir')}<p>Arraste o arquivo .xlsx para cá</p>
          <label class="btn btn-primario" for="arq" style="cursor:pointer">${A.ic('pasta-ab')}Escolher arquivo</label>
          <input type="file" id="arq" accept=".xlsx,.xlsm,.xls" class="sr"></div>` : `<p class="aviso-suave" style="margin-top:16px">${A.ic('olho')} Só a pessoa dona do painel lê a planilha.</p>`}
        <div id="plResultado" aria-live="polite"></div>
      </section>

      <section class="bloco" aria-labelledby="pl-mudar">
        <div class="bloco-topo"><h2 id="pl-mudar">O que mudar na planilha</h2>
          ${comMudanca.length ? `<div class="acoes"><button class="btn" type="button" id="plCopiarTudo">${A.ic('copiar')}Copiar a lista</button>${pode ? `<button class="btn btn-primario" type="button" id="plScript" aria-expanded="false" aria-controls="plScriptCaixa">${A.ic('raio')}Gerar script do Excel</button>` : ''}</div>` : ''}</div>
        <div id="plScriptCaixa"></div>
        <p class="secundario" style="margin:6px 0 12px">${nuvem ? 'Tudo o que foi marcado no sistema, por qualquer pessoa, e ainda não passou para a planilha do OneDrive. Um script só leva tudo, cada mudança para a aba certa.' : 'O que você marcou aqui e ainda não passou para a planilha do OneDrive.'}</p>
        ${comMudanca.length ? `<ul class="lista">${comMudanca.map(({ p, m }) => `<li>
            <div class="linha1"><a class="link-proc t" href="#/processo/${p.id}" style="font-weight:700">${A.esc(p.titulo)}</a><span class="secundario">${nuvem && A.perfil(p.dono) ? `painel de ${A.esc(A.perfil(p.dono).ini)} · ` : ''}SEI ${A.esc(A.seiCurto(p.sei))}</span></div>
            ${(() => { const u = [...p.diario].reverse().find(d => d.autor); return u ? `<p class="secundario">Última mudança por ${A.esc(u.autor)}, ${u.data === A.hojeIso() ? 'hoje' : 'em ' + A.fmt(u.data)}.</p>` : ''; })()}
            <ul class="lista" style="margin:4px 0 6px">${m.map(x => `<li class="mudanca" style="padding:4px 0;border:0"><span>${x.col}</span><span class="de-para"><span class="de">${x.de}</span>${A.ic('seta-dir', 'ic-sm')}<span class="para">${x.para}</span></span></li>`).join('')}</ul>
            ${pode ? `<button class="btn-texto" type="button" data-ja="${p.id}">${A.ic('check', 'ic-sm')}Já atualizei este na planilha</button>` : ''}
          </li>`).join('')}</ul>` : `<p class="planilha-ok">${A.ic('feito')} Nada para mudar. A planilha está em dia com o sistema.</p>`}
      </section>

      <section class="bloco" aria-labelledby="pl-copia">
        <h2 id="pl-copia">Cópia de segurança</h2>
        <p class="secundario" style="margin:6px 0 12px;max-width:62ch">${nuvem ? 'Os dados ficam no banco compartilhado desta página, e não dependem do computador. A cópia serve para guardar um retrato de hoje ou para usar o sistema sem internet.' : `Os dados ficam guardados neste navegador, neste computador. Baixe uma cópia de vez em quando e guarde na pasta do sistema ou no OneDrive. Ela também serve para levar tudo para outro computador.`}</p>
        <div class="form-botoes">
          <button class="btn btn-primario" type="button" id="plBaixar">${A.ic('baixar')}Baixar cópia de segurança</button>
          ${pode && (!nuvem || A.nuvem.dono) ? `<label class="btn" for="plRestaurar" style="cursor:pointer">${A.ic('subir')}${nuvem ? 'Trazer uma cópia para cá' : 'Restaurar uma cópia'}</label><input type="file" id="plRestaurar" accept=".json" class="sr">` : ''}
        </div>
        <p class="secundario" style="margin-top:10px;max-width:62ch">${nuvem ? 'Para levar daqui para a versão sem internet: baixe a cópia aqui e, no arquivo index.html, use "Restaurar uma cópia". "Trazer uma cópia para cá" faz o caminho contrário: os processos da cópia entram no seu painel, e os que já existem são atualizados.'
          : 'Para levar para a versão online: baixe a cópia aqui e, na página do Claude, use "Trazer uma cópia para cá". Para trazer de lá: baixe a cópia na página online e use "Restaurar uma cópia" aqui (isso troca os dados deste navegador pelos da cópia).'}</p>
        <div hidden>
        </div>
        ${A.armazenamentoOk ? '' : `<p class="erro" style="margin-top:8px">Este navegador não está deixando guardar os dados. Baixe a cópia antes de fechar.</p>`}
      </section>
    </main>`;

    vista.querySelector('#plBaixar').onclick = () => {
      A.baixar(`meus-processos-copia-${A.hojeIso()}.json`, A.exportar()).then(ok => {
        if (!ok) return;
        A.estado.ultimaCopia = A.hojeIso(); A.salvar();
        A.avisar('Cópia baixada. Guarde o arquivo num lugar seguro.');
      }).catch(e => A.avisar(e.message));
    };
    const rest = vista.querySelector('#plRestaurar');
    if (rest) rest.onchange = async () => {
      const f = rest.files[0]; if (!f) return;
      try {
        if (A.modo === 'nuvem') {
          const r = A.importarNaNuvem(await f.text());
          A.avisar(`Cópia trazida: ${r.novos} processo${r.novos === 1 ? '' : 's'} novo${r.novos === 1 ? '' : 's'} e ${r.atualizados} atualizado${r.atualizados === 1 ? '' : 's'}.`, r.desfazer);
          A.redesenhar(); rest.value = ''; return;
        }
        const antes = A.exportar();
        A.importar(await f.text());
        A.avisar('Cópia restaurada.', () => A.importar(antes));
        if (!A.perfil(A.sessao.perfilId)) { A.sair(); location.hash = '#/entrar'; }
        A.redesenhar();
      } catch (e) { A.avisar(e.message || 'Não deu para ler este arquivo.'); }
      rest.value = '';
    };
    vista.querySelectorAll('[data-ja]').forEach(b => b.onclick = () => {
      const p = A.proc(b.dataset.ja), antes = { ...p.naPlanilha };
      A.mudancas(p).forEach(x => p.naPlanilha[x.col] = x.para);
      A.anotar(p, 'Planilha', 'Planilha atualizada com o que foi marcado aqui.');
      A.salvar(); A.mudar(A.redesenhar);
      A.avisar(`Anotado: "${p.titulo}" está em dia na planilha.`, () => { p.naPlanilha = antes; p.diario.pop(); });
    });
    const ol = vista.querySelector('#optLgpd');
    if (ol) ol.onchange = () => { A.estado.config.lgpd = ol.checked; A.salvar(); A.avisar(ol.checked ? 'Modo LGPD ligado: vale para a próxima leitura da planilha.' : 'Modo LGPD desligado: a próxima leitura guarda o SEI completo, os nomes de apoio e as observações.'); };
    const bs = vista.querySelector('#plScript');
    if (bs) bs.onclick = () => {
      const cx = vista.querySelector('#plScriptCaixa');
      const aberto = bs.getAttribute('aria-expanded') === 'true';
      bs.setAttribute('aria-expanded', !aberto);
      if (aberto) { cx.innerHTML = ''; return; }
      const s = A.scriptExcel();
      cx.innerHTML = `<div class="form-mini entra" style="margin:12px 0">
        <span class="titulo">${A.ic('raio')} Script com ${s.total} mudança${s.total === 1 ? '' : 's'}${s.abas.length ? ` em ${s.abas.length} aba${s.abas.length > 1 ? 's' : ''}` : ''}</span>
        <ol class="passos-guia" style="margin:0">
          <li>Abra a planilha de controle no OneDrive, pelo navegador.</li>
          <li>Se ${s.abas.length > 1 ? 'as abas estiverem protegidas, desproteja cada uma' : 'a aba estiver protegida, desproteja'} (Revisão → Desproteger planilha).</li>
          <li>Clique em Automatizar → Novo script. Apague o que estiver escrito e cole o script.</li>
          <li>Clique em Executar. No fim, aparece o que mudou e os avisos.</li>
          <li>Proteja de novo e volte aqui para clicar em "Já rodei o script".</li>
        </ol>
        ${s.semSei.length ? `<p class="erro">Sem número SEI, não entram no script: ${s.semSei.map(A.esc).join(', ')}.</p>` : ''}
        <label class="sr" for="plCodigo">Script do Excel</label>
        <textarea id="plCodigo" readonly style="width:100%;min-height:180px;font-family:Consolas, monospace;font-size:12px;border:1px solid var(--borda-campo);border-radius:6px;padding:8px;background:var(--folha)">${A.esc(s.codigo)}</textarea>
        <div class="form-botoes"><button class="btn btn-primario" type="button" id="plCopiarScript">${A.ic('copiar')}Copiar o script</button><button class="btn" type="button" id="plRodei">${A.ic('check')}Já rodei o script</button></div>
      </div>`;
      cx.querySelector('#plCopiarScript').onclick = () => A.copiar(s.codigo, 'Script copiado. Cole em Automatizar → Novo script.');
      cx.querySelector('#plRodei').onclick = () => {
        const antes = s.processos.map(p => [p, { ...p.naPlanilha }]);
        s.processos.forEach(p => { A.mudancas(p).forEach(x => p.naPlanilha[x.col] = x.para); A.anotar(p, 'Planilha', 'Planilha atualizada pelo script do Excel.'); });
        A.salvar(); A.mudar(A.redesenhar);
        A.avisar('Anotado: a planilha está em dia com o sistema.', () => antes.forEach(([p, n]) => { p.naPlanilha = n; p.diario.pop(); }));
      };
    };
    const ct = vista.querySelector('#plCopiarTudo');
    if (ct) ct.onclick = () => A.copiar(comMudanca.map(({ p, m }) => `SEI ${p.sei} (${p.titulo})\n` + m.map(x => `- ${x.col}: ${x.de} -> ${x.para}`).join('\n')).join('\n\n'), 'Lista copiada. É só colar onde quiser.');

    if (!pode) return;
    const arq = vista.querySelector('#arq'), solta = vista.querySelector('#solta');
    const tratar = async f => {
      const res = vista.querySelector('#plResultado');
      if (!/\.(xlsx|xlsm|xls)$/i.test(f.name)) { res.innerHTML = `<p class="erro" style="margin-top:12px">Esse arquivo não é uma planilha do Excel (.xlsx).</p>`; return; }
      res.innerHTML = `<p class="secundario" style="margin-top:12px">Lendo ${A.esc(f.name)}…</p>`;
      try {
        leitura = await A.lerArquivo(f);
        const salva = dono.aba && leitura.abas.find(a => a.nome === dono.aba);
        leitura.aba = salva ? salva.nome : null;
        mostrarAbas(vista);
      } catch (e) { res.innerHTML = `<p class="erro" style="margin-top:12px">${A.esc(e.message || 'Não deu para ler o arquivo.')}</p>`; }
    };
    arq.onchange = () => arq.files[0] && tratar(arq.files[0]);
    solta.ondragover = e => { e.preventDefault(); solta.classList.add('sobre'); };
    solta.ondragleave = () => solta.classList.remove('sobre');
    solta.ondrop = e => { e.preventDefault(); solta.classList.remove('sobre'); const f = e.dataTransfer.files[0]; if (f) tratar(f); };
    if (leitura) mostrarAbas(vista);
  };

  function mostrarAbas(vista) {
    const res = vista.querySelector('#plResultado');
    const abas = leitura.abas.filter(a => !/^processos sei$|^base$/i.test(A.semAcento(a.nome)));
    res.innerHTML = `<div class="entra" style="margin-top:20px">
      <h3>Qual aba é a sua?</h3>
      <p class="secundario">Arquivo ${A.esc(leitura.arquivo)}. Escolha a aba com os seus processos; o sistema lembra da escolha.</p>
      <div class="abas" role="radiogroup" aria-label="Abas da planilha">${abas.map(a => `<label class="opcao btn" style="gap:8px"><input type="radio" name="aba" value="${A.esc(a.nome)}" ${leitura.aba === a.nome ? 'checked' : ''}> ${A.esc(A.lgpd() && a.rotulo ? a.rotulo : a.nome)} <span class="secundario">(${a.total})</span></label>`).join('')}</div>
      <div class="form-botoes" style="margin-top:12px"><button class="btn" type="button" id="plLimpa">${A.ic('baixar')}Baixar cópia limpa (.xlsx)</button><span class="secundario" style="align-self:center">Uma versão da planilha só com o necessário, para levar a outro lugar.</span></div>
      <div id="plPrevia"></div></div>`;
    res.querySelector('#plLimpa').onclick = async () => { try { if (await A.copiaLimpa(leitura)) A.avisar('Cópia limpa baixada. Confira a aba "Leia" dentro dela.'); } catch (e) { A.avisar('Não deu para gerar a cópia limpa: ' + e.message); } };
    res.querySelectorAll('[name=aba]').forEach(r => r.onchange = () => { leitura.aba = r.value; mostrarPrevia(vista); });
    if (leitura.aba) mostrarPrevia(vista);
  }

  function mostrarPrevia(vista) {
    const el = vista.querySelector('#plPrevia');
    const aba = leitura.abas.find(a => a.nome === leitura.aba);
    const c = comparar(aba.regs);
    leitura.previa = c;
    const li = (t, extra) => `<li>${A.esc(t)}${extra ? ` <span class="secundario">${extra}</span>` : ''}</li>`;
    el.innerHTML = `<div class="entra" style="margin-top:20px">
      <h3>O que vai acontecer</h3>
      <div class="previa-num">
        <div><strong>${c.novos.length}</strong><span>processos novos</span></div>
        <div><strong>${c.alterados.length}</strong><span>com mudança</span></div>
        <div><strong>${c.iguais.length}</strong><span>sem mudança</span></div>
        <div><strong>${c.sumiram.length}</strong><span>não estão mais na aba</span></div>
      </div>
      ${c.novos.length ? `<details class="grupo-previa" open><summary>Novos (${c.novos.length})</summary><ul>${c.novos.map(r => li(r.titulo || 'Sem título', `${r.tipo || 'tipo não informado'} · SEI ${A.seiCurto(r.sei)}`)).join('')}</ul></details>` : ''}
      ${c.alterados.length ? `<details class="grupo-previa" ${c.alterados.length < 8 ? 'open' : ''}><summary>Com mudança (${c.alterados.length})</summary><ul>${c.alterados.map(x => `<li><strong>${A.esc(x.p.titulo)}</strong><ul>${x.mud.map(m => `<li class="secundario">${A.esc(m)}</li>`).join('')}</ul></li>`).join('')}</ul></details>` : ''}
      ${c.sumiram.length ? `<details class="grupo-previa"><summary>Não estão mais na aba (${c.sumiram.length})</summary><p class="secundario">Eles continuam no sistema. Se foram concluídos ou passados para outra pessoa, você pode arquivar cada um na tela do processo.</p><ul>${c.sumiram.map(p => li(p.titulo)).join('')}</ul></details>` : ''}
      <div class="form-botoes" style="margin-top:16px">
        <button class="btn btn-primario btn-grande" type="button" id="plConfirmar" ${c.novos.length + c.alterados.length ? '' : 'disabled'}>${A.ic('check')}Trazer para o sistema</button>
        <button class="btn btn-grande" type="button" id="plCancelar">Cancelar</button>
      </div>
      <p class="secundario" style="margin-top:8px">Dados e datas passam a ser os da planilha. Os passos que você já marcou aqui continuam marcados.</p>
    </div>`;
    el.querySelector('#plCancelar').onclick = () => { leitura = null; A.redesenhar(); };
    const conf = el.querySelector('#plConfirmar');
    conf.onclick = () => {
      const antes = A.clonar(A.estado.processos);
      const dono = A.dono();
      c.novos.forEach(r => {
        const tipo = A.tipoPorNome(dono.id, r.tipo);
        const p = A.novoProcesso({ ...r, tipoId: tipo.id, origem: 'planilha', fim: r.fim || r.inicio }, dono.id);
        p.sei = r.sei;
        p.aba = leitura.aba;
        aplicarRegistro(p, r);
        /* Passos sem coluna na planilha e com prazo já vencido: o sistema não tem como saber, então considera feitos e avisa */
        let antigos = 0;
        p.frentes.forEach(f => f.itens.forEach(i => { const pz = A.prazo(p, i); if (!(i.coluna || f.coluna) && i.estado === 'aberta' && pz && A.dias(pz) < 0) { A.setEstado(p, i, 'feita'); i.feitoEm = null; antigos++; } }));
        if (antigos) A.anotar(p, 'Sistema', `${antigos} passo${antigos > 1 ? 's' : ''} sem coluna na planilha e com prazo vencido ${antigos > 1 ? 'foram marcados' : 'foi marcado'} como feito${antigos > 1 ? 's' : ''} ao trazer da planilha. Confira se está certo.`);
        if (r.tipo && A.semAcento(tipo.nome) !== A.semAcento(r.tipo)) A.anotar(p, 'Sistema', `Tipo "${r.tipo}" da planilha tratado como "${tipo.nome}". Dá para criar esse tipo em Regras de prazo.`);
        A.estado.processos.push(p);
      });
      c.alterados.forEach(x => { x.p.aba = leitura.aba; aplicarRegistro(x.p, x.r); A.anotar(x.p, 'Planilha', 'Atualizado pela planilha: ' + x.mud.join('; ') + '.'); });
      dono.aba = leitura.aba;
      A.estado.leituras[dono.id] = { em: new Date().toISOString().replace(/Z$/, ''), arquivo: leitura.arquivo, aba: leitura.aba };
      const em = new Date(); A.estado.leituras[dono.id].em = `${A.hojeIso()}T${String(em.getHours()).padStart(2, '0')}:${String(em.getMinutes()).padStart(2, '0')}`;
      const n = c.novos.length, m = c.alterados.length;
      leitura = null;
      A.salvarJa();
      location.hash = '#/painel';
      A.avisar(`Planilha lida: ${n} novo${n === 1 ? '' : 's'} e ${m} atualizado${m === 1 ? '' : 's'}.`, () => { A.estado.processos = antes; });
    };
  }
})(window.App);
