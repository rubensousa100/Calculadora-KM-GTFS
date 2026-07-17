/* ==========================================================================
 * app.js — Camada de interface e orquestração
 *
 * Responsável por:
 *   - estado da aplicação (ficheiros carregados, resultados, ordenação)
 *   - eventos de upload (drag & drop / seleção)
 *   - apresentação (painel, bilhetes, tabela, avisos)
 *   - execução do contrato e exportação CSV
 *
 * Depende de: CONFIG, Utils, GTFS (carregados antes deste ficheiro).
 * ========================================================================== */
'use strict';

(function(){

  /* ---- Estado ---- */
  const state = { files: [] }; // {id, name, zip, startDate, endDate, minDate, maxDate, spanDays, hasFrequencies}
  let results = null;          // {byRoute, routeName, totalKm, totalDays}
  let sortKey = 'km', sortDir = 'desc';

  /* ---- Referências ao DOM ---- */
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const ticketsEl = document.getElementById('tickets');
  const calcBtn = document.getElementById('calcBtn');
  const statusEl = document.getElementById('status');
  const overlapWarn = document.getElementById('overlapWarn');
  const freqWarn = document.getElementById('freqWarn');
  const resultsWrap = document.getElementById('resultsWrap');
  const exportBtn = document.getElementById('exportBtn');
  const contractedKmInput = document.getElementById('contractedKm');
  const contractPctEl = document.getElementById('contractPct');
  const contractPctSub = document.getElementById('contractPctSub');
  const annualizeToggle = document.getElementById('annualize');
  const loteSelect = document.getElementById('loteSelect');
  const loteTag = document.getElementById('loteTag');

  /* ======================================================================
   * Upload de ficheiros
   * ==================================================================== */

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', e => handleFiles(e.target.files));

  /**
   * Lê os ZIPs carregados, deteta datas e sinaliza frequencies.txt.
   * @param {FileList} fileList
   */
  async function handleFiles(fileList){
    for(const f of fileList){
      if(!f.name.toLowerCase().endsWith('.zip')) continue;
      const id = 'f' + Math.random().toString(36).slice(2,9);
      const entry = { id, name: f.name, file: f, startDate:null, endDate:null, minDate:null, maxDate:null, loading:true };
      state.files.push(entry);
      renderTickets();
      try{
        const zip = await JSZip.loadAsync(f);
        entry.zip = zip;
        const range = await GTFS.detectDateRange(zip);
        entry.startDate = range.start;
        entry.endDate = range.end;
        entry.minDate = range.min;
        entry.maxDate = range.max;
        entry.spanDays = Utils.daysBetween(range.start, range.end);
        const freqRows = await GTFS.readCsv(zip, 'frequencies.txt');
        entry.hasFrequencies = !!(freqRows && freqRows.length > 0);
      }catch(err){
        entry.error = 'erro ao ler zip';
        console.error(err);
      }
      entry.loading = false;
      renderTickets();
    }
    checkOverlaps();
    calcBtn.disabled = state.files.length === 0;
  }

  /* ======================================================================
   * Bilhetes por ficheiro
   * ==================================================================== */

  /** Redesenha a lista de ficheiros carregados e liga os respetivos eventos. */
  function renderTickets(){
    ticketsEl.innerHTML = '';
    for(const entry of state.files){
      const div = document.createElement('div');
      div.className = 'ticket';
      if(entry.loading){
        div.innerHTML = `<div class="fname">${Utils.escapeHtml(entry.name)}</div><div class="meta">a ler…</div>`;
      } else if(entry.error){
        div.innerHTML = `<div class="fname">${Utils.escapeHtml(entry.name)}</div><div class="meta" style="color:var(--coral)">${entry.error}</div>
          <button class="remove" data-id="${entry.id}">×</button>`;
      } else {
        const wide = entry.spanDays > CONFIG.SPAN_WARN_DAYS;
        const spanNote = wide
          ? `<div class="meta span-warn">⚠ ${entry.spanDays} dias — confirma se é este o período pretendido (o feed pode ir além do mês)</div>`
          : `<div class="meta">${entry.spanDays} dias</div>`;
        const freqNote = entry.hasFrequencies
          ? `<div class="meta span-warn">⚠ usa frequencies.txt — kms podem ficar subestimados</div>`
          : '';
        div.innerHTML = `
          <div class="fname">${Utils.escapeHtml(entry.name)}${spanNote}${freqNote}</div>
          <div class="dates">
            <input type="date" class="start" data-id="${entry.id}" value="${entry.startDate}">
            <span class="meta">→</span>
            <input type="date" class="end" data-id="${entry.id}" value="${entry.endDate}">
          </div>
          <button class="remove" data-id="${entry.id}" title="remover">×</button>
        `;
      }
      ticketsEl.appendChild(div);
    }
    ticketsEl.querySelectorAll('.remove').forEach(btn => {
      btn.addEventListener('click', () => {
        state.files = state.files.filter(f => f.id !== btn.dataset.id);
        renderTickets();
        checkOverlaps();
        calcBtn.disabled = state.files.length === 0;
      });
    });
    ticketsEl.querySelectorAll('input.start').forEach(inp => {
      inp.addEventListener('change', () => {
        const e = state.files.find(f => f.id === inp.dataset.id);
        if(e){ e.startDate = inp.value; e.spanDays = Utils.daysBetween(e.startDate, e.endDate); }
        checkOverlaps();
        renderTickets();
      });
    });
    ticketsEl.querySelectorAll('input.end').forEach(inp => {
      inp.addEventListener('change', () => {
        const e = state.files.find(f => f.id === inp.dataset.id);
        if(e){ e.endDate = inp.value; e.spanDays = Utils.daysBetween(e.startDate, e.endDate); }
        checkOverlaps();
        renderTickets();
      });
    });
  }

  /** Avisa quando dois ficheiros têm períodos sobrepostos (km contados a dobrar). */
  function checkOverlaps(){
    const valid = state.files.filter(f => f.startDate && f.endDate);
    const overlapMsgs = [];
    for(let i=0;i<valid.length;i++){
      for(let j=i+1;j<valid.length;j++){
        const a = valid[i], b = valid[j];
        if(a.startDate <= b.endDate && b.startDate <= a.endDate){
          overlapMsgs.push(`"${a.name}" e "${b.name}" têm períodos sobrepostos — os km desses dias serão contados a dobrar.`);
        }
      }
    }
    if(overlapMsgs.length){
      overlapWarn.classList.add('show');
      overlapWarn.innerHTML = '⚠️ ' + overlapMsgs.join('<br>⚠️ ');
    } else {
      overlapWarn.classList.remove('show');
    }
  }

  /* ======================================================================
   * Cálculo
   * ==================================================================== */

  calcBtn.addEventListener('click', async () => {
    const valid = state.files.filter(f => f.zip && f.startDate && f.endDate);
    if(valid.length === 0) return;
    calcBtn.disabled = true;
    statusEl.textContent = 'a calcular…';

    const annualize = annualizeToggle.checked;
    const combinedByRoute = {};
    const combinedRouteName = {};
    let totalKm = 0;
    let totalDays = 0;

    const diagnostics = [];
    const freqFiles = [];

    try{
      for(const entry of valid){
        statusEl.textContent = `a processar ${entry.name}…`;
        const r = await GTFS.processFile(entry);
        Object.assign(combinedRouteName, r.routeName);
        let factor = 1;
        if(annualize && r.days > 0) factor = CONFIG.DAYS_PER_YEAR / r.days;
        for(const routeId in r.byRoute){
          combinedByRoute[routeId] = (combinedByRoute[routeId] || 0) + r.byRoute[routeId] * factor;
        }
        totalKm += r.totalKm * factor;
        totalDays += r.days;

        let note = `${entry.name}: distância = ${r.unit}`;
        if(r.fallbackUsed) note += ` · ${r.fallbackUsed} viagem(ns) sem shape utilizável, calculada(s) via shape_dist_traveled`;
        if(r.noDistCount) note += ` · ${r.noDistCount} viagem(ns) sem distância — ignoradas`;
        diagnostics.push(note);
        if(r.hasFrequencies) freqFiles.push(entry.name);
      }

      results = { byRoute: combinedByRoute, routeName: combinedRouteName, totalKm, totalDays };
      renderResults();
      statusEl.innerHTML = `cálculo concluído · ${valid.length} ficheiro(s) processado(s)<br>` +
        diagnostics.map(d => `<span style="opacity:.75">${Utils.escapeHtml(d)}</span>`).join('<br>');

      if(freqFiles.length){
        freqWarn.classList.add('show');
        freqWarn.innerHTML = `⚠️ ${freqFiles.map(Utils.escapeHtml).join(', ')} usa(m) frequencies.txt (viagens por frequência/headway). Este cálculo conta apenas os "moldes" de viagem em trips.txt e pode subestimar os kms reais nesse período.`;
      } else {
        freqWarn.classList.remove('show');
      }
    }catch(err){
      console.error(err);
      statusEl.textContent = 'erro: ' + err.message;
    }
    calcBtn.disabled = false;
  });

  /* ======================================================================
   * Apresentação de resultados
   * ==================================================================== */

  /** Atualiza o painel-resumo e a tabela após um cálculo. */
  function renderResults(){
    document.getElementById('totalKm').textContent = Utils.fmtKm(results.totalKm) + ' km';
    document.getElementById('totalKm').classList.remove('pending');
    document.getElementById('totalKm').classList.add('ok');
    document.getElementById('totalKmSub').textContent = annualizeToggle.checked ? 'anualizado' : 'período carregado';

    document.getElementById('totalDays').textContent = results.totalDays + ' dias';
    document.getElementById('totalDays').classList.remove('pending');
    document.getElementById('totalDaysSub').textContent = state.files.length + ' ficheiro(s)';

    const pct = Math.min(100, (results.totalDays/CONFIG.DAYS_PER_YEAR)*100);
    document.getElementById('yearCoverage').textContent = pct.toFixed(0) + '%';
    document.getElementById('yearCoverage').classList.remove('pending');
    document.getElementById('yearCoverageSub').textContent = 'de ' + CONFIG.DAYS_PER_YEAR + ' dias';

    exportBtn.style.display = 'inline-block';
    renderTable();
    updateContractPanel();
  }

  /** Desenha a tabela de km por linha, com ordenação por coluna. */
  function renderTable(){
    const rows = Object.keys(results.byRoute).map(routeId => ({
      routeId,
      name: results.routeName[routeId] || routeId,
      km: results.byRoute[routeId],
    }));

    rows.sort((a,b) => {
      let va = sortKey === 'km' ? a.km : a.name;
      let vb = sortKey === 'km' ? b.km : b.name;
      if(typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      if(va < vb) return sortDir === 'asc' ? -1 : 1;
      if(va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    const total = rows.reduce((a,r)=>a+r.km, 0);

    let html = `<table>
      <thead><tr>
        <th data-key="name">Linha</th>
        <th class="num" data-key="km">Km de serviço</th>
      </tr></thead><tbody>`;
    for(const r of rows){
      html += `<tr><td class="route">${Utils.escapeHtml(r.name)}</td><td class="num">${Utils.fmtKm(r.km)}</td></tr>`;
    }
    html += `</tbody><tfoot><tr><td>Total</td><td class="num">${Utils.fmtKm(total)}</td></tr></tfoot></table>`;
    resultsWrap.innerHTML = html;

    resultsWrap.querySelectorAll('th[data-key]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.key;
        if(sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = key; sortDir = 'desc'; }
        renderTable();
      });
    });
  }

  /* ======================================================================
   * Exportação CSV
   * ==================================================================== */

  exportBtn.addEventListener('click', () => {
    if(!results) return;
    const rows = Object.keys(results.byRoute).map(routeId => ({
      linha: results.routeName[routeId] || routeId,
      km: results.byRoute[routeId].toFixed(2),
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'km_por_linha.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  /* ======================================================================
   * Execução do contrato
   * ==================================================================== */

  /**
   * Atualiza a % de execução do contrato. O km contratualizado é um valor
   * ANUAL: comparar um período parcial (ex.: 1 mês) diretamente contra ele
   * daria uma % baixa e alarmante que não reflete desvio real. Só se
   * compara quando a cobertura do ano é suficiente, ou com "anualizar" ativo.
   */
  function updateContractPanel(){
    const contracted = parseFloat(contractedKmInput.value);
    if(!results || !contracted || contracted <= 0){
      contractPctEl.textContent = '— — —';
      contractPctEl.className = 'flap-value pending';
      contractPctSub.textContent = 'define o km contratualizado abaixo';
      return;
    }

    const annualize = annualizeToggle.checked;
    const yearCoveragePct = (results.totalDays / CONFIG.DAYS_PER_YEAR) * 100;

    if(!annualize && yearCoveragePct < CONFIG.MIN_YEAR_COVERAGE_PCT){
      contractPctEl.textContent = '— — —';
      contractPctEl.className = 'flap-value pending';
      contractPctSub.textContent = `cobertura de ${yearCoveragePct.toFixed(0)}% do ano — carrega os restantes meses ou ativa "anualizar" para comparar com o km/ano contratado`;
      return;
    }

    const pct = (results.totalKm / contracted) * 100;
    contractPctEl.textContent = pct.toFixed(1) + '%';
    contractPctEl.className = 'flap-value ' + (Math.abs(pct - 100) <= 10 ? 'ok' : 'warn-val');
    contractPctSub.textContent = Utils.fmtKm(results.totalKm) + ' / ' + Utils.fmtKm(contracted) + ' km';
  }

  contractedKmInput.addEventListener('input', updateContractPanel);
  annualizeToggle.addEventListener('change', () => {
    if(results) updateContractPanel();
  });

  /* ---- Seleção de Lote (valores do caderno de encargos) ---- */

  /**
   * Preenche o dropdown de Lotes.
   * @param {{lote:number, km:number}[]} lotes
   * @param {string} sourceLabel - texto informativo sobre a origem dos valores
   */
  function populateLoteSelect(lotes, sourceLabel){
    loteSelect.innerHTML = '<option value="">— escolhe o lote —</option>' +
      lotes.map((l, i) => `<option value="${i}">Lote ${l.lote} — ${Utils.fmtKm(l.km)} km</option>`).join('');
    loteSelect.style.display = 'inline-block';
    loteSelect.dataset.lotes = JSON.stringify(lotes);
    loteTag.textContent = sourceLabel;
  }

  loteSelect.addEventListener('change', () => {
    const lotes = JSON.parse(loteSelect.dataset.lotes || '[]');
    const idx = loteSelect.value;
    if(idx === '') return;
    contractedKmInput.value = lotes[idx].km;
    updateContractPanel();
  });

  /* ---- Arranque ---- */
  populateLoteSelect(CONFIG.LOTES_CADERNO_ENCARGOS, 'valores do caderno de encargos (fixos para a concessão)');

})();
