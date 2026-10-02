/* Relatório: planilha organizada gerada pelo próprio sistema (nada é lido de planilha nenhuma).
   Aba "Processos": uma linha por processo. Aba "Pendências": uma linha por passo que falta. */
(function (A) {
  const ESTADO = { aberta: 'A fazer', esperando: 'Esperando resposta', feita: 'Feito' };

  function faseAtual(p, pend) {
    if (!pend.length) return 'Concluído';
    const hoje = A.hojeIso();
    if (p.inicio && p.inicio <= hoje && hoje <= (p.fim || p.inicio)) return 'Evento acontecendo';
    const ordem = A.FASES.map(f => f.id);
    const fase = pend.map(x => x.f.fase).sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b))[0];
    return (A.FASES.find(f => f.id === fase) || {}).n || '';
  }
  const porPrazo = (a, b) => (a.prazo || '9999') < (b.prazo || '9999') ? -1 : 1;

  function linhas(escopo, comArquivados) {
    const eu = A.euId();
    const procs = A.estado.processos.filter(p => (escopo === 'equipe' || p.dono === eu) && (comArquivados || !p.arquivado))
      .sort((a, b) => ((A.perfil(a.dono) || {}).ini || '').localeCompare((A.perfil(b.dono) || {}).ini || '') || ((A.dataRef(a) || '9') < (A.dataRef(b) || '9') ? -1 : 1));
    const processos = [], pendencias = [];
    procs.forEach(p => {
      const quem = (A.perfil(p.dono) || {}).ini || '';
      const pend = A.itensAtivos(p).filter(x => x.i.estado !== 'feita').map(x => ({ ...x, prazo: A.prazo(p, x.i) })).sort(porPrazo);
      const prox = pend[0];
      processos.push({
        'Servidor': quem, 'Processo': p.titulo, 'SEI': p.sei || '', 'Interno/Externo': p.ambito ? A.AMBITOS[p.ambito][0] : '', 'Para quem': p.publico ? A.PUBLICOS[p.publico] : '', 'Tipo': p.tipoNome || '',
        'Início': p.inicio ? A.fmtAno(p.inicio) : '', 'Fim': p.fim && p.fim !== p.inicio ? A.fmtAno(p.fim) : '',
        'Horário': p.horario || '', 'Local': p.local || '', 'Fase atual': p.arquivado ? 'Arquivado' : faseAtual(p, pend),
        'Próximo passo': prox ? prox.i.nome : '', 'Prazo do próximo passo': prox && prox.prazo ? A.fmtAno(prox.prazo) : '',
        'Falta': pend.length, 'Situação': p.arquivado ? '' : (A.SIT[A.situacao(p)] || {}).nome || '',
        'SEIs relacionados': (p.seis || []).map(s => `${s.tipo ? s.tipo + ': ' : ''}${s.numero}`).join('; '),
      });
      if (!p.arquivado) pend.forEach(x => {
        const d = x.prazo ? A.dias(x.prazo) : null;
        pendencias.push({
          'Servidor': quem, 'Processo': p.titulo, 'SEI': p.sei || '', 'Frente': x.f.nome, 'Passo': x.i.nome,
          'Prazo': x.prazo ? A.fmtAno(x.prazo) : '', 'Dias até o prazo': d == null ? '' : d,
          'Situação': d != null && d < 0 && x.i.estado !== 'esperando' ? 'Atrasado' : ESTADO[x.i.estado] || '',
        });
      });
    });
    return { processos, pendencias };
  }

  function planilha(dados) {
    const wb = XLSX.utils.book_new();
    [['Processos', dados.processos], ['Pendências', dados.pendencias]].forEach(([nome, lista]) => {
      const ws = XLSX.utils.json_to_sheet(lista.length ? lista : [{ ' ': 'Nada aqui.' }]);
      const cols = Object.keys(lista[0] || { ' ': '' });
      ws['!cols'] = cols.map(c => ({ wch: Math.min(48, Math.max(c.length + 2, ...lista.map(l => String(l[c] == null ? '' : l[c]).length + 1))) }));
      if (lista.length) ws['!autofilter'] = { ref: ws['!ref'] };
      XLSX.utils.book_append_sheet(wb, ws, nome);
    });
    return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  let escopo = 'equipe', comArq = false;
  A.telaRelatorio = vista => {
    const dados = linhas(escopo, comArq);
    const cab = ['Servidor', 'Processo', 'Fase atual', 'Próximo passo', 'Prazo do próximo passo', 'Situação'];
    vista.innerHTML = `<main>
      <h1>Relatório</h1>
      <p class="secundario" style="margin-top:6px;max-width:64ch">Uma planilha arrumada, feita na hora com o que está cadastrado no sistema. Duas abas: <strong>Processos</strong> (uma linha por processo) e <strong>Pendências</strong> (uma linha por passo que falta). Já vem com filtro em cada coluna.</p>
      <section class="cartao-form" aria-labelledby="t-rel">
        <h2 id="t-rel">O que entra</h2>
        <div class="segmento" role="radiogroup" aria-label="De quem" style="margin:8px 0 12px">
          <label><input type="radio" name="relEsc" value="equipe" ${escopo === 'equipe' ? 'checked' : ''}><span>Toda a equipe</span></label>
          <label><input type="radio" name="relEsc" value="meus" ${escopo === 'meus' ? 'checked' : ''}><span>Só os meus</span></label>
        </div>
        <label class="ag-marcar"><input type="checkbox" id="relArq" ${comArq ? 'checked' : ''}> Incluir processos arquivados</label>
        <p style="margin-top:12px"><strong>${dados.processos.length}</strong> processo${dados.processos.length === 1 ? '' : 's'} e <strong>${dados.pendencias.length}</strong> pendência${dados.pendencias.length === 1 ? '' : 's'}.</p>
        <div class="form-botoes" style="justify-content:flex-start"><button class="btn btn-primario btn-grande" type="button" id="relBaixar" ${dados.processos.length ? '' : 'disabled'}>${A.ic('baixar')} Baixar a planilha (.xlsx)</button></div>
      </section>
      ${dados.processos.length ? `<section style="margin-top:24px" aria-labelledby="t-prev"><h2 id="t-prev">Prévia</h2>
        <div class="tabela-rolagem" style="margin-top:8px"><table class="tabela"><thead><tr>${cab.map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead>
        <tbody>${dados.processos.slice(0, 12).map(l => `<tr>${cab.map(c => `<td>${A.esc(l[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        ${dados.processos.length > 12 ? `<p class="secundario" style="margin-top:6px">Mais ${dados.processos.length - 12} na planilha.</p>` : ''}</section>` : ''}
      <section class="cartao-form" aria-labelledby="t-copia">
        <h2 id="t-copia">Cópia de segurança</h2>
        <p class="secundario" style="max-width:64ch">Os dados ficam guardados no banco da equipe. A cópia serve para guardar um retrato de hoje, ou para trazer o que você tinha na versão sem internet (o arquivo index.html).</p>
        <div class="form-botoes" style="justify-content:flex-start;flex-wrap:wrap">
          <button class="btn" type="button" id="relCopia">${A.ic('baixar')} Baixar cópia de segurança</button>
          <label class="btn" for="relTrazer" style="cursor:pointer">${A.ic('subir')} Trazer uma cópia para o meu painel</label><input type="file" id="relTrazer" accept=".json" class="sr">
        </div>
      </section>
    </main>`;
    vista.querySelectorAll('[name=relEsc]').forEach(r => r.onchange = () => { escopo = r.value; A.redesenhar(); });
    vista.querySelector('#relArq').onchange = e => { comArq = e.target.checked; A.redesenhar(); };
    const bx = vista.querySelector('#relBaixar');
    if (bx) bx.onclick = async () => {
      try { if (await A.baixar(`relatorio-${escopo === 'equipe' ? 'equipe' : 'meus'}-${A.hojeIso()}.xlsx`, planilha(linhas(escopo, comArq)))) A.avisar('Planilha baixada.'); }
      catch (e) { A.avisar('Não deu para gerar a planilha: ' + e.message); }
    };
    vista.querySelector('#relCopia').onclick = () => A.baixar(`copia-equipe-${A.hojeIso()}.json`, A.exportar()).then(ok => ok && A.avisar('Cópia baixada.')).catch(e => A.avisar(e.message));
    const tr = vista.querySelector('#relTrazer');
    tr.onchange = async () => {
      const f = tr.files[0]; if (!f) return;
      try {
        const r = A.importarNaNuvem(await f.text());
        A.avisar(`Cópia trazida: ${r.novos} processo${r.novos === 1 ? '' : 's'} novo${r.novos === 1 ? '' : 's'} e ${r.atualizados} atualizado${r.atualizados === 1 ? '' : 's'}.`, r.desfazer);
        A.redesenhar();
      } catch (e) { A.avisar(e.message); }
      tr.value = '';
    };
  };
})(window.App);
