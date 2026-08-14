/* ==========================================================================
   ViewCast — app shell: router, storage, and views.
   Depends on engine.js (prediction engine) and charts.js (renderers),
   loaded as plain scripts before this file.
   ========================================================================== */

const STORAGE_KEY = 'viewcast_predictions_v1';
const THEME_KEY = 'viewcast_theme';

/* ---------- storage ---------- */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function persistHistory(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function upsertRecord(record) {
  const list = loadHistory();
  const idx = list.findIndex(r => r.videoId === record.videoId);
  if (idx >= 0) list[idx] = record; else list.unshift(record);
  persistHistory(list);
  return record;
}
function getRecord(videoId) {
  return loadHistory().find(r => r.videoId === videoId) || null;
}
function deleteRecord(videoId) {
  persistHistory(loadHistory().filter(r => r.videoId !== videoId));
}
function clearAllHistory() { persistHistory([]); }

/* ---------- theme ---------- */
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light') root.setAttribute('data-theme', 'light');
  else if (mode === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'system';
  applyTheme(saved);
}
function setTheme(mode) {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
}
function getTheme() { return localStorage.getItem(THEME_KEY) || 'system'; }

/* ---------- router ---------- */
function parseHash() {
  let hash = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = hash.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = {};
  if (queryPart) {
    queryPart.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
  }
  return { segments, query };
}
function navigate(hash) { location.hash = hash; }

function setActiveNav(routeName) {
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.route === routeName);
  });
}

const ROOT = () => document.getElementById('app-root');

function router() {
  const { segments, query } = parseHash();
  const root = ROOT();
  hideTooltip();
  if (segments.length === 0) {
    setActiveNav('predict');
    renderPredictPage(root);
  } else if (segments[0] === 'results' && segments[1]) {
    setActiveNav('predict');
    renderResultsPage(root, segments[1], query);
  } else if (segments[0] === 'history') {
    setActiveNav('history');
    renderHistoryPage(root);
  } else if (segments[0] === 'insights') {
    setActiveNav('insights');
    renderInsightsPage(root);
  } else if (segments[0] === 'settings') {
    setActiveNav('settings');
    renderSettingsPage(root);
  } else {
    setActiveNav('predict');
    renderPredictPage(root);
  }
  window.scrollTo(0, 0);
}

/* ==========================================================================
   Predict / landing page
   ========================================================================== */
function renderPredictPage(root) {
  const history = loadHistory().slice(0, 8);
  const catOptions = ENGINE.CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('');

  root.innerHTML = `
    <div class="hero">
      <h1>See how your video will perform<br>before the internet decides</h1>
      <p class="lead">Paste a YouTube link, get a full projected growth curve, engagement forecast, and a scored breakdown — powered by a demo model today, your own model tomorrow.</p>
      <form class="predict-form" id="predict-form" style="flex-direction:column;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
          <input class="input" id="video-url" type="text" placeholder="https://www.youtube.com/watch?v=…  or  paste a video ID" style="flex:1; min-width:280px;" autocomplete="off" />
          <select class="select" id="video-category" style="min-width:170px;">${catOptions}</select>
          <button class="btn btn-primary" type="submit">Predict performance</button>
        </div>
        <div class="form-error" id="predict-error"></div>
      </form>
      <div class="hero-links">or <button id="demo-btn" type="button">try a demo video →</button></div>

      <div class="feature-strip">
        <div class="feature-card"><div class="fi">📈</div><h4>Growth forecast</h4><p>Projected views at 1h through day 30, with an honest uncertainty band.</p></div>
        <div class="feature-card"><div class="fi">💬</div><h4>Engagement read</h4><p>Like & comment rate vs. your channel and category benchmarks.</p></div>
        <div class="feature-card"><div class="fi">🖼️</div><h4>Title & thumbnail check</h4><p>A scorecard on the levers you can still pull before or after publishing.</p></div>
        <div class="feature-card"><div class="fi">💡</div><h4>Actionable tips</h4><p>Specific, prioritized suggestions — not just a number.</p></div>
      </div>
    </div>

    ${history.length ? `
    <div class="recent-strip">
      <div class="section-title">Recently predicted</div>
      <div class="recent-row" id="recent-row"></div>
    </div>` : ''}
  `;

  const form = document.getElementById('predict-form');
  const input = document.getElementById('video-url');
  const errorEl = document.getElementById('predict-error');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = ENGINE.extractVideoId(input.value);
    if (!id) {
      errorEl.textContent = "That doesn't look like a valid YouTube link or video ID — try pasting the full URL.";
      return;
    }
    errorEl.textContent = '';
    const cat = document.getElementById('video-category').value;
    navigate(`#/results/${id}?cat=${cat}&fresh=1`);
  });

  document.getElementById('demo-btn').addEventListener('click', () => {
    input.value = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    document.getElementById('video-category').value = 'music';
    errorEl.textContent = '';
    navigate(`#/results/dQw4w9WgXcQ?cat=music&fresh=1`);
  });

  if (history.length) {
    const row = document.getElementById('recent-row');
    history.forEach(r => {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.innerHTML = `
        ${r.meta.thumbnail ? `<img src="${r.meta.thumbnail}" alt="">` : `<div class="thumb-fallback"></div>`}
        <div class="ri-body">
          <div class="ri-title">${escapeHtml(r.meta.title)}</div>
          <div class="ri-score">Score ${r.prediction.score}/100</div>
        </div>`;
      item.addEventListener('click', () => navigate(`#/results/${r.videoId}?cat=${r.category}`));
      row.appendChild(item);
    });
  }
}

/* ==========================================================================
   Results page
   ========================================================================== */
function renderResultsPage(root, videoId, query) {
  const isFresh = query.fresh === '1';
  const category = query.cat || (getRecord(videoId) || {}).category || 'entertainment';
  const existing = !isFresh ? getRecord(videoId) : null;

  if (existing) {
    renderResultsContent(root, existing);
    return;
  }

  // staged "analyzing" loading state, then generate + save
  root.innerHTML = `
    <div class="analyzing">
      <div class="spinner"></div>
      <div class="page-title" style="text-align:center;">Analyzing your video…</div>
      <div class="analyzing-steps" id="analyzing-steps">
        <div class="step" data-step="0"><span class="step-check">•</span> Fetching video metadata</div>
        <div class="step" data-step="1"><span class="step-check">•</span> Reading title & thumbnail signals</div>
        <div class="step" data-step="2"><span class="step-check">•</span> Modeling projected growth curve</div>
        <div class="step" data-step="3"><span class="step-check">•</span> Scoring against similar videos</div>
      </div>
    </div>
  `;
  const stepEls = [...document.querySelectorAll('#analyzing-steps .step')];
  let stepIdx = 0;
  const advance = () => {
    if (stepIdx > 0) { stepEls[stepIdx - 1].classList.remove('active'); stepEls[stepIdx - 1].classList.add('done'); stepEls[stepIdx - 1].querySelector('.step-check').textContent = '✓'; }
    if (stepIdx < stepEls.length) { stepEls[stepIdx].classList.add('active'); stepIdx++; }
  };
  advance();
  const stepTimer = setInterval(advance, 380);

  ENGINE.fetchVideoMeta(videoId).then((meta) => {
    setTimeout(() => {
      clearInterval(stepTimer);
      const prediction = ENGINE.getSyntheticPrediction(videoId, { category, titleLength: meta.real ? meta.title.length : undefined });
      const record = { videoId, category, meta, prediction, savedAt: new Date().toISOString() };
      upsertRecord(record);
      // clean the URL (drop fresh=1) without re-triggering the loader
      history.replaceState(null, '', `#/results/${videoId}?cat=${category}`);
      renderResultsContent(root, record);
    }, 1550);
  });
}

function renderResultsContent(root, record) {
  const { meta, prediction, videoId, category } = record;
  const p = prediction;
  const day1 = p.checkpoints.find(c => c.label === '1d');
  const day7 = p.checkpoints.find(c => c.label === '7d');
  const day30 = p.checkpoints.find(c => c.label === '30d');
  const catLabel = (ENGINE.CATEGORIES.find(c => c.id === category) || {}).label || category;

  root.innerHTML = `
    <div class="card">
      <div class="result-header">
        ${meta.thumbnail ? `<img class="result-thumb" src="${meta.thumbnail}" alt="">` : `<div class="result-thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px;">🎬</div>`}
        <div class="result-meta">
          <h2>${escapeHtml(meta.title)}</h2>
          <div class="chan">${escapeHtml(meta.author)}${meta.real ? '' : ' <span class="muted">(demo metadata)</span>'}</div>
          <div class="badges">
            <span class="badge">${catLabel}</span>
            <span class="badge">ID: ${videoId}</span>
            <span class="badge">Predicted ${formatDateShort(record.savedAt)}</span>
          </div>
        </div>
        <div class="gauge-wrap">
          <div id="score-gauge" style="position:relative;">
            <div class="gauge-value" id="gauge-value-label" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">${p.score}</div>
          </div>
          <div class="gauge-label" style="color:var(--${p.verdictTone === 'good' ? 'success-text' : p.verdictTone})">${p.verdict}</div>
        </div>
      </div>
      <div class="action-bar">
        <button class="btn btn-ghost btn-sm" id="btn-repredict">↻ Re-run prediction</button>
        <button class="btn btn-ghost btn-sm" id="btn-copy">⧉ Copy summary</button>
        <a class="btn btn-ghost btn-sm" href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener">▶ Open on YouTube</a>
        <a class="btn btn-ghost btn-sm" href="#/history">☰ View history</a>
      </div>
    </div>

    <div class="card">
      <div class="flex-between">
        <div class="section-title" style="margin:0;">Projected view growth</div>
        <div class="chart-legend" style="margin:0;">
          <span class="legend-item"><span class="legend-swatch line" style="background:var(--series-views)"></span>Predicted views</span>
          <span class="legend-item"><span class="legend-swatch" style="background:var(--band-fill); border:1px solid var(--series-views);"></span>Confidence range</span>
        </div>
      </div>
      <div id="growth-chart" class="mt-16"></div>
    </div>

    <div class="grid grid-3 mt-16">
      <div class="card stat-tile">
        <div class="st-top"><span class="st-label">Day 1</span></div>
        <div class="st-value mono">${formatCompact(day1.views)}</div>
        <div class="st-delta up">↗ views projected</div>
        <div id="spark-day1" class="mt-8"></div>
        <div class="st-sub">${formatCompact(day1.likes)} likes · ${formatCompact(day1.comments)} comments</div>
      </div>
      <div class="card stat-tile">
        <div class="st-top"><span class="st-label">Day 7</span></div>
        <div class="st-value mono">${formatCompact(day7.views)}</div>
        <div class="st-delta up">range ${formatCompact(day7.low)}–${formatCompact(day7.high)}</div>
        <div id="spark-day7" class="mt-8"></div>
        <div class="st-sub">${formatCompact(day7.likes)} likes · ${formatCompact(day7.comments)} comments</div>
      </div>
      <div class="card stat-tile">
        <div class="st-top"><span class="st-label">Day 30</span></div>
        <div class="st-value mono">${formatCompact(day30.views)}</div>
        <div class="st-delta up">range ${formatCompact(day30.low)}–${formatCompact(day30.high)}</div>
        <div id="spark-day30" class="mt-8"></div>
        <div class="st-sub">${formatCompact(day30.likes)} likes · ${formatCompact(day30.comments)} comments</div>
      </div>
    </div>

    <div class="grid grid-2 mt-16">
      <div class="card">
        <div class="section-title">Engagement vs. benchmarks</div>
        <div class="muted" style="font-size:11.5px; margin-bottom:14px;">Like rate</div>
        <div id="bar-like"></div>
        <div class="muted" style="font-size:11.5px; margin:14px 0 14px;">Comment rate</div>
        <div id="bar-comment"></div>
      </div>
      <div class="card">
        <div class="section-title">Title & thumbnail scorecard</div>
        <div class="checklist" id="checklist"></div>
      </div>
    </div>

    <div class="grid grid-2 mt-16">
      <div class="card">
        <div class="section-title">Videos like this one</div>
        <div id="similar-list"></div>
      </div>
      <div class="card">
        <div class="section-title">Suggested improvements</div>
        <div id="tips-list"></div>
      </div>
    </div>
  `;

  renderGauge(document.getElementById('score-gauge'), p.score, p.verdictTone, { size: 108 });

  renderGrowthChart(document.getElementById('growth-chart'), p.checkpoints, { height: 260 });

  const viewsSeries = p.checkpoints.map(c => c.views);
  renderSparkline(document.getElementById('spark-day1'), viewsSeries.slice(0, CHECKPOINT_INDEX('1d') + 1), cssVar('--series-views'));
  renderSparkline(document.getElementById('spark-day7'), viewsSeries.slice(0, CHECKPOINT_INDEX('7d') + 1), cssVar('--series-views'));
  renderSparkline(document.getElementById('spark-day30'), viewsSeries, cssVar('--series-views'));

  renderBarCompare(document.getElementById('bar-like'), [
    { label: 'This video', value: p.engagement.likeRate, display: formatPercent(p.engagement.likeRate), accent: true },
    { label: 'Channel avg', value: p.engagement.channelAvgLikeRate, display: formatPercent(p.engagement.channelAvgLikeRate) },
    { label: 'Category avg', value: p.engagement.categoryAvgLikeRate, display: formatPercent(p.engagement.categoryAvgLikeRate) },
  ]);
  renderBarCompare(document.getElementById('bar-comment'), [
    { label: 'This video', value: p.engagement.commentRate, display: formatPercent(p.engagement.commentRate, 2), accent: true },
    { label: 'Channel avg', value: p.engagement.channelAvgCommentRate, display: formatPercent(p.engagement.channelAvgCommentRate, 2) },
    { label: 'Category avg', value: p.engagement.categoryAvgCommentRate, display: formatPercent(p.engagement.categoryAvgCommentRate, 2) },
  ]);

  const checklistEl = document.getElementById('checklist');
  checklistEl.innerHTML = p.checklist.map(item => `
    <div class="check-row">
      <div class="check-icon ${item.state === 'good' ? 'good' : item.state === 'warn' ? 'warn' : 'bad'}">${item.state === 'good' ? '✓' : item.state === 'warn' ? '!' : '✕'}</div>
      <div class="check-body"><strong>${item.label}</strong><span>${item.detail}</span></div>
    </div>
  `).join('');

  const similarEl = document.getElementById('similar-list');
  similarEl.innerHTML = p.similar.map(s => `
    <div class="similar-row">
      <div class="similar-title">${escapeHtml(s.title)}<div class="similar-cat">${s.category}</div></div>
      <div class="similar-views mono">${formatCompact(s.views7d)} <span class="muted" style="font-weight:400;">/7d</span></div>
    </div>
  `).join('');

  const tipsEl = document.getElementById('tips-list');
  tipsEl.innerHTML = p.tips.map(t => `
    <div class="tip-row"><div class="tip-icon">${t.icon}</div><div>${t.text}</div></div>
  `).join('');

  document.getElementById('btn-repredict').addEventListener('click', () => {
    navigate(`#/results/${videoId}?cat=${category}&fresh=1`);
  });
  document.getElementById('btn-copy').addEventListener('click', (e) => {
    const summary = `${meta.title}\nViewCast score: ${p.score}/100 — ${p.verdict}\nProjected day 7: ${formatCompact(day7.views)} views (${formatCompact(day7.low)}–${formatCompact(day7.high)})\nProjected day 30: ${formatCompact(day30.views)} views`;
    navigator.clipboard && navigator.clipboard.writeText(summary).then(() => {
      const btn = e.currentTarget; const old = btn.textContent;
      btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = old, 1400);
    });
  });
}

function CHECKPOINT_INDEX(label) { return ENGINE.CHECKPOINTS.findIndex(c => c.label === label); }
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

/* ==========================================================================
   History page
   ========================================================================== */
let historySort = { key: 'savedAt', dir: 'desc' };
let historySelection = new Set();

function renderHistoryPage(root) {
  let list = loadHistory();

  root.innerHTML = `
    <div class="page-title">Prediction history</div>
    <p class="page-sub">Every video you've run through ViewCast, saved locally in this browser.</p>
    ${list.length === 0 ? `
      <div class="card empty-state">
        <div class="es-icon">📭</div>
        <h3>No predictions yet</h3>
        <p>Run your first prediction to see it show up here.</p>
        <a class="btn btn-primary" href="#/">Predict a video</a>
      </div>
    ` : `
      <div class="filter-row">
        <input class="input" id="history-search" placeholder="Search by title…" style="max-width:260px; padding:9px 12px;" />
        <select class="select" id="history-cat-filter">
          <option value="">All categories</option>
          ${ENGINE.CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" id="compare-btn" disabled>Compare selected (0)</button>
        <button class="btn btn-ghost btn-sm" id="clear-history-btn" style="margin-left:auto; color:var(--critical);">Clear all history</button>
      </div>
      <div id="compare-card"></div>
      <div class="card" style="padding:8px 16px;">
        <div style="overflow-x:auto;">
        <table class="data-table" id="history-table">
          <thead><tr>
            <th style="width:26px;"></th>
            <th data-sort="title">Video</th>
            <th data-sort="category">Category</th>
            <th data-sort="savedAt">Predicted</th>
            <th data-sort="score">Score</th>
            <th data-sort="day7">Day 7 views</th>
            <th></th>
          </tr></thead>
          <tbody id="history-tbody"></tbody>
        </table>
        </div>
      </div>
    `}
  `;

  if (list.length === 0) return;

  const searchEl = document.getElementById('history-search');
  const catEl = document.getElementById('history-cat-filter');
  const compareBtn = document.getElementById('compare-btn');
  const clearBtn = document.getElementById('clear-history-btn');

  function currentFiltered() {
    let rows = loadHistory();
    const q = (searchEl.value || '').toLowerCase().trim();
    const cat = catEl.value;
    if (q) rows = rows.filter(r => r.meta.title.toLowerCase().includes(q));
    if (cat) rows = rows.filter(r => r.category === cat);
    rows = rows.slice().sort((a, b) => {
      let av, bv;
      if (historySort.key === 'title') { av = a.meta.title; bv = b.meta.title; }
      else if (historySort.key === 'category') { av = a.category; bv = b.category; }
      else if (historySort.key === 'savedAt') { av = a.savedAt; bv = b.savedAt; }
      else if (historySort.key === 'score') { av = a.prediction.score; bv = b.prediction.score; }
      else if (historySort.key === 'day7') { av = a.prediction.checkpoints.find(c => c.label === '7d').views; bv = b.prediction.checkpoints.find(c => c.label === '7d').views; }
      if (av < bv) return historySort.dir === 'asc' ? -1 : 1;
      if (av > bv) return historySort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }

  function renderRows() {
    const rows = currentFiltered();
    const tbody = document.getElementById('history-tbody');
    tbody.innerHTML = rows.map(r => {
      const day7 = r.prediction.checkpoints.find(c => c.label === '7d');
      const scoreColor = r.prediction.verdictTone === 'good' ? 'var(--good)' : r.prediction.verdictTone === 'warning' ? 'var(--warning)' : r.prediction.verdictTone === 'serious' ? 'var(--serious)' : 'var(--critical)';
      const catLabel = (ENGINE.CATEGORIES.find(c => c.id === r.category) || {}).label || r.category;
      return `
      <tr data-id="${r.videoId}">
        <td><input type="checkbox" class="row-check" data-id="${r.videoId}" ${historySelection.has(r.videoId) ? 'checked' : ''} /></td>
        <td>
          <div class="dt-title-cell">
            ${r.meta.thumbnail ? `<img class="dt-thumb" src="${r.meta.thumbnail}" alt="">` : `<div class="dt-thumb"></div>`}
            <span class="dt-title-text">${escapeHtml(r.meta.title)}</span>
          </div>
        </td>
        <td class="muted">${catLabel}</td>
        <td class="muted">${formatDateShort(r.savedAt)}</td>
        <td><span class="score-chip" style="background:${scoreColor}; color:#fff;">${r.prediction.score}</span></td>
        <td class="mono">${formatCompact(day7.views)}</td>
        <td><button class="btn btn-ghost btn-sm del-btn" data-id="${r.videoId}" title="Delete">🗑</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('input') || e.target.closest('button')) return;
        navigate(`#/results/${tr.dataset.id}`);
      });
    });
    tbody.querySelectorAll('.row-check').forEach(cb => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (historySelection.size >= 3) { cb.checked = false; return; }
          historySelection.add(cb.dataset.id);
        } else {
          historySelection.delete(cb.dataset.id);
        }
        updateCompareBtn();
      });
    });
    tbody.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this prediction from history?')) {
          deleteRecord(btn.dataset.id);
          historySelection.delete(btn.dataset.id);
          renderRows();
          updateCompareBtn();
        }
      });
    });
  }

  function updateCompareBtn() {
    compareBtn.textContent = `Compare selected (${historySelection.size})`;
    compareBtn.disabled = historySelection.size < 2;
  }

  document.querySelectorAll('#history-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (historySort.key === key) historySort.dir = historySort.dir === 'asc' ? 'desc' : 'asc';
      else { historySort.key = key; historySort.dir = key === 'title' || key === 'category' ? 'asc' : 'desc'; }
      renderRows();
    });
  });

  searchEl.addEventListener('input', renderRows);
  catEl.addEventListener('change', renderRows);
  clearBtn.addEventListener('click', () => {
    if (confirm('Clear all prediction history? This cannot be undone.')) {
      clearAllHistory();
      historySelection.clear();
      renderHistoryPage(root);
    }
  });
  compareBtn.addEventListener('click', () => {
    const seriesColors = ['--series-views', '--series-likes', '--series-comments'];
    const chosen = loadHistory().filter(r => historySelection.has(r.videoId));
    const card = document.getElementById('compare-card');
    card.innerHTML = `
      <div class="card">
        <div class="section-title">Growth comparison</div>
        <div id="compare-chart"></div>
        <div class="chart-legend" id="compare-legend"></div>
      </div>`;
    const series = chosen.map((r, i) => ({ label: r.meta.title, color: cssVar(seriesColors[i]), checkpoints: r.prediction.checkpoints }));
    renderMultiGrowthChart(document.getElementById('compare-chart'), series);
    document.getElementById('compare-legend').innerHTML = series.map(s => `<span class="legend-item"><span class="legend-swatch line" style="background:${s.color}"></span>${escapeHtml(s.label)}</span>`).join('');
  });

  renderRows();
  updateCompareBtn();
}

/* ==========================================================================
   Insights page
   ========================================================================== */
function renderInsightsPage(root) {
  const list = loadHistory();
  root.innerHTML = `<div class="page-title">Insights</div><p class="page-sub">Aggregate patterns across every video you've predicted.</p>`;

  if (list.length === 0) {
    root.innerHTML += `
      <div class="card empty-state">
        <div class="es-icon">📊</div>
        <h3>Nothing to show yet</h3>
        <p>Predict a few videos and this page fills in with trends across them.</p>
        <a class="btn btn-primary" href="#/">Predict a video</a>
      </div>`;
    return;
  }

  const scores = list.map(r => r.prediction.score);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const best = list.slice().sort((a, b) => b.prediction.score - a.prediction.score)[0];
  const totalDay7 = list.reduce((sum, r) => sum + r.prediction.checkpoints.find(c => c.label === '7d').views, 0);

  root.innerHTML += `
    <div class="grid grid-4">
      <div class="card kpi-tile"><div class="kpi-value">${list.length}</div><div class="kpi-label">Videos predicted</div></div>
      <div class="card kpi-tile"><div class="kpi-value">${avgScore}</div><div class="kpi-label">Average score</div></div>
      <div class="card kpi-tile"><div class="kpi-value mono">${formatCompact(totalDay7)}</div><div class="kpi-label">Combined day-7 views</div></div>
      <div class="card kpi-tile"><div class="kpi-value" style="font-size:16px; line-height:1.3;">${best.prediction.score}</div><div class="kpi-label">Best: ${escapeHtml(truncate(best.meta.title, 34))}</div></div>
    </div>

    <div class="card mt-16">
      <div class="section-title">Score distribution</div>
      <div id="score-histogram"></div>
    </div>

    <div class="grid grid-2 mt-16">
      <div class="card">
        <div class="section-title">Average score by category</div>
        <div id="cat-bars"></div>
      </div>
      <div class="card">
        <div class="section-title">What's correlating with higher scores</div>
        <div id="correlation-notes" style="font-size:13px; color:var(--ink-2); display:flex; flex-direction:column; gap:12px;"></div>
      </div>
    </div>
  `;

  renderHistogram(document.getElementById('score-histogram'), scores);

  const byCat = {};
  list.forEach(r => { (byCat[r.category] = byCat[r.category] || []).push(r.prediction.score); });
  const catRows = Object.keys(byCat).map(catId => {
    const avg = byCat[catId].reduce((a, b) => a + b, 0) / byCat[catId].length;
    const label = (ENGINE.CATEGORIES.find(c => c.id === catId) || {}).label || catId;
    return { label: `${label} (${byCat[catId].length})`, value: avg, display: Math.round(avg), accent: true };
  }).sort((a, b) => b.value - a.value);
  renderBarCompare(document.getElementById('cat-bars'), catRows.map(r => ({ ...r, display: String(r.display) })));

  // simple correlation notes: upload-timing / thumbnail contrast checklist state vs avg score
  const notesEl = document.getElementById('correlation-notes');
  const notes = [];
  ['Thumbnail contrast', 'Upload timing', 'Opening hook (first 15s)'].forEach(label => {
    const withGood = list.filter(r => r.prediction.checklist.some(c => c.label === label && c.state === 'good'));
    const withoutGood = list.filter(r => !r.prediction.checklist.some(c => c.label === label && c.state === 'good'));
    if (withGood.length && withoutGood.length) {
      const avgG = withGood.reduce((s, r) => s + r.prediction.score, 0) / withGood.length;
      const avgO = withoutGood.reduce((s, r) => s + r.prediction.score, 0) / withoutGood.length;
      const diff = Math.round(avgG - avgO);
      notes.push(`<div><strong style="color:var(--ink);">${label}</strong> flagged "good" on ${withGood.length} video${withGood.length === 1 ? '' : 's'} — those average <strong>${Math.round(avgG)}</strong> vs <strong>${Math.round(avgO)}</strong> for the rest (${diff >= 0 ? '+' : ''}${diff}).</div>`);
    }
  });
  notesEl.innerHTML = notes.length ? notes.join('') : `<div class="muted">Predict a few more videos with mixed checklist results to surface correlations here.</div>`;
}

/* ==========================================================================
   Settings page
   ========================================================================== */
function renderSettingsPage(root) {
  const theme = getTheme();
  root.innerHTML = `
    <div class="page-title">Settings</div>
    <p class="page-sub">Preferences and a look under the hood.</p>

    <div class="card">
      <div class="section-title">Appearance</div>
      <div class="settings-row">
        <div><div class="sr-label">Theme</div><div class="sr-sub">Match system, or force light / dark.</div></div>
        <select class="select" id="theme-select">
          <option value="system" ${theme === 'system' ? 'selected' : ''}>Match system</option>
          <option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option>
          <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option>
        </select>
      </div>
    </div>

    <div class="card mt-16">
      <div class="section-title">Prediction engine</div>
      <div class="status-card">
        <div class="status-dot"></div>
        <div>
          <strong>Running on the synthetic demo model</strong>
          <div class="muted" style="font-size:12.5px; margin-top:4px;">
            All predictions on this page are generated locally by a seeded mock model (<code>engine.js → getSyntheticPrediction()</code>) —
            not a real forecast. Point this function at your trained model's API response and every screen updates automatically;
            nothing else in the app needs to change.
          </div>
        </div>
      </div>
      <div class="settings-row">
        <div><div class="sr-label">Model endpoint</div><div class="sr-sub">Coming soon — connect your trained model here.</div></div>
        <input class="select" style="width:220px;" placeholder="https://your-model-api…" disabled />
      </div>
      <div class="settings-row">
        <div><div class="sr-label">API key</div><div class="sr-sub">Coming soon.</div></div>
        <input class="select" style="width:220px;" placeholder="••••••••••••" disabled type="password" />
      </div>
    </div>

    <div class="card mt-16">
      <div class="section-title">Data & privacy</div>
      <p style="font-size:13px; color:var(--ink-2); line-height:1.6; margin-top:0;">
        Every prediction is stored only in this browser's local storage — nothing is sent to a server except an optional,
        anonymous lookup of public video title/thumbnail metadata from YouTube's oEmbed endpoint (no API key, no account access).
        Clearing your browser data or using a different browser starts you with an empty history.
      </p>
      <button class="btn btn-ghost btn-sm" id="settings-clear-btn" style="color:var(--critical);">Clear all prediction history</button>
    </div>
  `;

  document.getElementById('theme-select').addEventListener('change', (e) => setTheme(e.target.value));
  document.getElementById('settings-clear-btn').addEventListener('click', () => {
    if (confirm('Clear all prediction history? This cannot be undone.')) {
      clearAllHistory();
      alert('History cleared.');
    }
  });
}

/* ---------- utils ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/* ---------- boot ---------- */
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', () => setActiveNav(a.dataset.route));
  });
  router();
});
window.addEventListener('hashchange', router);
